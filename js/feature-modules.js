/* ═══════════════════════════════════════════════════════════════════
   SAM MARKET POS — ENTERPRISE FEATURE MODULES MANAGER
   Enables turning POS features ON/OFF per client (Market, Retail, Cafe)
   ═══════════════════════════════════════════════════════════════════ */

var FeatureModules = (function () {
  var DEFAULT_MODULES = {
    enableScale: true,          // تەرازووی ئەلەکترۆنی
    enableCarton: true,         // فرۆشتنی کارتۆن و باڕکۆدی کارتۆن
    enableDebt: true,           // قەرز
    enableExpiry: true,         // بەسەرچوون
    enableCustomerDisplay: true,// شاشەی دووەمی کڕیار (F9)
    enableKitchen: false,       // چێشتخانە و چاپ بۆ مەتبەخ
    enablePurchases: true,      // کڕین و دابینکەران
    enableExpenses: true,       // خەرجییەکان
    enableHandover: true,       // تەسلیمکردنی سندوقی ٢٤ کاتژمێر
    enableAutoUsbBackup: true   // باکئەپی خودکار بۆ فلاش لە کاتی داخستنی شێفت
  };

  function getActiveModules() {
    if (!window.DB) window.DB = {};
    if (!DB.settings) DB.settings = {};
    if (!DB.settings.modules) {
      DB.settings.modules = Object.assign({}, DEFAULT_MODULES);
    }
    return DB.settings.modules;
  }

  // Apply visibility across entire application based on active toggles
  function applyModules() {
    var mods = getActiveModules();

    // 1. Scale Barcode & Scale Modals
    toggleElement("#headerScaleBtn", mods.enableScale);
    toggleElement("#posToolbarScaleBtn", mods.enableScale);
    toggleBySelector('[data-feature="scale"]', mods.enableScale);
    toggleElement("#prodIsScaleItemWrap", mods.enableScale);
    toggleElement("#prodScaleCodeWrap", mods.enableScale);

    // 2. Carton / Pack Barcodes
    toggleBySelector('[data-feature="carton"]', mods.enableCarton);
    toggleElement("#prodPackBarcodeWrap", mods.enableCarton);
    toggleElement("#prodPackQtyWrap", mods.enableCarton);

    // 3. Debt Management
    toggleBySelector('[data-cust-hub-tab="debt"]', mods.enableDebt);
    toggleElement("#custHubTabDebt", mods.enableDebt);
    toggleElement("#headerDebtTabBtn", mods.enableDebt);
    toggleElement("#payDebtBtn", mods.enableDebt);
    toggleElement("#debtPrintBtn", mods.enableDebt);
    toggleBySelector('[data-feature="debt"]', mods.enableDebt);

    // 4. Expiry Tracking
    toggleElement("#headerExpiryBadge", mods.enableExpiry);
    var expCard = document.getElementById("expiringSoonList");
    if (expCard) {
      var cardParent = expCard.closest(".chart-card");
      if (cardParent) cardParent.style.display = mods.enableExpiry ? "" : "none";
    }
    toggleBySelector('[data-feature="expiry"]', mods.enableExpiry);

    // 5. Customer Display (Dual Screen)
    toggleElement("#headerCustomerDispBtn", mods.enableCustomerDisplay);
    toggleBySelector('[data-feature="customerDisplay"]', mods.enableCustomerDisplay);

    // 6. Kitchen Orders & Ticket Printing
    toggleBySelector('[data-feature="kitchen"]', mods.enableKitchen);

    // 7. Purchases & Suppliers
    toggleBySelector('button[data-page="purchases"]', mods.enablePurchases);
    toggleBySelector('button[data-page="suppliers"]', mods.enablePurchases);
    toggleBySelector('[data-feature="purchases"]', mods.enablePurchases);

    // 8. Expenses
    toggleBySelector('button[data-page="expenses"]', mods.enableExpenses);
    toggleBySelector('[data-feature="expenses"]', mods.enableExpenses);

    // 9. 24/7 Cash Handover
    toggleElement("#headerHandoverTabBtn", mods.enableHandover);
    toggleBySelector('button[data-shift-tab="handover"]', mods.enableHandover);
    toggleBySelector('[data-feature="handover"]', mods.enableHandover);

    // Sync state into settings checkboxes if on settings page
    syncCheckboxesToState();
    if (window.CashierButtons && typeof CashierButtons.apply === "function") {
      try { CashierButtons.apply(); } catch (eCb) {}
    }
  }

  function toggleElement(idOrSelector, isVisible) {
    var el = typeof idOrSelector === "string" && idOrSelector.startsWith("#")
      ? document.getElementById(idOrSelector.slice(1))
      : document.querySelector(idOrSelector);
    if (el) {
      el.style.display = isVisible ? "" : "none";
    }
  }

  function toggleBySelector(selector, isVisible) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.style.display = isVisible ? "" : "none";
    });
  }

  // Sync checkboxes in Settings UI to current memory state
  function syncCheckboxesToState() {
    var mods = getActiveModules();
    setCheckbox("modToggleScale", mods.enableScale);
    setCheckbox("modToggleCarton", mods.enableCarton);
    setCheckbox("modToggleDebt", mods.enableDebt);
    setCheckbox("modToggleExpiry", mods.enableExpiry);
    setCheckbox("modToggleCustomerDisplay", mods.enableCustomerDisplay);
    setCheckbox("modToggleKitchen", mods.enableKitchen);
    setCheckbox("modTogglePurchases", mods.enablePurchases);
    setCheckbox("modToggleExpenses", mods.enableExpenses);
    setCheckbox("modToggleHandover", mods.enableHandover);
    setCheckbox("modToggleAutoUsbBackup", (typeof mods.enableAutoUsbBackup !== "undefined") ? mods.enableAutoUsbBackup : true);
  }

  function setCheckbox(id, checked) {
    var cb = document.getElementById(id);
    if (cb) cb.checked = !!checked;
  }

  function getCheckbox(id, fallback) {
    var cb = document.getElementById(id);
    return cb ? cb.checked : fallback;
  }

  // Save from UI checkboxes
  function saveFromUI() {
    var mods = {
      enableScale: getCheckbox("modToggleScale", true),
      enableCarton: getCheckbox("modToggleCarton", true),
      enableDebt: getCheckbox("modToggleDebt", true),
      enableExpiry: getCheckbox("modToggleExpiry", true),
      enableCustomerDisplay: getCheckbox("modToggleCustomerDisplay", true),
      enableKitchen: getCheckbox("modToggleKitchen", false),
      enablePurchases: getCheckbox("modTogglePurchases", true),
      enableExpenses: getCheckbox("modToggleExpenses", true),
      enableHandover: getCheckbox("modToggleHandover", true),
      enableAutoUsbBackup: getCheckbox("modToggleAutoUsbBackup", true)
    };

    if (!window.DB) window.DB = {};
    if (!DB.settings) DB.settings = {};
    DB.settings.modules = mods;

    // Persist
    if (typeof DataStore !== "undefined" && DataStore.saveSettings) {
      DataStore.saveSettings();
    }
    if (typeof ApiClient !== "undefined" && ApiClient.saveSetting) {
      ApiClient.saveSetting("modules", JSON.stringify(mods)).catch(function () {});
    }

    applyModules();
    toast("سەرکەوتوو", "تایبەتمەندییە چالاکەکان بە سەرکەوتوویی پاشەکەوت کران", "success");
  }

  // Business Type Presets
  function applyPreset(presetType) {
    var p = {};
    if (presetType === "supermarket") {
      p = {
        enableScale: true,
        enableCarton: true,
        enableDebt: true,
        enableExpiry: true,
        enableCustomerDisplay: true,
        enableKitchen: false,
        enablePurchases: true,
        enableExpenses: true,
        enableHandover: true
      };
      toast("مۆدیلی سوپەرمارکێت", "هەموو تایبەتمەندییە گەورەکان (تەرازوو، کارتۆن، سندوق) چالاککران", "info");
    } else if (presetType === "retail") {
      p = {
        enableScale: false,
        enableCarton: false,
        enableDebt: true,
        enableExpiry: false,
        enableCustomerDisplay: false,
        enableKitchen: false,
        enablePurchases: true,
        enableExpenses: true,
        enableHandover: false
      };
      toast("مۆدیلی مارکێتی سادە", "ڕووکارەکە سادە و سووک کرا (تەرازوو و کارتۆن و شاشەی دووەم کوژانەوە)", "info");
    } else if (presetType === "restaurant") {
      p = {
        enableScale: false,
        enableCarton: false,
        enableDebt: true,
        enableExpiry: false,
        enableCustomerDisplay: true,
        enableKitchen: true,
        enablePurchases: true,
        enableExpenses: true,
        enableHandover: false
      };
      toast("مۆدیلی چێشتخانە و کافێ", "بەشی چێشتخانە و چاپی مەتبەخ چالاککرا", "info");
    } else if (presetType === "boutique") {
      p = {
        enableScale: false,
        enableCarton: false,
        enableDebt: true,
        enableExpiry: false,
        enableCustomerDisplay: false,
        enableKitchen: false,
        enablePurchases: false,
        enableExpenses: true,
        enableHandover: false
      };
      toast("مۆدیلی دوکانی پۆشاک", "ڕووکار تەنها بۆ فرۆشتن و سەبەتە و کۆگا ڕێکخرا", "info");
    }

    if (!window.DB) window.DB = {};
    if (!DB.settings) DB.settings = {};
    DB.settings.modules = p;

    syncCheckboxesToState();
    saveFromUI();
  }

  return {
    getActiveModules: getActiveModules,
    applyModules: applyModules,
    saveFromUI: saveFromUI,
    applyPreset: applyPreset
  };
})();

// Global shortcuts
window.FeatureModules = FeatureModules;
window.applyFeatureModules = FeatureModules.applyModules;
window.saveFeatureModulesSettings = FeatureModules.saveFromUI;
window.applyBusinessPreset = FeatureModules.applyPreset;
