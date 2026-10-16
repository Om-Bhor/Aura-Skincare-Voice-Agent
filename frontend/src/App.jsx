import React, { useCallback, useEffect, useRef, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function prettyStatus(status) {
  return ({ listening: "Listening", thinking: "Thinking", speaking: "Speaking", idle: "Ready", error: "Needs attention" })[status] || status;
}

export default function App() {
  const [status, setStatus] = useState("idle");
  const [isActive, setIsActive] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [typedMessage, setTypedMessage] = useState("");
  const [error, setError] = useState("");
  const [toolEvents, setToolEvents] = useState([]);
  const recognitionRef = useRef(null);
  const transcriptRef = useRef([]);
  const activeRef = useRef(false);
  const historyRef = useRef([]);
  const requestLock = useRef(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/orders`).then(r => r.ok ? r.json() : Promise.reject()).then(d => setOrders(d.orders || [])).catch(() => setError("Backend not connected. Start FastAPI on port 8000."));
    return () => {
      activeRef.current = false;
      try { recognitionRef.current?.stop(); } catch {}
      window.speechSynthesis?.cancel();
    };
  }, []);

  const addLine = useCallback((role, content) => {
    const line = { role, content, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) };
    transcriptRef.current = [...transcriptRef.current, line];
    setTranscript([...transcriptRef.current]);
    return line;
  }, []);

  // const speak = useCallback((text) => new Promise(resolve => {
  //   if (!("speechSynthesis" in window)) { resolve(); return; }
  //   window.speechSynthesis.cancel();
  //   const utterance = new SpeechSynthesisUtterance(text);
  //   const voices = window.speechSynthesis.getVoices();
  //   const indian = voices.find(v => /en-IN/i.test(v.lang)) || voices.find(v => /india/i.test(v.name));
  //   if (indian) utterance.voice = indian;
  //   utterance.lang = indian?.lang || "en-IN";
  //   utterance.rate = 1.02;
  //   utterance.pitch = 1;
  //   utterance.onend = () => resolve();
  //   utterance.onerror = () => resolve();
  //   setStatus("speaking");
  //   window.speechSynthesis.speak(utterance);
  //   // Avoid hanging if a browser never fires onend.
  //   setTimeout(resolve, Math.max(2500, text.length * 95));
  // }), []);


const speak = useCallback((text) => new Promise(resolve => {
  if (!("speechSynthesis" in window)) {
    resolve();
    return;
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  const cleanText = String(text || "")
    .replace(/[*_#`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanText) {
    resolve();
    return;
  }

  const voices = synth.getVoices();

  // Prefer a natural-sounding English voice available on this device.
  const voice =
    voices.find(v => /samantha/i.test(v.name) && /^en/i.test(v.lang)) ||
    voices.find(v => /google.*english.*female/i.test(v.name)) ||
    voices.find(v => /^en-IN$/i.test(v.lang)) ||
    voices.find(v => /^en-US$/i.test(v.lang)) ||
    voices.find(v => /^en-GB$/i.test(v.lang)) ||
    voices.find(v => /^en/i.test(v.lang));

  const utterance = new SpeechSynthesisUtterance(cleanText);

  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = "en-IN";
  }

  // Slightly slower pacing sounds less rushed.
  utterance.rate = 0.94;
  utterance.pitch = 1.03;
  utterance.volume = 1;

  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(fallbackTimer);
    resolve();
  };

  utterance.onend = finish;
  utterance.onerror = finish;

  setStatus("speaking");

  // Some browsers do not reliably fire onend.
  const fallbackTimer = setTimeout(
    finish,
    Math.max(5000, cleanText.length * 110)
  );

  synth.speak(utterance);
  }), []);


  const askAgent = useCallback(async (message) => {
    if (!message.trim() || requestLock.current) return;
    requestLock.current = true;
    setError("");
    addLine("user", message.trim());
    setStatus("thinking");
    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), history: historyRef.current })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not contact the AI agent.");
      addLine("assistant", data.answer);
      historyRef.current = [...historyRef.current, { role: "user", content: message.trim() }, { role: "assistant", content: data.answer }].slice(-12);
      if (data.tool_used) setToolEvents(old => [...old, { tool: data.tool_used, order_id: data.order?.order_id || null, found: Boolean(data.order) }]);
      await speak(data.answer);
    } catch (e) {
      setError(e.message || "Something went wrong.");
      setStatus("error");
    } finally {
      requestLock.current = false;
      if (activeRef.current) startListening();
      else setStatus("idle");
    }
  }, [addLine, speak]);

  const startListening = useCallback(() => {
    if (!activeRef.current || !SpeechRecognition || requestLock.current) return;
    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.lang = "en-IN";
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => setStatus("listening");
      recognition.onresult = (event) => {
        const text = event.results?.[0]?.[0]?.transcript || "";
        if (text.trim()) askAgent(text);
      };
      recognition.onerror = (event) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
          setError(`Microphone/speech recognition issue: ${event.error}. You can type a message below.`);
        }
        if (activeRef.current && !requestLock.current) setTimeout(() => startListening(), 500);
      };
      recognition.onend = () => {
        if (activeRef.current && !requestLock.current && status !== "thinking" && status !== "speaking") {
          setTimeout(() => startListening(), 250);
        }
      };
      recognition.start();
    } catch {
      setError("Could not start microphone recognition. Allow microphone access and use Chrome or Edge.");
      setStatus("error");
    }
  }, [askAgent, status]);

  const startCall = () => {
    if (!SpeechRecognition) {
      setError("This browser does not support Web Speech recognition. Please use Chrome or Edge, or use the text input below.");
      return;
    }
    window.speechSynthesis?.cancel();
    transcriptRef.current = [];
    setTranscript([]);
    historyRef.current = [];
    setToolEvents([]);
    setSummary(null);
    setError("");
    activeRef.current = true;
    setIsActive(true);
    addLine("assistant", "Hello! I'm Aria from Aura Skincare. How can I help you today?");
    speak("Hello! I'm Aria from Aura Skincare. How can I help you today.").then(() => startListening());
  };

  const endCall = async () => {
    activeRef.current = false;
    setIsActive(false);
    try { recognitionRef.current?.stop(); } catch {}
    window.speechSynthesis?.cancel();
    setStatus("thinking");
    try {
      const response = await fetch(`${API_BASE}/api/summary`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcriptRef.current, tool_events: toolEvents })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not generate summary");
      setSummary(data);
    } catch (e) {
      setError(e.message || "Summary generation failed.");
    } finally { setStatus("idle"); }
  };

  const sendTyped = async (event) => {
    event.preventDefault();
    const value = typedMessage.trim();
    if (!value) return;
    setTypedMessage("");
    await askAgent(value);
  };

  const copyTranscript = async () => {
    const text = transcript.map(x => `${x.role === "user" ? "Customer" : "Aria"}: ${x.content}`).join("\n");
    try { await navigator.clipboard.writeText(text); } catch { setError("Clipboard access is unavailable in this browser."); }
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="brand-lockup"><div className="brand-mark">a</div><div><strong>AURA</strong><span>SKINCARE</span></div></div>
        <div className="topbar-right"><span className="secure-dot" /> AI CUSTOMER CARE <span className="topbar-divider">/</span> DEMO</div>
      </header>

      <main>
        <section className="hero">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR PERSONAL SKINCARE ASSISTANT</div>
          <h1>A little care,<br /><em>a lot more clarity.</em></h1>
          <p>Meet Aria, your Aura Skincare support specialist. Ask about orders, delivery, returns, or anything you need help with.</p>
        </section>

        <section className="workspace">
          <div className="call-card">
            <div className="call-card-head"><div><span className="tiny-label">LIVE SUPPORT</span><h2>Talk to Aria</h2></div><div className={`status-pill ${status}`}><span className="status-dot" />{prettyStatus(status)}</div></div>
            <div className={`orb-wrap ${status}`}><div className="orb-halo halo-one" /><div className="orb-halo halo-two" /><div className="orb"><div className="orb-inner">a</div></div><div className="sound-bars"><i /><i /><i /><i /><i /><i /><i /></div></div>
            <div className="call-copy"><h3>{isActive ? (status === "listening" ? "I'm listening." : status === "thinking" ? "Let me think." : status === "speaking" ? "Here's what I found." : "I'm here to help.") : "Whenever you're ready."}</h3><p>{isActive ? "Speak naturally. You can also type a message below." : "Start a conversation with Aria using your microphone."}</p></div>
            <div className="call-actions">
              {!isActive ? <button className="primary-btn" onClick={startCall}><span className="mic-icon">◖</span> Start Call</button> : <button className="end-btn" onClick={endCall}><span className="end-square" /> End Call</button>}
              <span className="call-note"><span className="pulse-dot" /> {isActive ? "Call in progress" : "Microphone access required"}</span>
            </div>
            <form className="text-fallback" onSubmit={sendTyped}><input value={typedMessage} onChange={e => setTypedMessage(e.target.value)} placeholder="Or type a message to test the agent…" aria-label="Type a message" /><button type="submit" disabled={!typedMessage.trim() || status === "thinking"} aria-label="Send message">↑</button></form>
            {error && <div className="error-banner" role="alert">{error}</div>}
            <div className="privacy-note"><span>✳</span> Demo environment · Use sample orders only</div>
          </div>

          <aside className="side-column">
            <div className="orders-card">
              <div className="section-heading"><div><span className="tiny-label">QUICK REFERENCE</span><h2>Test orders</h2></div><span className="count-chip">03</span></div>
              <p className="section-intro">Try asking Aria about any of these sample orders.</p>
              {orders.map(order => <button className="order-row" key={order.order_id} onClick={() => setTypedMessage(`Can you tell me the status of order ${order.order_id}?`)} title={`Prepare a test question about ${order.order_id}`}><div className="order-icon">↗</div><div className="order-main"><strong>{order.order_id}</strong><span>{order.product}</span><small>{order.status}</small></div><span className="order-arrow">↗</span></button>)}
              <div className="hint-box"><span>TRY THIS</span><p>“Where is my order ORD-101?”</p></div>
            </div>
            <div className="policy-card"><div className="policy-icon">✳</div><div><h3>Grounded in our policies</h3><p>Aria follows Aura's delivery, cancellation, and return policies—not just what a customer wants to hear.</p></div></div>
          </aside>
        </section>

        <section className="bottom-grid">
          <div className="transcript-card">
            <div className="section-heading"><div><span className="tiny-label">CONVERSATION LOG</span><h2>Call transcript</h2></div><button className="text-btn" onClick={copyTranscript} disabled={!transcript.length}>Copy transcript ↗</button></div>
            <div className="transcript-body">
              {!transcript.length ? <div className="empty-state"><div className="empty-icon">⌁</div><strong>Your conversation will appear here</strong><span>Start a call or send a typed message to see the transcript.</span></div> : transcript.map((line, i) => <div className={`transcript-line ${line.role}`} key={`${line.time}-${i}`}><div className="speaker">{line.role === "user" ? "YOU" : "ARIA"}<time>{line.time}</time></div><p>{line.content}</p></div>)}
            </div>
          </div>
          <div className="summary-card">
            <div className="section-heading"><div><span className="tiny-label">AFTER THE CALL</span><h2>Call summary</h2></div><span className="json-chip">{summary ? "JSON READY" : "JSON"}</span></div>
            {!summary ? <div className="empty-state compact"><div className="empty-icon">{`{ }`}</div><strong>Summary appears when you end the call</strong><span>Intent, order reference, resolution and key points.</span></div> : <><div className="summary-fields">{Object.entries(summary).filter(([key]) => key !== "key_points" && key !== "tool_events").map(([key, value]) => <div className="summary-field" key={key}><span>{key}</span><strong>{value == null ? "—" : String(value)}</strong></div>)}</div><pre className="json-preview">{JSON.stringify(summary, null, 2)}</pre><button className="text-btn" onClick={() => navigator.clipboard?.writeText(JSON.stringify(summary, null, 2))}>Copy JSON ↗</button></>}
          </div>
        </section>
      </main>
      <footer><div className="brand-lockup small"><div className="brand-mark">a</div><div><strong>AURA</strong><span>SKINCARE</span></div></div><span>Thoughtful care, thoughtfully delivered.</span><span>ASSESSMENT DEMO · AI VOICE CX</span></footer>
    </div>
  );
}
