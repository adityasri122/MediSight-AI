import os
import io
import re
import torch
import firebase_admin
from firebase_admin import credentials, auth, firestore
from fastapi import FastAPI, File, UploadFile, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
import pdfplumber
from transformers import AutoModelForCausalLM, AutoTokenizer
from accelerate import Accelerator

# --- SETUP ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_ACCOUNT_PATH = os.path.join(BASE_DIR, "serviceAccountKey.json")

if not os.path.exists(SERVICE_ACCOUNT_PATH):
    raise RuntimeError("serviceAccountKey.json is missing!")

cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)
db = firestore.client()

app = FastAPI(title="Althea AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- AI MODEL INIT ---
MODEL_NAME = "FreedomIntelligence/Apollo2-2B"
accelerator = Accelerator()
device = accelerator.device

try:
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME, torch_dtype=torch.float16, device_map="auto", trust_remote_code=True
    )
    if tokenizer.pad_token is None: tokenizer.pad_token = tokenizer.eos_token
    print("AI Model Ready.")
except Exception as e:
    print(f"Model Load Error: {e}")
    model = None

# --- MODELS ---
class ProfileCreate(BaseModel):
    name: str
    relation: str

class ChatRequest(BaseModel):
    message: str

class TermRequest(BaseModel):
    term: str

# --- HELPERS ---
def verify_token(token: str):
    try:
        if token.startswith("Bearer "): token = token.split(" ")[1]
        return auth.verify_id_token(token)
    except:
        raise HTTPException(status_code=401, detail="Invalid Token")

def generate_ai_response(prompt: str):
    if not model: return "AI Offline."
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=2048).to(device)
    with torch.no_grad():
        outputs = model.generate(**inputs, max_new_tokens=512, temperature=0.4, do_sample=True)
    return tokenizer.decode(outputs[0, inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()

# --- ROUTES ---
@app.get("/profiles")
async def get_profiles(token: str = Header(None)):
    user = verify_token(token)
    ref = db.collection("users").document(user['uid']).collection("profiles")
    docs = ref.stream()
    profiles = [{"id": d.id, **d.to_dict()} for d in docs]
    if not profiles:
        _, new_ref = ref.add({"name": "My Health", "relation": "Self"})
        return [{"id": new_ref.id, "name": "My Health", "relation": "Self"}]
    return profiles

@app.post("/profiles")
async def add_profile(profile: ProfileCreate, token: str = Header(None)):
    user = verify_token(token)
    _, ref = db.collection("users").document(user['uid']).collection("profiles").add(profile.dict())
    return {"id": ref.id, **profile.dict()}

@app.get("/profiles/{pid}/latest")
async def get_latest(pid: str, token: str = Header(None)):
    user = verify_token(token)
    reports = db.collection("users").document(user['uid']).collection("profiles").document(pid).collection("reports")
    docs = reports.order_by("timestamp", direction=firestore.Query.DESCENDING).limit(1).get()
    
    for d in docs:
        data = d.to_dict()
        # Remove the timestamp before sending to frontend to avoid serialization errors
        if "timestamp" in data:
            del data["timestamp"] 
        return data
        
    return {}

@app.post("/analyze")
async def analyze(file: UploadFile = File(...), profile_id: str = Header(None), token: str = Header(None)):
    try:
        user = verify_token(token)
        content = await file.read()
        
        # 1. Extract Text
        text = ""
        with io.BytesIO(content) as f:
            with pdfplumber.open(f) as pdf:
                for page in pdf.pages:
                    text += (page.extract_text() or "") + "\n"
        
        # 2. AI Generation
        prompt = f"Analyze this medical report: {text[:1500]}\n1. Summary: (2 sentences)\n2. Risks: (bullet points)\n3. Recommendations: (bullet points)\nIMPORTANT: Wrap complex terms in [[Term]]. Separate sections with '---'"
        ai_raw = generate_ai_response(prompt)
        parts = ai_raw.split('---')

        # 3. Create the data object for the UI (NO SENTINEL HERE)
        response_data = {
            "summary": parts[0].strip() if len(parts) > 0 else "Analysis complete.",
            "risks": [re.sub(r"^[*\-]\s*", "", l) for l in parts[1].split('\n') if len(l.strip()) > 3] if len(parts) > 1 else [],
            "recommendations": [re.sub(r"^[*\-]\s*", "", l) for l in parts[2].split('\n') if len(l.strip()) > 3] if len(parts) > 2 else [],
        }

        # 4. Create a COPY for Firestore that includes the Sentinel
        db_data = response_data.copy()
        db_data["timestamp"] = firestore.SERVER_TIMESTAMP

        # Save to Firestore
        db.collection("users").document(user['uid']).collection("profiles").document(profile_id).collection("reports").add(db_data)
        
        # 5. Return the clean data to the browser
        return response_data

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/define")
async def define_term(req: TermRequest, token: str = Header(None)):
    verify_token(token)
    prompt = f"Define the medical term '{req.term}' in one simple sentence for a patient. Avoid jargon."
    return {"definition": generate_ai_response(prompt)}

@app.post("/chat")
async def chat(req: ChatRequest, token: str = Header(None)):
    verify_token(token)
    prompt = f"Patient asks: {req.message}\nRespond as a helpful, clear doctor:"
    return {"response": generate_ai_response(prompt)}

@app.get("/ui")
def ui(): return FileResponse(os.path.join(BASE_DIR, "static", "index.html"))

@app.get("/")
def root(): return RedirectResponse(url="/ui")

app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)