// ===== FIREBASE SDK =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// YOUR CONFIG (Ensure these match your Firebase Console)
const firebaseConfig = {
  apiKey: "AIzaSyCsGeJbNmYt5my1v8S0tsu_tE3S_gFLFDE",
  authDomain: "althea-500d9.firebaseapp.com",
  projectId: "althea-500d9",
  appId: "1:210365826860:web:79e704f320e805dbf30e89"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let firebaseToken = null;

// --- GLOBAL AUTH FUNCTIONS ---
window.login = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if (!email || !password) return alert("Please enter email and password.");
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        if (err.code === 'auth/too-many-requests') {
            alert("Security block: Too many failed attempts. Please wait 5 minutes.");
        } else if (err.code === 'auth/invalid-credential') {
            alert("Wrong email or password.");
        } else {
            alert("Error: " + err.message);
        }
    }
};

window.register = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if (!email || !password) return alert("Please enter email and password.");

    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Account created! Welcome to Althea.");
    } catch (err) {
        alert("Registration failed: " + err.message);
    }
};

// --- PROFILE & GLOSSARY FUNCTIONS ---
window.closeDrawer = () => {
    document.getElementById('definition-drawer').classList.add('translate-x-full');
};

window.showDefinition = async (term) => {
    const drawer = document.getElementById('definition-drawer');
    document.getElementById('term-title').innerText = term;
    document.getElementById('term-definition').innerText = "";
    document.getElementById('term-loading').classList.remove('hidden');
    document.getElementById('term-search-link').href = `https://medlineplus.gov/search?searchquery=${term}`;
    
    drawer.classList.remove('translate-x-full');

    try {
        const res = await fetch(`/define`, {
            method: 'POST',
            headers: { 'token': firebaseToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ term })
        });
        const data = await res.json();
        document.getElementById('term-definition').innerText = data.definition;
    } catch (err) {
        document.getElementById('term-definition').innerText = "Could not load definition.";
    } finally {
        document.getElementById('term-loading').classList.add('hidden');
    }
};

async function loadProfiles() {
    if (!firebaseToken) return;
    try {
        const res = await fetch(`/profiles`, { headers: { 'token': firebaseToken }});
        const profiles = await res.json();
        const select = document.getElementById('profile-select');
        if (select) {
            select.innerHTML = profiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            // Trigger history load for the first profile
            select.dispatchEvent(new Event('change'));
        }
    } catch (err) {
        console.error("Profile load error", err);
    }
}

window.createNewProfile = async () => {
    const name = prompt("Name of family member (e.g. Dad, Sister):");
    if (!name) return;
    try {
        await fetch(`/profiles`, {
            method: 'POST',
            headers: { 'token': firebaseToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, relation: "Family" })
        });
        await loadProfiles();
    } catch (err) {
        alert("Could not create profile.");
    }
};

// --- MAIN APP LISTENERS ---
onAuthStateChanged(auth, async (user) => {
    const loginSec = document.getElementById('login-section');
    const uploadSec = document.getElementById('upload-section');
    const logoutBtn = document.getElementById('logout-btn');

    if (user) {
        firebaseToken = await user.getIdToken();
        loginSec.classList.add('hidden');
        uploadSec.classList.remove('hidden');
        logoutBtn.classList.remove('hidden');
        loadProfiles();
    } else {
        firebaseToken = null;
        loginSec.classList.remove('hidden');
        uploadSec.classList.add('hidden');
        logoutBtn.classList.add('hidden');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const profileSelect = document.getElementById('profile-select');
    
    // Switch Profile Logic
    profileSelect.addEventListener('change', async (e) => {
        const pid = e.target.value;
        if (!pid) return;

        // Clear UI while loading
        document.getElementById('analysis-section').classList.add('hidden');
        document.getElementById('chat-section').classList.add('hidden');
        document.getElementById('chat-history').innerHTML = "";

        const res = await fetch(`/profiles/${pid}/latest`, { headers: { 'token': firebaseToken }});
        const data = await res.json();
        if (data.summary) displayAnalysis(data);
    });

    document.getElementById('logout-btn').onclick = () => signOut(auth);

    // Analyze PDF Logic
    document.getElementById('submit-button').onclick = async () => {
        const file = document.getElementById('pdf-file').files[0];
        const pid = profileSelect.value;
        if (!file) return alert("Please select a PDF report first.");

        document.getElementById('loading-spinner').classList.remove('hidden');
        const fd = new FormData();
        fd.append('file', file);

        try {
            const res = await fetch(`/analyze`, {
                method: 'POST',
                headers: { 'token': firebaseToken, 'profile-id': pid },
                body: fd
            });
            const data = await res.json();
            displayAnalysis(data);
        } catch (err) {
            alert("Analysis failed. Check your backend.");
        } finally {
            document.getElementById('loading-spinner').classList.add('hidden');
        }
    };

    // Chat Logic
    document.getElementById('send-chat-button').onclick = async () => {
        const input = document.getElementById('chat-input');
        const history = document.getElementById('chat-history');
        const msg = input.value.trim();
        if (!msg) return;

        // Add user bubble
        history.innerHTML += `<div class="msg-user p-4 max-w-[80%] text-sm font-medium shadow-sm mb-2">${msg}</div>`;
        input.value = "";
        history.scrollTop = history.scrollHeight;

        try {
            const res = await fetch(`/chat`, {
                method: 'POST',
                headers: { 'token': firebaseToken, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg })
            });
            const data = await res.json();
            // Add AI bubble
            history.innerHTML += `
                <div class="msg-ai p-4 max-w-[80%] text-sm font-medium flex gap-3 mb-2">
                    <div class="text-indigo-600 font-bold">A:</div>
                    <div>${data.response}</div>
                </div>`;
            history.scrollTop = history.scrollHeight;
        } catch (err) {
            history.innerHTML += `<div class="text-red-500 text-xs text-center">Chat failed.</div>`;
        }
    };
});

// --- HELPER: DISPLAY RESULTS ---
function displayAnalysis(data) {
    document.getElementById('analysis-section').classList.remove('hidden');
    document.getElementById('chat-section').classList.remove('hidden');
    
    // Regex to turn [[Term]] into clickable buttons
    const process = (text) => {
        if (!text) return "";
        return text.replace(/\[\[(.*?)\]\]/g, '<button onclick="showDefinition(\'$1\')" class="medical-term">$1</button>');
    };

    document.getElementById('detailed-analysis').innerHTML = process(data.summary);
    
    document.getElementById('potential-risks').innerHTML = (data.risks || []).map(r => 
        `<li class="flex items-start gap-2"><i class="fa-solid fa-circle text-[6px] mt-2 opacity-30"></i>${process(r)}</li>`
    ).join('');
    
    document.getElementById('recommendations-list').innerHTML = (data.recommendations || []).map(r => 
        `<li class="flex items-start gap-2 bg-white/50 p-3 rounded-2xl border border-slate-100 shadow-sm"><i class="fa-solid fa-circle-check text-emerald-500 mt-1"></i>${process(r)}</li>`
    ).join('');
}