/* Smart-Serve POS — browser demo (no Node sqlite, no live shop DB) */
(function (window) {
  var DEMO_PIN = "0000";
  var DEMO_USER = "demo";

  function isPosDemoMode() {
    if (window.POS_DESKTOP) return false;
    if (window.POS_DEMO_FORCE === true) return true;
    try {
      var path = String(window.location.pathname || "");
      var search = String(window.location.search || "");
      if (/(?:^|[?&])demo=1(?:&|$)/.test(search)) return true;
      if (/\/demo(?:\/|$)/i.test(path)) return true;
      if (/demo\.html$/i.test(path)) return true;
    } catch (e) {}
    return false;
  }

  function demoStorageKey(key) {
    return isPosDemoMode() ? String(key) + "_demo" : String(key);
  }

  function ensureUsers() {
    if (!isPosDemoMode() || typeof SqliteDB === "undefined") return;
    var now = new Date().toISOString();
    function upsert(user) {
      var existing = SqliteDB.getUserByUsername(user.username) || SqliteDB.getUserById(user.id);
      if (existing) {
        try {
          SqliteDB.updateUser(existing.id, {
            fullName: user.fullName,
            pin: DEMO_PIN,
            passcode: DEMO_PIN,
            isActive: 1,
            role: user.role
          });
        } catch (eU) {}
        return;
      }
      try {
        SqliteDB.insertUser({
          id: user.id,
          fullName: user.fullName,
          username: user.username,
          passwordHash: "legacy$" + DEMO_PIN,
          role: user.role,
          phone: "",
          pin: DEMO_PIN,
          passcode: DEMO_PIN,
          isActive: true,
          createdAt: now,
          lastLogin: null
        });
      } catch (eI) {}
    }
    upsert({
      id: "u_demo_manager",
      username: DEMO_USER,
      fullName: "بەڕێوەبەری دیمۆ",
      role: "manager"
    });
    upsert({
      id: "u_demo_cashier",
      username: "cashier",
      fullName: "کاشیری دیمۆ",
      role: "cashier"
    });
    try {
      if (typeof AuthService !== "undefined" && AuthService.syncUsersCache) AuthService.syncUsersCache();
    } catch (eS) {}
  }

  function applyDemoSettings() {
    if (!isPosDemoMode() || typeof DB === "undefined") return;
    if (!DB.settings) DB.settings = {};
    if (!DB.settings.marketName || !String(DB.settings.marketName).trim()) {
      DB.settings.marketName = "مارکێتی دیمۆ";
    }
    DB.settings.receiptFooter = DB.settings.receiptFooter || "دیمۆی Smart-Serve POS — فرۆشتنی ڕاستەقینە نییە";
    DB.settings.phone = DB.settings.phone || "0750 000 0000";
    DB.settings.address = DB.settings.address || "هەولێر — دیمۆ";
    try {
      if (typeof DataStore !== "undefined" && DataStore.saveSettings) DataStore.saveSettings();
    } catch (e) {}
    try {
      if (typeof updateMarketBrandUI === "function") updateMarketBrandUI();
    } catch (e2) {}
  }

  function seedIfEmpty() {
    if (!isPosDemoMode()) return;
    if (typeof seedCategories === "function") seedCategories();
    if (typeof seedData === "function") seedData();
    applyDemoSettings();
    ensureUsers();
  }

  function resetDemo() {
    if (!isPosDemoMode()) return;
    window.__POS_DEMO_RESETTING = true;
    try {
      if (typeof AuthService !== "undefined" && AuthService.clearSession) AuthService.clearSession();
    } catch (eS) {}
    try {
      if (typeof SqliteDB !== "undefined" && SqliteDB.persistNow) {
        SqliteDB.persistNow = function () { return false; };
      }
    } catch (eP) {}
    try { localStorage.removeItem("sm_sqlite_db_demo"); } catch (e) {}
    try { localStorage.removeItem("market_pos_active_session_demo"); } catch (e2) {}
    try { localStorage.removeItem("sm_pos_keep_login_demo"); } catch (e3) {}
    window.location.reload();
  }

  function decorateLogin() {
    if (!isPosDemoMode()) return;
    var hint = document.getElementById("posDemoLoginHint");
    if (hint) hint.hidden = false;
    var user = document.getElementById("loginUsername");
    if (user && !user.value) user.value = DEMO_USER;
    var pass = document.getElementById("loginPass");
    if (pass) pass.setAttribute("placeholder", DEMO_PIN);
  }

  function mountBanner() {
    if (!isPosDemoMode()) return;
    document.documentElement.classList.add("pos-demo-mode");
    if (document.getElementById("posDemoBanner")) {
      decorateLogin();
      return;
    }
    var bar = document.createElement("div");
    bar.id = "posDemoBanner";
    bar.className = "pos-demo-banner";
    bar.innerHTML =
      '<span><strong>دیمۆی Smart-Serve POS</strong> — فرۆشتنی ڕاستەقینە نییە. کاڵاکان نموونەن. چاپکەری تێرمال لە وەشانی دێسکتۆپ کار دەکات.</span>' +
      '<span class="pos-demo-creds">چوونەژوورەوە: <b>demo</b> / PIN <b>' + DEMO_PIN + "</b></span>" +
      '<nav class="pos-demo-pages" aria-label="پەڕەکانی دیمۆ">' +
        '<button type="button" data-demo-page="dashboard">داشبۆرد</button>' +
        '<button type="button" data-demo-page="pos">کاشێر</button>' +
        '<button type="button" data-demo-page="products">کاڵا</button>' +
        '<button type="button" data-demo-page="orders">پسووڵە</button>' +
        '<button type="button" data-demo-page="customers">کڕیار</button>' +
        '<button type="button" data-demo-page="users">بەکارهێنەر</button>' +
        '<button type="button" data-demo-page="settings">ڕێکخستن</button>' +
      "</nav>" +
      '<button type="button" class="pos-demo-reset" id="posDemoResetBtn">گەڕانەوە بۆ سەرەتا</button>';
    document.body.insertBefore(bar, document.body.firstChild);
    var btn = document.getElementById("posDemoResetBtn");
    if (btn) btn.addEventListener("click", resetDemo);
    bar.querySelectorAll("[data-demo-page]").forEach(function (pageBtn) {
      pageBtn.addEventListener("click", function () {
        var page = pageBtn.getAttribute("data-demo-page");
        var sess = (typeof AuthService !== "undefined" && AuthService.getSession) ? AuthService.getSession() : null;
        if (!sess) {
          if (typeof toast === "function") toast("دیمۆ", "سەرەتا demo / 0000 بنووسە", "info");
          return;
        }
        if (typeof switchSection === "function") switchSection(page);
      });
    });
    decorateLogin();
  }

  window.isPosDemoMode = isPosDemoMode;
  window.demoStorageKey = demoStorageKey;
  window.PosDemo = {
    isActive: isPosDemoMode,
    pin: DEMO_PIN,
    username: DEMO_USER,
    storageKey: demoStorageKey,
    seedIfEmpty: seedIfEmpty,
    ensureUsers: ensureUsers,
    reset: resetDemo,
    mountBanner: mountBanner
  };

  if (isPosDemoMode()) {
    try { document.documentElement.classList.add("pos-demo-mode"); } catch (e) {}
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountBanner);
    } else {
      mountBanner();
    }
  }
})(window);
