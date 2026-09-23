import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Headphones } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebase";
import socket, { waitForSocket } from "../../socket";

const CHAT_STORAGE_KEY = "novax_chat_session";
const DRAFT_KEY = "bitloom_chat_draft";

function TypingDots() {
  return (
    <div className="flex items-center gap-0.5 px-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400"
          style={{ animationDelay: `${delay}ms`, animationDuration: "0.9s" }}
        />
      ))}
    </div>
  );
}

function readDraft() {
  try {
    const draft = sessionStorage.getItem(DRAFT_KEY);
    if (draft) sessionStorage.removeItem(DRAFT_KEY);
    return draft || "";
  } catch {
    return "";
  }
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [started, setStarted] = useState(false);
  const [closed, setClosed] = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const [msgRead, setMsgRead] = useState(false);
  const [unread, setUnread] = useState(0);
  const [sockConnected, setSockConnected] = useState(socket.connected);
  const [user, setUser] = useState(auth.currentUser);
  const [chatError, setChatError] = useState("");
  const [starting, setStarting] = useState(false);
  const bottomRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const sessionIdRef = useRef(null);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setUnread(0);
  }

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    const openChat = () => {
      try { sessionStorage.removeItem("bitloom_open_chat"); } catch { /* */ }
      const draft = readDraft();
      if (draft) setInput(draft);
      setOpen(true);
      waitForSocket(8000).then((ok) => setSockConnected(ok || socket.connected));
    };
    window.addEventListener("bitloom:open-chat", openChat);
    try {
      if (sessionStorage.getItem("bitloom_open_chat")) openChat();
    } catch { /* storage blocked */ }
    return () => window.removeEventListener("bitloom:open-chat", openChat);
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setSockConnected(true);
      const saved = sessionIdRef.current || localStorage.getItem(CHAT_STORAGE_KEY);
      if (saved) socket.emit("chat:rejoin", { sessionId: saved });
    };
    const onDisconnect = () => setSockConnected(false);
    const onSession = ({ sessionId: sid, messages: msgs }) => {
      setSessionId(sid);
      sessionIdRef.current = sid;
      localStorage.setItem(CHAT_STORAGE_KEY, sid);
      setMessages(msgs);
      setStarted(true);
      setClosed(false);
      setStarting(false);
      setChatError("");
    };
    const onExpired = () => {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      sessionIdRef.current = null;
      setStarted(false);
      setMessages([]);
      setSessionId(null);
    };
    const onMsg = ({ sessionId: _sid, ...msg }) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.from !== "user") setUnread((u) => u + 1);
      if (msg.from === "agent") setMsgRead(false);
    };
    const onTyping = ({ from, isTyping }) => {
      if (from === "agent") setAgentTyping(isTyping);
    };
    const onRead = () => setMsgRead(true);
    const onClosed = () => {
      setClosed(true);
      setAgentTyping(false);
      localStorage.removeItem(CHAT_STORAGE_KEY);
    };
    const onAgent = ({ online }) => setAgentOnline(online);
    const onError = ({ error }) => {
      setChatError(error || "Chat error");
      setStarting(false);
    };

    setSockConnected(socket.connected);
    if (!socket.connected) {
      try { socket.connect(); } catch { /* */ }
    }

    const savedId = localStorage.getItem(CHAT_STORAGE_KEY);
    if (savedId && socket.connected) {
      sessionIdRef.current = savedId;
      socket.emit("chat:rejoin", { sessionId: savedId });
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("chat:session", onSession);
    socket.on("chat:session-expired", onExpired);
    socket.on("chat:message", onMsg);
    socket.on("chat:typing", onTyping);
    socket.on("chat:read", onRead);
    socket.on("chat:closed", onClosed);
    socket.on("agent:status", onAgent);
    socket.on("chat:error", onError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("chat:session", onSession);
      socket.off("chat:session-expired", onExpired);
      socket.off("chat:message", onMsg);
      socket.off("chat:typing", onTyping);
      socket.off("chat:read", onRead);
      socket.off("chat:closed", onClosed);
      socket.off("agent:status", onAgent);
      socket.off("chat:error", onError);
    };
  }, []);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [open, messages.length, agentTyping]);

  const startChat = async () => {
    if (starting) return;
    setChatError("");
    if (!user) {
      setChatError("Sign in first, then open live chat with your support agent.");
      return;
    }

    setStarting(true);
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      sessionIdRef.current = null;
      setSessionId(null);
      setStarted(false);
      setClosed(false);
      setMessages([]);
    } catch { /* */ }

    const connected = await waitForSocket(10000);
    setSockConnected(connected || socket.connected);
    if (!connected && !socket.connected) {
      setStarting(false);
      setChatError("Cannot reach the support server. Keep this site open on localhost:5173 with the backend running.");
      return;
    }

    const failTimer = setTimeout(() => {
      setStarting(false);
      setChatError("Chat did not start — please try again.");
    }, 15000);

    try {
      const token = await user.getIdToken(true);
      socket.emit("chat:start", {
        name: name.trim() || user.displayName || user.email || "Customer",
        token,
      });
      const clear = () => clearTimeout(failTimer);
      socket.once("chat:session", clear);
      socket.once("chat:error", clear);
    } catch (err) {
      clearTimeout(failTimer);
      setChatError(err.message || "Could not start chat");
      setStarting(false);
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const sid = sessionIdRef.current;
    if (!sid) return;
    socket.emit("chat:typing", { sessionId: sid, isTyping: e.target.value.length > 0 });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("chat:typing", { sessionId: sid, isTyping: false });
    }, 2500);
  };

  const sendMsg = () => {
    const sid = sessionIdRef.current;
    if (!input.trim() || !sid || closed || !socket.connected) return;
    clearTimeout(typingTimeoutRef.current);
    socket.emit("chat:typing", { sessionId: sid, isTyping: false });
    socket.emit("chat:message", { sessionId: sid, text: input.trim() });
    setInput("");
    setMsgRead(false);
  };

  const fmt = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-3 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-3 sm:right-6 lg:bottom-6">
      {open && (
        <div className="flex h-[min(70vh,520px)] w-[calc(100vw-1.5rem)] max-w-[340px] flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/50">
          <div className="flex items-center gap-3 bg-gradient-to-r from-sky-500 to-cyan-600 px-4 py-3.5">
            <div className="relative flex-shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <Headphones className="h-5 w-5 text-white" />
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-emerald-600 ${agentOnline ? "bg-emerald-300" : "bg-slate-400"}`} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold leading-none text-white">Bitloom Desk</div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-white/70">
                {!sockConnected ? (
                  <>
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
                    <span className="text-sky-300">Connecting…</span>
                  </>
                ) : (
                  <>
                    <span className={`h-1.5 w-1.5 rounded-full ${agentOnline ? "bg-emerald-300 animate-pulse" : "bg-slate-400"}`} />
                    {started
                      ? (closed ? "Session closed" : agentOnline ? "Your agent online" : "Your agent offline")
                      : (agentOnline ? "Agent available" : "Leave a message")}
                  </>
                )}
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="p-1 text-white/60 transition hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {!started ? (
              <div className="flex min-h-44 flex-col items-center justify-center gap-3 px-3 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10">
                  <MessageCircle className="h-7 w-7 text-emerald-400" />
                </div>
                <p className="text-xs leading-relaxed text-slate-400">
                  {user
                    ? "Chat with Bitloom support. If you signed up with a referral code, you reach that agent."
                    : "Sign in to start a live chat with support."}
                </p>
                {chatError && (
                  <p className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">{chatError}</p>
                )}
                {user && (
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && startChat()}
                    className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-center text-xs text-white outline-none transition focus:border-sky-500/50"
                    placeholder="Your name (optional)"
                  />
                )}
                <button
                  type="button"
                  onClick={startChat}
                  disabled={starting || !user}
                  className="w-full rounded-xl bg-sky-500 py-2.5 text-xs font-bold text-black transition-all hover:bg-sky-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {!user ? "Sign in required" : starting ? "Starting…" : "Start Conversation"}
                </button>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex flex-col ${msg.from === "user" ? "items-end" : "items-start"}`}>
                    {msg.from === "system" ? (
                      <div className="w-full py-1 text-center text-[10px] italic text-slate-600">{msg.text}</div>
                    ) : (
                      <>
                        {msg.from === "agent" && (
                          <div className="mb-0.5 ml-1 text-[9px] font-semibold text-slate-500">Support Agent</div>
                        )}
                        <div
                          className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                            msg.from === "user"
                              ? "rounded-br-sm bg-sky-500 font-medium text-black"
                              : "rounded-bl-sm bg-slate-800 text-slate-200"
                          }`}
                        >
                          {msg.text}
                        </div>
                        <div className="mx-1 mt-0.5 text-[9px] text-slate-600">{fmt(msg.time)}</div>
                      </>
                    )}
                  </div>
                ))}
                {agentTyping && (
                  <div className="flex items-start gap-2">
                    <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-slate-800 px-3 py-2">
                      <span className="text-[10px] italic text-slate-500">Agent is typing</span>
                      <TypingDots />
                    </div>
                  </div>
                )}
                {msgRead && !closed && (
                  <div className="pr-1 text-right text-[9px] text-emerald-400">✓✓ Read by agent</div>
                )}
                {closed && (
                  <div className="mt-1 border-t border-slate-800/50 pt-2 text-center text-[10px] italic text-slate-600">
                    Session closed
                  </div>
                )}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {started && !closed && (
            <div className="flex gap-2 border-t border-slate-800 p-2.5">
              <input
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMsg()}
                className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-white outline-none transition focus:border-sky-500/50"
                placeholder="Type a message…"
              />
              <button
                type="button"
                onClick={sendMsg}
                disabled={!input.trim()}
                className="flex-shrink-0 rounded-xl bg-sky-500 p-2 text-black transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`relative flex h-[52px] w-[52px] items-center justify-center rounded-full shadow-xl transition-all ${
          open ? "border border-slate-700 bg-slate-800 text-slate-300" : "bg-sky-500 text-black shadow-sky-500/30 hover:bg-sky-400"
        }`}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-lg">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <span className="sr-only">{sessionId}</span>
    </div>
  );
}

/** Open the global live-chat widget, optionally with a prefilled draft message. */
export function openSupportChat(draft = "") {
  try {
    if (draft) sessionStorage.setItem(DRAFT_KEY, draft);
    sessionStorage.setItem("bitloom_open_chat", "1");
  } catch { /* storage blocked */ }
  window.dispatchEvent(new CustomEvent("bitloom:open-chat"));
}
