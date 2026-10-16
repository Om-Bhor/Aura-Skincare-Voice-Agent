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
- Q1 : I chose a React frontend, a FastAPI backend, and Gemini for the LLM integration because I wanted to build a modular AI voice agent that could handle customer queries while keeping the user interface, business logic, and AI processing separate.

- **React + Vite:** I used React to build an interactive chat interface, and Vite for a fast development and build process.
- **FastAPI:** I chose FastAPI because it works well with Python-based AI libraries, provides asynchronous API support, and makes it easy to expose endpoints for chat, order lookup, and conversation summaries.
- **Gemini:** I integrated Gemini to understand customer messages and generate conversational responses.
- **Browser Web Speech API:** I used browser speech capabilities for speech recognition and text-to-speech, allowing users to interact with the agent by voice without initially needing a separate paid speech service.
- **Vercel and Render:** I used Vercel for frontend deployment and Render for backend hosting, keeping the two components independently deployable.

Overall, I chose this architecture because it was practical for an MVP, relatively cost-effective, and easy to extend. Separating the frontend and backend also makes future improvements, such as database integration, authentication, and more advanced voice processing, easier to implement.

- Q2 : The most difficult part was integrating the AI backend reliably and connecting it to the frontend. During development, I encountered API errors, including HTTP 502 responses from the chat endpoint, as well as challenges with Gemini configuration and model availability.

I approached the problem systematically rather than assuming the issue was in the frontend. I checked the environment variables, verified the API key configuration, inspected the backend logs, and tested the Gemini connection independently. I also checked the API endpoints and the frontend-to-backend configuration.

This helped me separate configuration and model-related issues from frontend integration issues. I also learned the importance of keeping API keys in environment variables, handling errors properly, and testing each component independently before testing the complete application.

The main lesson was that building an AI application is not just about getting an LLM response. It is also about making the complete system reliable, from the user interface to the backend and the external AI service.

- Q3 : My first priority would be to make the agent more reliable and production-ready, starting with persistent order data and better error handling.

Currently, the order lookup is based on predefined sample orders, and the conversation summary uses rule-based logic. I would improve the project in the following order:

1. **Database integration:** Replace hardcoded order data with a database so that the agent can retrieve and manage customer orders reliably.
2. **Structured tool calling:** Let the LLM identify when it needs to perform an action, such as checking an order or requesting a cancellation, and invoke validated backend functions rather than relying primarily on keyword matching.
3. **Error handling and testing:** Add input validation, timeouts, retries where appropriate, and automated tests for API endpoints and common customer scenarios.
4. **Voice experience:** Improve speech recognition, interruption handling, and response latency to make conversations feel more natural.
5. **Security and monitoring:** Add appropriate authentication, rate limiting, structured logs, and safeguards around customer information.

I would prioritize database integration and reliable tool execution first because an AI customer-support agent must do more than produce convincing answers; it must retrieve accurate information and perform the correct actions.

- Q4 : At 1,000 conversations a day, I would focus on scalability, reliability, data management, and cost control. I would not necessarily rebuild the entire architecture immediately, but I would remove the main limitations of the current MVP.

**First, I would improve the backend and data layer.** I would replace in-memory order data with a persistent database such as PostgreSQL and use connection pooling. I would also make sure that concurrent requests are handled efficiently.

**Second, I would manage AI usage carefully.** I would use structured tool calling for order-related actions, limit unnecessary LLM calls, keep prompts concise, and introduce timeouts and controlled retries. Frequently requested, non-sensitive information could be cached when appropriate.

**Third, I would improve reliability.** I would add rate limiting, input validation, centralized error handling, monitoring, and logs. If the system experiences a temporary Gemini outage, it should return a clear fallback response rather than leaving the customer waiting indefinitely.

**Fourth, I would address security.** API keys would remain on the backend, customer data would be protected, and sensitive actions such as cancellations would require appropriate validation and authorization.

**Finally, I would measure performance before scaling infrastructure.** I would monitor concurrent requests, response latency, error rates, token usage, and cost per conversation. If traffic or latency justified it, I would scale backend instances horizontally and introduce a queue for background tasks such as analytics and summary generation.

One thousand conversations per day averages roughly 42 conversations per hour, but actual demand may peak at particular times. Therefore, I would design and load-test the application for peak concurrency rather than relying on the daily average alone.

