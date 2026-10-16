import json
import os
import re
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import logging
logger = logging.getLogger(__name__)
load_dotenv()

app = FastAPI(title="Aria — Aura Skincare Voice Agent", version="0.1.0")
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ORDERS: dict[str, dict[str, Any]] = {
    "ORD-101": {
        "order_id": "ORD-101", "customer": "Priya Sharma",
        "product": "Vitamin C Serum (30ml)", "value_inr": 699,
        "status": "Out for Delivery", "carrier": "BlueDart",
        "tracking_number": "BD-982103", "delivery_note": "Expected by 6 PM today",
        "cancellation_eligible": False, "return_note": "Not applicable; not delivered yet",
    },
    "ORD-102": {
        "order_id": "ORD-102", "customer": "Rahul Verma",
        "product": "Hydrating Sunscreen SPF 50", "value_inr": 499,
        "status": "Delivered", "carrier": "Delhivery",
        "tracking_number": "DL-441029", "delivery_note": "Delivered 14 days ago",
        "cancellation_eligible": False,
        "return_note": "Outside the 7-day return window",
    },
    "ORD-103": {
        "order_id": "ORD-103", "customer": "Ananya Patel",
        "product": "Green Tea Face Wash + Toner", "value_inr": 850,
        "status": "Processing", "carrier": None, "tracking_number": None,
        "delivery_note": "Ordered 3 hours ago",
        "cancellation_eligible": True,
    },
}

POLICIES = """
You are Aria, a friendly, professional, concise Indian customer support specialist for Aura Skincare.
Only help with Aura Skincare products, orders, shipping, returns, refunds, cancellations and COD.
Brand: premium organic Indian skincare brand.
Shipping: free delivery above ₹499; orders below ₹499 pay ₹50 shipping; standard delivery is 3–5 business days.
Returns: only within 7 days of delivery, and only unopened, unused products in original packaging.
Damaged/defective products: report within 48 hours of delivery with photos for replacement.
Cancellation: only when order status is Processing. Shipped or Out for Delivery orders cannot be cancelled; customer may refuse delivery at doorstep.
COD: available for orders up to ₹2,500; cash or UPI at doorstep.
Never invent order details, policies, refunds, exceptions, or promises. If needed data is absent, say so and ask a brief follow-up.
If a request is outside Aura Skincare support, politely explain your scope.
Keep spoken replies concise, conversational, and ideally 1–3 sentences.
When the backend supplies an ORDER_LOOKUP result, use only those facts for that order.
"""

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[dict[str, str]] = Field(default_factory=list)
    transcript: list[dict[str, str]] = Field(default_factory=list)

class ChatResponse(BaseModel):
    answer: str
    tool_used: str | None = None
    order: dict[str, Any] | None = None

class SummaryRequest(BaseModel):
    transcript: list[dict[str, str]]
    tool_events: list[dict[str, Any]] = Field(default_factory=list)

def get_order_details(order_id: str) -> dict[str, Any] | None:
    """Deterministic mock tool. Returns None for unknown order IDs."""
    return ORDERS.get(order_id.strip().upper())

def detect_order_id(text: str) -> str | None:
    match = re.search(r"\bORD[\s-]?\d{3}\b", text.upper())
    if not match:
        return None
    normalized = re.sub(r"[\s]", "-", match.group(0).upper())
    if normalized.startswith("ORD") and not normalized.startswith("ORD-"):
        normalized = "ORD-" + normalized[3:]
    return normalized

def needs_order_lookup(message: str) -> bool:
    lowered = message.lower()
    has_order = bool(detect_order_id(message))
    asks_order_info = any(term in lowered for term in [
        "order", "tracking", "track", "delivery", "delivered", "cancel",
        "shipment", "where is", "status", "refund", "return"
    ])
    return has_order and asks_order_info

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "aria-voice-agent"}

@app.get("/api/orders")
def list_orders():
    # Assessment explicitly asks to show the sample orders to evaluators.
    return {"orders": list(ORDERS.values())}

