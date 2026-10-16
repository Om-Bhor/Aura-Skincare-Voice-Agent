# Aria — Aura Skincare AI Voice Agent

React + FastAPI starter for the DataStraw AI Voice Agent assessment.

## Minimum prerequisites
- Python 3.10+ (3.11 recommended)
- Node.js 20+ and npm
- Git
- Chrome or Edge for browser Web Speech API support
- Google Gemini API key (create one at https://aistudio.google.com/apikey)
- Microphone and speaker access
- Internet connection

## Architecture
- React + Vite: call controls, browser speech recognition and speech synthesis, state indicator, transcript and summary.
- FastAPI: `/api/chat` applies brand-policy instructions and calls Gemini; order lookup is a deterministic backend tool.
- Mock orders: in-memory Python data matching the assessment.
- `/api/summary`: produces a structured post-call outcome.
- Browser voice APIs are used for the fastest MVP; availability/voice quality depends on browser and installed voices. For the demo, use Chrome/Edge and test microphone permissions.

## Run locally

### 1. Backend
```bash
cd backend
python -m venv .venv
# macOS/Linux
source .venv/bin/activate
# Windows PowerShell: .venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
# Edit .env and set GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend (new terminal)
```bash
cd frontend
npm install
npm run dev
```
Open the local URL printed by Vite (usually http://localhost:5173).

## API key safety
- Keep `GEMINI_API_KEY` only in `backend/.env`.
- Never place provider keys in React/Vite variables or commit `.env`.
- `.env.example` is safe to commit.

## Included test orders
- ORD-101: Vitamin C Serum (30ml), ₹699, Out for Delivery; BlueDart BD-982103; expected by 6 PM today.
- ORD-102: Hydrating Sunscreen SPF 50, ₹499, Delivered 14 days ago.
- ORD-103: Green Tea Face Wash + Toner, ₹850, Processing; eligible for cancellation.

## Important MVP limitations
- Browser speech recognition is not available in every browser/OS and requires microphone permission. Use Chrome/Edge.
- Browser speech synthesis voice selection varies by device. The app requests an English (India) voice when available, otherwise falls back to the browser default.
- This MVP uses turn-based browser speech recognition rather than full-duplex streaming. It is suitable as a fast assessment implementation; test the actual environment before submission.
- The call summary is generated from the transcript with a structured backend response. Review the transcript and tool behavior before recording the demo.

## Submission checklist
- Deploy frontend and backend; set `VITE_API_BASE_URL` to deployed backend URL.
- Configure backend `GEMINI_API_KEY` and `FRONTEND_ORIGIN`.
- Test all three sample orders, policy refusals, out-of-scope request, unclear/invalid order IDs, and summary.
- Add deployment URL and screenshots/demo video to your submission.
