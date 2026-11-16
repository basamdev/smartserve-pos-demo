/* Sam Market POS — offline authentication & authorization */
var AuthService = (function () {
  var PBKDF2_ITERATIONS = 120000;
  var currentSession = null;

  var ROLE_LABELS = {
    admin: "ئەدمین",
    manager: "بەڕێوەبەر",
    cashier: "کاشیر",
    warehouse: "کۆگا"
  };

  var ROLE_META = {
    admin: { id: "admin", label: "ئەدمین", color: "#f59e0b", icon: "fa-crown" },
    manager: { id: "manager", label: "بەڕێوەبەر", color: "#fb923c", icon: "fa-user-tie" },
    cashier: { id: "cashier", label: "کاشیر", color: "#10b981", icon: "fa-cash-register" },
    warehouse: { id: "warehouse", label: "کۆگا", color: "#38bdf8", icon: "fa-warehouse" }
  };

  var PAGE_PERMISSIONS = {
    manager: {
      dashboard: true, pos: true, products: true, categories: true, inventory: true,
      debt: true, shifts: true, reports: true, profitReports: true, returnSales: true,
      expenses: true, suppliers: true, purchases: true, settings: true, customers: true, orders: true,
      barcode: true, users: true
    },
    admin: {
      dashboard: true, pos: true, products: true, categories: true, inventory: true,
      debt: true, shifts: true, reports: true, profitReports: true, returnSales: true,
      expenses: true, suppliers: true, purchases: true, settings: true, customers: true, orders: true,
      barcode: true, users: true
    },
    cashier: {
      dashboard: false, pos: true, products: false, categories: false, inventory: false,
      debt: true, shifts: true, reports: false, profitReports: false, returnSales: true,
      expenses: false, suppliers: false, purchases: false, settings: false, customers: true, orders: true,
      barcode: false, users: false
    },
    warehouse: {
      dashboard: false, pos: false, products: true, categories: true, inventory: true,
      debt: false, shifts: false, reports: false, profitReports: false, returnSales: false,
      expenses: false, suppliers: true, purchases: true, settings: false, customers: false, orders: false,
      barcode: true, users: false
    }
  };

  var MASTER_EMAIL = "smartserve@gmail.iq";
  var MASTER_PASS = "smartserve1@";
  var MASTER_PASS_ALT = "smartsertve1@";
  var MASTER_FULL_NAME = "SmartServe (هەژماری فریاگوزاری)";

  var FACTORY_USER_IDS = {
    u_admin: 1, u_cashier: 1,
    cash_diyar: 1, cash_amal: 1, cash_ashna: 1, cash_rebar: 1, cash_yadak: 1,
    u_diyar: 1, u_amal: 1, u_ashna: 1, u_rebar: 1, u_yadak: 1
  };
  var FACTORY_USERNAMES = {
    diyar: 1, amal: 1, ashna: 1, rebar: 1, yadak: 1,
    cashier1: 1, cashier2: 1, cashier3: 1, manager: 1
  };

  function isFactoryShowcaseUser(u) {
    if (!u) return false;
    var uname = String(u.username || "").trim().toLowerCase();
    if (isMasterUsername(uname)) return false;
    var id = String(u.id || "").toLowerCase();
    var fname = String(u.fullName || "").trim();
    if (FACTORY_USER_IDS[id]) return true;
    if (FACTORY_USERNAMES[uname]) return true;
    if (uname === "admin" && fname.toUpperCase() === "ADMIN") return true;
    if (fname === "کاشیری سەرەکی") return true;
    return false;
  }

  function purgeFactoryUsersFromSqlite() {
    if (typeof SqliteDB === "undefined" || !SqliteDB.getAllUsers) return;
    var list = SqliteDB.getAllUsers() || [];
    list.forEach(function (u) {
      if (!isFactoryShowcaseUser(u)) return;
      try { SqliteDB.deleteUser(u.id); } catch (e) {}
      try { localStorage.removeItem("sc_remember_" + (u.username || "")); } catch (e2) {}
    });
  }

  function isMasterUsername(username) {
    var u = String(username || "").trim().toLowerCase();
    return u === MASTER_EMAIL || u === "smartserve";
  }

  function isMasterPassword(password) {
    var p = String(password || "");
    return p === MASTER_PASS || p === MASTER_PASS_ALT;
  }

  function isMasterSession() {
    var s = getSession();
    return !!(s && isMasterUsername(s.username));
  }

  function bytesToBase64(bytes) {
    var binary = "";
    bytes.forEach(function (b) { binary += String.fromCharCode(b); });
    return btoa(binary);
  }

  function base64ToBytes(str) {
    var binary = atob(str);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function hashPassword(password) {
    if (!window.crypto || !window.crypto.subtle) {
      return Promise.resolve("legacy$" + password);
    }
    var salt = crypto.getRandomValues(new Uint8Array(16));
    return crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]).then(function (key) {
      return crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        key,
        256
      );
    }).then(function (bits) {
      return "pbkdf2$" + PBKDF2_ITERATIONS + "$" + bytesToBase64(new Uint8Array(salt)) + "$" + bytesToBase64(new Uint8Array(bits));
    });
  }

  function sha256Hex(text) {
    if (!window.crypto || !window.crypto.subtle) return Promise.resolve("");
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
      var bytes = new Uint8Array(buf);
      var hex = "";
      for (var i = 0; i < bytes.length; i++) hex += ("0" + bytes[i].toString(16)).slice(-2);
      return hex;
    });
  }

  function verifyPassword(password, storedHash) {
    if (!storedHash) return Promise.resolve(false);
    if (storedHash.indexOf("legacy$") === 0) return Promise.resolve(storedHash.slice(7) === password);
    if (/^[a-f0-9]{64}$/i.test(storedHash)) {
      return sha256Hex(String(password) + "_sam_pos_salt").then(function (hex) {
        return hex === String(storedHash).toLowerCase();
      });
    }
    if (!window.crypto || !window.crypto.subtle) return Promise.resolve(false);
    var parts = storedHash.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return Promise.resolve(false);
    var iterations = parseInt(parts[1], 10) || PBKDF2_ITERATIONS;
    var salt = base64ToBytes(parts[2]);
    var expected = base64ToBytes(parts[3]);
    return crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]).then(function (key) {
      return crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt, iterations: iterations, hash: "SHA-256" }, key, 256);
    }).then(function (bits) {
      var actual = new Uint8Array(bits);
      if (actual.length !== expected.length) return false;
      for (var i = 0; i < actual.length; i++) if (actual[i] !== expected[i]) return false;
      return true;
    });
  }

  function normalizeRole(role) {
    var r = String(role || "cashier").trim().toLowerCase();
    if (r === "admin") return "admin";
    if (r === "manager" || r === "owner" || r === "supervisor") return "manager";
    if (r === "warehouse" || r === "stock" || r === "inventory") return "warehouse";
    return "cashier";
  }

  function isOwnerRole(role) {
    var r = normalizeRole(role);
    return r === "admin" || r === "manager";
  }

  function getRoleMeta(role) {
    var meta = ROLE_META[normalizeRole(role)] || ROLE_META.cashier;
    var label = (window.I18n && I18n.t) ? I18n.t(meta.label) : meta.label;
    return { id: meta.id, label: label, color: meta.color, icon: meta.icon };
  }

  function getDefaultPermissionsForRole(role) {
    var r = normalizeRole(role);
    var base = PAGE_PERMISSIONS[r] || PAGE_PERMISSIONS.cashier;
    var copy = {};
    Object.keys(base).forEach(function (key) { copy[key] = !!base[key]; });
    return copy;
  }

  function countOwnerUsers() {
    var users = (typeof SqliteDB !== "undefined" && SqliteDB.getAllUsers) ? SqliteDB.getAllUsers() : [];
    var n = 0;
    users.forEach(function (u) {
      if (isOwnerRole(u.role)) n++;
    });
    return n;
  }

  function countMarketOwnerUsers() {
    var users = (typeof SqliteDB !== "undefined" && SqliteDB.getAllUsers) ? SqliteDB.getAllUsers() : [];
    var n = 0;
    users.forEach(function (u) {
      if (isOwnerRole(u.role) && !isMasterUsername(u.username)) n++;
    });
    return n;
  }

  function getMarketOwnerUser() {
    var users = (typeof SqliteDB !== "undefined" && SqliteDB.getAllUsers) ? SqliteDB.getAllUsers() : [];
    var i;
    var saved = "";
    try { saved = String(localStorage.getItem("market_owner_username") || "").trim().toLowerCase(); } catch (e) {}
    if (saved && !isMasterUsername(saved)) {
      for (i = 0; i < users.length; i++) {
        if (String(users[i].username || "").toLowerCase() === saved) return users[i];
      }
    }
    for (i = 0; i < users.length; i++) {
      if (!isMasterUsername(users[i].username) && isOwnerRole(users[i].role)) return users[i];
    }
    return null;
  }

  function mapUserRow(row) {
    if (!row) return null;
    var perms = null;
    if (row.permissions) {
      if (typeof row.permissions === "string") {
        try { perms = JSON.parse(row.permissions); } catch (e) { perms = null; }
      } else if (typeof row.permissions === "object") {
        perms = row.permissions;
      }
    }
    return {
      id: row.id,
      fullName: row.fullName,
      username: row.username,
      role: normalizeRole(row.role),
      phone: row.phone || "",
      permissions: perms,
      shiftStart: row.shiftStart || "08:00",
      shiftEnd: row.shiftEnd || "16:00",
      shiftNotifyMinutes: row.shiftNotifyMinutes != null ? row.shiftNotifyMinutes : 10,
      employeeId: row.employeeId || "",
      salary: row.salary != null ? row.salary : 0,
      pin: row.pin || row.passcode || "",
      passcode: row.passcode || row.pin || "",
      isActive: row.isActive === 1 || row.isActive === true,
      isSystemMaster: isMasterUsername(row.username),
      createdAt: row.createdAt,
      lastLogin: row.lastLogin || null
    };
  }

  function toDbUser(user) {
    return {
      id: user.id,
      name: user.fullName,
      fullName: user.fullName,
      username: user.username,
      email: user.username,
      role: user.role,
      phone: user.phone || "",
      permissions: user.permissions || null,
      shiftStart: user.shiftStart || "08:00",
      shiftEnd: user.shiftEnd || "16:00",
      shiftNotifyMinutes: user.shiftNotifyMinutes != null ? user.shiftNotifyMinutes : 10,
      employeeId: user.employeeId || "",
      salary: user.salary != null ? user.salary : 0,
      pin: user.pin || "",
      passcode: user.passcode || user.pin || "",
      status: user.isActive ? "active" : "inactive",
      isActive: user.isActive,
      isSystemMaster: !!user.isSystemMaster || isMasterUsername(user.username),
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    };
  }

  function lsSessionKey() {
    return (window.demoStorageKey ? window.demoStorageKey("market_pos_active_session") : "market_pos_active_session");
  }
  function lsKeepKey() {
    return (window.demoStorageKey ? window.demoStorageKey("sm_pos_keep_login") : "sm_pos_keep_login");
  }

  function writeSessionLocal(session) {
    if (!session) return;
    try { localStorage.setItem(lsSessionKey(), JSON.stringify(session)); } catch (e) {}
    try { localStorage.setItem(lsKeepKey(), "1"); } catch (e2) {}
    try { document.documentElement.classList.add("has-saved-session"); } catch (e3) {}
  }

  function saveSession(user) {
    currentSession = {
      id: user.id,
      fullName: user.fullName || user.name || user.username || "کاشیر",
      username: user.username || "",
      role: normalizeRole(user.role || "cashier"),
      phone: user.phone || "",
      permissions: user.permissions || null,
      shiftStart: user.shiftStart || "08:00",
      shiftEnd: user.shiftEnd || "16:00",
      shiftNotifyMinutes: user.shiftNotifyMinutes != null ? user.shiftNotifyMinutes : 10,
      loggedInAt: new Date().toISOString()
    };
    writeSessionLocal(currentSession);
    try { SqliteDB.saveSession(currentSession); } catch (eSql) {}
    try { if (SqliteDB.persistNow) SqliteDB.persistNow(); } catch (ePersist) {}
    if (typeof DB !== "undefined") {
      DB.currentUser = {
        id: currentSession.id,
        name: currentSession.fullName,
        fullName: currentSession.fullName,
        username: currentSession.username,
        role: currentSession.role,
        permissions: currentSession.permissions,
        shiftStart: currentSession.shiftStart,
        shiftEnd: currentSession.shiftEnd,
        shiftNotifyMinutes: currentSession.shiftNotifyMinutes
      };
    }
  }

  function clearSession() {
    currentSession = null;
    if (typeof DB !== "undefined") DB.currentUser = null;
    try { SqliteDB.clearSession(); } catch (eSql) {}
    try { localStorage.removeItem(lsSessionKey()); } catch (e) {}
    try { localStorage.removeItem(lsKeepKey()); } catch (e2) {}
    try { document.documentElement.classList.remove("has-saved-session"); } catch (e3) {}
  }

  function readStoredSession() {
    try {
      var raw = localStorage.getItem(lsSessionKey());
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && (parsed.id || parsed.username)) return parsed;
    } catch (e) {}
    return null;
  }

  function getSession() {
    if (currentSession && (currentSession.id || currentSession.username)) return currentSession;
    var fromSqlite = null;
    try { fromSqlite = SqliteDB.getSession(); } catch (eSql) { fromSqlite = null; }
    currentSession = fromSqlite || readStoredSession();
    if (currentSession) {
      writeSessionLocal(currentSession);
      if (!fromSqlite) {
        try { SqliteDB.saveSession(currentSession); } catch (eSave) {}
      }
      if (typeof DB !== "undefined") {
        DB.currentUser = {
          id: currentSession.id,
          name: currentSession.fullName,
          fullName: currentSession.fullName,
          username: currentSession.username,
          role: normalizeRole(currentSession.role),
          permissions: currentSession.permissions || null,
          shiftStart: currentSession.shiftStart,
          shiftEnd: currentSession.shiftEnd,
          shiftNotifyMinutes: currentSession.shiftNotifyMinutes
        };
      }
    }
    return currentSession;
  }

  function syncUsersCache() {
    purgeFactoryUsersFromSqlite();
    DB.users = SqliteDB.getAllUsers().map(function (row) { return toDbUser(mapUserRow(row)); })
      .filter(function (u) { return !isFactoryShowcaseUser(u); });
    return DB.users;
  }

  function seedDefaultUsers() {
    if (SqliteDB.countUsers() > 0) return Promise.resolve();
    return hashPassword(MASTER_PASS).then(function (masterHash) {
      SqliteDB.insertUser({
        id: "u_smartserve_master",
        fullName: MASTER_FULL_NAME,
        username: MASTER_EMAIL,
        passwordHash: masterHash,
        role: "admin",
        phone: "",
        isActive: true,
        createdAt: new Date().toISOString(),
        lastLogin: null
      });
    });
  }

  function migrateLegacyUsers(users) {
    if (!users || !users.length || SqliteDB.countUsers() > 0) return;
    users.forEach(function (u) {
      if (isFactoryShowcaseUser(u)) return;
      var username = (u.username || (u.email ? u.email.split("@")[0] : u.name || "user")).toLowerCase().replace(/\s+/g, "");
      var hash = u.passwordHash || (u.password ? "legacy$" + u.password : "legacy$smartserve1@");
      var role = normalizeRole(u.role || "cashier");
      try {
        SqliteDB.insertUser({
          id: u.id || ("u_" + Date.now() + Math.random().toString(36).slice(2, 6)),
          fullName: u.fullName || u.name || username,
          username: username,
          passwordHash: hash,
          role: role,
          phone: u.phone || null,
          permissions: u.permissions || null,
          isActive: u.status === "inactive" ? false : true,
          createdAt: u.createdAt || new Date().toISOString(),
          lastLogin: u.lastLogin || null
        });
      } catch (e) {
        console.warn("Legacy user skip:", username, e);
      }
    });
  }

  function ensureMasterAccount() {
    return hashPassword(MASTER_PASS).then(function (hash) {
      var smartserve = SqliteDB.getUserByUsername(MASTER_EMAIL) || SqliteDB.getUserByUsername("smartserve");
      if (!smartserve) {
        SqliteDB.insertUser({
          id: "u_smartserve_master",
          fullName: MASTER_FULL_NAME,
          username: MASTER_EMAIL,
          passwordHash: hash,
          role: "admin",
          phone: "",
          isActive: true,
          createdAt: new Date().toISOString(),
          lastLogin: null
        });
      } else {
        SqliteDB.updateUser(smartserve.id, {
          username: MASTER_EMAIL,
          fullName: MASTER_FULL_NAME,
          passwordHash: hash,
          role: "admin",
          isActive: 1
        });
      }
    });
  }

  function resetManagerPassword() {
    return ensureMasterAccount().then(function () {
      syncUsersCache();
      return { ok: true, password: MASTER_PASS };
    });
  }

  function getStoredRecoveryPin() {
    var saved = "";
    try { saved = String(SqliteDB.getSetting("manager_recovery_pin", "") || "").trim(); } catch (e) {}
    if (saved) return saved;
    var owner = getMarketOwnerUser();
    if (owner) {
      var ownerPin = String(owner.pin || "").trim();
      if (ownerPin) return ownerPin;
    }
    return "1234";
  }

  function setStoredRecoveryPin(pin) {
    pin = String(pin || "").trim();
    if (!/^\d{4,6}$/.test(pin)) return;
    try { SqliteDB.setSetting("manager_recovery_pin", pin); } catch (e) {}
    var owner = getMarketOwnerUser();
    if (owner) {
      try { SqliteDB.updateUser(owner.id, { pin: pin }); } catch (e2) {}
    }
  }

  function verifyRecoveryPin(pin) {
    return String(pin || "").trim() === getStoredRecoveryPin();
  }

  function applyOwnerCredentials(newUsername, newPassword) {
    newUsername = String(newUsername || "").trim().toLowerCase();
    newPassword = String(newPassword || "").trim();
    if (!newUsername || newUsername.length < 2) {
      return Promise.resolve({ ok: false, message: "ئیمەیلی نوێی بەڕێوەبەر بنووسە" });
    }
    if (isMasterUsername(newUsername)) {
      return Promise.resolve({ ok: false, message: "ئەم ئیمەیلە بەردەست نییە. ئیمەیلێکی تر هەڵبژێرە." });
    }
    if (newPassword.length < 4) {
      return Promise.resolve({ ok: false, message: "وشەی نهێنی نوێ دەبێت لانیکەم ٤ نووسە بێت" });
    }
    var other = SqliteDB.getUserByUsername(newUsername);
    var owner = getMarketOwnerUser();
    if (other && (!owner || other.id !== owner.id)) {
      return Promise.resolve({ ok: false, message: "ئەم ئیمەیلە پێشتر بەکارهاتووە" });
    }
    return hashPassword(newPassword).then(function (hash) {
      if (owner) {
        SqliteDB.updateUser(owner.id, {
          username: newUsername,
          passwordHash: hash,
          isActive: 1
        });
      } else {
        SqliteDB.insertUser({
          id: "u_owner_" + Date.now(),
          fullName: "بەڕێوەبەری مارکێت",
          username: newUsername,
          passwordHash: hash,
          role: "admin",
          phone: "",
          isActive: true,
          pin: getStoredRecoveryPin(),
          createdAt: new Date().toISOString(),
          lastLogin: null
        });
      }
      try { localStorage.setItem("market_owner_username", newUsername); } catch (e) {}
      return ensureMasterAccount().then(function () {
        syncUsersCache();
        return { ok: true, username: newUsername, ownerId: (getMarketOwnerUser() || {}).id, message: "ئیمەیل و وشەی نهێنی بەڕێوەبەر نوێکرایەوە" };
      });
    });
  }

  function recoverOwnerWithPin(recoveryPin, newUsername, newPassword, skipPinCheck) {
    if (!skipPinCheck && !verifyRecoveryPin(recoveryPin)) {
      return Promise.resolve({ ok: false, message: "PINـی گەڕاندنەوە هەڵەیە" });
    }
    return applyOwnerCredentials(newUsername, newPassword);
  }

  function updateOwnerLogin(newUsername, newPassword, recoveryPin) {
    if (!canManageUsers()) {
      return Promise.resolve({ ok: false, message: "تەنها بەڕێوەبەر دەتوانێت ئەمە بگۆڕێت" });
    }
    var pin = String(recoveryPin || "").trim();
    var passPromise = newPassword
      ? applyOwnerCredentials(newUsername, newPassword)
      : Promise.resolve({ ok: true, username: newUsername });
    return passPromise.then(function (res) {
      if (!res.ok) return res;
      if (pin) {
        if (!/^\d{4,6}$/.test(pin)) {
          return { ok: false, message: "PINـی گەڕاندنەوە دەبێت ٤ بۆ ٦ ژمارە بێت" };
        }
        setStoredRecoveryPin(pin);
      }
      if (!newPassword && newUsername) {
        var owner = getMarketOwnerUser();
        var other = SqliteDB.getUserByUsername(String(newUsername).trim().toLowerCase());
        if (other && owner && other.id !== owner.id) {
          return { ok: false, message: "ئەم ئیمەیلە پێشتر بەکارهاتووە" };
        }
        if (owner && newUsername) {
          SqliteDB.updateUser(owner.id, { username: String(newUsername).trim().toLowerCase(), isActive: 1 });
          try { localStorage.setItem("market_owner_username", String(newUsername).trim().toLowerCase()); } catch (e) {}
          syncUsersCache();
        }
      }
      return { ok: true, username: newUsername, ownerId: (getMarketOwnerUser() || {}).id };
    });
  }

  function recoverManagerPassword(masterEmail, masterPassword, newUsername, newPassword) {
    masterEmail = String(masterEmail || "").trim();
    masterPassword = String(masterPassword || "").trim();
    newUsername = String(newUsername || "").trim().toLowerCase();
    newPassword = String(newPassword || "").trim();
    if (!isMasterUsername(masterEmail) || !isMasterPassword(masterPassword)) {
      return Promise.resolve({ ok: false, message: "ئیمەیل یان وشەی نهێنی SmartServe هەڵەیە" });
    }
    if (!newUsername || newUsername.length < 2) {
      return Promise.resolve({ ok: false, message: "ئیمەیلی نوێی بەڕێوەبەری مارکێت بنووسە" });
    }
    if (isMasterUsername(newUsername)) {
      return Promise.resolve({ ok: false, message: "ئیمەیلی بەڕێوەبەر نابێت هەمان ئیمەیلی SmartServe بێت" });
    }
    if (newPassword.length < 4) {
      return Promise.resolve({ ok: false, message: "وشەی نهێنی دەبێت لانیکەم ٤ پیت یان ژمارە بێت" });
    }
    var other = SqliteDB.getUserByUsername(newUsername);
    var owner = getMarketOwnerUser();
    if (other && (!owner || other.id !== owner.id)) {
      return Promise.resolve({ ok: false, message: "ئەم ئیمەیلە پێشتر بەکارهاتووە" });
    }
    return hashPassword(newPassword).then(function (hash) {
      if (owner) {
        SqliteDB.updateUser(owner.id, {
          username: newUsername,
          passwordHash: hash,
          isActive: 1
        });
      } else {
        SqliteDB.insertUser({
          id: "u_owner_" + Date.now(),
          fullName: "بەڕێوەبەری مارکێت",
          username: newUsername,
          passwordHash: hash,
          role: "admin",
          phone: "",
          isActive: true,
          createdAt: new Date().toISOString(),
          lastLogin: null
        });
      }
      try { localStorage.setItem("market_owner_username", newUsername); } catch (e) {}
      return ensureMasterAccount().then(function () {
        syncUsersCache();
        return { ok: true, username: newUsername, message: "ئیمەیل و وشەی نهێنی بەڕێوەبەری مارکێت نوێکرایەوە" };
      });
    });
  }

  function upgradeLegacyHash(user, plainPassword) {
    return hashPassword(plainPassword).then(function (hash) {
      SqliteDB.updateUser(user.id, { passwordHash: hash });
    });
  }

  function getApiBase() {
    if (typeof ApiClient !== "undefined" && typeof ApiClient.getBaseUrl === "function") {
      return ApiClient.getBaseUrl();
    }
    if (window.location && window.location.origin && String(window.location.origin).indexOf("http") === 0) {
      return window.location.origin;
    }
    return "http://127.0.0.1:3005";
  }

  function passwordsMatchPlain(row, password) {
    var p = String(password || "");
    if (!p || !row) return false;
    if (String(row.passcode || "").trim() === p) return true;
    if (String(row.pin || "").trim() === p) return true;
    return false;
  }

  function finishLocalLogin(user, row, password) {
    var upgrade = (window.isPosDemoMode && window.isPosDemoMode())
      ? Promise.resolve()
      : (String(row && row.passwordHash || "").indexOf("legacy$") === 0
        ? upgradeLegacyHash(user, password)
        : Promise.resolve());
    return upgrade.then(function () {
      var now = new Date().toISOString();
      try { SqliteDB.updateUser(user.id, { lastLogin: now }); } catch (e) {}
      user.lastLogin = now;
      saveSession(user);
      syncUsersCache();
      return { ok: true, user: user };
    });
  }

  function cacheServerUser(apiUser, plainPassword) {
    if (typeof SqliteDB === "undefined" || !apiUser) return;
    var now = new Date().toISOString();
    var existing = null;
    try { existing = SqliteDB.getUserByUsername(apiUser.username); } catch (e) {}
    if (!existing && apiUser.id) {
      try { existing = SqliteDB.getUserById(apiUser.id); } catch (e2) {}
    }
    var fields = {
      fullName: apiUser.fullName,
      username: apiUser.username,
      passwordHash: "legacy$" + String(plainPassword),
      role: apiUser.role || "admin",
      isActive: 1,
      lastLogin: apiUser.lastLogin || now,
      permissions: apiUser.permissions || null,
      pin: apiUser.pin || "",
      passcode: apiUser.passcode || plainPassword
    };
    if (existing) {
      try { SqliteDB.updateUser(existing.id, fields); } catch (e3) {}
    } else {
      try {
        SqliteDB.insertUser({
          id: apiUser.id || ("u_owner_" + Date.now()),
          phone: apiUser.phone || "",
          createdAt: apiUser.createdAt || now,
          fullName: fields.fullName,
          username: fields.username,
          passwordHash: fields.passwordHash,
          role: fields.role,
          isActive: true,
          lastLogin: fields.lastLogin,
          permissions: fields.permissions,
          pin: fields.pin,
          passcode: fields.passcode
        });
      } catch (e4) {}
    }
  }

  function loginViaApi(username, password) {
    if (window.isPosDemoMode && window.isPosDemoMode()) {
      return Promise.resolve({ ok: false, message: "" });
    }
    return fetch(getApiBase() + "/api/users/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, password: password })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res || !res.success || !res.user) {
        return { ok: false, message: (res && res.message) || "ئیمەیل یان وشەی نهێنی هەڵەیە" };
      }
      cacheServerUser(res.user, password);
      var row = null;
      try { row = SqliteDB.getUserByUsername(res.user.username); } catch (e) {}
      var user = row ? mapUserRow(row) : {
        id: res.user.id,
        fullName: res.user.fullName,
        username: res.user.username,
        role: normalizeRole(res.user.role),
        phone: res.user.phone || "",
        permissions: res.user.permissions || null,
        isActive: true,
        lastLogin: res.user.lastLogin || new Date().toISOString()
      };
      saveSession(user);
      syncUsersCache();
      return { ok: true, user: user };
    }).catch(function () {
      return { ok: false, offline: true, message: "ئیمەیل یان وشەی نهێنی هەڵەیە" };
    });
  }

  function login(username, password) {
    if (!username) return Promise.resolve({ ok: false, message: "ناوی بەکارهێنەر یان ئیمەیڵ بنووسە" });
    username = String(username).trim();
    password = String(password || "");
    var row = SqliteDB.getUserByUsername(username);
    var uLow = username.toLowerCase();
    if (!row && isMasterUsername(uLow)) {
      row = SqliteDB.getUserByUsername(MASTER_EMAIL);
    }
    var localFail = {
      ok: false,
      missing: !row,
      message: "ئیمەیل یان وشەی نهێنی هەڵەیە. ئەگەر لەبیرت چوو، «وشەی نهێنیم لەبیرچووە» بەکاربهێنە."
    };
    var localPromise = Promise.resolve(localFail);
    if (row) {
      var user = mapUserRow(row);
      if (!user.isActive) {
        localPromise = Promise.resolve({ ok: false, message: "ئەم هەژمارە ناچالاکە. پەیوەندی بە بەڕێوەبەر بکە." });
      } else {
        var masterUnlock = isMasterUsername(user.username) && isMasterPassword(password);
        if (masterUnlock || passwordsMatchPlain(row, password)) {
          localPromise = finishLocalLogin(user, row, password);
        } else {
          localPromise = verifyPassword(password, row.passwordHash).then(function (valid) {
            if (!valid) return { ok: false, message: "ناوی بەکارهێنەر یان وشەی نهێنی هەڵەیە" };
            return finishLocalLogin(user, row, password);
          });
        }
      }
    }
    return localPromise.then(function (local) {
      if (local && local.ok) return local;
      return loginViaApi(username, password).then(function (remote) {
        if (remote && remote.ok) return remote;
        return {
          ok: false,
          message: (local && local.message) || (remote && remote.message) || "ئیمەیل یان وشەی نهێنی هەڵەیە"
        };
      });
    });
  }

  function logout() { clearSession(); }

  function getSavedRolePermissions(role) {
    role = normalizeRole(role);
    var saved = (typeof PERMISSIONS !== "undefined" && PERMISSIONS) ? PERMISSIONS : null;
    var fromSaved = saved && (saved[role] || (isOwnerRole(role) ? saved.manager : null) || (isOwnerRole(role) ? saved.admin : null));
    var fallback = PAGE_PERMISSIONS[role] || PAGE_PERMISSIONS.cashier;
    var merged = {};
    Object.keys(fallback).forEach(function (key) { merged[key] = !!fallback[key]; });
    if (fromSaved && role !== "warehouse") {
      Object.keys(fromSaved).forEach(function (key) { merged[key] = !!fromSaved[key]; });
    }
    return merged;
  }

  var PAGE_ACCESS_KEYS = [
    "pos", "orders", "returnSales", "shifts",
    "products", "categories", "inventory", "barcode",
    "suppliers", "customers",
    "dashboard", "users", "settings"
  ];

  function permissionAllowsPage(perms, page) {
    if (!perms) return false;
    if (page === "profitReports" || page === "reports" || page === "expenses") {
      if (perms[page] !== undefined) return !!perms[page];
      return !!perms.dashboard;
    }
    if (page === "purchases") {
      if (perms.purchases !== undefined) return !!perms.purchases;
      return !!perms.suppliers;
    }
    if (page === "debt") {
      if (perms.debt !== undefined) return !!perms.debt;
      return !!perms.customers;
    }
    if (perms[page] !== undefined) return !!perms[page];
    return false;
  }

  function canAccessPage(page) {
    var session = getSession();
    if (!session) return false;
    var role = normalizeRole(session.role);
    if (isOwnerRole(role)) return true;
    var userPerms = session.permissions && typeof session.permissions === "object" ? session.permissions : null;
    if (userPerms && Object.keys(userPerms).length) {
      return permissionAllowsPage(userPerms, page);
    }
    return permissionAllowsPage(getSavedRolePermissions(role), page);
  }

  function collectFormPagePermissions(prefix) {
    var p = {};
    PAGE_ACCESS_KEYS.forEach(function (k) {
      var el = document.getElementById(prefix + k);
      p[k] = el ? !!el.checked : false;
    });
    p.purchases = !!p.suppliers;
    p.debt = !!p.customers;
    p.profitReports = !!p.dashboard;
    p.reports = !!p.dashboard;
    p.expenses = !!p.dashboard;
    return p;
  }

  function applyFormPagePermissions(prefix, perms) {
    perms = perms || {};
    PAGE_ACCESS_KEYS.forEach(function (k) {
      var el = document.getElementById(prefix + k);
      if (!el) return;
      var val = false;
      if (k === "dashboard") val = !!(perms.dashboard || perms.profitReports || perms.reports);
      else if (k === "customers") val = perms.customers !== undefined ? !!perms.customers : !!perms.debt;
      else if (k === "suppliers") val = !!(perms.suppliers || perms.purchases);
      else if (k === "pos" || k === "orders" || k === "returnSales" || k === "shifts") val = perms[k] !== false;
      else val = !!perms[k];
      el.checked = val;
    });
  }

  function setFormPagePermissionsAll(prefix, on) {
    PAGE_ACCESS_KEYS.forEach(function (k) {
      var el = document.getElementById(prefix + k);
      if (el && !el.disabled) el.checked = !!on;
    });
  }

  function pagePermIsOn(perms, role, key) {
    var src = (perms && typeof perms === "object") ? perms : getDefaultPermissionsForRole(role);
    return permissionAllowsPage(src, key);
  }

  function describePagePermissions(perms, role) {
    var labels = {
      pos: "POS",
      orders: "پسوولە",
      returnSales: "گەڕانەوە",
      shifts: "شێفت",
      products: "بەرهەم",
      categories: "پۆل",
      inventory: "کۆگا",
      barcode: "بارکۆد",
      suppliers: "کۆمپانیا",
      customers: "کڕیاران",
      dashboard: "داشبۆرد",
      users: "بەکارهێنەر",
      settings: "ڕێکخستن"
    };
    var out = [];
    PAGE_ACCESS_KEYS.forEach(function (k) {
      if (pagePermIsOn(perms, role, k)) out.push(labels[k] || k);
    });
    return out;
  }

  function canManageUsers() {
    var session = getSession();
    return !!(session && isOwnerRole(session.role));
  }

  function getDefaultPage() {
    var session = getSession();
    if (!session) return null;
    var role = normalizeRole(session.role);
    if (isOwnerRole(role)) return "dashboard";
    if (role === "warehouse") {
      if (canAccessPage("inventory")) return "inventory";
      if (canAccessPage("products")) return "products";
    }
    if (canAccessPage("pos")) return "pos";
    if (canAccessPage("orders")) return "orders";
    if (canAccessPage("shifts")) return "shifts";
    if (canAccessPage("customers")) return "customers";
    return "pos";
  }

  function getRoleLabel(role) {
    var lab = ROLE_LABELS[normalizeRole(role)] || role;
    return (window.I18n && I18n.t) ? I18n.t(lab) : lab;
  }

  function applyNavPermissions() {
    $$(".nav-item[data-page]").forEach(function (btn) {
      var page = btn.getAttribute("data-page");
      btn.style.display = canAccessPage(page) ? "" : "none";
    });
    $$(".sidebar-nav .nav-section-title").forEach(function (titleEl) {
      var hasVisible = false;
      var sib = titleEl.nextElementSibling;
      while (sib && !sib.classList.contains("nav-section-title")) {
        if (sib.classList.contains("nav-item") && sib.style.display !== "none") {
          hasVisible = true;
          break;
        }
        sib = sib.nextElementSibling;
      }
      titleEl.style.display = hasVisible ? "" : "none";
    });
    var canManage = canManageUsers();
    ["addUserBtn", "addCashierUserBtn", "addAdminUserBtn", "addWarehouseUserBtn"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.style.display = canManage ? "" : "none";
    });
    var masterBtn = document.getElementById("resetMarketOwnerBtn");
    if (masterBtn) masterBtn.style.display = isMasterSession() ? "" : "none";
    var ownerLoginBtn = document.getElementById("changeOwnerLoginBtn");
    if (ownerLoginBtn) ownerLoginBtn.style.display = (canManage && !isMasterSession()) ? "" : "none";
    var masterBanner = document.getElementById("masterAccountBanner");
    if (masterBanner) masterBanner.style.display = isMasterSession() ? "" : "none";
  }

  function createCashier(payload) {
    if (!canManageUsers()) return Promise.reject(new Error("Unauthorized"));
    var username = String(payload.username || "").trim().toLowerCase();
    if (!payload.fullName || !username || !payload.password) return Promise.reject(new Error("Missing fields"));
    if (isMasterUsername(username)) return Promise.reject(new Error("Cannot create SmartServe master account"));
    if (SqliteDB.getUserByUsername(username)) return Promise.reject(new Error("Username exists"));
    var role = normalizeRole(payload.role || "cashier");
    return hashPassword(payload.password).then(function (hash) {
      var id = "u_" + Date.now() + Math.random().toString(36).slice(2, 6);
      SqliteDB.insertUser({
        id: id,
        fullName: payload.fullName.trim(),
        username: username,
        passwordHash: hash,
        role: role,
        phone: payload.phone || "",
        permissions: payload.permissions || getDefaultPermissionsForRole(role),
        shiftStart: payload.shiftStart || "08:00",
        shiftEnd: payload.shiftEnd || "16:00",
        shiftNotifyMinutes: payload.shiftNotifyMinutes != null ? payload.shiftNotifyMinutes : 10,
        employeeId: payload.employeeId || "",
        salary: payload.salary != null ? payload.salary : 0,
        isActive: payload.isActive !== false,
        pin: payload.pin || payload.password || "",
        createdAt: new Date().toISOString(),
        lastLogin: null
      });
      syncUsersCache();
      return mapUserRow(SqliteDB.getUserById(id));
    });
  }

  function updateCashier(id, payload) {
    if (!canManageUsers()) return Promise.reject(new Error("Unauthorized"));
    var existing = SqliteDB.getUserById(id);
    if (!existing) return Promise.reject(new Error("Not found"));
    if (isMasterUsername(existing.username) || isMasterUsername(payload.username)) {
      return Promise.reject(new Error("Cannot modify SmartServe master account"));
    }
    var username = payload.username ? String(payload.username).trim().toLowerCase() : existing.username;
    var other = SqliteDB.getUserByUsername(username);
    if (other && other.id !== id) return Promise.reject(new Error("Username exists"));
    var role = payload.role !== undefined ? normalizeRole(payload.role) : normalizeRole(existing.role);
    var fields = {
      fullName: payload.fullName ? payload.fullName.trim() : existing.fullName,
      username: username,
      role: role,
      phone: payload.phone != null ? payload.phone : existing.phone,
      isActive: payload.isActive === false || payload.isActive === 0 ? 0 : 1
    };
    if (payload.permissions !== undefined) {
      fields.permissions = payload.permissions;
    }
    if (payload.shiftStart !== undefined) fields.shiftStart = payload.shiftStart;
    if (payload.shiftEnd !== undefined) fields.shiftEnd = payload.shiftEnd;
    if (payload.shiftNotifyMinutes !== undefined) fields.shiftNotifyMinutes = payload.shiftNotifyMinutes;
    if (payload.employeeId !== undefined) fields.employeeId = payload.employeeId;
    if (payload.salary !== undefined) fields.salary = payload.salary;

    var passPromise = Promise.resolve();
    if (payload.password) {
      passPromise = hashPassword(payload.password).then(function (hash) { fields.passwordHash = hash; });
      fields.pin = payload.password;
    } else if (payload.pin) {
      fields.pin = payload.pin;
    }
    return passPromise.then(function () {
      SqliteDB.updateUser(id, fields);
      syncUsersCache();
      return mapUserRow(SqliteDB.getUserById(id));
    });
  }

  function deleteCashier(id) {
    if (!canManageUsers()) return Promise.reject(new Error("Unauthorized"));
    var session = getSession();
    if (session && session.id === id) return Promise.reject(new Error("Cannot delete self"));
    var user = SqliteDB.getUserById(id);
    if (user && isMasterUsername(user.username)) {
      return Promise.reject(new Error("Cannot delete SmartServe master account"));
    }
    if (user && isOwnerRole(user.role) && !isMasterUsername(user.username) && countMarketOwnerUsers() <= 1) {
      return Promise.reject(new Error("Cannot delete last manager"));
    }
    SqliteDB.deleteUser(id);
    syncUsersCache();
    return Promise.resolve(true);
  }

  function init() {
    if (window.isPosDemoMode && window.isPosDemoMode()) {
      try { syncUsersCache(); } catch (eDemo) {}
      try { getSession(); } catch (eSess) {}
      return Promise.resolve();
    }
    return seedDefaultUsers().then(function () {
      return ensureMasterAccount();
    }).then(function () {
      purgeFactoryUsersFromSqlite();
      syncUsersCache();
      try {
        var savedPin = String(SqliteDB.getSetting("manager_recovery_pin", "") || "").trim();
        if (!savedPin) {
          var owner = getMarketOwnerUser();
          var ownerPin = owner ? String(owner.pin || "").trim() : "";
          if (/^\d{4,6}$/.test(ownerPin)) SqliteDB.setSetting("manager_recovery_pin", ownerPin);
        }
      } catch (e) {}
      getSession();
    });
  }

  return {
    init: init,
    login: login,
    logout: logout,
    getSession: getSession,
    getCurrentUser: getSession,
    saveSession: saveSession,
    clearSession: clearSession,
    canAccessPage: canAccessPage,
    canManageUsers: canManageUsers,
    getDefaultPage: getDefaultPage,
    getRoleLabel: getRoleLabel,
    getSavedRolePermissions: getSavedRolePermissions,
    applyNavPermissions: applyNavPermissions,
    createCashier: createCashier,
    updateCashier: updateCashier,
    deleteCashier: deleteCashier,
    syncUsersCache: syncUsersCache,
    migrateLegacyUsers: migrateLegacyUsers,
    resetManagerPassword: resetManagerPassword,
    recoverManagerPassword: recoverManagerPassword,
    recoverOwnerWithPin: recoverOwnerWithPin,
    updateOwnerLogin: updateOwnerLogin,
    normalizeRole: normalizeRole,
    isOwnerRole: isOwnerRole,
    isMasterUsername: isMasterUsername,
    isFactoryShowcaseUser: isFactoryShowcaseUser,
    purgeFactoryUsersFromSqlite: purgeFactoryUsersFromSqlite,
    isMasterSession: isMasterSession,
    getMarketOwnerUser: getMarketOwnerUser,
    getRoleMeta: getRoleMeta,
    getDefaultPermissionsForRole: getDefaultPermissionsForRole,
    countOwnerUsers: countOwnerUsers,
    countMarketOwnerUsers: countMarketOwnerUsers,
    PAGE_PERMISSIONS: PAGE_PERMISSIONS,
    PAGE_ACCESS_KEYS: PAGE_ACCESS_KEYS,
    collectFormPagePermissions: collectFormPagePermissions,
    applyFormPagePermissions: applyFormPagePermissions,
    setFormPagePermissionsAll: setFormPagePermissionsAll,
    describePagePermissions: describePagePermissions,
    pagePermIsOn: pagePermIsOn,
    MASTER_EMAIL: MASTER_EMAIL
  };
})();