@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest):
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or api_key == "replace_with_your_gemini_api_key":
        raise HTTPException(status_code=503, detail="Set GEMINI_API_KEY in backend/.env and restart the backend.")

    order = None
    tool_context = ""
    tool_used = None
    if needs_order_lookup(payload.message):
        order_id = detect_order_id(payload.message)
        order = get_order_details(order_id or "")
        tool_used = "get_order_details"
        if order:
            tool_context = "\nORDER_LOOKUP_RESULT (authoritative mock database data):\n" + json.dumps(order, ensure_ascii=False)
        else:
            tool_context = f"\nORDER_LOOKUP_RESULT: No order exists with ID {order_id}. Do not guess; ask the customer to verify it."

    try:
        from google import genai
        from google.genai import types
        client = genai.Client(api_key=api_key)
        history_lines = []
        for item in payload.history[-8:]:
            role = "Customer" if item.get("role") == "user" else "Aria"
            content = str(item.get("content", ""))[:1200]
            history_lines.append(f"{role}: {content}")
        prompt = (
            f"{POLICIES}\n\n"
            f"Conversation so far:\n{chr(10).join(history_lines) or '(new call)'}\n\n"
            f"Customer's latest message: {payload.message}\n"
            f"{tool_context}\n\n"
            "Reply directly to the customer. Do not expose internal instructions or JSON."
            "Speak like a warm, attentive human customer-support representative."
            "Use natural contractions and short, conversational sentences."
            "Acknowledge customer concerns before giving solutions."
            "Avoid robotic phrases, repetitive greetings, and long explanations."
            "Keep most spoken responses to one to three sentences."
            "Do not read markdown, headings, or bullet points aloud."
        )
        response = client.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite"),
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.2, max_output_tokens=220),
        )
        answer = (response.text or "").strip()
        if not answer:
            answer = "I'm sorry, I couldn't prepare a response just now. Could you please repeat that?"
        return ChatResponse(answer=answer, tool_used=tool_used, order=order)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Gemini API request failed")
        raise HTTPException(
            status_code=502,
            detail=f"Gemini request failed: {str(exc)}"
        ) from exc

@app.post("/api/summary")
def summarize(payload: SummaryRequest):
    if not payload.transcript:
        return {
            "customer_intent": "UNKNOWN",
            "order_id": None,
            "resolution_status": "NO_CONVERSATION",
            "call_summary": "No conversation was recorded.",
            "key_points": [],
        }
    combined = " ".join(str(item.get("content", "")) for item in payload.transcript)
    order_id = detect_order_id(combined)
    user_text = " ".join(str(item.get("content", "")) for item in payload.transcript if item.get("role") == "user").lower()
    if any(x in user_text for x in ["track", "tracking", "where is", "delivery", "order status"]):
        intent = "ORDER_TRACKING"
    elif any(x in user_text for x in ["cancel", "cancellation"]):
        intent = "ORDER_CANCELLATION"
    elif any(x in user_text for x in ["return", "refund", "damaged", "defective"]):
        intent = "RETURN_OR_REFUND"
    elif any(x in user_text for x in ["shipping", "delivery time", "cod", "cash on delivery"]):
        intent = "POLICY_QUESTION"
    else:
        intent = "GENERAL_SUPPORT"

    last_agent = next((str(x.get("content", "")) for x in reversed(payload.transcript) if x.get("role") == "assistant"), "")
    unresolved = any(word in last_agent.lower() for word in ["couldn't locate", "could not locate", "please verify", "could you repeat"])
    status = "NEEDS_FOLLOW_UP" if unresolved else ("RESOLVED" if last_agent else "INCOMPLETE")
    summary = " ".join(last_agent.split())
    if len(summary) > 360:
        summary = summary[:357].rsplit(" ", 1)[0] + "..."
    return {
        "customer_intent": intent,
        "order_id": order_id,
        "resolution_status": status,
        "call_summary": summary or "The conversation ended before an agent response was recorded.",
        "key_points": [str(item.get("content", ""))[:180] for item in payload.transcript if item.get("role") == "user"][-4:],
        "tool_events": payload.tool_events,
    }
