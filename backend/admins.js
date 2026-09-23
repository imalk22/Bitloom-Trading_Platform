/**
 * Admin accounts + referral codes.
 *
 * Env pattern (see .env.example):
 *   ADMIN_MAIN_USER / ADMIN_MAIN_PASS / ADMIN_MAIN_CODE / ADMIN_MAIN_EMAIL
 *   ADMIN_2_USER … ADMIN_18_USER (+ PASS, CODE, optional EMAIL)
 *
 * Role:
 *   main    → full access (oversight, all chats, any customer) — login by username or email
 *   limited → only customers who signed up with that admin's referral code
 */
function normalize(s) {
  return String(s || "").trim();
}

function normalizeCode(code) {
  return normalize(code).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function buildAdmins() {
  const admins = {};

  const add = (user, pass, { main = false, code, email = "" } = {}) => {
    const username = normalize(user);
    const password = normalize(pass);
    const referralCode = normalizeCode(code);
    if (!username || !password || !referralCode) return;
    if (admins[username]) {
      console.warn(`[Admins] Duplicate username skipped: ${username}`);
      return;
    }
    const clash = Object.values(admins).find((a) => a.code === referralCode);
    if (clash) {
      console.warn(`[Admins] Duplicate referral code ${referralCode} skipped for ${username}`);
      return;
    }
    admins[username] = {
      password,
      main: !!main,
      code: referralCode,
      email: normalize(email).toLowerCase(),
    };
  };

  add(process.env.ADMIN_MAIN_USER, process.env.ADMIN_MAIN_PASS, {
    main: true,
    code: process.env.ADMIN_MAIN_CODE || "MAIN01",
    email: process.env.ADMIN_MAIN_EMAIL || "",
  });

  for (let i = 2; i <= 18; i++) {
    add(process.env[`ADMIN_${i}_USER`], process.env[`ADMIN_${i}_PASS`], {
      main: false,
      code: process.env[`ADMIN_${i}_CODE`],
      email: process.env[`ADMIN_${i}_EMAIL`] || "",
    });
  }

  return admins;
}

function createAdminHelpers(ADMINS) {
  /** Accept username OR email as login id. Returns canonical username or null. */
  function resolveLogin(login) {
    const raw = normalize(login);
    if (!raw) return null;
    if (ADMINS[raw]) return raw;
    const email = raw.toLowerCase();
    for (const [username, meta] of Object.entries(ADMINS)) {
      if (meta.email && meta.email === email) return username;
    }
    return null;
  }

  function authAdmin(username, password) {
    const canonical = resolveLogin(username);
    if (!canonical) return false;
    return ADMINS[canonical].password === normalize(password);
  }

  function isMainAdmin(username) {
    const canonical = resolveLogin(username) || normalize(username);
    return !!(ADMINS[canonical] && ADMINS[canonical].main);
  }

  function getAdmin(username) {
    const canonical = resolveLogin(username) || normalize(username);
    return ADMINS[canonical] || null;
  }

  function findAdminByCode(code) {
    const c = normalizeCode(code);
    if (!c) return null;
    for (const [username, meta] of Object.entries(ADMINS)) {
      if (meta.code === c) return { username, ...meta };
    }
    return null;
  }

  function listAdminsPublic() {
    return Object.entries(ADMINS).map(([username, meta]) => ({
      username,
      code: meta.code,
      main: !!meta.main,
      email: meta.email || "",
      role: meta.main ? "main" : "limited",
    }));
  }

  function adminCount() {
    return Object.keys(ADMINS).length;
  }

  return {
    authAdmin,
    isMainAdmin,
    getAdmin,
    findAdminByCode,
    listAdminsPublic,
    adminCount,
    resolveLogin,
  };
}

module.exports = { buildAdmins, createAdminHelpers, normalizeCode };
