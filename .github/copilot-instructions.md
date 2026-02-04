<!-- Copilot instructions for the MediSight.AI repo -->
# MediSight.AI — Copilot Usage Notes

Purpose: quickly orient AI coding agents to the repository's architecture, conventions, and developer workflows so they can be productive without human hand-holding.

- **Project focus:** privacy-first local model inference for analyzing medical-report PDFs. Core pieces live under `backend/` (FastAPI inference), and `frontend/` (single-page HTML + JS). See [README.md](README.md#L1-L60) for high-level context.

- **Model & runtime:** this project runs the `FreedomIntelligence/Apollo2-2B` model locally using Hugging Face Transformers + PyTorch (+ Accelerate). Expect multi-GB model downloads on first run and heavy RAM/GPU requirements. Prefer CUDA-enabled PyTorch when available; `bitsandbytes` quantization is optional.

- **Key commands:**
  - Create & activate venv (Windows):
    ```powershell
    python -m venv venv
    .\venv\Scripts\activate
    pip install -r backend/requirements.txt
    ```
  - Start backend (from `backend/`):
    ```powershell
    uvicorn main:app --reload --host 127.0.0.1 --port 8000
    ```
  - Open the UI: open `frontend/index.html` directly in a browser (no build step).

- **File map & where to make changes:**
  - `backend/main.py` — central FastAPI app and model-loading/inference logic (primary edit point for model prompts, batching, performance tweaks).
  - `backend/requirements.txt` — dependency and runtime notes (use this to recommend CUDA-specific `torch` wheels).
  - `frontend/index.html` and `frontend/script.js` — simple frontend, no bundler; change DOM or fetch calls here.
  - `gini.py` — a small helper/demo script showing pandas-based utilities and style (useful reference for concise scripting conventions).

- **Patterns & conventions discovered:**
  - Privacy-first: backend binds to `127.0.0.1` and the README repeatedly emphasizes local-only processing. Prefer localhost-only defaults when adding services.
  - No frontend build: assets use CDN (Tailwind, Font Awesome). Agent should not introduce build tooling unless explicitly requested.
  - Long-running model initialization: first-run behavior downloads model weights — surface progress to the user and avoid blocking the main thread. Prefer asynchronous startup or background tasks when making edits.

- **Debugging tips specific to this codebase:**
  - If model weights stall, check disk space and network; recommend adding resumable download handling or clearly documenting required disk space in `README.md`.
  - To test quickly without downloading the full model, temporarily stub model-loading in `backend/main.py` with a small mocked response.
  - Uvicorn logs are the primary source for runtime errors; ensure agent-run changes print useful startup logs.

- **Safety & domain notes:**
  - Medical context — maintain the existing disclaimer and avoid adding persistent logging of PHI. Any change storing or transmitting report contents requires explicit review.

- **Examples of actionable edits an agent might make:**
  - Add a `--model-cache-dir` config option in `backend/main.py` and document it in `README.md` to reduce repeated downloads.
  - Add a small unit/integration test that stubs model inference to validate the FastAPI endpoints.
  - Improve UX by returning early with progress updates during the initial download.

If anything here is unclear or you want agent behavior tightened (example: stricter linting rules, commit message format, or a test harness), tell me which area to expand.
