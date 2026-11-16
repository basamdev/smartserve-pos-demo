var DB = {
  products: [],
  orders: [],
  categories: [],
  settings: null,
  currentUser: null,
  users: [],
  debts: [],
  shifts: [],
  expenses: [],
  suspendedSales: [],
  suppliers: [],
  purchases: [],
  customers: []
};

var CART = [];
var EDIT_PRODUCT_ID = null;
var EDIT_CATEGORY_ID = null;
var DELETE_CALLBACK = null;
var SELECTED_PRODUCT_IDS = {};
var SELECTED_CATEGORY_IDS = {};
var SHOW_INCOMPLETE_POS_ONLY = false;
var DASH_CHARTS = {};
var LAST_ORDER = null;
var PENDING_DEBT = null;
var CURRENT_SHIFT = null;
var CUSTOMER_QUEUE = { default: { name: "کڕیار 1", cart: [] } };
var ACTIVE_CUSTOMER = "default";
var APP_READY = false;
var WEIGHTED_PRODUCT = null;

function confirmWeightedProduct() {
  if (!WEIGHTED_PRODUCT) return;
  var wi = $("#weightInput");
  var weight = parseFloat(wi ? wi.value : 0);
  if (isNaN(weight) || weight <= 0) {
    toast("هەڵە", "تکایە کێشی دروست داخڵ بکە (بۆ نموونە: 1.5 یان 0.5)", "error");
    return;
  }
  var prod = WEIGHTED_PRODUCT;
  var cwi = $("#cartWeightInput");
  if (cwi) cwi.style.display = "none";
  if (wi) wi.value = "";
  WEIGHTED_PRODUCT = null;

  // If unit is gram and user entered grams (e.g. 500) while price is per kg, or direct qty in prod.unit
  addToCart(prod.id, Math.round(weight * 1000) / 1000, 'piece');
}

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }
function fmt(n) { return Number(n || 0).toLocaleString("en-US") + " د.ع"; }

function pad2(n) { return (n < 10 ? "0" : "") + n; }

function parseSaleDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  var d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function localYmd(d) {
  var dt = (d instanceof Date) ? d : parseSaleDate(d);
  if (!dt || isNaN(dt.getTime())) return "";
  return dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate());
}

function formatSaleTime(raw, withSeconds) {
  var d = parseSaleDate(raw);
  if (!d) return "-";
  var hours = d.getHours();
  var ampm = hours >= 12 ? "PM" : "AM";
  var h = hours % 12;
  if (h === 0) h = 12;
  var out = pad2(h) + ":" + pad2(d.getMinutes());
  if (withSeconds) out += ":" + pad2(d.getSeconds());
  return out + " " + ampm;
}

function formatSaleDateTime(raw, withSeconds) {
  var d = parseSaleDate(raw);
  if (!d) return "-";
  return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear() + "  " + formatSaleTime(d, withSeconds);
}
window.formatSaleTime = formatSaleTime;
window.formatSaleDateTime = formatSaleDateTime;

function isFactoryBrandName(name) {
  var n = String(name || "").trim().replace(/\s+/g, " ");
  if (!n) return true;
  var lower = n.toLowerCase();
  return n === "سام مارکێت" || n === "سام مارکيت" ||
         lower === "sam market" || lower === "sam-market" ||
         lower.indexOf("سام مارکێت") !== -1 ||
         lower.indexOf("sam market") !== -1;
}

function getStoreName(fallback) {
  if (typeof BranchManager !== "undefined" && BranchManager.receiptName) {
    var fromBranch = BranchManager.receiptName();
    if (fromBranch) return fromBranch;
  }
  var input = document.getElementById("setMarketName");
  var fromInput = input && input.value ? String(input.value).trim() : "";
  var fromDb = (typeof DB !== "undefined" && DB.settings && DB.settings.marketName)
    ? String(DB.settings.marketName).trim() : "";
  if (fromInput && !isFactoryBrandName(fromInput)) return fromInput;
  if (fromDb && !isFactoryBrandName(fromDb)) return fromDb;
  return fallback !== undefined ? fallback : "مارکێت";
}

function syncStoreNameToServer(name) {
  if (window.isPosDemoMode && window.isPosDemoMode()) return;
  try {
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketName: name || "" })
    }).catch(function () {});
  } catch (e) {}
}

function syncReceiptSettingsToServer() {
  if (window.isPosDemoMode && window.isPosDemoMode()) return;
  var s = (typeof DB !== "undefined" && DB.settings) ? DB.settings : {};
  try {
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketName: s.marketName || "",
        marketTagline: s.marketTagline || "",
        phone: s.phone || "",
        address: s.address || "",
        receiptHeader: s.receiptHeader || "",
        receiptFooter: s.receiptFooter || "",
        language: s.language || "ku",
        receiptStyle: s.receiptStyle || "",
        receiptColors: s.receiptColors || null
      })
    }).catch(function () {});
  } catch (e) {}
}

function clearFactoryBrandIfNeeded() {
  if (typeof DB === "undefined" || !DB.settings) return;
  if (!isFactoryBrandName(DB.settings.marketName)) return;
  DB.settings.marketName = "";
  if (typeof DataStore !== "undefined" && DataStore.saveSettings) DataStore.saveSettings();
  syncStoreNameToServer("");
}
function gid() { return "id_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8); }

function padBillNo(n) {
  var s = String(parseInt(n, 10) || 0);
  if (s === "NaN") s = "0";
  while (s.length < 5) s = "0" + s;
  if (s.length > 5) s = s.slice(-5);
  return s;
}

function orderBillNo(order) {
  if (!order) return "";
  if (order.billNo != null && String(order.billNo).trim() !== "") return padBillNo(order.billNo);
  return "";
}

function orderBillBarcode(order) {
  return "B" + padBillNo(orderBillNo(order) || "0");
}

function parseBillScanCode(code) {
  var s = String(code == null ? "" : code).trim().toUpperCase();
  s = s.replace(/[\s\-*]/g, "");
  var m = s.match(/^B(\d{1,5})$/);
  if (m) return padBillNo(m[1]);
  if (/^\d{1,5}$/.test(s)) return padBillNo(s);
  return "";
}

function findOrderByBillScan(code) {
  var raw = String(code == null ? "" : code).trim();
  var upper = raw.toUpperCase();
  var bill = parseBillScanCode(raw);
  var orders = (typeof DB !== "undefined" && DB.orders) ? DB.orders : [];
  var i;
  for (i = 0; i < orders.length; i++) {
    var o = orders[i];
    if (!o) continue;
    if (String(o.id) === raw || String(o.id).toUpperCase() === upper) return o;
    if (bill && padBillNo(o.billNo) === bill) return o;
    if (orderBillBarcode(o).toUpperCase() === upper) return o;
    if (o.id && String(o.id).slice(-8).toUpperCase() === upper) return o;
  }
  return null;
}

function nextBillNo() {
  var max = 0;
  try { max = parseInt(DB.settings && DB.settings.lastBillNo, 10) || 0; } catch (e1) { max = 0; }
  (DB.orders || []).forEach(function (o) {
    var n = parseInt(o.billNo, 10);
    if (n > max) max = n;
  });
  var n = max + 1;
  if (n < 1) n = 1;
  if (n > 99999) n = 1;
  DB.settings = DB.settings || {};
  DB.settings.lastBillNo = n;
  try {
    if (typeof DataStore !== "undefined" && DataStore.saveSettings) DataStore.saveSettings();
  } catch (e2) {}
  return padBillNo(n);
}

function stampOrderBillNo(order) {
  if (!order) return order;
  if (!order.billNo) order.billNo = nextBillNo();
  else order.billNo = padBillNo(order.billNo);
  return order;
}

function migrateOrderBillNumbers() {
  if (!DB || !Array.isArray(DB.orders) || !DB.orders.length) return;
  var orders = DB.orders.slice().sort(function (a, b) {
    return String(a.date || "").localeCompare(String(b.date || ""));
  });
  var max = 0;
  var changed = false;
  orders.forEach(function (o) {
    if (!o || !o.billNo) return;
    var padded = padBillNo(o.billNo);
    if (String(o.billNo) !== padded) {
      o.billNo = padded;
      changed = true;
    }
    var n = parseInt(padded, 10);
    if (n > max) max = n;
  });
  orders.forEach(function (o) {
    if (!o || o.billNo) return;
    max += 1;
    if (max > 99999) max = 1;
    o.billNo = padBillNo(max);
    changed = true;
  });
  if (!changed) {
    DB.settings = DB.settings || {};
    if (!DB.settings.lastBillNo) DB.settings.lastBillNo = max;
    return;
  }
  DB.settings = DB.settings || {};
  DB.settings.lastBillNo = max;
  try { if (typeof DataStore !== "undefined" && DataStore.saveOrders) DataStore.saveOrders(); } catch (e3) {}
  try { if (typeof DataStore !== "undefined" && DataStore.saveSettings) DataStore.saveSettings(); } catch (e4) {}
}

function copyOrderBillNo(num, ev) {
  if (ev) {
    ev.preventDefault();
    ev.stopPropagation();
  }
  num = padBillNo(num);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(num);
    }
  } catch (eCopy) {}
  try {
    var t = ev && ev.currentTarget;
    if (t && window.getSelection) {
      var range = document.createRange();
      range.selectNodeContents(t);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch (eSel) {}
}

function isOrdersPageActive() {
  if (window.CURRENT_PAGE === "orders") return true;
  var sec = document.getElementById("ordersSection");
  return !!(sec && (sec.classList.contains("active") || sec.classList.contains("show")));
}

function fillOrdersSearchFromScan(code) {
  if (!isOrdersPageActive()) return false;
  code = String(code || "").trim();
  if (!code) return false;
  var display = parseBillScanCode(code) || code;
  var inp = document.getElementById("ordersSearchInput");
  if (inp) inp.value = display;
  ORDERS_SEARCH_QUERY = display;
  if (typeof renderOrders === "function") renderOrders();
  var hit = findOrderByBillScan(code);
  if (window.PosScanGuard) window.PosScanGuard.markScanned();
  if (hit && typeof openOrderDetailModal === "function") openOrderDetailModal(hit.id);
  return true;
}

window.padBillNo = padBillNo;
window.orderBillNo = orderBillNo;
window.orderBillBarcode = orderBillBarcode;
window.parseBillScanCode = parseBillScanCode;
window.findOrderByBillScan = findOrderByBillScan;
window.stampOrderBillNo = stampOrderBillNo;
window.copyOrderBillNo = copyOrderBillNo;
window.fillOrdersSearchFromScan = fillOrdersSearchFromScan;

function toast(title, msg, type, important) {
  type = type || "info";
  if (type !== "error" && type !== "warning" && important !== true) return;
  var c = $("#toastContainer");
  if (!c) return;
  if (window.I18n) {
    title = I18n.t(title);
    if (msg) msg = I18n.t(msg);
  }
  var d = document.createElement("div");
  d.className = "toast " + type;
  d.innerHTML = '<i class="fas fa-' + (type === "success" ? "check-circle" : type === "error" ? "times-circle" : type === "warning" ? "exclamation-triangle" : "info-circle") + '"></i><div class="toast-content"><div class="toast-title">' + title + '</div><div class="toast-msg">' + (msg || "") + '</div></div><button class="toast-close" onclick="this.parentElement.remove()">&times;</button>';
  c.appendChild(d);
  setTimeout(function () { if (d.parentNode) d.remove(); }, 4000);
}

function showModal(id) {
  var m = document.getElementById(id);
  if (!m) return;
  try {
    if (document.body) document.body.appendChild(m);
  } catch (e) {}
  m.style.removeProperty("display");
  m.style.setProperty("position", "fixed", "important");
  m.style.setProperty("top", "0", "important");
  m.style.setProperty("left", "0", "important");
  m.style.setProperty("right", "0", "important");
  m.style.setProperty("bottom", "0", "important");
  m.style.setProperty("width", "100vw", "important");
  m.style.setProperty("height", "100vh", "important");
  m.style.setProperty("margin", "0", "important");
  m.style.setProperty("transform", "none", "important");
  m.style.setProperty("align-items", "center", "important");
  m.style.setProperty("justify-content", "center", "important");
  var stackZ = 999999;
  try {
    document.querySelectorAll(".modal-overlay.active").forEach(function (el) {
      if (el === m) return;
      var z = parseInt(window.getComputedStyle(el).zIndex, 10);
      if (!isNaN(z) && z >= stackZ) stackZ = z + 2;
    });
  } catch (eZ) {}
  m.style.setProperty("z-index", String(stackZ), "important");
  m.classList.add("active");
  if (typeof syncDesktopModalFlag === "function") syncDesktopModalFlag();
  if (window.I18n && typeof I18n.apply === "function") {
    try { I18n.apply(m); } catch (eModalI18) {}
  }
  if (m.getAttribute("data-skip-autofocus") === "1") return;
  var input = m.querySelector("input:not([type=hidden]):not([data-autofill-trap]), select, textarea");
  if (input) {
    setTimeout(function () {
      try { input.focus(); if (input.select) input.select(); } catch (e) {}
    }, 60);
  }
}

function syncDesktopModalFlag() {
  try {
    if (window.POS_DESKTOP && typeof window.POS_DESKTOP.setModalOpen === "function") {
      window.POS_DESKTOP.setModalOpen(!!document.querySelector(".modal-overlay.active"));
    }
  } catch (eFlag) {}
}

function hideModal(id) {
  var m = document.getElementById(id);
  if (!m) return;
  m.classList.remove("active");
  m.style.removeProperty("display");
  if (typeof syncDesktopModalFlag === "function") syncDesktopModalFlag();
  if (id === "forgotPasswordModal") {
    clearForgotPasswordFields();
    hideLoginCredentials();
  }
  if (id === "cashHandoverModal") {
    var board = document.getElementById("pageHandoverWrapper");
    var tabPane = document.getElementById("shiftsTabHandover");
    if (board && tabPane && board.parentElement !== tabPane) {
      tabPane.appendChild(board);
    }
  }
}

// Universal Aliases for modal open/close across all components
function openModal(id) {
  showModal(id);
}
function closeModal(id) {
  hideModal(id);
}
window.showModal = showModal;
window.hideModal = hideModal;
window.openModal = openModal;
window.closeModal = closeModal;

function openCashierLuxuryModal() {
  var curTheme = document.documentElement.getAttribute("data-cashier-theme") || "royal-gold";
  highlightActiveCashierLuxuryBtn(curTheme);
  var cardStyle = document.documentElement.getAttribute("data-cashier-card-style") || "gold-vip";
  var mCard = document.getElementById("modalCashierCardStyle");
  if (mCard) mCard.value = cardStyle;
  var gridCols = document.documentElement.getAttribute("data-cashier-grid-cols") || "4";
  var mCols = document.getElementById("modalCashierGridCols");
  if (mCols) mCols.value = gridCols;
  var layoutDir = document.documentElement.getAttribute("data-cashier-layout") || "default";
  var mLayout = document.getElementById("modalCashierLayoutDir");
  if (mLayout) mLayout.value = layoutDir;
  var profitVis = document.documentElement.getAttribute("data-cashier-profit") || "hidden";
  var mProfit = document.getElementById("modalCashierProfitVis");
  if (mProfit) mProfit.value = profitVis;
  var usdVis = document.documentElement.getAttribute("data-cashier-usd") || "visible";
  var mUsd = document.getElementById("modalCashierUsdVis");
  if (mUsd) mUsd.value = usdVis;
  var savedCash = readOwnColors("sam_pos_custom_cashier", "customCashierColors");
  if (savedCash) {
    fillOwnColorInputs({ page: "modalOwnCashPage", btn: "modalOwnCashBtn", text: "modalOwnCashBtnText" }, savedCash);
    fillOwnColorInputs({ page: "ownCashPage", btn: "ownCashBtn", text: "ownCashBtnText" }, savedCash);
  }
  showModal("cashierLuxuryModal");
}
window.openCashierLuxuryModal = openCashierLuxuryModal;
function setTheme(theme) {
  if (typeof clearOwnPageColors === "function") clearOwnPageColors(true);
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("sam_pos_ui_theme", theme); } catch (e) {}
  if (typeof SqliteDB !== "undefined" && SqliteDB.setSetting) {
    SqliteDB.setSetting("ui_theme", theme);
  }
  if (typeof DB !== "undefined" && DB.settings) {
    DB.settings.ui_theme = theme;
  }
  var lux = document.documentElement.getAttribute("data-cashier-theme") || "";
  highlightActiveCashierLuxuryBtn(lux);
}

function isLightCashierTheme(id) {
  return id === "ivory-platinum" || id === "pearl-marble" || id === "diamond-blanc";
}

function syncCashierLightClass(id) {
  document.documentElement.classList.toggle("cashier-light", isLightCashierTheme(id));
}

var LUXURY_CASHIER_THEMES = [
  { id: "ivory-platinum", label: "🤍 سپی شاهانە (مۆدێرن)" },
  { id: "diamond-blanc", label: "💎 سپی ئەڵماس (گرادیێنت)" },
  { id: "royal-gold", label: "👑 زێڕین و ڕەش (VIP)" },
  { id: "emerald-diamond", label: "💎 ئەڵماسی زمڕوود" },
  { id: "sapphire-vip", label: "🌌 یاقووتی شین" },
  { id: "velvet-ruby", label: "🍷 مەخمەلی یاقووت" },
  { id: "imperial-amethyst", label: "🔮 ئەمیسیستی مۆر" },
  { id: "pearl-marble", label: "☀️ مەڕمەڕی سپی" },
  { id: "titanium-onyx", label: "🛡️ تیتانیۆمی پلاتین" },
  { id: "teal-lagoon", label: "🐬 دەریایی زمروتی" },
  { id: "rose-gold-vip", label: "🌸 ڕۆز گۆڵدی مسین" },
  { id: "sunset-amber", label: "🔥 خۆرئاوابوونی ئاڵتوون" },
  { id: "magenta-neon", label: "💗 مۆری ئاڵی نیۆن" },
  { id: "crimson-gold", label: "🩸 سووری فەرماندار" },
  { id: "lime-citrus", label: "🍋 سەوزی لیمۆیی" },
  { id: "coffee-mocha", label: "☕ قاوەیی کاراميل" }
];

var RECEIPT_COLOR_DEFAULTS = {
  paper: "#ffffff",
  ink: "#000000",
  accent: "#000000",
  accentText: "#ffffff",
  barcode: "#000000"
};

var RECEIPT_COLOR_PRESETS = [
  { id: "classic", name: "ڕەش", paper: "#ffffff", ink: "#000000", accent: "#000000", accentText: "#ffffff", barcode: "#000000" },
  { id: "gold", name: "زێڕین", paper: "#fffbeb", ink: "#1c1917", accent: "#b45309", accentText: "#fffbeb", barcode: "#78350f" },
  { id: "green", name: "سەوز", paper: "#ffffff", ink: "#14532d", accent: "#15803d", accentText: "#ffffff", barcode: "#166534" },
  { id: "blue", name: "شین", paper: "#eff6ff", ink: "#1e3a8a", accent: "#1d4ed8", accentText: "#ffffff", barcode: "#1e40af" },
  { id: "red", name: "سوور", paper: "#fff7f7", ink: "#7f1d1d", accent: "#b91c1c", accentText: "#ffffff", barcode: "#991b1b" },
  { id: "purple", name: "مۆر", paper: "#faf5ff", ink: "#3b0764", accent: "#7c3aed", accentText: "#ffffff", barcode: "#6d28d9" },
  { id: "rose", name: "پەمەیی", paper: "#fff1f2", ink: "#881337", accent: "#be185d", accentText: "#ffffff", barcode: "#9d174d" },
  { id: "navy", name: "شەوی", paper: "#0f172a", ink: "#f8fafc", accent: "#eab308", accentText: "#0f172a", barcode: "#fde68a" }
];

function isReceiptHexColor(v) {
  return /^#[0-9a-fA-F]{6}$/.test(String(v || "").trim());
}

function getReceiptColors() {
  var out = Object.assign({}, RECEIPT_COLOR_DEFAULTS);
  var saved = (typeof DB !== "undefined" && DB.settings && DB.settings.receiptColors) ? DB.settings.receiptColors : null;
  if (saved) {
    Object.keys(out).forEach(function (k) {
      if (isReceiptHexColor(saved[k])) out[k] = String(saved[k]).toLowerCase();
    });
  }
  return out;
}

function receiptColorVarDeclsFrom(c) {
  c = c || getReceiptColors();
  return "--rc-paper:" + c.paper + ";--rc-ink:" + c.ink + ";--rc-accent:" + c.accent + ";--rc-accent-text:" + c.accentText + ";--rc-barcode:" + c.barcode + ";";
}

function receiptColorVarDecls() {
  return receiptColorVarDeclsFrom(getReceiptColors());
}

function hexColorLuminance(hex) {
  var h = String(hex || "").replace("#", "");
  if (h.length !== 6) return 255;
  var r = parseInt(h.slice(0, 2), 16);
  var g = parseInt(h.slice(2, 4), 16);
  var b = parseInt(h.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function getReceiptPrintColors(forThermal) {
  var c = getReceiptColors();
  if (forThermal && hexColorLuminance(c.paper) < 150) {
    return {
      paper: "#ffffff",
      ink: "#000000",
      accent: "#000000",
      accentText: "#ffffff",
      barcode: "#000000"
    };
  }
  return c;
}

function applyReceiptColorTokens(css, colors) {
  var c = colors || getReceiptColors();
  return String(css || "")
    .replace(/background:#000(?![0-9a-fA-F])/gi, "background:" + c.accent)
    .replace(/color:#fff(?![0-9a-fA-F])/gi, "color:" + c.accentText)
    .replace(/color:#000(?![0-9a-fA-F])/gi, "color:" + c.ink)
    .replace(/#000(?![0-9a-fA-F])/gi, c.ink)
    .replace(/#fff(?![0-9a-fA-F])/gi, c.paper);
}

function getReceiptPrintHardeningCss(colors) {
  var c = colors || getReceiptColors();
  var css = "";
  css += "html,body,.rc,.rc-print-doc{background:" + c.paper + " !important;color:" + c.ink + " !important;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}";
  css += ".rc-banner,.rc-led,.rc-ku-total,.rc-total-led,.rc-ku-num,.rc-style-invoice .rc-table th,.rc-test{background:" + c.accent + " !important;color:" + c.accentText + " !important;}";
  css += ".rc-style-vip-double .rc-banner .rc-shop,.rc-style-supermarket .rc-banner .rc-shop{color:" + c.accentText + " !important;}";
  css += ".rc-style-vip-double .rc,.rc-style-royal .rc,.rc-style-vip-double .rc-total-box,.rc-style-royal .rc-royal-total{border-color:" + c.ink + " !important;}";
  return css;
}

function persistReceiptColors(colors, silent) {
  if (typeof DB === "undefined") return;
  if (!DB.settings) DB.settings = {};
  DB.settings.receiptColors = Object.assign({}, getReceiptColors(), colors || {});
  if (!silent && typeof DataStore !== "undefined" && DataStore.saveSettings) {
    try { DataStore.saveSettings(); } catch (e) {}
  }
}

function fillReceiptColorUi() {
  var c = getReceiptColors();
  var map = {
    rcColorPaper: c.paper,
    rcColorInk: c.ink,
    rcColorAccent: c.accent,
    rcColorAccentText: c.accentText,
    rcColorBarcode: c.barcode
  };
  Object.keys(map).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = map[id];
  });
  document.querySelectorAll(".bill-color-preset").forEach(function (btn) {
    var p = RECEIPT_COLOR_PRESETS.find(function (x) { return x.id === btn.getAttribute("data-preset"); });
    var on = p && p.paper === c.paper && p.ink === c.ink && p.accent === c.accent && p.accentText === c.accentText && p.barcode === c.barcode;
    btn.classList.toggle("is-on", !!on);
  });
}

function readReceiptColorInputs() {
  function val(id, fallback) {
    var el = document.getElementById(id);
    var v = el && el.value;
    return isReceiptHexColor(v) ? String(v).toLowerCase() : fallback;
  }
  var cur = getReceiptColors();
  return {
    paper: val("rcColorPaper", cur.paper),
    ink: val("rcColorInk", cur.ink),
    accent: val("rcColorAccent", cur.accent),
    accentText: val("rcColorAccentText", cur.accentText),
    barcode: val("rcColorBarcode", cur.barcode)
  };
}

function onReceiptColorChange() {
  persistReceiptColors(readReceiptColorInputs());
  if (typeof updateLiveReceiptPreview === "function") updateLiveReceiptPreview();
  if (window._rcColorThumbTimer) clearTimeout(window._rcColorThumbTimer);
  window._rcColorThumbTimer = setTimeout(function () {
    try { renderBillStylePicker(); } catch (e) {}
  }, 260);
}

function applyReceiptColorPreset(id) {
  var p = RECEIPT_COLOR_PRESETS.find(function (x) { return x.id === id; }) || RECEIPT_COLOR_PRESETS[0];
  persistReceiptColors({
    paper: p.paper, ink: p.ink, accent: p.accent, accentText: p.accentText, barcode: p.barcode
  });
  fillReceiptColorUi();
  if (typeof updateLiveReceiptPreview === "function") updateLiveReceiptPreview();
  try { renderBillStylePicker(); } catch (e) {}
}

function resetReceiptColors() {
  applyReceiptColorPreset("classic");
  if (typeof toast === "function") toast("پسوڵە", "ڕەنگی پسوڵە گەڕایەوە بۆ ڕەش و سپی", "success");
}

window.onReceiptColorChange = onReceiptColorChange;
window.applyReceiptColorPreset = applyReceiptColorPreset;
window.resetReceiptColors = resetReceiptColors;

var BILL_RECEIPT_STYLES = [
  { id: "classic", label: "کلاسیکی تێرمال", arLabel: "حراري كلاسيكي", enLabel: "Classic thermal" },
  { id: "vip-double", label: "VIP سەرپەڕەی ڕەش", arLabel: "VIP رأس أسود", enLabel: "VIP black header" },
  { id: "kurdish", label: "پسوڵەی کوردی", arLabel: "فاتورة كوردية", enLabel: "Kurdish receipt" },
  { id: "supermarket", label: "تەیپی سوپەرمارکێت", arLabel: "شريط سوبرماركت", enLabel: "Supermarket tape" },
  { id: "invoice", label: "وەسڵی ژمێریاری", arLabel: "فاتورة محاسبية", enLabel: "Accounting invoice" },
  { id: "boutique", label: "بووتیکی ناوەڕاست", arLabel: "بوتيك وسط", enLabel: "Centered boutique" },
  { id: "led-total", label: "شاشەی کۆی گەورە", arLabel: "شاشة المجموع الكبير", enLabel: "Giant total" },
  { id: "minimal", label: "خاڵبەخاڵ سادە", arLabel: "بسيط بنقاط", enLabel: "Simple dotted" },
  { id: "royal", label: "چوارچێوەی شاهانە", arLabel: "إطار ملكي", enLabel: "Royal frame" },
  { id: "compact", label: "یەک دێڕی خێرا", arLabel: "سطر سريع", enLabel: "Fast one-line" }
];

var _receiptRenderStyleId = null;

function getReceiptStyleId() {
  var id = "";
  if (typeof DB !== "undefined" && DB.settings && DB.settings.receiptStyle) id = String(DB.settings.receiptStyle);
  if (!id) {
    try { id = localStorage.getItem("sam_pos_receipt_style") || ""; } catch (e) {}
  }
  if (!id && typeof SqliteDB !== "undefined" && SqliteDB.getSetting) {
    id = SqliteDB.getSetting("receipt_style", "") || "";
  }
  if (!BILL_RECEIPT_STYLES.some(function (s) { return s.id === id; })) id = "classic";
  return id;
}

function getReceiptStyleMeta() {
  var id = _receiptRenderStyleId || getReceiptStyleId();
  return BILL_RECEIPT_STYLES.find(function (s) { return s.id === id; }) || BILL_RECEIPT_STYLES[0];
}

function receiptUiLang() {
  try {
    if (window.I18n && typeof I18n.current === "function") {
      var cur = I18n.current();
      if (cur === "ar" || cur === "en" || cur === "ku") return cur;
    }
  } catch (e) {}
  try {
    var saved = localStorage.getItem("pos_lang") || "";
    if (saved === "ar" || saved === "en" || saved === "ku") return saved;
  } catch (e2) {}
  return "ku";
}

function receiptLabel(key) {
  var lang = receiptUiLang();
  var KU = {
    receipt: "پسوڵە", date: "بەروار", cashier: "کاشیر", items: "دانە",
    qty: "دانە", item: "کاڵا", price: "نرخ", totalCol: "کۆ",
    subtotal: "کۆی نرخی کاڵا", discount: "داشکاندن", grand: "کۆی گشتی",
    received: "وەرگیراو", change: "ماوە", tel: "تەلەفۆن", usd: "دۆلار",
    iqd: "د.ع", thanks: "سوپاس بۆ کڕینەکەت!", thanksVisit: "سوپاس بۆ سەردانەکەتان",
    saleReceipt: "پسوڵەی فرۆشتن", invoice: "وەسڵ", taxInvoice: "وەسڵی فرۆشتن",
    vip: "VIP", saveMore: "هەموو ڕۆژێک زیاتر پاشەکەوت بکە",
    testPrint: "چاپی تاقیکاری", carton: "کارتۆن", customer: "کڕیار",
    qtyMark: "×", no: "ژمارە", pay: "پارەدان",
    payCash: "نەقد (Cash)", payCard: "کارت (Card)", payDebt: "قەرز", payUsd: "دۆلار (USD)"
  };
  var AR = {
    receipt: "فاتورة", date: "التاريخ", cashier: "كاشير", items: "القطع",
    qty: "الكمية", item: "الصنف", price: "السعر", totalCol: "المجموع",
    subtotal: "المجموع الفرعي", discount: "الخصم", grand: "الإجمالي",
    received: "المستلم", change: "الباقي", tel: "هاتف", usd: "دولار",
    iqd: "د.ع", thanks: "شكراً لشرائك!", thanksVisit: "شكراً لزيارتكم",
    saleReceipt: "فاتورة البيع", invoice: "فاتورة", taxInvoice: "فاتورة البيع",
    vip: "VIP", saveMore: "وفّر أكثر كل يوم",
    testPrint: "طباعة تجريبية", carton: "كرتون", customer: "زبون",
    qtyMark: "×", no: "رقم", pay: "الدفع",
    payCash: "نقد", payCard: "بطاقة", payDebt: "دين", payUsd: "دولار"
  };
  var EN = {
    receipt: "Receipt", date: "Date", cashier: "Cashier", items: "Items",
    qty: "Qty", item: "Item", price: "Price", totalCol: "Total",
    subtotal: "Subtotal", discount: "Discount", grand: "TOTAL",
    received: "Received", change: "Change", tel: "Tel", usd: "USD",
    iqd: "IQD", thanks: "Thank you for your purchase!", thanksVisit: "Thank you for visiting",
    saleReceipt: "SALES RECEIPT", invoice: "INVOICE", taxInvoice: "TAX INVOICE",
    vip: "VIP", saveMore: "SAVE MORE EVERY DAY",
    testPrint: "TEST PRINT", carton: "carton", customer: "Customer",
    qtyMark: "x", no: "No", pay: "Payment",
    payCash: "CASH", payCard: "CARD", payDebt: "CREDIT", payUsd: "USD"
  };
  var pack = lang === "ar" ? AR : (lang === "en" ? EN : KU);
  return pack[key] || KU[key] || key;
}

function receiptSampleItems() {
  var lang = receiptUiLang();
  if (lang === "en") {
    return [
      { name: "Nido milk 1kg", qty: 1, price: 12500, unitType: "piece" },
      { name: "Olive oil", qty: 2, price: 4500, unitType: "piece" },
      { name: "Bread", qty: 3, price: 500, unitType: "piece" }
    ];
  }
  if (lang === "ar") {
    return [
      { name: "حليب نيدو 1كغ", qty: 1, price: 12500, unitType: "piece" },
      { name: "زيت زيتون", qty: 2, price: 4500, unitType: "piece" },
      { name: "خبز", qty: 3, price: 500, unitType: "piece" }
    ];
  }
  return [
    { name: "شیر نیدۆ ١ کگ", qty: 1, price: 12500, unitType: "piece" },
    { name: "زەیتی زەیتوون", qty: 2, price: 4500, unitType: "piece" },
    { name: "نان", qty: 3, price: 500, unitType: "piece" }
  ];
}

function receiptThanksHtml(cls) {
  cls = cls || "rc-footer-msg";
  return '<div class="' + cls + '">' + receiptLabel("thanks") + "</div>";
}

function rcEsc(s) {
  return typeof escapePosHtml === "function" ? escapePosHtml(s) : String(s == null ? "" : s);
}

function rcLogoHtml(ctx) {
  if (!ctx.logo || !ctx.showLogo) return "";
  if (ctx.isPreview) return '<img src="' + ctx.logo + '" class="receipt-preview-logo" alt="" style="display:block;margin:0 auto 6px;">';
  var w = ctx.is58mm ? "110px" : "140px";
  return '<img src="' + ctx.logo + '" style="max-height:50px;max-width:' + w + ';object-fit:contain;margin:0 auto 4px;display:block;">';
}

function rcBarcodeHtml(ctx) {
  if (ctx.showBarcode === false) return "";
  return '<div class="rc-barcode-wrap">' + (ctx.barcodeHtml || "") + "</div>";
}

function rcPayHtml(ctx) {
  var rows = "";
  if (ctx.payLabel) {
    rows += '<div class="rc-row"><span>' + receiptLabel("pay") + '</span><span><b>' + rcEsc(ctx.payLabel) + "</b></span></div>";
  }
  if (ctx.recvStr && ctx.payKind !== "card" && ctx.payKind !== "debt") {
    rows += '<div class="rc-row"><span>' + receiptLabel("received") + '</span><span>' + ctx.recvStr + " " + receiptLabel("iqd") + "</span></div>";
    rows += '<div class="rc-row"><span>' + receiptLabel("change") + '</span><span>' + ctx.changeStr + " " + receiptLabel("iqd") + "</span></div>";
  }
  if (!rows) return "";
  return '<div class="rc-pay">' + rows + "</div>";
}

function rcUsdHtml(ctx) {
  if (!ctx.usdStr) return "";
  return '<div class="rc-usd">' + receiptLabel("usd") + ': $' + ctx.usdStr + "</div>";
}

function rcNotesHtml(ctx) {
  var html = "";
  if (ctx.header) html += '<div class="rc-header-note">' + rcEsc(ctx.header) + "</div>";
  if (ctx.footer) html += '<div class="rc-footer-note">' + rcEsc(ctx.footer) + "</div>";
  if (ctx.isTest) html += '<div class="rc-test">*** ' + receiptLabel("testPrint") + " ***</div>";
  return html;
}

function collectReceiptPrintCtx(order, opts) {
  opts = opts || {};
  var is58mm = !!opts.is58mm;
  var items = (order.items || []).map(function (i) {
    var lineTotal = (parseFloat(i.qty) || 0) * (parseFloat(i.price) || 0);
    var isCarton = (i.unitType === "carton" || i.isPack === true);
    var hasCarton = String(i.name || "").indexOf("کارتۆن") !== -1;
    var name = i.name + (isCarton && !hasCarton ? " [" + receiptLabel("carton") + " " + (i.packQty || 1) + "]" : "");
    return {
      name: name,
      qtyStr: (i.qty || 0) + " " + receiptLabel("qtyMark"),
      priceStr: Number(i.price || 0).toLocaleString("en-US"),
      totalStr: Number(lineTotal).toLocaleString("en-US")
    };
  });
  var rate = (typeof SupermarketEngine !== "undefined") ? SupermarketEngine.getUsdRate() : 1530;
  var payKind = (typeof orderPayKind === "function") ? orderPayKind(order) : (order.paymentMethod || "cash");
  var payLabel = (typeof orderPayLabel === "function") ? orderPayLabel(order) : (
    payKind === "card" ? receiptLabel("payCard") :
    payKind === "debt" ? receiptLabel("payDebt") :
    payKind === "usd" ? receiptLabel("payUsd") : receiptLabel("payCash")
  );
  var isCashLike = payKind === "cash" || payKind === "usd";
  var paid = isCashLike && order.cashReceived && order.cashReceived > 0;
  var orderDate = order.date ? new Date(order.date) : new Date();
  var showBc = !DB.settings || DB.settings.showBarcode !== "off";
  var barcodeHtml = "";
  var rcColors = getReceiptColors();
  if (showBc) {
    if (opts.isPreview) {
      barcodeHtml = '<div class="rc-fake-barcode" style="color:' + rcColors.barcode + '">▌▌ ▌▌▌ ▌ ▌▌▌▌ ▌▌ ▌▌▌</div>';
    } else if (typeof BarcodeGen !== "undefined") {
      barcodeHtml = BarcodeGen.code128Svg(orderBillBarcode(order), {
        height: (is58mm ? 52 : 64),
        barWidth: (is58mm ? 2.4 : 2.8),
        quietZone: 12,
        showText: true,
        text: orderBillNo(order) || "00000",
        fontSize: (is58mm ? 16 : 18),
        barColor: rcColors.barcode,
        bgColor: rcColors.paper
      });
    } else {
      barcodeHtml = '<div class="rc-barcode-text" style="color:' + rcColors.barcode + '">*' + (orderBillNo(order) || "00000") + "*</div>";
    }
  }
  return {
    marketName: getStoreName(),
    tagline: (DB.settings && DB.settings.marketTagline) || "",
    logo: DB.settings && DB.settings.marketLogo,
    showLogo: !DB.settings || DB.settings.showLogo !== "off",
    address: (DB.settings && DB.settings.address) || "",
    phone: (DB.settings && DB.settings.phone) || "",
    header: (DB.settings && DB.settings.receiptHeader) || "",
    footer: (DB.settings && DB.settings.receiptFooter) || "",
    cashierName: order.cashier || receiptLabel("cashier"),
    dateStr: orderDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }),
    timeStr: formatSaleTime(orderDate, !opts.isPreview),
    orderNum: orderBillNo(order) || String(order.id || "SAMPLE").slice(-5).toUpperCase(),
    itemCount: items.length,
    items: items,
    subtotalStr: Number(order.subtotal || order.total || 0).toLocaleString("en-US"),
    discount: order.discount || 0,
    discountStr: Number(order.discount || 0).toLocaleString("en-US"),
    totalStr: Number(order.total || 0).toLocaleString("en-US"),
    usdStr: ((order.total || 0) / rate).toFixed(2),
    recvStr: paid ? Number(order.cashReceived).toLocaleString("en-US") : "",
    changeStr: paid ? Number(order.changeDue || 0).toLocaleString("en-US") : "",
    payKind: payKind,
    payLabel: payLabel,
    isTest: !!order.isTest,
    showBarcode: showBc,
    barcodeHtml: barcodeHtml,
    is58mm: is58mm,
    isPreview: !!opts.isPreview
  };
}

function getReceiptSampleCtx() {
  var is58 = typeof document !== "undefined" && document.getElementById("setPrintType") && document.getElementById("setPrintType").value === "thermal58";
  var sample = {
    id: "SAMPLE-01",
    date: new Date().toISOString(),
    cashier: receiptLabel("cashier"),
    items: receiptSampleItems(),
    subtotal: 23000,
    discount: 0,
    total: 23000
  };
  return collectReceiptPrintCtx(sample, { isPreview: true, is58mm: is58 });
}

function getReceiptLayoutCss(is58mm, colors) {
  var c = colors || getReceiptColors();
  var shop = is58mm ? "26px" : "32px";
  var body = is58mm ? "17px" : "21px";
  var giant = is58mm ? "36px" : "46px";
  var css = "";
  css += ".rc{" + receiptColorVarDeclsFrom(c) + "width:100%;color:" + c.ink + ";background:" + c.paper + ";font-size:" + body + ";line-height:1.4;}";
  css += ".rc-center{text-align:center;}";
  css += ".rc-row,.rc-pay .rc-row{display:flex;justify-content:space-between;gap:6px;}";
  css += ".rc-shop{font-weight:900;font-size:" + shop + ";line-height:1.15;}";
  css += ".rc-sub{font-size:" + (is58mm ? "15px" : "17px") + ";margin:1px 0;}";
  css += ".rc-usd,.rc-footer-note,.rc-header-note,.rc-footer-msg{text-align:center;margin-top:4px;font-size:" + (is58mm ? "16px" : "18px") + ";}";
  css += ".rc-barcode-wrap{margin:8px 0;display:flex;justify-content:center;}";
  css += ".rc-fake-barcode{font-family:monospace;letter-spacing:2px;font-size:18px;text-align:center;margin:6px 0;}";
  css += ".rc-test{background:#000;color:#fff;text-align:center;padding:4px;margin:6px 0;font-weight:800;}";

  /* 1 CLASSIC: courier + ascii + 4-col open table */
  css += ".rc-style-classic .rc{font-family:'Courier New',Courier,monospace;}";
  css += ".rc-style-classic .rc-eq{text-align:center;letter-spacing:0;font-weight:800;margin:2px 0;white-space:nowrap;overflow:hidden;}";
  css += ".rc-style-classic .rc-dash{border:none;border-top:2px dashed #000;margin:6px 0;}";
  css += ".rc-style-classic .rc-table{width:100%;border-collapse:collapse;margin:4px 0;}";
  css += ".rc-style-classic .rc-table th,.rc-style-classic .rc-table td{padding:2px 1px;vertical-align:top;}";
  css += ".rc-style-classic .rc-table th{font-weight:800;border-bottom:2px dashed #000;text-align:right;}";
  css += ".rc-style-classic .col-qty{width:14%;text-align:center;white-space:nowrap;}";
  css += ".rc-style-classic .col-name{width:44%;text-align:right;word-break:break-word;}";
  css += ".rc-style-classic .col-price{width:21%;text-align:center;white-space:nowrap;}";
  css += ".rc-style-classic .col-total{width:21%;text-align:left;font-weight:800;white-space:nowrap;}";
  css += ".rc-style-classic .rc-total{display:flex;justify-content:space-between;font-weight:900;font-size:" + (is58mm ? "22px" : "28px") + ";border-top:3px solid #000;border-bottom:3px solid #000;padding:5px 0;margin:6px 0;}";

  /* 2 VIP: full black banner, 2x2 meta, 2-col lines, double frame, boxed total */
  css += ".rc-style-vip-double .rc{font-family:Tahoma,Arial,sans-serif;border:4px double #000;padding:0 0 8px;}";
  css += ".rc-style-vip-double .rc-banner{background:#000;color:#fff;text-align:center;padding:10px 6px 8px;}";
  css += ".rc-style-vip-double .rc-banner .rc-shop{font-size:" + (is58mm ? "22px" : "28px") + ";letter-spacing:1px;color:#fff;}";
  css += ".rc-style-vip-double .rc-vip-tag{font-size:16px;letter-spacing:6px;margin-bottom:4px;font-weight:800;}";
  css += ".rc-style-vip-double .rc-inner{padding:8px;}";
  css += ".rc-style-vip-double .rc-meta-grid{width:100%;border-collapse:collapse;margin:0;}";
  css += ".rc-style-vip-double .rc-meta-grid td{width:50%;padding:6px;border:1px solid #000;font-size:" + (is58mm ? "15px" : "17px") + ";vertical-align:top;}";
  css += ".rc-style-vip-double .rc-vip-line{display:flex;justify-content:space-between;gap:8px;padding:5px 2px;border-bottom:1px solid #000;}";
  css += ".rc-style-vip-double .rc-vip-line .nm{font-weight:700;}";
  css += ".rc-style-vip-double .rc-vip-line .am{font-weight:900;white-space:nowrap;}";
  css += ".rc-style-vip-double .rc-total-box{margin:10px 8px 4px;border:3px double #000;padding:8px;text-align:center;}";
  css += ".rc-style-vip-double .rc-total-box .lbl{font-size:16px;letter-spacing:3px;}";
  css += ".rc-style-vip-double .rc-total-box .amt{font-size:" + (is58mm ? "28px" : "34px") + ";font-weight:900;display:block;}";

  /* 3 KURDISH: stamp title, numbered cards, inverted total */
  css += ".rc-style-kurdish .rc{font-family:Tahoma,Arial,sans-serif;}";
  css += ".rc-style-kurdish .rc-stars{text-align:center;letter-spacing:3px;font-weight:800;margin:4px 0;}";
  css += ".rc-style-kurdish .rc-ku-title{text-align:center;font-weight:900;border:3px solid #000;padding:6px;margin:6px 0;font-size:" + (is58mm ? "20px" : "24px") + ";letter-spacing:1px;}";
  css += ".rc-style-kurdish .rc-ku-card{display:flex;gap:8px;align-items:flex-start;border:1px solid #000;padding:6px;margin:6px 0;}";
  css += ".rc-style-kurdish .rc-ku-num{background:#000;color:#fff;min-width:24px;height:24px;text-align:center;line-height:24px;font-weight:900;font-size:14px;}";
  css += ".rc-style-kurdish .rc-ku-body{flex:1;}";
  css += ".rc-style-kurdish .rc-stack-name{font-weight:800;}";
  css += ".rc-style-kurdish .rc-stack-line{display:flex;justify-content:space-between;font-size:" + (is58mm ? "16px" : "18px") + ";margin-top:2px;}";
  css += ".rc-style-kurdish .rc-ku-total{background:#000;color:#fff;text-align:center;padding:12px 6px;margin:10px 0;}";
  css += ".rc-style-kurdish .rc-ku-total .lbl{display:block;font-size:17px;letter-spacing:2px;}";
  css += ".rc-style-kurdish .rc-ku-total .amt{display:block;font-size:" + (is58mm ? "30px" : "36px") + ";font-weight:900;}";

  /* 4 SUPERMARKET: grocery numbers, price line, huge TOTAL */
  css += ".rc-style-supermarket .rc{font-family:'Courier New',Courier,monospace;}";
  css += ".rc-style-supermarket .rc-banner{background:#000;color:#fff;text-align:center;padding:12px 4px;margin:0 0 6px;}";
  css += ".rc-style-supermarket .rc-banner .rc-shop{font-size:" + (is58mm ? "22px" : "28px") + ";color:#fff;}";
  css += ".rc-style-supermarket .rc-tape-item{margin:2px 0 6px;}";
  css += ".rc-style-supermarket .rc-tape-name{font-weight:800;}";
  css += ".rc-style-supermarket .rc-tape-line{display:flex;justify-content:space-between;border-bottom:1px dotted #000;padding-bottom:3px;}";
  css += ".rc-style-supermarket .rc-eq{text-align:center;font-weight:800;margin:6px 0 2px;overflow:hidden;white-space:nowrap;}";
  css += ".rc-style-supermarket .rc-total-led{background:#000;color:#fff;text-align:center;padding:10px 6px;margin:4px 0;}";
  css += ".rc-style-supermarket .rc-total-led .amt{font-size:" + (is58mm ? "30px" : "36px") + ";font-weight:900;display:block;}";
  css += ".rc-style-supermarket .rc-save{text-align:center;font-weight:800;margin-top:8px;border:2px solid #000;padding:4px;letter-spacing:1px;font-size:" + (is58mm ? "15px" : "17px") + ";}";

  /* 5 INVOICE: kicker + split letterhead + 5-col grid + accounting */
  css += ".rc-style-invoice .rc{font-family:Tahoma,Arial,sans-serif;}";
  css += ".rc-style-invoice .rc-inv-kicker{text-align:center;font-size:15px;letter-spacing:4px;font-weight:800;}";
  css += ".rc-style-invoice .rc-inv-title{text-align:center;font-weight:900;font-size:" + (is58mm ? "20px" : "24px") + ";border-bottom:3px solid #000;padding:2px 0 6px;margin-bottom:8px;}";
  css += ".rc-style-invoice .rc-inv-split{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin:6px 0 10px;font-size:" + (is58mm ? "15px" : "17px") + ";}";
  css += ".rc-style-invoice .rc-inv-split>div{width:48%;}";
  css += ".rc-style-invoice .rc-inv-split .box{border:1px solid #000;padding:6px;}";
  css += ".rc-style-invoice .rc-table{width:100%;border-collapse:collapse;margin:4px 0;}";
  css += ".rc-style-invoice .rc-table th,.rc-style-invoice .rc-table td{border:1px solid #000;padding:4px 3px;vertical-align:top;font-size:" + (is58mm ? "15px" : "17px") + ";}";
  css += ".rc-style-invoice .rc-table th{background:#000;color:#fff;font-weight:800;text-align:center;}";
  css += ".rc-style-invoice .col-no{width:10%;text-align:center;}";
  css += ".rc-style-invoice .col-qty,.rc-style-invoice .col-price,.rc-style-invoice .col-total{text-align:center;white-space:nowrap;}";
  css += ".rc-style-invoice .rc-account{margin-top:8px;border:1px solid #000;padding:6px 8px;}";
  css += ".rc-style-invoice .rc-account .grand{font-weight:900;font-size:" + (is58mm ? "20px" : "26px") + ";border-top:2px solid #000;margin-top:4px;padding-top:6px;}";

  /* 6 BOUTIQUE: centered, letter-spaced, stacked items, em-dash total */
  css += ".rc-style-boutique .rc{font-family:Georgia,'Times New Roman',serif;text-align:center;}";
  css += ".rc-style-boutique .rc-dots{letter-spacing:5px;margin:8px 0;font-size:14px;}";
  css += ".rc-style-boutique .rc-shop{letter-spacing:4px;font-size:" + (is58mm ? "20px" : "26px") + ";font-weight:700;text-transform:uppercase;}";
  css += ".rc-style-boutique .rc-boutique-item{margin:10px 0 4px;}";
  css += ".rc-style-boutique .rc-boutique-item .nm{font-weight:800;font-size:" + (is58mm ? "17px" : "20px") + ";}";
  css += ".rc-style-boutique .rc-boutique-item .qy{font-size:" + (is58mm ? "15px" : "17px") + ";margin:2px 0;opacity:0.9;}";
  css += ".rc-style-boutique .rc-boutique-item .pr{font-weight:800;}";
  css += ".rc-style-boutique .rc-boutique-item .sep{margin:8px 0 0;letter-spacing:3px;font-size:13px;}";
  css += ".rc-style-boutique .rc-total-em{margin:12px 0 8px;font-size:" + (is58mm ? "22px" : "28px") + ";font-weight:900;letter-spacing:1px;}";

  /* 7 LED: giant inverted TOTAL first, tiny list after */
  css += ".rc-style-led-total .rc{font-family:Arial,Helvetica,sans-serif;}";
  css += ".rc-style-led-total .rc-shop{text-align:center;font-size:" + (is58mm ? "22px" : "28px") + ";}";
  css += ".rc-style-led-total .rc-meta-one{text-align:center;font-size:" + (is58mm ? "15px" : "17px") + ";margin:2px 0 8px;}";
  css += ".rc-style-led-total .rc-led{background:#000;color:#fff;text-align:center;padding:16px 6px;margin:6px 0 12px;}";
  css += ".rc-style-led-total .rc-led .lbl{display:block;letter-spacing:6px;font-size:" + (is58mm ? "16px" : "18px") + ";font-weight:800;}";
  css += ".rc-style-led-total .rc-led .amt{display:block;font-size:" + giant + ";font-weight:900;line-height:1.05;margin:4px 0;}";
  css += ".rc-style-led-total .rc-led .cur{display:block;font-size:" + (is58mm ? "17px" : "19px") + ";letter-spacing:2px;}";
  css += ".rc-style-led-total .rc-led-item{display:flex;justify-content:space-between;font-size:" + (is58mm ? "16px" : "18px") + ";padding:2px 0;}";

  /* 8 MINIMAL: hairlines + restaurant leader dots */
  css += ".rc-style-minimal .rc{font-family:Tahoma,Arial,sans-serif;}";
  css += ".rc-style-minimal .rc-shop{font-size:" + (is58mm ? "20px" : "26px") + ";font-weight:700;text-align:center;}";
  css += ".rc-style-minimal .rc-hair{border:none;border-top:1px solid #000;margin:10px 0;}";
  css += ".rc-style-minimal .rc-dotline{display:flex;align-items:baseline;gap:4px;margin:7px 0;}";
  css += ".rc-style-minimal .rc-dot-name{max-width:62%;font-weight:600;}";
  css += ".rc-style-minimal .rc-dot-fill{flex:1;border-bottom:1px dotted #000;height:0.65em;}";
  css += ".rc-style-minimal .rc-dot-price{font-weight:800;white-space:nowrap;}";
  css += ".rc-style-minimal .rc-total{display:flex;justify-content:space-between;margin-top:4px;font-weight:800;font-size:" + (is58mm ? "20px" : "26px") + ";}";

  /* 9 ROYAL: diamonds, plaque name, boxed meta, piped list, double total */
  css += ".rc-style-royal .rc{font-family:Georgia,'Times New Roman',serif;border:5px double #000;padding:10px 8px;}";
  css += ".rc-style-royal .rc-orn{text-align:center;letter-spacing:6px;margin:4px 0;font-size:" + (is58mm ? "14px" : "16px") + ";}";
  css += ".rc-style-royal .rc-plaque{border-top:2px solid #000;border-bottom:2px solid #000;padding:8px 4px;margin:6px 0;text-align:center;}";
  css += ".rc-style-royal .rc-plaque .rc-shop{font-size:" + (is58mm ? "22px" : "30px") + ";}";
  css += ".rc-style-royal .rc-meta-box{border:1px solid #000;padding:6px;margin:8px 0;}";
  css += ".rc-style-royal .rc-royal-line{display:flex;justify-content:space-between;gap:6px;padding:4px 0 4px 8px;border-right:3px solid #000;}";
  css += ".rc-style-royal .rc-royal-line .nm{flex:1;font-weight:700;}";
  css += ".rc-style-royal .rc-royal-line .qy{white-space:nowrap;font-size:15px;}";
  css += ".rc-style-royal .rc-royal-line .am{white-space:nowrap;font-weight:900;}";
  css += ".rc-style-royal .rc-royal-total{border:3px double #000;text-align:center;padding:8px;margin:10px 0 6px;font-weight:900;font-size:" + (is58mm ? "22px" : "28px") + ";}";

  /* 10 COMPACT: 4-field one-liners, tiny, shop|phone header */
  css += ".rc-style-compact .rc{font-family:Tahoma,Arial,sans-serif;font-size:" + (is58mm ? "16px" : "18px") + ";line-height:1.35;}";
  css += ".rc-style-compact .rc-shop{font-size:" + (is58mm ? "18px" : "22px") + ";}";
  css += ".rc-style-compact .rc-headline{margin-bottom:2px;}";
  css += ".rc-style-compact .rc-dense-head,.rc-style-compact .rc-dense-row{display:flex;gap:4px;align-items:baseline;}";
  css += ".rc-style-compact .rc-dense-head{font-weight:800;border-bottom:1px solid #000;padding-bottom:2px;margin:4px 0 2px;}";
  css += ".rc-style-compact .rc-dense-row{border-bottom:1px dotted #000;padding:1px 0;}";
  css += ".rc-style-compact .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;}";
  css += ".rc-style-compact .qy{width:18%;text-align:center;white-space:nowrap;}";
  css += ".rc-style-compact .pr{width:22%;text-align:center;white-space:nowrap;}";
  css += ".rc-style-compact .am{width:22%;text-align:left;font-weight:800;white-space:nowrap;}";
  css += ".rc-style-compact .rc-dense-head span:first-child{flex:1;text-align:right;}";
  css += ".rc-style-compact .rc-total{display:flex;justify-content:space-between;font-weight:900;margin-top:4px;border-top:2px solid #000;padding-top:3px;font-size:" + (is58mm ? "18px" : "22px") + ";}";
  if (receiptUiLang() === "en") {
    css += ".rc .rc-table th,.rc .col-name,.rc .rc-dense-head span:first-child,.rc .nm{text-align:left;}";
    css += ".rc .col-total,.rc .am{text-align:right;}";
  }
  return applyReceiptColorTokens(css, c);
}

function getReceiptPagePreviewCss(is58mm) {
  var raw = getReceiptLayoutCss(is58mm);
  var scopes = "#thermalReceiptPreview, .bill-thumb-paper, #printPreviewContent, #receiptPrintArea, #receiptContent";
  return raw.replace(/(^|})([^{}]+)\{/g, function (all, brace, sel) {
    sel = String(sel || "").trim();
    if (!sel) return all;
    if (sel.charAt(0) === "@") return brace + sel + "{";
    var prefixed = sel.split(",").map(function (s) {
      s = s.trim();
      if (!s || /^(html|body)$/i.test(s)) return "";
      return scopes.split(",").map(function (sc) { return sc.trim() + " " + s; }).join(",");
    }).filter(Boolean).join(",");
    return brace + (prefixed || ".__rc-none") + "{";
  });
}

function applyReceiptLiveCss(is58mm) {
  var cssEl = document.getElementById("billStyleLiveCss");
  if (!cssEl) return;
  var c = getReceiptColors();
  var extra = ".thermal-receipt-preview,.bill-thumb-paper{background:" + c.paper + " !important;color:" + c.ink + " !important;}";
  cssEl.textContent = extra + getReceiptPagePreviewCss(is58mm);
}

function buildReceiptClassic(ctx) {
  var rows = ctx.items.map(function (i) {
    return "<tr><td class='col-qty'>" + rcEsc(i.qtyStr) + "</td><td class='col-name'>" + rcEsc(i.name) + "</td><td class='col-price'>" + i.priceStr + "</td><td class='col-total'>" + i.totalStr + "</td></tr>";
  }).join("");
  return rcLogoHtml(ctx) +
    '<div class="rc-eq">========================</div>' +
    '<div class="rc-center rc-shop">' + rcEsc(ctx.marketName) + "</div>" +
    (ctx.tagline ? '<div class="rc-center rc-sub">' + rcEsc(ctx.tagline) + "</div>" : "") +
    (ctx.address ? '<div class="rc-center rc-sub">' + rcEsc(ctx.address) + "</div>" : "") +
    (ctx.phone ? '<div class="rc-center rc-sub">' + receiptLabel("tel") + ": " + rcEsc(ctx.phone) + "</div>" : "") +
    '<div class="rc-eq">========================</div>' +
    '<div class="rc-row"><span>' + receiptLabel("receipt") + ": <b>" + rcEsc(ctx.orderNum) + "</b></span><span>" + ctx.dateStr + "</span></div>" +
    "<div>" + receiptLabel("cashier") + ": " + rcEsc(ctx.cashierName) + "</div>" +
    '<hr class="rc-dash">' +
    '<table class="rc-table"><thead><tr><th class="col-qty">' + receiptLabel("qty") + '</th><th class="col-name">' + receiptLabel("item") + '</th><th class="col-price">' + receiptLabel("price") + '</th><th class="col-total">' + receiptLabel("totalCol") + "</th></tr></thead><tbody>" + rows + "</tbody></table>" +
    '<hr class="rc-dash">' +
    '<div class="rc-row"><span>' + receiptLabel("subtotal") + "</span><span>" + ctx.subtotalStr + "</span></div>" +
    (ctx.discount > 0 ? '<div class="rc-row"><span>' + receiptLabel("discount") + "</span><span>-" + ctx.discountStr + "</span></div>" : "") +
    '<div class="rc-total"><span>' + receiptLabel("grand") + "</span><span>" + ctx.totalStr + " " + receiptLabel("iqd") + "</span></div>" +
    rcUsdHtml(ctx) + rcPayHtml(ctx) + rcNotesHtml(ctx) +
    '<div class="rc-center">' + receiptThanksHtml() + "</div>" +
    rcBarcodeHtml(ctx);
}

function buildReceiptVip(ctx) {
  var rows = ctx.items.map(function (i) {
    return '<div class="rc-vip-line"><span class="nm">' + rcEsc(i.name) + '</span><span class="am">' + i.totalStr + "</span></div>";
  }).join("");
  return '<div class="rc-banner"><div class="rc-vip-tag">★  ' + receiptLabel("vip") + "  ★</div><div class=\"rc-shop\">" + rcEsc(ctx.marketName) + "</div>" +
    (ctx.phone ? '<div class="rc-sub">' + rcEsc(ctx.phone) + "</div>" : "") + "</div>" +
    '<div class="rc-inner">' + rcLogoHtml(ctx) +
    '<table class="rc-meta-grid"><tr><td>' + receiptLabel("receipt") + "<br><b>" + rcEsc(ctx.orderNum) + "</b></td><td>" + receiptLabel("date") + "<br><b>" + ctx.dateStr + "</b></td></tr><tr><td>" + receiptLabel("cashier") + "<br><b>" + rcEsc(ctx.cashierName) + "</b></td><td>" + receiptLabel("items") + "<br><b>" + ctx.itemCount + "</b></td></tr></table>" +
    '<div style="margin-top:8px;">' + rows + "</div></div>" +
    '<div class="rc-total-box"><div class="lbl">' + receiptLabel("grand") + '</div><div class="amt">' + ctx.totalStr + " " + receiptLabel("iqd") + "</div></div>" +
    rcUsdHtml(ctx) + rcPayHtml(ctx) + rcNotesHtml(ctx) +
    '<div class="rc-center">' + receiptThanksHtml() + "</div>" + rcBarcodeHtml(ctx);
}

function buildReceiptKurdish(ctx) {
  var items = ctx.items.map(function (i, n) {
    return '<div class="rc-ku-card"><div class="rc-ku-num">' + (n + 1) + '</div><div class="rc-ku-body"><div class="rc-stack-name">' + rcEsc(i.name) + '</div><div class="rc-stack-line"><span>' + rcEsc(i.qtyStr) + " × " + i.priceStr + "</span><b>" + i.totalStr + "</b></div></div></div>";
  }).join("");
  return '<div class="rc-stars">* * * * * * * *</div>' +
    '<div class="rc-ku-title">' + receiptLabel("saleReceipt") + "</div>" +
    rcLogoHtml(ctx) +
    '<div class="rc-center rc-shop">' + rcEsc(ctx.marketName) + "</div>" +
    (ctx.address ? '<div class="rc-center rc-sub">' + rcEsc(ctx.address) + "</div>" : "") +
    (ctx.phone ? '<div class="rc-center rc-sub">' + receiptLabel("tel") + ": " + rcEsc(ctx.phone) + "</div>" : "") +
    '<div class="rc-stars">* * * * * * * *</div>' +
    "<div>" + receiptLabel("receipt") + ": <b>" + rcEsc(ctx.orderNum) + "</b> — " + ctx.dateStr + "</div>" +
    "<div>" + receiptLabel("cashier") + ": " + rcEsc(ctx.cashierName) + "</div>" +
    items +
    '<div class="rc-ku-total"><span class="lbl">' + receiptLabel("grand") + '</span><span class="amt">' + ctx.totalStr + " " + receiptLabel("iqd") + "</span></div>" +
    rcUsdHtml(ctx) + rcPayHtml(ctx) + rcNotesHtml(ctx) +
    '<div class="rc-center rc-footer-msg">' + receiptLabel("thanks") + "</div>" + rcBarcodeHtml(ctx);
}

function buildReceiptSupermarket(ctx) {
  var items = ctx.items.map(function (i, n) {
    return '<div class="rc-tape-item"><div class="rc-tape-name">' + (n + 1) + ". " + rcEsc(i.name) + '</div><div class="rc-tape-line"><span>' + rcEsc(i.qtyStr) + " " + i.priceStr + "</span><span>" + i.totalStr + "</span></div></div>";
  }).join("");
  return '<div class="rc-banner"><div class="rc-shop">' + rcEsc(ctx.marketName) + "</div>" +
    (ctx.tagline ? '<div class="rc-sub">' + rcEsc(ctx.tagline) + "</div>" : "") + "</div>" +
    rcLogoHtml(ctx) +
    '<div class="rc-center rc-sub">' + (ctx.phone ? rcEsc(ctx.phone) + " · " : "") + rcEsc(ctx.address) + "</div>" +
    '<div class="rc-row" style="margin:6px 0;"><span>#' + rcEsc(ctx.orderNum) + "</span><span>" + ctx.dateStr + " " + ctx.timeStr + "</span></div>" +
    items +
    '<div class="rc-eq">================================</div>' +
    '<div class="rc-total-led"><span>' + receiptLabel("grand") + '</span><span class="amt">' + ctx.totalStr + " " + receiptLabel("iqd") + "</span></div>" +
    rcUsdHtml(ctx) + rcPayHtml(ctx) +
    '<div class="rc-save">*** ' + receiptLabel("saveMore") + " ***</div>" +
    rcNotesHtml(ctx) + rcBarcodeHtml(ctx);
}

function buildReceiptInvoice(ctx) {
  var rows = ctx.items.map(function (i, n) {
    return "<tr><td class='col-no'>" + (n + 1) + "</td><td>" + rcEsc(i.name) + "</td><td class='col-qty'>" + rcEsc(i.qtyStr) + "</td><td class='col-price'>" + i.priceStr + "</td><td class='col-total'>" + i.totalStr + "</td></tr>";
  }).join("");
  return '<div class="rc-inv-kicker">' + receiptLabel("taxInvoice") + "</div>" +
    '<div class="rc-inv-title">' + receiptLabel("invoice") + "</div>" +
    rcLogoHtml(ctx) +
    '<div class="rc-inv-split"><div class="box"><b>' + rcEsc(ctx.marketName) + "</b><br>" + rcEsc(ctx.address) + "<br>" + receiptLabel("tel") + ": " + rcEsc(ctx.phone) + '</div>' +
    '<div class="box">' + receiptLabel("no") + ": <b>" + rcEsc(ctx.orderNum) + "</b><br>" + ctx.dateStr + " " + ctx.timeStr + "<br>" + receiptLabel("cashier") + ": " + rcEsc(ctx.cashierName) + "</div></div>" +
    '<table class="rc-table"><thead><tr><th class="col-no">#</th><th>' + receiptLabel("item") + "</th><th>" + receiptLabel("qty") + "</th><th>" + receiptLabel("price") + "</th><th>" + receiptLabel("totalCol") + "</th></tr></thead><tbody>" + rows + "</tbody></table>" +
    '<div class="rc-account"><div class="rc-row"><span>' + receiptLabel("subtotal") + "</span><span>" + ctx.subtotalStr + "</span></div>" +
    (ctx.discount > 0 ? '<div class="rc-row"><span>' + receiptLabel("discount") + "</span><span>-" + ctx.discountStr + "</span></div>" : "") +
    '<div class="rc-row grand"><span>' + receiptLabel("grand") + "</span><span>" + ctx.totalStr + " " + receiptLabel("iqd") + "</span></div></div>" +
    rcUsdHtml(ctx) + rcPayHtml(ctx) + rcNotesHtml(ctx) + rcBarcodeHtml(ctx);
}

function buildReceiptBoutique(ctx) {
  var items = ctx.items.map(function (i) {
    return '<div class="rc-boutique-item"><div class="nm">' + rcEsc(i.name) + '</div><div class="qy">' + rcEsc(i.qtyStr) + " × " + i.priceStr + '</div><div class="pr">' + i.totalStr + '</div><div class="sep">~ ~ ~</div></div>';
  }).join("");
  return '<div class="rc-dots">· · · · · · · ·</div>' +
    rcLogoHtml(ctx) +
    '<div class="rc-shop">' + rcEsc(ctx.marketName) + "</div>" +
    (ctx.tagline ? '<div class="rc-sub">' + rcEsc(ctx.tagline) + "</div>" : "") +
    '<div class="rc-dots">· · · · · · · ·</div>' +
    '<div class="rc-sub">' + ctx.dateStr + " · " + rcEsc(ctx.cashierName) + "</div>" +
    items +
    '<div class="rc-total-em">— ' + ctx.totalStr + " " + receiptLabel("iqd") + " —</div>" +
    rcUsdHtml(ctx) + rcNotesHtml(ctx) +
    '<div class="rc-sub">' + receiptLabel("thanksVisit") + "</div>" + rcBarcodeHtml(ctx);
}

function buildReceiptLed(ctx) {
  var rows = ctx.items.map(function (i) {
    return '<div class="rc-led-item"><span>' + rcEsc(i.name) + "</span><span>" + i.totalStr + "</span></div>";
  }).join("");
  return rcLogoHtml(ctx) +
    '<div class="rc-shop">' + rcEsc(ctx.marketName) + "</div>" +
    '<div class="rc-meta-one">#' + rcEsc(ctx.orderNum) + " · " + ctx.dateStr + " · " + rcEsc(ctx.cashierName) + "</div>" +
    '<div class="rc-led"><span class="lbl">' + receiptLabel("grand") + '</span><span class="amt">' + ctx.totalStr + '</span><span class="cur">' + receiptLabel("iqd") + "</span></div>" +
    rows +
    rcUsdHtml(ctx) + rcPayHtml(ctx) + rcNotesHtml(ctx) + rcBarcodeHtml(ctx);
}

function buildReceiptMinimal(ctx) {
  var items = ctx.items.map(function (i) {
    return '<div class="rc-dotline"><span class="rc-dot-name">' + rcEsc(i.name) + '</span><span class="rc-dot-fill"></span><span class="rc-dot-price">' + i.totalStr + "</span></div>";
  }).join("");
  return rcLogoHtml(ctx) +
    '<div class="rc-shop">' + rcEsc(ctx.marketName) + "</div>" +
    (ctx.phone ? '<div class="rc-center rc-sub">' + rcEsc(ctx.phone) + "</div>" : "") +
    '<div class="rc-center rc-sub">' + ctx.dateStr + "</div>" +
    '<hr class="rc-hair">' +
    items +
    '<hr class="rc-hair">' +
    '<div class="rc-total"><span>' + receiptLabel("grand") + "</span><span>" + ctx.totalStr + "</span></div>" +
    rcNotesHtml(ctx) +
    '<div class="rc-center rc-sub" style="margin-top:12px;">' + receiptLabel("thanks") + "</div>";
}

function buildReceiptRoyal(ctx) {
  var rows = ctx.items.map(function (i) {
    return '<div class="rc-royal-line"><span class="nm">' + rcEsc(i.name) + '</span><span class="qy">' + rcEsc(i.qtyStr) + '</span><span class="am">' + i.totalStr + "</span></div>";
  }).join("");
  return '<div class="rc-orn">◆ ◆ ◆ ◆ ◆</div>' +
    rcLogoHtml(ctx) +
    '<div class="rc-plaque"><div class="rc-shop">' + rcEsc(ctx.marketName) + "</div></div>" +
    '<div class="rc-orn">◆ ◆ ◆ ◆ ◆</div>' +
    (ctx.address ? '<div class="rc-center rc-sub">' + rcEsc(ctx.address) + "</div>" : "") +
    '<div class="rc-meta-box"><div class="rc-row"><span>' + receiptLabel("receipt") + "</span><b>" + rcEsc(ctx.orderNum) + "</b></div>" +
    '<div class="rc-row"><span>' + receiptLabel("date") + "</span><span>" + ctx.dateStr + " " + ctx.timeStr + "</span></div>" +
    '<div class="rc-row"><span>' + receiptLabel("cashier") + "</span><span>" + rcEsc(ctx.cashierName) + "</span></div></div>" +
    rows +
    '<div class="rc-royal-total">' + receiptLabel("grand") + "<br>" + ctx.totalStr + " " + receiptLabel("iqd") + "</div>" +
    rcUsdHtml(ctx) + rcPayHtml(ctx) + rcNotesHtml(ctx) +
    '<div class="rc-center">' + receiptThanksHtml() + "</div>" + rcBarcodeHtml(ctx);
}

function buildReceiptCompact(ctx) {
  var rows = ctx.items.map(function (i) {
    return '<div class="rc-dense-row"><span class="nm">' + rcEsc(i.name) + '</span><span class="qy">' + rcEsc(i.qtyStr) + '</span><span class="pr">' + i.priceStr + '</span><span class="am">' + i.totalStr + "</span></div>";
  }).join("");
  return rcLogoHtml(ctx) +
    '<div class="rc-row rc-headline"><b class="rc-shop">' + rcEsc(ctx.marketName) + "</b><span>" + rcEsc(ctx.phone) + "</span></div>" +
    '<div class="rc-row rc-subline"><span>#' + rcEsc(ctx.orderNum) + "</span><span>" + ctx.dateStr + " " + rcEsc(ctx.cashierName) + "</span></div>" +
    '<div class="rc-dense-head"><span>' + receiptLabel("item") + '</span><span class="qy">' + receiptLabel("qty") + '</span><span class="pr">' + receiptLabel("price") + '</span><span class="am">' + receiptLabel("totalCol") + "</span></div>" +
    rows +
    '<div class="rc-total"><span>' + receiptLabel("grand") + "</span><span>" + ctx.totalStr + "</span></div>" +
    rcPayHtml(ctx) + rcNotesHtml(ctx);
}

function buildReceiptInnerHtml(ctx, styleId) {
  var id = styleId || getReceiptStyleId();
  var map = {
    classic: buildReceiptClassic,
    "vip-double": buildReceiptVip,
    kurdish: buildReceiptKurdish,
    supermarket: buildReceiptSupermarket,
    invoice: buildReceiptInvoice,
    boutique: buildReceiptBoutique,
    "led-total": buildReceiptLed,
    minimal: buildReceiptMinimal,
    royal: buildReceiptRoyal,
    compact: buildReceiptCompact
  };
  var prev = _receiptRenderStyleId;
  _receiptRenderStyleId = id;
  try {
    var fn = map[id] || buildReceiptClassic;
    return fn(ctx);
  } finally {
    _receiptRenderStyleId = prev;
  }
}

function wrapReceiptPrintHtml(inner, opts) {
  opts = opts || {};
  var is58mm = !!opts.is58mm;
  var isA4 = !!opts.isA4;
  var page = isA4 ? "A4" : (is58mm ? "58mm auto" : "80mm auto");
  var pad = isA4 ? "18px" : "4px 10px";
  var lang = receiptUiLang();
  var dir = lang === "en" ? "ltr" : "rtl";
  var styleId = opts.styleId || getReceiptStyleId();
  var colors = getReceiptPrintColors(!isA4);
  var decls = receiptColorVarDeclsFrom(colors);
  var layoutCss = getReceiptLayoutCss(is58mm && !isA4, colors);
  var hardCss = getReceiptPrintHardeningCss(colors);
  var html = "<!DOCTYPE html><html class='rc-print-doc rc-style-" + styleId + "' lang='" + lang + "' dir='" + dir + "'><head><meta charset='UTF-8'><title>" + receiptLabel("saleReceipt") + "</title><style>";
  html += "@page{size:" + page + ";margin:" + (isA4 ? "12mm" : "0") + ";}";
  html += "*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}";
  html += "html,body{" + decls + "background:" + colors.paper + " !important;color:" + colors.ink + " !important;direction:" + dir + ";width:100%;padding:" + pad + ";font-size:" + (is58mm && !isA4 ? "17px" : "21px") + ";}";
  html += layoutCss;
  html += hardCss;
  if (isA4) html += ".rc{max-width:720px;margin:0 auto;}";
  html += "</style></head>";
  html += "<body class='rc-print-doc rc-style-" + styleId + (isA4 ? " rc-a4" : "") + " rc-lang-" + lang + "' style='" + decls + "background:" + colors.paper + ";color:" + colors.ink + "'>";
  html += "<div class='rc-style-" + styleId + "'><div class='rc' style='background:" + colors.paper + ";color:" + colors.ink + "'>";
  html += inner;
  html += "</div></div>";
  html += "<style>" + layoutCss + hardCss + "</style>";
  html += "</body></html>";
  return html;
}

function getReceiptStylePrintCss(is58mm) {
  return getReceiptLayoutCss(is58mm);
}

function highlightActiveReceiptStyleBtn(styleId) {
  document.querySelectorAll(".bill-style-btn").forEach(function (btn) {
    btn.classList.toggle("is-active", btn.getAttribute("data-bill-style") === styleId);
  });
}

function billStyleLabel(s) {
  var lang = receiptUiLang();
  if (lang === "en") return s.enLabel || s.label;
  if (lang === "ar") return s.arLabel || s.label;
  return s.label;
}

function renderBillStylePicker() {
  var grid = document.getElementById("billReceiptStyleGrid");
  if (!grid) return;
  var current = getReceiptStyleId();
  var is58 = document.getElementById("setPrintType") && document.getElementById("setPrintType").value === "thermal58";
  applyReceiptLiveCss(is58);
  fillReceiptColorUi();
  var ctx = getReceiptSampleCtx();
  ctx.showLogo = false;
  ctx.logo = "";
  ctx.showBarcode = false;
  ctx.header = "";
  ctx.footer = "";
  grid.setAttribute("dir", receiptUiLang() === "en" ? "ltr" : "rtl");
  grid.innerHTML = BILL_RECEIPT_STYLES.map(function (s) {
    var mini = buildReceiptInnerHtml(ctx, s.id);
    return '<button type="button" class="bill-style-btn' + (s.id === current ? " is-active" : "") + '" data-bill-style="' + s.id + '" onclick="setReceiptStyle(\'' + s.id + '\')">' +
      '<span class="bill-thumb-paper"><span class="bill-thumb-scale"><div class="rc-style-' + s.id + '"><div class="rc">' + mini + "</div></div></span></span>" +
      "<strong>" + billStyleLabel(s) + "</strong>" +
    "</button>";
  }).join("");
}

function setReceiptStyle(styleId, silent) {
  if (!styleId) return;
  if (!BILL_RECEIPT_STYLES.some(function (s) { return s.id === styleId; })) styleId = "classic";
  try { localStorage.setItem("sam_pos_receipt_style", styleId); } catch (e) {}
  if (typeof SqliteDB !== "undefined" && SqliteDB.setSetting) {
    SqliteDB.setSetting("receipt_style", styleId);
  }
  if (typeof DB !== "undefined") {
    if (!DB.settings) DB.settings = {};
    DB.settings.receiptStyle = styleId;
    if (!silent && typeof DataStore !== "undefined" && DataStore.saveSettings) {
      try { DataStore.saveSettings(); } catch (e2) {}
    }
  }
  highlightActiveReceiptStyleBtn(styleId);
  if (typeof updateLiveReceiptPreview === "function") updateLiveReceiptPreview();
  if (!silent) {
    var found = BILL_RECEIPT_STYLES.find(function (s) { return s.id === styleId; });
    var name = found ? billStyleLabel(found) : styleId;
    var title = receiptUiLang() === "en" ? "Bill style" : (receiptUiLang() === "ar" ? "نمط الفاتورة" : "ستایلی پسوڵە");
    var msg = receiptUiLang() === "en"
      ? ("Design (" + name + ") is active and will print")
      : (receiptUiLang() === "ar" ? ("التصميم (" + name + ") مفعّل ويظهر عند الطباعة") : ("دیزاینی (" + name + ") چالاک کرا — لە چاپدا دەردەکەوێت"));
    toast(title, msg, "success");
  }
}
window.setReceiptStyle = setReceiptStyle;


function highlightActiveCashierLuxuryBtn(luxId) {
  document.querySelectorAll(".cashier-lux-btn").forEach(function (btn) {
    if (btn.getAttribute("data-lux") === luxId) {
      btn.style.boxShadow = "0 0 0 3px #facc15, 0 8px 20px rgba(0,0,0,0.5)";
      btn.style.transform = "translateY(-2px)";
    } else {
      btn.style.boxShadow = "none";
      btn.style.transform = "none";
    }
  });
  var lbl = document.getElementById("posQuickThemeLabel");
  if (lbl) {
    var customStyle = "";
    try {
      customStyle = String(((DB.settings && DB.settings.cashierButtons && DB.settings.cashierButtons.labels) || {}).style || "").trim();
    } catch (eLbl) {}
    if (customStyle) {
      lbl.textContent = customStyle;
    } else {
      var found = LUXURY_CASHIER_THEMES.find(function (t) { return t.id === luxId; });
      lbl.textContent = found ? found.label.replace(/^[^\s]+\s/, "") : "ستایل";
    }
  }
}

function setCashierLuxuryTheme(luxId, silent) {
  if (!luxId) return;
  if (typeof stripOwnCashierPaint === "function") stripOwnCashierPaint();
  if (!silent && typeof persistOwnColors === "function") persistOwnColors("sam_pos_custom_cashier", null);
  document.documentElement.setAttribute("data-cashier-theme", luxId);
  syncCashierLightClass(luxId);
  // Clear inline custom accent override so the luxury theme's palette shines
  document.documentElement.style.removeProperty("--pos-accent");
  document.documentElement.style.removeProperty("--pos-accent-light");
  document.documentElement.style.removeProperty("--pos-accent-dark");
  document.documentElement.style.removeProperty("--pos-accent-glow");
  document.documentElement.style.removeProperty("--pos-btn-text");

  try { localStorage.setItem("sam_pos_cashier_lux_theme", luxId); } catch (e) {}
  if (typeof SqliteDB !== "undefined" && SqliteDB.setSetting) {
    SqliteDB.setSetting("cashier_lux_theme", luxId);
  }
  if (typeof DB !== "undefined" && DB.settings) {
    DB.settings.cashierLuxTheme = luxId;
  }
  highlightActiveCashierLuxuryBtn(luxId);
  if (!silent) {
    var found = LUXURY_CASHIER_THEMES.find(function (t) { return t.id === luxId; });
    toast("ستایلی شاهانەی کاشێر", "ڕووکاری (" + (found ? found.label : luxId) + ") چالاک کرا", "success");
  }
}

function cycleLuxuryCashierTheme() {
  var current = document.documentElement.getAttribute("data-cashier-theme") || "emerald-diamond";
  var idx = LUXURY_CASHIER_THEMES.findIndex(function (t) { return t.id === current; });
  var next = LUXURY_CASHIER_THEMES[(idx + 1) % LUXURY_CASHIER_THEMES.length];
  setCashierLuxuryTheme(next.id, false);
}

function setCashierStyleOption(type, value, silent) {
  if (type === "cardStyle") {
    document.documentElement.setAttribute("data-cashier-card-style", value || "default");
    try { localStorage.setItem("sam_pos_cashier_card_style", value || "default"); } catch (e) {}
    var sel1 = document.getElementById("setCashierCardStyle");
    if (sel1 && sel1.value !== value) sel1.value = value;
    var mSel1 = document.getElementById("modalCashierCardStyle");
    if (mSel1 && mSel1.value !== value) mSel1.value = value;
  } else if (type === "gridCols") {
    document.documentElement.setAttribute("data-cashier-grid-cols", value || "4");
    try { localStorage.setItem("sam_pos_cashier_grid_cols", value || "4"); } catch (e) {}
    var sel2 = document.getElementById("setCashierGridCols");
    if (sel2 && sel2.value !== value) sel2.value = value;
    var mSel2 = document.getElementById("modalCashierGridCols");
    if (mSel2 && mSel2.value !== value) mSel2.value = value;
    schedulePosGridRefit();
  } else if (type === "layoutDir") {
    document.documentElement.setAttribute("data-cashier-layout", value || "default");
    try { localStorage.setItem("sam_pos_cashier_layout", value || "default"); } catch (e) {}
    var sel3 = document.getElementById("setCashierLayoutDir");
    if (sel3 && sel3.value !== value) sel3.value = value;
    var mSel3 = document.getElementById("modalCashierLayoutDir");
    if (mSel3 && mSel3.value !== value) mSel3.value = value;
  } else if (type === "profitVis") {
    var visVal = value || "hidden";
    document.documentElement.setAttribute("data-cashier-profit", visVal);
    try { localStorage.setItem("sam_pos_cashier_profit_vis", visVal); } catch (e) {}
    var sel4 = document.getElementById("setCashierProfitVis");
    if (sel4 && sel4.value !== visVal) sel4.value = visVal;
    var mSel4 = document.getElementById("modalCashierProfitVis");
    if (mSel4 && mSel4.value !== visVal) mSel4.value = visVal;
    var thP = document.getElementById("thProfit");
    var boxP = document.querySelector("#posSection .profit-box");
    var summaryGrid = document.querySelector("#posSection .cart-summary");
    if (visVal === "visible") {
      if (thP) thP.style.display = "";
      if (boxP) boxP.style.display = "";
      if (summaryGrid) summaryGrid.style.gridTemplateColumns = "minmax(0,.7fr) minmax(0,.7fr) minmax(0,1fr) minmax(0,1.05fr) minmax(0,.85fr) minmax(0,1.3fr)";
    } else {
      if (thP) thP.style.display = "none";
      if (boxP) boxP.style.display = "none";
      if (summaryGrid) summaryGrid.style.gridTemplateColumns = "";
    }
    if (typeof renderCartTable === "function") renderCartTable();
  } else if (type === "usdVis") {
    var usdVal = value || "visible";
    document.documentElement.setAttribute("data-cashier-usd", usdVal);
    try { localStorage.setItem("sam_pos_cashier_usd_vis", usdVal); } catch (e) {}
    var selUsd = document.getElementById("setCashierUsdVis");
    if (selUsd && selUsd.value !== usdVal) selUsd.value = usdVal;
    var mSelUsd = document.getElementById("modalCashierUsdVis");
    if (mSelUsd && mSelUsd.value !== usdVal) mSelUsd.value = usdVal;
    var isUsdVis = (usdVal === "visible");
    var usdCluster = document.querySelector(".usd-quick-rate-cluster");
    var usdNoteBtn = document.querySelector(".note-100usd");
    var ledUsdEl = document.getElementById("ledUsdAmount");
    var sumUsdEl = document.getElementById("summaryGrandTotalUsd");
    var banknotesGrid = document.getElementById("posBanknotesGridIqd");
    if (usdCluster) usdCluster.style.display = isUsdVis ? "" : "none";
    if (usdNoteBtn) usdNoteBtn.style.display = isUsdVis ? "" : "none";
    if (ledUsdEl) ledUsdEl.style.display = isUsdVis ? "" : "none";
    if (sumUsdEl) sumUsdEl.style.display = isUsdVis ? "" : "none";
    if (banknotesGrid) {
      banknotesGrid.style.gridTemplateColumns = isUsdVis ? "repeat(7, 1fr)" : "repeat(6, 1fr)";
    }
  }
  if (!silent) {
    toast("دیزاینی کاشێر", "گۆڕانکارییەکە ڕاستەوخۆ جێبەجێ کرا", "success");
  }
}

var POS_VIEW_KEYS = ["items", "cats", "price", "images", "customers", "qty", "summary", "cash", "clock"];
var POS_VIEW_LABELS = {
  items: "کاڵاکان",
  cats: "پۆلەکان",
  price: "نرخ",
  images: "وێنە",
  customers: "کڕیاران",
  qty: "دانە",
  summary: "پوختە",
  cash: "پارەی خێرا",
  clock: "کاتژمێر"
};

function getPosView(key) {
  return document.documentElement.getAttribute("data-pos-view-" + key) === "off" ? "off" : "on";
}

function syncPosViewUi() {
  POS_VIEW_KEYS.forEach(function (key) {
    var on = getPosView(key) === "on";
    document.querySelectorAll('.pos-view-chip[data-pos-view="' + key + '"]').forEach(function (chip) {
      chip.classList.toggle("is-off", !on);
      var em = chip.querySelector("em");
      if (em) em.textContent = on ? "گەش" : "شاراوە";
    });
  });
  var itemsOn = getPosView("items") === "on";
  var btn = document.getElementById("posViewToggleBtn");
  var icon = document.getElementById("posViewToggleIcon");
  if (btn) btn.classList.toggle("is-scan", !itemsOn);
  if (icon) icon.className = itemsOn ? "fas fa-eye" : "fas fa-eye-slash";
  var scanPreset = itemsOn ? (getPosView("images") === "on" ? "full" : "simple") : "scan";
  if (getPosView("cats") === "off" && itemsOn) scanPreset = "simple";
  document.querySelectorAll(".pos-view-preset").forEach(function (p) {
    p.classList.toggle("active", p.getAttribute("data-preset") === scanPreset);
  });
}

function setPosView(key, value, silent) {
  var val = value === "off" ? "off" : "on";
  document.documentElement.setAttribute("data-pos-view-" + key, val);
  try { localStorage.setItem("sam_pos_view_" + key, val); } catch (e) {}
  syncPosViewUi();
  if (key === "images" || key === "cats" || key === "items") {
    if (typeof schedulePosGridRefit === "function") schedulePosGridRefit();
  }
  if (!silent) {
    toast("شاشەی کاشێر", (POS_VIEW_LABELS[key] || key) + (val === "on" ? " پیشان درا" : " شاردرایەوە"), "success");
  }
}

function togglePosView(key) {
  setPosView(key, getPosView(key) === "on" ? "off" : "on");
}

function applyPosViewPreset(name) {
  var map = {
    full: { items: "on", cats: "on", price: "on", images: "on", customers: "on", qty: "on", summary: "on", cash: "on", clock: "on" },
    scan: { items: "off", cats: "off", price: "on", images: "on", customers: "on", qty: "on", summary: "on", cash: "on", clock: "on" },
    simple: { items: "on", cats: "on", price: "on", images: "off", customers: "off", qty: "on", summary: "on", cash: "on", clock: "off" }
  };
  var preset = map[name] || map.full;
  POS_VIEW_KEYS.forEach(function (k) { setPosView(k, preset[k], true); });
  var titles = { full: "هەموو شتێک پیشان درا", scan: "دۆخی تەنها سکان — کاڵا و پۆل شاراون", simple: "شاشەی سادە چالاک کرا" };
  toast("شاشەی کاشێر", titles[name] || "گۆڕدرا", "success");
}

function loadPosViewPrefs() {
  POS_VIEW_KEYS.forEach(function (k) {
    var v = "on";
    try { v = localStorage.getItem("sam_pos_view_" + k) || "on"; } catch (e) {}
    setPosView(k, v, true);
  });
  setPosView("items", "on", true);
  setPosView("cats", "on", true);
  loadPosTabVis();
  renderPosTabVisChips();
  if (typeof refreshPosCategoryTabsNow === "function") refreshPosCategoryTabsNow();
}

var POS_TAB_VIS_KEY = "sam_pos_tab_vis";
var POS_TAB_VIS = { all: true, fav: true, cats: {} };

function loadPosTabVis() {
  try {
    var raw = localStorage.getItem(POS_TAB_VIS_KEY);
    if (!raw) return;
    var o = JSON.parse(raw);
    if (!o || typeof o !== "object") return;
    POS_TAB_VIS.all = o.all !== false;
    POS_TAB_VIS.fav = o.fav !== false;
    POS_TAB_VIS.cats = (o.cats && typeof o.cats === "object") ? o.cats : {};
  } catch (e) {}
}

function savePosTabVis() {
  try { localStorage.setItem(POS_TAB_VIS_KEY, JSON.stringify(POS_TAB_VIS)); } catch (e) {}
}

function isPosTabVisible(key) {
  if (key === "all") return POS_TAB_VIS.all !== false;
  if (key === "fav") return POS_TAB_VIS.fav !== false;
  if (POS_TAB_VIS.cats && Object.prototype.hasOwnProperty.call(POS_TAB_VIS.cats, key)) {
    return POS_TAB_VIS.cats[key] !== false;
  }
  return true;
}

function setPosTabVisible(key, on, silent) {
  var val = on !== false;
  if (key === "all") POS_TAB_VIS.all = val;
  else if (key === "fav") POS_TAB_VIS.fav = val;
  else {
    POS_TAB_VIS.cats = POS_TAB_VIS.cats || {};
    POS_TAB_VIS.cats[key] = val;
  }
  savePosTabVis();
  if (val) {
    if (typeof setPosView === "function") {
      if (getPosView("cats") === "off") setPosView("cats", "on", true);
      if (getPosView("items") === "off") setPosView("items", "on", true);
    }
  }
  renderPosTabVisChips();
  refreshPosCategoryTabsNow();
  ensureVisiblePosCategorySelected();
  if (typeof renderProductGrid === "function") renderProductGrid(POS_GRID_CATEGORY);
  if (typeof renderCategories === "function") {
    var grid = document.getElementById("categoriesGrid");
    if (grid && grid.offsetParent !== null) renderCategories();
  }
  if (!silent) toast("شاشەی کاشێر", "دوگمەکانی پۆل نوێکرانەوە", "success");
}

function togglePosTabVisible(key) {
  setPosTabVisible(key, !isPosTabVisible(key));
}

function applyPosTabPreset(name) {
  var cats = (typeof getCashierCategories === "function") ? getCashierCategories() : [];
  POS_TAB_VIS.cats = {};
  if (name === "cats") {
    POS_TAB_VIS.all = false;
    POS_TAB_VIS.fav = false;
    cats.forEach(function (c) { POS_TAB_VIS.cats[c.id] = true; });
    if (!cats.length) { POS_TAB_VIS.all = true; POS_TAB_VIS.fav = true; }
  } else if (name === "fav") {
    POS_TAB_VIS.all = false;
    POS_TAB_VIS.fav = true;
    cats.forEach(function (c) { POS_TAB_VIS.cats[c.id] = false; });
  } else if (name === "origin") {
    POS_TAB_VIS.all = true;
    POS_TAB_VIS.fav = false;
    cats.forEach(function (c) { POS_TAB_VIS.cats[c.id] = false; });
  } else {
    POS_TAB_VIS.all = true;
    POS_TAB_VIS.fav = true;
    cats.forEach(function (c) { POS_TAB_VIS.cats[c.id] = true; });
  }
  savePosTabVis();
  if (typeof setPosView === "function") {
    setPosView("cats", "on", true);
    setPosView("items", "on", true);
  }
  renderPosTabVisChips();
  document.querySelectorAll("[data-tab-preset]").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-tab-preset") === name);
  });
  refreshPosCategoryTabsNow();
  ensureVisiblePosCategorySelected();
  if (typeof renderProductGrid === "function") renderProductGrid(POS_GRID_CATEGORY);
  var titles = {
    all: "هەموو دوگمەکان پیشان دران",
    cats: "تەنها پۆلەکان",
    fav: "تەنها دڵخواز",
    origin: "تەنها هەموو"
  };
  toast("شاشەی کاشێر", titles[name] || "نوێکرایەوە", "success");
}

function firstVisiblePosTab() {
  if (isPosTabVisible("all")) return "all";
  if (isPosTabVisible("fav")) {
    var fav = (typeof ensureDefaultFavCategory === "function") ? ensureDefaultFavCategory() : { id: "fav_default" };
    return (typeof favTabId === "function") ? favTabId(fav.id) : "fav:fav_default";
  }
  var cats = (typeof getCashierCategories === "function") ? getCashierCategories() : [];
  for (var i = 0; i < cats.length; i++) {
    if (isPosTabVisible(cats[i].id)) return cats[i].id;
  }
  POS_TAB_VIS.all = true;
  POS_TAB_VIS.fav = true;
  savePosTabVis();
  return "all";
}

function ensureVisiblePosCategorySelected() {
  var active = POS_GRID_CATEGORY || "all";
  var ok = false;
  if (active === "all") ok = isPosTabVisible("all");
  else if (typeof isFavTabId === "function" && isFavTabId(active)) ok = isPosTabVisible("fav");
  else ok = isPosTabVisible(active);
  if (!ok) POS_GRID_CATEGORY = firstVisiblePosTab();
}

function refreshPosCategoryTabsNow() {
  var el = document.getElementById("posCategoryTabs");
  if (el) el.removeAttribute("data-cat-sig");
  if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
}

function renderPosTabVisChips() {
  var box = document.getElementById("posViewTabChips");
  if (!box) return;
  function chip(key, label, icon, extra) {
    var on = isPosTabVisible(key);
    return '<button type="button" class="pos-view-chip pos-tab-vis-chip' + (on ? "" : " is-off") + (extra ? " " + extra : "") + '" onclick="togglePosTabVisible(\'' + String(key).replace(/'/g, "") + '\')">' +
      '<i class="fas ' + icon + '"></i><span>' + String(label || "").replace(/</g, "") + '</span><em>' + (on ? "گەش" : "شاراوە") + '</em></button>';
  }
  var allTabChip = (typeof getOriginTab === "function") ? getOriginTab("all") : { name: "هەموو", icon: "fa-th-large" };
  var favTabChip = (typeof getOriginTab === "function") ? getOriginTab("fav") : { name: "دڵخواز", icon: "fa-star" };
  var html = chip("all", allTabChip.name, allTabChip.icon || "fa-th-large");
  html += chip("fav", favTabChip.name, favTabChip.icon || "fa-star", "is-fav-chip");
  var cats = (typeof getCashierCategories === "function") ? getCashierCategories() : [];
  cats.forEach(function (c) {
    var ic = (c.icon && String(c.icon).indexOf("fa-") === 0) ? c.icon : "fa-tag";
    html += chip(c.id, c.name || c.id, ic);
  });
  box.innerHTML = html;
  document.querySelectorAll("[data-tab-preset]").forEach(function (btn) {
    btn.classList.remove("active");
  });
}

function openPosOriginTab(cat) {
  var target = cat;
  if (cat === "fav") {
    var fav = (typeof ensureDefaultFavCategory === "function") ? ensureDefaultFavCategory() : { id: "fav_default" };
    target = (typeof favTabId === "function") ? favTabId(fav.id) : "fav:fav_default";
    setPosTabVisible("fav", true, true);
  } else if (cat === "all") {
    setPosTabVisible("all", true, true);
  }
  POS_GRID_CATEGORY = target;
  if (typeof setPosView === "function") {
    setPosView("cats", "on", true);
    setPosView("items", "on", true);
  }
  if (typeof switchSection === "function") switchSection("pos");
  refreshPosCategoryTabsNow();
  if (typeof renderProductGrid === "function") renderProductGrid(POS_GRID_CATEGORY);
}

var POS_VIEW_PANEL_GUARD_UNTIL = 0;

function posViewPanelEventInside(e) {
  var p = document.getElementById("posViewPanel");
  var btn = document.getElementById("posViewToggleBtn");
  if (!p) return false;
  var t = e && e.target;
  if (t && (p.contains(t) || (btn && btn.contains(t)))) return true;
  var path = [];
  try { if (e && e.composedPath) path = e.composedPath(); } catch (err) {}
  for (var i = 0; i < path.length; i++) {
    if (path[i] === p || path[i] === btn) return true;
  }
  return false;
}

function togglePosViewPanel(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  var p = document.getElementById("posViewPanel");
  var btn = document.getElementById("posViewToggleBtn");
  if (!p) return;
  var open = !p.classList.contains("open");
  p.classList.toggle("open", open);
  p.setAttribute("aria-hidden", open ? "false" : "true");
  if (btn) btn.classList.toggle("active", open);
  if (open) {
    renderPosTabVisChips();
    POS_VIEW_PANEL_GUARD_UNTIL = Date.now() + 320;
    if (!p._posViewStopBound) {
      p._posViewStopBound = true;
      p.addEventListener("click", function (ev) { ev.stopPropagation(); });
      p.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
    }
  }
}

function closePosViewPanel() {
  var p = document.getElementById("posViewPanel");
  var btn = document.getElementById("posViewToggleBtn");
  if (p) {
    p.classList.remove("open");
    p.setAttribute("aria-hidden", "true");
  }
  if (btn) btn.classList.remove("active");
}

document.addEventListener("click", function (e) {
  if (Date.now() < POS_VIEW_PANEL_GUARD_UNTIL) return;
  var p = document.getElementById("posViewPanel");
  if (!p || !p.classList.contains("open")) return;
  if (posViewPanelEventInside(e)) return;
  closePosViewPanel();
});

window.setPosView = setPosView;
window.togglePosView = togglePosView;
window.applyPosViewPreset = applyPosViewPreset;
window.togglePosViewPanel = togglePosViewPanel;
window.closePosViewPanel = closePosViewPanel;
window.loadPosViewPrefs = loadPosViewPrefs;
window.togglePosTabVisible = togglePosTabVisible;
window.applyPosTabPreset = applyPosTabPreset;
window.openPosOriginTab = openPosOriginTab;
window.isPosTabVisible = isPosTabVisible;

function hexToRgb(hex) {
  if (!hex || typeof hex !== "string") return null;
  var c = hex.replace("#", "").trim();
  if (c.length === 3) c = c.split("").map(function(x) { return x + x; }).join("");
  if (c.length !== 6) return null;
  var num = parseInt(c, 16);
  if (isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function adjustColorBrightness(hex, percent) {
  var rgb = hexToRgb(hex);
  if (!rgb) return hex;
  var amt = Math.round(2.55 * percent);
  var r = Math.min(255, Math.max(0, rgb.r + amt));
  var g = Math.min(255, Math.max(0, rgb.g + amt));
  var b = Math.min(255, Math.max(0, rgb.b + amt));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hexLuma(hex) {
  var rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

function mixHex(a, b, t) {
  var A = hexToRgb(a), B = hexToRgb(b);
  if (!A || !B) return a;
  var r = Math.round(A.r + (B.r - A.r) * t);
  var g = Math.round(A.g + (B.g - A.g) * t);
  var bl = Math.round(A.b + (B.b - A.b) * t);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}

function autoTextOn(bg) {
  return hexLuma(bg) > 0.55 ? "#0f172a" : "#f8fafc";
}

function persistOwnColors(key, obj) {
  var json = obj ? JSON.stringify(obj) : "";
  try { if (obj) localStorage.setItem(key, json); else localStorage.removeItem(key); } catch (e) {}
  if (typeof SqliteDB !== "undefined" && SqliteDB.setSetting) SqliteDB.setSetting(key, json);
  if (typeof DB !== "undefined" && DB.settings) {
    if (key === "sam_pos_custom_page") DB.settings.customPageColors = obj || "";
    if (key === "sam_pos_custom_cashier") DB.settings.customCashierColors = obj || "";
    if (typeof DataStore !== "undefined" && DataStore.saveSettings) {
      try { DataStore.saveSettings(); } catch (e2) {}
    }
  }
}

function readOwnColors(key, dbField) {
  var raw = null;
  if (typeof SqliteDB !== "undefined" && SqliteDB.getSetting) raw = SqliteDB.getSetting(key, null);
  if (!raw && typeof DB !== "undefined" && DB.settings && DB.settings[dbField]) raw = DB.settings[dbField];
  if (!raw) { try { raw = localStorage.getItem(key); } catch (e) {} }
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function fillOwnColorInputs(ids, cfg) {
  if (!cfg) return;
  var page = document.getElementById(ids.page);
  var btn = document.getElementById(ids.btn);
  var text = document.getElementById(ids.text);
  if (page && cfg.page) page.value = cfg.page;
  if (btn && cfg.btn) btn.value = cfg.btn;
  if (text && cfg.btnText) text.value = cfg.btnText;
}

function readOwnColorInputs(ids) {
  var pageEl = document.getElementById(ids.page);
  var btnEl = document.getElementById(ids.btn);
  var textEl = document.getElementById(ids.text);
  var page = pageEl ? pageEl.value : "";
  var btn = btnEl ? btnEl.value : "";
  var btnText = textEl ? textEl.value : "";
  if (!hexToRgb(page) || !hexToRgb(btn)) return null;
  if (!hexToRgb(btnText)) btnText = autoTextOn(btn);
  return { page: page, btn: btn, btnText: btnText };
}

function stripOwnPagePaint() {
  var html = document.documentElement;
  html.removeAttribute("data-custom-page");
  ["--custom-page-bg", "--custom-btn-text", "--page-gradient", "--btn-gradient", "--title-gradient"].forEach(function (k) {
    html.style.removeProperty(k);
  });
  ["--bg-primary", "--bg-secondary", "--bg-card", "--bg-input", "--text-primary", "--text-secondary", "--text-muted", "--accent", "--accent-light", "--accent-dark", "--accent-glow", "--border-color"].forEach(function (k) {
    html.style.removeProperty(k);
  });
}

function stripOwnCashierPaint() {
  var html = document.documentElement;
  html.removeAttribute("data-custom-cashier");
  ["--pos-bg-main", "--pos-bg-panel", "--pos-bg-sub", "--pos-bg-card", "--pos-text", "--pos-text-muted", "--pos-accent", "--pos-accent-light", "--pos-accent-dark", "--pos-accent-glow", "--pos-btn-text", "--pos-border"].forEach(function (k) {
    html.style.removeProperty(k);
  });
}

function applyOwnPageColors(cfg, silent) {
  if (!cfg) cfg = readOwnColorInputs({ page: "ownPagePage", btn: "ownPageBtn", text: "ownPageBtnText" });
  if (!cfg || !hexToRgb(cfg.page) || !hexToRgb(cfg.btn)) return;
  if (!cfg.btnText || !hexToRgb(cfg.btnText)) cfg.btnText = autoTextOn(cfg.btn);
  var html = document.documentElement;
  var page = cfg.page, btn = cfg.btn, btnText = cfg.btnText;
  var light = adjustColorBrightness(page, hexLuma(page) > 0.5 ? -8 : 14);
  var dark = adjustColorBrightness(page, hexLuma(page) > 0.5 ? -16 : -10);
  var card = mixHex(page, hexLuma(page) > 0.5 ? "#ffffff" : "#ffffff", hexLuma(page) > 0.5 ? 0.35 : 0.08);
  var ink = autoTextOn(page);
  html.setAttribute("data-custom-page", "1");
  html.style.setProperty("--custom-page-bg", page);
  html.style.setProperty("--bg-primary", page);
  html.style.setProperty("--bg-secondary", light);
  html.style.setProperty("--bg-card", card);
  html.style.setProperty("--bg-input", dark);
  html.style.setProperty("--text-primary", ink);
  html.style.setProperty("--text-secondary", mixHex(ink, page, 0.35));
  html.style.setProperty("--text-muted", mixHex(ink, page, 0.55));
  html.style.setProperty("--border-color", mixHex(page, btn, 0.28));
  html.style.setProperty("--page-gradient", "linear-gradient(165deg, " + page + " 0%, " + light + " 52%, " + mixHex(page, btn, 0.18) + " 100%)");
  html.style.setProperty("--accent", btn);
  html.style.setProperty("--accent-light", adjustColorBrightness(btn, 18));
  html.style.setProperty("--accent-dark", adjustColorBrightness(btn, -18));
  var rgb = hexToRgb(btn);
  html.style.setProperty("--accent-glow", "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.22)");
  html.style.setProperty("--custom-btn-text", btnText);
  html.style.setProperty("--btn-gradient", "linear-gradient(135deg, " + adjustColorBrightness(btn, 16) + " 0%, " + btn + " 48%, " + adjustColorBrightness(btn, -16) + " 100%)");
  html.style.setProperty("--title-gradient", "linear-gradient(90deg, " + ink + " 0%, " + btn + " 100%)");
  fillOwnColorInputs({ page: "ownPagePage", btn: "ownPageBtn", text: "ownPageBtnText" }, cfg);
  var hexInput = document.getElementById("setCustomThemeHex");
  var colorInput = document.getElementById("setCustomThemeColor");
  if (hexInput) hexInput.value = btn;
  if (colorInput) colorInput.value = btn;
  persistOwnColors("sam_pos_custom_page", cfg);
  if (!silent) toast("ڕەنگی پەڕەکانی POS", "ڕەنگی پەڕە و دوگمە جێبەجێکرا", "success");
}

function applyOwnCashierColors(cfg, silent) {
  if (!cfg) {
    cfg = readOwnColorInputs({ page: "ownCashPage", btn: "ownCashBtn", text: "ownCashBtnText" })
      || readOwnColorInputs({ page: "modalOwnCashPage", btn: "modalOwnCashBtn", text: "modalOwnCashBtnText" });
  }
  if (!cfg || !hexToRgb(cfg.page) || !hexToRgb(cfg.btn)) return;
  if (!cfg.btnText || !hexToRgb(cfg.btnText)) cfg.btnText = autoTextOn(cfg.btn);
  var html = document.documentElement;
  var page = cfg.page, btn = cfg.btn, btnText = cfg.btnText;
  var lightPage = hexLuma(page) > 0.55;
  html.setAttribute("data-custom-cashier", "1");
  html.classList.toggle("cashier-light", lightPage);
  html.style.setProperty("--pos-bg-main", page);
  html.style.setProperty("--pos-bg-panel", mixHex(page, "#ffffff", lightPage ? 0.55 : 0.1));
  html.style.setProperty("--pos-bg-sub", mixHex(page, lightPage ? "#ffffff" : "#000000", lightPage ? 0.28 : 0.12));
  html.style.setProperty("--pos-bg-card", mixHex(page, "#ffffff", lightPage ? 0.72 : 0.14));
  html.style.setProperty("--pos-text", autoTextOn(page));
  html.style.setProperty("--pos-text-muted", mixHex(autoTextOn(page), page, 0.4));
  html.style.setProperty("--pos-accent", btn);
  html.style.setProperty("--pos-accent-light", adjustColorBrightness(btn, 18));
  html.style.setProperty("--pos-accent-dark", adjustColorBrightness(btn, -18));
  var rgb = hexToRgb(btn);
  html.style.setProperty("--pos-accent-glow", "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.32)");
  html.style.setProperty("--pos-btn-text", btnText);
  html.style.setProperty("--pos-border", "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.35)");
  fillOwnColorInputs({ page: "ownCashPage", btn: "ownCashBtn", text: "ownCashBtnText" }, cfg);
  fillOwnColorInputs({ page: "modalOwnCashPage", btn: "modalOwnCashBtn", text: "modalOwnCashBtnText" }, cfg);
  persistOwnColors("sam_pos_custom_cashier", cfg);
  if (!silent) toast("ڕەنگی کاشێر", "ڕەنگی پەڕە و دوگمەی کاشێر جێبەجێکرا", "success");
}

function liveOwnPageColors() {
  applyOwnPageColors(null, true);
}

function liveOwnCashierColors() {
  applyOwnCashierColors(null, true);
}

function syncModalOwnCashier() {
  var cfg = readOwnColorInputs({ page: "modalOwnCashPage", btn: "modalOwnCashBtn", text: "modalOwnCashBtnText" });
  if (cfg) fillOwnColorInputs({ page: "ownCashPage", btn: "ownCashBtn", text: "ownCashBtnText" }, cfg);
}

function resetOwnPageColors() {
  stripOwnPagePaint();
  persistOwnColors("sam_pos_custom_page", null);
  toast("ڕەنگی پەڕەکانی POS", "گەڕایەوە بۆ ڕووکاری هەڵبژێردراو", "success");
}

function resetOwnCashierColors() {
  stripOwnCashierPaint();
  persistOwnColors("sam_pos_custom_cashier", null);
  var lux = document.documentElement.getAttribute("data-cashier-theme") || "royal-gold";
  syncCashierLightClass(lux);
  toast("ڕەنگی کاشێر", "گەڕایەوە بۆ ستایلی شاهانەی هەڵبژێردراو", "success");
}

function clearOwnPageColors(silent) {
  stripOwnPagePaint();
  persistOwnColors("sam_pos_custom_page", null);
}

function clearOwnCashierColors(silent) {
  stripOwnCashierPaint();
  if (!silent) persistOwnColors("sam_pos_custom_cashier", null);
}

window.applyOwnPageColors = applyOwnPageColors;
window.applyOwnCashierColors = applyOwnCashierColors;
window.liveOwnPageColors = liveOwnPageColors;
window.liveOwnCashierColors = liveOwnCashierColors;
window.syncModalOwnCashier = syncModalOwnCashier;
window.resetOwnPageColors = resetOwnPageColors;
window.resetOwnCashierColors = resetOwnCashierColors;

function applyCustomAccent(hexColor) {
  if (!hexColor || !hexColor.startsWith("#")) return;
  var rgb = hexToRgb(hexColor);
  if (!rgb) return;
  var light = adjustColorBrightness(hexColor, 20);
  var dark = adjustColorBrightness(hexColor, -20);
  var glow = "rgba(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", 0.28)";

  document.documentElement.style.setProperty("--accent", hexColor);
  document.documentElement.style.setProperty("--accent-light", light);
  document.documentElement.style.setProperty("--accent-dark", dark);
  document.documentElement.style.setProperty("--accent-glow", glow);

  try { localStorage.setItem("sam_pos_custom_accent", hexColor); } catch (e) {}
  if (typeof SqliteDB !== "undefined" && SqliteDB.setSetting) {
    SqliteDB.setSetting("custom_accent_color", hexColor);
  }
  if (typeof DB !== "undefined" && DB.settings) {
    DB.settings.customAccentColor = hexColor;
    if (typeof DataStore !== "undefined" && DataStore.saveSettings) DataStore.saveSettings();
  }

  var colorInput = document.getElementById("setCustomThemeColor");
  var hexInput = document.getElementById("setCustomThemeHex");
  if (colorInput) colorInput.value = hexColor;
  if (hexInput) hexInput.value = hexColor;

  document.querySelectorAll(".color-swatch-btn").forEach(function (btn) {
    var s = btn.getAttribute("style") || "";
    if (s.toLowerCase().includes(hexColor.toLowerCase())) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

function resetThemeColorToDefault() {
  document.documentElement.style.removeProperty("--accent");
  document.documentElement.style.removeProperty("--accent-light");
  document.documentElement.style.removeProperty("--accent-dark");
  document.documentElement.style.removeProperty("--accent-glow");

  try {
    localStorage.removeItem("sam_pos_custom_accent");
  } catch (e) {}
  if (typeof SqliteDB !== "undefined" && SqliteDB.setSetting) {
    SqliteDB.setSetting("custom_accent_color", "");
  }
  if (typeof DB !== "undefined" && DB.settings) {
    DB.settings.customAccentColor = "";
    if (typeof DataStore !== "undefined" && DataStore.saveSettings) DataStore.saveSettings();
  }
  document.querySelectorAll(".color-swatch-btn").forEach(function (b) { b.classList.remove("active"); });
  toast("سەرکەوتوو", "ڕەنگی گشتی گەڕێندرایەوە — ستایلی کاشێر وەک خۆی ماوە", "info");
}

function selectColorSwatch(hex) {
  var btn = document.getElementById("ownPageBtn");
  var hexInput = document.getElementById("setCustomThemeHex");
  var colorInput = document.getElementById("setCustomThemeColor");
  if (btn) btn.value = hex;
  if (hexInput) hexInput.value = hex;
  if (colorInput) colorInput.value = hex;
  if (typeof applyOwnPageColors === "function") applyOwnPageColors(null, false);
  else {
    applyCustomAccent(hex);
    toast("سەرکەوتوو", "ڕەنگی نوێ جێبەجێکرا: " + hex, "success");
  }
}

function syncCustomColorInput(val) {
  if (!val) return;
  var colorInput = document.getElementById("setCustomThemeColor");
  var hexInput = document.getElementById("setCustomThemeHex");
  if (val.startsWith("#") && (val.length === 4 || val.length === 7)) {
    if (colorInput && colorInput.value !== val) colorInput.value = val;
    if (hexInput && hexInput.value !== val) hexInput.value = val;
  }
}

function applyCustomThemeColorFromInputs() {
  var hexInput = document.getElementById("setCustomThemeHex");
  var colorInput = document.getElementById("setCustomThemeColor");
  var val = (hexInput ? hexInput.value.trim() : "") || (colorInput ? colorInput.value : "");
  if (!val.startsWith("#")) val = "#" + val;
  if (!hexToRgb(val)) {
    toast("هەڵە", "تکایە کۆدی ڕەنگی دروست بنووسە (وەک #10b981)", "error");
    return;
  }
  applyCustomAccent(val);
  toast("سەرکەوتوو", "ڕەنگی نوێ بە سەرکەوتوویی جێبەجێکرا", "success");
}

function loadTheme() {
  var saved = null;
  if (typeof SqliteDB !== "undefined" && SqliteDB.getSetting) saved = SqliteDB.getSetting("ui_theme", null);
  if (!saved) { try { saved = localStorage.getItem("sam_pos_ui_theme"); } catch (e) {} }
  if (saved) document.documentElement.setAttribute("data-theme", saved);

  var savedLux = null;
  if (typeof SqliteDB !== "undefined" && SqliteDB.getSetting) savedLux = SqliteDB.getSetting("cashier_lux_theme", null);
  if (!savedLux) { try { savedLux = localStorage.getItem("sam_pos_cashier_lux_theme"); } catch (e) {} }
  if (savedLux && LUXURY_CASHIER_THEMES.some(function (t) { return t.id === savedLux; })) {
    setCashierLuxuryTheme(savedLux, true);
  } else {
    setCashierLuxuryTheme("royal-gold", true);
  }

  var savedColor = null;
  if (typeof SqliteDB !== "undefined" && SqliteDB.getSetting) savedColor = SqliteDB.getSetting("custom_accent_color", null);
  if (!savedColor && typeof DB !== "undefined" && DB.settings && DB.settings.customAccentColor) savedColor = DB.settings.customAccentColor;
  if (!savedColor) { try { savedColor = localStorage.getItem("sam_pos_custom_accent"); } catch (e) {} }
  var customPage = readOwnColors("sam_pos_custom_page", "customPageColors");
  if (customPage && customPage.page) applyOwnPageColors(customPage, true);
  else if (savedColor) applyCustomAccent(savedColor);

  var customCash = readOwnColors("sam_pos_custom_cashier", "customCashierColors");
  if (customCash && customCash.page) applyOwnCashierColors(customCash, true);

  try {
    var cardStyle = localStorage.getItem("sam_pos_cashier_card_style") || "gold-vip";
    setCashierStyleOption("cardStyle", cardStyle, true);
    var gridCols = localStorage.getItem("sam_pos_cashier_grid_cols");
    if (gridCols) setCashierStyleOption("gridCols", gridCols, true);
    var layoutDir = localStorage.getItem("sam_pos_cashier_layout");
    if (layoutDir) setCashierStyleOption("layoutDir", layoutDir, true);
    var profitVis = localStorage.getItem("sam_pos_cashier_profit_vis") || "hidden";
    setCashierStyleOption("profitVis", profitVis, true);
    var usdVis = localStorage.getItem("sam_pos_cashier_usd_vis") || "visible";
    setCashierStyleOption("usdVis", usdVis, true);
  } catch (e) {}
  try { setReceiptStyle(getReceiptStyleId(), true); } catch (eBill) {}
  if (typeof loadPosViewPrefs === "function") loadPosViewPrefs();
}

function productFlagOn(p, key) {
  if (!p) return true;
  var v = p[key];
  if (v === false || v === 0 || v === "0" || v === "off" || v === "false") return false;
  return true;
}
function productTracksStock(p) { return productFlagOn(p, "trackStock"); }
function productTracksExpiry(p) { return productFlagOn(p, "trackExpiry"); }
function productTracksPack(p) { return productFlagOn(p, "trackPack"); }
function isProductQuickFavorite(p) {
  if (!p) return false;
  var v = p.quickFavorite;
  return v === true || v === 1 || v === "1" || v === "on" || v === "true";
}
function isQuickFavoriteFormOn(id, fallback) {
  var el = document.getElementById(id);
  if (!el) return fallback === true;
  return !!el.checked;
}
function getFavCategories() {
  if (typeof DB === "undefined" || !DB.settings) return [];
  var list = DB.settings.favCategories;
  if (typeof list === "string") {
    try { list = JSON.parse(list); } catch (e) { list = []; }
  }
  if (!Array.isArray(list)) list = [];
  list = list.filter(function (g) { return g && g.id && String(g.name || "").trim(); }).map(function (g) {
    return { id: String(g.id), name: String(g.name).trim() };
  });
  DB.settings.favCategories = list;
  return list;
}
function saveFavCategories() {
  if (typeof DB === "undefined") return;
  if (!DB.settings) DB.settings = {};
  if (typeof DataStore !== "undefined" && DataStore.saveSettings) {
    try { DataStore.saveSettings(); } catch (eSaveFav) {}
  }
}
function ensureDefaultFavCategory() {
  var list = getFavCategories();
  if (list.length) return list[0];
  if (typeof DB === "undefined") return { id: "fav_default", name: "دڵخواز" };
  if (!DB.settings) DB.settings = {};
  var g = { id: "fav_default", name: "دڵخواز" };
  list.push(g);
  DB.settings.favCategories = list;
  saveFavCategories();
  return g;
}
function favTabId(groupId) {
  return "fav:" + String(groupId || "").replace(/^fav:/, "");
}
function favGroupIdFromTab(tabId) {
  return String(tabId || "").replace(/^fav:/, "");
}
function isFavTabId(id) {
  return String(id || "").indexOf("fav:") === 0;
}
function getFavGroupById(id) {
  var want = String(id || "").trim();
  if (!want) return null;
  return getFavCategories().find(function (g) { return g.id === want; }) || null;
}
function getProductFavGroupId(p) {
  if (!isProductQuickFavorite(p)) return "";
  var id = String(p.favCatId || "").trim();
  if (id && getFavGroupById(id)) return id;
  var list = getFavCategories();
  return list.length ? list[0].id : "";
}
function applyFavGroupToProduct(p, groupId) {
  if (!p) return;
  var id = String(groupId || "").trim();
  if (!id) {
    p.quickFavorite = 0;
    p.quickFavoriteAt = 0;
    p.favCatId = "";
    return;
  }
  if (!getFavGroupById(id)) ensureDefaultFavCategory();
  if (!getFavGroupById(id)) {
    var created = ensureDefaultFavCategory();
    id = created.id;
  }
  p.quickFavorite = 1;
  p.quickFavoriteAt = Date.now();
  p.favCatId = id;
  LAST_FAV_GROUP_ID = id;
}
function favGroupSelectHtml(selectedId) {
  var sel = String(selectedId || "").trim();
  var html = '<option value="">هیچ — تەنها پۆلی ئاسایی</option>';
  getFavCategories().forEach(function (g) {
    html += '<option value="' + String(g.id).replace(/"/g, "") + '"' + (g.id === sel ? " selected" : "") + ">" + String(g.name).replace(/</g, "") + "</option>";
  });
  return html;
}
function fillFavGroupSelect(el, selectedId) {
  if (!el) return;
  var keep = selectedId != null ? String(selectedId) : String(el.value || "");
  if (keep === "__new__") keep = "";
  el.innerHTML = favGroupSelectHtml(keep);
  if (keep && getFavGroupById(keep)) el.value = keep;
  else el.value = "";
}
function fillAllFavGroupSelects(preferred) {
  ["pFavCategory", "qFavCategory", "newBcFavCategory", "excelFavCategory"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var keep = preferred != null ? preferred : el.value;
    fillFavGroupSelect(el, keep);
  });
}
function readFavGroupSelect(id) {
  var el = document.getElementById(id);
  if (!el) return "";
  var v = String(el.value || "").trim();
  if (v === "__new__") {
    var created = addNamedFavCategory(true);
    fillFavGroupSelect(el, created || "");
    return created || "";
  }
  return v;
}
function addNamedFavCategory(fromSelect) {
  var name = prompt("ناوی پۆلی دڵخواز بنووسە (نموونە: خێراکان، بەیانی):", fromSelect ? "" : "دڵخواز");
  if (name === null) return "";
  name = String(name).trim();
  if (!name) {
    if (typeof toast === "function") toast("ئاگاداری", "ناوی پۆلی دڵخواز پێویستە", "warning");
    return "";
  }
  var list = getFavCategories();
  var exists = list.find(function (g) { return g.name === name; });
  if (exists) {
    LAST_FAV_GROUP_ID = exists.id;
    fillAllFavGroupSelects(exists.id);
    if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
    return exists.id;
  }
  if (list.length >= 8) {
    if (typeof toast === "function") toast("ئاگاداری", "زیاتر لە ٨ پۆلی دڵخواز ناکرێت", "warning");
    return "";
  }
  var id = "fav_" + Date.now().toString(36);
  list.push({ id: id, name: name });
  if (typeof DB !== "undefined") {
    if (!DB.settings) DB.settings = {};
    DB.settings.favCategories = list;
  }
  saveFavCategories();
  LAST_FAV_GROUP_ID = id;
  fillAllFavGroupSelects(id);
  if (!fromSelect) POS_GRID_CATEGORY = favTabId(id);
  if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
  if (!fromSelect && typeof renderProductGrid === "function") renderProductGrid(POS_GRID_CATEGORY);
  if (typeof toast === "function") toast("سەرکەوتوو", "پۆلی دڵخواز دروستکرا: " + name, "success");
  return id;
}
function renameFavCategory(groupId) {
  var g = getFavGroupById(groupId);
  if (!g) return;
  var name = prompt("ناوی نوێی پۆلی دڵخواز (بەتاڵ = سڕینەوە):", g.name);
  if (name === null) return;
  name = String(name).trim();
  var list = getFavCategories();
  if (!name) {
    if (!confirm("ئەم پۆلی دڵخوازە بسڕدرێتەوە؟ کاڵاکان لە پۆلی ئاسایی دەمێننەوە.")) return;
    DB.settings.favCategories = list.filter(function (x) { return x.id !== g.id; });
    (DB.products || []).forEach(function (p) {
      if (String(p.favCatId || "") === g.id) applyFavGroupToProduct(p, "");
    });
    if (typeof DataStore !== "undefined" && DataStore.saveProducts) DataStore.saveProducts();
    saveFavCategories();
    if (isFavTabId(POS_GRID_CATEGORY) && favGroupIdFromTab(POS_GRID_CATEGORY) === g.id) POS_GRID_CATEGORY = "all";
    fillAllFavGroupSelects("");
    if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
    if (typeof renderProductGrid === "function") renderProductGrid(POS_GRID_CATEGORY);
    return;
  }
  g.name = name;
  DB.settings.favCategories = list.map(function (x) { return x.id === g.id ? g : x; });
  saveFavCategories();
  fillAllFavGroupSelects(g.id);
  if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
}
window.addNamedFavCategory = addNamedFavCategory;
window.renameFavCategory = renameFavCategory;
window.fillFavGroupSelect = fillFavGroupSelect;
window.fillAllFavGroupSelects = fillAllFavGroupSelects;
var LAST_FAV_GROUP_ID = "";
function migrateLegacyQuickFavorites() {
  if (migrateLegacyQuickFavorites._done) return;
  if (typeof DB === "undefined" || !Array.isArray(DB.products)) return;
  migrateLegacyQuickFavorites._done = true;
  var changed = 0;
  (DB.products || []).forEach(function (p) {
    if (!p) return;
    if (isProductQuickFavorite(p) && !String(p.favCatId || "").trim()) {
      p.quickFavorite = 0;
      p.quickFavoriteAt = 0;
      changed += 1;
    }
  });
  if (changed && typeof DataStore !== "undefined" && DataStore.saveProducts) {
    try { DataStore.saveProducts(); } catch (eMigFav) {}
  }
}
function deductProductStock(prod, pieces) {
  if (!prod || !productTracksStock(prod)) return;
  prod.stock = Math.max(0, (parseFloat(prod.stock) || 0) - (parseFloat(pieces) || 0));
}

function reduceStockForCart() {
  var currentCart = (typeof CUSTOMER_QUEUE !== "undefined" && typeof ACTIVE_CUSTOMER !== "undefined" && CUSTOMER_QUEUE[ACTIVE_CUSTOMER])
    ? CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart
    : CART;

  currentCart.forEach(function (c) {
    var prod = DB.products.find(function (p) { return p.id === c.prodId; });
    if (prod) {
      var isCarton = (c.unitType === "carton");
      var piecesToDeduct = isCarton ? (c.qty * (c.packQty || prod.packQty || 1)) : c.qty;
      deductProductStock(prod, piecesToDeduct);
    }
  });
  DataStore.saveProducts();
}

var PENDING_EXPIRED_CART_ITEM = null;

function getProductExpiryStatus(prod) {
  if (!prod || !productTracksExpiry(prod) || !prod.expiryDate) return { expired: false, nearExpiry: false, daysLeft: null };
  var expStr = String(prod.expiryDate).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expStr)) return { expired: false, nearExpiry: false, daysLeft: null };
  var now = new Date();
  var todayStr = now.toISOString().slice(0, 10);
  var todayMs = new Date(todayStr + "T00:00:00").getTime();
  var expMs = new Date(expStr + "T00:00:00").getTime();
  var daysLeft = Math.round((expMs - todayMs) / (1000 * 60 * 60 * 24));
  return {
    expired: expStr < todayStr,
    nearExpiry: expStr >= todayStr && daysLeft <= 7,
    daysLeft: daysLeft,
    expiryDate: expStr
  };
}

function forceAddExpiredToCart() {
  if (!PENDING_EXPIRED_CART_ITEM) {
    hideModal("expiredProductPosModal");
    return;
  }
  var item = PENDING_EXPIRED_CART_ITEM;
  PENDING_EXPIRED_CART_ITEM = null;
  hideModal("expiredProductPosModal");
  addToCart(item.pid, item.qty, item.unitType, true);
}

function updateExpiredDateAndAddToCart() {
  if (!PENDING_EXPIRED_CART_ITEM) return;
  var newDateInput = $("#expiredPosNewDateInput");
  var newDate = newDateInput ? newDateInput.value.trim() : "";
  var todayStr = new Date().toISOString().slice(0, 10);
  if (!newDate || newDate < todayStr) {
    toast("هەڵە", "تکایە بەروارێکی نوێی دروست (لە ئەمڕۆ بەدواوە) هەڵبژێرە", "error");
    return;
  }
  var prod = DB.products.find(function (p) { return p.id === PENDING_EXPIRED_CART_ITEM.pid; });
  if (prod) {
    prod.expiryDate = newDate;
    DataStore.saveProducts();
    if (typeof ApiClient !== "undefined" && typeof ApiClient.saveProduct === "function") {
      ApiClient.saveProduct(prod).catch(function () {});
    }
    if (typeof updateHeaderExpiryBadge === "function") updateHeaderExpiryBadge();
    toast("سەرکەوتوو", "بەرواری بەسەرچوونی (" + prod.name + ") نوێکرایەوە بۆ " + newDate, "success");
  }
  var item = PENDING_EXPIRED_CART_ITEM;
  PENDING_EXPIRED_CART_ITEM = null;
  hideModal("expiredProductPosModal");
  addToCart(item.pid, item.qty, item.unitType, true);
}

function addToCart(pid, qty, unitType, bypassExpiryCheck) {
  if (typeof isPosOrderPaperOpen === "function" && isPosOrderPaperOpen()) return;
  if (typeof CUSTOMER_QUEUE === "undefined" || !CUSTOMER_QUEUE[ACTIVE_CUSTOMER]) {
    if (typeof CUSTOMER_QUEUE === "undefined") CUSTOMER_QUEUE = {};
    if (!ACTIVE_CUSTOMER) ACTIVE_CUSTOMER = "default";
    if (!CUSTOMER_QUEUE[ACTIVE_CUSTOMER]) CUSTOMER_QUEUE[ACTIVE_CUSTOMER] = { name: "کڕیار 1", cart: [] };
  }
  var prod = DB.products.find(function (p) { return p.id === pid; });
  if (!prod) {
    toast("هەڵە", "کاڵاکە نەدۆزرایەوە!", "error");
    if (typeof PosAudio !== "undefined") PosAudio.playErrorBuzz();
    return;
  }

  // Check Expiry Date Protection before adding to cart
  var expStatus = getProductExpiryStatus(prod);
  if (expStatus.expired && !bypassExpiryCheck) {
    PENDING_EXPIRED_CART_ITEM = { pid: pid, qty: qty, unitType: unitType };
    if (typeof PosAudio !== "undefined" && typeof PosAudio.playErrorBuzz === "function") {
      PosAudio.playErrorBuzz();
    }
    var nameEl = $("#expiredPosProdName");
    var badgeEl = $("#expiredPosDateBadge");
    var newDateEl = $("#expiredPosNewDateInput");
    if (nameEl) nameEl.textContent = prod.name;
    if (badgeEl) {
      var daysAgo = Math.abs(expStatus.daysLeft || 0);
      badgeEl.textContent = "بەسەرچووە لە: " + expStatus.expiryDate + (daysAgo > 0 ? " (" + daysAgo + " ڕۆژ پێش ئێستا)" : "");
    }
    if (newDateEl) newDateEl.value = "";
    showModal("expiredProductPosModal");
    setTimeout(function () {
      var rejectBtn = $("#expiredPosRejectBtn");
      if (rejectBtn) rejectBtn.focus();
    }, 80);
    return;
  } else if (expStatus.nearExpiry && !bypassExpiryCheck) {
    var msgDays = expStatus.daysLeft === 0 ? "ئەمڕۆ کۆتا ڕۆژی بەکارهێنانێتی!" : ("تەنها " + expStatus.daysLeft + " ڕۆژی ماوە بۆ بەسەرچوون!");
    toast("ئاگاداری بەسەرچوون", prod.name + " — " + msgDays + " (" + expStatus.expiryDate + ")", "warning");
  }

  if (productTracksStock(prod) && prod.stock <= 0) {
    toast("ئاگاداری کۆگا", "بڕی ئەم کاڵایە لە کۆگادا سفرە یان کەمە بەڵام زیادکرا بۆ سەبەتە (" + prod.name + ")", "warning");
  }
  var pendingQty = (typeof getPendingScanQty === "function") ? getPendingScanQty() : 1;
  var quantity;
  if (qty !== undefined && qty !== null) {
    quantity = parseFloat(qty);
    if (!isNaN(quantity) && quantity === 1 && pendingQty > 1) quantity = pendingQty;
  } else {
    quantity = pendingQty;
  }
  if (isNaN(quantity) || quantity <= 0) quantity = 1;

  unitType = (unitType === 'carton') ? 'carton' : 'piece';

  // Prompt for manual weight ONLY if item is weighted and sold as piece without explicit qty
  if (unitType === 'piece' && (prod.unit === "kg" || prod.unit === "gram" || prod.isScaleItem) && (qty === undefined || qty === null) && pendingQty === 1) {
    WEIGHTED_PRODUCT = prod;
    $("#weightUnit").textContent = prod.unit === "gram" ? "گرام" : "کگم";
    $("#cartWeightInput").style.display = "flex";
    $("#weightInput").value = "";
    $("#weightInput").focus();
    return;
  }

  var currentCart = CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart;
  var cartItemId = pid + "_" + unitType;
  var ex = currentCart.find(function (i) { return (i.cartItemId === cartItemId) || (i.prodId === pid && (i.unitType || 'piece') === unitType); });

  var isCarton = (unitType === 'carton');
  var packQty = prod.packQty || 1;
  var clearanceDisc = (!isCarton && prod.clearanceDiscount > 0) ? prod.clearanceDiscount : 0;
  var regularPiecePrice = (clearanceDisc > 0 && prod.clearancePrice > 0)
    ? prod.clearancePrice
    : (clearanceDisc > 0 ? Math.round(prod.price * (1 - clearanceDisc / 100)) : prod.price);

  var activeOfferPrice = (!isCarton && typeof getActiveOfferPrice === "function") ? getActiveOfferPrice(prod) : null;
  if (activeOfferPrice !== null && activeOfferPrice > 0) {
    regularPiecePrice = activeOfferPrice;
  }

  var itemPrice = isCarton ? (prod.packPrice > 0 ? prod.packPrice : (prod.price * packQty)) : regularPiecePrice;
  var itemCost = isCarton ? (prod.packCost > 0 ? prod.packCost : ((prod.cost || 0) * packQty)) : (prod.cost || 0);

  if (ex) {
    ex.qty = Math.round((ex.qty + quantity) * 1000) / 1000;
  } else {
    currentCart.push({
      cartItemId: cartItemId,
      prodId: prod.id,
      name: prod.name,
      price: itemPrice,
      originalPrice: isCarton ? (prod.packPrice > 0 ? prod.packPrice : (prod.price * packQty)) : prod.price,
      cost: itemCost,
      image: prod.image || "",
      qty: Math.round(quantity * 1000) / 1000,
      unitType: unitType,
      unit: isCarton ? "carton" : (prod.unit || "piece"),
      packQty: packQty,
      clearanceDiscount: clearanceDisc,
      offerActive: (activeOfferPrice !== null && activeOfferPrice > 0),
      offerPrice: (activeOfferPrice !== null && activeOfferPrice > 0) ? activeOfferPrice : 0
    });
  }
  SELECTED_CART_ITEM_ID = cartItemId;
  renderCart();

  if (typeof resetPendingScanQty === "function") resetPendingScanQty();

  if (typeof PosAudio !== "undefined") {
    if (typeof PosAudio.playScanBeep === "function") PosAudio.playScanBeep();
    else if (typeof PosAudio.playBeep === "function") PosAudio.playBeep();
  }
}

function cartUnitSwitcherHtml(itemId, isCarton, packQty) {
  packQty = parseInt(packQty, 10) || 1;
  var esc = String(itemId || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return '<div class="cart-unit-switch" role="group" aria-label="دانە یان کارتۆن" onclick="event.stopPropagation()">' +
    '<button type="button" class="cart-unit-btn is-piece' + (!isCarton ? " is-on" : "") + '" onclick="event.stopPropagation();toggleCartItemUnit(\'' + esc + '\', \'piece\')" title="فرۆشتن بە دانە">' +
      '<i class="fas fa-cube"></i><span>دانە</span>' +
    "</button>" +
    '<button type="button" class="cart-unit-btn is-carton' + (isCarton ? " is-on" : "") + '" onclick="event.stopPropagation();toggleCartItemUnit(\'' + esc + '\', \'carton\')" title="فرۆشتن بە کارتۆن — ' + packQty + ' دانە لەناو یەک کارتۆن">' +
      '<i class="fas fa-boxes"></i><span>کارتۆن</span><em>' + packQty + "</em>" +
    "</button>" +
  "</div>";
}

function toggleCartItemUnit(cartItemId, targetUnit) {
  var currentCart = CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart;
  var item = currentCart.find(function (c) { return c.cartItemId === cartItemId || c.prodId === cartItemId; });
  if (!item) return;

  var prod = DB.products.find(function (p) { return p.id === item.prodId; });
  if (!prod) return;

  targetUnit = (targetUnit === 'carton') ? 'carton' : 'piece';
  if ((item.unitType || 'piece') === targetUnit) return;

  var isCarton = (targetUnit === 'carton');
  var packQty = prod.packQty || 1;
  var newPrice = isCarton ? (prod.packPrice > 0 ? prod.packPrice : (prod.price * packQty)) : prod.price;
  var newCost = isCarton ? (prod.packCost > 0 ? prod.packCost : ((prod.cost || 0) * packQty)) : (prod.cost || 0);

  var newCartItemId = item.prodId + "_" + targetUnit;
  var existingOther = currentCart.find(function (c) { return (c.cartItemId === newCartItemId) && c !== item; });

  if (existingOther) {
    existingOther.qty += item.qty;
    CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart = currentCart.filter(function (c) { return c !== item; });
  } else {
    item.cartItemId = newCartItemId;
    item.unitType = targetUnit;
    item.unit = isCarton ? "carton" : (prod.unit || "piece");
    item.price = newPrice;
    item.cost = newCost;
    item.packQty = packQty;
  }

  if (typeof PosAudio !== "undefined") PosAudio.playScanBeep();
  renderCart(); 
}

var SESSION_VOID_COUNT = 0;

function trackItemVoid(item) {
  if (!item) return;
  SESSION_VOID_COUNT++;
  var amount = (item.price || 0) * (item.qty || 1);
  var shiftId = (typeof CURRENT_SHIFT !== 'undefined' && CURRENT_SHIFT) ? CURRENT_SHIFT.id : null;
  var cashierName = (DB.currentUser && (DB.currentUser.fullName || DB.currentUser.username)) || 'کاشیر';

  fetch('/api/security/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shiftId: shiftId,
      cashier: cashierName,
      actionType: 'item_void',
      severity: (SESSION_VOID_COUNT >= 3 || amount >= 10000) ? 'high' : 'medium',
      details: 'سڕینەوەی کاڵا لە سەبەتە: [' + item.name + '] بڕ: ' + item.qty + ' ' + (item.unit || 'دانە') + ' بە بەهای ' + fmt(amount),
      amount: amount,
      reason: 'سڕینەوە لە لایەن کاشیر'
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(res) {
    if (typeof updateHeaderSecurityBadge === 'function') updateHeaderSecurityBadge();
    if (res.isPatternSuspicious || SESSION_VOID_COUNT >= 3) {
      if (typeof PosAudio !== 'undefined' && PosAudio.playCashChime) PosAudio.playCashChime();
      toast('🚨 ئاگاداری چاودێری ئاسایش', 'سڕینەوەی بەردەوامی کاڵا (' + SESSION_VOID_COUNT + ' جار) تۆمارکرا و بۆ خاوەن مارکێت نێردرا!', 'warning');
    }
  })
  .catch(function(){});
}

function removeFromCart(id) {
  var currentCart = CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart;
  var itemToRemove = currentCart.find(function (c) { return c.cartItemId === id || c.prodId === id; });
  if (itemToRemove) {
    trackItemVoid(itemToRemove);
  }
  CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart = currentCart.filter(function (c) { return c.cartItemId !== id && c.prodId !== id; });
  renderCart();
}

var SELECTED_CART_ITEM_ID = "";

function selectCartLine(itemId) {
  SELECTED_CART_ITEM_ID = String(itemId || "");
  if (typeof renderCart === "function") renderCart();
}
window.selectCartLine = selectCartLine;

function getSelectedCartItemId() {
  var queue = (typeof CUSTOMER_QUEUE !== "undefined" && typeof ACTIVE_CUSTOMER !== "undefined") ? CUSTOMER_QUEUE[ACTIVE_CUSTOMER] : null;
  var cart = (queue && queue.cart) || [];
  if (!cart.length) return "";
  if (SELECTED_CART_ITEM_ID) {
    var found = cart.find(function (c) {
      return c.cartItemId === SELECTED_CART_ITEM_ID || c.prodId === SELECTED_CART_ITEM_ID;
    });
    if (found) return found.cartItemId || found.prodId;
  }
  var last = cart[cart.length - 1];
  return last.cartItemId || last.prodId || "";
}

function adjustSelectedCartQty(delta) {
  var id = getSelectedCartItemId();
  if (!id) return;
  SELECTED_CART_ITEM_ID = id;
  if (typeof changeQty === "function") changeQty(id, delta);
}
window.adjustSelectedCartQty = adjustSelectedCartQty;

function changeQty(id, delta) {
  var currentCart = CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart;
  var item = currentCart.find(function (c) { return c.cartItemId === id || c.prodId === id; });
  if (!item) return;
  SELECTED_CART_ITEM_ID = item.cartItemId || id;
  var isWeighted = (item.unit === "kg" || item.unit === "gram");
  var step = isWeighted ? (delta > 0 ? 0.25 : -0.25) : delta;
  item.qty = Math.round((item.qty + step) * 1000) / 1000;
  if (item.qty <= 0) {
    trackItemVoid(item);
    CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart = currentCart.filter(function (c) { return c !== item; });
  }
  renderCart();
}

function setQty(id, value) {
  var currentCart = CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart;
  var item = currentCart.find(function (i) { return i.cartItemId === id || i.prodId === id; });
  if (!item) return;
  var newQty = parseFloat(value);
  if (isNaN(newQty) || newQty <= 0) {
    trackItemVoid(item);
    CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart = currentCart.filter(function (c) { return c !== item; });
  } else {
    item.qty = Math.round(newQty * 1000) / 1000;
  }
  renderCart();
}

function renderCart() {
  if (typeof renderCartTable === "function") {
    renderCartTable();
  }
  var container = $("#cartItems");
  var countEl = $("#cartCount") || $("#cartItemsCount");
  var subtotalEl = $("#cartSubtotal") || $("#summarySubtotal");
  var discountEl = $("#cartDiscountAmt") || $("#summaryDiscount");
  var totalEl = $("#cartTotal") || $("#summaryGrandTotal");
  var checkoutBtn = $("#checkoutBtn");
  var currentCart = (CUSTOMER_QUEUE[ACTIVE_CUSTOMER] && CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart) || [];
  var totalItems = currentCart.reduce(function (s, c) { return s + c.qty; }, 0);
  var subtotal = currentCart.reduce(function (s, c) { return s + c.price * c.qty; }, 0);
  var totalCost = currentCart.reduce(function (s, c) { return s + (c.cost || 0) * c.qty; }, 0);
  var discPct = getPosDiscountPct();
  var discAmt = Math.round((subtotal * discPct) / 100);
  var total = subtotal - discAmt;
  var profit = total - totalCost;
  if (countEl) countEl.textContent = (totalItems % 1 === 0) ? totalItems : totalItems.toFixed(2);
  if (subtotalEl) subtotalEl.textContent = fmt(subtotal);
  if (discountEl) discountEl.textContent = fmt(discAmt);
  if (totalEl) totalEl.textContent = fmt(total);
  if (checkoutBtn) checkoutBtn.disabled = currentCart.length === 0;
  var cartProfitEl = $("#cartProfit") || $("#headerProfitAmount");
  if (cartProfitEl) {
    cartProfitEl.textContent = fmt(profit);
    cartProfitEl.style.color = profit >= 0 ? "var(--success)" : "var(--danger)";
  }
  if (!container) return;
  if (currentCart.length === 0) {
    container.innerHTML = '<div class="cart-empty" id="cartBody">' + getCartEmptyInnerHtml() + '</div>';
    return;
  }
  container.innerHTML = currentCart.map(function (c) {
    var prod = DB.products.find(function (p) { return p.id === c.prodId; });
    var itemId = c.cartItemId || (c.prodId + "_" + (c.unitType || "piece"));
    c.cartItemId = itemId;
    var isCarton = (c.unitType === "carton");
    var hasPack = prod && (prod.packQty > 1 || prod.packPrice > 0);

    var imgUrl = getImageSrc(prod ? prod.id : null, prod ? prod.image : (c.image || ""));
    var thumbHtml;
    if (imgUrl) {
      thumbHtml = buildImageHtml(prod ? prod.id : "cart", c.name, prod ? prod.image : (c.image || ""));
    } else {
      thumbHtml = '<i class="fas fa-box"></i>';
    }
    var itemProfit = (c.price - (c.cost || 0)) * c.qty;
    var profitColor = itemProfit >= 0 ? "var(--success)" : "var(--danger)";
    var qtyVal = (typeof c.qty === "number") ? ((c.qty % 1 === 0) ? c.qty : c.qty.toFixed(3).replace(/\.?0+$/, '')) : c.qty;
    var isWeighted = (c.unit === "kg" || c.unit === "gram");
    var qtyStep = isWeighted ? 'min="0.01" step="0.05"' : 'min="1" step="1"';
    var qtyDisplay = isWeighted ? (qtyVal + " " + (c.unit === "kg" ? "کگ" : "گرام")) : qtyVal;

    var unitSwitcher = hasPack ? cartUnitSwitcherHtml(itemId, isCarton, c.packQty || prod.packQty) : "";

    var packLabel = (!hasPack && isCarton)
      ? ' <span style="background:rgba(59,130,246,0.2);color:#38bdf8;font-size:0.7rem;padding:2px 6px;border-radius:4px;font-weight:800;display:inline-block;margin-right:4px;"><i class="fas fa-box"></i> کارتۆن</span>'
      : '';
    var clearanceLabel = (c.clearanceDiscount > 0)
      ? ' <span style="background:rgba(239,68,68,0.2);color:#f87171;font-size:0.68rem;padding:1px 5px;border-radius:4px;font-weight:800;display:inline-block;margin-right:4px;"><i class="fas fa-tag"></i> پاکتاو -%' + c.clearanceDiscount + '</span>'
      : '';

    return '<div class="cart-item">' +
      '<div class="cart-item-img">' + thumbHtml + '</div>' +
      '<div class="item-name">' +
        '<div>' + c.name + packLabel + clearanceLabel + (isWeighted ? ' <span style="font-size:0.75rem;color:#f59e0b;font-weight:700;">(' + qtyDisplay + ')</span>' : '') + '</div>' +
        unitSwitcher +
      '</div>' +
      '<div class="item-qty">' +
        '<button class="qty-btn" onclick="changeQty(\'' + itemId + '\',-1)">-</button>' +
        '<input type="number" class="qty-input" value="' + qtyVal + '" ' + qtyStep + ' onchange="setQty(\'' + itemId + '\',this.value)" onclick="this.select()">' +
        '<button class="qty-btn" onclick="changeQty(\'' + itemId + '\',1)">+</button>' +
      '</div>' +
      '<div class="item-price">' + fmt(c.price * c.qty) + '</div>' +
      '<div class="item-profit" style="font-size:0.65rem;color:' + profitColor + ';min-width:50px;text-align:left;">' + fmt(itemProfit) + '</div>' +
      '<button class="remove-btn" onclick="removeFromCart(\'' + itemId + '\')"><i class="fas fa-times"></i></button>' +
    '</div>';
  }).join("");
  if (typeof renderCartTable === "function") renderCartTable();
}

function showScanPopup(code, status, ok) {
  if (ok) return;
  var popup = $("#scanPopup");
  if (!popup) return;
  $("#scanPopupCode").textContent = code;
  $("#scanPopupStatus").textContent = status;
  popup.className = "scan-popup show error";
  setTimeout(function () { popup.className = "scan-popup"; }, 2200);
}

function toAsciiDigits(value) {
  return String(value == null ? "" : value)
    .replace(/[\u0660-\u0669]/g, function (ch) {
      return String.fromCharCode(48 + (ch.charCodeAt(0) - 0x0660));
    })
    .replace(/[\u06F0-\u06F9]/g, function (ch) {
      return String.fromCharCode(48 + (ch.charCodeAt(0) - 0x06F0));
    });
}

function hidScanChar(e) {
  if (!e || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return "";
  var code = e.code || "";
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (code === "NumpadDecimal" || code === "Period") return ".";
  if (code === "Comma") return ".";
  if (code === "Minus" || code === "NumpadSubtract") return "-";
  if (code === "Slash" || code === "NumpadDivide") return "/";
  if (code === "NumpadMultiply") return "*";
  if (code === "Digit8" && (e.shiftKey || e.key === "*")) return "*";
  if (code === "Equal" && e.shiftKey) return "+";
  var k = toAsciiDigits(e.key || "");
  if (k.length === 1 && /^[0-9A-Za-z.\-\/*+]$/.test(k)) return k.toUpperCase();
  var kc = e.keyCode || e.which || 0;
  if (kc >= 96 && kc <= 105) return String(kc - 96);
  if (kc >= 48 && kc <= 57 && !e.shiftKey) return String.fromCharCode(kc);
  if (kc >= 65 && kc <= 90) return String.fromCharCode(kc);
  return "";
}

function hidScanIsTerminator(e) {
  if (!e) return false;
  var key = e.key;
  var code = e.code || "";
  return key === "Enter" || key === "Tab" || code === "Enter" || code === "NumpadEnter" || code === "Tab";
}

var HID_SCAN_FIELD_IDS = {
  headerSearchInput: 1,
  barcodeInput: 1,
  posSearch: 1,
  barcodeSearchFilter: 1,
  newBcNumber: 1,
  pBarcode: 1,
  pPackBarcode: 1,
  purchaseItemSearchInput: 1,
  priceCheckerInput: 1,
  returnOrderSearch: 1,
  manualBarcodeInput: 1,
  quickProdBarcode: 1,
  quickProdPackBarcode: 1
};

function isKeyboardTypingTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  var tag = (el.tagName || "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT" || tag === "OPTION") return true;
  if (tag !== "INPUT") return false;
  var type = (el.type || "text").toLowerCase();
  if (type === "button" || type === "submit" || type === "reset" || type === "hidden" || type === "image") return false;
  return true;
}

function isHidScanDumpField(el) {
  if (!el) return false;
  if (el.id && HID_SCAN_FIELD_IDS[el.id]) return true;
  if (el.getAttribute && el.getAttribute("data-scan-field") === "1") return true;
  if (el.classList && el.classList.contains("pos-barcode-hidden")) return true;
  return false;
}

function hidScanShouldLeaveKeys(el) {
  if (!isKeyboardTypingTarget(el)) return false;
  var type = ((el && el.type) || "").toLowerCase();
  if (type === "checkbox" || type === "radio" || type === "range" || type === "color" ||
      type === "file" || type === "date" || type === "datetime-local" || type === "time" || type === "month") {
    return true;
  }
  return !isHidScanDumpField(el);
}

window.isKeyboardTypingTarget = isKeyboardTypingTarget;
window.isHidScanDumpField = isHidScanDumpField;
window.isPosCardChoiceOpen = isPosCardChoiceOpen;
window.handlePosCardSale = handlePosCardSale;
window.confirmPosCardPayment = confirmPosCardPayment;
window.closePosCardChoice = closePosCardChoice;

function isPosLoginActive() {
  var login = document.getElementById("loginPage");
  return !!(login && login.classList.contains("active"));
}

function normalizeScannedCode(code) {
  var s = toAsciiDigits(code);
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "");
  s = String(s).replace(/[\r\n\t]/g, "").trim().replace(/\s+/g, "");
  s = s.replace(/^\][A-Za-z0-9]{2}/, "");
  if (/^[0-9]*\.?[0-9]+e[+\-]?[0-9]+$/i.test(s)) {
    var sci = Number(s);
    if (isFinite(sci) && sci > 0) s = String(Math.round(sci));
  }
  return s;
}

function productBarcodeText(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && isFinite(value)) {
    return String(Math.round(Math.abs(value)));
  }
  return normalizeScannedCode(value);
}

function barcodesMatch(a, b) {
  a = productBarcodeText(a);
  b = productBarcodeText(b);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.toLowerCase() === b.toLowerCase()) return true;
  var da = a.replace(/\D/g, "");
  var db = b.replace(/\D/g, "");
  if (!da || !db) return false;
  if (da === db) return true;
  var za = da.replace(/^0+/, "") || "0";
  var zb = db.replace(/^0+/, "") || "0";
  if (za === zb) return true;
  if (da.length === 13 && db.length === 12 && da.slice(0, 12) === db) return true;
  if (db.length === 13 && da.length === 12 && db.slice(0, 12) === da) return true;
  if (da.length === 13 && db.length === 13 && da.slice(0, 12) === db.slice(0, 12)) return true;
  if (da.length === 12 && db.length === 13 && ("0" + da) === db) return true;
  if (db.length === 12 && da.length === 13 && ("0" + db) === da) return true;
  var minLen = Math.min(da.length, db.length);
  var maxDiff = minLen >= 8 ? 5 : 2;
  if (da.length >= 6 && db.length >= 6 && Math.abs(da.length - db.length) <= maxDiff) {
    if (da.length > db.length && da.slice(-db.length) === db) return true;
    if (db.length > da.length && db.slice(-da.length) === da) return true;
    if (da.length > db.length && da.slice(0, db.length) === db) return true;
    if (db.length > da.length && db.slice(0, da.length) === da) return true;
  }
  return false;
}

function productScanDigitCodes(p) {
  if (!p) return [];
  var out = [];
  [p.barcode, p.packBarcode, p.scaleCode].forEach(function (raw) {
    var d = productBarcodeText(raw).replace(/\D/g, "");
    if (d && out.indexOf(d) < 0) out.push(d);
  });
  return out;
}

function findProductByFuzzyScan(code) {
  var d = productBarcodeText(code).replace(/\D/g, "");
  if (d.length < 6 || typeof DB === "undefined" || !DB.products) return null;
  var hits = [];
  var seen = {};
  for (var i = 0; i < DB.products.length; i++) {
    var p = DB.products[i];
    if (!p || !p.id || seen[p.id]) continue;
    var codes = productScanDigitCodes(p);
    for (var c = 0; c < codes.length; c++) {
      var pd = codes[c];
      if (pd.length < 6) continue;
      var ok = false;
      if (pd === d) ok = true;
      else {
        var maxDiff = Math.min(pd.length, d.length) >= 8 ? 5 : 2;
        if (Math.abs(pd.length - d.length) <= maxDiff) {
          if (pd.length >= d.length && (pd.slice(-d.length) === d || pd.slice(0, d.length) === d)) ok = true;
          else if (d.length > pd.length && (d.slice(-pd.length) === pd || d.slice(0, pd.length) === pd)) ok = true;
        }
      }
      if (ok) {
        seen[p.id] = true;
        hits.push(p);
        break;
      }
    }
  }
  return hits.length === 1 ? hits[0] : null;
}

function harvestHeaderSearchCode() {
  if (typeof isBarcodeStudioActive === "function" && isBarcodeStudioActive()) {
    var studioEl = document.getElementById("barcodeSearchFilter") || document.getElementById("newBcNumber");
    if (studioEl && studioEl.value) return normalizeScannedCode(studioEl.value);
  }
  var el = document.getElementById("headerSearchInput") || document.getElementById("barcodeInput");
  if (!el) return "";
  return normalizeScannedCode(el.value);
}

function expandScanCodeCandidates(primary, extra) {
  var out = [];
  function addOnce(s) {
    s = normalizeScannedCode(s);
    if (!s) return;
    if (out.indexOf(s) < 0) out.push(s);
  }
  function add(s) {
    addOnce(s);
    var d = productBarcodeText(s).replace(/\D/g, "");
    if (d) addOnce(d);
    if (d.length === 13) {
      addOnce(d.slice(0, 12));
      addOnce(d.slice(1));
    } else if (d.length === 12) {
      addOnce("0" + d);
    } else if (d.length === 14 && d.charAt(0) === "0") {
      addOnce(d.slice(1));
    } else if (d.length > 13) {
      addOnce(d.slice(-13));
      addOnce(d.slice(-12));
      addOnce(d.slice(0, 13));
    }
  }
  add(primary);
  add(extra);
  var a = normalizeScannedCode(primary);
  var b = normalizeScannedCode(extra);
  var bd = b ? b.replace(/\D/g, "") : "";
  if (a && b && a !== b && bd.length >= 6) {
    addOnce(b + a);
    addOnce(a + b);
    var max = Math.min(a.length, b.length);
    var ov = 0;
    for (var i = 1; i <= max; i++) {
      if (b.slice(-i) === a.slice(0, i)) ov = i;
    }
    if (ov) addOnce(b + a.slice(ov));
  }
  return out;
}

function pickBestScannedCode(primary, extra) {
  var cands = expandScanCodeCandidates(primary, extra);
  var i2;
  for (i2 = 0; i2 < cands.length; i2++) {
    if (findProductByScannedCode(cands[i2])) return cands[i2];
  }
  return normalizeScannedCode(primary) || normalizeScannedCode(extra) || "";
}

function findScannedProductAny(primary, extra) {
  hydrateProductsFromLocalStore();
  try { if (typeof normalizeStoredProductBarcodes === "function") normalizeStoredProductBarcodes(); } catch (eN) {}
  var cands = expandScanCodeCandidates(primary, extra);
  var i;
  for (i = 0; i < cands.length; i++) {
    var hit = findProductByScannedCode(cands[i]);
    if (hit) return { prod: hit, code: cands[i] };
  }
  return null;
}

function hydrateProductsFromLocalStore() {
  try {
    if (typeof SqliteDB !== "undefined" && typeof SqliteDB.getProducts === "function") {
      var list = SqliteDB.getProducts();
      var cur = (DB.products || []).length;
      if (Array.isArray(list) && list.length) {
        if (cur > 50 && list.length < Math.floor(cur * 0.5)) return;
        DB.products = (typeof mergeCatalogProducts === "function")
          ? mergeCatalogProducts(list, DB.products || [])
          : list;
      }
    }
  } catch (eHydra) {}
}

function findProductByScannedCode(code) {
  code = normalizeScannedCode(code);
  if (!code || typeof DB === "undefined" || !DB.products) return null;
  var exact = DB.products.find(function (p) {
    if (!p) return false;
    return barcodesMatch(p.barcode, code) ||
           barcodesMatch(p.packBarcode, code) ||
           barcodesMatch(p.scaleCode, code) ||
           String(p.id) === code;
  }) || null;
  if (exact) return exact;
  return findProductByFuzzyScan(code);
}

function findProductByScannedCodeFresh(code) {
  hydrateProductsFromLocalStore();
  try { if (typeof normalizeStoredProductBarcodes === "function") normalizeStoredProductBarcodes(); } catch (eN) {}
  return findProductByScannedCode(code);
}

function rememberServerProduct(prod) {
  if (!prod || !prod.id) return prod;
  if (!DB.products) DB.products = [];
  if (prod.barcode) prod.barcode = normalizeScannedCode(prod.barcode);
  if (prod.packBarcode) prod.packBarcode = normalizeScannedCode(prod.packBarcode);
  if (prod.scaleCode) prod.scaleCode = normalizeScannedCode(prod.scaleCode);
  var idx = -1;
  for (var i = 0; i < DB.products.length; i++) {
    if (DB.products[i] && DB.products[i].id === prod.id) { idx = i; break; }
  }
  if (idx >= 0) {
    var prev = DB.products[idx];
    var merged = Object.assign({}, prev, prod);
    if (!merged.barcode && prev.barcode) merged.barcode = prev.barcode;
    if (!merged.packBarcode && prev.packBarcode) merged.packBarcode = prev.packBarcode;
    if ((!merged.image || merged.image === "") && prev.image) merged.image = prev.image;
    DB.products[idx] = merged;
    prod = merged;
  } else {
    DB.products.push(prod);
  }
  if (typeof DataStore !== "undefined" && DataStore.saveProducts) DataStore.saveProducts();
  return prod;
}

var PENDING_UNKNOWN_SCAN = { code: "", timer: null, seq: 0 };

function clearPendingUnknownScan() {
  PENDING_UNKNOWN_SCAN.code = "";
  PENDING_UNKNOWN_SCAN.seq += 1;
  if (PENDING_UNKNOWN_SCAN.timer) {
    clearTimeout(PENDING_UNKNOWN_SCAN.timer);
    PENDING_UNKNOWN_SCAN.timer = null;
  }
  if (UNKNOWN_SCAN_WARN_TIMER) {
    clearTimeout(UNKNOWN_SCAN_WARN_TIMER);
    UNKNOWN_SCAN_WARN_TIMER = null;
  }
  var flash = document.getElementById("posUnknownScanFlash");
  if (flash) {
    flash.classList.remove("show");
    flash.setAttribute("aria-hidden", "true");
  }
}

function addKnownScannedProduct(prod, code) {
  if (!prod) return;
  if (typeof isPosOrderPaperOpen === "function" && isPosOrderPaperOpen()) return;
  clearPendingUnknownScan();
  if (typeof isProductAddModalOpen === "function" && isProductAddModalOpen() && typeof closeQuickProductModal === "function") {
    closeQuickProductModal();
  }
  if (window.PosScanGuard) window.PosScanGuard.markScanned();
  if (typeof PosAudio !== "undefined") PosAudio.playScanBeep();
  var qty = (typeof getPendingScanQty === "function") ? getPendingScanQty() : 1;
  var asCarton = !!(prod.packBarcode && barcodesMatch(prod.packBarcode, code) && !barcodesMatch(prod.barcode, code));
  addToCart(prod.id, qty || 1, asCarton ? "carton" : "piece");
  if (typeof resetPendingScanQty === "function") resetPendingScanQty();
  var searchEl = document.getElementById("headerSearchInput");
  if (searchEl) {
    searchEl.value = "";
    POS_GRID_SEARCH = "";
  }
}

function mergeCatalogProducts(serverList, localList) {
  var map = {};
  (serverList || []).forEach(function (p) {
    if (!p || !p.id) return;
    if (p.barcode) p.barcode = normalizeScannedCode(p.barcode);
    if (p.packBarcode) p.packBarcode = normalizeScannedCode(p.packBarcode);
    map[p.id] = p;
  });
  (localList || []).forEach(function (lp) {
    if (!lp || !lp.id) return;
    var sp = map[lp.id];
    if (!sp) {
      if (lp.barcode) lp.barcode = normalizeScannedCode(lp.barcode);
      if (lp.packBarcode) lp.packBarcode = normalizeScannedCode(lp.packBarcode);
      map[lp.id] = lp;
      return;
    }
    function betterCode(a, b) {
      var na = productBarcodeText(a);
      var nb = productBarcodeText(b);
      if (!na) return nb;
      if (!nb) return na;
      return nb.length > na.length ? nb : na;
    }
    sp.barcode = betterCode(sp.barcode, lp.barcode);
    sp.packBarcode = betterCode(sp.packBarcode, lp.packBarcode);
    if ((!sp.image || sp.image === "") && lp.image) sp.image = lp.image;
    if ((!sp.name || !String(sp.name).trim()) && lp.name) sp.name = lp.name;
    if (!(parseFloat(sp.price) > 0) && parseFloat(lp.price) > 0) sp.price = lp.price;
    var serverCat = String(sp.cat || "").trim();
    var localCat = String(lp.cat || "").trim();
    if ((!serverCat || serverCat === "general" || serverCat === "all") && localCat && localCat !== "general") {
      sp.cat = localCat;
    }
    if (isProductQuickFavorite(lp) && !isProductQuickFavorite(sp)) {
      sp.quickFavorite = lp.quickFavorite;
      sp.quickFavoriteAt = lp.quickFavoriteAt || Date.now();
      if (lp.favCatId) sp.favCatId = lp.favCatId;
    } else if (!sp.quickFavoriteAt && lp.quickFavoriteAt) {
      sp.quickFavoriteAt = lp.quickFavoriteAt;
    }
    if (!sp.favCatId && lp.favCatId) sp.favCatId = lp.favCatId;
    map[lp.id] = sp;
  });
  var out = [];
  Object.keys(map).forEach(function (k) { out.push(map[k]); });
  return out;
}

function normalizeStoredProductBarcodes() {
  var changed = false;
  (DB.products || []).forEach(function (p) {
    if (!p) return;
    var b = p.barcode ? normalizeScannedCode(p.barcode) : "";
    var pb = p.packBarcode ? normalizeScannedCode(p.packBarcode) : "";
    var sc = p.scaleCode ? normalizeScannedCode(p.scaleCode) : "";
    if (p.barcode && b && b !== String(p.barcode)) { p.barcode = b; changed = true; }
    if (p.packBarcode && pb && pb !== String(p.packBarcode)) { p.packBarcode = pb; changed = true; }
    if (p.scaleCode && sc && sc !== String(p.scaleCode)) { p.scaleCode = sc; changed = true; }
  });
  if (changed && typeof DataStore !== "undefined" && DataStore.saveProducts) DataStore.saveProducts();
  return changed;
}

var UNKNOWN_SCAN_WARN_TIMER = null;
var UNKNOWN_SCAN_WARN_MS = 780;
var SCAN_RESOLVE_WAITERS = {};

function flashUnknownProductWarning(code, done) {
  code = String(code || "");
  try {
    if (typeof PosAudio !== "undefined" && typeof PosAudio.playUnknownWarn === "function") {
      PosAudio.playUnknownWarn();
    }
  } catch (eAud) {}
  var flash = document.getElementById("posUnknownScanFlash");
  var codeEl = document.getElementById("posUnknownScanCode");
  if (codeEl) codeEl.textContent = code;
  if (flash) {
    flash.classList.add("show");
    flash.setAttribute("aria-hidden", "false");
  }
  if (typeof showScanPopup === "function") {
    showScanPopup(code, "کاڵا تۆمار نەکراوە — زیادکردن", false);
  }
  if (UNKNOWN_SCAN_WARN_TIMER) clearTimeout(UNKNOWN_SCAN_WARN_TIMER);
  UNKNOWN_SCAN_WARN_TIMER = setTimeout(function () {
    UNKNOWN_SCAN_WARN_TIMER = null;
    if (flash) {
      flash.classList.remove("show");
      flash.setAttribute("aria-hidden", "true");
    }
    if (typeof done === "function") done();
  }, UNKNOWN_SCAN_WARN_MS);
}
window.flashUnknownProductWarning = flashUnknownProductWarning;

var SCAN_RESOLVE_INFLIGHT = "";

function resolveScannedProduct(code, done) {
  code = normalizeScannedCode(code);
  function localHit() {
    var packed = (typeof findScannedProductAny === "function")
      ? findScannedProductAny(code, harvestHeaderSearchCode())
      : null;
    if (packed && packed.prod) return packed.prod;
    hydrateProductsFromLocalStore();
    try { if (typeof normalizeStoredProductBarcodes === "function") normalizeStoredProductBarcodes(); } catch (eN) {}
    var found = findProductByScannedCode(code);
    if (found) return found;
    var harvested = harvestHeaderSearchCode();
    if (harvested && harvested !== code) {
      var combo = pickBestScannedCode(code, harvested);
      if (combo && combo !== code) return findProductByScannedCode(combo);
    }
    return null;
  }
  var hit = localHit();
  if (hit) {
    done(hit);
    return;
  }
  if (window.isPosDemoMode && window.isPosDemoMode()) {
    done(null);
    return;
  }
  if (SCAN_RESOLVE_INFLIGHT === code) {
    if (!SCAN_RESOLVE_WAITERS[code]) SCAN_RESOLVE_WAITERS[code] = [];
    SCAN_RESOLVE_WAITERS[code].push(done);
    return;
  }
  SCAN_RESOLVE_INFLIGHT = code;
  var finished = false;
  function finish(prod) {
    if (finished) return;
    finished = true;
    if (SCAN_RESOLVE_INFLIGHT === code) SCAN_RESOLVE_INFLIGHT = "";
    done(prod || null);
    var wait = SCAN_RESOLVE_WAITERS[code] || [];
    SCAN_RESOLVE_WAITERS[code] = [];
    wait.forEach(function (fn) {
      try { fn(prod || null); } catch (eW) {}
    });
  }
  function afterLookupMiss() {
    if (typeof ApiClient === "undefined" || !ApiClient.fetchProducts) {
      finish(localHit());
      return;
    }
    ApiClient.fetchProducts().then(function (prods) {
      if (Array.isArray(prods) && prods.length) {
        DB.products = mergeCatalogProducts(prods, DB.products || []);
      }
      finish(localHit());
    }).catch(function () {
      finish(localHit());
    });
  }
  if (typeof ApiClient !== "undefined" && ApiClient.lookupBarcode) {
    ApiClient.lookupBarcode(code).then(function (data) {
      if (data && data.product) {
        finish(rememberServerProduct(data.product));
        return;
      }
      afterLookupMiss();
    }).catch(function () {
      afterLookupMiss();
    });
    return;
  }
  afterLookupMiss();
}

function tryAddScaleFromCode(code) {
  if (typeof SupermarketEngine === "undefined" || !SupermarketEngine.decodeScaleBarcode) return false;
  var scaleData = SupermarketEngine.decodeScaleBarcode(code);
  if (!scaleData) return false;
  var itemCodeClean = scaleData.itemCode ? scaleData.itemCode.replace(/^0+/, "") : "";
  var itemCode5Clean = scaleData.itemCode5 ? scaleData.itemCode5.replace(/^0+/, "") : "";
  var scaleProd = (DB.products || []).find(function (p) {
    if (!p || (!p.isScaleItem && !p.scaleCode)) return false;
    var pScaleCode = p.scaleCode ? String(p.scaleCode).trim().replace(/^0+/, "") : "";
    var pBarcode = p.barcode ? String(p.barcode).trim().replace(/^0+/, "") : "";
    var pIdNum = String(p.id).replace(/\D/g, "");
    return (pScaleCode && (pScaleCode === itemCodeClean || pScaleCode === itemCode5Clean || pScaleCode === scaleData.itemCode)) ||
      (pBarcode && (pBarcode === itemCodeClean || pBarcode === itemCode5Clean || pBarcode === scaleData.itemCode)) ||
      (pIdNum && (pIdNum === itemCodeClean || pIdNum === itemCode5Clean));
  });
  if (!scaleProd) return false;
  if (typeof PosAudio !== "undefined") PosAudio.playScanBeep();
  var weightToAdd = scaleData.weight;
  if (scaleData.isPriceBased && scaleData.totalPrice > 0 && scaleProd.price > 0) {
    weightToAdd = Math.round((scaleData.totalPrice / scaleProd.price) * 1000) / 1000;
  }
  if (!weightToAdd || weightToAdd <= 0) weightToAdd = 1.0;
  addToCart(scaleProd.id, weightToAdd);
  var unitLabel = scaleProd.unit === "gram" ? "گرام" : "کگ";
  if (typeof showScanPopup === "function") showScanPopup(code, scaleProd.name + " (" + weightToAdd + " " + unitLabel + ")", true);
  toast("تەرازوو", scaleProd.name + " (" + weightToAdd + " " + unitLabel + ") زیادکرا", "success");
  return true;
}

function openUnknownBarcodeForm(code) {
  if (typeof isPosOrderPaperOpen === "function" && isPosOrderPaperOpen()) return;
  code = normalizeScannedCode(code);
  if (!code) return;
  PENDING_UNKNOWN_SCAN.code = code;
  PENDING_UNKNOWN_SCAN.seq += 1;
  var seq = PENDING_UNKNOWN_SCAN.seq;
  if (PENDING_UNKNOWN_SCAN.timer) clearTimeout(PENDING_UNKNOWN_SCAN.timer);
  PENDING_UNKNOWN_SCAN.timer = setTimeout(function () {
    PENDING_UNKNOWN_SCAN.timer = null;
    if (seq !== PENDING_UNKNOWN_SCAN.seq) return;
    var harvested = harvestHeaderSearchCode();
    var packed = (typeof findScannedProductAny === "function")
      ? findScannedProductAny(code, harvested)
      : null;
    if (packed && packed.prod) {
      addKnownScannedProduct(packed.prod, packed.code || code);
      return;
    }
    var tryCode = pickBestScannedCode(code, harvested) || code;
    resolveScannedProduct(tryCode, function (prod) {
      if (seq !== PENDING_UNKNOWN_SCAN.seq) return;
      if (prod) {
        addKnownScannedProduct(prod, tryCode);
        return;
      }
      var packed2 = (typeof findScannedProductAny === "function")
        ? findScannedProductAny(tryCode, harvestHeaderSearchCode())
        : null;
      if (packed2 && packed2.prod) {
        addKnownScannedProduct(packed2.prod, packed2.code || tryCode);
        return;
      }
      if (tryAddScaleFromCode(tryCode) || tryAddScaleFromCode(code)) return;
      if (seq !== PENDING_UNKNOWN_SCAN.seq) return;
      var digitLen = String(tryCode || "").replace(/\D/g, "").length;
      if (digitLen > 0 && digitLen < 6) return;
      openQuickAddProductModal(tryCode);
    });
  }, 280);
}

function askToRegisterUnknownBarcode(code) {
  var quickModal = document.getElementById("quickProductModal");
  if (quickModal && quickModal.classList.contains("active")) {
    applyScannedBarcodeToProductForm(code);
    return;
  }
  var productModal = document.getElementById("productModal");
  if (productModal && productModal.classList.contains("active")) return;
  openQuickAddProductModal(code);
}

function getPendingScanQty() {
  var el = document.getElementById("posScanQtyInput");
  var n = el ? parseFloat(el.value) : 1;
  if (isNaN(n) || n <= 0) n = 1;
  return n;
}

function setPendingScanQty(value) {
  var n = parseFloat(value);
  if (isNaN(n) || n <= 0) n = 1;
  var el = document.getElementById("posScanQtyInput");
  if (el) el.value = (n % 1 === 0) ? String(n) : String(Math.round(n * 1000) / 1000);
}

function resetPendingScanQty() {
  setPendingScanQty(1);
}

function parseScanQtyPrefix(code) {
  var s = String(code || "").trim();
  var withItem = s.match(/^(\d+(?:\.\d+)?)\s*[\*xX×]\s*(.+)$/);
  if (withItem) {
    setPendingScanQty(withItem[1]);
    return withItem[2].trim();
  }
  var onlyMul = s.match(/^(\d+(?:\.\d+)?)\s*[\*xX×]$/);
  if (onlyMul) {
    setPendingScanQty(onlyMul[1]);
    return "";
  }
  return s;
}

function handlePosScanQtyKey(e) {
  if (!e) return;
  if (e.key === "Enter" || e.key === "Tab") {
    if (e.key === "Enter") e.preventDefault();
    var b = document.getElementById("headerSearchInput");
    if (b) {
      b.focus();
      if (e.key === "Enter" && b.select) b.select();
    }
  }
}

function handleCartQtyKey(e, itemId) {
  if (!e) return;
  if (e.key === "ArrowUp" || e.key === "ArrowRight") {
    e.preventDefault();
    e.stopPropagation();
    SELECTED_CART_ITEM_ID = itemId;
    if (typeof changeQty === "function") changeQty(itemId, 1);
    return;
  }
  if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
    e.preventDefault();
    e.stopPropagation();
    SELECTED_CART_ITEM_ID = itemId;
    if (typeof changeQty === "function") changeQty(itemId, -1);
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    if (typeof setQty === "function") setQty(itemId, e.target.value);
    var b = document.getElementById("headerSearchInput");
    if (b) b.focus();
  }
}

function collectModalNavFields(modal) {
  if (!modal) return [];
  var nodes = modal.querySelectorAll(
    "input, select, textarea, button.product-feat-toggle"
  );
  return Array.prototype.slice.call(nodes).filter(function (el) {
    if (!el || el.disabled) return false;
    var type = (el.type || "").toLowerCase();
    var isFeat = !!(el.classList && el.classList.contains("product-feat-toggle"));
    if (!isFeat && (type === "hidden" || type === "file" || type === "button" || type === "submit" || type === "reset" || type === "image")) return false;
    if (el.readOnly && type !== "checkbox" && type !== "radio" && !isFeat) return false;
    var st = window.getComputedStyle(el);
    if (!st || st.display === "none" || st.visibility === "hidden") return false;
    var host = el.closest("#pStockGroup, #pMinAlertGroup, #pExpiryFieldsWrap, #pPackFieldsWrap");
    if (host) {
      var hs = window.getComputedStyle(host);
      if (hs && (hs.display === "none" || hs.visibility === "hidden")) return false;
    }
    if (el.offsetParent === null && type !== "checkbox" && type !== "radio" && !isFeat) return false;
    return true;
  });
}

function modalSpaceJumps(el) {
  if (!el) return false;
  var type = (el.type || "").toLowerCase();
  var tag = (el.tagName || "").toLowerCase();
  var id = el.id || "";
  if (tag === "textarea") return false;
  if (type === "checkbox" || type === "radio") return true;
  if (el.classList && el.classList.contains("product-feat-toggle")) return true;
  if (tag === "select") return true;
  if (type === "number" || type === "date" || type === "datetime-local" || type === "time") return true;
  if (/barcode/i.test(id)) return true;
  if (type === "text" || type === "search" || type === "tel" || type === "url" || type === "") {
    return !String(el.value || "").trim();
  }
  return true;
}

function focusModalNavField(el) {
  if (!el) return;
  try { el.focus(); } catch (eF) {}
  var type = (el.type || "").toLowerCase();
  if (el.select && type !== "checkbox" && type !== "radio" && type !== "date" && type !== "datetime-local" && el.tagName !== "SELECT" && el.tagName !== "BUTTON") {
    try { el.select(); } catch (eS) {}
  }
}

function setupModalEnterToNext(modalId) {
  var modal = document.getElementById(modalId);
  if (!modal || modal.getAttribute("data-enter-nav") === "2") return;
  modal.setAttribute("data-enter-nav", "2");
  modal.addEventListener("keydown", function (e) {
    var isEnter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter";
    var isSpace = e.key === " " || e.key === "Spacebar" || e.code === "Space";
    if (!isEnter && !isSpace) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (!t || !modal.contains(t)) return;
    var tag = (t.tagName || "").toLowerCase();
    var type = (t.type || "").toLowerCase();
    var isCheck = type === "checkbox" || type === "radio" || (t.classList && t.classList.contains("product-feat-toggle"));
    if (isSpace && !modalSpaceJumps(t)) return;
    if (tag === "textarea" && isEnter) return;
    if (type === "file") return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    if (isSpace && (type === "checkbox" || type === "radio")) {
      t.checked = !t.checked;
      try { t.dispatchEvent(new Event("change", { bubbles: true })); } catch (eC) {}
    } else if (isSpace && t.classList && t.classList.contains("product-feat-toggle")) {
      try { t.click(); } catch (eT) {}
    }
    var fields = collectModalNavFields(modal);
    var i = fields.indexOf(t);
    if (i >= 0 && i < fields.length - 1) {
      focusModalNavField(fields[i + 1]);
      return;
    }
    var saveBtn = modal.querySelector("#saveProductBtn, #quickSaveAndSellBtn, #saveExpenseBtn, .modal-footer .btn-primary");
    if (saveBtn) {
      if (saveBtn.id === "quickSaveAndSellBtn") saveBtn.click();
      else saveBtn.focus();
    }
  }, true);
}

window.getPendingScanQty = getPendingScanQty;
window.setPendingScanQty = setPendingScanQty;
window.resetPendingScanQty = resetPendingScanQty;
window.handlePosScanQtyKey = handlePosScanQtyKey;
window.handleCartQtyKey = handleCartQtyKey;
window.setupModalEnterToNext = setupModalEnterToNext;

function isProductAddModalOpen() {
  var pm = document.getElementById("productModal");
  var qm = document.getElementById("quickProductModal");
  return !!(pm && pm.classList.contains("active")) || !!(qm && qm.classList.contains("active"));
}

function isPosOrderPaperOpen() {
  var m = document.getElementById("posOrderPaperModal");
  if (!m) return false;
  return m.classList.contains("active") || m.classList.contains("show") || m.style.display === "flex" || m.style.display === "block";
}

function flashBarcodeInputFill(inp) {
  if (!inp) return;
  inp.value = String(inp.value || "");
  inp.style.borderColor = "#10b981";
  inp.style.boxShadow = "0 0 0 3px rgba(16,185,129,0.35)";
  try { inp.focus(); inp.select(); } catch (err) {}
  setTimeout(function () {
    if (!inp) return;
    inp.style.borderColor = "";
    inp.style.boxShadow = "";
  }, 1600);
}

function resolveProductFormBarcodeTarget(targetId) {
  var ae = document.activeElement;
  var aid = (ae && ae.id) ? ae.id : "";
  var tid = String(targetId || aid || "");
  if (tid === "quickProdPackBarcode" || tid === "pPackBarcode") return "carton";
  if (tid === "quickProdBarcode" || tid === "pBarcode") return "piece";
  if (QUICK_PROD_BARCODE_TARGET === "carton" && QUICK_PROD_BARCODE_TARGET_AT && (Date.now() - QUICK_PROD_BARCODE_TARGET_AT) < 1500) {
    return "carton";
  }
  return "piece";
}

function applyScannedBarcodeToProductForm(code, targetId) {
  code = String(code || "").replace(/[\r\n\t]/g, "").trim();
  if (!code) return false;
  var productModal = document.getElementById("productModal");
  var quickModal = document.getElementById("quickProductModal");
  var dest = resolveProductFormBarcodeTarget(targetId);
  if (productModal && productModal.classList.contains("active")) {
    var fieldId = dest === "carton" ? "pPackBarcode" : "pBarcode";
    var inp = document.getElementById(fieldId) || document.getElementById("pBarcode");
    if (inp) {
      inp.value = code;
      flashBarcodeInputFill(inp);
    }
    toast("بارکۆد", dest === "carton" ? "بارکۆدی کارتۆن تۆمارکرا" : "بارکۆد خرایە خانەی بارکۆد", "success");
    return true;
  }
  if (quickModal && quickModal.classList.contains("active")) {
    if (dest === "carton") {
      var packIn = document.getElementById("quickProdPackBarcode");
      if (packIn) {
        packIn.value = code;
        flashBarcodeInputFill(packIn);
      }
      QUICK_PROD_BARCODE_TARGET = "carton";
      toast("بارکۆد", "بارکۆدی کارتۆن خرایە خانەکە", "success");
      return true;
    }
    QUICK_PROD_SCANNED_CODE = code;
    QUICK_PROD_BARCODE_TARGET = "piece";
    var disp = document.getElementById("quickProdBarcodeDisplay");
    var pieceIn = document.getElementById("quickProdBarcode");
    if (disp) disp.textContent = code;
    if (pieceIn) {
      pieceIn.value = code;
      flashBarcodeInputFill(pieceIn);
    }
    toast("بارکۆد", "بارکۆدی دانە خرایە خانەکە", "success");
    return true;
  }
  return false;
}

function setupProductFormBarcodeScan() {
  if (setupProductFormBarcodeScan.bound) return;
  setupProductFormBarcodeScan.bound = true;
}

window.PosScanGuard = (function () {
  var lastCharAt = 0;
  var lockUntil = 0;
  var lastScanAt = 0;
  var burstCount = 0;

  function noteKey(e) {
    if (!e || e.ctrlKey || e.altKey || e.metaKey) return;
    if (!e.key || e.key.length !== 1) return;
    var now = Date.now();
    var gap = now - lastCharAt;
    lastCharAt = now;
    burstCount = (gap < 80) ? (burstCount + 1) : 1;
  }

  function markScanned() {
    var now = Date.now();
    lastScanAt = now;
    lockUntil = now + 900;
  }

  function isScanTerminator(e) {
    var now = Date.now();
    if (now < lockUntil) return true;
    if (now - lastScanAt < 900) return true;
    var key = e && e.key;
    if (key !== "Enter" && key !== "Tab") return false;
    // Hardware scanners finish with Enter/Tab right after the barcode digits.
    if (now - lastCharAt < 450) return true;
    if (burstCount >= 2 && now - lastCharAt < 700) return true;
    return false;
  }

  function isBursting() {
    var now = Date.now();
    return burstCount >= 2 && (now - lastCharAt) < 160;
  }

  function shouldSkipCheckoutKey(e) {
    if (!e) return Date.now() < lockUntil;
    if (e.key === " " || e.key === "Spacebar") return false;
    return isScanTerminator(e);
  }

  return {
    noteKey: noteKey,
    markScanned: markScanned,
    isScanTerminator: isScanTerminator,
    isBursting: isBursting,
    shouldSkipCheckoutKey: shouldSkipCheckoutKey
  };
})();

document.addEventListener("keydown", function (e) {
  if (window.PosScanGuard) window.PosScanGuard.noteKey(e);
}, true);

function processBarcode(code) {
  if (typeof isPosOrderPaperOpen === "function" && isPosOrderPaperOpen()) return;
  if (!code || !String(code).trim()) return;
  code = parseScanQtyPrefix(code);
  if (!code || !String(code).trim()) {
    if (code === "") toast("دانە", getPendingScanQty() + " دانە — ئێستا کاڵا سکان بکە", "info");
    return;
  }
  if (typeof isBarcodeStudioActive === "function" && isBarcodeStudioActive()) {
    if (typeof fillBarcodeStudioFromScan === "function") fillBarcodeStudioFromScan(code);
    return;
  }
  if (window.PosScanGuard) window.PosScanGuard.markScanned();
  var harvested = harvestHeaderSearchCode();
  var packed = (typeof findScannedProductAny === "function")
    ? findScannedProductAny(code, harvested)
    : null;
  if (packed && packed.prod) {
    addKnownScannedProduct(packed.prod, packed.code || code);
    return;
  }
  code = (typeof pickBestScannedCode === "function")
    ? (pickBestScannedCode(code, harvested) || normalizeScannedCode(code))
    : normalizeScannedCode(code);

  if (typeof fillBarcodeStudioFromScan === "function" && fillBarcodeStudioFromScan(code)) {
    return;
  }

  if (typeof fillOrdersSearchFromScan === "function" && fillOrdersSearchFromScan(code)) {
    return;
  }

  // 0a. If the Return modal is open, route scans INTO the return engine
  var __retModal = document.getElementById("returnSaleModal");
  if (__retModal && (__retModal.classList.contains("active") || __retModal.classList.contains("show") || __retModal.style.display === "flex" || __retModal.style.display === "block") &&
      typeof ReturnEngine !== "undefined" && ReturnEngine.scanProductForReturn) {
    ReturnEngine.scanProductForReturn(code);
    return;
  }

  // 0. Check if this is an Order / Receipt barcode (triggers Return & Refund Engine)
  if (typeof ReturnEngine !== "undefined" && ReturnEngine.isInvoiceBarcode(code)) {
    ReturnEngine.openWithBarcode(code);
    return;
  }

  // 0b. Direct match first (already-registered products always go to cart)
  var known = (typeof findProductByScannedCodeFresh === "function")
    ? findProductByScannedCodeFresh(code)
    : findProductByScannedCode(code);
  if (known) {
    addKnownScannedProduct(known, code);
    return;
  }

  if (isProductAddModalOpen()) {
    resolveScannedProduct(code, function (prod) {
      if (prod) {
        addKnownScannedProduct(prod, code);
        return;
      }
      var ae = document.activeElement;
      applyScannedBarcodeToProductForm(code, ae && ae.id ? ae.id : "");
    });
    return;
  }

  if (tryAddScaleFromCode(code)) return;

  // Local miss: wait for Node DB / catalog refresh BEFORE any unknown warning.
  openUnknownBarcodeForm(code);
}

var QR_SCANNER_BOUND = false;
function setupQRScanner() {
  if (QR_SCANNER_BOUND) return;
  var qrBtn = $("#qrScanBtn");
  if (qrBtn) qrBtn.addEventListener("click", openQRScanner);
  QR_SCANNER_BOUND = true;
}

var html5QrcodeScanner = null;

function openQRScanner() {
  if (!Html5Qrcode) {
    toast("هەڵە", "کتەبەرگەی QRCode بار نەکراو", "error");
    return;
  }
  showModal("qrModal");
  html5QrcodeScanner = new Html5Qrcode("qrReader");
  html5QrcodeScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    function (decodedText) {
      var raw = decodedText ? decodedText.trim() : "";
      var packProduct = DB.products.find(function (p) {
        return p.packBarcode && String(p.packBarcode).trim() === raw;
      });
      if (packProduct) {
        addToCart(packProduct.id, 1, 'carton');
        html5QrcodeScanner.stop().then(function () {
          hideModal("qrModal");
        });
        toast("کارتۆن", packProduct.name + " - ١ کارتۆن زیادکرا", "success");
        return;
      }
      var product = (typeof findProductByScannedCode === "function")
        ? findProductByScannedCode(raw)
        : DB.products.find(function (p) {
          return String(p.barcode) === raw || String(p.id) === raw;
      });
      if (product) {
        addToCart(product.id, 1, 'piece');
        html5QrcodeScanner.stop().then(function () {
          hideModal("qrModal");
        });
        toast("سەرکەوتوو", product.name + " زیادکرا", "success");
      } else {
        html5QrcodeScanner.stop().then(function () {
          hideModal("qrModal");
          openQuickAddProductModal(raw);
        }).catch(function () {
          hideModal("qrModal");
          openQuickAddProductModal(raw);
        });
      }
    },
    function (errorMessage) {}
  ).catch(function (err) {
    toast("هەڵە", "سکان کردنی QR شکستکان", "error");
    hideModal("qrModal");
  });
}

function calcAppend(n) { 
  var d = $("#calcDisplay"); 
  if (!d) return; 
  var cur = d.textContent || "0"; 
  if (cur === "0") { d.textContent = String(n); } 
  else { d.textContent = cur + String(n); }
  calcUseResult(); 
}
function calcClear() { var d = $("#calcDisplay"); if (d) d.textContent = "0"; calcUseResult(); }
function calcBack() { var d = $("#calcDisplay"); if (!d) return; var cur = d.textContent || "0"; d.textContent = cur.length <= 1 ? "0" : cur.slice(0, -1); calcUseResult(); }
function calcAllClear() { calcClear(); }
function calcUseResult() { var d = $("#calcDisplay"); var paidEl = $("#calcPaidInput"); if (d && paidEl) { var val = parseFloat(d.textContent) || 0; paidEl.value = String(val); paidEl.dispatchEvent(new Event("input", { bubbles: true })); } }


/* ═══ LOGIN / APP ═══ */

function staffUsesPin(role) {
  var r = (typeof AuthService !== "undefined" && AuthService.normalizeRole)
    ? AuthService.normalizeRole(role)
    : String(role || "cashier").toLowerCase();
  return r === "cashier" || r === "warehouse";
}

function countShopCashiers() {
  return (DB.users || []).filter(function (u) {
    if (!u) return false;
    if (typeof AuthService !== "undefined" && AuthService.isMasterUsername && AuthService.isMasterUsername(u.username)) return false;
    if (u.status === "inactive" || u.isActive === false || u.isActive === 0) return false;
    var r = (typeof AuthService !== "undefined" && AuthService.normalizeRole) ? AuthService.normalizeRole(u.role) : (u.role || "");
    return r === "cashier";
  }).length;
}

function updateLoginFlowSteps(tabName) {
  var s1 = document.getElementById("loginFlowStep1");
  var s2 = document.getElementById("loginFlowStep2");
  var s3 = document.getElementById("loginFlowStep3");
  if (s1) s1.classList.toggle("is-active", tabName === "signin");
  if (s2) s2.classList.toggle("is-active", tabName === "signin" && countShopCashiers() === 0);
  if (s3) s3.classList.toggle("is-active", tabName === "cashier");
}

function switchLoginTab(tabName) {
  var tabs = document.querySelectorAll("#loginPage .tabs .tab");
  tabs.forEach(function (tab) {
    if (tab.getAttribute("data-tab") === tabName) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  var cashierTab = document.getElementById("cashierTab");
  var signinTab = document.getElementById("signinTab");
  var registerTab = document.getElementById("registerTab");

  if (cashierTab) {
    cashierTab.style.display = (tabName === "cashier") ? "block" : "none";
    if (tabName === "cashier") cashierTab.classList.add("active");
    else cashierTab.classList.remove("active");
  }
  if (signinTab) {
    signinTab.style.display = (tabName === "signin") ? "block" : "none";
    if (tabName === "signin") {
      signinTab.classList.add("active");
      var userInp = document.getElementById("loginUsername");
      if (userInp) setTimeout(function () { userInp.focus(); }, 50);
    } else {
      signinTab.classList.remove("active");
    }
  }
  if (registerTab) {
    registerTab.style.display = (tabName === "register") ? "block" : "none";
    if (tabName === "register") {
      registerTab.classList.add("active");
      var regInp = document.getElementById("regName");
      if (regInp) setTimeout(function () { regInp.focus(); }, 50);
    } else {
      registerTab.classList.remove("active");
    }
  }
  updateLoginFlowSteps(tabName);
  if (tabName === "cashier" && typeof SwitchCashier !== "undefined" && typeof SwitchCashier.loadCashiers === "function") {
    SwitchCashier.loadCashiers();
  }
}
window.switchLoginTab = switchLoginTab;
window.staffUsesPin = staffUsesPin;

function togglePasswordVisible(inputOrId, btn) {
  var inp = typeof inputOrId === "string" ? document.getElementById(inputOrId) : inputOrId;
  if (!inp) return;
  var show = inp.type === "password";
  inp.type = show ? "text" : "password";
  var icon = btn && btn.querySelector ? btn.querySelector("i") : null;
  if (icon) icon.className = show ? "fas fa-eye-slash" : "fas fa-eye";
  if (btn && btn.setAttribute) btn.setAttribute("aria-pressed", show ? "true" : "false");
}
window.togglePasswordVisible = togglePasswordVisible;

function enhancePasswordFields(root) {
  var scope = root || document;
  var inputs = scope.querySelectorAll('input[type="password"]');
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i];
    if (inp.getAttribute("data-autofill-trap") === "1") continue;
    if (inp.closest(".password-wrap") || inp.closest(".ce-input-wrap")) continue;
    var parent = inp.parentNode;
    if (!parent) continue;
    var wrap = document.createElement("div");
    wrap.className = "password-wrap";
    parent.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "password-eye";
    btn.setAttribute("aria-label", "بینینی وشەی نهێنی");
    btn.setAttribute("title", "بینینی وشەی نهێنی");
    btn.innerHTML = '<i class="fas fa-eye"></i>';
    btn.addEventListener("click", (function (input, button) {
      return function (e) {
        e.preventDefault();
        e.stopPropagation();
        togglePasswordVisible(input, button);
      };
    })(inp, btn));
    wrap.appendChild(btn);
  }
}

var _signingIn = false;
var _signInWait = 0;
function doSignIn() {
  if (_signingIn) return;
  var msg = $("#loginMsg");
  var usernameEl = $("#loginUsername") || $("#loginEmail");
  var username = usernameEl ? usernameEl.value.trim() : "";
  var pass = $("#loginPass") ? $("#loginPass").value : "";
  if (!username || !pass) {
    if (msg) { msg.textContent = "تکایە ناوی بەکارهێنەر و وشەی نهێنی بنووسە"; msg.className = "msg error"; }
    logLogin(username, false);
    return;
  }
  if (typeof AuthService === "undefined" || typeof AuthService.login !== "function") {
    _signInWait += 1;
    if (_signInWait < 40) {
      if (msg) { msg.textContent = "سیستەم ئامادە دەبێت... تکایە چەند چرکەیەک چاوەڕێ بکە"; msg.className = "msg"; }
      setTimeout(doSignIn, 250);
      return;
    }
  }
  _signInWait = 0;
  _signingIn = true;
  var signInBtn = $("#signInBtn");
  if (signInBtn) signInBtn.disabled = false;
  if (msg) { msg.textContent = "چوونەژوورەوە..."; msg.className = "msg"; }
  AuthService.login(username, pass).then(function (result) {
    if (!result || !result.ok) {
      if (msg) { msg.textContent = (result && result.message) || "ئیمەیل یان وشەی نهێنی هەڵەیە"; msg.className = "msg error"; }
      logLogin(username, false);
      return;
    }
    logLogin(username, true);
    logActivity("login", "User logged in: " + username);
    enterApp();
  }).catch(function (err) {
    console.error("Login error:", err);
    if (msg) { msg.textContent = "هەڵەیەک ڕوویدا لە چوونەژوورەوە"; msg.className = "msg error"; }
  }).then(function () {
    _signingIn = false;
  });
}
window.doSignIn = doSignIn;

function checkAutoLoginPin(input) {
  if (!input) return;
  var val = String(input.value || "").trim();
  if (val.length === 4 && /^\d{4}$/.test(val)) {
    var usernameEl = $("#loginUsername") || $("#loginEmail");
    var username = usernameEl ? usernameEl.value.trim() : "";
    if (username) {
      doSignIn();
    } else {
      if (typeof DB !== "undefined" && DB.users && DB.users.length) {
        var match = DB.users.find(function(u) { return u.pin === val || u.passcode === val; });
        if (match) {
          if (usernameEl) usernameEl.value = match.username;
          doSignIn();
        }
      }
    }
  }
}
window.checkAutoLoginPin = checkAutoLoginPin;

function clearForgotPasswordFields() {
  ["recoveryPin", "recoveryNewEmail", "recoveryNewPass", "recoveryNewPass2", "recoveryNewPin"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = "";
  });
  var msg = $("#recoveryMsg");
  if (msg) { msg.style.display = "none"; msg.textContent = ""; }
}

function hideLoginCredentials() {
  var usernameEl = $("#loginUsername") || $("#loginEmail");
  if (usernameEl) usernameEl.value = "";
  var passEl = $("#loginPass");
  if (passEl) passEl.value = "";
}

function isLoggedInManagerRecovery() {
  if (typeof AuthService === "undefined") return false;
  var sess = AuthService.getSession && AuthService.getSession();
  if (!sess) return false;
  if (AuthService.isMasterSession && AuthService.isMasterSession()) return false;
  return !!(AuthService.canManageUsers && AuthService.canManageUsers());
}

function openForgotPasswordModal() {
  hideLoginCredentials();
  clearForgotPasswordFields();
  var loggedIn = isLoggedInManagerRecovery();
  var pinWrap = document.getElementById("recoveryPinWrap");
  var newPinWrap = document.getElementById("recoveryNewPinWrap");
  var hint = document.getElementById("recoveryHint");
  var passLabel = document.getElementById("recoveryNewPassLabel");
  if (pinWrap) pinWrap.style.display = loggedIn ? "none" : "";
  if (newPinWrap) newPinWrap.style.display = loggedIn ? "" : "none";
  if (hint) {
    hint.textContent = loggedIn
      ? "ئیمەیل و وشەی نهێنی نوێ دابنێ. PINـی گەڕاندنەوەش دەتوانیت بگۆڕیت — دوای چوونەدەرەوە ئەم PINـە بۆ گەڕاندنەوە بەکاردێت."
      : "PINـی گەڕاندنەوە بنووسە (ئەوەی لە سەرەتای دامەزراندن یان لە پەڕەی بەکارهێنەران دانرا)، پاشان ئیمەیل و وشەی نهێنی نوێ دابنێ.";
  }
  if (passLabel) passLabel.textContent = loggedIn ? "وشەی نهێنی نوێ (بەجێی بهێڵە ئەگەر ناگۆڕیت)" : "وشەی نهێنی نوێ *";
  showModal("forgotPasswordModal");
  setTimeout(clearForgotPasswordFields, 50);
  setTimeout(clearForgotPasswordFields, 400);
}
window.openForgotPasswordModal = openForgotPasswordModal;

function finishOwnerRecovery(newEmail) {
  clearForgotPasswordFields();
  hideLoginCredentials();
  hideModal("forgotPasswordModal");
  toast("سەرکەوتوو", "ئیمەیل و وشەی نهێنی نوێ پاشکەوت کران. بەدەست بنووسە بۆ چوونەژوورەوە.", "success", true);
  refreshUsersViews();
  if (typeof switchLoginTab === "function") switchLoginTab("signin");
}

function submitPasswordRecovery() {
  var pin = $("#recoveryPin") ? $("#recoveryPin").value.trim() : "";
  var newEmail = $("#recoveryNewEmail") ? $("#recoveryNewEmail").value.trim().toLowerCase() : "";
  var p1 = $("#recoveryNewPass") ? $("#recoveryNewPass").value.trim() : "";
  var p2 = $("#recoveryNewPass2") ? $("#recoveryNewPass2").value.trim() : "";
  var newPin = $("#recoveryNewPin") ? $("#recoveryNewPin").value.trim() : "";
  var msg = $("#recoveryMsg");
  var loggedIn = isLoggedInManagerRecovery();

  function showRecError(text) {
    if (msg) { msg.style.display = "block"; msg.className = "msg error"; msg.textContent = text; }
  }

  if (!newEmail || newEmail.length < 2) {
    showRecError("ئیمەیلی نوێی بەڕێوەبەر بنووسە");
    return;
  }
  if (newEmail === "smartserve@gmail.iq" || newEmail === "smartserve") {
    showRecError("ئەم ئیمەیلە بەردەست نییە. ئیمەیلێکی تر هەڵبژێرە.");
    return;
  }
  if (!loggedIn && !/^\d{4,6}$/.test(pin)) {
    showRecError("PINـی گەڕاندنەوە بنووسە (٤ بۆ ٦ ژمارە)");
    return;
  }
  if (!loggedIn && (!p1 || p1.length < 4)) {
    showRecError("وشەی نهێنی نوێ دەبێت لانیکەم ٤ نووسە بێت");
    return;
  }
  if (p1 && p1.length < 4) {
    showRecError("وشەی نهێنی نوێ دەبێت لانیکەم ٤ نووسە بێت");
    return;
  }
  if (p1 && p1 !== p2) {
    showRecError("وشەی نهێنی و دووبارەکردنەوەکەی وەک یەک نین");
    return;
  }
  if (!loggedIn && p1 !== p2) {
    showRecError("وشەی نهێنی و دووبارەکردنەوەکەی وەک یەک نین");
    return;
  }
  if (newPin && !/^\d{4,6}$/.test(newPin)) {
    showRecError("PINـی گەڕاندنەوە دەبێت ٤ بۆ ٦ ژمارە بێت");
    return;
  }
  if (loggedIn && !p1 && !newPin && !newEmail) {
    showRecError("ئیمەیل یان وشەی نهێنی نوێ بنووسە");
    return;
  }

  var apiBase = (typeof ApiClient !== "undefined" && typeof ApiClient.getBaseUrl === "function") ? ApiClient.getBaseUrl() : "http://localhost:3005";

  if (loggedIn) {
    AuthService.updateOwnerLogin(newEmail, p1 || null, newPin || null).then(function (res) {
      if (!res.ok) {
        showRecError(res.message || "نەتوانرا نوێ بکرێتەوە");
        return;
      }
      var owner = AuthService.getMarketOwnerUser && AuthService.getMarketOwnerUser();
      var bePayload = { username: newEmail };
      if (p1) bePayload.passcode = p1;
      if (newPin) bePayload.pin = newPin;
      if (owner && owner.id) {
        fetch(apiBase + "/api/users/" + owner.id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bePayload)
        }).catch(function () {});
      }
      finishOwnerRecovery(newEmail);
    });
    return;
  }

  fetch(apiBase + "/api/users/recover-owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recoveryPin: pin, newUsername: newEmail, newPassword: p1 })
  }).then(function (r) { return r.json().then(function (data) { return { ok: r.ok, data: data }; }); })
    .catch(function () { return { ok: false, data: { message: "پەیوەندی بە سێرڤەر نەکرا" } }; })
    .then(function (be) {
      var localFn = be.ok
        ? AuthService.recoverOwnerWithPin(pin, newEmail, p1, true)
        : AuthService.recoverOwnerWithPin(pin, newEmail, p1);
      return localFn.then(function (res) {
        if (!res.ok) {
          showRecError((be.ok ? res.message : ((be.data && (be.data.message || be.data.error)) || res.message)) || "PIN هەڵەیە یان نەتوانرا نوێ بکرێتەوە");
          return;
        }
        finishOwnerRecovery(newEmail);
      });
    });
}
window.submitPasswordRecovery = submitPasswordRecovery;

function resetManagerLogin() {
  openForgotPasswordModal();
}

function logout() {
  AuthService.logout();
  if (typeof DB !== "undefined") DB.currentUser = null;
  CART = [];
  try { document.documentElement.classList.remove("has-saved-session"); } catch (eCls) {}
  $$(".page").forEach(function (p) { p.classList.remove("active"); });
  $$(".page-section").forEach(function (s) { s.classList.remove("active"); });
  var appPage = $("#appPage");
  if (appPage) appPage.classList.remove("active");
  var loginPage = $("#loginPage");
  if (loginPage) loginPage.classList.add("active");
  var scModal = $("#switchCashierModal");
  if (scModal) scModal.classList.remove("active");
  switchLoginTab("signin");
}

function getActiveOperatorName() {
  var u = (typeof DB !== "undefined" && DB.currentUser) ? DB.currentUser : null;
  var sess = (typeof AuthService !== "undefined" && AuthService.getSession) ? AuthService.getSession() : null;
  var name = "";
  if (u) name = u.fullName || u.name || u.username || "";
  if (!name && sess) name = sess.fullName || sess.name || sess.username || "";
  name = String(name || "").trim();
  if (!name) name = "کاشیر";
  return name;
}
window.getActiveOperatorName = getActiveOperatorName;

function enterApp() {
  var session = AuthService.getSession();
  if (!session && DB.currentUser) {
    AuthService.saveSession(DB.currentUser);
    session = AuthService.getSession();
  }
  if (!session) {
    var loginPage = $("#loginPage");
    if (loginPage) loginPage.classList.add("active");
    var appPage = $("#appPage");
    if (appPage) appPage.classList.remove("active");
    return false;
  }
  AuthService.applyNavPermissions();
  try { document.documentElement.classList.add("has-saved-session"); } catch (eCls) {}
  var loginPage = $("#loginPage");
  if (loginPage) loginPage.classList.remove("active");
  var appPage = $("#appPage");
  if (appPage) appPage.classList.add("active");
  var scModal = $("#switchCashierModal");
  if (scModal) scModal.classList.remove("active");
  updatePosHeaderInfo();
  var targetPage = "pos";
  if (window.isPosDemoMode && window.isPosDemoMode()) {
    targetPage = (AuthService.getDefaultPage && AuthService.getDefaultPage()) || "dashboard";
  } else if (!AuthService.canAccessPage("pos")) {
    targetPage = AuthService.getDefaultPage() || "orders";
  }
  switchSection(targetPage, true);
  maybePromptStaffSetup();
  return true;
}

function maybePromptStaffSetup() {
  return;
}

function startAddCashierFromOnboarding() {
  hideModal("staffOnboardingModal");
  switchSection("users", true);
  setTimeout(function () { openUserModal(null, "cashier"); }, 180);
}
window.maybePromptStaffSetup = maybePromptStaffSetup;
window.startAddCashierFromOnboarding = startAddCashierFromOnboarding;

function switchSection(pg, skipGuard) {
  if (pg === "expenses") {
    window.CURRENT_FINANCE_TAB = "expenses";
    pg = "dashboard";
  } else if (pg === "reports") {
    window.CURRENT_FINANCE_TAB = "analytics";
    pg = "dashboard";
  } else if (pg === "profitReports") {
    window.CURRENT_FINANCE_TAB = "balance";
    pg = "dashboard";
  }

  if (!skipGuard) {
    var sess = AuthService.getSession();
    if (!sess && DB.currentUser) {
      AuthService.saveSession(DB.currentUser);
      sess = AuthService.getSession();
    }
    if (!sess) {
      var loginPage = document.getElementById("loginPage");
      var appPage = document.getElementById("appPage");
      if (appPage) appPage.classList.remove("active");
      if (loginPage) loginPage.classList.add("active");
      return;
    }
    if (!AuthService.canAccessPage(pg)) {
      toast("ڕێگەپێدراو نییە 🔒", "ئەم بەشە تایبەتە بە بەڕێوەبەر و خاوەن مارکێت", "error");
      var fallback = AuthService.getDefaultPage();
      if (fallback && fallback !== pg) switchSection(fallback, true);
      return;
    }
  }

  // Close any open sidebar drawer or dropdown
  var sidebar = $("#sidebar");
  var overlay = $("#sidebarOverlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("active");
  document.body.classList.remove("pos-sidebar-open");
  if (typeof closePosMoreDropdown === "function") closePosMoreDropdown();

  $$(".page-section").forEach(function (s) { s.classList.remove("active"); });
  $$(".nav-item").forEach(function (n) { n.classList.remove("active"); });
  var sectionMap = { dashboard: "dashboardSection", pos: "posSection", products: "productsSection", inventory: "inventorySection", reports: "dashboardSection", categories: "categoriesSection", settings: "settingsSection", debt: "customersSection", shifts: "shiftsSection", profitReports: "dashboardSection", returnSales: "returnSalesSection", expenses: "dashboardSection", suppliers: "suppliersSection", purchases: "suppliersSection", customers: "customersSection", orders: "ordersSection", barcode: "barcodeSection", users: "usersSection" };
  var sectionEl = document.getElementById(sectionMap[pg]);
  if (sectionEl) sectionEl.classList.add("active");
  var navPage = pg;
  if (pg === "purchases") navPage = "suppliers";
  if (pg === "debt") navPage = "customers";
  var navBtn = document.querySelector('.nav-item[data-page="' + navPage + '"]');
  if (navBtn) navBtn.classList.add("active");
  window.CURRENT_PAGE = pg;
  try {
    if (window.POS_DESKTOP && typeof POS_DESKTOP.setPosPage === "function") {
      POS_DESKTOP.setPosPage(pg === "pos");
    }
  } catch (ePosPage) {}
  var titles = { dashboard: { title: "داشبۆردی بەڕێوەبەر", subtitle: "پوختەی کار، پارە، مەسرەف و قازانج" }, pos: { title: "وەرگرتنی پارە", subtitle: "فرۆشتن" }, products: { title: "بەرهەمەکان", subtitle: "بەڕێوەبردنی بەرهەمەکان" }, inventory: { title: "کۆگا", subtitle: "بڕگەکانی کۆگا" }, reports: { title: "داشبۆردی بەڕێوەبەر", subtitle: "شیکاری فرۆشتن" }, categories: { title: "پۆلەکان", subtitle: "بەڕێوەبردنی پۆلەکان" }, settings: { title: "ڕێکخستنەکان", subtitle: "ڕێکخستن" }, debt: { title: "کڕیاران و قەرز", subtitle: "دەفتەری قەرز و دانەوە" }, shifts: { title: "شێفت", subtitle: "بەڕێوەبردنی شێفت" }, profitReports: { title: "داشبۆردی بەڕێوەبەر", subtitle: "تەرازووی فرۆشتن، مەسرەف و قازانج" }, returnSales: { title: "گەڕانەوەی فرۆشتن", subtitle: "بەڕێوەبردنی گەڕانەوە" }, expenses: { title: "داشبۆردی بەڕێوەبەر", subtitle: "مەسرەف و خەرجییەکان" }, suppliers: { title: "کۆمپانیا و کڕین", subtitle: "مەندوب، داواکاری واتسئاپ و وەسڵی کڕین" }, purchases: { title: "کۆمپانیا و کڕین", subtitle: "وەسڵی کڕین و زیادکردنی کۆگا" }, customers: { title: "کڕیاران و قەرز", subtitle: "کڕیار، دەفتەری قەرز و دانەوە" }, orders: { title: "داواکارییەکان", subtitle: "مێژووی فرۆشتن و پسوولەکان" }, barcode: { title: "ستۆدیۆی بارکۆد و QR", subtitle: "دروستکردنی بارکۆدی نوێ (ناو + ژمارە) و چاپی لەزگە" }, users: { title: "بەکارهێنەران و کاشیرەکان", subtitle: "بەڕێوەبردنی کاشیرەکان، بەکارهێنەران و دەسەڵاتەکان" } };
  var td = titles[pg];
  if (td) {
    var tEl = $("#pageTitle"), sEl = $("#pageSubtitle");
    if (tEl) {
      tEl.removeAttribute("data-i18n-src");
      tEl.textContent = td.title;
    }
    if (sEl) {
      sEl.removeAttribute("data-i18n-src");
      sEl.textContent = td.subtitle;
    }
  }
  try {
    if (pg === "pos") {
      document.body.classList.add("pos-page");
      setPosPageMode(false);
      renderCustomerTabs();
      renderPosCategoryTabs();
      renderProductGrid("all");
      renderCartTable();
      setupBarcodeScanner();
      setupQRScanner();
      startPosClock();
      initHeaderDateTime();
      updatePosHeaderInfo();
      updatePosToolbarActive("pos");
    } else {
      document.body.classList.remove("pos-page", "pos-fullscreen", "pos-compact");
      stopPosClock();
      updatePosViewButtons();
      if (pg === "dashboard") {
        if (typeof switchFinanceHubTab === "function") switchFinanceHubTab(window.CURRENT_FINANCE_TAB || "overview");
        else renderDashboard();
      }
      else if (pg === "products") renderProducts();
      else if (pg === "categories") renderCategories();
      else if (pg === "inventory") renderInventory();
      else if (pg === "settings") renderSettings();
      else if (pg === "debt") selectCustomerHubTab("debt");
      else if (pg === "shifts") renderShiftsPage();
      else if (pg === "returnSales") renderReturnSales();
      else if (pg === "suppliers") {
        renderSuppliers();
        if (typeof SuppliersManager !== "undefined" && SuppliersManager.selectBuyTab) SuppliersManager.selectBuyTab("companies");
      } else if (pg === "purchases") {
        renderSuppliers();
        renderPurchases();
        if (typeof SuppliersManager !== "undefined" && SuppliersManager.selectBuyTab) SuppliersManager.selectBuyTab("invoices");
      } else if (pg === "customers") selectCustomerHubTab("debt");
      else if (pg === "orders") renderOrders();
      else if (pg === "barcode") renderBarcodeStudioPage();
      else if (pg === "users") { renderUsersTable(); renderPermissionsUI(); }
    }
    if (window.CashierButtons) CashierButtons.apply();
  } catch (err) {
    console.error("switchSection", pg, err);
  }
  if (window.I18n && typeof I18n.apply === "function") {
    try { I18n.apply(document.body); } catch (eI18) {}
  }
}


/* ═══ DASHBOARD ═══ */

function isIncomeOrder(o) {
  if (!o) return false;
  if (o.fromDebt || o.ledgerOnly || o.excludeFromIncome || o.manualDebt) return false;
  return true;
}

function incomeOrders(list) {
  return (list || []).filter(isIncomeOrder);
}

function renderDashboard() {
  var orders = incomeOrders(branchRecords(DB.orders));
  var today = localYmd(new Date());
  var todayOrders = orders.filter(function (o) { return o.date && localYmd(o.date) === today; });
  var todaySales = todayOrders.reduce(function (s, o) { return s + (o.total || 0); }, 0);
  var todayCost = todayOrders.reduce(function (s, o) { return s + (o.totalCost || 0); }, 0);
  var todayGross = todaySales - todayCost;
  var todayExpenses = branchRecords(DB.expenses || []).filter(function (e) { return e.date && e.date.startsWith(today); }).reduce(function (s, e) { return s + (e.amount || 0); }, 0);
  var todayNet = todayGross - todayExpenses;
  var totalProducts = DB.products.length;
  var lowStock = DB.products.filter(function (p) { return productTracksStock(p) && p.stock <= (p.minAlert || 5); }).length;
  var totalValue = DB.products.reduce(function (s, p) { return s + (p.price * (p.stock || 0)); }, 0);
  var totalCostValue = DB.products.reduce(function (s, p) { return s + ((p.cost || 0) * (p.stock || 0)); }, 0);
  var potentialProfit = totalValue - totalCostValue;
  var netColor = todayNet >= 0 ? "var(--success)" : "var(--danger)";
  var todayPay = { cash: 0, card: 0, debt: 0, usd: 0 };
  var todayPayN = { cash: 0, card: 0, debt: 0, usd: 0 };
  todayOrders.forEach(function (o) {
    var k = (typeof orderPayKind === "function") ? orderPayKind(o) : (o.paymentMethod || "cash");
    todayPay[k] = (todayPay[k] || 0) + (o.total || 0);
    todayPayN[k] = (todayPayN[k] || 0) + 1;
  });
  var statsHtml = '<div class="stat-card accent clickable" onclick="switchSection(\'pos\')"><div class="stat-icon"><i class="fas fa-dollar-sign"></i></div><div class="stat-label">فرۆشتنی ئەمڕۆ</div><div class="stat-value">' + fmt(todaySales) + '</div><div class="stat-hint">' + todayOrders.length + ' پسوڵە — چوون بۆ کاشێر</div></div>';
  statsHtml += '<div class="stat-card success clickable" onclick="openOrdersPayFilter(\'cash\')"><div class="stat-icon"><i class="fas fa-money-bill-wave"></i></div><div class="stat-label">نەقدی ئەمڕۆ</div><div class="stat-value" style="color:#10b981;">' + fmt(todayPay.cash || 0) + '</div><div class="stat-hint">' + (todayPayN.cash || 0) + ' پسوڵە</div></div>';
  statsHtml += '<div class="stat-card info clickable" onclick="openOrdersPayFilter(\'card\')"><div class="stat-icon"><i class="fas fa-credit-card"></i></div><div class="stat-label">کارتی ئەمڕۆ</div><div class="stat-value" style="color:#38bdf8;">' + fmt(todayPay.card || 0) + '</div><div class="stat-hint">' + (todayPayN.card || 0) + ' پسوڵە — کلیک بۆ لیست</div></div>';
  statsHtml += '<div class="stat-card warning clickable" onclick="openOrdersPayFilter(\'debt\')"><div class="stat-icon"><i class="fas fa-hand-holding-dollar"></i></div><div class="stat-label">قەرزی ئەمڕۆ</div><div class="stat-value" style="color:#f59e0b;">' + fmt(todayPay.debt || 0) + '</div><div class="stat-hint">' + (todayPayN.debt || 0) + ' پسوڵە</div></div>';
  if (todayPayN.usd) {
    statsHtml += '<div class="stat-card success clickable" onclick="openOrdersPayFilter(\'usd\')"><div class="stat-icon"><i class="fas fa-dollar-sign"></i></div><div class="stat-label">دۆلاری ئەمڕۆ</div><div class="stat-value">' + fmt(todayPay.usd || 0) + '</div><div class="stat-hint">' + todayPayN.usd + ' پسوڵە</div></div>';
  }
  statsHtml += '<div class="stat-card danger clickable" onclick="switchFinanceHubTab(\'expenses\')"><div class="stat-icon"><i class="fas fa-receipt"></i></div><div class="stat-label">مەسرەفی ئەمڕۆ</div><div class="stat-value" style="color:#ef4444;">' + fmt(todayExpenses) + '</div><div class="stat-hint">کارەبا، کرێ، مووچە و هیتر</div></div>';
  statsHtml += '<div class="stat-card profit clickable" onclick="switchFinanceHubTab(\'balance\')"><div class="stat-icon"><i class="fas fa-scale-balanced"></i></div><div class="stat-label">قازانجی سافی ئەمڕۆ</div><div class="stat-value" style="color:' + netColor + '">' + fmt(todayNet) + '</div><div class="stat-hint">فرۆشتن - تێچووی کاڵا - مەسرەف (قازانجی کاڵا: ' + fmt(todayGross) + ')</div></div>';
  statsHtml += '<div class="stat-card success clickable" onclick="switchSection(\'products\')"><div class="stat-icon"><i class="fas fa-boxes"></i></div><div class="stat-label">بەرهەمەکان</div><div class="stat-value">' + totalProducts + '</div><div class="stat-hint">بەڕێوەبردنی بەرهەمەکان</div></div>';
  statsHtml += '<div class="stat-card info clickable" onclick="switchSection(\'inventory\')"><div class="stat-icon"><i class="fas fa-warehouse"></i></div><div class="stat-label">نرخی فرۆشتنی کۆگا</div><div class="stat-value">' + fmt(totalValue) + '</div><div class="stat-hint">قازانجی کۆگا ئەگەر هەمووی بفرۆشرێت: ' + fmt(potentialProfit) + '</div></div>';
  statsHtml += '<div class="stat-card ' + (lowStock > 0 ? "warning" : "success") + ' clickable" onclick="switchSection(\'inventory\')"><div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div><div class="stat-label">کۆگای کەم</div><div class="stat-value">' + lowStock + '</div><div class="stat-hint">بینینی کۆگا</div></div>';
  var dashStats = $("#dashStats"); if (dashStats) dashStats.innerHTML = statsHtml;
  var dashToday = $("#dashboardToday");
  if (dashToday) dashToday.innerHTML = "";
  renderTopProducts();
  renderLowStockDashboard();
  renderExpiringSoonDashboard();
  renderActiveCashiers();
  renderRecentSalesDashboard(orders);
  renderSimpleSales();
}

function updateClock() {
  var now = new Date();
  var hours = now.getHours();
  var ampm = hours >= 12 ? "PM" : "AM";
  var h = hours % 12; if (h === 0) h = 12;
  var m = String(now.getMinutes()).padStart(2, "0");
  var s = String(now.getSeconds()).padStart(2, "0");
  var day = now.getDate();
  var dow = ["یەکشەممە","دووشەممە","سێشەممە","چوارشەممە","پێنجشەممە","هەینی","شەممە"][now.getDay()];
  var mn = ["کانوونی دووەم","شوبات","ئازار","نیسان","ئایار","حوزەیران","تەمموز","ئاب","ئەیلوول","تشرینی یەکەم","تشرینی دووەم","کانونی یەکەم"][now.getMonth()];
  var yr = now.getFullYear();
  var el = $("#topbarClock");
  if (el) { el.innerHTML = '<div class="clock-time">' + h + ':' + m + ':' + s + ' ' + ampm + '</div><div class="clock-date">' + dow + '، ' + day + 'ی ' + mn + 'ی ' + yr + '</div>'; }
}

function renderDashboardToday(todaySales, todayProfit) {
  renderDashboard();
}

function dashEasyEmpty(icon, text) {
  return '<div class="dash-easy-empty"><i class="fas ' + icon + '"></i><span>' + text + '</span></div>';
}

function setDashCount(id, n, warn) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = String(n || 0);
  el.classList.toggle("is-warn", !!warn && n > 0);
}

function renderTopProducts() {
  var container = $("#topProductsList");
  if (!container) return;
  var today = localYmd(new Date());
  var productSales = {};
  incomeOrders(branchRecords(DB.orders)).forEach(function (order) {
    if (!order.date || localYmd(order.date) !== today) return;
    if (order.items) {
      order.items.forEach(function (item) {
        var name = item.name || "کاڵا";
        if (!productSales[name]) productSales[name] = { qty: 0, total: 0 };
        productSales[name].qty += item.qty || 0;
        productSales[name].total += (item.price || 0) * (item.qty || 0);
      });
    }
  });
  var sorted = Object.entries(productSales).sort(function (a, b) { return b[1].total - a[1].total; }).slice(0, 8);
  setDashCount("topProductsCount", sorted.length, false);
  if (sorted.length === 0) {
    container.innerHTML = dashEasyEmpty("fa-trophy", "ئەمڕۆ هێشتا هیچ کاڵایەک نەفرۆشراوە");
    return;
  }
  container.innerHTML = sorted.map(function (item, i) {
    var rankClass = i === 0 ? " gold" : i === 1 ? " silver" : i === 2 ? " bronze" : "";
    return '<div class="dash-easy-row" onclick="switchSection(\'products\')">' +
      '<div class="dash-easy-rank' + rankClass + '">' + (i + 1) + '</div>' +
      '<div class="dash-easy-main"><strong>' + item[0] + '</strong><span>' + item[1].qty + ' دانە فرۆشرا</span></div>' +
      '<div class="dash-easy-value">' + fmt(item[1].total) + '</div></div>';
  }).join("");
}

function renderLowStockDashboard() {
  var container = $("#lowStockList");
  if (!container) return;
  var lowStock = DB.products.filter(function (p) { return productTracksStock(p) && p.stock <= (p.minAlert || 5); }).slice(0, 8);
  setDashCount("lowStockCount", lowStock.length, true);
  if (lowStock.length === 0) {
    container.innerHTML = dashEasyEmpty("fa-check-circle", "کۆگا باشە — هیچ کاڵایەک کەم نییە");
    return;
  }
  container.innerHTML = lowStock.map(function (p) {
    var empty = (p.stock || 0) <= 0;
    var need = p.minAlert || 5;
    var status = empty ? "نەماوە — بیکڕەوە" : "پێویستە زیاتر لە " + need + " دانە بێت";
    return '<div class="dash-easy-row ' + (empty ? "is-danger" : "is-warn") + '" onclick="switchSection(\'inventory\')">' +
      '<div class="dash-easy-main"><strong>' + (p.name || "کاڵا") + '</strong><span>' + status + '</span></div>' +
      '<span class="dash-easy-badge ' + (empty ? "danger" : "warn") + '">' + (empty ? "0 ماوە" : p.stock + " ماوە") + '</span></div>';
  }).join("");
}

function renderExpiringSoonDashboard() {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(today.getDate() + 7);
  var expiringSoon = DB.products.filter(function (p) {
    if (!productTracksExpiry(p) || !p.expiryDate) return false;
    var expiryDate = new Date(p.expiryDate);
    if (isNaN(expiryDate.getTime())) return false;
    expiryDate.setHours(0, 0, 0, 0);
    return expiryDate >= today && expiryDate <= sevenDaysLater;
  }).sort(function (a, b) { return new Date(a.expiryDate) - new Date(b.expiryDate); });
  var container = $("#expiringSoonList");
  if (!container) return;
  setDashCount("expiringSoonCount", expiringSoon.length, true);
  if (expiringSoon.length === 0) {
    container.innerHTML = dashEasyEmpty("fa-calendar-check", "لە ٧ ڕۆژی داهاتوودا هیچ کاڵایەک تەواو نابێت");
    return;
  }
  container.innerHTML = expiringSoon.slice(0, 8).map(function (p) {
    var expiryDate = new Date(p.expiryDate);
    var dateStr = expiryDate.toLocaleDateString("en-GB");
    expiryDate.setHours(0, 0, 0, 0);
    var daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    var danger = daysLeft <= 3;
    return '<div class="dash-easy-row ' + (danger ? "is-danger" : "is-warn") + '" onclick="switchSection(\'inventory\')">' +
      '<div class="dash-easy-main"><strong>' + (p.name || "کاڵا") + '</strong><span>بەروار: ' + dateStr + '</span></div>' +
      '<span class="dash-easy-badge ' + (danger ? "danger" : "warn") + '">' + daysLeft + ' ڕۆژ ماوە</span></div>';
  }).join("");
}

function renderActiveCashiers() {
  var container = $("#activeCashiersList");
  if (!container) return;
  var cashierStats = {};
  var today = localYmd(new Date());
  incomeOrders(branchRecords(DB.orders)).forEach(function (order) {
    if (!order.date || localYmd(order.date) !== today) return;
    var cashier = order.cashier || "کاشیر";
    if (!cashierStats[cashier]) cashierStats[cashier] = { orders: 0, total: 0, cash: 0, card: 0, debt: 0 };
    cashierStats[cashier].orders += 1;
    cashierStats[cashier].total += order.total || 0;
    var pk = (typeof orderPayKind === "function") ? orderPayKind(order) : (order.paymentMethod || "cash");
    if (pk === "card") cashierStats[cashier].card += order.total || 0;
    else if (pk === "debt") cashierStats[cashier].debt += order.total || 0;
    else cashierStats[cashier].cash += order.total || 0;
  });
  var cashiers = Object.entries(cashierStats).sort(function (a, b) { return b[1].total - a[1].total; });
  setDashCount("activeCashiersCount", cashiers.length, false);
  if (cashiers.length === 0) {
    container.innerHTML = dashEasyEmpty("fa-user", "ئەمڕۆ هێشتا هیچ کاشیرێک فرۆشی نەکردووە");
    return;
  }
  container.innerHTML = cashiers.map(function (c) {
    var mix = c[1].orders + " پسوڵە · نەقد " + fmt(c[1].cash || 0);
    if (c[1].card) mix += " · کارت " + fmt(c[1].card);
    if (c[1].debt) mix += " · قەرز " + fmt(c[1].debt);
    return '<div class="dash-easy-row" onclick="switchSection(\'shifts\')">' +
      '<div class="dash-easy-main"><strong>' + c[0] + '</strong><span>' + mix + '</span></div>' +
      '<div class="dash-easy-value">' + fmt(c[1].total) + '</div></div>';
  }).join("");
}

function openOrdersPayFilter(kind) {
  ORDERS_PERIOD = "today";
  ORDERS_PAYMENT_FILTER = kind || "all";
  ORDERS_RECEIPT_FILTER = "all";
  var per = $("#ordersPeriodFilter");
  if (per) per.value = "today";
  var pay = $("#ordersPaymentFilter");
  if (pay) pay.value = ORDERS_PAYMENT_FILTER;
  var rec = $("#ordersReceiptFilter");
  if (rec) rec.value = "all";
  if (typeof switchSection === "function") switchSection("orders");
}
window.openOrdersPayFilter = openOrdersPayFilter;

function renderRecentSalesDashboard(orders) {
  var list = $("#recentSalesList");
  var tbody = $("#recentSalesTable tbody");
  var recent = (orders || []).slice(-8).reverse();
  if (tbody) {
    tbody.innerHTML = recent.map(function (o, i) {
      var orderProfit = (o.profit !== undefined) ? o.profit : ((o.total || 0) - (o.totalCost || 0));
      var profitColor = orderProfit >= 0 ? "var(--success)" : "var(--danger)";
      var pay = (typeof orderPayLabel === "function") ? orderPayLabel(o) : (o.paymentMethod || "cash");
      return '<tr><td>' + (i + 1) + '</td><td>' + (o.cashier || "کاشیر") + '</td><td>' + (o.items ? o.items.length : 0) + '</td><td><strong>' + fmt(o.total || 0) + '</strong></td><td style="color:' + profitColor + ';font-weight:700;">' + fmt(orderProfit) + '</td><td>' + pay + '</td><td>' + formatSaleDateTime(o.date) + '</td></tr>';
    }).join("");
  }
  if (!list) return;
  if (!recent.length) {
    list.innerHTML = dashEasyEmpty("fa-receipt", "هێشتا هیچ پسوڵەیەک نییە");
    return;
  }
  list.innerHTML = recent.map(function (o) {
    var items = o.items ? o.items.length : 0;
    var pay = (typeof orderPayLabel === "function") ? orderPayLabel(o) : "";
    return '<div class="dash-easy-row" onclick="switchSection(\'orders\')">' +
      '<div class="dash-easy-main"><strong>' + (o.cashier || "کاشیر") + '</strong><span>' + formatSaleDateTime(o.date) + ' · ' + items + ' کاڵا · ' + pay + '</span></div>' +
      '<div class="dash-easy-value">' + fmt(o.total || 0) + '</div></div>';
  }).join("");
}

function renderSimpleSales() {
  var now = new Date();
  var selYear = now.getFullYear();
  var selMonth = now.getMonth();
  var daysInMonth = new Date(selYear, selMonth + 1, 0).getDate();
  var todayDate = now.getDate();
  var isCurrentMonth = true;
  var dailySales = {};
  incomeOrders(branchRecords(DB.orders)).forEach(function (o) {
    if (!o.date) return;
    var d = new Date(o.date);
    if (d.getFullYear() === selYear && d.getMonth() === selMonth) {
      var dayKey = d.getDate();
      dailySales[dayKey] = (dailySales[dayKey] || 0) + (o.total || 0);
    }
  });
  var todayTotal = dailySales[todayDate] || 0;
  var KU_MONTHS = ["کانوونی دووەم","شوبات","ئازار","نیسان","ئایار","حوزەیران","تەمموز","ئاب","ئەیلوول","تشرینی یەکەم","تشرینی دووەم","کانونی یەکەم"];
  var KU_DAYS = ["یەکشەممە","دووشەممە","سێشەممە","چوارشەممە","پێنجشەممە","هەینی","شەممە"];
  var monthOptions = "";
  for (var i = 0; i < 12; i++) { monthOptions += '<option value="' + i + '">' + (i + 1) + '. ' + KU_MONTHS[i] + '</option>'; }
  var yearOptions = "";
  for (var y = 2022; y <= 2030; y++) { yearOptions += '<option value="' + y + '">' + y + '</option>'; }
  var dayGridHtml = "";
  for (var d = 1; d <= daysInMonth; d++) {
    var dayDate = new Date(selYear, selMonth, d);
    var dayName = KU_DAYS[dayDate.getDay()];
    var sales = dailySales[d] || 0;
    var isToday = (d === todayDate);
    var todayClass = isToday ? " today" : "";
    var zeroClass = (sales === 0) ? " zero" : "";
    var salesDisplay = sales > 0 ? fmt(sales) : "0";
    dayGridHtml += '<div class="ds-day' + todayClass + '"><div class="ds-day-num">' + d + '</div><div class="ds-day-sales' + zeroClass + '">' + salesDisplay + '</div><div class="ds-day-name">' + dayName + '</div></div>';
  }
  var todayZeroClass = (todayTotal === 0) ? " zero" : "";
  var html = '<div class="ds-row">';
  html += '<div class="ds-sales-today"><div class="ds-label">فرۆشتنی ئەمڕۆ</div><div class="ds-amount' + todayZeroClass + '">' + fmt(todayTotal) + '</div></div>';
  html += '<div class="ds-date-picker">';
  html += '<select class="ds-select" id="dsMonthSel" onchange="location.reload()">' + monthOptions + '</select>';
  html += '<select class="ds-select" id="dsYearSel" onchange="location.reload()">' + yearOptions + '</select>';
  html += '</div></div>';
  html += '<div class="ds-day-grid">' + dayGridHtml + '</div>';
  var el = $("#dashSales"); if (el) el.innerHTML = html;
}


/* ═══ POS ═══ */

var POS_CLOCK_INTERVAL = null;

function updatePosClock() {
  var el = $("#posClock");
  if (!el) return;
  var now = new Date();
  el.textContent = formatSaleTime(now, true) + " · " + now.toLocaleDateString("ar-IQ", { weekday: "short", month: "short", day: "numeric" });
}

function startPosClock() {
  updatePosClock();
  if (POS_CLOCK_INTERVAL) clearInterval(POS_CLOCK_INTERVAL);
  POS_CLOCK_INTERVAL = setInterval(updatePosClock, 1000);
}

function stopPosClock() {
  if (POS_CLOCK_INTERVAL) { clearInterval(POS_CLOCK_INTERVAL); POS_CLOCK_INTERVAL = null; }
}

function renderPosGrid() {
  var g = $("#posGrid"); if (!g) return;
  if (DB.products.length === 0) { g.innerHTML = '<div class="pos-empty-state"><i class="fas fa-box-open"></i><p>هێشتا بەرهەم نییە</p><span>بەرهەم زیاد بکە لە بەشی بەرهەمەکان</span></div>'; return; }
  var search = ($("#posSearch") ? $("#posSearch").value : "").toLowerCase();
  var filtered = search ? DB.products.filter(function (p) { return p.name.toLowerCase().indexOf(search) !== -1 || String(p.barcode).indexOf(search) !== -1; }) : DB.products;
  g.innerHTML = filtered.map(function (p) {
    var tracksStock = productTracksStock(p);
    var stockClass = !tracksStock ? "stock-ok" : p.stock <= 0 ? "stock-out" : p.stock <= (p.minAlert || 5) ? "stock-low" : "stock-ok";
    var stockText = !tracksStock ? "بێ کۆگا" : p.stock <= 0 ? "نەماوە" : p.stock + " ماوە";
    var disabledClass = tracksStock && p.stock <= 0 ? " pos-item-disabled" : "";
    var imgHtml = buildImageHtml(p.id, p.name, p.image);
    var packBtn = "";
    if (productTracksPack(p) && (p.packQty > 1 || p.packPrice > 0) && (!tracksStock || p.stock > 0)) {
      var packPrice = p.packPrice > 0 ? p.packPrice : (p.price * (p.packQty || 1));
      packBtn = '<button type="button" class="btn-pos-pack" onclick="event.stopPropagation();addToCart(\'' + p.id + '\', 1, \'carton\')" title="فرۆشتنی ١ کارتۆن (' + (p.packQty || 1) + ' دانە)" style="margin-top:4px;padding:3px 6px;font-size:0.68rem;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;display:flex;align-items:center;justify-content:center;gap:4px;width:100%;"><i class="fas fa-box"></i> کارتۆن: ' + fmt(packPrice) + '</button>';
    }
    return '<div class="pos-item' + disabledClass + '" onclick="addToCart(\'' + p.id + '\', 1, \'piece\')"><div class="img">' + imgHtml + '</div><div class="info"><div class="name">' + p.name + '</div><div class="price">' + fmt(p.price) + '</div>' + packBtn + '</div><span class="stock-tag ' + stockClass + '">' + stockText + '</span></div>';
  }).join("");
}

function renderPosCategories() {
  var container = $("#posCategories"); if (!container) return;
  var allTab = (typeof getOriginTab === "function") ? getOriginTab("all") : { name: "هەموو", icon: "fa-th-large", color: "#10b981" };
  var html = '<button class="pos-cat-btn active" onclick="filterPosCat(\'all\',this)">' + buildCategoryMediaHtml(allTab, "lux-media-tile-sm") + ' ' + String(allTab.name || "هەموو").replace(/</g, "") + '</button>';
  getCashierCategories().forEach(function (c) {
    html += '<button class="pos-cat-btn" onclick="filterPosCat(\'' + c.id + '\',this)">' + buildCategoryMediaHtml(c, "lux-media-tile-sm") + ' ' + c.name + '</button>';
  });
  container.innerHTML = html;
}

function filterPosCat(catId, btn) {
  $$(".pos-cat-btn").forEach(function (b) { b.classList.remove("active"); });
  btn.classList.add("active");
  var g = $("#posGrid"); if (!g) return;
  var prods = catId === "all"
    ? DB.products
    : catId === "__none__"
      ? DB.products.filter(function (p) { return !productCategoryIsReal(p.cat); })
      : DB.products.filter(function (p) { return p.cat === catId; });
  g.innerHTML = prods.map(function (p) {
    var tracksStock = productTracksStock(p);
    var stockClass = !tracksStock ? "stock-ok" : p.stock <= 0 ? "stock-out" : p.stock <= (p.minAlert || 5) ? "stock-low" : "stock-ok";
    var disabledClass = tracksStock && p.stock <= 0 ? " pos-item-disabled" : "";
    var imgHtml = buildImageHtml(p.id, p.name, p.image);

    // Expiry badge
    var expiryBadge = "";
    if (productTracksExpiry(p) && p.expiryDate) {
      var expDate = new Date(p.expiryDate);
      var today = new Date();
      today.setHours(0,0,0,0);
      expDate.setHours(0,0,0,0);
      var daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
      if (daysLeft < 0) {
        expiryBadge = '<span class="pos-expiry-badge exp-expired" style="position:absolute;top:4px;left:4px;background:#7f1d1d;color:#fecaca;font-size:0.62rem;font-weight:800;padding:2px 5px;border-radius:4px;z-index:2;border:1px solid #ef4444;"><i class="fas fa-ban"></i> بەسەرچووە</span>';
      } else if (daysLeft <= 3) {
        expiryBadge = '<span class="pos-expiry-badge exp-crit" style="position:absolute;top:4px;left:4px;background:#dc2626;color:#fff;font-size:0.62rem;font-weight:800;padding:2px 5px;border-radius:4px;z-index:2;box-shadow:0 0 8px rgba(220,38,38,0.8);"><i class="fas fa-radiation"></i> ' + daysLeft + ' ڕۆژ</span>';
      } else if (daysLeft <= 7) {
        expiryBadge = '<span class="pos-expiry-badge exp-warn" style="position:absolute;top:4px;left:4px;background:#d97706;color:#fff;font-size:0.62rem;font-weight:800;padding:2px 5px;border-radius:4px;z-index:2;"><i class="fas fa-clock"></i> ' + daysLeft + ' ڕۆژ</span>';
      }
    }

    // Clearance & Offer price calculation
    var priceDisplay = fmt(p.price);
    var clearanceDisc = parseFloat(p.clearanceDiscount) || 0;
    var offerInfo = (typeof getOfferInfo === "function") ? getOfferInfo(p) : { active: false };
    if (offerInfo.active) {
      priceDisplay = '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">' +
        '<del style="opacity:0.6;font-size:0.75rem;color:var(--text-muted);">' + fmt(p.price) + '</del> ' +
        '<strong style="color:#ef4444;font-size:0.95rem;">' + fmt(offerInfo.offerPrice) + '</strong> ' +
        '<span style="background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:0.6rem;padding:1px 5px;border-radius:3px;font-weight:800;"><i class="fas fa-fire"></i> -%' + offerInfo.percent + ' ئۆفەر</span>' +
      '</div>';
    } else if (clearanceDisc > 0) {
      var promoPrice = (parseFloat(p.clearancePrice) > 0) ? parseFloat(p.clearancePrice) : Math.round(p.price * (1 - clearanceDisc / 100));
      priceDisplay = '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">' +
        '<del style="opacity:0.6;font-size:0.75rem;color:var(--text-muted);">' + fmt(p.price) + '</del> ' +
        '<strong style="color:#ef4444;font-size:0.95rem;">' + fmt(promoPrice) + '</strong> ' +
        '<span style="background:#ef4444;color:#fff;font-size:0.6rem;padding:1px 4px;border-radius:3px;font-weight:800;">-%' + clearanceDisc + ' پاکتاو</span>' +
      '</div>';
    }

    var packBtn = "";
    if (productTracksPack(p) && (p.packQty > 1 || p.packPrice > 0) && (!tracksStock || p.stock > 0)) {
      var packPrice = p.packPrice > 0 ? p.packPrice : (p.price * (p.packQty || 1));
      packBtn = '<button type="button" class="btn-pos-pack" onclick="event.stopPropagation();addToCart(\'' + p.id + '\', 1, \'carton\')" title="فرۆشتنی ١ کارتۆن (' + (p.packQty || 1) + ' دانە)" style="margin-top:4px;padding:3px 6px;font-size:0.68rem;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;display:flex;align-items:center;justify-content:center;gap:4px;width:100%;"><i class="fas fa-box"></i> کارتۆن: ' + fmt(packPrice) + '</button>';
    }
    return '<div class="pos-item' + disabledClass + '" style="position:relative;" onclick="addToCart(\'' + p.id + '\', 1, \'piece\')">' +
      expiryBadge +
      '<div class="img">' + imgHtml + '</div>' +
      '<div class="info">' +
        '<div class="name">' + p.name + '</div>' +
        '<div class="price">' + priceDisplay + '</div>' +
        packBtn +
      '</div>' +
      '<span class="stock-tag ' + stockClass + '">' + p.stock + '</span>' +
    '</div>';
  }).join("");
}

/* ═══ CHECKOUT & DEBT ═══ */

function checkout(paymentMethod) {
  paymentMethod = paymentMethod || "cash";
  if (paymentMethod === "card") {
    handlePosCardSale();
    return;
  }
  var currentCart = (CUSTOMER_QUEUE[ACTIVE_CUSTOMER] && CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart) || [];
  if (currentCart.length === 0) {
    toast("سەبەتە بەتاڵە", "تکایە سەرەتا کاڵا زیاد بکە پێش پارەدان بە " + (paymentMethod === "card" ? "کارت" : "پارە"), "warning");
    if (typeof PosAudio !== "undefined") PosAudio.playErrorBuzz();
    return;
  }
  if (!CURRENT_SHIFT) {
    // Auto-open shift if not open
    var shift = { id: gid(), cashier: getActiveOperatorName(), startTime: new Date().toISOString(), startCash: 0, endCash: 0, difference: 0, status: "open" };
    if (typeof BranchManager !== "undefined" && BranchManager.stamp) BranchManager.stamp(shift);
    DB.shifts.push(shift);
    CURRENT_SHIFT = shift;
    DataStore.saveShifts();
    toast("ئاگادارکردن", "شێفت خۆکارانە کرایەوە", "info");
    updateShiftButtons();
  }
  var subtotal = currentCart.reduce(function (s, c) { return s + c.price * c.qty; }, 0);
  var totalCost = currentCart.reduce(function (s, c) { return s + (c.cost || 0) * c.qty; }, 0);
  var discIn = $("#discountInput");
  var discPct = getPosDiscountPct();
  var discAmt = Math.round((subtotal * discPct) / 100);
  var total = subtotal - discAmt;
  var profit = total - totalCost;
  var cartCopy = currentCart.map(function (c) {
    return {
      prodId: c.prodId,
      name: c.name,
      price: c.price,
      cost: c.cost || 0,
      qty: c.qty,
      unitType: c.unitType || 'piece',
      unit: c.unit || 'piece',
      packQty: c.packQty || 1,
      isPack: (c.unitType === 'carton')
    };
  });
  var order = {
    id: gid(),
    items: cartCopy,
    subtotal: subtotal,
    totalCost: totalCost,
    discount: discAmt,
    total: total,
    profit: profit,
    cashier: getActiveOperatorName(),
    date: new Date().toISOString(),
    paymentMethod: paymentMethod,
    shiftId: CURRENT_SHIFT ? CURRENT_SHIFT.id : null,
    customerId: ACTIVE_CUSTOMER,
    customerName: CUSTOMER_QUEUE[ACTIVE_CUSTOMER].name
  };
  stampOrderBillNo(order);
  if (typeof BranchManager !== "undefined" && BranchManager.stamp) BranchManager.stamp(order);
  LAST_ORDER = order;
  PENDING_DEBT = { order: order, total: total, cartItems: cartCopy };
  $("#printConfirmTotal").textContent = fmt(total);
  var profitEl = $("#printConfirmProfit");
  if (profitEl) {
    var profitColor = profit >= 0 ? "var(--success)" : "var(--danger)";
    profitEl.textContent = "قازانج: " + fmt(profit);
    profitEl.style.color = profitColor;
  }
  CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart = [];
  renderCart();
  showModal("printConfirmModal");
}

function reducePendingStock() {
  if (!PENDING_DEBT || !PENDING_DEBT.cartItems) return;
  PENDING_DEBT.cartItems.forEach(function (c) {
    var prod = DB.products.find(function (p) { return p.id === c.prodId; });
    if (prod) {
      var deductQty = (c.unitType === 'carton') ? (c.qty * (c.packQty || prod.packQty || 1)) : c.qty;
      deductProductStock(prod, deductQty);
    }
  });
  DataStore.saveProducts();
}

function confirmPrint(shouldPrint) {
  if (shouldPrint && typeof shouldPrint === "object") shouldPrint = true;
  if (typeof shouldPrint === "undefined") shouldPrint = true;
  hideModal("printConfirmModal");
  var order = LAST_ORDER || (PENDING_DEBT ? PENDING_DEBT.order : null);
  if (!order) { renderPosGrid(); return; }
  order.printed = !!shouldPrint;
  order.noPrint = !shouldPrint;
  if (typeof PosAudio !== "undefined") PosAudio.playCashChime();
  if (typeof ApiClient !== "undefined") {
    ApiClient.submitOrder(order);
  }
  if (!IS_ONLINE) {
    queueOfflineOperation("sale", order);
    toast("ئۆفلاین", "فرۆشتن لە سەر کیوە کرا", "warning");
  } else {
    DB.orders.push(order);
  }
  reducePendingStock();
  DataStore.saveOrders();
  PENDING_DEBT = null;
  if (shouldPrint && (!DB.settings || DB.settings.autoPrint !== "off")) {
    printReceiptDirect(order);
  }
  toast("سەرکەوتوو", shouldPrint ? "فرۆشتن تەواو کرا و چاپکرا" : "فرۆشتن تەواو کرا (بێ چاپ)", "success");
  renderPosGrid();
}

function restorePendingCheckoutCart() {
  if (PENDING_DEBT && PENDING_DEBT.cartItems && CUSTOMER_QUEUE[ACTIVE_CUSTOMER]) {
    CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart = PENDING_DEBT.cartItems.slice();
  }
  PENDING_DEBT = null;
}

function cancelPrint() {
  hideModal("printConfirmModal");
  restorePendingCheckoutCart();
  renderCart();
}

function openDebtCustomerModal() {
  hideModal("printConfirmModal");
  $("#debtCustomerName").value = "";
  var itemsHtml = PENDING_DEBT.order.items.map(function (i) {
    return '<div style="display:flex;justify-content:space-between;padding:4px 0;"><span>' + i.name + ' × ' + i.qty + '</span><span>' + fmt(i.price * i.qty) + '</span></div>';
  }).join("");
  $("#debtCartItems").innerHTML = itemsHtml;
  $("#debtCartTotal").textContent = fmt(PENDING_DEBT.total);
  showModal("debtCustomerModal");
  setTimeout(refreshDebtLimitHint, 50);
}

function getDebtRemainingAmount(d) {
  if (!d) return 0;
  if (d.paid) return 0;
  var total = parseFloat(d.total || d.amount) || 0;
  var paidAmt = parseFloat(d.paidAmount) || 0;
  if (d.remainingAmount !== undefined && d.remainingAmount !== null) {
    return Math.max(0, parseFloat(d.remainingAmount) || 0);
  }
  return Math.max(0, total - paidAmt);
}

var DEFAULT_DEBT_LIMIT = 75000;
var LAST_DEBT_LIMIT_INFO = null;

function isDebtUnlimited(limit) {
  return !isFinite(limit) || Number(limit) <= 0;
}

function formatDebtLimit(limit) {
  return isDebtUnlimited(limit) ? "بێ سنوور" : fmt(limit);
}

function isCreditLimitEnforced() {
  var s = (typeof DB !== "undefined" && DB.settings) ? DB.settings : null;
  if (!s) return true;
  if (s.creditLimitEnabled === "off" || s.creditLimitEnabled === false || s.creditLimitEnabled === 0) return false;
  var n = parseFloat(s.creditLimit);
  if (isFinite(n) && n <= 0) return false;
  return true;
}

function getGlobalDebtLimit() {
  if (!isCreditLimitEnforced()) return 0;
  var n = parseFloat(typeof DB !== "undefined" && DB.settings && DB.settings.creditLimit);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

function customerWantsUnlimitedDebt(cust) {
  if (!cust) return false;
  if (cust.debtUnlimited === true || cust.debtUnlimited === 1 || cust.debtUnlimited === "on") return true;
  if (cust.debtLimit === 0 || cust.debtLimit === "0") return true;
  return false;
}

function normalizeWhatsAppPhone(phone) {
  var digits = String(phone || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("07")) digits = "964" + digits.slice(1);
  else if (digits.startsWith("7") && digits.length === 10) digits = "964" + digits;
  else if (digits.startsWith("00964")) digits = digits.slice(2);
  else if (digits.startsWith("964")) { /* already */ }
  else if (digits.length === 11 && digits.charAt(0) === "0") digits = "964" + digits.slice(1);
  return digits;
}

function findDebtCustomer(name, phone) {
  if (!DB.customers) return null;
  var cleanName = String(name || "").trim().toLowerCase();
  var cleanPhone = String(phone || "").replace(/[^0-9]/g, "");
  var found = null;
  if (cleanName) {
    found = DB.customers.find(function (c) {
      return c.name && c.name.trim().toLowerCase() === cleanName;
    });
  }
  if (!found && cleanPhone.length >= 7) {
    found = DB.customers.find(function (c) {
      return c.phone && String(c.phone).replace(/[^0-9]/g, "").slice(-10) === cleanPhone.slice(-10);
    });
  }
  return found || null;
}

function sumOpenDebtForCustomer(name, phone) {
  var cleanName = String(name || "").trim().toLowerCase();
  var cleanPhone = String(phone || "").replace(/[^0-9]/g, "");
  var sum = 0;
  (DB.debts || []).forEach(function (d) {
    var sameName = cleanName && d.customerName && d.customerName.trim().toLowerCase() === cleanName;
    var samePhone = cleanPhone.length >= 7 && d.customerPhone &&
      String(d.customerPhone).replace(/[^0-9]/g, "").slice(-10) === cleanPhone.slice(-10);
    if (sameName || (samePhone && !cleanName)) {
      sum += getDebtRemainingAmount(d);
    }
  });
  return sum;
}

function getCustomerDebtLimit(cust) {
  if (customerWantsUnlimitedDebt(cust)) return 0;
  if (cust && cust.debtLimit != null && cust.debtLimit !== "") {
    var own = parseFloat(cust.debtLimit);
    if (isFinite(own)) return Math.max(0, Math.round(own));
  }
  return getGlobalDebtLimit();
}

function getCustomerCurrentDebt(cust, name, phone) {
  var fromProfile = cust ? (parseFloat(cust.currentDebt) || 0) : 0;
  var fromLedger = sumOpenDebtForCustomer(name || (cust && cust.name), phone || (cust && cust.phone));
  return Math.max(fromProfile, fromLedger);
}

function evaluateDebtPurchase(name, phone, extraAmount) {
  extraAmount = parseFloat(extraAmount) || 0;
  var cust = findDebtCustomer(name, phone);
  var current = getCustomerCurrentDebt(cust, name, phone);
  var limit = getCustomerDebtLimit(cust);
  var unlimited = isDebtUnlimited(limit);
  var projected = current + extraAmount;
  var remaining = unlimited ? Infinity : Math.max(0, limit - current);
  return {
    customer: cust,
    name: (cust && cust.name) || String(name || "").trim() || "کڕیار",
    phone: (phone && String(phone).trim()) || (cust && cust.phone) || "",
    current: current,
    extra: extraAmount,
    projected: projected,
    limit: limit,
    remaining: remaining,
    unlimited: unlimited,
    over: !unlimited && projected > limit,
    atLimit: !unlimited && current >= limit
  };
}

function buildFormalDebtWhatsApp(info) {
  info = info || LAST_DEBT_LIMIT_INFO || {};
  var store = (typeof getStoreName === "function") ? getStoreName() : "مارکێت";
  var storePhone = (DB.settings && (DB.settings.phone || DB.settings.marketPhone)) || "";
  var name = info.name || "کڕیار";
  var current = parseFloat(info.current) || 0;
  var extra = parseFloat(info.extra) || 0;
  var remaining = (info.remaining != null) ? parseFloat(info.remaining) : Math.max(0, (parseFloat(info.limit) || 0) - current);
  var limit = parseFloat(info.limit) || getGlobalDebtLimit();
  var due = extra > 0 ? (current + extra) : current;
  if (info.invoiceRemaining != null) due = parseFloat(info.invoiceRemaining) || due;
  if (info.projected && info.over) due = current;

  var lines = [
    "بەڕێز " + name + "،",
    "",
    "سڵاو و ڕێزی زۆر.",
    "",
    "ئەم نامەیە لە لایەن مارکێتی «" + store + "»ـەوە بۆتان دەنێردرێت سەبارەت بە حیسابی قەرزی بەڕێزتان.",
    "",
    "تکایە سەرنج بدەنە ئەم وردەکارییانە:",
    "١) قەرزی ئێستا: " + fmt(current) + " د.ع",
    "٢) سنووری ڕێگەپێدراو: " + formatDebtLimit(limit) + (isDebtUnlimited(limit) ? "" : " د.ع"),
    "٣) بڕی ماوە بۆ دانەوە: " + fmt(due > 0 ? due : current) + " د.ع"
  ];
  if (isDebtUnlimited(limit) || remaining === Infinity) {
    lines.push("٤) ماوەی بەردەست بۆ قەرزی نوێ: بێ سنوور");
  } else if (remaining <= 0) {
    lines.push("٤) تێبینی: سنووری قەرز تەواو بووە و چیتر ناتوانرێت کاڵا بە قەرز بدرێت.");
  } else {
    lines.push("٤) ماوەی بەردەست بۆ قەرزی نوێ: " + fmt(remaining) + " د.ع");
  }
  lines.push("");
  lines.push("تکایە بڕی ماوە لە کاتی گونجاودا پاکتاو بکەن، بۆ ئەوەی بتوانن بەردەوام بن لە کڕین بە قەرز.");
  lines.push("");
  lines.push("سوپاس بۆ تێگەیشتن و متمانەتان.");
  lines.push(store);
  if (storePhone) lines.push("تەلەفۆن: " + storePhone);
  return lines.join("\n");
}

function openWhatsAppText(phone, message) {
  var intl = normalizeWhatsAppPhone(phone);
  var encoded = encodeURIComponent(message || "");
  var url = intl
    ? ("https://wa.me/" + intl + "?text=" + encoded)
    : ("https://wa.me/?text=" + encoded);
  if (window.POS_DESKTOP && typeof POS_DESKTOP.openExternal === "function") {
    POS_DESKTOP.openExternal(url);
  } else {
    window.open(url, "_blank");
  }
}

function sendDebtLimitWhatsApp() {
  var info = LAST_DEBT_LIMIT_INFO;
  if (!info) {
    toast("ئاگاداری", "کڕیارێک هەڵنەبژێردراوە", "warning");
    return;
  }
  if (!info.phone) {
    toast("ژمارە نییە", "ژمارەی مۆبایلی کڕیار تۆمار بکە بۆ ناردنی واتسئاپ", "warning");
    var phoneEl = document.getElementById("debtCustomerPhone");
    if (phoneEl) phoneEl.focus();
    return;
  }
  openWhatsAppText(info.phone, buildFormalDebtWhatsApp(info));
  hideModal("debtLimitAlertModal");
}

function setDebtSaveEnabled(on) {
  var a = document.getElementById("debtSaveNoPrintBtn");
  var b = document.getElementById("debtSavePrintBtn");
  [a, b].forEach(function (btn) {
    if (!btn) return;
    btn.disabled = !on;
    btn.style.opacity = on ? "1" : "0.45";
    btn.style.pointerEvents = on ? "" : "none";
  });
}

function showDebtLimitAlert(info, opts) {
  opts = opts || {};
  LAST_DEBT_LIMIT_INFO = info;
  var textEl = document.getElementById("debtLimitAlertText");
  var numsEl = document.getElementById("debtLimitAlertNums");
  var who = info.name || "ئەم کڕیارە";
  if (textEl) {
    textEl.textContent = who + " گەیشتووەتە سنووری قەرز. ناتوانێت زیاتر کاڵا بە قەرز بکڕێت هەتا بڕی ماوە پاکتاو نەکات.";
  }
  if (numsEl) {
    numsEl.innerHTML =
      "قەرزی ئێستا: " + fmt(info.current) + "<br>" +
      (info.extra ? ("ئەم فرۆشتنە: " + fmt(info.extra) + "<br>") : "") +
      "سنوور: " + formatDebtLimit(info.limit) + "<br>" +
      "ماوەی بەردەست: " + (info.unlimited ? "بێ سنوور" : fmt(info.remaining));
  }
  if (!opts.quiet && typeof toast === "function") {
    toast("سنووری قەرز", who + " ناتوانێت زیاتر بە قەرز بکڕێت (" + fmt(info.current) + " / " + fmt(info.limit) + ")", "error");
  }
  if (!opts.quiet && typeof PosAudio !== "undefined") PosAudio.playErrorBuzz();
  showModal("debtLimitAlertModal");
}

function refreshDebtLimitHint() {
  var nameEl = document.getElementById("debtCustomerName");
  var phoneEl = document.getElementById("debtCustomerPhone");
  var box = document.getElementById("debtLimitBox");
  var name = nameEl ? nameEl.value.trim() : "";
  var phone = phoneEl ? phoneEl.value.trim() : "";
  var extra = (PENDING_DEBT && PENDING_DEBT.total) ? parseFloat(PENDING_DEBT.total) : 0;
  if (!name && !phone) {
    LAST_DEBT_LIMIT_INFO = null;
    if (box) { box.style.display = "none"; box.innerHTML = ""; }
    setDebtSaveEnabled(true);
    return null;
  }
  var info = evaluateDebtPurchase(name, phone, extra);
  LAST_DEBT_LIMIT_INFO = info;
  if (info.customer && phoneEl && !phoneEl.value && info.customer.phone) {
    phoneEl.value = info.customer.phone;
    info.phone = info.customer.phone;
  }
  if (!box) return info;
  box.style.display = "block";
  if (info.unlimited) {
    box.style.background = "rgba(16,185,129,0.12)";
    box.style.border = "1px solid rgba(16,185,129,0.35)";
    box.style.color = "#bbf7d0";
    box.innerHTML = 'قەرزی ئێستا: ' + fmt(info.current) + ' &nbsp;|&nbsp; سنوور: بێ سنوور — دەتوانێت هەر بڕێک قەرز بکات';
    setDebtSaveEnabled(true);
  } else if (info.over || info.atLimit) {
    box.style.background = "rgba(239,68,68,0.14)";
    box.style.border = "1px solid rgba(239,68,68,0.45)";
    box.style.color = "#fecaca";
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;">' +
        '<div>' +
          '<div><i class="fas fa-ban"></i> سنووری قەرز تەواو بوو — ناتوانێت زیاتر کاڵا بە قەرز بکڕێت</div>' +
          '<div style="margin-top:4px;font-size:0.8rem;">قەرزی ئێستا: ' + fmt(info.current) + ' / سنوور: ' + formatDebtLimit(info.limit) + ' — ئەم فرۆشتنە: ' + fmt(info.extra) + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-sm" style="background:#25d366;border:none;color:#052e16;font-weight:800;white-space:nowrap;" onclick="sendDebtLimitWhatsApp()"><i class="fab fa-whatsapp"></i> داوای قەرز</button>' +
      '</div>';
    setDebtSaveEnabled(false);
  } else {
    var warn = info.limit > 0 && info.remaining <= (info.limit * 0.15);
    box.style.background = warn ? "rgba(245,158,11,0.14)" : "rgba(16,185,129,0.12)";
    box.style.border = warn ? "1px solid rgba(245,158,11,0.4)" : "1px solid rgba(16,185,129,0.35)";
    box.style.color = warn ? "#fde68a" : "#bbf7d0";
    box.innerHTML =
      'قەرزی ئێستا: ' + fmt(info.current) +
      ' &nbsp;|&nbsp; سنوور: ' + formatDebtLimit(info.limit) +
      ' &nbsp;|&nbsp; ماوە بۆ قەرزی نوێ: ' + fmt(info.remaining);
    setDebtSaveEnabled(true);
  }
  return info;
}

function sendCustomerDebtWhatsApp(customerId) {
  var cust = (DB.customers || []).find(function (c) { return c.id === customerId; });
  if (!cust) return;
  var info = evaluateDebtPurchase(cust.name, cust.phone, 0);
  info.invoiceRemaining = info.current;
  LAST_DEBT_LIMIT_INFO = info;
  if (!info.phone) {
    toast("ژمارە نییە", "ژمارەی مۆبایلی «" + (cust.name || "") + "» تۆمار بکە", "warning");
    return;
  }
  openWhatsAppText(info.phone, buildFormalDebtWhatsApp(info));
}

function updateCreditLimitSettingsUi() {
  var sel = document.getElementById("setCreditLimitEnabled");
  var inp = document.getElementById("setCreditLimit");
  if (!inp) return;
  var on = !sel || sel.value !== "off";
  inp.disabled = !on;
  inp.style.opacity = on ? "1" : "0.45";
}

window.getGlobalDebtLimit = getGlobalDebtLimit;
window.evaluateDebtPurchase = evaluateDebtPurchase;
window.sendDebtLimitWhatsApp = sendDebtLimitWhatsApp;
window.sendCustomerDebtWhatsApp = sendCustomerDebtWhatsApp;
window.refreshDebtLimitHint = refreshDebtLimitHint;
window.formatDebtLimit = formatDebtLimit;
window.isDebtUnlimited = isDebtUnlimited;
window.updateCreditLimitSettingsUi = updateCreditLimitSettingsUi;

function syncCustomerDebtBalance(customerName, customerPhone, deltaDebt, note) {
  if (!customerName) return null;
  if (!DB.customers) DB.customers = [];
  var cleanName = customerName.trim();
  var cust = DB.customers.find(function (c) {
    return c.name && c.name.trim().toLowerCase() === cleanName.toLowerCase();
  });
  if (cust) {
    cust.currentDebt = Math.max(0, (parseFloat(cust.currentDebt) || 0) + (parseFloat(deltaDebt) || 0));
    if (customerPhone && !cust.phone) cust.phone = customerPhone;
  } else if (deltaDebt > 0) {
    cust = {
      id: "cust_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      name: cleanName,
      phone: customerPhone || "",
      address: "",
      debtLimit: getGlobalDebtLimit(),
      currentDebt: Math.max(0, parseFloat(deltaDebt) || 0),
      loyaltyPoints: 0,
      notes: note || "کڕیاری قەرز",
      createdAt: new Date().toISOString()
    };
    DB.customers.unshift(cust);
  }
  if (typeof DataStore !== "undefined" && DataStore.saveCustomers) {
    DataStore.saveCustomers();
  }
  return cust;
}

function saveDebt(shouldPrint) {
  var doPrint = (shouldPrint === true);
  var nameInput = $("#debtCustomerName");
  var name = nameInput ? nameInput.value.trim() : "";
  if (!name) {
    toast("هەڵە", "تکایە ناوی کڕیار بنووسە", "error");
    if (nameInput) nameInput.focus();
    return;
  }
  var phoneEl = document.getElementById("debtCustomerPhone");
  var phone = phoneEl ? phoneEl.value.trim() : "";
  var noteEl = document.getElementById("debtCustomerNote");
  var note = noteEl ? noteEl.value.trim() : "";

  if (!PENDING_DEBT || !PENDING_DEBT.order) {
    hideModal("debtCustomerModal");
    return;
  }

  var limitInfo = evaluateDebtPurchase(name, phone, PENDING_DEBT.total);
  LAST_DEBT_LIMIT_INFO = limitInfo;
  if (limitInfo.over || limitInfo.atLimit) {
    refreshDebtLimitHint();
    showDebtLimitAlert(limitInfo);
    return;
  }

  var cashierName = (DB.currentUser && (DB.currentUser.fullName || DB.currentUser.name || DB.currentUser.username)) || "کاشیر";
  var cust = syncCustomerDebtBalance(name, phone, PENDING_DEBT.total, note);

  var debt = {
    id: gid(),
    orderId: PENDING_DEBT.order.id,
    customerId: cust ? cust.id : null,
    customerName: name,
    customerPhone: phone || (cust ? cust.phone : ""),
    note: note,
    items: PENDING_DEBT.order.items.map(function (i) {
      return { name: i.name, price: i.price, cost: i.cost || 0, qty: i.qty };
    }),
    total: PENDING_DEBT.total,
    amount: PENDING_DEBT.total,
    paidAmount: 0,
    remainingAmount: PENDING_DEBT.total,
    totalCost: PENDING_DEBT.order.totalCost || 0,
    profit: PENDING_DEBT.order.profit || 0,
    date: new Date().toISOString(),
    paid: false,
    status: "unpaid",
    payments: [],
    cashier: cashierName
  };
  if (typeof BranchManager !== "undefined" && BranchManager.stamp) BranchManager.stamp(debt);
  DB.debts.push(debt);
  reducePendingStock();
  DataStore.saveDebts();
  DataStore.saveProducts();

  LAST_ORDER = PENDING_DEBT.order;
  LAST_ORDER.customer = name;
  LAST_ORDER.customerName = name;
  LAST_ORDER.customerPhone = phone;
  LAST_ORDER.paymentMethod = "debt";
  LAST_ORDER.skipAutoDebt = true;
  if (cust && cust.id) LAST_ORDER.customerId = cust.id;
  DB.orders.push(LAST_ORDER);
  DataStore.saveOrders();

  if (typeof ApiClient !== "undefined" && typeof ApiClient.isOnline === "function" && ApiClient.isOnline()) {
    var base = typeof ApiClient.getBaseUrl === "function" ? ApiClient.getBaseUrl() : "";
    fetch(base + "/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(debt)
    }).catch(function () {});
    ApiClient.submitOrder(LAST_ORDER).catch(function () {});
  }

  if (doPrint) {
    printReceiptDirect(LAST_ORDER);
  }

  // Clear customer cart and reset cash
  if (typeof ACTIVE_CUSTOMER !== "undefined" && CUSTOMER_QUEUE[ACTIVE_CUSTOMER]) {
    CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart = [];
  }
  POS_CASH_RECEIVED = 0;
  PENDING_DEBT = null;
  hideModal("debtCustomerModal");
  toast("سەرکەوتوو", "قەرز بۆ " + name + " تۆمارکرا" + (doPrint ? " و چاپکرا" : ""), "success");
  if (typeof PosAudio !== "undefined") PosAudio.playCashChime();
  renderCart();
  renderPosGrid();

  var after = evaluateDebtPurchase(name, phone, 0);
  LAST_DEBT_LIMIT_INFO = after;
  if (!after.unlimited && (after.atLimit || after.remaining <= 0)) {
    toast("سنووری قەرز", name + " گەیشتە سنووری قەرز (" + formatDebtLimit(after.limit) + "). چیتر ناتوانێت بە قەرز بکڕێت.", "warning");
    showDebtLimitAlert(after, { quiet: true });
  } else if (!after.unlimited && after.remaining <= after.limit * 0.15) {
    toast("ئاگاداری قەرز", "قەرزی " + name + " نزیکە لە سنوور: " + fmt(after.current) + " / " + formatDebtLimit(after.limit), "warning");
  }
}

/* ═══ DEBT PAGE (Full & Partial Installment Payments) ═══ */

function filterDebtsView() {
  renderDebtPage();
}

var CURRENT_CUSTOMER_HUB_TAB = "debt";

function selectCustomerHubTab(tab) {
  var debtOn = true;
  try {
    if (typeof FeatureModules !== "undefined" && FeatureModules.getActiveModules) {
      debtOn = FeatureModules.getActiveModules().enableDebt !== false;
    }
  } catch (e) {}
  if (!debtOn) tab = "list";
  CURRENT_CUSTOMER_HUB_TAB = tab === "list" ? "list" : "debt";
  var debtPane = $("#custHubTabDebt");
  var listPane = $("#custHubTabList");
  if (debtPane) debtPane.style.display = CURRENT_CUSTOMER_HUB_TAB === "debt" ? "block" : "none";
  if (listPane) listPane.style.display = CURRENT_CUSTOMER_HUB_TAB === "list" ? "block" : "none";
  document.querySelectorAll("[data-cust-hub-tab]").forEach(function (btn) {
    if (btn.getAttribute("data-cust-hub-tab") === CURRENT_CUSTOMER_HUB_TAB) btn.classList.add("active");
    else btn.classList.remove("active");
  });
  if (CURRENT_CUSTOMER_HUB_TAB === "list") renderCustomers();
  else renderDebtPage();
}

function openCustomerDebtsFromCustomersPage(custName) {
  var hub = $("#customersSection");
  if (!hub || !hub.classList.contains("active")) switchSection("customers");
  selectCustomerHubTab("debt");
  var searchEl = $("#debtSearchInput");
  var statusEl = $("#debtStatusFilter");
  if (searchEl) searchEl.value = custName || "";
  if (statusEl) statusEl.value = "all";
  renderDebtPage();
}

function customerDedupeKey(name, phone) {
  var ph = String(phone || "").replace(/[^0-9]/g, "").slice(-10);
  if (ph.length >= 7) return "p:" + ph;
  return "n:" + String(name || "").trim().toLowerCase();
}

function dedupeDebtsList(list) {
  var out = [];
  var byOrder = {};
  var byStamp = {};
  (list || []).forEach(function (d) {
    if (!d) return;
    var oid = d.orderId ? String(d.orderId) : "";
    if (oid) {
      var prev = byOrder[oid];
      if (!prev) {
        byOrder[oid] = d;
        out.push(d);
      } else {
        var prevScore = String(prev.customerPhone || "").length + ((prev.payments && prev.payments.length) || 0) * 10;
        var nextScore = String(d.customerPhone || "").length + ((d.payments && d.payments.length) || 0) * 10;
        if (nextScore > prevScore) {
          out[out.indexOf(prev)] = d;
          byOrder[oid] = d;
        }
      }
      return;
    }
    var stamp = customerDedupeKey(d.customerName, d.customerPhone) + "|" +
      String(Math.round(parseFloat(d.total || d.amount) || 0)) + "|" +
      String(d.date || "").slice(0, 16);
    if (byStamp[stamp]) return;
    byStamp[stamp] = true;
    out.push(d);
  });
  return out;
}

function dedupeCustomersList(list) {
  var seen = {};
  var out = [];
  (list || []).forEach(function (c) {
    if (!c) return;
    var key = customerDedupeKey(c.name, c.phone);
    if (!key || key === "n:") {
      out.push(c);
      return;
    }
    if (seen[key]) {
      var keep = seen[key];
      if (c.phone && !keep.phone) keep.phone = c.phone;
      keep.currentDebt = Math.max(parseFloat(keep.currentDebt) || 0, parseFloat(c.currentDebt) || 0);
      if (c.notes && !keep.notes) keep.notes = c.notes;
      return;
    }
    seen[key] = c;
    out.push(c);
  });
  return out;
}

function collapseDuplicateDebtsLocal() {
  var raw = DB.debts || [];
  var cleaned = dedupeDebtsList(raw);
  if (cleaned.length !== raw.length) {
    DB.debts = cleaned;
    if (typeof DataStore !== "undefined" && DataStore.saveDebts) DataStore.saveDebts();
  }
  return cleaned;
}

function collapseDuplicateCustomersLocal() {
  var raw = DB.customers || [];
  var cleaned = dedupeCustomersList(raw);
  if (cleaned.length !== raw.length) {
    DB.customers = cleaned;
    if (typeof DataStore !== "undefined" && DataStore.saveCustomers) DataStore.saveCustomers();
  }
  return cleaned;
}

function renderDebtPage() {
  collapseDuplicateDebtsLocal();
  var debts = branchRecords(DB.debts || []);
  var activeDebts = debts.filter(function (d) { return getDebtRemainingAmount(d) > 0; });
  var totalRemaining = activeDebts.reduce(function (s, d) { return s + getDebtRemainingAmount(d); }, 0);
  var totalPaidSoFar = debts.reduce(function (s, d) {
    var tot = parseFloat(d.total || d.amount) || 0;
    var rem = getDebtRemainingAmount(d);
    return s + Math.max(0, tot - rem);
  }, 0);
  var paidCount = debts.filter(function (d) { return getDebtRemainingAmount(d) <= 0; }).length;

  var statsHtml = '<div class="stat-card accent" style="border-right:4px solid #ef4444;"><div class="stat-icon" style="color:#ef4444;"><i class="fas fa-hand-holding-dollar"></i></div><div class="stat-label">کۆی قەرزی ماوە لەسەر کڕیاران</div><div class="stat-value" style="color:#ef4444;">' + fmt(totalRemaining) + '</div></div>';
  statsHtml += '<div class="stat-card warning" style="border-right:4px solid #f59e0b;"><div class="stat-icon" style="color:#f59e0b;"><i class="fas fa-users"></i></div><div class="stat-label">قەرزە چالاکەکان</div><div class="stat-value">' + activeDebts.length + ' وەسڵ</div></div>';
  statsHtml += '<div class="stat-card success" style="border-right:4px solid #10b981;"><div class="stat-icon" style="color:#10b981;"><i class="fas fa-coins"></i></div><div class="stat-label">کۆی پارەی وەرگیراو لە قەرز</div><div class="stat-value" style="color:#10b981;">' + fmt(totalPaidSoFar) + '</div></div>';
  statsHtml += '<div class="stat-card info" style="border-right:4px solid #38bdf8;"><div class="stat-icon" style="color:#38bdf8;"><i class="fas fa-check-double"></i></div><div class="stat-label">پاکتاوکراوەکان</div><div class="stat-value">' + paidCount + ' قەرز</div></div>';

  var debtStats = $("#debtStats");
  if (debtStats) debtStats.innerHTML = statsHtml;

  var tbody = $("#debtTable tbody");
  if (!tbody) return;

  var searchVal = ($("#debtSearchInput") ? $("#debtSearchInput").value : "").trim().toLowerCase();
  var statusFilter = $("#debtStatusFilter") ? $("#debtStatusFilter").value : "unpaid";

  var filtered = debts.slice().reverse().filter(function (d) {
    var rem = getDebtRemainingAmount(d);
    if (statusFilter === "unpaid" && rem <= 0) return false;
    if (statusFilter === "paid" && rem > 0) return false;

    if (searchVal) {
      var nameMatch = d.customerName && d.customerName.toLowerCase().includes(searchVal);
      var phoneMatch = d.customerPhone && d.customerPhone.toLowerCase().includes(searchVal);
      var itemMatch = (d.items || []).some(function (it) { return it.name && it.name.toLowerCase().includes(searchVal); });
      if (!nameMatch && !phoneMatch && !itemMatch) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-muted);font-weight:700;">هیچ تۆمارێکی قەرز نەدۆزرایەوە</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function (d, i) {
    var total = parseFloat(d.total || d.amount) || 0;
    var rem = getDebtRemainingAmount(d);
    var paidAmt = Math.max(0, total - rem);
    var isPaid = rem <= 0;
    var isPartial = !isPaid && paidAmt > 0;

    var dateStr = d.date ? formatSaleDateTime(d.date) : "-";
    var rowClass = isPaid ? "debt-row-paid" : "";
    var itemNames = (d.items || []).slice(0, 2).map(function (it) { return it.name + " (×" + it.qty + ")"; }).join("، ");
    if ((d.items || []).length > 2) itemNames += " + " + ((d.items || []).length - 2) + "ی تر";

    var statusBadge = isPaid
      ? '<span style="background:rgba(16,185,129,0.15);color:#10b981;padding:3px 9px;border-radius:12px;font-size:0.76rem;font-weight:800;">✓ پاکتاوکراو</span>'
      : (isPartial
        ? '<span style="background:rgba(56,189,248,0.15);color:#38bdf8;padding:3px 9px;border-radius:12px;font-size:0.76rem;font-weight:800;">بەشێکی دراوە (' + Math.round((paidAmt / total) * 100) + '%)</span>'
        : '<span style="background:rgba(239,68,68,0.15);color:#ef4444;padding:3px 9px;border-radius:12px;font-size:0.76rem;font-weight:800;">قەرزدار</span>');

    var actionBtns = '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    if (!isPaid) {
      actionBtns += '<button type="button" class="btn btn-sm btn-primary" style="background:#10b981;border-color:#10b981;font-weight:800;" onclick="payDebt(\'' + d.id + '\')" title="وەرگرتنەوەی بەشێک یان هەموو قەرزەکە"><i class="fas fa-hand-holding-usd"></i> دانەوە</button>';
    }
    actionBtns += '<button type="button" class="btn btn-sm btn-outline" onclick="viewDebtDetails(\'' + d.id + '\')" title="وردەکاری کاڵاکان و پارەدانەکان"><i class="fas fa-eye"></i></button>';
    actionBtns += '<button type="button" class="btn btn-sm btn-outline" onclick="openDebtLedgerModal(\'' + d.id + '\')" title="دەستکاری ناوی کڕیار، ژمارە و بڕی قەرز"><i class="fas fa-edit"></i></button>';
    actionBtns += '<button type="button" class="btn btn-sm btn-danger" onclick="deleteDebtLedger(\'' + d.id + '\')" title="سڕینەوەی تۆماری قەرز — کاریگەری لەسەر داهاتی داشبۆرد نییە"><i class="fas fa-trash"></i></button>';
    if (!isPaid) {
      actionBtns += '<button type="button" class="btn btn-sm btn-outline" style="color:#25d366;border-color:rgba(37,211,102,0.4);" onclick="sendDebtWhatsAppReminder(\'' + d.id + '\')" title="بیرخستنەوە بە واتسئاپ"><i class="fab fa-whatsapp"></i></button>';
    }
    actionBtns += '</div>';

    return '<tr class="' + rowClass + '">' +
      '<td>' + (i + 1) + '</td>' +
      '<td><strong>' + (d.customerName || "کڕیار") + '</strong>' + (d.customerPhone ? '<div style="font-size:0.76rem;color:var(--text-muted);direction:ltr;text-align:right;"><i class="fas fa-phone-alt"></i> ' + d.customerPhone + '</div>' : '') +
      (function () {
        var rec = findDebtCustomer(d.customerName, d.customerPhone);
        var cap = getCustomerDebtLimit(rec);
        var cur = getCustomerCurrentDebt(rec, d.customerName, d.customerPhone);
        var unlimitedCap = isDebtUnlimited(cap);
        var canBuy = unlimitedCap ? Infinity : Math.max(0, cap - cur);
        return '<div style="font-size:0.74rem;font-weight:800;margin-top:3px;color:' + (!unlimitedCap && canBuy <= 0 ? '#ef4444' : '#10b981') + ';">دەتوانێت هێشتا بکڕێت: ' + (unlimitedCap ? "بێ سنوور" : (fmt(canBuy) + " / " + fmt(cap))) +
          (rec ? ' <button type="button" class="btn btn-xs btn-outline" onclick="event.stopPropagation();openCustomerModal(\'' + rec.id + '\')">سنوور</button>' : '') +
        '</div>';
      })() +
      '</td>' +
      '<td><span style="font-size:0.82rem;">' + (itemNames || ((d.items || []).length + ' کاڵا')) + '</span></td>' +
      '<td style="font-weight:700;">' + fmt(total) + '</td>' +
      '<td style="color:#10b981;font-weight:700;">' + fmt(paidAmt) + '</td>' +
      '<td style="color:' + (isPaid ? 'var(--text-muted)' : '#ef4444') + ';font-weight:900;font-size:0.95rem;">' + fmt(rem) + '</td>' +
      '<td><small style="color:var(--text-muted);">' + dateStr + '</small></td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + actionBtns + '</td>' +
    '</tr>';
  }).join("");
}

function payDebt(id) {
  openCustomerDebtPayModal(id);
}

function openCustomerDebtPayModal(id) {
  var debt = (DB.debts || []).find(function (d) { return d.id === id; });
  if (!debt) return;
  var total = parseFloat(debt.total || debt.amount) || 0;
  var rem = getDebtRemainingAmount(debt);
  var paidAmt = Math.max(0, total - rem);

  if (rem <= 0) {
    toast("ئاگاداری", "ئەم قەرزە بە تەواوی دراوەتەوە", "info");
    return;
  }

  $("#custDebtPayId").value = debt.id;
  $("#custDebtPayName").textContent = debt.customerName || "کڕیار";
  $("#custDebtPayTotalAndPaid").textContent = fmt(total) + " / دراوە: " + fmt(paidAmt);
  $("#custDebtPayRemaining").textContent = fmt(rem);
  $("#custDebtPayAmountInput").value = rem;
  $("#custDebtPayAmountInput").max = rem;
  $("#custDebtPayNoteInput").value = "";

  updateCustDebtPayPreview();

  var histWrap = $("#custDebtPaymentsHistoryWrap");
  var histList = $("#custDebtPaymentsHistoryList");
  var payments = debt.payments || [];
  if (histWrap && histList) {
    if (payments.length > 0) {
      histWrap.style.display = "block";
      histList.innerHTML = payments.map(function (p, idx) {
        var pDate = (p.paymentDate || p.date || "").replace("T", " ").slice(0, 16);
        return '<div style="display:flex;justify-content:space-between;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,0.06);">' +
          '<span>#' + (idx + 1) + ' — ' + pDate + (p.notes ? ' (' + p.notes + ')' : '') + '</span>' +
          '<strong style="color:#10b981;">' + fmt(p.amount) + '</strong>' +
        '</div>';
      }).join("");
    } else {
      histWrap.style.display = "none";
      histList.innerHTML = "";
    }
  }

  showModal("customerDebtPayModal");
  setTimeout(function () {
    var inp = $("#custDebtPayAmountInput");
    if (inp) { inp.focus(); inp.select(); }
  }, 80);
}

function setCustDebtPayPreset(preset) {
  var id = $("#custDebtPayId").value;
  var debt = (DB.debts || []).find(function (d) { return d.id === id; });
  if (!debt) return;
  var rem = getDebtRemainingAmount(debt);
  var val = rem;
  if (preset === "full") {
    val = rem;
  } else if (preset === "half") {
    val = Math.round((rem / 2) / 250) * 250 || Math.round(rem / 2);
  } else {
    val = Math.min(rem, parseFloat(preset) || 0);
  }
  $("#custDebtPayAmountInput").value = val;
  updateCustDebtPayPreview();
}

function updateCustDebtPayPreview() {
  var id = $("#custDebtPayId") ? $("#custDebtPayId").value : "";
  var debt = (DB.debts || []).find(function (d) { return d.id === id; });
  if (!debt) return;
  var rem = getDebtRemainingAmount(debt);
  var payVal = parseFloat($("#custDebtPayAmountInput").value) || 0;
  var afterRem = Math.max(0, rem - payVal);
  var el = $("#custDebtAfterPayRemaining");
  if (el) {
    el.textContent = afterRem === 0 ? "0 د.ع (پاکتاو دەبێت ✓)" : fmt(afterRem);
    el.style.color = afterRem === 0 ? "#10b981" : "#f59e0b";
  }
}

function confirmCustomerDebtPayment(shouldPrintReceipt) {
  var id = $("#custDebtPayId").value;
  var debt = (DB.debts || []).find(function (d) { return d.id === id; });
  if (!debt) return;

  var total = parseFloat(debt.total || debt.amount) || 0;
  var rem = getDebtRemainingAmount(debt);
  var rawPay = parseFloat($("#custDebtPayAmountInput").value) || 0;

  if (rawPay <= 0) {
    toast("هەڵە", "تکایە بڕی پارەی وەرگیراو بنووسە", "error");
    return;
  }

  var payAmt = Math.min(rem, rawPay);
  var note = ($("#custDebtPayNoteInput") ? $("#custDebtPayNoteInput").value : "").trim();
  var cashierName = (DB.currentUser && (DB.currentUser.fullName || DB.currentUser.name || DB.currentUser.username)) || "کاشیر";
  var nowIso = new Date().toISOString();

  var currentPaid = Math.max(0, total - rem);
  var newPaid = currentPaid + payAmt;
  var newRem = Math.max(0, total - newPaid);

  debt.paidAmount = newPaid;
  debt.remainingAmount = newRem;
  debt.paid = (newRem <= 0);
  debt.status = debt.paid ? "paid" : "partial";
  if (debt.paid) debt.paidDate = nowIso;

  if (!Array.isArray(debt.payments)) debt.payments = [];
  debt.payments.push({
    id: gid(),
    amount: payAmt,
    paymentDate: nowIso,
    cashier: cashierName,
    notes: note || (debt.paid ? "پاکتاوکردنی قەرز" : "دانەوەی بەشێکی قەرز")
  });

  // Sync customer balance in DB.customers
  syncCustomerDebtBalance(debt.customerName, debt.customerPhone, -payAmt);

  // Record cash inflow order for this installment payment
  var costRatio = total > 0 ? (payAmt / total) : 1;
  var totalDebtCost = (debt.items || []).reduce(function (s, i) { return s + (i.cost || 0) * (i.qty || 1); }, 0);
  var installmentCost = Math.round(totalDebtCost * costRatio);
  var installmentOrder = {
    id: "DPAY-" + Date.now().toString().slice(-6),
    items: [{
      name: "دانەوەی قەرز (" + debt.customerName + ")" + (newRem > 0 ? " - ماوە: " + fmt(newRem) : " - پاکتاوکرا"),
      price: payAmt,
      cost: installmentCost,
      qty: 1
    }],
    subtotal: payAmt,
    totalCost: installmentCost,
    discount: 0,
    total: payAmt,
    profit: payAmt - installmentCost,
    cashier: cashierName,
    customer: debt.customerName,
    customerName: debt.customerName,
    date: nowIso,
    fromDebt: true,
    debtId: debt.id,
    paymentMethod: "cash",
    shiftId: CURRENT_SHIFT ? CURRENT_SHIFT.id : null
  };

  installmentOrder.fromDebt = true;
  installmentOrder.excludeFromIncome = true;
  DataStore.saveDebts();

  if (typeof ApiClient !== "undefined" && typeof ApiClient.isOnline === "function" && ApiClient.isOnline()) {
    var base = typeof ApiClient.getBaseUrl === "function" ? ApiClient.getBaseUrl() : "";
    fetch(base + "/api/debts/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        debtId: debt.id,
        amount: payAmt,
        cashier: cashierName,
        notes: note
      })
    }).catch(function () {});
  }

  if (shouldPrintReceipt) {
    printReceiptDirect(installmentOrder);
  }

  hideModal("customerDebtPayModal");
  renderDebtPage();
  if ($("#customersSection") && $("#customersSection").classList.contains("active")) {
    renderCustomers();
  }
  toast("سەرکەوتوو", "بڕی " + fmt(payAmt) + " لە قەرزی (" + debt.customerName + ") وەرگیرایەوە. ماوە: " + fmt(newRem), "success");
}

function currentCashierLabel() {
  return (DB.currentUser && (DB.currentUser.fullName || DB.currentUser.name || DB.currentUser.username)) || "کاشیر";
}

function persistDebtsLocal() {
  if (typeof DataStore !== "undefined" && DataStore.saveDebts) DataStore.saveDebts();
}

function refreshCustomersAndDebts() {
  try { renderDebtPage(); } catch (eDebtUi) {}
  try { renderCustomers(); } catch (eCustUi) {}
}

function createManualLedgerDebt(opts) {
  opts = opts || {};
  var amount = Math.max(0, parseFloat(opts.amount) || 0);
  if (amount <= 0) return null;
  if (!DB.debts) DB.debts = [];
  var paid = Math.max(0, parseFloat(opts.paid) || 0);
  if (paid > amount) paid = amount;
  var remaining = Math.max(0, amount - paid);
  var note = opts.note || "قەرزی دەستی";
  var rec = {
    id: gid(),
    orderId: null,
    ledgerOnly: true,
    manualDebt: true,
    excludeFromIncome: true,
    customerId: opts.customerId || null,
    customerName: opts.name,
    customerPhone: opts.phone || "",
    items: [{ name: note, price: amount, qty: 1, cost: 0 }],
    total: amount,
    amount: amount,
    paidAmount: paid,
    remainingAmount: remaining,
    date: new Date().toISOString(),
    paid: remaining <= 0,
    status: remaining <= 0 ? "paid" : (paid > 0 ? "partial" : "unpaid"),
    payments: [],
    cashier: currentCashierLabel(),
    note: note
  };
  if (typeof BranchManager !== "undefined" && BranchManager.stamp) BranchManager.stamp(rec);
  DB.debts.unshift(rec);
  persistDebtsLocal();
  syncCustomerDebtBalance(rec.customerName, rec.customerPhone, remaining, note);
  if (typeof ApiClient !== "undefined" && typeof ApiClient.isOnline === "function" && ApiClient.isOnline()) {
    var base = typeof ApiClient.getBaseUrl === "function" ? ApiClient.getBaseUrl() : "";
    fetch(base + "/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rec)
    }).catch(function () {});
  }
  return rec;
}

function openDebtLedgerModal(id) {
  var d = id ? (DB.debts || []).find(function (x) { return x.id === id; }) : null;
  var idEl = $("#debtLedgerId");
  if (!idEl) return;
  idEl.value = d ? d.id : "";
  $("#debtLedgerName").value = d ? (d.customerName || "") : "";
  $("#debtLedgerPhone").value = d ? (d.customerPhone || "") : "";
  var total = d ? (parseFloat(d.total || d.amount) || 0) : 0;
  var rem = d ? getDebtRemainingAmount(d) : 0;
  var paid = Math.max(0, total - rem);
  $("#debtLedgerTotal").value = d ? total : "";
  $("#debtLedgerPaid").value = d ? paid : 0;
  $("#debtLedgerNote").value = d ? (d.note || d.notes || "") : "";
  var title = $("#debtLedgerTitle");
  if (title) {
    title.innerHTML = d
      ? '<i class="fas fa-edit"></i> دەستکاری قەرز'
      : '<i class="fas fa-plus"></i> قەرزی دەستی';
  }
  showModal("debtLedgerModal");
  setTimeout(function () {
    var n = $("#debtLedgerName");
    if (n) n.focus();
  }, 80);
}

function saveDebtLedger() {
  var idEl = $("#debtLedgerId");
  if (!idEl) return;
  var id = (idEl.value || "").trim();
  var name = ($("#debtLedgerName").value || "").trim();
  var phone = ($("#debtLedgerPhone").value || "").trim();
  var total = Math.max(0, parseFloat($("#debtLedgerTotal").value) || 0);
  var paid = Math.max(0, parseFloat($("#debtLedgerPaid").value) || 0);
  var note = ($("#debtLedgerNote").value || "").trim();
  if (!name) {
    toast("هەڵە", "تکایە ناوی کڕیار بنووسە", "error");
    $("#debtLedgerName").focus();
    return;
  }
  if (total <= 0) {
    toast("هەڵە", "تکایە بڕی قەرز بنووسە", "error");
    $("#debtLedgerTotal").focus();
    return;
  }
  if (paid > total) paid = total;
  var rem = Math.max(0, total - paid);
  if (!DB.debts) DB.debts = [];
  var existing = id ? DB.debts.find(function (d) { return d.id === id; }) : null;
  var status = rem <= 0 ? "paid" : (paid > 0 ? "partial" : "unpaid");
  var itemLabel = note || "قەرزی دەستی";

  if (existing) {
    var oldName = existing.customerName;
    var oldPhone = existing.customerPhone;
    var oldRem = getDebtRemainingAmount(existing);
    existing.customerName = name;
    existing.customerPhone = phone;
    existing.total = total;
    existing.amount = total;
    existing.paidAmount = paid;
    existing.remainingAmount = rem;
    existing.paid = rem <= 0;
    existing.status = status;
    existing.note = note;
    if (!existing.items || !existing.items.length || existing.manualDebt || existing.ledgerOnly) {
      existing.items = [{ name: itemLabel, price: total, qty: 1, cost: 0 }];
    }
    var nameChanged = String(oldName || "").trim().toLowerCase() !== name.toLowerCase();
    if (nameChanged) {
      syncCustomerDebtBalance(oldName, oldPhone, -oldRem);
      syncCustomerDebtBalance(name, phone, rem);
    } else {
      syncCustomerDebtBalance(name, phone, rem - oldRem);
    }
    persistDebtsLocal();
    if (typeof ApiClient !== "undefined" && typeof ApiClient.isOnline === "function" && ApiClient.isOnline()) {
      var basePut = typeof ApiClient.getBaseUrl === "function" ? ApiClient.getBaseUrl() : "";
      fetch(basePut + "/api/debts/" + encodeURIComponent(existing.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(existing)
      }).catch(function () {});
    }
  } else {
    createManualLedgerDebt({
      name: name,
      phone: phone,
      amount: total,
      paid: paid,
      note: itemLabel
    });
  }
  hideModal("debtLedgerModal");
  refreshCustomersAndDebts();
  toast("سەرکەوتوو", "قەرز پاشکەوت کرا بێ گۆڕینی داهاتی داشبۆرد", "success");
}

function deleteDebtLedger(id) {
  var debt = (DB.debts || []).find(function (d) { return d.id === id; });
  if (!debt) return;
  var rem = getDebtRemainingAmount(debt);
  if (!confirm("دڵنیایت قەرزی («" + (debt.customerName || "") + "») بسڕیتەوە؟\nفرۆشتن و داهاتی داشبۆرد ناگۆڕدرێت.")) return;
  syncCustomerDebtBalance(debt.customerName, debt.customerPhone, -rem);
  DB.debts = DB.debts.filter(function (d) { return d.id !== id; });
  persistDebtsLocal();
  if (typeof ApiClient !== "undefined" && typeof ApiClient.isOnline === "function" && ApiClient.isOnline()) {
    var baseDel = typeof ApiClient.getBaseUrl === "function" ? ApiClient.getBaseUrl() : "";
    fetch(baseDel + "/api/debts/" + encodeURIComponent(id), { method: "DELETE" }).catch(function () {});
  }
  refreshCustomersAndDebts();
  toast("سەرکەوتوو", "تۆماری قەرز سڕایەوە — داهات نەگۆڕدرا", "success");
}

function reduceOpenDebtsForCustomer(cust, amount) {
  var left = Math.max(0, parseFloat(amount) || 0);
  if (left <= 0 || !cust) return 0;
  var name = String(cust.name || "").trim().toLowerCase();
  var list = (DB.debts || []).filter(function (d) {
    if (getDebtRemainingAmount(d) <= 0) return false;
    if (d.customerId && cust.id && d.customerId === cust.id) return true;
    return name && String(d.customerName || "").trim().toLowerCase() === name;
  }).sort(function (a, b) {
    return String(a.date || "").localeCompare(String(b.date || ""));
  });
  var cutTotal = 0;
  list.forEach(function (d) {
    if (left <= 0) return;
    var rem = getDebtRemainingAmount(d);
    var cut = Math.min(rem, left);
    d.paidAmount = (parseFloat(d.paidAmount) || 0) + cut;
    d.remainingAmount = Math.max(0, rem - cut);
    d.paid = d.remainingAmount <= 0;
    d.status = d.paid ? "paid" : "partial";
    left -= cut;
    cutTotal += cut;
  });
  persistDebtsLocal();
  return cutTotal;
}

function applyManualCustomerDebtTotal(cust, newTotal) {
  if (!cust) return;
  newTotal = Math.max(0, parseFloat(newTotal) || 0);
  var old = getCustomerCurrentDebt(cust, cust.name, cust.phone);
  var delta = newTotal - old;
  if (Math.abs(delta) < 0.5) {
    cust.currentDebt = newTotal;
    if (typeof DataStore !== "undefined" && DataStore.saveCustomers) DataStore.saveCustomers();
    return;
  }
  if (delta > 0) {
    createManualLedgerDebt({
      customerId: cust.id,
      name: cust.name,
      phone: cust.phone || "",
      amount: delta,
      paid: 0,
      note: "دەستکاری قەرزی کڕیار"
    });
  } else {
    reduceOpenDebtsForCustomer(cust, -delta);
    cust.currentDebt = newTotal;
    if (typeof DataStore !== "undefined" && DataStore.saveCustomers) DataStore.saveCustomers();
  }
}

function viewDebtDetails(id) {
  var debt = (DB.debts || []).find(function (d) { return d.id === id; });
  if (!debt) return;
  var total = parseFloat(debt.total || debt.amount) || 0;
  var rem = getDebtRemainingAmount(debt);
  var paidAmt = Math.max(0, total - rem);

  var orderLike = {
    id: debt.orderId || debt.id,
    date: debt.date,
    cashier: debt.cashier || "کاشیر",
    customer: debt.customerName + (debt.customerPhone ? " (" + debt.customerPhone + ")" : ""),
    paymentMethod: "قەرز (دراوە: " + fmt(paidAmt) + " | ماوە: " + fmt(rem) + ")",
    items: debt.items || [],
    subtotal: total,
    discount: 0,
    total: total
  };
  window.SELECTED_ORDER = orderLike;
  var body = $("#orderDetailBody");
  if (body) {
    var itemsRows = (debt.items || []).map(function (it, idx) {
      return '<tr>' +
        '<td style="padding:6px 8px;border-bottom:1px solid var(--border-color);">' + (idx + 1) + '</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid var(--border-color);"><strong>' + (it.name || "کاڵا") + '</strong></td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid var(--border-color);text-align:center;">' + (it.qty || 1) + '</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid var(--border-color);">' + fmt(it.price || 0) + '</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid var(--border-color);font-weight:700;">' + fmt((it.price || 0) * (it.qty || 1)) + '</td>' +
      '</tr>';
    }).join("");

    var paymentsHtml = "";
    if (debt.payments && debt.payments.length > 0) {
      paymentsHtml = '<div style="margin-top:12px;background:rgba(16,185,129,0.08);padding:10px 12px;border-radius:10px;border:1px solid rgba(16,185,129,0.25);">' +
        '<div style="font-weight:800;color:#10b981;margin-bottom:6px;font-size:0.85rem;"><i class="fas fa-history"></i> مێژووی پارەدانەکان:</div>' +
        debt.payments.map(function (p, idx) {
          return '<div style="display:flex;justify-content:space-between;font-size:0.82rem;padding:3px 0;">' +
            '<span>' + (idx + 1) + '. ' + ((p.paymentDate || p.date || "").replace("T", " ").slice(0, 16)) + (p.notes ? ' — ' + p.notes : '') + '</span>' +
            '<strong style="color:#10b981;">' + fmt(p.amount) + '</strong>' +
          '</div>';
        }).join("") +
      '</div>';
    }

    body.innerHTML =
      '<div style="background:var(--card-bg);padding:14px;border-radius:var(--radius-md);margin-bottom:14px;border:1px solid var(--border-color);">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>کڕیار:</span><strong>' + (debt.customerName || "کڕیار") + (debt.customerPhone ? ' (' + debt.customerPhone + ')' : '') + '</strong></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>بەرواری قەرز:</span><span>' + (debt.date ? debt.date.replace("T", " ").slice(0, 16) : "-") + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>کۆی قەرز:</span><strong>' + fmt(total) + '</strong></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#10b981;"><span>بڕی دراوە:</span><strong>' + fmt(paidAmt) + '</strong></div>' +
        '<div style="display:flex;justify-content:space-between;color:#ef4444;font-size:1.05rem;"><span>باڵانسی ماوە:</span><strong>' + fmt(rem) + '</strong></div>' +
        (debt.note ? '<div style="margin-top:6px;font-size:0.82rem;color:var(--text-muted);">تێبینی: ' + debt.note + '</div>' : '') +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:0.88rem;">' +
        '<thead><tr style="background:var(--bg-secondary);"><th style="padding:6px 8px;text-align:right;">#</th><th style="padding:6px 8px;text-align:right;">کاڵا</th><th style="padding:6px 8px;text-align:center;">بڕ</th><th style="padding:6px 8px;text-align:right;">نرخ</th><th style="padding:6px 8px;text-align:right;">کۆ</th></tr></thead>' +
        '<tbody>' + itemsRows + '</tbody>' +
      '</table>' +
      paymentsHtml;

    var printBtn = $("#orderDetailPrintBtn");
    if (printBtn) {
      printBtn.onclick = function () { printReceiptDirect(orderLike); };
    }
    showModal("orderDetailModal");
  }
}

function sendDebtWhatsAppReminder(id) {
  var debt = (DB.debts || []).find(function (d) { return d.id === id; });
  if (!debt) return;
  var total = parseFloat(debt.total || debt.amount) || 0;
  var rem = getDebtRemainingAmount(debt);
  var paidAmt = Math.max(0, total - rem);
  var info = evaluateDebtPurchase(debt.customerName, debt.customerPhone, 0);
  info.name = debt.customerName || info.name;
  info.phone = debt.customerPhone || info.phone;
  info.invoiceRemaining = rem;
  info.invoiceTotal = total;
  info.invoicePaid = paidAmt;
  LAST_DEBT_LIMIT_INFO = info;
  if (!info.phone) {
    toast("ژمارە نییە", "ژمارەی مۆبایلی کڕیار تۆمار بکە بۆ ناردنی واتسئاپ", "warning");
  }
  var store = getStoreName();
  var storePhone = (DB.settings && (DB.settings.phone || DB.settings.marketPhone)) || "";
  var msg = [
    "بەڕێز " + (debt.customerName || "کڕیار") + "،",
    "",
    "سڵاو و ڕێزی زۆر.",
    "",
    "ئەم نامەیە لە لایەن مارکێتی «" + store + "»ـەوە بۆتان دەنێردرێت بۆ داواکردنی پاکتاوکردنی حیسابی قەرز.",
    "",
    "وردەکاریی ئەم وەسڵە:",
    "١) کۆی قەرزی وەسڵ: " + fmt(total) + " د.ع",
    "٢) بڕی دراو: " + fmt(paidAmt) + " د.ع",
    "٣) بڕی ماوە بۆ دانەوە: " + fmt(rem) + " د.ع",
    "٤) کۆی قەرزی ئێستای بەڕێزتان: " + fmt(info.current) + " د.ع",
    "٥) سنووری ڕێگەپێدراو: " + fmt(info.limit) + " د.ع",
    "",
    "تکایە بڕی ماوە لە کاتی گونجاودا پاکتاو بکەن.",
    "",
    "سوپاس بۆ تێگەیشتن و متمانەتان.",
    store
  ];
  if (storePhone) msg.push("تەلەفۆن: " + storePhone);
  openWhatsAppText(info.phone, msg.join("\n"));
}

/* ═══ SHIFTS (24/7 Enterprise Shifts & Cash Drawer) ═══ */

function loadCurrentShift() {
  if (typeof ShiftsManager !== "undefined") {
    ShiftsManager.refreshCurrentShift();
  }
}

function updateShiftButtons() {
  if (typeof ShiftsManager !== "undefined") {
    ShiftsManager.refreshCurrentShift();
  }
}

function openShiftModal() {
  if (typeof ShiftsManager !== "undefined") {
    ShiftsManager.openOpenShiftModal();
  }
}

function confirmOpenShift() {
  if (typeof ShiftsManager !== "undefined") {
    ShiftsManager.confirmOpenShift();
  }
}

function closeShiftModal() {
  if (typeof ShiftsManager !== "undefined") {
    ShiftsManager.openCloseShiftModal();
  }
}

function confirmCloseShift() {
  if (typeof ShiftsManager !== "undefined") {
    ShiftsManager.confirmCloseShift();
  }
}

function renderShiftsPage() {
  if (typeof ShiftsManager !== "undefined") {
    ShiftsManager.refreshCurrentShift();
    ShiftsManager.selectShiftTab("movements");
  }
}

function viewShiftDetails(shiftId) {
  if (typeof ShiftsManager !== "undefined") {
    ShiftsManager.printPastShiftZReport(shiftId);
  }
}

/* ═══ KEYBOARD SHORTCUTS ═══ */

function posHotkeyOnCashier() {
  if (window.CURRENT_PAGE && window.CURRENT_PAGE !== "pos") {
    var sec = document.getElementById("posSection");
    if (!(sec && sec.classList.contains("active")) && !document.body.classList.contains("pos-page")) return false;
  }
  var overlay = document.querySelector(".modal-overlay.active");
  if (overlay && overlay.id !== "quickKeypadModal") return false;
  var saleOv = document.getElementById("posSaleSuccessOverlay");
  if (saleOv && saleOv.classList.contains("active")) return false;
  if (typeof isProductAddModalOpen === "function" && isProductAddModalOpen()) return false;
  return true;
}

function isPosCardChoiceOpen() {
  var pop = document.getElementById("posCardChoicePop");
  return !!(pop && pop.classList.contains("is-open") && !pop.hidden);
}

function posCheckoutNoPrint() {
  if (isPosCardChoiceOpen()) {
    confirmPosCardPayment(false);
    return;
  }
  if (typeof handlePosDirectPayment === "function") handlePosDirectPayment(false);
}

function posIsScanDumpEl(el) {
  if (!el) return false;
  if (typeof isHidScanDumpField === "function" && isHidScanDumpField(el)) return true;
  var id = el.id || "";
  return id === "headerSearchInput" || id === "barcodeInput" || id === "manualBarcodeInput" ||
    id === "posSearch" || id === "posScanQtyInput";
}

function posCashierBlocksHotkey(el, action) {
  if (!el) return false;
  if (posIsScanDumpEl(el)) return false;
  var tag = (el.tagName || "").toUpperCase();
  var type = ((el.type) || "text").toLowerCase();
  if (tag === "BUTTON" || tag === "A") return false;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (tag === "INPUT") {
    if (type === "checkbox" || type === "radio") {
      return action === "payPrint" || action === "payNoPrint";
    }
    if (type === "button" || type === "submit" || type === "reset" || type === "hidden") return false;
    if (el.classList && (el.classList.contains("qty-input") || el.classList.contains("cart-qty-input"))) {
      return action === "clearCart";
    }
    return action === "payPrint" || action === "payNoPrint" || action === "clearCart";
  }
  return false;
}

function posDispatchCashierHotkey(action) {
  action = String(action || "");
  var el = document.activeElement;
  if (typeof isPosLoginActive === "function" && isPosLoginActive()) return false;
  var cardOpen = typeof isPosCardChoiceOpen === "function" && isPosCardChoiceOpen();

  if (action === "card") {
    if (typeof posHotkeyOnCashier === "function" && !posHotkeyOnCashier()) return false;
    if (typeof handlePosCardSale === "function") handlePosCardSale();
    return true;
  }

  if (action === "payPrint" || action === "payNoPrint") {
    if (cardOpen) {
      if (typeof confirmPosCardPayment === "function") confirmPosCardPayment(action === "payPrint");
      return true;
    }
    if (typeof posHotkeyOnCashier === "function" && !posHotkeyOnCashier()) return false;
    if (posCashierBlocksHotkey(el, action)) return false;
    if (action === "payNoPrint") {
      if (typeof handlePosDirectPayment === "function") handlePosDirectPayment(false);
      return true;
    }
    if (window.ImmediatePrinter && typeof ImmediatePrinter.printCurrentBill === "function") {
      ImmediatePrinter.printCurrentBill();
    } else if (typeof handlePosDirectPayment === "function") {
      handlePosDirectPayment(true);
    }
    return true;
  }

  if (action === "clearCart") {
    if (cardOpen) return false;
    if (typeof posHotkeyOnCashier === "function" && !posHotkeyOnCashier()) return false;
    if (posCashierBlocksHotkey(el, action)) return false;
    if (typeof clearCurrentCart === "function") clearCurrentCart();
    return true;
  }
  return false;
}

window.posDispatchCashierHotkey = posDispatchCashierHotkey;
window.posNativeHotkey = function (action) {
  window.__posHotkeyFromNative = true;
  var ok = false;
  try { ok = !!posDispatchCashierHotkey(action); } catch (errHk) { ok = false; }
  setTimeout(function () { window.__posHotkeyFromNative = false; }, 80);
  return ok;
};
window.posCheckoutNoPrint = posCheckoutNoPrint;

function setupKeyboardShortcuts() {
  if (window.POS_DESKTOP && typeof POS_DESKTOP.resetZoom === "function") {
    try { POS_DESKTOP.resetZoom(); } catch (e) {}
  }
  window.addEventListener("keydown", function (e) {
    if (e.repeat) return;
    if (window.__posHotkeyFromNative) return;
    var isCtrl = !!(e.ctrlKey || e.metaKey);
    var isSpace = e.key === " " || e.key === "Spacebar" || e.code === "Space";
    var isEnter = e.key === "Enter" || e.code === "Enter" || e.code === "NumpadEnter";
    var isDelete = e.key === "Delete" || e.key === "Del" || e.code === "Delete";
    if (isCtrl && !e.altKey && !e.shiftKey && (e.key === "d" || e.key === "D" || e.code === "KeyD")) {
      if (!posHotkeyOnCashier()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      posDispatchCashierHotkey("card");
      return;
    }
    if (isCtrl && isSpace) {
      e.preventDefault();
      e.stopImmediatePropagation();
      posDispatchCashierHotkey("payNoPrint");
      return;
    }
    if (isSpace && !isCtrl && !e.altKey && !e.shiftKey) {
      if (!posHotkeyOnCashier() && !isPosCardChoiceOpen()) return;
      if (posCashierBlocksHotkey(e.target, "payPrint") && !isPosCardChoiceOpen()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      posDispatchCashierHotkey("payPrint");
      return;
    }
    if (isDelete && !isCtrl && !e.altKey && !e.shiftKey) {
      if (!posHotkeyOnCashier()) return;
      if (posCashierBlocksHotkey(e.target, "clearCart")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      posDispatchCashierHotkey("clearCart");
      return;
    }
    if (!posHotkeyOnCashier()) return;
    if (isCtrl && isEnter) {
      e.preventDefault();
      e.stopPropagation();
      posDispatchCashierHotkey("payNoPrint");
      return;
    }
    if (e.shiftKey && isEnter && !isCtrl && !e.altKey) {
      if (typeof PosScanGuard !== "undefined" && PosScanGuard.shouldSkipCheckoutKey(e)) return;
      e.preventDefault();
      e.stopPropagation();
      posDispatchCashierHotkey("payNoPrint");
    }
  }, true);
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=" || e.code === "NumpadAdd" || e.code === "Equal")) {
      e.preventDefault();
      if (window.POS_DESKTOP && typeof POS_DESKTOP.resetZoom === "function") POS_DESKTOP.resetZoom();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract" || e.code === "Minus")) {
      e.preventDefault();
      if (window.POS_DESKTOP && typeof POS_DESKTOP.resetZoom === "function") POS_DESKTOP.resetZoom();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
      e.preventDefault();
      var cartNow = (typeof CUSTOMER_QUEUE !== "undefined" && typeof ACTIVE_CUSTOMER !== "undefined" && CUSTOMER_QUEUE[ACTIVE_CUSTOMER])
        ? CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart
        : [];
      if (cartNow && cartNow.length && typeof handlePosDirectPayment === "function") {
        handlePosDirectPayment(true);
        return;
      }
      if (typeof ImmediatePrinter !== "undefined" && ImmediatePrinter.printCurrentBill) {
        ImmediatePrinter.printCurrentBill();
      } else if (typeof SupermarketEngine !== "undefined") {
        SupermarketEngine.smartPrintReceipt();
      } else if (LAST_ORDER) {
        printReceiptDirect(LAST_ORDER);
      }
      return;
    }
    if (e.ctrlKey && e.key === "b") {
      e.preventDefault();
      togglePosFullscreen();
      return;
    }
    if (window.CURRENT_PAGE === "pos" && (e.key === "F1" || e.key === "F3" || e.key === "F4" || e.key === "F5" || e.code === "F5" || e.key === "F8" || e.key === "F10")) {
      return;
    }
    if (e.key === "F1") {
      e.preventDefault();
      if (typeof SupermarketEngine !== "undefined" && SupermarketEngine.goToCashierPage) {
        SupermarketEngine.goToCashierPage();
      } else if (typeof switchSection === "function") {
        switchSection("pos");
      }
      return;
    }
    if (e.key === "F3") {
      e.preventDefault();
      var barcodeInput = $("#barcodeInput");
      if (barcodeInput) barcodeInput.focus();
      return;
    }
    if (e.key === "F4") {
      e.preventDefault();
      openNewProductModal();
      return;
    }
    if (e.key === "F5" || e.code === "F5") {
      e.preventDefault();
      if (e.shiftKey) {
        removeActiveCustomerTab();
      } else {
        createNewCustomerTab();
      }
      return;
    }
    if (e.key === "F8") {
      e.preventDefault();
        openReturnSaleModal();
      return;
    }
  });
  document.addEventListener("wheel", function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (window.POS_DESKTOP && typeof POS_DESKTOP.resetZoom === "function") POS_DESKTOP.resetZoom();
  }, { passive: false, capture: true });
}

/* ═══ BARCODE SCANNING ═══ */

var barcodeBuffer = "";
var barcodeTimeout = null;

function handleBarcodeInput(e) {
  var input = e.target;
  var value = input.value.trim();
  if (!value) return;

  // 0. Check invoice barcode (triggers Return Engine immediately)
  if (typeof ReturnEngine !== "undefined" && ReturnEngine.isInvoiceBarcode(value)) {
    input.value = "";
    ReturnEngine.openWithBarcode(value);
    return;
  }

  // Delegate to full processBarcode pipeline (Scale Barcodes, Products, Audio, Animated Popup)
  processBarcode(value);
  input.value = "";
  input.focus();
}

var BARCODE_SCANNER_BOUND = false;
function setupBarcodeScanner() {
  var barcodeInput = $("#barcodeInput");
  if (!barcodeInput || BARCODE_SCANNER_BOUND) return;
  BARCODE_SCANNER_BOUND = true;
  barcodeInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleBarcodeInput(e);
    }
  });
  barcodeInput.addEventListener("focus", function () {
    this.select();
  });
}

/* ═══ CUSTOMER QUEUE ═══ */

function createNewCustomerTab() {
  var customerCount = Object.keys(CUSTOMER_QUEUE).length;
  var newCustomerId = "customer_" + Date.now();
  var customerName = "کڕیار " + (customerCount + 1);
  CUSTOMER_QUEUE[newCustomerId] = { name: customerName, cart: [] };
  ACTIVE_CUSTOMER = newCustomerId;
  renderCustomerTabs();
  renderCart();
  toast("سەرکەوتوو", "کڕیاری نوێ دروستکرا (F5)", "success");
}

function switchCustomer(customerId) {
  if (customerId === ACTIVE_CUSTOMER) return;
  ACTIVE_CUSTOMER = customerId;
  renderCustomerTabs();
  renderCart();
}

function renderCustomerTabs() {
  var container = $("#customerTabs");
  if (!container) return;
  var html = "";
  Object.keys(CUSTOMER_QUEUE).forEach(function (id) {
    var customer = CUSTOMER_QUEUE[id];
    var isActive = id === ACTIVE_CUSTOMER;
    var itemCount = customer.cart.length;
    var closeBtn = id !== "default"
      ? '<span class="customer-tab-close" title="داخستن / سڕینەوە (Shift+F5)" onclick="event.stopPropagation();removeCustomerTab(\'' + id + '\')"><i class="fas fa-times"></i></span>'
      : '';
    html += '<button type="button" class="customer-tab' + (isActive ? ' active' : '') + '" data-customer="' + id + '" onclick="switchCustomer(\'' + id + '\')"><i class="fas fa-user"></i><span class="customer-tab-name">' + customer.name + '</span>' + (itemCount > 0 ? ' <span class="badge">' + itemCount + '</span>' : '') + closeBtn + '</button>';
  });
  html += '<button type="button" class="customer-tab-add" onclick="createNewCustomerTab()" title="کردنەوەی تابی کڕیاری نوێ (F5)"><i class="fas fa-plus"></i></button>';
  container.innerHTML = html;
}

function removeCustomerTab(customerId) {
  if (customerId === "default") return;
  var customer = CUSTOMER_QUEUE[customerId];
  if (!customer) return;
  if (customer.cart && customer.cart.length > 0) {
    if (!confirm("ئەم کڕیارە " + customer.cart.length + " بەرهەمی لە سەبەتەدا هەیە. دڵنیایت لە سڕینەوەی؟")) return;
  }
  var deletedName = customer.name;
  delete CUSTOMER_QUEUE[customerId];
  if (ACTIVE_CUSTOMER === customerId) {
    var remaining = Object.keys(CUSTOMER_QUEUE);
    ACTIVE_CUSTOMER = remaining.length > 0 ? remaining[remaining.length - 1] : "default";
  }
  renderCustomerTabs();
  renderCart();
  toast("سەرکەوتوو", "تابی «" + deletedName + "» سڕایەوە", "info");
}

function removeActiveCustomerTab() {
  if (typeof CUSTOMER_QUEUE === "undefined") return;
  var keys = Object.keys(CUSTOMER_QUEUE);
  var extraTabs = keys.filter(function (k) { return k !== "default"; });

  if (extraTabs.length === 0) {
    toast("ئاگاداری", "تەنها تابی سەرەکی کڕیار هەیە و ناسڕدرێتەوە", "warning");
    return;
  }

  var targetId = ACTIVE_CUSTOMER;
  if (targetId === "default") {
    // If the cashier is viewing the default tab, target the last opened extra customer tab
    targetId = extraTabs[extraTabs.length - 1];
  }

  var customer = CUSTOMER_QUEUE[targetId];
  if (!customer) return;

  var itemCount = (customer.cart && customer.cart.length) || 0;
  if (itemCount > 0) {
    if (!confirm("تابی «" + customer.name + "» خاوەنی " + itemCount + " کاڵایە لە سەبەتەدا.\nدڵنیایت لە سڕینەوەی ئەم تابە؟")) {
      return;
    }
  }

  var deletedName = customer.name;
  delete CUSTOMER_QUEUE[targetId];

  if (ACTIVE_CUSTOMER === targetId) {
    var remaining = Object.keys(CUSTOMER_QUEUE);
    ACTIVE_CUSTOMER = remaining.length > 0 ? remaining[remaining.length - 1] : "default";
  }

  renderCustomerTabs();
  renderCart();
  toast("سەرکەوتوو", "تابی «" + deletedName + "» سڕایەوە (Shift+F5)", "info");
}
window.removeActiveCustomerTab = removeActiveCustomerTab;

function updateHeldSalesBadgeCount() {
  var cnt = (DB && Array.isArray(DB.suspendedSales)) ? DB.suspendedSales.length : 0;
  var b1 = document.getElementById("heldSalesCountBadge");
  var b2 = document.getElementById("headerHeldCountBadge");
  if (b1) b1.textContent = cnt;
  if (b2) b2.textContent = cnt;
}

function openSuspendedSalesModal() {
  updateHeldSalesBadgeCount();
  renderSuspendedSales();
  openModal("suspendedSalesModal");
}

function holdSale() {
  var currentCart = CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart;
  if (currentCart.length === 0) { toast("هەڵە", "سەبەتە بەتاڵە", "error"); return; }
  var customerName = CUSTOMER_QUEUE[ACTIVE_CUSTOMER] ? CUSTOMER_QUEUE[ACTIVE_CUSTOMER].name : "کڕیار";
  var suspendedSale = {
    id: gid(),
    cart: currentCart.map(function (c) {
      return {
        prodId: c.prodId,
        cartItemId: c.cartItemId,
        name: c.name,
        price: c.price,
        cost: c.cost || 0,
        qty: c.qty,
        unitType: c.unitType || "piece",
        packQty: c.packQty || 1
      };
    }),
    customerName: customerName,
    customerId: ACTIVE_CUSTOMER,
    cashier: getActiveOperatorName(),
    heldAt: new Date().toISOString(),
    total: currentCart.reduce(function (s, c) { return s + c.price * c.qty; }, 0)
  };
  DB.suspendedSales.push(suspendedSale);
  DataStore.saveSuspendedSales();
  CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart = [];
  renderCart();
  updateHeldSalesBadgeCount();
  toast("وەسڵ ڕاگیرا", "فرۆشتنەکە خرایە لیستی ڕاگیراوەکان (" + DB.suspendedSales.length + ")", "success");
  logActivity("hold_sale", "Sale held: " + suspendedSale.id);
}

function printReceiptDirect(order, printType) {
  printType = printType || (DB.settings && DB.settings.printType ? DB.settings.printType : "thermal");
  if (printType === "a4") {
    printA4Receipt(order);
  } else {
    printThermalReceipt(order);
  }
}

function showPrintPreview() {
  var order = LAST_ORDER || (PENDING_DEBT ? PENDING_DEBT.order : null);
  if (!order) return;
  var printType = DB.settings && DB.settings.printType ? DB.settings.printType : "thermal";
  var previewContent = $("#printPreviewContent");
  if (!previewContent) return;
  applyReceiptLiveCss(printType === "thermal58");
  if (printType === "a4") {
    previewContent.innerHTML = generateA4ReceiptHTML(order);
  } else {
    previewContent.innerHTML = generateThermalReceiptHTML(order);
  }
  showModal("printPreviewModal");
}

function generateThermalReceiptHTML(order) {
  var ctx = collectReceiptPrintCtx(order, { isPreview: true, is58mm: (DB.settings && DB.settings.printType) === "thermal58" });
  var lang = receiptUiLang();
  var dir = lang === "en" ? "ltr" : "rtl";
  return '<div class="rc-style-' + getReceiptStyleId() + '" lang="' + lang + '" dir="' + dir + '"><div class="rc">' + buildReceiptInnerHtml(ctx) + "</div></div>";
}

function generateA4ReceiptHTML(order) {
  var ctx = collectReceiptPrintCtx(order, { isPreview: true });
  var lang = receiptUiLang();
  var dir = lang === "en" ? "ltr" : "rtl";
  return '<div class="rc-style-' + getReceiptStyleId() + '" lang="' + lang + '" dir="' + dir + '"><div class="rc">' + buildReceiptInnerHtml(ctx) + "</div></div>";
}

function printThermalReceipt(order) {
  var printType = (DB.settings && DB.settings.printType) || "thermal";
  var is58mm = printType === "thermal58";
  var paperWidth = is58mm ? "58mm" : "80mm";
  var ctx = collectReceiptPrintCtx(order, { is58mm: is58mm });
  var html = wrapReceiptPrintHtml(buildReceiptInnerHtml(ctx), { is58mm: is58mm, styleId: getReceiptStyleId() });
  if (typeof ImmediatePrinter !== "undefined") {
    var kick = !(order && (order.paymentMethod === "card" || order.paymentMethod === "debt"));
    ImmediatePrinter.print(html, { pageSize: paperWidth, kickDrawer: kick });
  } else {
    try { window.print(); } catch (e) {}
  }
}

function printA4Receipt(order) {
  var ctx = collectReceiptPrintCtx(order, { is58mm: false });
  var html = wrapReceiptPrintHtml(buildReceiptInnerHtml(ctx), { isA4: true, styleId: getReceiptStyleId() });
  if (typeof ImmediatePrinter !== "undefined") {
    ImmediatePrinter.print(html, { pageSize: "A4" });
  } else {
    try { window.print(); } catch (e) {}
  }
}

function printReceipt() {
  var order = LAST_ORDER || DB.orders[DB.orders.length - 1];
  if (!order) return;
  renderReceiptModal(order);
  showModal("receiptModal");
}

function renderReceiptModal(order) {
  var container = $("#receiptContent");
  if (!container) return;
  var ctx = collectReceiptPrintCtx(order, { isPreview: false });
  var styleId = getReceiptStyleId();
  applyReceiptLiveCss(false);
  container.innerHTML = "<div class='rc-style-" + styleId + "'><div class='rc'>" + buildReceiptInnerHtml(ctx) + "</div></div>";
}

/* ═══ PRODUCTS ═══ */

function escapePosHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getIncompletePosProductIds() {
  if (!DB.settings) DB.settings = {};
  var list = DB.settings.incompletePosProducts;
  if (!Array.isArray(list)) list = [];
  return list.map(function (id) { return String(id); }).filter(Boolean);
}

function saveIncompletePosProductIds(ids) {
  if (!DB.settings) DB.settings = {};
  var seen = {};
  var clean = [];
  (ids || []).forEach(function (id) {
    var s = String(id || "");
    if (!s || seen[s]) return;
    seen[s] = true;
    clean.push(s);
  });
  DB.settings.incompletePosProducts = clean;
  if (typeof DataStore !== "undefined" && DataStore.saveSettings) {
    try { DataStore.saveSettings(); } catch (e) {}
  }
}

function markProductIncompleteFromPos(id) {
  if (!id) return;
  var ids = getIncompletePosProductIds();
  if (ids.indexOf(String(id)) === -1) ids.push(String(id));
  saveIncompletePosProductIds(ids);
}

function unmarkProductIncompleteFromPos(id) {
  if (!id) return;
  saveIncompletePosProductIds(getIncompletePosProductIds().filter(function (x) {
    return x !== String(id);
  }));
}

function pruneIncompletePosProductIds() {
  var exist = {};
  (DB.products || []).forEach(function (p) {
    if (p && p.id) exist[String(p.id)] = true;
  });
  var prev = getIncompletePosProductIds();
  var next = prev.filter(function (id) { return exist[id]; });
  if (next.length !== prev.length) saveIncompletePosProductIds(next);
}

function isOriginLikeCategory(c) {
  var id = String((c && c.id) || c || "").trim();
  var name = String((c && c.name) || "").trim();
  var nameNorm = name.replace(/\s+/g, " ");
  if (!id) return true;
  if (id === "all" || id === "fav" || id === "general" || id === "__none__") return true;
  if (id === "origin_all" || id === "origin_fav") return true;
  if (id.indexOf("__origin_") === 0 || id.indexOf("fav:") === 0) return true;
  if (typeof originKeyFromEditId === "function" && originKeyFromEditId(id)) return true;
  if (nameNorm === "هەموو" || nameNorm === "دڵخواز") return true;
  if (nameNorm === "هەموو پۆلەکان" || nameNorm === "هەموو پۆلەکان..." || nameNorm === "-- هەموو پۆلەکان --") return true;
  if (/^all$/i.test(id) || /^all$/i.test(nameNorm) || /^fav$/i.test(id)) return true;
  return false;
}

function productCategoryIsReal(cat) {
  var id = String(cat || "").trim();
  if (!id || isOriginLikeCategory(id)) return false;
  return (DB.categories || []).some(function (c) { return c && c.id === id && !isOriginLikeCategory(c); });
}

function getCashierCategories() {
  return (DB.categories || []).filter(function (c) {
    return c && c.id && !isOriginLikeCategory(c);
  }).slice().sort(function (a, b) {
    var sa = Number(a.sortOrder);
    var sb = Number(b.sortOrder);
    if (!isFinite(sa)) sa = 9999;
    if (!isFinite(sb)) sb = 9999;
    if (sa !== sb) return sa - sb;
    return String(a.name || "").localeCompare(String(b.name || ""), "ku");
  });
}

function firstRealCategoryId() {
  var list = getCashierCategories();
  return list.length ? list[0].id : "";
}

function canManageCategories() {
  try {
    if (typeof AuthService !== "undefined" && AuthService.canAccessPage) {
      return !!AuthService.canAccessPage("categories");
    }
  } catch (e) {}
  var u = DB.currentUser;
  if (u && String(u.role || "").toLowerCase() === "cashier") return false;
  return true;
}

function nextCategorySortOrder() {
  var next = 0;
  (DB.categories || []).forEach(function (c) {
    var n = Number(c && c.sortOrder);
    if (isFinite(n) && n >= next) next = n + 1;
  });
  return next;
}

function persistCategoryOrder(orderedIds) {
  var byId = {};
  (DB.categories || []).forEach(function (c) { if (c && c.id) byId[c.id] = c; });
  var seen = {};
  (orderedIds || []).forEach(function (id, i) {
    if (typeof originKeyFromEditId === "function" && originKeyFromEditId(id)) return;
    if (byId[id]) {
      byId[id].sortOrder = i;
      seen[id] = true;
    }
  });
  var extra = (orderedIds || []).length;
  (DB.categories || []).forEach(function (c) {
    if (c && c.id && !seen[c.id]) {
      c.sortOrder = extra;
      extra += 1;
    }
  });
  try { if (typeof DataStore !== "undefined" && DataStore.saveCategories) DataStore.saveCategories(); } catch (e) {}
  try {
    if (typeof ApiClient !== "undefined" && ApiClient.reorderCategories) {
      var catIds = getCashierCategories().map(function (c) { return c.id; });
      ApiClient.reorderCategories(catIds).catch(function () {});
    } else if (typeof ApiClient !== "undefined" && ApiClient.isOnline && ApiClient.isOnline() && ApiClient.saveCategory) {
      (DB.categories || []).forEach(function (c) { ApiClient.saveCategory(c).catch(function () {}); });
    }
  } catch (e2) {}
  renderCategories();
  renderPosCategories();
  if (typeof refreshPosCategoryTabsNow === "function") refreshPosCategoryTabsNow();
  else if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
  if (typeof renderProductGrid === "function") renderProductGrid(POS_GRID_CATEGORY);
}

function compareSortOrder(a, b) {
  var sa = Number(a && a.sortOrder);
  var sb = Number(b && b.sortOrder);
  var aOk = isFinite(sa);
  var bOk = isFinite(sb);
  if (aOk && bOk && sa !== sb) return sa - sb;
  if (aOk !== bOk) return aOk ? -1 : 1;
  return String((a && a.name) || "").localeCompare(String((b && b.name) || ""), "ku");
}

function nextProductSortOrder() {
  var next = 0;
  (DB.products || []).forEach(function (p) {
    var n = Number(p && p.sortOrder);
    if (isFinite(n) && n >= next) next = n + 1;
  });
  return next;
}

function persistProductOrder(orderedIds) {
  var byId = {};
  (DB.products || []).forEach(function (p) { if (p && p.id) byId[String(p.id)] = p; });
  var all = (DB.products || []).slice().sort(compareSortOrder);
  var want = {};
  (orderedIds || []).forEach(function (id) { want[String(id)] = true; });
  var nextSub = [];
  (orderedIds || []).forEach(function (id) {
    if (byId[String(id)]) nextSub.push(byId[String(id)]);
  });
  var qi = 0;
  for (var i = 0; i < all.length; i++) {
    if (want[String(all[i].id)] && qi < nextSub.length) all[i] = nextSub[qi++];
  }
  all.forEach(function (p, i) { p.sortOrder = i; });
  try { if (typeof DataStore !== "undefined" && DataStore.saveProducts) DataStore.saveProducts(); } catch (e) {}
  try {
    if (typeof ApiClient !== "undefined" && ApiClient.reorderProducts) {
      ApiClient.reorderProducts(all.map(function (p) { return p.id; })).catch(function () {});
    }
  } catch (e2) {}
  if (typeof renderProducts === "function") renderProducts();
  if (typeof renderPosGrid === "function") renderPosGrid();
  if (typeof renderProductGrid === "function") renderProductGrid(POS_GRID_CATEGORY);
}

function applySortNumber(kind, id, raw) {
  var n = parseInt(raw, 10);
  var list = kind === "products" ? getFilteredProducts() : getCashierCategories();
  if (!list.length) return;
  if (!isFinite(n)) {
    if (kind === "products") renderProducts();
    else renderCategories();
    return;
  }
  n = Math.max(1, Math.min(list.length, n));
  var ids = list.map(function (x) { return x.id; });
  var from = ids.indexOf(id);
  if (from < 0) return;
  var to = n - 1;
  if (from === to) return;
  ids.splice(from, 1);
  ids.splice(to, 0, id);
  if (kind === "products") persistProductOrder(ids);
  else persistCategoryOrder(ids);
}
window.applySortNumber = applySortNumber;
window.nextProductSortOrder = nextProductSortOrder;

function moveCategory(id, dir) {
  var list = getCashierCategories();
  var i = -1;
  for (var n = 0; n < list.length; n++) if (list[n].id === id) { i = n; break; }
  var j = i + (parseInt(dir, 10) || 0);
  if (i < 0 || j < 0 || j >= list.length) return;
  var tmp = list[i];
  list[i] = list[j];
  list[j] = tmp;
  persistCategoryOrder(list.map(function (c) { return c.id; }));
}

var CAT_SORT_NAME_DIR = 1;
var CAT_SORT_COUNT_DIR = 1;
var CAT_DRAG_ID = "";

function sortCategoriesBy(field) {
  var list = getCashierCategories();
  if (field === "name") {
    CAT_SORT_NAME_DIR = CAT_SORT_NAME_DIR === 1 ? -1 : 1;
    var nd = CAT_SORT_NAME_DIR;
    list.sort(function (a, b) {
      return nd * String(a.name || "").localeCompare(String(b.name || ""), "ku");
    });
  } else if (field === "count") {
    CAT_SORT_COUNT_DIR = CAT_SORT_COUNT_DIR === 1 ? -1 : 1;
    var cd = CAT_SORT_COUNT_DIR;
    list.sort(function (a, b) {
      var ca = (DB.products || []).filter(function (p) { return p.cat === a.id; }).length;
      var cb = (DB.products || []).filter(function (p) { return p.cat === b.id; }).length;
      return cd * (ca - cb);
    });
  }
  persistCategoryOrder(list.map(function (c) { return c.id; }));
}

function onCatDragStart(ev, id) {
  CAT_DRAG_ID = id;
  if (ev.dataTransfer) {
    ev.dataTransfer.effectAllowed = "move";
    try { ev.dataTransfer.setData("text/plain", id); } catch (e) {}
  }
  var row = ev.currentTarget && ev.currentTarget.closest ? ev.currentTarget.closest("tr") : null;
  if (row) row.classList.add("is-dragging");
}
function onCatDragOver(ev) {
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
  var row = ev.currentTarget;
  if (row && row.classList) row.classList.add("is-drag-over");
}
function onCatDragLeave(ev) {
  if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.remove("is-drag-over");
}
function onCatDrop(ev, targetId) {
  ev.preventDefault();
  if (ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.remove("is-drag-over");
  var fromId = CAT_DRAG_ID || (ev.dataTransfer && ev.dataTransfer.getData("text/plain"));
  CAT_DRAG_ID = "";
  if (!fromId || fromId === targetId) return;
  var list = getCashierCategories().map(function (c) { return c.id; });
  var from = list.indexOf(fromId);
  var to = list.indexOf(targetId);
  if (from < 0 || to < 0) return;
  list.splice(from, 1);
  list.splice(to, 0, fromId);
  persistCategoryOrder(list);
}
function onCatDragEnd() {
  CAT_DRAG_ID = "";
  document.querySelectorAll(".cat-row").forEach(function (r) {
    r.classList.remove("is-dragging", "is-drag-over");
  });
}
function goToCategoriesPage() {
  if (typeof switchSection === "function") switchSection("categories");
}
function openCategoryModalFromProduct() {
  openCategoryModal();
}
window.getCashierCategories = getCashierCategories;
window.moveCategory = moveCategory;
window.sortCategoriesBy = sortCategoriesBy;
window.onCatDragStart = onCatDragStart;
window.onCatDragOver = onCatDragOver;
window.onCatDragLeave = onCatDragLeave;
window.onCatDrop = onCatDrop;
window.onCatDragEnd = onCatDragEnd;
window.goToCategoriesPage = goToCategoriesPage;
window.openCategoryModalFromProduct = openCategoryModalFromProduct;

var CATALOG_SORT = {
  armed: false,
  dragging: false,
  timer: 0,
  kind: "",
  item: null,
  ghost: null,
  pointerId: 0,
  startX: 0,
  startY: 0,
  ox: 0,
  oy: 0
};

function catalogSortCleanup() {
  if (CATALOG_SORT.timer) {
    clearTimeout(CATALOG_SORT.timer);
    CATALOG_SORT.timer = 0;
  }
  if (CATALOG_SORT.ghost && CATALOG_SORT.ghost.parentNode) CATALOG_SORT.ghost.parentNode.removeChild(CATALOG_SORT.ghost);
  if (CATALOG_SORT.item) CATALOG_SORT.item.classList.remove("is-sort-source", "is-sort-armed");
  document.body.classList.remove("is-catalog-sorting");
  window.removeEventListener("pointermove", onCatalogSortMove);
  window.removeEventListener("pointerup", onCatalogSortUp);
  window.removeEventListener("pointercancel", onCatalogSortUp);
  CATALOG_SORT.armed = false;
  CATALOG_SORT.dragging = false;
  CATALOG_SORT.ghost = null;
  CATALOG_SORT.item = null;
  CATALOG_SORT.kind = "";
}

function onCatalogSortPointerDown(ev) {
  if (ev.isPrimary === false) return;
  if (ev.pointerType === "mouse" && ev.button !== 0) return;
  var handle = ev.target && ev.target.closest ? ev.target.closest("[data-sort-handle]") : null;
  if (!handle) return;
  var item = handle.closest("[data-sort-id]");
  if (!item) return;
  var kind = item.getAttribute("data-sort-kind") || "";
  if (kind !== "products" && kind !== "categories") return;
  catalogSortCleanup();
  CATALOG_SORT.item = item;
  CATALOG_SORT.kind = kind;
  CATALOG_SORT.pointerId = ev.pointerId;
  CATALOG_SORT.startX = ev.clientX;
  CATALOG_SORT.startY = ev.clientY;
  var delay = (ev.pointerType === "touch" || ev.pointerType === "pen") ? 280 : 80;
  CATALOG_SORT.timer = setTimeout(function () { startCatalogSortDrag(); }, delay);
  window.addEventListener("pointermove", onCatalogSortMove, { passive: false });
  window.addEventListener("pointerup", onCatalogSortUp);
  window.addEventListener("pointercancel", onCatalogSortUp);
}

function startCatalogSortDrag() {
  var item = CATALOG_SORT.item;
  if (!item || CATALOG_SORT.dragging) return;
  CATALOG_SORT.dragging = true;
  CATALOG_SORT.armed = true;
  item.classList.add("is-sort-armed", "is-sort-source");
  document.body.classList.add("is-catalog-sorting");
  var rect = item.getBoundingClientRect();
  CATALOG_SORT.ox = CATALOG_SORT.startX - rect.left;
  CATALOG_SORT.oy = CATALOG_SORT.startY - rect.top;
  var ghostNode = item.cloneNode(true);
  ghostNode.classList.add("sort-float-ghost");
  ghostNode.classList.remove("is-sort-source", "is-sort-armed");
  if (item.tagName === "TR") {
    var wrap = document.createElement("div");
    wrap.className = "sort-float-ghost sort-float-ghost-row";
    wrap.style.cssText = "position:fixed;z-index:100000;pointer-events:none;width:" + rect.width + "px;left:" + rect.left + "px;top:" + rect.top + "px;";
    var table = document.createElement("table");
    table.className = "cat-table";
    table.style.width = rect.width + "px";
    table.style.background = "var(--bg-card)";
    table.style.borderRadius = "12px";
    var tb = document.createElement("tbody");
    tb.appendChild(ghostNode);
    table.appendChild(tb);
    wrap.appendChild(table);
    document.body.appendChild(wrap);
    CATALOG_SORT.ghost = wrap;
  } else {
    ghostNode.style.cssText = "position:fixed;z-index:100000;pointer-events:none;margin:0;width:" + rect.width + "px;height:" + rect.height + "px;left:" + rect.left + "px;top:" + rect.top + "px;";
    document.body.appendChild(ghostNode);
    CATALOG_SORT.ghost = ghostNode;
  }
  try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}
}

function onCatalogSortMove(ev) {
  if (CATALOG_SORT.pointerId && ev.pointerId !== CATALOG_SORT.pointerId) return;
  var dx = ev.clientX - CATALOG_SORT.startX;
  var dy = ev.clientY - CATALOG_SORT.startY;
  if (!CATALOG_SORT.dragging) {
    if (Math.abs(dx) + Math.abs(dy) > 12) {
      if ((ev.pointerType === "touch" || ev.pointerType === "pen") && !CATALOG_SORT.armed) {
        catalogSortCleanup();
        return;
      }
      startCatalogSortDrag();
    } else {
      return;
    }
  }
  if (ev.preventDefault) ev.preventDefault();
  var ghost = CATALOG_SORT.ghost;
  var item = CATALOG_SORT.item;
  if (!ghost || !item) return;
  ghost.style.left = (ev.clientX - CATALOG_SORT.ox) + "px";
  ghost.style.top = (ev.clientY - CATALOG_SORT.oy) + "px";
  var prevVis = ghost.style.visibility;
  ghost.style.visibility = "hidden";
  var under = document.elementFromPoint(ev.clientX, ev.clientY);
  ghost.style.visibility = prevVis || "visible";
  var over = under && under.closest ? under.closest("[data-sort-id]") : null;
  if (!over || over === item) return;
  if (over.getAttribute("data-sort-kind") !== CATALOG_SORT.kind) return;
  if (over.parentNode !== item.parentNode) return;
  var rect = over.getBoundingClientRect();
  var rtl = document.documentElement.dir !== "ltr";
  var before;
  if (CATALOG_SORT.kind === "categories") {
    before = ev.clientY < rect.top + rect.height / 2;
  } else {
    var midY = rect.top + rect.height / 2;
    if (Math.abs(ev.clientY - midY) < rect.height * 0.45) {
      before = rtl ? (ev.clientX > rect.left + rect.width / 2) : (ev.clientX < rect.left + rect.width / 2);
    } else {
      before = ev.clientY < midY;
    }
  }
  var parent = item.parentNode;
  if (before) {
    if (item.nextSibling !== over) parent.insertBefore(item, over);
  } else if (over.nextSibling !== item) {
    parent.insertBefore(item, over.nextSibling);
  }
}

function onCatalogSortUp(ev) {
  if (ev && CATALOG_SORT.pointerId && ev.pointerId !== CATALOG_SORT.pointerId) return;
  var item = CATALOG_SORT.item;
  var kind = CATALOG_SORT.kind;
  var wasDragging = CATALOG_SORT.dragging;
  catalogSortCleanup();
  if (!wasDragging || !item || !item.parentNode) return;
  var ids = [];
  Array.prototype.forEach.call(item.parentNode.children, function (el) {
    var id = el.getAttribute && el.getAttribute("data-sort-id");
    if (id) ids.push(id);
  });
  if (ids.length < 2) return;
  if (kind === "products") persistProductOrder(ids);
  else persistCategoryOrder(ids);
}

if (!window.__catalogSortBound) {
  window.__catalogSortBound = true;
  document.addEventListener("pointerdown", onCatalogSortPointerDown, true);
  document.addEventListener("contextmenu", function (e) {
    if (e.target && e.target.closest && e.target.closest("[data-sort-handle]")) e.preventDefault();
  });
}

function findCategoryIdByName(name) {
  var n = String(name || "").trim().toLowerCase();
  if (!n || n === "general" || n === "all" || n === "fav") return "";
  if (isOriginLikeCategory({ id: n, name: name })) return "";
  var list = getAssignableCategories();
  for (var i = 0; i < list.length; i++) {
    if (String((list[i] && list[i].name) || "").trim().toLowerCase() === n) return list[i].id;
  }
  return "";
}

function preferredPosCategoryId() {
  var cur = (typeof POS_GRID_CATEGORY !== "undefined") ? String(POS_GRID_CATEGORY || "").trim() : "";
  if (productCategoryIsReal(cur)) return cur;
  return firstRealCategoryId();
}

function ensureDefaultCategory() {
  var existing = firstRealCategoryId();
  if (existing) return existing;
  var id = "cat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  var cat = {
    id: id,
    name: "گشتی",
    icon: "fa-tag",
    color: "#6366f1",
    image: "",
    sortOrder: 0
  };
  DB.categories = DB.categories || [];
  DB.categories.push(cat);
  try { if (typeof DataStore !== "undefined" && DataStore.saveCategories) DataStore.saveCategories(); } catch (e) {}
  try {
    if (typeof ApiClient !== "undefined" && ApiClient.isOnline && ApiClient.isOnline() && ApiClient.saveCategory) {
      ApiClient.saveCategory(cat).catch(function () {});
    }
  } catch (e2) {}
  return id;
}

function resolveProductCategoryId(cat) {
  if (productCategoryIsReal(cat)) return String(cat).trim();
  var byName = findCategoryIdByName(cat);
  if (byName) return byName;
  return preferredPosCategoryId() || ensureDefaultCategory();
}

function repairOrphanProductCategories() {
  var changed = false;
  (DB.products || []).forEach(function (p) {
    if (!p) return;
    if (productCategoryIsReal(p.cat)) return;
    var byName = findCategoryIdByName(p.cat);
    if (byName) {
      p.cat = byName;
      changed = true;
      return;
    }
    var raw = String(p.cat || "").trim().toLowerCase();
    if (!raw || raw === "general" || raw === "all" || raw === "fav") return;
  });
  if (changed) {
    try { if (typeof DataStore !== "undefined" && DataStore.saveProducts) DataStore.saveProducts(); } catch (e) {}
  }
  return changed;
}
window.resolveProductCategoryId = resolveProductCategoryId;
window.ensureDefaultCategory = ensureDefaultCategory;
window.repairOrphanProductCategories = repairOrphanProductCategories;

function productMissingPosFields(p) {
  var missing = [];
  if (!p) return ["هەموو زانیارییەکان"];
  var name = String(p.name || "").trim();
  var barcode = String(p.barcode || "").trim();
  if (!name || name === "کاڵای نوێ" || (barcode && name === barcode)) missing.push("ناو");
  if (!(parseFloat(p.price) > 0)) missing.push("نرخی فرۆشتن");
  if (!(parseFloat(p.cost) > 0)) missing.push("نرخی کڕین");
  var catRaw = String(p.cat || "").trim();
  if (catRaw && catRaw !== "all" && catRaw !== "fav" && !productCategoryIsReal(p.cat) && !(typeof isProductQuickFavorite === "function" && isProductQuickFavorite(p))) {
    missing.push("پۆل");
  }
  if (!String(p.image || "").trim()) missing.push("وێنە");
  return missing;
}

function looksLikePosQuickAdd(p) {
  if (!p) return false;
  var name = String(p.name || "").trim();
  var barcode = String(p.barcode || "").trim();
  if (barcode && (name === barcode || name === "کاڵای نوێ" || !name)) return true;
  return false;
}

function isProductIncompleteFromPos(p) {
  if (!p) return false;
  if (getIncompletePosProductIds().indexOf(String(p.id)) !== -1) return true;
  return looksLikePosQuickAdd(p);
}

function isProductFullyFilledForPos(p) {
  if (!p) return false;
  var name = String(p.name || "").trim();
  var barcode = String(p.barcode || "").trim();
  if (!name || name === "کاڵای نوێ" || (barcode && name === barcode)) return false;
  if (!(parseFloat(p.price) > 0)) return false;
  if (!(parseFloat(p.cost) > 0)) return false;
  var catRaw = String(p.cat || "").trim();
  if (productCategoryIsReal(p.cat)) return true;
  if (!catRaw || catRaw === "all") return true;
  if (typeof isProductQuickFavorite === "function" && isProductQuickFavorite(p)) return true;
  return false;
}

function getIncompletePosProducts() {
  pruneIncompletePosProductIds();
  return (DB.products || []).filter(isProductIncompleteFromPos);
}

function completeIncompletePosProduct(id) {
  SHOW_INCOMPLETE_POS_ONLY = false;
  openProductModal(id);
}
window.completeIncompletePosProduct = completeIncompletePosProduct;

function toggleIncompletePosFilter() {
  SHOW_INCOMPLETE_POS_ONLY = !SHOW_INCOMPLETE_POS_ONLY;
  renderProducts();
}
window.toggleIncompletePosFilter = toggleIncompletePosFilter;

function renderIncompletePosBanner() {
  var banner = document.getElementById("incompletePosBanner");
  if (!banner) return;
  var items = getIncompletePosProducts();
  if (!items.length) {
    SHOW_INCOMPLETE_POS_ONLY = false;
    banner.style.display = "none";
    banner.innerHTML = "";
    return;
  }
  banner.style.display = "block";
  var rows = items.map(function (p) {
    var missing = productMissingPosFields(p);
    var missHtml = missing.map(function (m) {
      return '<span class="inc-miss">' + escapePosHtml(m) + "</span>";
  }).join("");
    return '<div class="incomplete-pos-row">' +
      '<div class="inc-main">' +
        '<div class="inc-name"><i class="fas fa-exclamation-circle"></i> ' + escapePosHtml(p.name || "بێ ناو") + "</div>" +
        '<div class="inc-meta">بارکۆد: <b>' + escapePosHtml(p.barcode || "-") + "</b> · نرخ: <b>" + fmt(p.price) + "</b></div>" +
        '<div class="inc-missing"><span>نەماوە:</span> ' + missHtml + "</div>" +
      "</div>" +
      '<button type="button" class="btn btn-sm btn-primary" onclick="completeIncompletePosProduct(\'' + p.id + '\')"><i class="fas fa-edit"></i> تەواوکردن</button>' +
    "</div>";
  }).join("");
  var filterLabel = SHOW_INCOMPLETE_POS_ONLY ? "پیشاندانی هەموو" : "تەنها ناتەواوەکان";
  banner.innerHTML =
    '<div class="incomplete-pos-head">' +
      '<div class="incomplete-pos-head-text">' +
        '<i class="fas fa-bell"></i>' +
        "<div>" +
          "<strong>کاڵای ناتەواو لە وەرگرتنی پارە</strong>" +
          "<span>" + items.length + " کاڵا لە POS تەنها بارکۆد و نرخەکەیان تۆمارکراوە. تەواوی زانیارییەکان زیاد بکە.</span>" +
        "</div>" +
      "</div>" +
      '<button type="button" class="btn btn-sm btn-outline" onclick="toggleIncompletePosFilter()"><i class="fas fa-filter"></i> ' + filterLabel + "</button>" +
    "</div>" +
    '<div class="incomplete-pos-list">' + rows + "</div>";
}

function getFilteredProducts() {
  var search = ($("#productSearch") ? $("#productSearch").value : "").toLowerCase();
  var catFilter = $("#productCatFilter") ? $("#productCatFilter").value : "all";
  var list = (DB.products || []).filter(function (p) {
    var name = String(p.name || "").toLowerCase();
    var barcode = String(p.barcode || "");
    var matchSearch = !search || name.indexOf(search) !== -1 || barcode.indexOf(search) !== -1;
    var matchCat = catFilter === "all" || p.cat === catFilter;
    var matchIncomplete = !SHOW_INCOMPLETE_POS_ONLY || isProductIncompleteFromPos(p);
    return matchSearch && matchCat && matchIncomplete;
  });
  list.sort(compareSortOrder);
  return list;
}

function selectedProductCount() {
  return Object.keys(SELECTED_PRODUCT_IDS).length;
}

function pruneProductSelection() {
  Object.keys(SELECTED_PRODUCT_IDS).forEach(function (id) {
    if (!(DB.products || []).some(function (p) { return p.id === id; })) delete SELECTED_PRODUCT_IDS[id];
  });
}

function updateProductBulkBar() {
  pruneProductSelection();
  var count = selectedProductCount();
  var countEl = $("#productSelectedCount");
  if (countEl) countEl.textContent = count + " هەڵبژێردراو";
  var btn = $("#deleteSelectedProductsBtn");
  if (btn) btn.disabled = count === 0;
  var chk = $("#selectAllProductsChk");
  if (chk) {
    var visible = getFilteredProducts();
    var allOn = visible.length > 0 && visible.every(function (p) { return !!SELECTED_PRODUCT_IDS[p.id]; });
    chk.checked = allOn;
    chk.indeterminate = count > 0 && !allOn;
  }
}

function toggleProductSelected(id, on) {
  if (on) SELECTED_PRODUCT_IDS[id] = true;
  else delete SELECTED_PRODUCT_IDS[id];
  var card = document.querySelector('.product-card[data-product-id="' + id + '"]');
  if (card) card.classList.toggle("is-selected", !!on);
  updateProductBulkBar();
}

function toggleSelectAllProducts(on) {
  getFilteredProducts().forEach(function (p) {
    if (on) SELECTED_PRODUCT_IDS[p.id] = true;
    else delete SELECTED_PRODUCT_IDS[p.id];
  });
  renderProducts();
}

function markDemoCatalogClearedIfEmpty() {
  if ((DB.products || []).length > 0) return;
  if (!DB.settings) DB.settings = {};
  DB.settings.demoCatalogCleared = true;
  DataStore.saveSettings();
  CART = [];
  try {
    if (typeof CUSTOMER_QUEUE !== "undefined") {
      Object.keys(CUSTOMER_QUEUE).forEach(function (k) {
        if (CUSTOMER_QUEUE[k]) CUSTOMER_QUEUE[k].cart = [];
      });
    }
  } catch (e) {}
}

function buildProductCardHtml(p, displayNum) {
  var imgHtml = buildImageHtml(p.id, p.name, p.image);
  var cost = p.cost || 0;
  var profit = p.price - cost;
  var profitPct = cost > 0 ? ((profit / cost) * 100).toFixed(1) : "0";
  var profitColor = profit >= 0 ? "var(--success)" : "var(--danger)";
  var packDetail = "";
  if (productTracksPack(p) && (p.packQty > 1 || p.packPrice > 0)) {
    var packPrice = p.packPrice > 0 ? p.packPrice : (p.price * (p.packQty || 1));
    packDetail = '<div style="font-size:0.72rem;color:#38bdf8;margin-top:2px;font-weight:600;"><i class="fas fa-box"></i> کارتۆن (' + (p.packQty || 1) + 'د): ' + fmt(packPrice) + '</div>';
  }
  var stockDetail = productTracksStock(p) ? (p.stock + " دانە") : "بێ کۆگا";
  if (productTracksStock(p) && p.packQty > 1) {
    stockDetail += ' <small style="display:block;color:var(--text-muted);font-size:0.68rem;">(' + Math.floor(p.stock / p.packQty) + ' کارتۆن + ' + (p.stock % p.packQty) + ' دانە)</small>';
  }
  var checked = SELECTED_PRODUCT_IDS[p.id] ? " checked" : "";
  var selectedClass = SELECTED_PRODUCT_IDS[p.id] ? " is-selected" : "";
  var incomplete = isProductIncompleteFromPos(p);
  if (incomplete) selectedClass += " is-incomplete";
  var incompleteBadge = incomplete
    ? '<span class="incomplete-pos-badge"><i class="fas fa-bell"></i> ناتەواو</span>'
    : "";
  var sortNum = (displayNum != null ? displayNum : ((Number(p.sortOrder) || 0) + 1));
  return '<div class="product-card' + selectedClass + '" data-product-id="' + p.id + '" data-sort-id="' + p.id + '" data-sort-kind="products">' +
    '<div class="product-sort-bar" onclick="event.stopPropagation()">' +
      '<span class="sort-handle" data-sort-handle title="دەستت لێبدە و ڕاکێشە"><i class="fas fa-grip-lines"></i></span>' +
      '<input type="number" class="sort-num-input" min="1" inputmode="numeric" value="' + sortNum + '" title="ژمارەی ڕیز" onchange="applySortNumber(\'products\',\'' + p.id + '\',this.value)">' +
    '</div>' +
    '<label class="product-pick" onclick="event.stopPropagation()"><input type="checkbox" class="product-pick-input"' + checked + ' onchange="toggleProductSelected(\'' + p.id + '\', this.checked)"></label>' +
    '<div class="image">' + imgHtml + '</div><div class="padding"><div class="name">' + incompleteBadge + p.name + '</div><div class="meta"><span class="price">' + (typeof buildPriceHtml === "function" ? buildPriceHtml(p) : fmt(p.price)) + '</span>' + (typeof buildOfferBadgeHtml === "function" ? (' ' + buildOfferBadgeHtml(p)) : '') + '<span class="cost" style="color:var(--danger);font-size:0.7rem;">Cost: ' + fmt(cost) + '</span><span class="qty">کۆگا: ' + stockDetail + '</span></div>' + packDetail + '<div class="profit-row" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding:4px 8px;background:var(--bg-input);border-radius:6px;"><span style="font-size:0.7rem;color:var(--text-muted);">قازانج:</span><span style="font-size:0.8rem;font-weight:700;color:' + profitColor + ';">' + fmt(profit) + ' (' + profitPct + '%)</span></div><div class="actions"><button class="btn btn-sm btn-outline" style="color:#fbbf24;border-color:rgba(251,191,36,0.45);" title="دڵخواز" onclick="toggleQuickFavorite(\'' + p.id + '\')"><i class="fas fa-star"' + (isProductQuickFavorite(p) ? ' style="color:#fbbf24;"' : "") + '></i></button><button class="btn btn-sm btn-outline" style="color:#ec4899;border-color:rgba(236,72,153,0.35);" title="دانانی ئۆفەر" onclick="PriceTools.openOfferForProduct(\'' + p.id + '\')"><i class="fas fa-bolt"></i></button><button class="btn btn-sm btn-outline" style="color:#38bdf8;border-color:rgba(56,189,248,0.35);" title="گۆڕینی نرخ" onclick="PriceTools.openPriceForProduct(\'' + p.id + '\')"><i class="fas fa-tag"></i></button><button class="btn btn-sm btn-outline" title="چاپی لەزگە و باڕکۆد" onclick="openBarcodeStudioForProduct(\'' + p.id + '\')"><i class="fas fa-barcode"></i></button><button class="btn btn-sm btn-outline" onclick="editProduct(\'' + p.id + '\')"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-outline" style="color:var(--danger)" onclick="deleteProduct(\'' + p.id + '\')"><i class="fas fa-trash"></i></button></div></div></div>';
}

var PRODUCT_LIST_PAGE = 1;
var PRODUCT_LIST_PAGE_SIZE = 48;

function renderProducts() {
  var grid = $("#productsGrid"); if (!grid) return;
  refreshProductCategorySelects();
  try { renderIncompletePosBanner(); } catch (e) {}
  if (DB.products.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">هێشتا بەرهەم نییە</div>';
    SELECTED_PRODUCT_IDS = {};
    updateProductBulkBar();
    renderProductsPager(0, 1);
    return;
  }
  var list = getFilteredProducts();
  if (list.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">' +
      (SHOW_INCOMPLETE_POS_ONLY ? "کاڵای ناتەواو نەماوە" : "هیچ کاڵایەک نەدۆزرایەوە") + "</div>";
    updateProductBulkBar();
    renderProductsPager(0, 1);
    return;
  }
  var totalPages = Math.max(1, Math.ceil(list.length / PRODUCT_LIST_PAGE_SIZE));
  if (PRODUCT_LIST_PAGE > totalPages) PRODUCT_LIST_PAGE = totalPages;
  if (PRODUCT_LIST_PAGE < 1) PRODUCT_LIST_PAGE = 1;
  var start = (PRODUCT_LIST_PAGE - 1) * PRODUCT_LIST_PAGE_SIZE;
  var pageList = list.slice(start, start + PRODUCT_LIST_PAGE_SIZE);
  grid.setAttribute("data-sort-kind", "products");
  grid.innerHTML = pageList.map(function (p, i) {
    return buildProductCardHtml(p, start + i + 1);
  }).join("");
  updateProductBulkBar();
  renderProductsPager(list.length, totalPages);
}

function renderProductsPager(total, totalPages) {
  var pager = document.getElementById("productsListPager");
  if (!pager) return;
  if (!total || totalPages <= 1) {
    pager.innerHTML = total ? '<span style="color:var(--text-muted);font-size:0.8rem;font-weight:700;">' + total + ' کاڵا</span>' : "";
    return;
  }
  pager.innerHTML =
    '<button type="button" class="btn btn-outline btn-sm" onclick="setProductListPage(' + (PRODUCT_LIST_PAGE - 1) + ')" ' + (PRODUCT_LIST_PAGE <= 1 ? "disabled" : "") + '>پێشوو</button>' +
    '<span style="font-weight:800;font-size:0.85rem;">لاپەڕە ' + PRODUCT_LIST_PAGE + ' / ' + totalPages + ' · ' + total + ' کاڵا</span>' +
    '<button type="button" class="btn btn-outline btn-sm" onclick="setProductListPage(' + (PRODUCT_LIST_PAGE + 1) + ')" ' + (PRODUCT_LIST_PAGE >= totalPages ? "disabled" : "") + '>دواتر</button>';
}

function setProductListPage(page) {
  PRODUCT_LIST_PAGE = page;
  renderProducts();
  var grid = document.getElementById("productsGrid");
  if (grid && grid.scrollIntoView) grid.scrollIntoView({ block: "start" });
}
window.setProductListPage = setProductListPage;

function filterProducts() {
  PRODUCT_LIST_PAGE = 1;
  renderProducts();
}

function deleteSelectedProducts() {
  var ids = Object.keys(SELECTED_PRODUCT_IDS);
  if (ids.length === 0) {
    toast("ئاگاداری", "سەرەتا هەڵبژاردنی هەموو بگرە، یان کاڵا هەڵبژێرە", "warning");
    return;
  }
  DELETE_CALLBACK = function () {
    var gone = {};
    ids.forEach(function (id) { gone[id] = true; });
    DB.products = (DB.products || []).filter(function (p) { return !gone[p.id]; });
    ids.forEach(function (id) {
      try { removeCachedImage(id); } catch (e) {}
      if (typeof ApiClient !== "undefined" && ApiClient.isOnline()) {
        ApiClient.deleteProduct(id).catch(function () {});
      }
    });
    SELECTED_PRODUCT_IDS = {};
    DataStore.saveProducts();
    pruneIncompletePosProductIds();
    markDemoCatalogClearedIfEmpty();
    renderProducts();
    try { renderPosGrid(); } catch (e) {}
    try { if (typeof renderProductGrid === "function") renderProductGrid(); } catch (e) {}
    try { if (typeof renderPosQuickRow === "function") renderPosQuickRow(); } catch (e) {}
    try { if (typeof renderCart === "function") renderCart(); } catch (e) {}
    toast("سەرکەوتوو", ids.length + " کاڵا سڕایەوە", "success");
  };
  var msgEl = $("#deleteModalText");
  if (msgEl) msgEl.textContent = ids.length + " کاڵای هەڵبژێردراو بسڕدرێتەوە؟ ئەمە ناگەڕێتەوە.";
  showModal("deleteModal");
}
window.toggleProductSelected = toggleProductSelected;
window.toggleSelectAllProducts = toggleSelectAllProducts;
window.deleteSelectedProducts = deleteSelectedProducts;

function openNewProductModal() {
  openProductModal(null);
}

function ean13CheckDigit(raw12) {
  var sum = 0;
  for (var i = 0; i < 12; i++) {
    var digit = parseInt(String(raw12).charAt(i), 10) || 0;
    sum += (i % 2 === 0) ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

function barcodeNumberInUse(code, exceptId) {
  var c = String(code || "").trim();
  if (!c) return false;
  return (DB.products || []).some(function (p) {
    if (exceptId && p.id === exceptId) return false;
    return String(p.barcode || "").trim() === c || String(p.packBarcode || "").trim() === c;
  });
}

function makeUniqueEan13() {
  var prefix = String((DB.settings && DB.settings.barcodePrefix) || "200").replace(/\D/g, "");
  if (!prefix) prefix = "200";
  prefix = (prefix + "000").slice(0, 3);
  var barcode = "";
  var tries = 0;
  while (tries < 80) {
    var body = Math.floor(100000000 + Math.random() * 900000000).toString().slice(0, 9);
    var raw = (prefix + body).slice(0, 12);
    barcode = raw + ean13CheckDigit(raw);
    if (!barcodeNumberInUse(barcode)) return barcode;
    tries++;
  }
  return barcode;
}

function generateAndSetBarcode() {
  var barcode = makeUniqueEan13();
  var barcodeInput = $("#pBarcode");
  if (barcodeInput) {
    barcodeInput.value = barcode;
    barcodeInput.style.borderColor = "var(--success)";
    setTimeout(function () { barcodeInput.style.borderColor = ""; }, 1500);
  }
  toast("سەرکەوتوو", "بارکۆدی نوێ (EAN-13) بە سەرکەوتوویی دروستکرا: " + barcode, "success");
}

function setQuickExpiryMonths(months) {
  var d = new Date();
  d.setMonth(d.getMonth() + months);
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  var expInput = $("#pExpiryDate");
  if (expInput) {
    expInput.value = yyyy + '-' + mm + '-' + dd;
    calculateProductExpiryNotice();
  }
}

function clearProductExpiry() {
  var expInput = $("#pExpiryDate");
  if (expInput) {
    expInput.value = "";
    calculateProductExpiryNotice();
  }
}

function productFeatureBtnId(kind) {
  if (kind === "stock") return "pTrackStockBtn";
  if (kind === "expiry") return "pTrackExpiryBtn";
  return "pTrackPackBtn";
}
function isProductFeatureOn(kind) {
  var btn = document.getElementById(productFeatureBtnId(kind));
  return !!(btn && btn.classList.contains("on"));
}
function syncProductFeatureFields() {
  var stockOn = isProductFeatureOn("stock");
  var expiryOn = isProductFeatureOn("expiry");
  var packOn = isProductFeatureOn("pack");
  var sg = document.getElementById("pStockGroup");
  var mg = document.getElementById("pMinAlertGroup");
  var eg = document.getElementById("pExpiryFieldsWrap");
  var pg = document.getElementById("pPackFieldsWrap");
  if (sg) sg.style.display = stockOn ? "" : "none";
  if (mg) mg.style.display = stockOn ? "" : "none";
  if (eg) eg.style.display = expiryOn ? "" : "none";
  if (pg) pg.style.display = packOn ? "" : "none";
}
function setProductFeature(kind, on) {
  var btn = document.getElementById(productFeatureBtnId(kind));
  if (btn) {
    btn.classList.toggle("on", !!on);
    btn.classList.toggle("off", !on);
  }
  syncProductFeatureFields();
}
function toggleProductFeature(kind) {
  setProductFeature(kind, !isProductFeatureOn(kind));
}
function applyProductKindPreset(kind) {
  var isCard = kind === "card";
  setProductFeature("stock", !isCard);
  setProductFeature("expiry", !isCard);
  setProductFeature("pack", !isCard);
}
window.toggleProductFeature = toggleProductFeature;
window.applyProductKindPreset = applyProductKindPreset;
window.setProductFeature = setProductFeature;

function quickFeatureBtnId(kind) {
  if (kind === "stock") return "qTrackStockBtn";
  if (kind === "expiry") return "qTrackExpiryBtn";
  return "qTrackPackBtn";
}
function isQuickFeatureOn(kind) {
  var btn = document.getElementById(quickFeatureBtnId(kind));
  return !!(btn && btn.classList.contains("on"));
}
function syncQuickProductFeatures() {
  var stockOn = isQuickFeatureOn("stock");
  var expiryOn = isQuickFeatureOn("expiry");
  var packOn = isQuickFeatureOn("pack");
  var sg = document.getElementById("qStockGroup");
  var mg = document.getElementById("qMinAlertGroup");
  var eg = document.getElementById("qExpiryFieldsWrap");
  var pg = document.getElementById("qPackFieldsWrap");
  if (sg) sg.style.display = stockOn ? "" : "none";
  if (mg) mg.style.display = stockOn ? "" : "none";
  if (eg) eg.style.display = expiryOn ? "" : "none";
  if (pg) pg.style.display = packOn ? "" : "none";
}
function setQuickProductFeature(kind, on) {
  var btn = document.getElementById(quickFeatureBtnId(kind));
  if (btn) {
    btn.classList.toggle("on", !!on);
    btn.classList.toggle("off", !on);
  }
  syncQuickProductFeatures();
}
function toggleQuickProductFeature(kind) {
  setQuickProductFeature(kind, !isQuickFeatureOn(kind));
}
function applyQuickProductKindPreset(kind) {
  var isCard = kind === "card";
  setQuickProductFeature("stock", !isCard);
  setQuickProductFeature("expiry", !isCard);
  setQuickProductFeature("pack", !isCard);
}
window.toggleQuickProductFeature = toggleQuickProductFeature;
window.applyQuickProductKindPreset = applyQuickProductKindPreset;
window.setQuickProductFeature = setQuickProductFeature;

function calculateProductExpiryNotice() {
  var expInput = $("#pExpiryDate");
  var badge = $("#pExpiryDaysBadge");
  if (!expInput || !badge) return;
  var val = expInput.value;
  if (!val) {
    badge.style.display = "none";
    return;
  }
  var expDate = new Date(val + "T00:00:00");
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var diffTime = expDate.getTime() - today.getTime();
  var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  badge.style.display = "inline-block";
  if (diffDays < 0) {
    badge.style.background = "rgba(239, 68, 68, 0.25)";
    badge.style.color = "#f87171";
    badge.innerHTML = '<i class="fas fa-times-circle"></i> بەسەرچووە (' + Math.abs(diffDays) + ' ڕۆژ پێش ئێستا)';
  } else if (diffDays === 0) {
    badge.style.background = "rgba(239, 68, 68, 0.25)";
    badge.style.color = "#f87171";
    badge.innerHTML = '<i class="fas fa-exclamation-circle"></i> ئەمڕۆ بەسەردەچێت!';
  } else if (diffDays <= 30) {
    badge.style.background = "rgba(245, 158, 11, 0.25)";
    badge.style.color = "#fbbf24";
    badge.innerHTML = '<i class="fas fa-exclamation-triangle"></i> ماوە: ' + diffDays + ' ڕۆژ';
  } else {
    var months = (diffDays / 30.4).toFixed(1);
    badge.style.background = "rgba(16, 185, 129, 0.2)";
    badge.style.color = "#34d399";
    badge.innerHTML = '<i class="fas fa-check-circle"></i> ماوە: ' + diffDays + ' ڕۆژ (' + months + ' مانگ)';
  }
}

function openProductModal(id) {
  EDIT_PRODUCT_ID = id;
  var p = id ? DB.products.find(function (x) { return x.id === id; }) : null;
  var defaultCat = p ? productAssignValueFromProduct(p) : preferredProductAssignId();
  refreshProductCategorySelects(defaultCat);
  $("#productModalTitle").textContent = id ? "دەستکاری بەرهەم" : "زیادکردنی بەرهەم";
  $("#pName").value = p ? p.name : "";
  fillFavGroupSelect(document.getElementById("pFavCategory"), p ? getProductFavGroupId(p) : "");
  $("#pBarcode").value = p ? (p.barcode || "") : "";
  $("#pCost").value = p ? (p.cost || 0) : 0;
  $("#pPrice").value = p ? p.price : "";
  $("#pStock").value = p ? p.stock : "";
  $("#pMinAlert").value = p ? (p.minAlert || 5) : 5;
  $("#pImage").value = p ? (p.image || "") : "";
  if ($("#pCategory")) {
    $("#pCategory").value = defaultCat || "all";
    renderAssignableCategoryChips($("#pCategory"));
  }
  $("#pUnit").value = p ? (p.unit || "piece") : "piece";
  if ($("#pProductionDate")) $("#pProductionDate").value = p ? (p.productionDate || "") : "";
  $("#pExpiryDate").value = p ? (p.expiryDate || "") : "";
  $("#pBatchNumber").value = p ? (p.batchNumber || "") : "";
  setProductFeature("stock", p ? productTracksStock(p) : true);
  setProductFeature("expiry", p ? productTracksExpiry(p) : true);
  setProductFeature("pack", p ? productTracksPack(p) : true);
  var packQtyEl = $("#pPackQty"); if (packQtyEl) packQtyEl.value = p ? (p.packQty || 1) : 1;
  var packPriceEl = $("#pPackPrice"); if (packPriceEl) packPriceEl.value = p ? (p.packPrice || 0) : 0;
  var packBarcodeEl = $("#pPackBarcode"); if (packBarcodeEl) packBarcodeEl.value = p ? (p.packBarcode || "") : "";
  var packCostEl = $("#pPackCost"); if (packCostEl) packCostEl.value = p ? (p.packCost || 0) : 0;
  if (typeof PriceTools !== "undefined") {
    PriceTools.loadOfferFields(p);
  }
  updateProductProfitPreview();
  calculateProductExpiryNotice();
  var pFile = $("#pImageFile");
  if (pFile) pFile.value = "";
  updateProductImagePreview();
  var incNotice = document.getElementById("productIncompleteNotice");
  if (incNotice) {
    var showInc = !!(p && isProductIncompleteFromPos(p));
    incNotice.style.display = showInc ? "flex" : "none";
    var missEl = document.getElementById("productIncompleteMissing");
    if (missEl && showInc) {
      missEl.textContent = "نەماوە: " + productMissingPosFields(p).join("، ");
    }
  }
  showModal("productModal");
}

function updateProductProfitPreview() {
  var cost = parseFloat($("#pCost").value) || 0;
  var price = parseFloat($("#pPrice").value) || 0;
  var profit = price - cost;
  var preview = $("#pProfitPreview");
  if (!preview) return;
  if (price > 0 && cost > 0) {
    var pct = cost > 0 ? ((profit / cost) * 100).toFixed(1) : "0";
    var color = profit >= 0 ? "var(--success)" : "var(--danger)";
    preview.innerHTML = 'قازانج: <strong style="color:' + color + '">' + Number(profit).toLocaleString("en-US") + ' د.ع</strong> (' + pct + '%)';
    preview.style.color = "";
    preview.style.borderRight = "3px solid " + color;
  } else {
    preview.innerHTML = 'قازانج = نرخی فرۆشتن - نرخی کڕین';
    preview.style.color = "var(--text-muted)";
    preview.style.borderRight = "3px solid var(--border-color)";
  }
}

function editProduct(id) { openProductModal(id); }

function saveProduct() {
  var name = $("#pName").value.trim();
  var price = parseFloat($("#pPrice").value);
  var cost = parseFloat($("#pCost").value) || 0;
  var unit = $("#pUnit").value || "piece";
  var trackStock = isProductFeatureOn("stock") ? 1 : 0;
  var trackExpiry = isProductFeatureOn("expiry") ? 1 : 0;
  var trackPack = isProductFeatureOn("pack") ? 1 : 0;
  var productionDate = trackExpiry && $("#pProductionDate") ? $("#pProductionDate").value : null;
  var expiryDate = trackExpiry ? ($("#pExpiryDate").value || null) : null;
  var batchNumber = trackExpiry ? ($("#pBatchNumber").value.trim() || null) : null;
  var packQty = trackPack ? (parseFloat($("#pPackQty") ? $("#pPackQty").value : 1) || 1) : 1;
  var packPrice = trackPack ? (parseFloat($("#pPackPrice") ? $("#pPackPrice").value : 0) || 0) : 0;
  var packBarcode = trackPack ? normalizeScannedCode($("#pPackBarcode") ? $("#pPackBarcode").value : "") : "";
  var packCost = trackPack ? (parseFloat($("#pPackCost") ? $("#pPackCost").value : 0) || 0) : 0;

  if (!name || (!price && price !== 0)) { toast("هەڵە", "ناو و نرخی فرۆشتن داواکراون", "error"); return; }
  if (cost < 0 || price < 0) { toast("هەڵە", "نرخ نابێت لە سفر کەمتر بێت", "error"); return; }
  var picked = readProductAssignChoice($("#pCategory") ? $("#pCategory").value : "all");
  var catId = picked.cat || "";
  var favPick = readFavGroupSelect("pFavCategory");
  if (picked.origin === "fav" && !favPick) {
    var favG = (typeof ensureDefaultFavCategory === "function") ? ensureDefaultFavCategory() : null;
    favPick = favG && favG.id ? favG.id : "";
  }

  var offerRead = (typeof PriceTools !== "undefined") ? PriceTools.readOfferFields(price) : { ok: true, untouched: true };
  if (!offerRead.ok) {
    toast("هەڵەی ئۆفەر", offerRead.msg, "error");
    return;
  }

  var imageUrl = $("#pImage").value.trim();
  var fileInput = $("#pImageFile");
  if (fileInput && fileInput.files && fileInput.files[0]) {
    var reader = new FileReader();
    reader.onload = function (e) {
      imageUrl = e.target.result;
      finalizeSave();
    };
    reader.readAsDataURL(fileInput.files[0]);
  } else {
    finalizeSave();
  }

  function finalizeSave() {
    var savedId = EDIT_PRODUCT_ID;
    if (EDIT_PRODUCT_ID) {
      var p = DB.products.find(function (x) { return x.id === EDIT_PRODUCT_ID; });
      if (p) {
        p.name = name;
        p.price = price;
        p.cost = cost;
        p.barcode = normalizeScannedCode($("#pBarcode").value);
        p.trackStock = trackStock;
        p.trackExpiry = trackExpiry;
        p.trackPack = trackPack;
        p.stock = trackStock ? (parseInt($("#pStock").value) || 0) : (p.stock || 0);
        p.minAlert = trackStock ? (parseInt($("#pMinAlert").value) || 5) : (p.minAlert || 0);
        p.image = imageUrl;
        p.cat = catId;
        p.unit = unit;
        p.productionDate = productionDate;
        p.expiryDate = expiryDate;
        p.batchNumber = batchNumber;
        p.packQty = packQty;
        p.packPrice = packPrice;
        p.packBarcode = normalizeScannedCode(packBarcode);
        p.packCost = packCost;
        applyFavGroupToProduct(p, favPick);
        if (!offerRead.untouched) {
          p.offerPrice = offerRead.offerPrice;
          p.offerStart = offerRead.offerStart;
          p.offerEnd = offerRead.offerEnd;
        }
      }
    } else {
      savedId = gid();
      DB.products.push({
        id: savedId,
        name: name,
        price: price,
        cost: cost,
        barcode: normalizeScannedCode($("#pBarcode").value),
        trackStock: trackStock,
        trackExpiry: trackExpiry,
        trackPack: trackPack,
        stock: trackStock ? (parseInt($("#pStock").value) || 0) : 0,
        minAlert: trackStock ? (parseInt($("#pMinAlert").value) || 5) : 0,
        image: imageUrl,
        cat: catId,
        unit: unit,
        productionDate: productionDate,
        expiryDate: expiryDate,
        batchNumber: batchNumber,
        packQty: packQty,
        packPrice: packPrice,
        packBarcode: packBarcode,
        packCost: packCost,
        offerPrice: offerRead.untouched ? 0 : (offerRead.offerPrice || 0),
        offerStart: offerRead.untouched ? null : (offerRead.offerStart || null),
        offerEnd: offerRead.untouched ? null : (offerRead.offerEnd || null),
        quickFavorite: 0,
        quickFavoriteAt: 0,
        favCatId: "",
        sortOrder: nextProductSortOrder()
      });
      applyFavGroupToProduct(DB.products[DB.products.length - 1], favPick);
    }
    DataStore.saveProducts();
    if (typeof ApiClient !== "undefined" && ApiClient.isOnline()) {
      var prodObj = DB.products.find(function (x) { return x.id === savedId; });
      if (prodObj) ApiClient.saveProduct(prodObj).catch(function () {});
    }
    storeImageForItem(savedId, imageUrl, name);
    if (typeof syncCartLinesFromProduct === "function") syncCartLinesFromProduct(savedId);
    var savedProd = DB.products.find(function (x) { return x.id === savedId; });
    var wasIncomplete = savedProd && isProductIncompleteFromPos(savedProd);
    var nowComplete = savedProd && isProductFullyFilledForPos(savedProd);
    if (nowComplete) unmarkProductIncompleteFromPos(savedId);
    hideModal("productModal");
    if (fileInput) fileInput.value = "";
    renderProducts();
    renderPosGrid();
    var gridCat = "all";
    if (picked.origin === "fav") {
      var g2 = (typeof ensureDefaultFavCategory === "function") ? ensureDefaultFavCategory() : null;
      gridCat = (typeof favTabId === "function" && g2) ? favTabId(g2.id) : "all";
    } else if (productCategoryIsReal(catId)) {
      gridCat = catId;
    }
    refreshProductCategorySelects(picked.origin === "fav" ? "fav" : (gridCat || "all"));
    POS_GRID_CATEGORY = gridCat;
    if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
    if (typeof renderProductGrid === "function") renderProductGrid(gridCat);
    if (typeof renderPosQuickRow === "function") renderPosQuickRow();
    if (typeof renderCart === "function") renderCart();
    if (typeof refreshCartItemDetailsIfOpen === "function") refreshCartItemDetailsIfOpen();
    if (wasIncomplete && nowComplete) {
      toast("سەرکەوتوو", "بەرهەم تەواو کرا و لە ئاگادارییەکان لابرا", "success");
    } else if (wasIncomplete) {
      toast("سەرکەوتوو", "بەرهەم پاشکەوت کرا. هێشتا ناو، پۆل یان نرخی کڕین تەواو نییە", "success");
    } else {
    toast("سەرکەوتوو", "بەرهەم پاشکەوت کرا", "success");
    }
  }
}

function deleteProduct(id) {
  DELETE_CALLBACK = function () {
    DB.products = DB.products.filter(function (p) { return p.id !== id; });
    delete SELECTED_PRODUCT_IDS[id];
    removeCachedImage(id);
    DataStore.saveProducts();
    if (typeof ApiClient !== "undefined" && ApiClient.isOnline()) {
      ApiClient.deleteProduct(id).catch(function () {});
    }
    unmarkProductIncompleteFromPos(id);
    markDemoCatalogClearedIfEmpty();
    renderProducts();
    if (typeof renderProductGrid === "function") renderProductGrid(POS_GRID_CATEGORY);
    if (typeof renderPosQuickRow === "function") renderPosQuickRow();
    toast("سەرکەوتوو", "بەرهەم سڕایەوە", "success");
  };
  $("#deleteModalText").textContent = "ئایا دەتەوێت ئەم بەرهەمە بسڕیتەوە؟";
  showModal("deleteModal");
}

function getAssignableCategories() {
  return getCashierCategories().filter(function (c) {
    return c && c.id && productCategoryIsReal(c.id);
  });
}

function isProductCategorySelect(sel) {
  if (!sel || !sel.id) return false;
  return sel.id === "pCategory" || sel.id === "quickProdCategory" || sel.id === "newBcCategory";
}

function preferredProductAssignId() {
  var cur = (typeof POS_GRID_CATEGORY !== "undefined") ? String(POS_GRID_CATEGORY || "all") : "all";
  if (cur === "all") return "all";
  if (typeof isFavTabId === "function" && isFavTabId(cur)) return "fav";
  if (cur === "fav" || cur === "origin_fav") return "fav";
  if (productCategoryIsReal(cur)) return cur;
  return "all";
}

function productAssignValueFromProduct(p) {
  if (p && productCategoryIsReal(p.cat)) return p.cat;
  if (p && typeof isProductQuickFavorite === "function" && isProductQuickFavorite(p)) return "fav";
  return "all";
}

function readProductAssignChoice(raw) {
  var v = String(raw || "").trim();
  if (!v || v === "all" || v === "origin_all" || v === "__origin_all__") {
    return { cat: "", origin: "all" };
  }
  if (v === "fav" || v === "origin_fav" || v === "__origin_fav__" || (typeof isFavTabId === "function" && isFavTabId(v))) {
    return { cat: "", origin: "fav" };
  }
  if (productCategoryIsReal(v)) return { cat: v, origin: "" };
  return { cat: "", origin: "all" };
}

function renderAssignableCategoryChips(sel) {
  if (!sel || !sel.parentNode) return;
  var box = sel.parentNode.querySelector(".pos-assign-cat-chips");
  if (!box) {
    box = document.createElement("div");
    box.className = "pos-assign-cat-chips";
    sel.parentNode.insertBefore(box, sel);
  }
  var allTab = (typeof getOriginTab === "function") ? getOriginTab("all") : { name: "هەموو" };
  var favTab = (typeof getOriginTab === "function") ? getOriginTab("fav") : { name: "دڵخواز" };
  var cats = getAssignableCategories();
  var cur = String(sel.value || "all");
  function chip(id, name, extra) {
    var on = String(id) === cur ? " is-on" : "";
    return '<button type="button" class="pos-assign-cat-chip' + (extra ? " " + extra : "") + on + '" data-assign-cat="' + String(id).replace(/"/g, "") + '">' +
      String(name || id).replace(/</g, "") + "</button>";
  }
  var html = chip("all", allTab.name || "هەموو", "is-origin-all");
  html += chip("fav", favTab.name || "دڵخواز", "is-origin-fav");
  cats.forEach(function (c) {
    html += chip(c.id, c.name || c.id, "is-real-cat");
  });
  box.innerHTML = html;
  box.querySelectorAll("[data-assign-cat]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      sel.value = btn.getAttribute("data-assign-cat") || "all";
      box.querySelectorAll("[data-assign-cat]").forEach(function (b) {
        b.classList.toggle("is-on", b === btn);
      });
    });
  });
}

function fillCategorySelectEl(sel, preferredId, includeAll) {
  if (!sel) return;
  var realCats = getAssignableCategories();
  var cur = preferredId || sel.value;
  if (isProductCategorySelect(sel)) {
    var allTab = (typeof getOriginTab === "function") ? getOriginTab("all") : { name: "هەموو" };
    var favTab = (typeof getOriginTab === "function") ? getOriginTab("fav") : { name: "دڵخواز" };
    sel.innerHTML = '<option value="all">' + String(allTab.name || "هەموو").replace(/</g, "") + "</option>" +
      '<option value="fav">' + String(favTab.name || "دڵخواز").replace(/</g, "") + "</option>";
    realCats.forEach(function (c) {
      var opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
    var pick = String(cur || "all");
    if (productCategoryIsReal(pick) || pick === "all" || pick === "fav") sel.value = pick;
    else sel.value = "all";
    renderAssignableCategoryChips(sel);
    return;
  }
  if (includeAll) {
    sel.innerHTML = '<option value="all">هەموو پۆلەکان</option>';
  } else if (!realCats.length) {
    sel.innerHTML = '<option value="">پۆل نییە — پۆلی نوێ زیاد بکە</option>';
  } else {
    sel.innerHTML = "";
  }
  realCats.forEach(function (c) {
    var opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  if (includeAll) {
    sel.value = cur || "all";
    if (!sel.value) sel.value = "all";
  } else if (productCategoryIsReal(cur)) {
    sel.value = cur;
  } else if (sel.options.length && realCats.length) {
    sel.selectedIndex = 0;
  }
}

function refreshProductCategorySelects(preferredId) {
  fillCategorySelectEl($("#pCategory"), preferredId, false);
  fillCategorySelectEl($("#productCatFilter"), null, true);
  fillCategorySelectEl($("#quickProdCategory"), preferredId, false);
  if (typeof populateNewBcCategorySelect === "function") populateNewBcCategorySelect();
}

/* ═══ CATEGORIES ═══ */

function selectedCategoryCount() {
  return Object.keys(SELECTED_CATEGORY_IDS).length;
}

function updateCategoryBulkBar() {
  Object.keys(SELECTED_CATEGORY_IDS).forEach(function (id) {
    if (!(DB.categories || []).some(function (c) { return c.id === id; })) delete SELECTED_CATEGORY_IDS[id];
  });
  var count = selectedCategoryCount();
  var countEl = $("#categorySelectedCount");
  if (countEl) countEl.textContent = count + " هەڵبژێردراو";
  var btn = $("#deleteSelectedCategoriesBtn");
  if (btn) btn.disabled = count === 0;
  var chk = $("#selectAllCategoriesChk");
  if (chk) {
    var list = DB.categories || [];
    var allOn = list.length > 0 && list.every(function (c) { return !!SELECTED_CATEGORY_IDS[c.id]; });
    chk.checked = allOn;
    chk.indeterminate = count > 0 && !allOn;
  }
}

function toggleCategorySelected(id, on) {
  if (on) SELECTED_CATEGORY_IDS[id] = true;
  else delete SELECTED_CATEGORY_IDS[id];
  var row = document.querySelector('tr.cat-row[data-cat-id="' + id + '"]');
  if (row) row.classList.toggle("is-selected", !!on);
  updateCategoryBulkBar();
}

function toggleSelectAllCategories(on) {
  getCashierCategories().forEach(function (c) {
    if (on) SELECTED_CATEGORY_IDS[c.id] = true;
    else delete SELECTED_CATEGORY_IDS[c.id];
  });
  renderCategories();
}

function deleteSelectedCategories() {
  var ids = Object.keys(SELECTED_CATEGORY_IDS).filter(function (id) { return !originKeyFromEditId(id); });
  if (ids.length === 0) {
    toast("ئاگاداری", "سەرەتا هەڵبژاردنی هەموو بگرە، یان پۆل هەڵبژێرە", "warning");
    return;
  }
  DELETE_CALLBACK = function () {
    var gone = {};
    ids.forEach(function (id) { gone[id] = true; });
    DB.categories = (DB.categories || []).filter(function (c) { return !gone[c.id]; });
    (DB.products || []).forEach(function (p) { if (gone[p.cat]) p.cat = ""; });
    ids.forEach(function (id) {
      try { removeCachedImage(id); } catch (e) {}
      if (typeof ApiClient !== "undefined" && ApiClient.isOnline()) {
        ApiClient.deleteCategory(id).catch(function () {});
      }
    });
    SELECTED_CATEGORY_IDS = {};
    DataStore.saveCategories();
    DataStore.saveProducts();
    if ((DB.categories || []).length === 0 && (DB.products || []).length === 0) markDemoCatalogClearedIfEmpty();
    renderCategories();
    renderPosCategories();
    refreshProductCategorySelects();
    if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
    if (typeof renderProductGrid === "function") renderProductGrid(POS_GRID_CATEGORY);
    try { renderProducts(); } catch (e) {}
    toast("سەرکەوتوو", ids.length + " پۆل سڕایەوە", "success");
  };
  var msgEl = $("#deleteModalText");
  if (msgEl) msgEl.textContent = ids.length + " پۆلی هەڵبژێردراو بسڕدرێتەوە؟";
  showModal("deleteModal");
}
window.toggleCategorySelected = toggleCategorySelected;
window.toggleSelectAllCategories = toggleSelectAllCategories;
window.deleteSelectedCategories = deleteSelectedCategories;

function originKeyFromEditId(id) {
  var s = String(id || "");
  if (s === "__origin_all__" || s === "all" || s === "origin_all") return "all";
  if (s === "__origin_fav__" || s === "fav" || s === "origin_fav") return "fav";
  return "";
}

function getOriginTab(key) {
  key = key === "fav" ? "fav" : "all";
  var defaults = {
    all: { name: "هەموو", icon: "fa-th-large", color: "#10b981" },
    fav: { name: "دڵخواز", icon: "fa-star", color: "#fbbf24" }
  };
  var d = defaults[key];
  var saved = {};
  try {
    saved = (typeof DB !== "undefined" && DB.settings && DB.settings.originTabs && DB.settings.originTabs[key]) || {};
  } catch (e) {}
  var name = String(saved.name || d.name).trim() || d.name;
  return {
    id: key === "fav" ? "origin_fav" : "origin_all",
    key: key,
    origin: true,
    name: name,
    image: saved.image || "",
    icon: saved.icon || d.icon,
    color: saved.color || d.color
  };
}

function saveOriginTabAppearance(key, data) {
  key = key === "fav" ? "fav" : "all";
  if (typeof DB === "undefined") return;
  if (!DB.settings) DB.settings = {};
  DB.settings.originTabs = DB.settings.originTabs || {};
  DB.settings.originTabs[key] = {
    name: String((data && data.name) || "").trim() || getOriginTab(key).name,
    image: (data && data.image) || "",
    icon: (data && data.icon) || (key === "fav" ? "fa-star" : "fa-th-large"),
    color: (data && data.color) || (key === "fav" ? "#fbbf24" : "#10b981")
  };
  try { if (typeof DataStore !== "undefined" && DataStore.saveSettings) DataStore.saveSettings(); } catch (e) {}
  if (key === "fav") {
    var g = (typeof ensureDefaultFavCategory === "function") ? ensureDefaultFavCategory() : null;
    if (g) {
      g.name = DB.settings.originTabs.fav.name;
      var list = getFavCategories();
      DB.settings.favCategories = list.map(function (x) { return x.id === g.id ? g : x; });
      try { saveFavCategories(); } catch (e2) {}
    }
  }
}

function buildOriginCategoryRowHtml(key) {
  var o = getOriginTab(key);
  var vis = isPosTabVisible(key);
  var count = 0;
  if (key === "all") count = (DB.products || []).length;
  else count = (DB.products || []).filter(function (p) {
    return typeof isProductQuickFavorite === "function" ? isProductQuickFavorite(p) : !!p.quickFavorite;
  }).length;
  var name = String(o.name || "").replace(/</g, "");
  return '<tr class="cat-row is-origin" data-origin-key="' + key + '">' +
    '<td class="cat-td-check"><span class="cat-lock-dot" title="ناسڕدرێتەوە"><i class="fas fa-lock"></i></span></td>' +
    '<td class="cat-td-sort"><span class="cat-no-sort" title="ڕیز ناکرێت">—</span></td>' +
    '<td class="cat-td-icon"><div class="cat-td-icon-inner">' + buildCategoryMediaHtml(o, "lux-media-tile-md") + '</div></td>' +
    '<td class="cat-td-name">' + name + ' <small class="cat-origin-tag">جێگیر</small></td>' +
    '<td class="cat-td-products"><span class="cat-count-badge">' + count + '</span></td>' +
    '<td class="cat-td-actions"><div class="cat-actions-row">' +
      '<button class="btn-outline btn-icon' + (vis ? " is-pos-on" : "") + '" onclick="togglePosTabVisible(\'' + key + '\')" title="' + (vis ? "شاردنەوە لە کاشێر" : "پیشاندان لە کاشێر") + '"><i class="fas ' + (vis ? "fa-eye" : "fa-eye-slash") + '"></i></button>' +
      '<button class="btn-outline btn-icon" onclick="openCategoryModal(\'__origin_' + key + '__\')" title="دەستکاری ناو و وێنە"><i class="fas fa-edit"></i></button>' +
    '</div></td></tr>';
}
window.getOriginTab = getOriginTab;
window.originKeyFromEditId = originKeyFromEditId;

function renderCategories() {
  var grid = $("#categoriesGrid"); if (!grid) return;
  if (window.__catRenderLock) return;
  window.__catRenderLock = true;
  try {
  var cats = getCashierCategories();
  var originRows = buildOriginCategoryRowHtml("all") + buildOriginCategoryRowHtml("fav");
  var rows = cats.map(function (c, idx) {
        var prodCount = (DB.products || []).filter(function (p) { return p.cat === c.id; }).length;
        var iconHtml = buildCategoryMediaHtml(c, "lux-media-tile-md");
        var checked = SELECTED_CATEGORY_IDS[c.id] ? " checked" : "";
        var selectedClass = SELECTED_CATEGORY_IDS[c.id] ? " is-selected" : "";
        var upDis = idx === 0 ? " disabled" : "";
        var downDis = idx === cats.length - 1 ? " disabled" : "";
        return '<tr class="cat-row' + selectedClass + '" data-cat-id="' + c.id + '" data-sort-id="' + c.id + '" data-sort-kind="categories">' +
          '<td class="cat-td-check"><input type="checkbox" class="cat-pick-input"' + checked + ' onchange="toggleCategorySelected(\'' + c.id + '\', this.checked)"></td>' +
          '<td class="cat-td-sort">' +
            '<input type="number" class="sort-num-input cat-sort-num" min="1" inputmode="numeric" value="' + (idx + 1) + '" title="ژمارەی ڕیز" onchange="applySortNumber(\'categories\',\'' + c.id + '\',this.value)" onclick="event.stopPropagation()">' +
            '<button type="button" class="cat-sort-btn" onclick="moveCategory(\'' + c.id + '\',-1)"' + upDis + ' title="سەرەوە"><i class="fas fa-chevron-up"></i></button>' +
            '<span class="cat-drag-handle" data-sort-handle title="دەستت لێبدە و ڕاکێشە"><i class="fas fa-grip-vertical"></i></span>' +
            '<button type="button" class="cat-sort-btn" onclick="moveCategory(\'' + c.id + '\',1)"' + downDis + ' title="خوارەوە"><i class="fas fa-chevron-down"></i></button>' +
          '</td>' +
          '<td class="cat-td-icon"><div class="cat-td-icon-inner">' + iconHtml + '</div></td>' +
          '<td class="cat-td-name">' + c.name + '</td>' +
          '<td class="cat-td-products"><span class="cat-count-badge">' + prodCount + '</span></td>' +
          '<td class="cat-td-actions"><div class="cat-actions-row">' +
            '<button class="btn-outline btn-icon' + (isPosTabVisible(c.id) ? " is-pos-on" : "") + '" onclick="togglePosTabVisible(\'' + c.id + '\')" title="' + (isPosTabVisible(c.id) ? "شاردنەوە لە کاشێر" : "پیشاندان لە کاشێر") + '"><i class="fas ' + (isPosTabVisible(c.id) ? "fa-eye" : "fa-eye-slash") + '"></i></button>' +
            '<button class="btn-outline btn-icon" onclick="openCategoryModal(\'' + c.id + '\')"><i class="fas fa-edit"></i></button><button class="btn-outline btn-icon" style="color:var(--danger)" onclick="deleteCategory(\'' + c.id + '\')"><i class="fas fa-trash"></i></button></div></td></tr>';
  }).join("");
  var allOn = cats.length > 0 && cats.every(function (c) { return !!SELECTED_CATEGORY_IDS[c.id]; });
  grid.innerHTML = '<div class="cat-header"><div class="cat-header-info"><h2><i class="fas fa-tags"></i> ' + (cats.length + 2) + ' پۆل</h2><p class="cat-sort-hint">هەموو و دڵخواز دەستکاری دەکرێن. سڕینەوە و ڕیزکردن تەنها بۆ پۆلەکانی ترە.</p></div><div class="cat-header-actions"><label class="catalog-select-all"><input type="checkbox" id="selectAllCategoriesChk"' + (allOn ? " checked" : "") + ' onchange="toggleSelectAllCategories(this.checked)"><span>هەڵبژاردنی هەموو</span></label><button type="button" class="btn btn-danger btn-sm" id="deleteSelectedCategoriesBtn" onclick="deleteSelectedCategories()"' + (selectedCategoryCount() ? "" : " disabled") + '><i class="fas fa-trash"></i> سڕینەوەی هەڵبژێردراو</button><span class="catalog-selected-count" id="categorySelectedCount">' + selectedCategoryCount() + ' هەڵبژێردراو</span><button class="btn btn-primary btn-sm" onclick="openCategoryModal()"><i class="fas fa-plus"></i> زیادکردنی پۆل</button></div></div><div class="cat-table-wrap"><table class="cat-table"><thead><tr><th class="cat-td-check"></th><th class="cat-td-sort">ڕیز</th><th class="cat-td-icon">ئایکۆن</th><th class="cat-th-sort" onclick="sortCategoriesBy(\'name\')">ناو <i class="fas fa-sort"></i></th><th class="cat-td-products cat-th-sort" onclick="sortCategoriesBy(\'count\')">بەرهەمەکان <i class="fas fa-sort"></i></th><th class="cat-td-actions">کردارەکان</th></tr></thead><tbody class="cat-locked-body">' + originRows + '</tbody><tbody data-sort-kind="categories">' + rows + '</tbody></table></div>';
  updateCategoryBulkBar();
  } finally {
    window.__catRenderLock = false;
  }
}

function openCategoryModal(id) {
  EDIT_CATEGORY_ID = id || null;
  var originKey = originKeyFromEditId(EDIT_CATEGORY_ID);
  var c = null;
  if (originKey) {
    c = getOriginTab(originKey);
    $("#categoryModalTitle").textContent = "دەستکاری دوگمە";
  } else {
    $("#categoryModalTitle").textContent = id ? "دەستکاری پۆل" : "زیادکردنی پۆل";
    c = id ? DB.categories.find(function (x) { return x.id === id; }) : null;
  }
  $("#catName").value = c ? c.name : "";
  $("#catImage").value = c ? (c.image || "") : "";
  $("#catIcon").value = c ? (c.icon || (originKey === "fav" ? "fa-star" : "fa-tag")) : "fa-tag";
  $("#catColor").value = c ? (c.color || (originKey === "fav" ? "#fbbf24" : "#6366f1")) : "#6366f1";
  var catFile = $("#catImageFile");
  if (catFile) catFile.value = "";
  updateCatPreview();
  showModal("categoryModal");
}

function paintLuxPreviewFrame(frame, src, icon, color) {
  if (!frame) return;
  color = color || "#6366f1";
  if (src) {
    frame.className = "lux-media-tile lux-media-tile-xl";
    frame.style.background = "";
    frame.style.color = "";
    frame.innerHTML = '<img class="lux-fill-img" src="' + src + '" alt="">';
    return;
  }
  frame.className = "lux-media-tile lux-media-tile-xl lux-media-tile-icon";
  frame.style.background = "linear-gradient(160deg," + color + "66," + color + "18)";
  frame.style.color = color;
  frame.style.boxShadow = "inset 0 0 0 1px " + color + "55";
  frame.innerHTML = '<i class="fas ' + normalizeFaIcon(icon) + '"></i>';
}

function updateCatPreview() {
  var icon = $("#catIcon") ? $("#catIcon").value : "fa-tag";
  var name = $("#catName") ? $("#catName").value : "پۆل";
  var color = $("#catColor") ? $("#catColor").value : "#6366f1";
  var image = $("#catImage") ? $("#catImage").value.trim() : "";
  var fileInput = $("#catImageFile");
  var frame = $("#catPreviewFrame") || $("#catPreviewIcon");
  var previewName = $("#catPreviewName");
  function paint(src) { paintLuxPreviewFrame(frame, src, icon, color); }
  if (fileInput && fileInput.files && fileInput.files[0]) {
    var reader = new FileReader();
    reader.onload = function (e) { paint(e.target.result); };
    reader.readAsDataURL(fileInput.files[0]);
  } else if (hasUserImage(image)) {
    var originKeyPrev = originKeyFromEditId(EDIT_CATEGORY_ID);
    var imgId = originKeyPrev ? getOriginTab(originKeyPrev).id : EDIT_CATEGORY_ID;
    paint(imgId ? getImageSrc(imgId, image) : image);
  } else {
    paint("");
  }
  if (previewName) { previewName.textContent = name || "پۆل"; previewName.style.color = color || "#6366f1"; }
}

function updateProductImagePreview() {
  var frame = $("#pImagePreviewFrame");
  var empty = $("#pImagePreviewEmpty");
  var fileInput = $("#pImageFile");
  var url = ($("#pImage") && $("#pImage").value) ? $("#pImage").value.trim() : "";
  function show(src) {
    if (!frame) return;
    frame.className = "lux-media-tile lux-media-tile-xl";
    frame.innerHTML = '<img class="lux-fill-img" src="' + src + '" alt="">';
    if (empty) empty.style.display = "none";
  }
  function hide() {
    if (!frame) return;
    frame.className = "lux-media-tile lux-media-tile-xl lux-media-tile-icon";
    frame.style.background = "";
    frame.style.color = "";
    frame.innerHTML = '<span id="pImagePreviewEmpty" class="lux-media-fallback"><i class="fas fa-image"></i></span>';
  }
  if (fileInput && fileInput.files && fileInput.files[0]) {
    var reader = new FileReader();
    reader.onload = function (e) { show(e.target.result); };
    reader.readAsDataURL(fileInput.files[0]);
    return;
  }
  if (hasUserImage(url)) {
    show(EDIT_PRODUCT_ID ? getImageSrc(EDIT_PRODUCT_ID, url) : url);
    return;
  }
  if (EDIT_PRODUCT_ID) {
    var p = DB.products.find(function (x) { return x.id === EDIT_PRODUCT_ID; });
    if (p && (hasUserImage(p.image) || getCachedImage(p.id))) {
      show(getImageSrc(p.id, p.image));
      return;
    }
  }
  hide();
}

function saveCategory() {
  var name = $("#catName").value.trim();
  if (!name) { toast("هەڵە", "ناو داواکراوە", "error"); return; }

  var imageUrl = $("#catImage").value.trim();
  var fileInput = $("#catImageFile");
  if (fileInput && fileInput.files && fileInput.files[0]) {
    var reader = new FileReader();
    reader.onload = function (e) {
      imageUrl = e.target.result;
      finalizeCatSave();
    };
    reader.readAsDataURL(fileInput.files[0]);
  } else {
    finalizeCatSave();
  }

  function finalizeCatSave() {
    var originKey = originKeyFromEditId(EDIT_CATEGORY_ID);
    if (originKey) {
      var o = getOriginTab(originKey);
      saveOriginTabAppearance(originKey, {
        name: name,
        image: imageUrl,
        icon: $("#catIcon").value.trim() || o.icon,
        color: $("#catColor").value || o.color
      });
      storeImageForItem(o.id, imageUrl, name);
      hideModal("categoryModal");
      if (fileInput) fileInput.value = "";
      renderCategories();
      if (typeof refreshPosCategoryTabsNow === "function") refreshPosCategoryTabsNow();
      else if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
      if (typeof renderPosTabVisChips === "function") renderPosTabVisChips();
      if (typeof renderProductGrid === "function") renderProductGrid(POS_GRID_CATEGORY);
      toast("سەرکەوتوو", "دوگمەکە نوێکرایەوە", "success");
      return;
    }
    var savedId = EDIT_CATEGORY_ID;
    if (EDIT_CATEGORY_ID) {
      var c = DB.categories.find(function (x) { return x.id === EDIT_CATEGORY_ID; });
      if (c) { c.name = name; c.image = imageUrl; c.icon = $("#catIcon").value.trim() || "fa-tag"; c.color = $("#catColor").value; }
    } else {
      savedId = gid();
      DB.categories.push({ id: savedId, name: name, image: imageUrl, icon: $("#catIcon").value.trim() || "fa-tag", color: $("#catColor").value, sortOrder: nextCategorySortOrder() });
    }
    DataStore.saveCategories();
    if (typeof ApiClient !== "undefined" && ApiClient.isOnline()) {
      var catObj = DB.categories.find(function (x) { return x.id === savedId; });
      if (catObj) ApiClient.saveCategory(catObj).catch(function () {});
    }
    storeImageForItem(savedId, imageUrl, name);
    hideModal("categoryModal");
    if (fileInput) fileInput.value = "";
    try { repairOrphanProductCategories(); } catch (eRep) {}
    renderCategories();
    renderPosCategories();
    refreshProductCategorySelects(savedId);
    if (typeof refreshPosCategoryTabsNow === "function") refreshPosCategoryTabsNow();
    else if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
    if (typeof renderPosTabVisChips === "function") renderPosTabVisChips();
    if (typeof renderProductGrid === "function") renderProductGrid(POS_GRID_CATEGORY);
    toast("سەرکەوتوو", "پۆل پاشکەوت کرا", "success");
  }
}

function deleteCategory(id) {
  if (originKeyFromEditId(id) || id === "all" || id === "fav") {
    toast("ئاگاداری", "ئەم دوگمەیە ناتوانرێت بسڕدرێتەوە", "warning");
    return;
  }
  DELETE_CALLBACK = function () {
    DB.categories = DB.categories.filter(function (c) { return c.id !== id; });
    removeCachedImage(id);
    DB.products.forEach(function (p) { if (p.cat === id) p.cat = ""; });
    DataStore.saveCategories();
    DataStore.saveProducts();
    if (typeof ApiClient !== "undefined" && ApiClient.isOnline()) {
      ApiClient.deleteCategory(id).catch(function () {});
    }
    renderCategories(); renderPosCategories();
    refreshProductCategorySelects();
    if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
    if (typeof renderProductGrid === "function") renderProductGrid(POS_GRID_CATEGORY);
    try { renderProducts(); } catch (e) {}
    toast("سەرکەوتوو", "پۆل سڕایەوە", "success");
  };
  $("#deleteModalText").textContent = "ئایا دەتەوێت ئەم پۆلە بسڕیتەوە؟";
  showModal("deleteModal");
}


/* ═══ INVENTORY ═══ */

function renderInventory() {
  var products = DB.products;
  var tracked = products.filter(productTracksStock);
  var totalItems = tracked.reduce(function (s, p) { return s + (p.stock || 0); }, 0);
  var lowCount = tracked.filter(function (p) { return p.stock <= (p.minAlert || 5) && p.stock > 0; }).length;
  var outCount = tracked.filter(function (p) { return p.stock <= 0; }).length;
  var totalValue = tracked.reduce(function (s, p) { return s + (p.price * (p.stock || 0)); }, 0);
  var statsHtml = '<div class="stat-card accent"><div class="stat-icon"><i class="fas fa-boxes"></i></div><div class="stat-label">کۆی بەرهەمەکان</div><div class="stat-value">' + products.length + '</div></div>';
  statsHtml += '<div class="stat-card success"><div class="stat-icon"><i class="fas fa-cubes"></i></div><div class="stat-label">کۆی بڕگەکان</div><div class="stat-value">' + totalItems + '</div></div>';
  statsHtml += '<div class="stat-card ' + (lowCount > 0 ? "warning" : "success") + '"><div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div><div class="stat-label">کۆگای کەم</div><div class="stat-value">' + lowCount + '</div></div>';
  statsHtml += '<div class="stat-card ' + (outCount > 0 ? "danger" : "success") + '"><div class="stat-icon"><i class="fas fa-times-circle"></i></div><div class="stat-label">نەماوە</div><div class="stat-value">' + outCount + '</div></div>';
  statsHtml += '<div class="stat-card info"><div class="stat-icon"><i class="fas fa-coins"></i></div><div class="stat-label">نرخی گشتی</div><div class="stat-value">' + fmt(totalValue) + '</div></div>';
  var invStats = $("#inventoryStats"); if (invStats) invStats.innerHTML = statsHtml;
  renderInventoryTable(products);
  renderStockAlerts();
}

function renderInventoryTable(products) {
  var tbody = $("#inventoryTable tbody"); if (!tbody) return;
  var sorted = products.slice().sort(function (a, b) {
    var aTrack = productTracksStock(a);
    var bTrack = productTracksStock(b);
    var aC = !aTrack ? 3 : a.stock <= 0 ? 0 : a.stock <= (a.minAlert || 5) ? 1 : 2;
    var bC = !bTrack ? 3 : b.stock <= 0 ? 0 : b.stock <= (b.minAlert || 5) ? 1 : 2;
    if (aC !== bC) return aC - bC;
    return a.name.localeCompare(b.name, "ku");
  });
  tbody.innerHTML = sorted.map(function (p) {
    var tracks = productTracksStock(p);
    var isOut = tracks && p.stock <= 0;
    var isLow = tracks && !isOut && p.stock <= (p.minAlert || 5);
    var rowClass = isOut ? "inv-row-danger" : isLow ? "inv-row-warning" : "";
    var statusClass = !tracks ? "badge-info" : isOut ? "badge-danger" : isLow ? "badge-warning" : "badge-success";
    var statusText = !tracks ? "بێ کۆگا" : isOut ? "نەماوە" : isLow ? "کەم" : "باشە";
    var cost = p.cost || 0;
    var profit = p.price - cost;
    var profitPct = cost > 0 ? ((profit / cost) * 100).toFixed(1) : "0";
    var profitColor = profit >= 0 ? "var(--success)" : "var(--danger)";
    var stockDisplay = tracks ? ('<strong>' + p.stock + '</strong>') : '<span style="color:var(--text-muted);">—</span>';
    if (tracks && p.packQty > 1) {
      var cartons = Math.floor(p.stock / p.packQty);
      var loose = p.stock % p.packQty;
      stockDisplay += ' <span style="font-size:0.72rem;color:var(--text-muted);display:block;">(' + cartons + ' ک + ' + loose + ' د)</span>';
    }
    return '<tr class="' + rowClass + '"><td><strong>' + p.name + '</strong></td><td style="color:var(--danger);font-size:0.8rem;">' + fmt(cost) + '</td><td>' + fmt(p.price) + '</td><td>' + stockDisplay + '</td><td style="color:' + profitColor + ';font-weight:700;font-size:0.8rem;" title="' + profitPct + '%">' + fmt(profit) + ' <span style="font-size:0.65rem;opacity:0.7;">(' + profitPct + '%)</span></td><td><span class="badge ' + statusClass + '">' + statusText + '</span></td><td><button class="btn btn-sm btn-outline" title="چاپی لەزگە و باڕکۆد" onclick="openBarcodeStudioForProduct(\'' + p.id + '\')"><i class="fas fa-barcode"></i></button> <button class="btn btn-sm btn-outline" onclick="editProduct(\'' + p.id + '\')"><i class="fas fa-edit"></i></button></td></tr>';
  }).join("");
}

function filterInventory() {
  var search = ($("#inventorySearch") ? $("#inventorySearch").value : "").toLowerCase();
  var filtered = search ? DB.products.filter(function (p) { return p.name.toLowerCase().indexOf(search) !== -1 || String(p.barcode).indexOf(search) !== -1; }) : DB.products;
  renderInventoryTable(filtered);
}

/* ═══ REPORTS ═══ */

function renderReports() {
  var orders = incomeOrders(DB.orders || []);
  var today = new Date().toISOString().slice(0, 10);
  var todayOrders = orders.filter(function (o) { return o.date && o.date.indexOf(today) === 0; });
  var todaySales = todayOrders.reduce(function (s, o) { return s + (o.total || 0); }, 0);
  var todayCost = todayOrders.reduce(function (s, o) { return s + (o.totalCost || 0); }, 0);
  var todayProfit = todaySales - todayCost;
  var todayCount = todayOrders.length;
  var totalRevenue = orders.reduce(function (s, o) { return s + (o.total || 0); }, 0);
  var totalCostAll = orders.reduce(function (s, o) { return s + (o.totalCost || 0); }, 0);
  var totalProfit = totalRevenue - totalCostAll;
  var avgOrder = todayCount > 0 ? Math.round(todaySales / todayCount) : 0;
  var statsHtml = '<div class="stat-card accent"><div class="stat-icon"><i class="fas fa-calendar-day"></i></div><div class="stat-label">فرۆشتنی ئەمڕۆ</div><div class="stat-value">' + fmt(todaySales) + '</div></div>';
  statsHtml += '<div class="stat-card profit"><div class="stat-icon"><i class="fas fa-coins"></i></div><div class="stat-label">قازانجی ئەمڕۆ</div><div class="stat-value" style="color:' + (todayProfit >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + fmt(todayProfit) + '</div></div>';
  statsHtml += '<div class="stat-card success"><div class="stat-icon"><i class="fas fa-receipt"></i></div><div class="stat-label">داواکارییەکانی ئەمڕۆ</div><div class="stat-value">' + todayCount + '</div></div>';
  statsHtml += '<div class="stat-card info"><div class="stat-icon"><i class="fas fa-chart-line"></i></div><div class="stat-label">کۆی داهات</div><div class="stat-value">' + fmt(totalRevenue) + '</div></div>';
  statsHtml += '<div class="stat-card warning"><div class="stat-icon"><i class="fas fa-calculator"></i></div><div class="stat-label">ناوەندی داواکاری</div><div class="stat-value">' + fmt(avgOrder) + '</div></div>';
  statsHtml += '<div class="stat-card profit"><div class="stat-icon"><i class="fas fa-hand-holding-dollar"></i></div><div class="stat-label">کۆی قازانج</div><div class="stat-value" style="color:' + (totalProfit >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + fmt(totalProfit) + '</div></div>';
  var repStats = $("#reportsStats"); if (repStats) repStats.innerHTML = statsHtml;
  switchReportTab(window.CURRENT_REPORT_TAB || 'daily');
}

function switchReportTab(tab, btn) {
  window.CURRENT_REPORT_TAB = tab;
  $$(".report-tab").forEach(function (b) { b.classList.remove("active"); b.classList.add("btn-outline"); b.classList.remove("btn-primary"); });
  if (btn) {
    btn.classList.add("active"); btn.classList.remove("btn-outline"); btn.classList.add("btn-primary");
  } else {
    $$(".report-tab").forEach(function (b) {
      if (b.getAttribute("onclick") && b.getAttribute("onclick").indexOf("'" + tab + "'") !== -1) {
        b.classList.add("active"); b.classList.remove("btn-outline"); b.classList.add("btn-primary");
      }
    });
  }
  var container = $("#reportContent");
  if (!container) return;
  if (tab === "daily") renderDailyReport(container);
  else if (tab === "weekly") renderWeeklyReport(container);
  else if (tab === "monthly") renderMonthlyReport(container);
  else if (tab === "yearly") renderYearlyReport(container);
  else if (tab === "sales") renderSalesReport(container);
  else if (tab === "profit") renderReportsProfitTab(container);
  else if (tab === "expenses") renderExpensesReport(container);
  else if (tab === "inventory") renderInventoryReport(container);
  else if (tab === "cashier") renderCashierReport(container);
  else if (tab === "expiring") renderExpiringReport(container);
  else if (tab === "products") renderProductsReport(container);
}

function renderDailyReport(container) {
  var days = {};
  DB.orders.forEach(function (o) {
    if (!o.date) return;
    var d = o.date.slice(0, 10);
    if (!days[d]) days[d] = { sales: 0, cost: 0, profit: 0, count: 0 };
    days[d].sales += o.total || 0;
    days[d].cost += o.totalCost || 0;
    days[d].profit += (o.profit !== undefined) ? o.profit : ((o.total || 0) - (o.totalCost || 0));
    days[d].count++;
  });
  var sorted = Object.keys(days).sort().reverse();
  if (sorted.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">هیچ فرۆشتنێک نییە</div>'; return; }
  var rows = sorted.map(function (d) {
    var r = days[d];
    var profitColor = r.profit >= 0 ? 'var(--success)' : 'var(--danger)';
    return '<tr><td><strong>' + d + '</strong></td><td>' + r.count + '</td><td>' + fmt(r.sales) + '</td><td style="color:var(--danger);">-' + fmt(r.cost) + '</td><td style="color:' + profitColor + ';font-weight:800;">' + fmt(r.profit) + '</td></tr>';
  }).join("");
  var html = '<div class="table-wrap"><table class="data-table"><thead><tr><th>بەروار</th><th>داواکاری</th><th>فرۆشتن</th><th>تێچوو</th><th>قازانج</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  container.innerHTML = html;
}

function renderWeeklyReport(container) {
  var weeks = {};
  DB.orders.forEach(function (o) {
    if (!o.date) return;
    var dt = new Date(o.date);
    var dayOfWeek = dt.getDay();
    var startOfWeek = new Date(dt);
    startOfWeek.setDate(dt.getDate() - dayOfWeek);
    var weekKey = startOfWeek.toISOString().slice(0, 10);
    if (!weeks[weekKey]) weeks[weekKey] = { sales: 0, cost: 0, profit: 0, count: 0 };
    weeks[weekKey].sales += o.total || 0;
    weeks[weekKey].cost += o.totalCost || 0;
    weeks[weekKey].profit += (o.profit !== undefined) ? o.profit : ((o.total || 0) - (o.totalCost || 0));
    weeks[weekKey].count++;
  });
  var sorted = Object.keys(weeks).sort().reverse();
  if (sorted.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">هیچ فرۆشتنێک نییە</div>'; return; }
  var rows = sorted.map(function (wk) {
    var r = weeks[wk];
    var dt = new Date(wk);
    var endOfWeek = new Date(dt);
    endOfWeek.setDate(dt.getDate() + 6);
    var label = wk + ' → ' + endOfWeek.toISOString().slice(0, 10);
    var profitColor = r.profit >= 0 ? 'var(--success)' : 'var(--danger)';
    return '<tr><td><strong>' + label + '</strong></td><td>' + r.count + '</td><td>' + fmt(r.sales) + '</td><td style="color:var(--danger);">-' + fmt(r.cost) + '</td><td style="color:' + profitColor + ';font-weight:800;">' + fmt(r.profit) + '</td></tr>';
  }).join("");
  var html = '<div class="table-wrap"><table class="data-table"><thead><tr><th>هەفتە</th><th>داواکاری</th><th>فرۆشتن</th><th>تێچوو</th><th>قازانج</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  container.innerHTML = html;
}

function renderMonthlyReport(container) {
  var months = {};
  DB.orders.forEach(function (o) {
    if (!o.date) return;
    var monthKey = o.date.slice(0, 7);
    if (!months[monthKey]) months[monthKey] = { sales: 0, cost: 0, profit: 0, count: 0 };
    months[monthKey].sales += o.total || 0;
    months[monthKey].cost += o.totalCost || 0;
    months[monthKey].profit += (o.profit !== undefined) ? o.profit : ((o.total || 0) - (o.totalCost || 0));
    months[monthKey].count++;
  });
  var sorted = Object.keys(months).sort().reverse();
  if (sorted.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">هیچ فرۆشتنێک نییە</div>'; return; }
  var monthNames = ["کانوونی دووەم","شوبات","ئازار","نیسان","ئایار","حوزەیران","تەمموز","ئاب","ئەیلوول","تشرینی یەکەم","تشرینی دووەم","کانونی یەکەم"];
  var rows = sorted.map(function (mk) {
    var r = months[mk];
    var parts = mk.split("-");
    var label = monthNames[parseInt(parts[1]) - 1] + " " + parts[0];
    var profitColor = r.profit >= 0 ? 'var(--success)' : 'var(--danger)';
    return '<tr><td><strong>' + label + '</strong></td><td>' + r.count + '</td><td>' + fmt(r.sales) + '</td><td style="color:var(--danger);">-' + fmt(r.cost) + '</td><td style="color:' + profitColor + ';font-weight:800;">' + fmt(r.profit) + '</td></tr>';
  }).join("");
  var html = '<div class="table-wrap"><table class="data-table"><thead><tr><th>مانگ</th><th>داواکاری</th><th>فرۆشتن</th><th>تێچوو</th><th>قازانج</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  container.innerHTML = html;
}

function renderProductsReport(container) {
  var productStats = {};
  DB.orders.forEach(function (o) {
    if (!o.items) return;
    o.items.forEach(function (i) {
      if (!productStats[i.name]) productStats[i.name] = { qty: 0, sales: 0, cost: 0, profit: 0 };
      var itemCost = i.cost || 0;
      var itemProfit = (i.price - itemCost) * i.qty;
      productStats[i.name].qty += i.qty;
      productStats[i.name].sales += i.price * i.qty;
      productStats[i.name].cost += itemCost * i.qty;
      productStats[i.name].profit += itemProfit;
    });
  });
  var sorted = Object.keys(productStats).sort(function (a, b) { return productStats[b].profit - productStats[a].profit; });
  if (sorted.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">هیچ فرۆشتنێک نییە</div>'; return; }
  var rows = sorted.map(function (name, idx) {
    var r = productStats[name];
    var profitColor = r.profit >= 0 ? 'var(--success)' : 'var(--danger)';
    var badge = idx < 3 ? '<i class="fas fa-crown" style="color:#f59e0b;margin-left:4px;"></i>' : '';
    return '<tr><td><strong>' + (idx + 1) + '</strong></td><td>' + name + badge + '</td><td>' + r.qty + '</td><td>' + fmt(r.sales) + '</td><td style="color:var(--danger);">-' + fmt(r.cost) + '</td><td style="color:' + profitColor + ';font-weight:800;">' + fmt(r.profit) + '</td></tr>';
  }).join("");
  var html = '<div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>بەرهەم</th><th>بڕ</th><th>فرۆشتن</th><th>تێچوو</th><th>قازانج</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  container.innerHTML = html;
}

function renderYearlyReport(container) {
  var years = {};
  DB.orders.forEach(function (o) {
    if (!o.date) return;
    var y = o.date.slice(0, 4);
    if (!years[y]) years[y] = { sales: 0, cost: 0, profit: 0, count: 0 };
    years[y].sales += o.total || 0;
    years[y].cost += o.totalCost || 0;
    years[y].profit += (o.profit !== undefined) ? o.profit : ((o.total || 0) - (o.totalCost || 0));
    years[y].count++;
  });
  var sorted = Object.keys(years).sort().reverse();
  if (sorted.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">هیچ فرۆشتنێک نییە</div>'; return; }
  var rows = sorted.map(function (y) {
    var r = years[y];
    var profitColor = r.profit >= 0 ? 'var(--success)' : 'var(--danger)';
    return '<tr><td><strong>' + y + '</strong></td><td>' + r.count + '</td><td>' + fmt(r.sales) + '</td><td style="color:var(--danger);">-' + fmt(r.cost) + '</td><td style="color:' + profitColor + ';font-weight:800;">' + fmt(r.profit) + '</td></tr>';
  }).join("");
  var html = '<div class="table-wrap"><table class="data-table"><thead><tr><th>ساڵ</th><th>داواکاری</th><th>فرۆشتن</th><th>تێچوو</th><th>قازانج</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  container.innerHTML = html;
}

function renderSalesReport(container) {
  var sales = DB.orders.map(function (o) {
    return {
      id: o.id,
      date: o.date,
      cashier: o.cashier || "کاشیر",
      items: o.items ? o.items.length : 0,
      total: o.total || 0,
      profit: (o.profit !== undefined) ? o.profit : ((o.total || 0) - (o.totalCost || 0)),
      status: o.status || 'completed'
    };
  }).reverse();
  if (sales.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">هیچ فرۆشتنێک نییە</div>'; return; }
  var rows = sales.map(function (s) {
    var profitColor = s.profit >= 0 ? 'var(--success)' : 'var(--danger)';
    var dateStr = s.date ? s.date.replace("T", " ").slice(0, 16) : "";
    var actionBtn = s.status === 'cancelled'
      ? '<span style="color:var(--danger);font-weight:800;font-size:0.75rem;">[پووچەڵکراوە]</span>'
      : '<button type="button" class="btn btn-sm btn-danger" onclick="openCancelSaleModal(\'' + s.id + '\')" title="هەڵوەشاندنەوەی پسوڵە"><i class="fas fa-ban"></i> پووچەڵکردنەوە</button>';
    return '<tr><td><small>' + s.id.slice(-8).toUpperCase() + '</small></td><td>' + dateStr + '</td><td>' + s.cashier + '</td><td>' + s.items + '</td><td>' + fmt(s.total) + '</td><td style="color:' + profitColor + ';font-weight:700;">' + fmt(s.profit) + '</td><td style="text-align:center;">' + actionBtn + '</td></tr>';
  }).join("");
  var html = '<div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>بەروار</th><th>کاشیر</th><th>بڕگە</th><th>کۆی گشتی</th><th>قازانج</th><th style="text-align:center;">کردار</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  container.innerHTML = html;
}

function renderReportsProfitTab(container) {
  if (!container) container = $("#reportContent");
  if (!container) return;

  var orders = incomeOrders(branchRecords((typeof DB !== "undefined" && DB.orders) ? DB.orders : []));
  var expenses = branchRecords((typeof DB !== "undefined" && DB.expenses) ? DB.expenses : []);

  var totalSales = orders.reduce(function (s, o) { return s + (o.total || 0); }, 0);
  var totalCost = orders.reduce(function (s, o) { return s + (o.totalCost || 0); }, 0);
  var grossProfit = totalSales - totalCost;
  var totalExpenses = expenses.reduce(function (s, e) { return s + (e.amount || 0); }, 0);
  var netProfit = grossProfit - totalExpenses;
  var netMargin = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : "0.0";
  var grossMargin = totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : "0.0";
  var netColor = netProfit >= 0 ? "var(--success)" : "var(--danger)";

  var html = '<div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
    '<div><h3 style="margin:0;font-size:1.1rem;"><i class="fas fa-balance-scale" style="color:#10b981;margin-left:8px;"></i>تەرازووی قازانج و مەسروفات</h3>' +
    '<small style="color:var(--text-muted);">بەراوردی فرۆشتن، تێچووی کڕین و کۆی گشتی مەسرەفەکان</small></div>' +
    '<button type="button" class="btn btn-primary btn-sm" onclick="switchFinanceHubTab(\'balance\')" style="font-size:0.82rem;"><i class="fas fa-expand-arrows-alt"></i> تەرازووی تەواوی دارایی</button>' +
  '</div>';

  // 5 Master Cards for the tab
  html += '<div class="dash-stats" style="margin-bottom:18px;display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px;">';
  html += '<div class="stat-card accent"><div class="stat-icon"><i class="fas fa-coins"></i></div><div class="stat-label">١. کۆی فرۆشتن</div><div class="stat-value">' + fmt(totalSales) + '</div><div class="stat-hint">' + orders.length + ' پسوڵە</div></div>';
  html += '<div class="stat-card info"><div class="stat-icon"><i class="fas fa-boxes"></i></div><div class="stat-label">٢. تێچووی کاڵا (COGS)</div><div class="stat-value">-' + fmt(totalCost) + '</div><div class="stat-hint">سەرمایەی کڕینی کاڵا</div></div>';
  html += '<div class="stat-card warning"><div class="stat-icon"><i class="fas fa-chart-line"></i></div><div class="stat-label">٣. قازانجی ناپوختە</div><div class="stat-value" style="color:#f59e0b;">' + fmt(grossProfit) + '</div><div class="stat-hint">ڕێژە: ' + grossMargin + '%</div></div>';
  html += '<div class="stat-card danger"><div class="stat-icon"><i class="fas fa-receipt"></i></div><div class="stat-label">٤. کۆی مەسرەف</div><div class="stat-value" style="color:#ef4444;">-' + fmt(totalExpenses) + '</div><div class="stat-hint">' + expenses.length + ' خەرجی تۆمارکراو</div></div>';
  html += '<div class="stat-card" style="border:2px solid ' + (netProfit >= 0 ? '#10b981' : '#ef4444') + ';background:rgba(16,185,129,0.08);"><div class="stat-icon" style="color:' + netColor + ';"><i class="fas fa-gem"></i></div><div class="stat-label" style="font-weight:800;color:' + netColor + ';">٥. قازانجی سافی</div><div class="stat-value" style="color:' + netColor + ';font-weight:900;">' + fmt(netProfit) + '</div><div class="stat-hint" style="font-weight:700;">ڕێژەی سافی: ' + netMargin + '%</div></div>';
  html += '</div>';

  // Equation strip
  html += '<div class="dash-eq" style="margin-bottom:18px;">' +
    '<div><span style="color:var(--text-secondary);">فرۆشتن:</span> <strong style="color:var(--info);">' + fmt(totalSales) + '</strong></div>' +
    '<span style="color:var(--text-muted);font-weight:900;">—</span>' +
    '<div><span style="color:var(--text-secondary);">تێچووی کاڵا:</span> <strong class="dash-ink">' + fmt(totalCost) + '</strong></div>' +
    '<span style="color:var(--text-muted);font-weight:900;">=</span>' +
    '<div><span style="color:var(--text-secondary);">قازانجی ناپوختە:</span> <strong style="color:var(--warning);">' + fmt(grossProfit) + '</strong></div>' +
    '<span style="color:var(--text-muted);font-weight:900;">—</span>' +
    '<div><span style="color:var(--text-secondary);">مەسرەف:</span> <strong style="color:var(--danger);">' + fmt(totalExpenses) + '</strong></div>' +
    '<span style="color:var(--text-muted);font-weight:900;">=</span>' +
    '<div class="dash-eq-net" style="border:1px solid ' + (netProfit >= 0 ? '#10b981' : '#ef4444') + ';"><span>قازانجی سافی:</span> <strong style="color:' + netColor + ';font-weight:900;">' + fmt(netProfit) + '</strong></div>' +
  '</div>';

  // Daily Breakdown Table
  var daysMap = {};
  orders.forEach(function (o) {
    if (!o.date) return;
    var d = o.date.slice(0, 10);
    if (!daysMap[d]) daysMap[d] = { sales: 0, cost: 0, expenses: 0, count: 0 };
    daysMap[d].sales += (o.total || 0);
    daysMap[d].cost += (o.totalCost || 0);
    daysMap[d].count++;
  });
  expenses.forEach(function (e) {
    if (!e.date) return;
    var d = e.date.slice(0, 10);
    if (!daysMap[d]) daysMap[d] = { sales: 0, cost: 0, expenses: 0, count: 0 };
    daysMap[d].expenses += (e.amount || 0);
  });

  var sortedDays = Object.keys(daysMap).sort().reverse();
  var rows = "";
  if (sortedDays.length === 0) {
    rows = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">هیچ داتایەک نییە</td></tr>';
  } else {
    rows = sortedDays.slice(0, 30).map(function (d) {
      var item = daysMap[d];
      var dGross = item.sales - item.cost;
      var dNet = dGross - item.expenses;
      var dMargin = item.sales > 0 ? ((dNet / item.sales) * 100).toFixed(1) : "0.0";
      var dColor = dNet >= 0 ? "var(--success)" : "var(--danger)";
      return '<tr>' +
        '<td><strong>' + d + '</strong> <small style="color:var(--text-muted);">(' + item.count + ' پسوڵە)</small></td>' +
        '<td style="color:#38bdf8;font-weight:700;">' + fmt(item.sales) + '</td>' +
        '<td style="color:var(--text-muted);">-' + fmt(item.cost) + '</td>' +
        '<td style="color:#ef4444;font-weight:700;">-' + fmt(item.expenses) + '</td>' +
        '<td style="color:' + dColor + ';font-weight:800;">' + fmt(dNet) + '</td>' +
        '<td><span style="background:' + (dNet >= 0 ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)") + ';color:' + dColor + ';padding:2px 8px;border-radius:6px;font-weight:800;font-size:0.8rem;">' + dMargin + '%</span></td>' +
      '</tr>';
    }).join("");
  }

  html += '<div class="table-wrap"><table class="data-table"><thead><tr><th>بەروار</th><th>فرۆشتن</th><th>تێچووی کاڵا</th><th>مەسرەف</th><th>قازانجی سافی</th><th>ڕێژەی سافی</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  container.innerHTML = html;
}

function renderInventoryReport(container) {
  var products = DB.products;
  var tracked = products.filter(productTracksStock);
  var totalItems = tracked.reduce(function (s, p) { return s + (p.stock || 0); }, 0);
  var totalValue = tracked.reduce(function (s, p) { return s + (p.price * (p.stock || 0)); }, 0);
  var lowStock = tracked.filter(function (p) { return p.stock <= (p.minAlert || 5); });
  var outOfStock = tracked.filter(function (p) { return p.stock <= 0; });
  var statsHtml = '<div class="dash-stats" style="margin-bottom:20px;">';
  statsHtml += '<div class="stat-card accent"><div class="stat-icon"><i class="fas fa-boxes"></i></div><div class="stat-label">کۆی بەرهەمەکان</div><div class="stat-value">' + products.length + '</div></div>';
  statsHtml += '<div class="stat-card success"><div class="stat-icon"><i class="fas fa-cubes"></i></div><div class="stat-label">کۆی بڕگەکان</div><div class="stat-value">' + totalItems + '</div></div>';
  statsHtml += '<div class="stat-card info"><div class="stat-icon"><i class="fas fa-coins"></i></div><div class="stat-label">نرخی کۆگا</div><div class="stat-value">' + fmt(totalValue) + '</div></div>';
  statsHtml += '<div class="stat-card ' + (lowStock.length > 0 ? "warning" : "success") + '"><div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div><div class="stat-label">کۆگای کەم</div><div class="stat-value">' + lowStock.length + '</div></div>';
  statsHtml += '<div class="stat-card ' + (outOfStock.length > 0 ? "danger" : "success") + '"><div class="stat-icon"><i class="fas fa-times-circle"></i></div><div class="stat-label">نەماوە</div><div class="stat-value">' + outOfStock.length + '</div></div>';
  statsHtml += '</div>';
  var lowStockRows = lowStock.slice(0, 20).map(function (p) {
    var stockColor = p.stock <= 0 ? "var(--danger)" : "var(--warning)";
    return '<tr><td>' + p.name + '</td><td style="color:' + stockColor + ';font-weight:700;">' + p.stock + '</td><td>' + (p.minAlert || 5) + '</td><td>' + fmt(p.price) + '</td></tr>';
  }).join("");
  var tableHtml = '<h3 style="margin:20px 0 10px;">بەرهەمە کۆگای کەم</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>بەرهەم</th><th>کۆگا</th><th>ئاگاداری</th><th>نرخ</th></tr></thead><tbody>' + lowStockRows + '</tbody></table></div>';
  container.innerHTML = statsHtml + tableHtml;
}

function renderCashierReport(container) {
  var cashierStats = {};
  DB.orders.forEach(function (o) {
    var cashier = o.cashier || "کاشیر";
    if (!cashierStats[cashier]) cashierStats[cashier] = { orders: 0, total: 0, profit: 0 };
    cashierStats[cashier].orders++;
    cashierStats[cashier].total += o.total || 0;
    cashierStats[cashier].profit += (o.profit !== undefined) ? o.profit : ((o.total || 0) - (o.totalCost || 0));
  });
  var cashiers = Object.keys(cashierStats);
  if (cashiers.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">هیچ داتایەک نییە</div>'; return; }
  var rows = cashiers.map(function (c) {
    var s = cashierStats[c];
    var profitColor = s.profit >= 0 ? 'var(--success)' : 'var(--danger)';
    return '<tr><td>' + c + '</td><td>' + s.orders + '</td><td>' + fmt(s.total) + '</td><td style="color:' + profitColor + ';font-weight:700;">' + fmt(s.profit) + '</td></tr>';
  }).join("");
  var html = '<div class="table-wrap"><table class="data-table"><thead><tr><th>کاشیر</th><th>پسوڵە</th><th>کۆی گشتی</th><th>قازانج</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  container.innerHTML = html;
}

function renderExpiringReport(container) {
  var today = new Date();
  var thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(today.getDate() + 30);
  var expiringProducts = DB.products.filter(function (p) {
    if (!productTracksExpiry(p) || !p.expiryDate) return false;
    var expiryDate = new Date(p.expiryDate);
    return expiryDate >= today && expiryDate <= thirtyDaysLater;
  });
  var expiredProducts = DB.products.filter(function (p) {
    if (!productTracksExpiry(p) || !p.expiryDate) return false;
    var expiryDate = new Date(p.expiryDate);
    return expiryDate < today;
  });
  var statsHtml = '<div class="dash-stats" style="margin-bottom:20px;">';
  statsHtml += '<div class="stat-card warning"><div class="stat-icon"><i class="fas fa-calendar-times"></i></div><div class="stat-label">بەسەرچوون</div><div class="stat-value">' + expiringProducts.length + '</div></div>';
  statsHtml += '<div class="stat-card danger"><div class="stat-icon"><i class="fas fa-calendar-check"></i></div><div class="stat-label">بەسەرچوو</div><div class="stat-value">' + expiredProducts.length + '</div></div>';
  statsHtml += '</div>';
  container.innerHTML = statsHtml;
  if (expiringProducts.length > 0) {
    var rows = expiringProducts.map(function (p) {
      var expiryDate = new Date(p.expiryDate);
      var daysLeft = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      var daysColor = daysLeft <= 3 ? "var(--danger)" : (daysLeft <= 7 ? "var(--warning)" : "var(--success)");
      var dateStr = expiryDate.toLocaleDateString("en-GB");
      return '<tr><td>' + p.name + '</td><td>' + (p.batchNumber || "-") + '</td><td>' + dateStr + '</td><td style="color:' + daysColor + ';font-weight:700;">' + daysLeft + ' ڕۆژ</td><td>' + p.stock + '</td></tr>';
    }).join("");
    var tableHtml = '<h3 style="margin:20px 0 10px;">بەرهەمە بەسەرچووەکان</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>بەرهەم</th><th>بەچک</th><th>بەرواری بەسەرچوون</th><th>ڕۆژماوە</th><th>کۆگا</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    container.innerHTML += tableHtml;
  }
  if (expiredProducts.length > 0) {
    var expiredRows = expiredProducts.map(function (p) {
      var expiryDate = new Date(p.expiryDate);
      var dateStr = expiryDate.toLocaleDateString("en-GB");
      return '<tr><td>' + p.name + '</td><td>' + (p.batchNumber || "-") + '</td><td>' + dateStr + '</td><td style="color:var(--danger);font-weight:700;">بەسەرچوو</td><td>' + p.stock + '</td></tr>';
    }).join("");
    var expiredTableHtml = '<h3 style="margin:20px 0 10px;">بەرهەمە بەسەرچووەکان</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>بەرهەم</th><th>بەچک</th><th>بەرواری بەسەرچوون</th><th>دۆخ</th><th>کۆگا</th></tr></thead><tbody>' + expiredRows + '</tbody></table></div>';
    container.innerHTML += expiredTableHtml;
  }
}

function renderExpensesReport(container) {
  var expenses = DB.expenses;
  if (expenses.length === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">هیچ خەرجییەک نییە</div>'; return; }
  
  var expenseCategories = ["rent", "salary", "electricity", "internet", "transportation", "other"];
  var categoryNames = { rent: "کرێ", salary: "مووچە", electricity: "کارەبا", internet: "ئینتەرنێت", transportation: "گواستنەوە", other: "هیتر" };
  
  var categoryTotals = {};
  expenseCategories.forEach(function (cat) { categoryTotals[cat] = 0; });
  
  expenses.forEach(function (e) {
    if (e.category && categoryTotals.hasOwnProperty(e.category)) {
      categoryTotals[e.category] += e.amount || 0;
    }
  });
  
  var totalExpenses = expenses.reduce(function (s, e) { return s + (e.amount || 0); }, 0);
  
  var statsHtml = '<div class="dash-stats" style="margin-bottom:20px;">';
  statsHtml += '<div class="stat-card danger"><div class="stat-icon"><i class="fas fa-receipt"></i></div><div class="stat-label">کۆی خەرجی</div><div class="stat-value">' + fmt(totalExpenses) + '</div></div>';
  statsHtml += '<div class="stat-card info"><div class="stat-icon"><i class="fas fa-list"></i></div><div class="stat-label">تۆمارەکان</div><div class="stat-value">' + expenses.length + '</div></div>';
  statsHtml += '</div>';
  
  var catRows = expenseCategories.map(function (cat) {
    return '<tr><td>' + categoryNames[cat] + '</td><td style="color:var(--danger);font-weight:700;">' + fmt(categoryTotals[cat]) + '</td></tr>';
  }).join("");
  
  var sortedExpenses = expenses.slice().reverse();
  var expenseRows = sortedExpenses.map(function (e, i) {
    var catName = e.category ? categoryNames[e.category] || e.category : "-";
    var dateStr = e.date ? new Date(e.date).toLocaleDateString("en-US") : "-";
    return '<tr><td>' + (i + 1) + '</td><td>' + catName + '</td><td>' + (e.description || "-") + '</td><td style="color:var(--danger);font-weight:700;">' + fmt(e.amount) + '</td><td>' + dateStr + '</td></tr>';
  }).join("");
  
  var html = statsHtml;
  html += '<div style="margin-bottom:20px;"><h3>خەرجی بەپێی پۆل</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>پۆل</th><th>بڕ</th></tr></thead><tbody>' + catRows + '</tbody></table></div></div>';
  html += '<div><h3>مێژووی خەرجی</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>پۆل</th><th>وەسف</th><th>بڕ</th><th>بەروار</th></tr></thead><tbody>' + expenseRows + '</tbody></table></div></div>';
  
  container.innerHTML = html;
}

/* ═══ STOCK MANAGEMENT ═══ */

var STOCK_TRANSACTIONS = [];

function openStockModal(operationType) {
  var titleMap = { in: "زیادکردنی کۆگا (Stock In)", out: "کەمکردنەوەی کۆگا / کاڵای تەلەف و بەسەرچوو", adjust: "ڕێکخستنی کۆگا (Stock Adjustment)" };
  $("#stockModalTitle").innerHTML = '<i class="fas fa-boxes"></i> ' + (titleMap[operationType] || "بەڕێوەبردنی کۆگا");
  $("#stockOperationType").value = operationType;
  $("#stockAmount").value = "1";
  $("#stockNote").value = "";
  var reasonGrp = document.getElementById("stockOutReasonGroup");
  if (reasonGrp) reasonGrp.style.display = (operationType === "out") ? "block" : "none";
  var reasonSel = document.getElementById("stockOutReason");
  if (reasonSel) reasonSel.value = "damaged";
  populateProductSelect("stockProductSelect");
  showModal("stockModal");
}

function populateProductSelect(selectId) {
  var select = $("#" + selectId);
  if (!select) return;
  select.innerHTML = '<option value="">هەڵبژێرە...</option>';
  DB.products.forEach(function (p) {
    select.innerHTML += '<option value="' + p.id + '">' + p.name + ' (کۆگا: ' + p.stock + ')</option>';
  });
}

function saveStockOperation() {
  var productId = $("#stockProductSelect").value;
  var amount = parseFloat($("#stockAmount").value) || 0;
  var note = $("#stockNote").value.trim();
  var operationType = $("#stockOperationType").value;
  var outReason = ($("#stockOutReason") && operationType === "out") ? $("#stockOutReason").value : "normal";
  if (!productId) { toast("هەڵە", "بەرهەم هەڵبژێرە", "error"); return; }
  if (amount <= 0) { toast("هەڵە", "بڕ داواکراوە", "error"); return; }
  var product = DB.products.find(function (p) { return p.id === productId; });
  if (!product) return;
  var oldStock = product.stock || 0;
  var newStock = oldStock;
  if (operationType === "in") newStock = oldStock + amount;
  else if (operationType === "out") newStock = Math.max(0, oldStock - amount);
  else if (operationType === "adjust") newStock = amount;
  product.stock = newStock;
  var transaction = {
    id: gid(),
    productId: productId,
    productName: product.name,
    operationType: operationType,
    reason: outReason,
    amount: amount,
    oldStock: oldStock,
    newStock: newStock,
    note: note,
    date: new Date().toISOString(),
    userId: DB.currentUser ? DB.currentUser.id : null
  };
  STOCK_TRANSACTIONS.push(transaction);
  if (!IS_ONLINE) {
    queueOfflineOperation("stock_update", { productId: productId, newStock: newStock });
    toast("ئۆفلاین", "کۆگا لە سەر کیوە کرا", "warning");
  }
  DataStore.saveStockTransactions(STOCK_TRANSACTIONS);
  DataStore.saveProducts();

  // If stock out is due to damaged / expired goods, automatically record cost as expense to deduct from Net Profit
  if (operationType === "out" && outReason === "damaged") {
    var unitCost = parseFloat(product.cost) || Math.round((parseFloat(product.price) || 0) * 0.8);
    var totalWasteCost = Math.round(amount * unitCost);
    if (totalWasteCost > 0) {
      var wasteExpense = {
        id: "exp_waste_" + Date.now(),
        category: "damaged_waste",
        type: "damaged_waste",
        amount: totalWasteCost,
        paidFrom: "owner",
        description: "🗑️ تەلەف/بەسەرچوو: " + product.name + " (بڕ: " + amount + ")" + (note ? " - " + note : ""),
        date: new Date().toISOString(),
        shiftId: CURRENT_SHIFT ? CURRENT_SHIFT.id : null,
        addedBy: (DB.currentUser && DB.currentUser.name) ? DB.currentUser.name : "بەڕێوەبەر"
      };
      if (typeof BranchManager !== "undefined" && BranchManager.stamp) BranchManager.stamp(wasteExpense);
      if (!Array.isArray(DB.expenses)) DB.expenses = [];
      DB.expenses.push(wasteExpense);
      DataStore.saveExpenses();
      fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wasteExpense)
      }).catch(function () {});
      toast("تۆماری تەلەف و خەسارەت 🗑️", "بڕی " + fmt(totalWasteCost) + " وەک زەرەری کاڵای تەلەف لە قازانجی سافی دەرکرا", "info");
    }
  } else {
  toast("سەرکەوتوو", "کۆگا نوێکرایەوە", "success");
  }

  hideModal("stockModal");
  renderInventory();
  renderStockAlerts();
}

function renderStockAlerts() {
  var container = $("#stockAlerts");
  if (!container) return;
  var lowStockProducts = DB.products.filter(function (p) { return productTracksStock(p) && (p.stock || 0) > 0 && (p.stock || 0) <= 5; });
  var outOfStockProducts = DB.products.filter(function (p) { return productTracksStock(p) && (p.stock || 0) <= 0; });
  var html = "";
  if (outOfStockProducts.length > 0) {
    html += '<div class="stock-alert out-of-stock"><i class="fas fa-exclamation-circle"></i> <strong>' + outOfStockProducts.length + ' بەرهەم بە کۆگا نەماوە:</strong> ' + outOfStockProducts.map(function (p) { return p.name; }).join(", ") + '</div>';
  }
  if (lowStockProducts.length > 0) {
    html += '<div class="stock-alert low-stock"><i class="fas fa-exclamation-triangle"></i> <strong>' + lowStockProducts.length + ' بەرهەم کۆگای کەمە:</strong> ' + lowStockProducts.map(function (p) { return p.name + " (" + p.stock + ")"; }).join(", ") + '</div>';
  }
  container.innerHTML = html;
}

/* ═══ PERMISSIONS & ACTIVITY LOGS ═══ */

var PERMISSIONS = {};
var LOGIN_LOGS = [];
var ACTIVITY_LOGS = [];
var CHANGE_TRACKER = [];
var DELETED_RECORDS = [];
var OFFLINE_QUEUE = [];
var PRICE_HISTORY = [];
var IS_ONLINE = navigator.onLine;

var DEFAULT_PERMISSIONS = {
  admin: {
    dashboard: true, pos: true, products: true, categories: true, inventory: true, stock: true,
    reports: true, profitReports: true, returnSales: true, settings: true, users: true,
    debt: true, expenses: true, shifts: true, customers: true, suppliers: true, purchases: true,
    orders: true, barcode: true
  },
  manager: {
    dashboard: true, pos: true, products: true, categories: true, inventory: true, stock: true,
    reports: true, profitReports: true, returnSales: true, settings: true, users: true,
    debt: true, expenses: true, shifts: true, customers: true, suppliers: true, purchases: true,
    orders: true, barcode: true
  },
  cashier: {
    dashboard: false, pos: true, products: false, categories: false, inventory: false, stock: false,
    reports: false, profitReports: false, returnSales: true, settings: false, users: false,
    debt: true, expenses: false, shifts: true, customers: true, suppliers: false, purchases: false,
    orders: true, barcode: false
  },
  warehouse: {
    dashboard: false, pos: false, products: true, categories: true, inventory: true, stock: true,
    reports: false, profitReports: false, returnSales: false, settings: false, users: false,
    debt: false, expenses: false, shifts: false, customers: false, suppliers: true, purchases: true,
    orders: false, barcode: true
  }
};

function initPermissions() {
  if (!PERMISSIONS || Object.keys(PERMISSIONS).length === 0) {
    PERMISSIONS = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
    DataStore.savePermissions(PERMISSIONS);
    return;
  }
  Object.keys(DEFAULT_PERMISSIONS).forEach(function (role) {
    if (!PERMISSIONS[role]) PERMISSIONS[role] = {};
    Object.keys(DEFAULT_PERMISSIONS[role]).forEach(function (key) {
      if (PERMISSIONS[role][key] === undefined) PERMISSIONS[role][key] = DEFAULT_PERMISSIONS[role][key];
    });
  });
}

function hasPermission(permission) {
  if (!DB.currentUser) return false;
  var pageMap = {
    pos: "pos", products: "products", inventory: "inventory", stock: "inventory",
    reports: "reports", settings: "settings", users: "users", debt: "debt",
    expenses: "expenses", shifts: "shifts", categories: "categories", customers: "customers",
    suppliers: "suppliers", purchases: "purchases", barcode: "barcode", dashboard: "dashboard"
  };
  var page = pageMap[permission] || permission;
  return AuthService.canAccessPage(page);
}

function logActivity(action, details) {
  var log = {
    id: gid(),
    userId: DB.currentUser ? DB.currentUser.email : "unknown",
    userName: DB.currentUser ? DB.currentUser.name : "unknown",
    userRole: DB.currentUser ? DB.currentUser.role : "unknown",
    action: action,
    details: details,
    timestamp: new Date().toISOString()
  };
  ACTIVITY_LOGS.push(log);
  if (ACTIVITY_LOGS.length > 1000) ACTIVITY_LOGS.shift();
  DataStore.saveActivityLogs(ACTIVITY_LOGS);
}

function trackChange(type, entityType, entityId, oldValue, newValue, details) {
  var change = {
    id: gid(),
    type: type,
    entityType: entityType,
    entityId: entityId,
    oldValue: oldValue,
    newValue: newValue,
    details: details,
    userId: DB.currentUser ? DB.currentUser.email : "unknown",
    userName: DB.currentUser ? DB.currentUser.name : "unknown",
    timestamp: new Date().toISOString()
  };
  CHANGE_TRACKER.push(change);
  if (CHANGE_TRACKER.length > 2000) CHANGE_TRACKER.shift();
  DataStore.saveChangeTracker(CHANGE_TRACKER);
}

function trackDeletion(entityType, record) {
  var deletion = {
    id: gid(),
    entityType: entityType,
    record: record,
    userId: DB.currentUser ? DB.currentUser.email : "unknown",
    userName: DB.currentUser ? DB.currentUser.name : "unknown",
    timestamp: new Date().toISOString()
  };
  DELETED_RECORDS.push(deletion);
  if (DELETED_RECORDS.length > 500) DELETED_RECORDS.shift();
  DataStore.saveDeletedRecords(DELETED_RECORDS);
}

function trackPriceChange(productId, productName, oldPrice, newPrice) {
  var priceChange = {
    id: gid(),
    productId: productId,
    productName: productName,
    oldPrice: oldPrice,
    newPrice: newPrice,
    userId: DB.currentUser ? DB.currentUser.email : "unknown",
    userName: DB.currentUser ? DB.currentUser.name : "unknown",
    timestamp: new Date().toISOString()
  };
  PRICE_HISTORY.push(priceChange);
  if (PRICE_HISTORY.length > 1000) PRICE_HISTORY.shift();
  DataStore.savePriceHistory(PRICE_HISTORY);
  trackChange("price_change", "product", productId, oldPrice, newPrice, "Price changed from " + oldPrice + " to " + newPrice);
}

function queueOfflineOperation(operation, data) {
  var op = {
    id: gid(),
    operation: operation,
    data: data,
    timestamp: new Date().toISOString()
  };
  OFFLINE_QUEUE.push(op);
  DataStore.saveOfflineQueue(OFFLINE_QUEUE);
}

function syncOfflineOperations() {
  if (OFFLINE_QUEUE.length === 0) return;
  var synced = [];
  OFFLINE_QUEUE.forEach(function (op) {
    try {
      if (op.operation === "sale") {
        DB.orders.push(op.data);
      } else if (op.operation === "stock_update") {
        var prod = DB.products.find(function (p) { return p.id === op.data.productId; });
        if (prod) prod.stock = op.data.newStock;
      } else if (op.operation === "price_change") {
        var prod = DB.products.find(function (p) { return p.id === op.data.productId; });
        if (prod) prod.price = op.data.newPrice;
      }
      synced.push(op.id);
    } catch (e) {
      console.error("Sync error:", e);
    }
  });
  OFFLINE_QUEUE = OFFLINE_QUEUE.filter(function (op) { return !synced.includes(op.id); });
  DataStore.saveOfflineQueue(OFFLINE_QUEUE);
  DataStore.saveProducts();
  DataStore.saveOrders();
  if (synced.length > 0) {
    toast("سەرکەوتوو", synced.length + " کارە سینک کرا", "success");
    logActivity("sync", "Synced " + synced.length + " offline operations");
  }
}

function setupOfflineSync() {
  window.addEventListener("online", function () {
    IS_ONLINE = true;
    toast("ئۆنلاین", "ئینتەرنێت گەڕایەوە", "success", true);
    syncOfflineOperations();
    warmImageCache(true);
  });
  window.addEventListener("offline", function () {
    IS_ONLINE = false;
    toast("ئۆفلاین", "ئینتەرنێت نەما — وێنە پاشکەوتکراوەکان دەردەکەون", "warning");
  });
}

function logLogin(email, success) {
  var log = {
    id: gid(),
    email: email,
    success: success,
    timestamp: new Date().toISOString(),
    ipAddress: "local"
  };
  LOGIN_LOGS.push(log);
  if (LOGIN_LOGS.length > 500) LOGIN_LOGS.shift();
  DataStore.saveLoginLogs(LOGIN_LOGS);
}

/* ═══ RETURN SALE ═══ */

var RETURN_SALES = [];
var SELECTED_RETURN_ORDER = null;

function openReturnSaleModal(query) {
  if (query && typeof query !== "string") query = "";
  if (typeof ReturnEngine !== "undefined") {
    ReturnEngine.open(query);
    return;
  }
  var search = $("#returnOrderSearch");
  if (search) search.value = "";
  var itemsSec = $("#returnItemsSection");
  if (itemsSec) itemsSec.style.display = "none";
  SELECTED_RETURN_ORDER = null;
  showModal("returnSaleModal");
  renderRecentReturnOrders();
  if (search) search.focus();
}

function renderReturnOrderResults(orders) {
  var results = $("#returnOrderResults");
  if (!results) return;
  if (!orders || orders.length === 0) {
    results.innerHTML = '<div style="padding:10px;color:var(--text-muted);">هیچ پسوڵەیەک نەدۆزرایەوە</div>';
    return;
  }
  results.innerHTML = orders.map(function (o) {
    var dateStr = formatSaleDateTime(o.date);
    return '<div class="return-order-item" style="padding:10px;border-bottom:1px solid var(--border-color);cursor:pointer;" onclick="selectReturnOrder(\'' + o.id + '\')">' +
      '<div style="display:flex;justify-content:space-between;font-weight:700;"><span>' + o.id.slice(-6) + '</span><span>' + fmt(o.total) + '</span></div>' +
      '<div style="font-size:0.8rem;color:var(--text-secondary);">' + dateStr + ' - ' + (o.customerName || "کڕیاری نەناسراو") + '</div>' +
      '</div>';
  }).join("");
}

function renderRecentReturnOrders() {
  var recent = DB.orders.slice().reverse().slice(0, 8);
  renderReturnOrderResults(recent);
}

function searchReturnOrders() {
  var query = $("#returnOrderSearch").value.trim().toLowerCase();
  if (!query) {
    renderRecentReturnOrders();
    return;
  }
  var filtered = DB.orders.filter(function (o) {
    if (o.id.toLowerCase().includes(query)) return true;
    if (o.customerName && o.customerName.toLowerCase().includes(query)) return true;
    return o.items.some(function (item) { return item.name && item.name.toLowerCase().includes(query); });
  }).slice(0, 10);
  renderReturnOrderResults(filtered);
}

function selectReturnOrder(orderId) {
  var order = DB.orders.find(function (o) { return o.id === orderId; });
  if (!order) return;
  SELECTED_RETURN_ORDER = order;
  var itemsSection = $("#returnItemsSection");
  var itemsList = $("#returnItemsList");
  if (itemsSection) itemsSection.style.display = "block";
  var html = order.items.map(function (item, idx) {
    return '<div class="return-item" style="padding:10px;border:1px solid var(--border-color);border-radius:var(--radius-md);margin-bottom:8px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '<span style="font-weight:700;">' + item.name + '</span>' +
      '<span style="color:var(--success);">' + fmt(item.price * item.qty) + '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
      '<label style="font-size:0.8rem;">بڕی گەڕاندنەوە:</label>' +
      '<input type="number" class="return-qty-input" data-idx="' + idx + '" min="0" max="' + item.qty + '" value="' + item.qty + '" style="width:80px;padding:6px;border-radius:var(--radius-sm);">' +
      '<span style="font-size:0.8rem;">/ ' + item.qty + '</span>' +
      '</div>' +
      '</div>';
  }).join("");
  if (itemsList) itemsList.innerHTML = html;
}

function confirmReturnSale() {
  if (!SELECTED_RETURN_ORDER) { toast("هەڵە", "پسوڵە هەڵبژێرە", "error"); return; }
  var returnItems = [];
  var qtyInputs = $$(".return-qty-input");
  qtyInputs.forEach(function (input) {
    var idx = parseInt(input.dataset.idx);
    var qty = parseInt(input.value) || 0;
    if (qty > 0) {
      var item = SELECTED_RETURN_ORDER.items[idx];
      returnItems.push({
        prodId: item.prodId || null,
        name: item.name,
        price: item.price,
        cost: item.cost || 0,
        originalQty: item.qty,
        returnQty: qty,
        refundAmount: item.price * qty
      });
      if (item.prodId) {
        var prod = DB.products.find(function (p) { return p.id === item.prodId; });
        if (prod) prod.stock = (prod.stock || 0) + qty;
      }
    }
  });
  if (returnItems.length === 0) { toast("هەڵە", "بڕی گەڕاندنەوە دیاری بکە", "error"); return; }
  var totalRefund = returnItems.reduce(function (s, i) { return s + i.refundAmount; }, 0);
  var returnSale = {
    id: gid(),
    originalOrderId: SELECTED_RETURN_ORDER.id,
    items: returnItems,
    totalRefund: totalRefund,
    date: new Date().toISOString(),
    cashier: getActiveOperatorName()
  };
  RETURN_SALES.push(returnSale);
  DataStore.saveReturnSales(RETURN_SALES);
  DataStore.saveProducts();
  if (CURRENT_SHIFT) {
    var returnExpense = {
      id: gid(),
      type: "return",
      category: "return",
      amount: totalRefund,
      description: "گەڕانەوە پسوڵە " + SELECTED_RETURN_ORDER.id.slice(-6),
      date: new Date().toISOString(),
      shiftId: CURRENT_SHIFT.id,
      addedBy: getActiveOperatorName()
    };
    if (typeof BranchManager !== "undefined" && BranchManager.stamp) BranchManager.stamp(returnExpense);
    DB.expenses.push(returnExpense);
    DataStore.saveExpenses();
  }
  hideModal("returnSaleModal");
  renderPosGrid();
  toast("سەرکەوتوو", "گەڕانەوەی فرۆشتن تۆمار کرا: " + fmt(totalRefund), "success");
}

/* ═══ REAL BARCODE & SHELF LABEL STUDIO ═══ */

var BARCODE_STUDIO_STATE = {
  scope: 'create', // 'create' | 'single' | 'category' | 'all'
  template: 'thermal', // 'thermal' | 'shelf' | 'a4' | 'scale'
  selectedProductId: null,
  selectedCategory: 'all',
  createdProductId: null,
  newImageData: null
};

function populateNewBcCategorySelect() {
  var sel = $("#newBcCategory");
  if (!sel) return;
  fillCategorySelectEl(sel, sel.value, false);
}

function getBarcodeCreateDraft() {
  var name = ($("#newBcName") && $("#newBcName").value || "").trim();
  var code = ($("#newBcNumber") && $("#newBcNumber").value || "").trim();
  var price = parseFloat($("#newBcPrice") && $("#newBcPrice").value);
  if (isNaN(price) || price < 0) price = 0;
  var stock = parseInt($("#newBcStock") && $("#newBcStock").value, 10);
  if (isNaN(stock) || stock < 0) stock = 0;
  var cat = readProductAssignChoice($("#newBcCategory") && $("#newBcCategory").value).cat;
  return {
    id: BARCODE_STUDIO_STATE.createdProductId || "draft",
    name: name || "کاڵای نوێ",
    barcode: code,
    price: price,
    stock: stock,
    cat: cat,
    unit: "piece",
    cost: 0
  };
}

function ensureNewBarcodeNumber(quiet) {
  var inp = $("#newBcNumber");
  if (!inp) return "";
  if (inp.value && String(inp.value).trim()) return String(inp.value).trim();
  var barcode = makeUniqueEan13();
  inp.value = barcode;
  if (!quiet) toast("سەرکەوتوو", "ژمارەی بارکۆد دروستکرا: " + barcode, "success");
  return barcode;
}

function fillNewBarcodeNumber() {
  var inp = $("#newBcNumber");
  if (!inp) return;
  inp.value = makeUniqueEan13();
  BARCODE_STUDIO_STATE.createdProductId = null;
  generateBarcodePreview();
  toast("سەرکەوتوو", "ژمارەی بارکۆد دروستکرا: " + inp.value, "success");
}

function persistCreatedBarcodeProduct(prod) {
  DataStore.saveProducts();
  var forApi = {};
  Object.keys(prod).forEach(function (k) { forApi[k] = prod[k]; });
  if (forApi.image && String(forApi.image).indexOf("data:") === 0) forApi.image = "";
  if (typeof ApiClient !== "undefined" && ApiClient.saveProduct) {
    ApiClient.saveProduct(forApi).catch(function () {});
  }
  POS_GRID_CATEGORY = "all";
  POS_GRID_PAGE = 1;
  if (typeof renderProducts === "function") renderProducts();
  if (typeof renderPosGrid === "function") renderPosGrid();
  if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
  if (typeof renderProductGrid === "function") renderProductGrid("all");
  if (typeof renderPosQuickRow === "function") renderPosQuickRow();
  if (typeof renderInventory === "function") renderInventory();
}

function saveCreatedBarcodeProduct(opts) {
  opts = opts || {};
  var name = ($("#newBcName") && $("#newBcName").value || "").trim();
  if (!name) {
    toast("هەڵە", "تکایە ناوی کاڵا بنووسە — لەسەر بارکۆد دەردەکەوێت", "error");
    var nameEl = $("#newBcName");
    if (nameEl) nameEl.focus();
    return null;
  }
  var code = ensureNewBarcodeNumber(true);
  if (!code) {
    toast("هەڵە", "تکایە ژمارەی بارکۆد دروست بکە یان بینووسە", "error");
    return null;
  }

  var existingByCode = (DB.products || []).find(function (p) {
    return String(p.barcode || "").trim() === code || String(p.packBarcode || "").trim() === code;
  });
  var knownId = BARCODE_STUDIO_STATE.createdProductId;
  var price = parseFloat($("#newBcPrice") && $("#newBcPrice").value);
  if (isNaN(price) || price < 0) price = 0;
  var cost = parseFloat($("#newBcCost") && $("#newBcCost").value);
  if (isNaN(cost) || cost < 0) cost = 0;
  var stock = parseInt($("#newBcStock") && $("#newBcStock").value, 10);
  if (isNaN(stock) || stock < 0) stock = 10;
  var cat = readProductAssignChoice($("#newBcCategory") && $("#newBcCategory").value).cat;
  var imageUrl = BARCODE_STUDIO_STATE.newImageData || "";

  var prod = knownId ? (DB.products || []).find(function (p) { return p.id === knownId; }) : null;
  if (!prod && existingByCode) prod = existingByCode;

  if (prod) {
    prod.name = name;
    prod.barcode = String(code);
    prod.price = price;
    prod.cost = cost;
    prod.stock = stock;
    if (cat) prod.cat = cat;
    if (imageUrl) prod.image = imageUrl;
    var favPickExist = readFavGroupSelect("newBcFavCategory");
    if (favPickExist) applyFavGroupToProduct(prod, favPickExist);
  } else {
    if (stock <= 0) stock = 10;
    prod = {
      id: gid(),
      name: name,
      price: price,
      cost: cost,
      barcode: String(code),
      stock: stock,
      minAlert: 5,
      image: imageUrl,
      cat: cat,
      unit: "piece",
      productionDate: null,
      expiryDate: null,
      batchNumber: null,
      packQty: 1,
      packPrice: 0,
      packBarcode: "",
      packCost: 0,
      offerPrice: 0,
      offerStart: null,
      offerEnd: null,
      quickFavorite: 0,
      quickFavoriteAt: 0,
      favCatId: "",
      sortOrder: nextProductSortOrder()
    };
    applyFavGroupToProduct(prod, readFavGroupSelect("newBcFavCategory"));
  }
  DB.products = [prod].concat((DB.products || []).filter(function (p) { return p.id !== prod.id; }));

  BARCODE_STUDIO_STATE.createdProductId = prod.id;
  persistCreatedBarcodeProduct(prod);
  if (prod.image && typeof storeImageForItem === "function") {
    storeImageForItem(prod.id, prod.image, prod.name);
  }
  if (!opts.silent) {
    toast("سەرکەوتوو", (existingByCode && existingByCode.id === prod.id ? "کاڵا نوێکرایەوە: " : "کاڵا و بارکۆد پاشکەوت کران: ") + name + " — " + code, "success");
  }
  generateBarcodePreview();
  return prod;
}

function resetNewBarcodeImagePreview() {
  BARCODE_STUDIO_STATE.newImageData = null;
  var fileEl = $("#newBcImageFile");
  if (fileEl) fileEl.value = "";
  var preview = $("#newBcImagePreview");
  if (preview) preview.innerHTML = '<i class="fas fa-image" style="color:var(--text-muted);"></i>';
}

function previewNewBarcodeImage(file) {
  var preview = $("#newBcImagePreview");
  if (!file) {
    resetNewBarcodeImagePreview();
    return;
  }
  var reader = new FileReader();
  reader.onload = function (e) {
    BARCODE_STUDIO_STATE.newImageData = e.target.result;
    if (preview) preview.innerHTML = '<img src="' + e.target.result + '" alt="" style="width:100%;height:100%;object-fit:cover;">';
  };
  reader.readAsDataURL(file);
}

var NEW_BC_FIELD_IDS = ["newBcName", "newBcNumber", "newBcPrice", "newBcCost", "newBcStock", "newBcCategory"];

function isBarcodeStudioActive() {
  var sec = document.getElementById("barcodeSection");
  if (sec && (sec.classList.contains("active") || sec.classList.contains("show"))) return true;
  return window.CURRENT_PAGE === "barcode";
}

function isBarcodeCreateOpen() {
  if (!isBarcodeStudioActive()) return false;
  var wrap = document.getElementById("barcodeCreateWrap");
  if (!wrap) return false;
  return wrap.style.display !== "none";
}

function focusNextNewBcField(currentId) {
  var i = NEW_BC_FIELD_IDS.indexOf(currentId);
  var nextId = i >= 0 ? NEW_BC_FIELD_IDS[i + 1] : NEW_BC_FIELD_IDS[0];
  if (!nextId) {
    var saveBtn = document.getElementById("newBcSaveBtn");
    if (saveBtn) saveBtn.focus();
    return;
  }
  var el = document.getElementById(nextId);
  if (!el) return;
  el.focus();
  if (el.select) try { el.select(); } catch (eSel) {}
}

function stripLeakedScanFromActive(code) {
  var ae = document.activeElement;
  if (!ae || ae.id === "newBcNumber" || typeof ae.value !== "string") return;
  var v = ae.value;
  if (!v) return;
  if (code && v.slice(-code.length) === code) {
    ae.value = v.slice(0, -code.length);
    return;
  }
  if (code && v.charAt(v.length - 1) === code.charAt(0)) {
    ae.value = v.slice(0, -1);
  }
}

function productMatchesBarcodeStudioQuery(p, query) {
  if (!p) return false;
  var q = String(query || "").trim();
  if (!q) return true;
  var qLower = q.toLowerCase();
  var qn = (typeof normalizeScannedCode === "function") ? normalizeScannedCode(q) : qLower;
  if (String(p.name || "").toLowerCase().indexOf(qLower) !== -1) return true;
  if (String(p.id || "").toLowerCase().indexOf(qLower) !== -1) return true;
  if (typeof barcodesMatch === "function") {
    if (barcodesMatch(p.barcode, q) || barcodesMatch(p.packBarcode, q) || barcodesMatch(p.scaleCode, q)) return true;
  }
  var codes = [p.barcode, p.packBarcode, p.scaleCode];
  var i;
  for (i = 0; i < codes.length; i++) {
    if (!codes[i]) continue;
    var c = String(codes[i]).toLowerCase();
    var nc = (typeof normalizeScannedCode === "function") ? String(normalizeScannedCode(codes[i])).toLowerCase() : c;
    if (c.indexOf(qLower) !== -1 || (qn && nc.indexOf(String(qn).toLowerCase()) !== -1)) return true;
  }
  return false;
}

function selectBarcodeStudioSavedProduct(prod, code) {
  if (!prod) return false;
  if (typeof updateBarcodeScopeUI === "function") updateBarcodeScopeUI("single");
  if (typeof BARCODE_STUDIO_STATE !== "undefined") {
    BARCODE_STUDIO_STATE.selectedProductId = prod.id;
    BARCODE_STUDIO_STATE.scope = "single";
  }
  var search = document.getElementById("barcodeSearchFilter");
  if (search) search.value = prod.name || code || "";
  var sel = document.getElementById("barcodeProductSelect");
  if (sel) {
    var list = [prod];
    (DB.products || []).forEach(function (p) {
      if (p && p.id !== prod.id) list.push(p);
    });
    sel.innerHTML = list.map(function (p) {
      var bCode = p.barcode ? (" [" + p.barcode + "]") : "";
      return '<option value="' + p.id + '">' + (p.name || "بێ ناو") + bCode + " | کۆگا: " + (p.stock || 0) + "</option>";
    }).join("");
    sel.value = prod.id;
  }
  if (prod.unit === "kg" && typeof setBarcodeTemplate === "function") setBarcodeTemplate("scale");
  if (typeof updateBarcodeStockHint === "function") updateBarcodeStockHint();
  if (typeof generateBarcodePreview === "function") generateBarcodePreview();
  return true;
}

function fillBarcodeStudioFromScan(code) {
  if (!isBarcodeStudioActive()) return false;
  code = String(code || "").trim();
  if (!code.length) return false;
  stripLeakedScanFromActive(code);

  var harvested = "";
  try {
    var searchEl = document.getElementById("barcodeSearchFilter");
    var numEl = document.getElementById("newBcNumber");
    if (searchEl && searchEl.value) harvested = searchEl.value;
    else if (numEl && numEl.value) harvested = numEl.value;
  } catch (eH) {}

  var packed = (typeof findScannedProductAny === "function")
    ? findScannedProductAny(code, harvested)
    : null;
  var hit = packed && packed.prod ? packed.prod : null;
  if (!hit && typeof findProductByScannedCodeFresh === "function") {
    hit = findProductByScannedCodeFresh(code);
  } else if (!hit && typeof findProductByScannedCode === "function") {
    hit = findProductByScannedCode(code);
  }

  if (hit) {
    selectBarcodeStudioSavedProduct(hit, packed && packed.code ? packed.code : code);
    if (window.PosScanGuard) window.PosScanGuard.markScanned();
    if (typeof PosAudio !== "undefined" && PosAudio.playScanBeep) PosAudio.playScanBeep();
    toast("کاڵا", hit.name, "success");
    return true;
  }

  if (isBarcodeCreateOpen()) {
    var inp = document.getElementById("newBcNumber");
    if (!inp) return false;
    inp.value = code;
    if (typeof BARCODE_STUDIO_STATE !== "undefined") BARCODE_STUDIO_STATE.createdProductId = null;
    if (typeof generateBarcodePreview === "function") generateBarcodePreview();
    if (typeof updateBarcodeStockHint === "function") updateBarcodeStockHint();
    if (window.PosScanGuard) window.PosScanGuard.markScanned();
    toast("بارکۆد", "سکانکرا: " + code, "success");
    focusNextNewBcField("newBcNumber");
    return true;
  }

  var search = document.getElementById("barcodeSearchFilter");
  if (search) {
    if (typeof updateBarcodeScopeUI === "function") updateBarcodeScopeUI("single");
    search.value = code;
    if (typeof filterBarcodeProductsList === "function") filterBarcodeProductsList();
    toast("گەڕان", "کاڵا بەم بارکۆدە نەدۆزرایەوە: " + code, "warning");
    return true;
  }
  return false;
}

function setupBarcodeStudioScanLink() {
  if (window.__BC_SCAN_LINK) return;
  window.__BC_SCAN_LINK = true;
  document.addEventListener("keydown", function (e) {
    if (!isBarcodeCreateOpen()) return;
    if (e.key !== "Enter") return;
    if (window.PosScanGuard && window.PosScanGuard.isScanTerminator(e)) return;
    var t = e.target;
    var inOurFields = !!(t && t.id && NEW_BC_FIELD_IDS.indexOf(t.id) !== -1);
    if (inOurFields) {
      e.preventDefault();
      focusNextNewBcField(t.id);
    }
  });
}

window.fillBarcodeStudioFromScan = fillBarcodeStudioFromScan;
window.selectBarcodeStudioSavedProduct = selectBarcodeStudioSavedProduct;
window.setupBarcodeStudioScanLink = setupBarcodeStudioScanLink;

var LABEL_PAPER_PRESETS = [
  { paper: "#ffffff", ink: "#000000" },
  { paper: "#fff7ed", ink: "#7c2d12" },
  { paper: "#fef08a", ink: "#1c1917" },
  { paper: "#d1fae5", ink: "#064e3b" },
  { paper: "#dbeafe", ink: "#1e3a8a" },
  { paper: "#fce7f3", ink: "#9d174d" },
  { paper: "#111827", ink: "#f8fafc" }
];

function getLabelPaperColorsSafe() {
  if (typeof BarcodeGen !== "undefined" && typeof BarcodeGen.getLabelPaperColors === "function") {
    return BarcodeGen.getLabelPaperColors();
  }
  return { paper: "#ffffff", ink: "#000000", bar: "#000000" };
}

function persistLabelPaperColors(colors, silent) {
  if (typeof DB === "undefined") return;
  if (!DB.settings) DB.settings = {};
  var cur = getLabelPaperColorsSafe();
  var next = {
    paper: colors && colors.paper ? colors.paper : cur.paper,
    ink: colors && colors.ink ? colors.ink : cur.ink
  };
  DB.settings.labelColors = next;
  if (!DB.settings.barcodeDesign) DB.settings.barcodeDesign = {};
  if (!DB.settings.barcodeDesign.canvas) DB.settings.barcodeDesign.canvas = { w: 80, h: 54, bg: next.paper };
  else DB.settings.barcodeDesign.canvas.bg = next.paper;
  if (window.BarcodeDesigner && typeof BarcodeDesigner.setCanvasBg === "function") {
    try { BarcodeDesigner.setCanvasBg(next.paper, true); } catch (eBg) {}
  }
  if (!silent && typeof DataStore !== "undefined" && DataStore.saveSettings) {
    try { DataStore.saveSettings(); } catch (eS) {}
  }
}

function fillLabelPaperColorUi() {
  var c = getLabelPaperColorsSafe();
  var paper = document.getElementById("bcPaperColor");
  var ink = document.getElementById("bcInkColor");
  var paperHex = document.getElementById("bcPaperHex");
  var inkHex = document.getElementById("bcInkHex");
  if (paper) paper.value = c.paper;
  if (ink) ink.value = c.ink;
  if (paperHex) paperHex.value = c.paper;
  if (inkHex) inkHex.value = c.ink;
  document.querySelectorAll(".bc-paper-preset").forEach(function (btn) {
    var on = btn.getAttribute("data-paper") === c.paper && btn.getAttribute("data-ink") === c.ink;
    btn.classList.toggle("is-on", !!on);
  });
}

function readLabelPaperColorInputs() {
  function hexOf(id, fallback) {
    var el = document.getElementById(id);
    var v = el && el.value;
    return /^#[0-9a-fA-F]{6}$/.test(String(v || "").trim()) ? String(v).toLowerCase() : fallback;
  }
  var cur = getLabelPaperColorsSafe();
  return {
    paper: hexOf("bcPaperColor", cur.paper),
    ink: hexOf("bcInkColor", cur.ink)
  };
}

function onLabelPaperColorChange() {
  var colors = readLabelPaperColorInputs();
  persistLabelPaperColors(colors);
  fillLabelPaperColorUi();
  if (typeof generateBarcodePreview === "function") generateBarcodePreview();
}

function onLabelPaperHexChange(which) {
  var hexEl = document.getElementById(which === "ink" ? "bcInkHex" : "bcPaperHex");
  var colEl = document.getElementById(which === "ink" ? "bcInkColor" : "bcPaperColor");
  var v = hexEl ? String(hexEl.value || "").trim() : "";
  if (v && v.charAt(0) !== "#") v = "#" + v;
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
    fillLabelPaperColorUi();
    return;
  }
  if (colEl) colEl.value = v.toLowerCase();
  onLabelPaperColorChange();
}

function applyLabelPaperPreset(paper, ink) {
  persistLabelPaperColors({ paper: paper, ink: ink });
  fillLabelPaperColorUi();
  if (typeof generateBarcodePreview === "function") generateBarcodePreview();
}

window.onLabelPaperColorChange = onLabelPaperColorChange;
window.onLabelPaperHexChange = onLabelPaperHexChange;
window.applyLabelPaperPreset = applyLabelPaperPreset;

function initBarcodeStudioPage(productId) {
  fillLabelPaperColorUi();
  populateNewBcCategorySelect();
  var favStart = "";
  if (productId && typeof getProductFavGroupId === "function") {
    var favProd = (DB.products || []).find(function (p) { return p && p.id === productId; });
    if (favProd) favStart = getProductFavGroupId(favProd);
  }
  fillFavGroupSelect(document.getElementById("newBcFavCategory"), favStart);
  BARCODE_STUDIO_STATE.createdProductId = null;
  if (!productId) resetNewBarcodeImagePreview();

  var prods = (typeof DB !== "undefined" && DB.products) ? DB.products : [];

  // Populate products select
  var sel = $("#barcodeProductSelect");
  if (sel) {
    if (prods.length === 0) {
      sel.innerHTML = '<option value="">هیچ بەرهەمێک تۆمار نەکراوە</option>';
    } else {
      sel.innerHTML = prods.map(function (p) {
        var bCode = p.barcode ? (' [' + p.barcode + ']') : '';
        var stockStr = ' | کۆگا: ' + (p.stock || 0);
        return '<option value="' + p.id + '">' + (p.name || 'بێ ناو') + bCode + stockStr + '</option>';
      }).join("");
      if (productId && prods.some(function(p){ return p.id === productId; })) {
        sel.value = productId;
        BARCODE_STUDIO_STATE.selectedProductId = productId;
      } else {
        sel.value = prods[0].id;
        BARCODE_STUDIO_STATE.selectedProductId = prods[0].id;
      }
    }
  }

  // Populate categories select
  var catSel = $("#barcodeCategorySelect");
  if (catSel) {
    var catMap = {};
    prods.forEach(function (p) { if (p.cat) catMap[p.cat] = true; });
    var catList = Object.keys(catMap);
    catSel.innerHTML = '<option value="all">هەموو پۆلەکان (' + prods.length + ' بەرهەم)</option>' +
      catList.map(function (c) {
        var count = prods.filter(function (p) { return p.cat === c; }).length;
        return '<option value="' + c + '">' + c + ' (' + count + ' بەرهەم)</option>';
      }).join("");
  }

  // Clear search filter
  var searchInput = $("#barcodeSearchFilter");
  if (searchInput) searchInput.value = "";

  // Reset count
  var countInput = $("#labelCount");
  if (countInput) countInput.value = "1";

  // Check product unit, auto-suggest template if kg
  var curProduct = prods.find(function (p) { return p.id === (productId || (sel ? sel.value : null)); });
  if (productId && curProduct && curProduct.unit === 'kg') {
    setBarcodeTemplate('scale');
  } else {
    setBarcodeTemplate('thermal');
  }

  try {
    if (productId) {
      updateBarcodeScopeUI('single');
    } else {
      ensureNewBarcodeNumber(true);
      updateBarcodeScopeUI('create');
    }
  } catch (err) {
    console.error("Barcode preview error:", err);
  }
}

function renderBarcodeStudioPage(productId) {
  initBarcodeStudioPage(productId);
}

function openBarcodeLabelModal(productId) {
  switchSection("barcode", true);
  initBarcodeStudioPage(productId);
}

function openBarcodeStudioForProduct(productId) {
  openBarcodeLabelModal(productId);
}

function openCashierQrBarcode() {
  switchSection("barcode", true);
  initBarcodeStudioPage();
  setBarcodeTemplate("qr");
  updateBarcodeScopeUI("create");
}

function openCashierProductsStore() {
  switchSection("products", true);
}

window.initBarcodeStudioPage = initBarcodeStudioPage;
window.renderBarcodeStudioPage = renderBarcodeStudioPage;
window.openBarcodeLabelModal = openBarcodeLabelModal;
window.openBarcodeStudioForProduct = openBarcodeStudioForProduct;
window.openCashierQrBarcode = openCashierQrBarcode;
window.openCashierProductsStore = openCashierProductsStore;
window.fillNewBarcodeNumber = fillNewBarcodeNumber;
window.saveCreatedBarcodeProduct = saveCreatedBarcodeProduct;
window.makeUniqueEan13 = makeUniqueEan13;

function setBarcodeTemplate(tmpl) {
  BARCODE_STUDIO_STATE.template = tmpl;
  $$(".barcode-template-card").forEach(function (card) {
    var isMatch = card.dataset.template === tmpl;
    card.classList.toggle("active", isMatch);
    if (isMatch) {
      card.style.border = "2px solid var(--accent)";
      card.style.background = "rgba(99,102,241,0.06)";
    } else {
      card.style.border = "1px solid var(--border-color)";
      card.style.background = "var(--bg-input)";
    }
    var radio = card.querySelector('input[type="radio"]');
    if (radio) radio.checked = isMatch;
  });

  var scaleWrap = $("#barcodeScaleWrap");
  if (scaleWrap) {
    scaleWrap.style.display = (tmpl === 'scale') ? "block" : "none";
  }

  var thermalSizeWrap = $("#barcodeThermalSizeWrap");
  if (thermalSizeWrap) {
    thermalSizeWrap.style.display = "none";
  }

  var badge = $("#barcodePreviewSizeBadge");
  if (badge) {
    var tSize = $("#barcodeThermalSizeSelect") ? $("#barcodeThermalSizeSelect").value : "40x25";
    if (tmpl === 'thermal') badge.textContent = "80mm بارکۆدی گەورە (پسوڵە)";
    else if (tmpl === 'qr') badge.textContent = "80mm — QR بچووک + ناو و نرخ گەورە";
    else if (tmpl === 'shelf') badge.textContent = "60mm × 40mm (Shelf Tag)";
    else if (tmpl === 'a4') badge.textContent = "A4 (24 Stickers)";
    else if (tmpl === 'scale') badge.textContent = "50mm × 35mm (Scale)";
    else if (tmpl === 'design') badge.textContent = "ستایلی خۆت";
  }

  if (window.BarcodeDesigner) BarcodeDesigner.show(tmpl === "design");

  generateBarcodePreview();
}

function updateBarcodeScopeUI(scope) {
  BARCODE_STUDIO_STATE.scope = scope;
  var createBtn = $("#barcodeScopeCreateBtn");
  var singleBtn = $("#barcodeScopeSingleBtn");
  var catBtn = $("#barcodeScopeCategoryBtn");
  var allBtn = $("#barcodeScopeAllBtn");
  var createWrap = $("#barcodeCreateWrap");
  var singleWrap = $("#barcodeSingleProductWrap");
  var catWrap = $("#barcodeCategoryProductWrap");

  if (createBtn) {
    if (scope === 'create') {
      createBtn.className = "btn btn-xs btn-primary";
      createBtn.style.background = "linear-gradient(135deg,#10b981,#059669)";
      createBtn.style.border = "none";
      createBtn.style.color = "#fff";
    } else {
      createBtn.className = "btn btn-xs btn-outline";
      createBtn.style.background = "";
      createBtn.style.border = "";
      createBtn.style.color = "";
    }
  }
  if (singleBtn) singleBtn.className = scope === 'single' ? "btn btn-xs btn-primary" : "btn btn-xs btn-outline";
  if (catBtn) catBtn.className = scope === 'category' ? "btn btn-xs btn-primary" : "btn btn-xs btn-outline";
  if (allBtn) allBtn.className = scope === 'all' ? "btn btn-xs btn-primary" : "btn btn-xs btn-outline";

  if (createWrap) createWrap.style.display = scope === 'create' ? "block" : "none";
  if (singleWrap) singleWrap.style.display = scope === 'single' ? "block" : "none";
  if (catWrap) catWrap.style.display = scope === 'category' ? "block" : "none";

  if (scope === 'create') ensureNewBarcodeNumber(true);

  updateBarcodeStockHint();
  generateBarcodePreview();
}

function setLabelCount(num) {
  var countInput = $("#labelCount");
  if (countInput) {
    countInput.value = num;
  }
}

function updateBarcodeStockHint() {
  var hint = $("#barcodeStockHint");
  if (!hint) return;
  if (BARCODE_STUDIO_STATE.scope === 'create') {
    var draft = getBarcodeCreateDraft();
    hint.textContent = draft.barcode
      ? ('بارکۆدی نوێ: ' + draft.barcode)
      : 'ناوی کاڵا بنووسە و ژمارەی بارکۆد دروست بکە';
    return;
  }
  if (BARCODE_STUDIO_STATE.scope === 'single') {
    var sel = $("#barcodeProductSelect");
    var prod = sel ? DB.products.find(function(p){ return p.id === sel.value; }) : null;
    hint.textContent = prod ? ('کۆگا: ' + (prod.stock || 0) + ' دانە') : 'کۆگا: 0';
  } else if (BARCODE_STUDIO_STATE.scope === 'category') {
    var catSel = $("#barcodeCategorySelect");
    var cat = catSel ? catSel.value : 'all';
    var prods = (cat === 'all') ? DB.products : DB.products.filter(function(p){ return p.cat === cat; });
    var totalStock = prods.reduce(function(sum, p){ return sum + (p.stock || 0); }, 0);
    hint.textContent = prods.length + ' بەرهەم (' + totalStock + ' لە کۆگا)';
  } else {
    var allStock = DB.products.reduce(function(sum, p){ return sum + (p.stock || 0); }, 0);
    hint.textContent = DB.products.length + ' بەرهەم (' + allStock + ' لە کۆگا)';
  }
}

function filterBarcodeProductsList() {
  var raw = ($("#barcodeSearchFilter") ? $("#barcodeSearchFilter").value : "");
  var filterText = String(raw || "").trim();
  var sel = $("#barcodeProductSelect");
  if (!sel) return;
  var exact = null;
  if (filterText) {
    if (typeof findProductByScannedCodeFresh === "function") exact = findProductByScannedCodeFresh(filterText);
    else if (typeof findProductByScannedCode === "function") exact = findProductByScannedCode(filterText);
  }
  var matched = (DB.products || []).filter(function (p) {
    return productMatchesBarcodeStudioQuery(p, filterText);
  });
  if (exact) {
    matched = [exact].concat(matched.filter(function (p) { return p.id !== exact.id; }));
  }

  if (matched.length === 0) {
    sel.innerHTML = '<option value="">هیچ بەرهەمێک نەدۆزرایەوە</option>';
  } else {
    sel.innerHTML = matched.map(function (p) {
      var bCode = p.barcode ? (" [" + p.barcode + "]") : "";
      var stockStr = " | کۆگا: " + (p.stock || 0);
      return '<option value="' + p.id + '">' + (p.name || "بێ ناو") + bCode + stockStr + "</option>";
    }).join("");
    sel.value = exact ? exact.id : matched[0].id;
    if (typeof BARCODE_STUDIO_STATE !== "undefined") BARCODE_STUDIO_STATE.selectedProductId = sel.value;
  }
  updateBarcodeStockHint();
  generateBarcodePreview();
}

function generateBarcodePreview() {
  var preview = $("#barcodePreview");
  if (!preview) return;

  if (typeof BarcodeGen === "undefined") {
    preview.innerHTML = '<div style="padding:20px;color:red;">هەڵە: کتێبخانەی باڕکۆد بارنەکراوە.</div>';
    return;
  }

  var product = null;
  if (BARCODE_STUDIO_STATE.scope === 'create') {
    product = getBarcodeCreateDraft();
  } else {
    var selId = $("#barcodeProductSelect") ? $("#barcodeProductSelect").value : null;
    product = DB.products.find(function (p) { return p.id === selId; });
    if (!product && DB.products.length > 0) {
      product = DB.products[0];
    }
  }

  if (!product) {
    preview.innerHTML = '<div style="padding:30px;color:#999;font-size:0.9rem;">بەرهەم هەڵبژێرە بۆ پێشبینین</div>';
    return;
  }

  var tSize = $("#barcodeThermalSizeSelect") ? $("#barcodeThermalSizeSelect").value : "40x25";
  var rW = (tSize === "50x30") ? 50 : (tSize === "60x40") ? 60 : 40;
  var rH = (tSize === "50x30") ? 30 : (tSize === "60x40") ? 40 : 25;

  var opts = {
    showStoreName: $("#lblOptStoreName") ? $("#lblOptStoreName").checked : true,
    showProductName: $("#lblOptProductName") ? $("#lblOptProductName").checked : true,
    showPrice: $("#lblOptPriceIQD") ? $("#lblOptPriceIQD").checked : true,
    showUSD: $("#lblOptPriceUSD") ? $("#lblOptPriceUSD").checked : true,
    showBarcodeDigits: $("#lblOptBarcodeDigits") ? $("#lblOptBarcodeDigits").checked : true,
    showExpiry: $("#lblOptExpiry") ? $("#lblOptExpiry").checked : false,
    scaleWeight: parseFloat($("#barcodeScaleWeightInput") ? $("#barcodeScaleWeightInput").value : 1.0) || 1.0,
    rollWidth: rW,
    rollHeight: rH,
    qrMm: 18
  };

  var settings = DB.settings || { marketName: getStoreName(), exchangeRate: 1500 };
  var tmpl = BARCODE_STUDIO_STATE.template || 'thermal';
  if (BARCODE_STUDIO_STATE.scope === "create" && product && !product.barcode) {
    if (tmpl === "design" && window.BarcodeDesigner) {
      product = Object.assign({}, product, { barcode: "0000" });
    } else {
      preview.innerHTML = '<div style="padding:30px;color:#999;font-size:0.9rem;">ناوی کاڵا بنووسە و ژمارەی بارکۆد دروست بکە</div>';
      return;
    }
  }
  if (tmpl === 'qr') {
    opts.rollWidth = 80;
    opts.rollHeight = 52;
    opts.qrMm = 18;
  }
  var labelHtml = "";

  if (tmpl === 'shelf') {
    labelHtml = BarcodeGen.renderShelfTagHtml(product, settings, opts);
  } else if (tmpl === 'scale') {
    labelHtml = BarcodeGen.renderScaleLabelHtml(product, settings, opts);
  } else if (tmpl === 'qr') {
    labelHtml = BarcodeGen.renderQrStickerHtml(product, settings, opts);
  } else {
    labelHtml = (typeof BarcodeGen.renderBillBarcodeHtml === "function")
      ? BarcodeGen.renderBillBarcodeHtml(product, settings, opts)
      : BarcodeGen.renderThermalStickerHtml(product, settings, opts);
  }

  preview.setAttribute("dir", "ltr");
  preview.style.direction = "ltr";
  preview.style.background = getLabelPaperColorsSafe().paper;
  preview.style.boxShadow = "0 12px 30px rgba(0,0,0,0.28)";
  preview.style.padding = "";
  preview.style.borderRadius = "4px";

  if (tmpl === "design" && window.BarcodeDesigner) {
    BarcodeDesigner.mountPreview(preview, product, settings);
    return;
  }

  preview.innerHTML = labelHtml;
}

function wrapBarcodePrintHtml(innerCss, labelsHtml) {
  var t = getLabelPaperColorsSafe();
  return '<!DOCTYPE html><html lang="ku" dir="ltr"><head><meta charset="UTF-8"><title>چاپی لەزگە</title><style>' +
    '@page{size:80mm auto;margin:0;}' +
    '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
    'html,body{margin:0;padding:0;height:auto!important;min-height:0!important;background:' + t.paper + ';color:' + t.ink + ';direction:ltr;}' +
    '.thermal-name,.bc-name,.shelf-name,.qr-name,.scale-name,.thermal-store,.bc-store,.shelf-store,.qr-store,.scale-store{direction:rtl;unicode-bidi:plaintext;text-align:center;}' +
    'svg,text,.thermal-price,.bc-price,.shelf-price,.qr-price,.scale-price,.thermal-bc,.bc-box,.qr-digits,.thermal-usd,.bc-usd{direction:ltr;unicode-bidi:isolate;}' +
    innerCss +
    '</style></head><body>' + labelsHtml + '</body></html>';
}

function buildQrPrintDocument(labelsHtml) {
  var t = getLabelPaperColorsSafe();
  return wrapBarcodePrintHtml(
    '.labels-print-container{width:100%;margin:0;padding:0;background:' + t.paper + ';color:' + t.ink + ';}' +
    '.label-qr{width:100%!important;max-width:100%!important;margin:0;padding:8px 10px 6px!important;background:' + t.paper + ';color:' + t.ink + ';break-inside:avoid;page-break-inside:avoid;overflow:visible!important;text-align:center;}' +
    '.label-qr .qr-box{width:100%;display:flex;justify-content:center;}' +
    '.label-qr .qr-svg,.label-qr svg.qr-svg,.label-qr img.qr-svg{width:18mm!important;height:18mm!important;max-width:18mm!important;display:block!important;margin:0 auto!important;}' +
    '.label-qr .qr-name{font-size:28pt!important;font-weight:900!important;line-height:1.08!important;color:' + t.ink + '!important;margin:2px 0 4px!important;}' +
    '.label-qr .qr-price{font-size:34pt!important;font-weight:900!important;color:' + t.ink + '!important;line-height:1!important;}' +
    '.label-qr .qr-usd{font-size:14pt!important;font-weight:800!important;}' +
    '.label-qr .qr-price-row{margin:0 0 6px!important;padding-bottom:4px!important;border-bottom:2px solid ' + t.ink + '!important;}' +
    '.label-qr .qr-digits{font-size:8pt!important;}' +
    '.qr-cut{width:100%;text-align:center;font-size:12px;letter-spacing:2px;color:' + t.ink + ';padding:8px 0;border-top:1px dashed ' + t.ink + ';}',
    '<div class="labels-print-container">' + labelsHtml + '</div>'
  );
}

function buildBarcodePrintDocument(labelsHtml) {
  var t = getLabelPaperColorsSafe();
  return wrapBarcodePrintHtml(
    '.labels-print-container{width:100%;margin:0;padding:0;background:' + t.paper + ';color:' + t.ink + ';}' +
    '.label-barcode{width:100%!important;max-width:100%!important;margin:0;padding:8px 10px 6px!important;background:' + t.paper + ';color:' + t.ink + ';break-inside:avoid;page-break-inside:avoid;overflow:visible!important;text-align:center;}' +
    '.label-barcode .bc-box{width:100%;display:flex;justify-content:center;background:' + t.paper + ';}' +
    '.label-barcode .bc-name{font-size:28pt!important;font-weight:900!important;line-height:1.08!important;color:' + t.ink + '!important;margin:2px 0 4px!important;}' +
    '.label-barcode .bc-price{font-size:34pt!important;font-weight:900!important;color:' + t.ink + '!important;line-height:1!important;}' +
    '.label-barcode .bc-usd{font-size:14pt!important;font-weight:800!important;}' +
    '.label-barcode .bc-price-row{margin:0 0 6px!important;padding-bottom:4px!important;border-bottom:2px solid ' + t.ink + '!important;}' +
    '.label-barcode svg{width:100%!important;max-width:100%!important;height:72px!important;display:block!important;margin:0 auto!important;background:' + t.paper + ';}' +
    '.bc-cut{width:100%;text-align:center;font-size:12px;letter-spacing:2px;color:' + t.ink + ';padding:8px 0;border-top:1px dashed ' + t.ink + ';}',
    '<div class="labels-print-container">' + labelsHtml + '</div>'
  );
}

function printBarcodeBillJobs(items, settings, opts) {
  if (!items || !items.length) return;

  function sendOne(idx) {
    if (idx >= items.length) return;
    var prod = items[idx];
    var block = (typeof BarcodeGen.renderBillBarcodeHtml === "function")
      ? BarcodeGen.renderBillBarcodeHtml(prod, settings, opts)
      : BarcodeGen.renderThermalStickerHtml(prod, settings, opts);
    var html = buildBarcodePrintDocument(block);
    if (typeof ImmediatePrinter !== "undefined") {
      ImmediatePrinter.print(html, { pageSize: "80mm auto", skipDebounce: true, kickDrawer: false, tightCut: true });
    } else {
      try { window.print(); } catch (e) {}
    }
    if (idx + 1 < items.length) {
      setTimeout(function () { sendOne(idx + 1); }, 700);
    }
  }

  sendOne(0);
  if (window.PosSound) PosSound.playSuccessChime();
}

function printQrLabelJobs(items, settings, opts) {
  if (!items || !items.length) return;

  function sendOne(idx) {
    if (idx >= items.length) return;
    var block = BarcodeGen.renderQrStickerHtml(items[idx], settings, opts);
    var html = buildQrPrintDocument(block);
    if (typeof ImmediatePrinter !== "undefined") {
      ImmediatePrinter.print(html, { pageSize: "80mm auto", skipDebounce: true, kickDrawer: false, tightCut: true });
    } else {
      try { window.print(); } catch (e) {}
    }
    if (idx + 1 < items.length) {
      setTimeout(function () { sendOne(idx + 1); }, 700);
    }
  }

  sendOne(0);
  if (window.PosSound) PosSound.playSuccessChime();
}

function printBarcodeLabels(isTestSingle) {
  if (typeof BarcodeGen === "undefined") {
    toast("هەڵە", "کتێبخانەی باڕکۆد بەردەست نییە", "error");
    return;
  }

  var settings = DB.settings || { marketName: getStoreName(), exchangeRate: 1500 };
  var tmpl = BARCODE_STUDIO_STATE.template || 'thermal';
  var scope = BARCODE_STUDIO_STATE.scope || 'single';
  var userCount = parseInt($("#labelCount") ? $("#labelCount").value : 1, 10) || 1;
  var scaleWeight = parseFloat($("#barcodeScaleWeightInput") ? $("#barcodeScaleWeightInput").value : 1.0) || 1.0;

  var tSize = $("#barcodeThermalSizeSelect") ? $("#barcodeThermalSizeSelect").value : "40x25";
  var rW = (tSize === "50x30") ? 50 : (tSize === "60x40") ? 60 : 40;
  var rH = (tSize === "50x30") ? 30 : (tSize === "60x40") ? 40 : 25;

  var opts = {
    showStoreName: $("#lblOptStoreName") ? $("#lblOptStoreName").checked : true,
    showProductName: $("#lblOptProductName") ? $("#lblOptProductName").checked : true,
    showPrice: $("#lblOptPriceIQD") ? $("#lblOptPriceIQD").checked : true,
    showUSD: $("#lblOptPriceUSD") ? $("#lblOptPriceUSD").checked : true,
    showBarcodeDigits: $("#lblOptBarcodeDigits") ? $("#lblOptBarcodeDigits").checked : true,
    showExpiry: $("#lblOptExpiry") ? $("#lblOptExpiry").checked : false,
    scaleWeight: scaleWeight,
    rollWidth: rW,
    rollHeight: rH,
    qrMm: 18
  };
  if (tmpl === 'qr') {
    opts.rollWidth = 80;
    opts.rollHeight = 52;
    opts.qrMm = 18;
  }

  // Determine list of items to print
  var itemsToPrint = [];
  if (scope === 'create') {
    var created = saveCreatedBarcodeProduct({ silent: true });
    if (!created) return;
    var createCopies = isTestSingle ? 1 : userCount;
    for (var ci = 0; ci < createCopies; ci++) itemsToPrint.push(created);
  } else if (scope === 'single') {
    var selId = $("#barcodeProductSelect") ? $("#barcodeProductSelect").value : null;
    var prod = DB.products.find(function(p){ return p.id === selId; });
    if (!prod) { toast("هەڵە", "تکایە بەرهەمێک هەڵبژێرە", "error"); return; }
    var copies = isTestSingle ? 1 : userCount;
    for (var i = 0; i < copies; i++) {
      itemsToPrint.push(prod);
    }
  } else if (scope === 'category') {
    var cat = $("#barcodeCategorySelect") ? $("#barcodeCategorySelect").value : 'all';
    var catProds = (cat === 'all') ? DB.products : DB.products.filter(function(p){ return p.cat === cat; });
    if (catProds.length === 0) { toast("هەڵە", "هیچ بەرهەمێک لەم پۆلەدا نییە", "error"); return; }
    catProds.forEach(function (p) {
      var copies = isTestSingle ? 1 : Math.max(1, userCount);
      for (var k = 0; k < copies; k++) itemsToPrint.push(p);
    });
  } else {
    // All products
    if (DB.products.length === 0) { toast("هەڵە", "هیچ بەرهەمێک لە داتابەیس نییە", "error"); return; }
    DB.products.forEach(function (p) {
      var copies = isTestSingle ? 1 : Math.max(1, userCount);
      for (var k = 0; k < copies; k++) itemsToPrint.push(p);
    });
  }

  if (tmpl === 'design' && window.BarcodeDesigner) {
    BarcodeDesigner.printJobs(itemsToPrint, settings);
    if (!isTestSingle) hideModal("barcodeLabelModal");
    toast("سەرکەوتوو", "فەرمانی چاپی " + itemsToPrint.length + " لەزگەی ستایلی خۆت ئامادەکرا", "success");
    return;
  }

  if (tmpl === 'qr') {
    printQrLabelJobs(itemsToPrint, settings, opts);
    if (!isTestSingle) hideModal("barcodeLabelModal");
    toast("سەرکەوتوو", "فەرمانی چاپی " + itemsToPrint.length + " کۆدی QR ئامادەکرا", "success");
    return;
  }

  if (tmpl === 'thermal') {
    printBarcodeBillJobs(itemsToPrint, settings, opts);
    if (!isTestSingle) hideModal("barcodeLabelModal");
    toast("سەرکەوتوو", "فەرمانی چاپی " + itemsToPrint.length + " بارکۆدی گەورە ئامادەکرا", "success");
    return;
  }

  // Build page size CSS
  var pageCss = "";
  var containerClass = "labels-print-container";
  var printPageSize = "80mm";
  var paperTheme = getLabelPaperColorsSafe();

  if (tmpl === 'shelf') {
    pageCss = "@page { size: 60mm 40mm; margin: 0; }\n" +
              "html, body { width: 60mm; margin: 0; padding: 0; background: " + paperTheme.paper + "; color: " + paperTheme.ink + "; }\n" +
              ".label-shelf { page-break-after: always; width: 60mm !important; min-height: 40mm !important; box-sizing: border-box; text-align: center; }\n" +
              ".label-shelf .shelf-name { font-size: 14pt !important; font-weight: 900 !important; line-height: 1.08 !important; }\n" +
              ".label-shelf .shelf-price { font-size: 20pt !important; font-weight: 900 !important; line-height: 1 !important; }\n" +
              ".label-shelf .shelf-price-row { margin: 0 0 1mm !important; padding-bottom: 0.8mm !important; border-bottom: 2px solid #111 !important; }\n";
  } else if (tmpl === 'scale') {
    pageCss = "@page { size: 50mm 35mm; margin: 0; }\n" +
              "html, body { width: 50mm; margin: 0; padding: 0; background: " + paperTheme.paper + "; color: " + paperTheme.ink + "; }\n" +
              ".label-scale { page-break-after: always; width: 50mm !important; min-height: 35mm !important; box-sizing: border-box; text-align: center; }\n" +
              ".label-scale .scale-name { font-size: 13pt !important; font-weight: 900 !important; line-height: 1.08 !important; }\n" +
              ".label-scale .scale-price { font-size: 18pt !important; font-weight: 900 !important; line-height: 1 !important; }\n" +
              ".label-scale .scale-price-row { margin: 0 0 1mm !important; padding-bottom: 0.7mm !important; border-bottom: 2px solid #111 !important; }\n";
  } else if (tmpl === 'a4') {
    printPageSize = "A4";
    pageCss = "@page { size: A4 portrait; margin: 8mm 6mm; }\n" +
              "html, body { width: 210mm; margin: 0; padding: 0; background: " + paperTheme.paper + "; color: " + paperTheme.ink + "; }\n" +
              ".labels-print-container { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3.5mm; }\n" +
              ".label-thermal { width: 100% !important; border: 1px dashed #ccc !important; min-height: 36mm !important; text-align: center; }\n" +
              ".label-thermal .thermal-name { font-size: 14pt !important; font-weight: 900 !important; line-height: 1.08 !important; }\n" +
              ".label-thermal .thermal-price { font-size: 18pt !important; font-weight: 900 !important; line-height: 1 !important; }\n" +
              ".label-thermal .thermal-price-row { margin: 0 0 1mm !important; padding-bottom: 0.7mm !important; border-bottom: 1.5px solid #111 !important; }\n";
  } else {
    // Thermal (Xprinter roll 40x25, 50x30, 60x40)
    pageCss = "@page { size: " + rW + "mm " + rH + "mm; margin: 0; }\n" +
              "html, body { width: " + rW + "mm; margin: 0; padding: 0; background: " + paperTheme.paper + "; color: " + paperTheme.ink + "; }\n" +
              ".label-thermal { page-break-after: always; width: " + rW + "mm !important; min-height: " + rH + "mm !important; box-sizing: border-box; text-align: center; }\n" +
              ".label-thermal:last-child { page-break-after: auto; }\n" +
              ".label-thermal .thermal-name { font-size: " + (rW >= 50 ? "13" : "11") + "pt !important; font-weight: 900 !important; line-height: 1.08 !important; }\n" +
              ".label-thermal .thermal-price { font-size: " + (rW >= 50 ? "16" : "14") + "pt !important; font-weight: 900 !important; line-height: 1 !important; }\n" +
              ".label-thermal .thermal-price-row { margin: 0 0 0.8mm !important; padding-bottom: 0.6mm !important; border-bottom: 1.5px solid #111 !important; }\n";
  }

  // Generate labels HTML
  var labelsHtml = itemsToPrint.map(function (prod) {
    if (tmpl === 'shelf') return BarcodeGen.renderShelfTagHtml(prod, settings, opts);
    if (tmpl === 'scale') return BarcodeGen.renderScaleLabelHtml(prod, settings, opts);
    return BarcodeGen.renderThermalStickerHtml(prod, settings, opts);
  }).join("\n");

  var printDocHtml = wrapBarcodePrintHtml(pageCss, '<div class="' + containerClass + '">' + labelsHtml + '</div>');

  // Use hidden iframe for clean printing
  if (typeof ImmediatePrinter !== "undefined") {
    ImmediatePrinter.print(printDocHtml, { pageSize: printPageSize, skipDebounce: true });
    if (window.PosSound) PosSound.playSuccessChime();
  } else {
    try { window.print(); } catch (e) {}
  }

  if (!isTestSingle) {
  hideModal("barcodeLabelModal");
  }
  toast("سەرکەوتوو", "فەرمانی چاپی " + itemsToPrint.length + " لەزگە ئامادەکرا و نێردرا", "success");
}

/* ═══ EXPENSES (مەسرەف و خەرجی) ═══ */

var EXPENSE_CATEGORIES = {
  electricity: { name: "کارەبا و مۆلیدە", icon: "fa-bolt", color: "#f59e0b" },
  items: { name: "کڕینی کاڵا و پێداویستی", icon: "fa-shopping-basket", color: "#38bdf8" },
  rent: { name: "کرێی دوکان و باڵەخانە", icon: "fa-building", color: "#ec4899" },
  salary: { name: "مووچە و دەستحەق", icon: "fa-users", color: "#10b981" },
  daily_petty: { name: "خەرجی ڕۆژانە / نان و چای", icon: "fa-coffee", color: "#f97316" },
  cleaning: { name: "پاککەرەوە و خاوێنکردنەوە", icon: "fa-broom", color: "#06b6d4" },
  maintenance: { name: "چاککردنەوە و ئامێرەکان", icon: "fa-tools", color: "#8b5cf6" },
  transport: { name: "گواستنەوە و بەنزین", icon: "fa-truck", color: "#64748b" },
  damaged_waste: { name: "خەسارەت / تەلەف و بەسەرچوو", icon: "fa-trash-alt", color: "#ef4444" },
  other: { name: "خەرجی تری جۆراوجۆر", icon: "fa-receipt", color: "#94a3b8" }
};

var EXPENSE_CATEGORY_SELECT_OPTIONS = [
  { id: "electricity", label: "⚡ کارەبا و مۆلیدە (Electricity & Generator)" },
  { id: "items", label: "🛒 کڕینی کاڵا و پێداویستی مارکێت (Items & Supplies)" },
  { id: "rent", label: "🏢 کرێی دوکان و باڵەخانە (Rent)" },
  { id: "salary", label: "👥 مووچە و دەستحەق (Salary & Labor)" },
  { id: "daily_petty", label: "☕ خەرجی ڕۆژانە / نان و چای (Daily Food & Hospitality)" },
  { id: "cleaning", label: "🧹 پاککەرەوە و خاوێنکردنەوە (Cleaning)" },
  { id: "maintenance", label: "🔧 چاککردنەوە و ئامێرەکان (Maintenance)" },
  { id: "transport", label: "🚚 گواستنەوە و بەنزین (Transport & Fuel)" },
  { id: "damaged_waste", label: "🗑️ خەسارەت / کاڵای تەلەف و بەسەرچوو (Damaged / Expired Stock)" },
  { id: "other", label: "📝 خەرجی تری جۆراوجۆر (Other Expenses)" }
];

function expenseCatEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isCustomExpenseCatKey(key) {
  return String(key || "").indexOf("custom:") === 0;
}

function customExpenseCatKey(id) {
  return "custom:" + String(id || "");
}

function getCustomExpenseCategories() {
  var s = (typeof DB !== "undefined" && DB.settings) ? DB.settings : {};
  var list = s.customExpenseCategories;
  if (!Array.isArray(list)) list = [];
  return list.filter(function (x) { return x && x.id && String(x.name || "").trim(); });
}

function persistCustomExpenseCategories(list) {
  if (typeof DB === "undefined") return;
  if (!DB.settings) DB.settings = {};
  DB.settings.customExpenseCategories = list || [];
  if (typeof DataStore !== "undefined" && DataStore.saveSettings) DataStore.saveSettings();
}

function findCustomExpenseCategory(key) {
  if (!isCustomExpenseCatKey(key)) return null;
  var id = String(key).slice(7);
  var list = getCustomExpenseCategories();
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].id) === String(id)) return list[i];
  }
  return null;
}

function getExpenseCategoryInfo(catKey) {
  if (EXPENSE_CATEGORIES[catKey]) return EXPENSE_CATEGORIES[catKey];
  var custom = findCustomExpenseCategory(catKey);
  if (custom) {
    return { name: custom.name, icon: custom.icon || "fa-tag", color: custom.color || "#a78bfa" };
  }
  var lower = String(catKey || "").toLowerCase();
  for (var k in EXPENSE_CATEGORIES) {
    if (k === lower || EXPENSE_CATEGORIES[k].name === catKey) return EXPENSE_CATEGORIES[k];
  }
  var customs = getCustomExpenseCategories();
  for (var c = 0; c < customs.length; c++) {
    if (String(customs[c].name) === String(catKey)) {
      return { name: customs[c].name, icon: customs[c].icon || "fa-tag", color: customs[c].color || "#a78bfa" };
    }
  }
  return { name: catKey || "مەسرەف", icon: "fa-receipt", color: "#94a3b8" };
}

function rebuildExpenseCategorySelect(selected) {
  var sel = $("#expenseCategory");
  if (!sel) return;
  var keep = selected != null ? String(selected) : String(sel.value || "electricity");
  var html = "";
  EXPENSE_CATEGORY_SELECT_OPTIONS.forEach(function (opt) {
    html += '<option value="' + expenseCatEsc(opt.id) + '">' + expenseCatEsc(opt.label) + "</option>";
  });
  var customs = getCustomExpenseCategories();
  if (customs.length) {
    html += '<optgroup label="جۆرەکانی خۆم">';
    customs.forEach(function (c) {
      html += '<option value="' + expenseCatEsc(customExpenseCatKey(c.id)) + '">📌 ' + expenseCatEsc(c.name) + "</option>";
    });
    html += "</optgroup>";
  }
  html += '<option value="__custom_new__">✏️ جۆری خۆم بنووسە...</option>';
  sel.innerHTML = html;
  sel.value = keep;
  if (sel.value !== keep) {
    sel.value = isCustomExpenseCatKey(keep) ? "__custom_new__" : "electricity";
  }
}

function rebuildExpenseCategoryFilter() {
  var sel = $("#expenseCategoryFilter");
  if (!sel) return;
  var keep = sel.value || "all";
  var html = '<option value="all">-- هەموو پۆلەکان --</option>';
  EXPENSE_CATEGORY_SELECT_OPTIONS.forEach(function (opt) {
    var shortName = (EXPENSE_CATEGORIES[opt.id] && EXPENSE_CATEGORIES[opt.id].name) || opt.label;
    html += '<option value="' + expenseCatEsc(opt.id) + '">' + expenseCatEsc(opt.label.split(" (")[0] || shortName) + "</option>";
  });
  getCustomExpenseCategories().forEach(function (c) {
    html += '<option value="' + expenseCatEsc(customExpenseCatKey(c.id)) + '">📌 ' + expenseCatEsc(c.name) + "</option>";
  });
  sel.innerHTML = html;
  sel.value = keep;
  if (sel.value !== keep) sel.value = "all";
}

function syncExpenseCustomCatButtons() {
  var sel = $("#expenseCategory");
  var wrap = $("#expenseCustomCatWrap");
  var inp = $("#expenseCustomCatName");
  var editBtn = $("#expenseCustomCatEditBtn");
  var delBtn = $("#expenseCustomCatDeleteBtn");
  var v = sel ? String(sel.value || "") : "";
  var isNew = v === "__custom_new__";
  var isCustom = isCustomExpenseCatKey(v);
  if (wrap) wrap.style.display = (isNew || isCustom) ? "block" : "none";
  if (isCustom) {
    var found = findCustomExpenseCategory(v);
    if (inp && found) inp.value = found.name;
  } else if (isNew) {
    if (inp && document.activeElement !== inp) inp.value = inp.value || "";
  }
  var canMutate = isCustom;
  if (editBtn) editBtn.disabled = !canMutate;
  if (delBtn) delBtn.disabled = !canMutate;
}

function onExpenseCategoryChange() {
  var sel = $("#expenseCategory");
  var inp = $("#expenseCustomCatName");
  var v = sel ? String(sel.value || "") : "";
  if (v === "__custom_new__") {
    if (inp) {
      inp.value = "";
      setTimeout(function () { try { inp.focus(); } catch (eF) {} }, 40);
    }
  } else if (!isCustomExpenseCatKey(v) && inp) {
    inp.value = "";
  }
  syncExpenseCustomCatButtons();
}

function upsertCustomExpenseCategory(name, existingKey) {
  name = String(name || "").trim();
  if (!name) return null;
  var list = getCustomExpenseCategories();
  if (existingKey && isCustomExpenseCatKey(existingKey)) {
    var eid = String(existingKey).slice(7);
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(eid)) {
        list[i].name = name;
        persistCustomExpenseCategories(list);
        return customExpenseCatKey(list[i].id);
      }
    }
  }
  for (var j = 0; j < list.length; j++) {
    if (String(list[j].name).trim() === name) {
      return customExpenseCatKey(list[j].id);
    }
  }
  var item = { id: gid(), name: name, icon: "fa-tag", color: "#a78bfa" };
  list.push(item);
  persistCustomExpenseCategories(list);
  return customExpenseCatKey(item.id);
}

function saveCustomExpenseCategory() {
  var inp = $("#expenseCustomCatName");
  var name = inp ? String(inp.value || "").trim() : "";
  if (!name) {
    toast("ئاگاداری", "تکایە ناوی جۆری مەسرەف بنووسە", "warning");
    if (inp) inp.focus();
    return;
  }
  var sel = $("#expenseCategory");
  var current = sel ? sel.value : "";
  var key = upsertCustomExpenseCategory(name, isCustomExpenseCatKey(current) ? current : null);
  if (!key) return;
  rebuildExpenseCategorySelect(key);
  rebuildExpenseCategoryFilter();
  syncExpenseCustomCatButtons();
  toast("سەرکەوتوو", isCustomExpenseCatKey(current) ? "جۆرەکە نوێکرایەوە" : "جۆرەکە پاشکەوت کرا", "success");
}

function editCustomExpenseCategory() {
  var sel = $("#expenseCategory");
  var current = sel ? sel.value : "";
  if (!isCustomExpenseCatKey(current)) {
    toast("ئاگاداری", "سەرەتا جۆرێکی خۆت هەڵبژێرە، پاشان دەستکاری بکە", "warning");
    return;
  }
  var inp = $("#expenseCustomCatName");
  var name = inp ? String(inp.value || "").trim() : "";
  var found = findCustomExpenseCategory(current);
  if (!name) {
    if (inp) {
      if (found) inp.value = found.name;
      inp.focus();
      try { inp.select(); } catch (eS) {}
    }
    toast("دەستکاری", "ناوەکە بگۆڕە و پاشان پاشکەوت بکە", "info");
    return;
  }
  if (found && found.name === name) {
    if (inp) {
      inp.focus();
      try { inp.select(); } catch (eS2) {}
    }
    toast("دەستکاری", "ناوەکە بگۆڕە و پاشان پاشکەوت بکە", "info");
    return;
  }
  saveCustomExpenseCategory();
}

function deleteCustomExpenseCategory() {
  var sel = $("#expenseCategory");
  var current = sel ? sel.value : "";
  if (!isCustomExpenseCatKey(current)) {
    toast("ئاگاداری", "تەنها جۆرەکانی خۆت دەتوانرێت بسڕدرێنەوە", "warning");
    return;
  }
  var found = findCustomExpenseCategory(current);
  var label = found ? found.name : "ئەم جۆرە";
  if (!confirm("ئایا دڵنیایت لە سڕینەوەی جۆری «" + label + "»؟")) return;
  var id = String(current).slice(7);
  var list = getCustomExpenseCategories().filter(function (x) { return String(x.id) !== String(id); });
  persistCustomExpenseCategories(list);
  rebuildExpenseCategorySelect("electricity");
  rebuildExpenseCategoryFilter();
  var inp = $("#expenseCustomCatName");
  if (inp) inp.value = "";
  syncExpenseCustomCatButtons();
  toast("سڕایەوە", "جۆرەکە سڕایەوە", "success");
}

window.onExpenseCategoryChange = onExpenseCategoryChange;
window.saveCustomExpenseCategory = saveCustomExpenseCategory;
window.editCustomExpenseCategory = editCustomExpenseCategory;
window.deleteCustomExpenseCategory = deleteCustomExpenseCategory;

function openExpenseModal() {
  rebuildExpenseCategorySelect("electricity");
  rebuildExpenseCategoryFilter();
  if ($("#expenseCategory")) $("#expenseCategory").value = "electricity";
  if ($("#expenseCustomCatName")) $("#expenseCustomCatName").value = "";
  if ($("#expenseAmount")) $("#expenseAmount").value = "";
  if ($("#expenseDescription")) $("#expenseDescription").value = "";
  if ($("#expensePaidFrom")) $("#expensePaidFrom").value = "owner";
  syncExpenseCustomCatButtons();

  if ($("#expenseDate")) {
    var now = new Date();
    var localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $("#expenseDate").value = localIso;
  }
  showModal("expenseModal");
  setTimeout(function () {
    var amt = $("#expenseAmount");
    if (amt) {
      amt.focus();
      amt.select();
    }
  }, 120);
}

var SAVE_EXPENSE_BUSY = false;

function saveExpense() {
  if (SAVE_EXPENSE_BUSY) return;
  var catSelect = $("#expenseCategory");
  var category = catSelect ? catSelect.value : "other";
  if (category === "__custom_new__" || isCustomExpenseCatKey(category)) {
    var typedName = ($("#expenseCustomCatName") ? String($("#expenseCustomCatName").value || "").trim() : "");
    if (category === "__custom_new__") {
      if (!typedName) {
        toast("ئاگاداری", "تکایە جۆری مەسرەفەکە بنووسە، یان پۆلێکی ئامادە هەڵبژێرە", "warning");
        var cInp = $("#expenseCustomCatName");
        if (cInp) cInp.focus();
        return;
      }
      category = upsertCustomExpenseCategory(typedName, null);
      rebuildExpenseCategorySelect(category);
      rebuildExpenseCategoryFilter();
    } else if (typedName && findCustomExpenseCategory(category) && findCustomExpenseCategory(category).name !== typedName) {
      category = upsertCustomExpenseCategory(typedName, category);
    }
  }
  var amount = parseFloat($("#expenseAmount") ? $("#expenseAmount").value : 0) || 0;
  var description = ($("#expenseDescription") ? $("#expenseDescription").value : "").trim();
  var paidFrom = $("#expensePaidFrom") ? $("#expensePaidFrom").value : "owner";
  var dateInput = $("#expenseDate");
  var expenseDate = (dateInput && dateInput.value) ? new Date(dateInput.value).toISOString() : new Date().toISOString();

  if (amount <= 0) {
    toast("ئاگاداری", "تکایە بڕی پارەی مەسرەفەکە بە دروستی بنووسە", "warning");
    if (typeof PosAudio !== "undefined") PosAudio.playErrorBuzz();
    return;
  }

  SAVE_EXPENSE_BUSY = true;
  setTimeout(function () { SAVE_EXPENSE_BUSY = false; }, 1200);

  var catInfo = getExpenseCategoryInfo(category);
  var descNorm = description || catInfo.name;
  var dupRecent = (DB.expenses || []).some(function (x) {
    if (!x) return false;
    if (Math.abs((parseFloat(x.amount) || 0) - amount) > 0.5) return false;
    if (String(x.category || "") !== String(category)) return false;
    if (String(x.paidFrom || "") !== String(paidFrom)) return false;
    if (String(x.description || "") !== String(descNorm)) return false;
    var dt = Date.parse(x.date || "") || 0;
    return dt && (Date.now() - dt) < 2500;
  });
  if (dupRecent) {
    hideModal("expenseModal");
    toast("تۆمارکرا", "ئەم مەسرەفە پێشتر تۆمارکراوە", "info");
    return;
  }
  var expense = {
    id: gid(),
    category: category,
    categoryName: catInfo.name,
    amount: amount,
    description: description || catInfo.name,
    paidFrom: paidFrom,
    date: expenseDate,
    shiftId: (paidFrom === 'drawer' && CURRENT_SHIFT) ? CURRENT_SHIFT.id : null,
    addedBy: getActiveOperatorName()
  };
  if (typeof BranchManager !== "undefined" && BranchManager.stamp) BranchManager.stamp(expense);

  // If paid from active cashier drawer, deduct from shift drawer cash movements!
  if (paidFrom === 'drawer' && CURRENT_SHIFT) {
    if (!DB.cashMovements) DB.cashMovements = [];
    DB.cashMovements.push({
      id: gid(),
      shiftId: CURRENT_SHIFT.id,
      type: 'out',
      amount: amount,
      reason: 'مەسرەف: ' + catInfo.name + (description ? ' (' + description + ')' : ''),
      cashier: getActiveOperatorName(),
      date: expenseDate
    });
    if (typeof DataStore !== 'undefined' && DataStore.saveCashMovements) DataStore.saveCashMovements();
  }

  if (!DB.expenses) DB.expenses = [];
  var already = DB.expenses.some(function (x) { return x && x.id === expense.id; });
  if (already) {
    SAVE_EXPENSE_BUSY = false;
    return;
  }
  DB.expenses.push(expense);
  DataStore.saveExpenses();

  if (typeof ApiClient !== "undefined" && ApiClient.isOnline) {
    fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Branch-Id': (typeof BranchManager !== "undefined" ? BranchManager.currentId() : "br_main") },
      body: JSON.stringify(expense)
    }).catch(function (e) { console.warn("API sync expense failed", e); });
  }

  hideModal("expenseModal");
  toast("سەرکەوتوو", "مەسرەفەکە بە سەرکەوتوویی تۆمارکرا", "success");
  if (typeof PosAudio !== "undefined") PosAudio.playCashChime();

  if (typeof renderExpenses === "function") renderExpenses();
  if (typeof renderProfitReport === "function") renderProfitReport(window.CURRENT_PROFIT_PERIOD || 'today');
  if (typeof renderReportsProfitTab === "function" && window.CURRENT_REPORT_TAB === 'profit') renderReportsProfitTab($("#reportContent"));
  if (typeof renderDashboard === "function") renderDashboard();
  if (typeof ShiftsManager !== "undefined" && typeof ShiftsManager.recalcHandover === "function") {
    ShiftsManager.recalcHandover();
  }
  renderReports();
}

function deleteExpense(id) {
  var exp = (DB.expenses || []).find(function (e) { return e.id === id; });
  if (!exp) return;
  if (!confirm("ئایا دڵنیایت لە سڕینەوەی ئەم مەسرەفە بە بڕی " + fmt(exp.amount) + "؟")) return;
  DB.expenses = DB.expenses.filter(function (e) { return e.id !== id; });
  DataStore.saveExpenses();

  if (typeof ApiClient !== "undefined" && ApiClient.isOnline) {
    fetch('/api/expenses/' + id, { method: 'DELETE' }).catch(function (e) { console.warn("API delete expense failed", e); });
  }

  toast("سەرکەوتوو", "مەسرەفەکە سڕایەوە", "success");
  if (typeof renderExpenses === "function") renderExpenses();
  if (typeof renderProfitReport === "function") renderProfitReport(window.CURRENT_PROFIT_PERIOD || 'today');
  if (typeof renderReportsProfitTab === "function" && window.CURRENT_REPORT_TAB === 'profit') renderReportsProfitTab($("#reportContent"));
  if (typeof renderDashboard === "function") renderDashboard();
  if (typeof ShiftsManager !== "undefined" && typeof ShiftsManager.recalcHandover === "function") {
    ShiftsManager.recalcHandover();
  }
  renderReports();
}

/* ═══ SETTINGS ═══ */

var CURRENT_SETTINGS_TAB = "store";

function selectSettingsTab(tab) {
  CURRENT_SETTINGS_TAB = tab || "store";
  if (CURRENT_SETTINGS_TAB === "branches" && typeof BranchManager !== "undefined" && BranchManager.renderSettingsPanel) {
    BranchManager.renderSettingsPanel();
  }
  document.querySelectorAll("#settingsSection [data-set-tab]").forEach(function (el) {
    var tags = String(el.getAttribute("data-set-tab") || "").split(",").map(function (s) { return s.trim(); });
    var show = tags.indexOf(CURRENT_SETTINGS_TAB) !== -1;
    if (!show) {
      el.style.display = "none";
      return;
    }
    el.style.display = el.classList.contains("chart-card") ? "block" : "grid";
  });
  document.querySelectorAll("[data-set-hub-tab]").forEach(function (btn) {
    if (btn.getAttribute("data-set-hub-tab") === CURRENT_SETTINGS_TAB) btn.classList.add("active");
    else btn.classList.remove("active");
  });
  if (CURRENT_SETTINGS_TAB === "print") {
    try { renderBillStylePicker(); updateLiveReceiptPreview(); } catch (ePrint) {}
  }
  if (CURRENT_SETTINGS_TAB === "reset") {
    try {
      if (!SALES_CLEAR_MODE) setSalesClearMode("");
      refreshSalesResetPreview();
    } catch (eReset) {}
  }
}

function renderSettings() {
  if (typeof BackupRestore !== "undefined" && BackupRestore.refreshDbStats) {
    try { BackupRestore.refreshDbStats(); } catch (eStats) {}
  }
  selectSettingsTab(CURRENT_SETTINGS_TAB || "store");
  if (typeof BranchManager !== "undefined" && BranchManager.renderSettingsPanel) BranchManager.renderSettingsPanel();
  renderThemeSwitcher();
  if (DB.settings) {
    if ($("#setMarketName")) {
      var savedName = DB.settings.marketName || "";
      $("#setMarketName").value = isFactoryBrandName(savedName) ? "" : savedName;
    }
    if ($("#setMarketTagline")) $("#setMarketTagline").value = DB.settings.marketTagline || "";
    if ($("#setPhone")) $("#setPhone").value = DB.settings.phone || "";
    if ($("#setAddress")) $("#setAddress").value = DB.settings.address || "";
    if ($("#setTaxId")) $("#setTaxId").value = DB.settings.taxId || "";
    if ($("#setLicenseNumber")) $("#setLicenseNumber").value = DB.settings.licenseNumber || "";
    if ($("#setEmail")) $("#setEmail").value = DB.settings.email || "";
    if ($("#setWebsite")) $("#setWebsite").value = DB.settings.website || "";
    if ($("#setCashier")) $("#setCashier").value = DB.settings.cashier || "کاشیر";
    if ($("#setReceiptHeader")) $("#setReceiptHeader").value = DB.settings.receiptHeader || "";
    if ($("#setReceiptFooter")) $("#setReceiptFooter").value = DB.settings.receiptFooter || "";
    if ($("#setPrintType")) $("#setPrintType").value = DB.settings.printType || "thermal";
    if ($("#setPrintMode")) $("#setPrintMode").value = DB.settings.printMode || "direct";
    if ($("#setSelectedPrinter") && typeof ImmediatePrinter !== "undefined") {
      ImmediatePrinter.populatePrinterSelect($("#setSelectedPrinter"), DB.settings.selectedPrinter);
    }
    if ($("#setAutoPrint")) $("#setAutoPrint").value = DB.settings.autoPrint || "on";
    if ($("#setShowLogo")) $("#setShowLogo").value = DB.settings.showLogo || "on";
    if ($("#setShowBarcode")) $("#setShowBarcode").value = DB.settings.showBarcode || "on";
    if ($("#setCurrency")) $("#setCurrency").value = DB.settings.currency || "IQD";
    if ($("#setSecondaryCurrency")) $("#setSecondaryCurrency").value = DB.settings.secondaryCurrency || "";
    if ($("#setExchangeRate")) $("#setExchangeRate").value = DB.settings.exchangeRate || "";
    if ($("#setCurrencyPosition")) $("#setCurrencyPosition").value = DB.settings.currencyPosition || "before";
    if ($("#setDecimalPlaces")) $("#setDecimalPlaces").value = DB.settings.decimalPlaces || 0;
    if ($("#setThousandsSeparator")) $("#setThousandsSeparator").value = DB.settings.thousandsSeparator || ",";
    if ($("#setTaxType")) $("#setTaxType").value = DB.settings.taxType || "exclusive";
    if ($("#setTaxRate")) $("#setTaxRate").value = DB.settings.taxRate || 0;
    if ($("#setTaxName")) $("#setTaxName").value = DB.settings.taxName || "";
    if ($("#setTaxNumber")) $("#setTaxNumber").value = DB.settings.taxNumber || "";
    if ($("#setLanguage")) $("#setLanguage").value = DB.settings.language || "ku";
    if ($("#setDateFormat")) $("#setDateFormat").value = DB.settings.dateFormat || "dd/mm/yyyy";
    if ($("#setTimeFormat")) $("#setTimeFormat").value = DB.settings.timeFormat || "24";
    if ($("#setLowStockThreshold")) $("#setLowStockThreshold").value = DB.settings.lowStockThreshold || 5;
    if ($("#setExpiryAlertDays")) $("#setExpiryAlertDays").value = DB.settings.expiryAlertDays || 7;
    
    if ($("#setShiftDuration")) $("#setShiftDuration").value = DB.settings.shiftDuration || 8;
    if ($("#setDefaultShift")) $("#setDefaultShift").value = DB.settings.defaultShift || "morning";
    if ($("#setMorningShiftStart")) $("#setMorningShiftStart").value = DB.settings.morningShiftStart || "06:00";
    if ($("#setMorningShiftEnd")) $("#setMorningShiftEnd").value = DB.settings.morningShiftEnd || "14:00";
    if ($("#setAfternoonShiftStart")) $("#setAfternoonShiftStart").value = DB.settings.afternoonShiftStart || "14:00";
    if ($("#setAfternoonShiftEnd")) $("#setAfternoonShiftEnd").value = DB.settings.afternoonShiftEnd || "22:00";
    if ($("#setNightShiftStart")) $("#setNightShiftStart").value = DB.settings.nightShiftStart || "22:00";
    if ($("#setNightShiftEnd")) $("#setNightShiftEnd").value = DB.settings.nightShiftEnd || "06:00";
    if ($("#setOpeningBalance")) $("#setOpeningBalance").value = DB.settings.openingBalance || 0;
    if ($("#setRequireOpenShift")) $("#setRequireOpenShift").value = DB.settings.requireOpenShift || "off";
    if ($("#setAutoCloseShift")) $("#setAutoCloseShift").value = DB.settings.autoCloseShift || "off";
    if ($("#setCashDifferenceWarning")) $("#setCashDifferenceWarning").value = DB.settings.cashDifferenceWarning || "on";
    if ($("#setShiftHandover")) $("#setShiftHandover").value = DB.settings.shiftHandover || "on";
    if ($("#setEndShiftReport")) $("#setEndShiftReport").value = DB.settings.endShiftReport || "on";
    
    if ($("#setDefaultPayment")) $("#setDefaultPayment").value = DB.settings.defaultPayment || "cash";
    if ($("#setAutoSaveCart")) $("#setAutoSaveCart").value = DB.settings.autoSaveCart || "off";
    if ($("#setShowProductCode")) $("#setShowProductCode").value = DB.settings.showProductCode || "on";
    if ($("#setShowStockInPOS")) $("#setShowStockInPOS").value = DB.settings.showStockInPOS || "on";
    if ($("#setMaxReceiptValue")) $("#setMaxReceiptValue").value = DB.settings.maxReceiptValue || 1000000;
    if ($("#setAllowNegative")) $("#setAllowNegative").value = DB.settings.allowNegative || "off";
    if ($("#setAllowManualPrice")) $("#setAllowManualPrice").value = DB.settings.allowManualPrice || "on";
    if ($("#setAllowDiscounts")) $("#setAllowDiscounts").value = DB.settings.allowDiscounts || "on";
    if ($("#setMaxDiscountPercent")) $("#setMaxDiscountPercent").value = DB.settings.maxDiscountPercent || 50;
    if ($("#setAutoFocusBarcode")) $("#setAutoFocusBarcode").value = DB.settings.autoFocusBarcode || "on";
    if ($("#setHoldSale")) $("#setHoldSale").value = DB.settings.holdSale || "on";
    if ($("#setMultipleCustomerTabs")) $("#setMultipleCustomerTabs").value = DB.settings.multipleCustomerTabs || "off";
    if ($("#setOpenCashDrawer")) $("#setOpenCashDrawer").value = DB.settings.openCashDrawer || "on";
    
    if ($("#setLowStockAlert")) $("#setLowStockAlert").value = DB.settings.lowStockAlert || "on";
    if ($("#setLowStockLimit")) $("#setLowStockLimit").value = DB.settings.lowStockLimit || 5;
    if ($("#setExpiryAlert")) $("#setExpiryAlert").value = DB.settings.expiryAlert || "on";
    if ($("#setExpiryDays")) $("#setExpiryDays").value = DB.settings.expiryDays || 7;
    if ($("#setAutoDeductStock")) $("#setAutoDeductStock").value = DB.settings.autoDeductStock || "on";
    if ($("#setAllowOverStock")) $("#setAllowOverStock").value = DB.settings.allowOverStock || "off";
    if ($("#setOutOfStockWarning")) $("#setOutOfStockWarning").value = DB.settings.outOfStockWarning || "on";
    if ($("#setInventoryAuditReminder")) $("#setInventoryAuditReminder").value = DB.settings.inventoryAuditReminder || "on";
    
    if ($("#setCreditLimitEnabled")) {
      var en = DB.settings.creditLimitEnabled;
      $("#setCreditLimitEnabled").value = (en === "off" || en === false || en === 0) ? "off" : "on";
    }
    if ($("#setCreditLimit")) {
      var clFill = parseFloat(DB.settings.creditLimit);
      if (!isFinite(clFill) || clFill < 0) clFill = DEFAULT_DEBT_LIMIT;
      $("#setCreditLimit").value = clFill;
    }
    if (typeof updateCreditLimitSettingsUi === "function") updateCreditLimitSettingsUi();
    if ($("#setLoyaltyRate")) $("#setLoyaltyRate").value = DB.settings.loyaltyRate || 1;
    if ($("#setLoyaltyPoints")) $("#setLoyaltyPoints").value = DB.settings.loyaltyPoints || 1;
    if ($("#setAutoAddCustomer")) $("#setAutoAddCustomer").value = DB.settings.autoAddCustomer || "off";
    if ($("#setRequireCustomerInfo")) $("#setRequireCustomerInfo").value = DB.settings.requireCustomerInfo || "off";
    if ($("#setShowPurchaseHistory")) $("#setShowPurchaseHistory").value = DB.settings.showPurchaseHistory || "on";
    if ($("#setMembershipCards")) $("#setMembershipCards").value = DB.settings.membershipCards || "off";
    
    if ($("#setSupplierPaymentTerms")) $("#setSupplierPaymentTerms").value = DB.settings.supplierPaymentTerms || 30;
    if ($("#setSupplierStockAlert")) $("#setSupplierStockAlert").value = DB.settings.supplierStockAlert || "on";
    if ($("#setAutoPurchaseOrder")) $("#setAutoPurchaseOrder").value = DB.settings.autoPurchaseOrder || "off";
    if ($("#setAutoOrderLimit")) $("#setAutoOrderLimit").value = DB.settings.autoOrderLimit || 10000;
    if ($("#setSupplierCredit")) $("#setSupplierCredit").value = DB.settings.supplierCredit || "off";
    if ($("#setPurchaseApproval")) $("#setPurchaseApproval").value = DB.settings.purchaseApproval || "off";
    if ($("#setPurchaseReturn")) $("#setPurchaseReturn").value = DB.settings.purchaseReturn || "on";
    
    if ($("#setSessionTimeout")) $("#setSessionTimeout").value = DB.settings.sessionTimeout || 30;
    if ($("#setStrongPassword")) $("#setStrongPassword").value = DB.settings.strongPassword || "on";
    if ($("#setAuditLogging")) $("#setAuditLogging").value = DB.settings.auditLogging || "on";
    if ($("#setAutoBackup")) $("#setAutoBackup").value = DB.settings.autoBackup || 60;
    if ($("#setAllowRoleChange")) $("#setAllowRoleChange").value = DB.settings.allowRoleChange || "off";
    if ($("#setAllowDataDeletion")) $("#setAllowDataDeletion").value = DB.settings.allowDataDeletion || "off";
    if ($("#setLoginAttemptLimit")) $("#setLoginAttemptLimit").value = DB.settings.loginAttemptLimit || 5;
    if ($("#setTwoFactorAuth")) $("#setTwoFactorAuth").value = DB.settings.twoFactorAuth || "off";
    
    if ($("#setDefaultReportType")) $("#setDefaultReportType").value = DB.settings.defaultReportType || "daily";
    if ($("#setDefaultExportFormat")) $("#setDefaultExportFormat").value = DB.settings.defaultExportFormat || "pdf";
    if ($("#setHideProductCode")) $("#setHideProductCode").value = DB.settings.hideProductCode || "off";
    if ($("#setShowProfitInReport")) $("#setShowProfitInReport").value = DB.settings.showProfitInReport || "on";
    if ($("#setAutoDailyReport")) $("#setAutoDailyReport").value = DB.settings.autoDailyReport || "off";
    if ($("#setAutoMonthlyReport")) $("#setAutoMonthlyReport").value = DB.settings.autoMonthlyReport || "off";
    
    if ($("#setBarcodeType")) $("#setBarcodeType").value = DB.settings.barcodeType || "EAN13";
    if ($("#setBarcodeLength")) $("#setBarcodeLength").value = DB.settings.barcodeLength || "13";
    if ($("#setAutoGenerateBarcode")) $("#setAutoGenerateBarcode").value = DB.settings.autoGenerateBarcode || "on";
    if ($("#setBarcodePrefix")) $("#setBarcodePrefix").value = DB.settings.barcodePrefix || "";
    if ($("#setBarcodeLabelPrinting")) $("#setBarcodeLabelPrinting").value = DB.settings.barcodeLabelPrinting || "off";
    
    if ($("#setLowStockNotification")) $("#setLowStockNotification").value = DB.settings.lowStockNotification || "on";
    if ($("#setLargeSaleNotification")) $("#setLargeSaleNotification").value = DB.settings.largeSaleNotification || "on";
    if ($("#setLargeSaleThreshold")) $("#setLargeSaleThreshold").value = DB.settings.largeSaleThreshold || 50000;
    if ($("#setExpiryNotification")) $("#setExpiryNotification").value = DB.settings.expiryNotification || "on";
    if ($("#setDebtNotification")) $("#setDebtNotification").value = DB.settings.debtNotification || "on";
    if ($("#setShiftEndNotification")) $("#setShiftEndNotification").value = DB.settings.shiftEndNotification || "on";
    if ($("#setSupplierNotification")) $("#setSupplierNotification").value = DB.settings.supplierNotification || "on";
    if ($("#setDailySummaryAlert")) $("#setDailySummaryAlert").value = DB.settings.dailySummaryAlert || "on";
    
    if ($("#setCash25000")) $("#setCash25000").value = DB.settings.cash25000 || 0;
    if ($("#setCash10000")) $("#setCash10000").value = DB.settings.cash10000 || 0;
    if ($("#setCash5000")) $("#setCash5000").value = DB.settings.cash5000 || 0;
    if ($("#setCash1000")) $("#setCash1000").value = DB.settings.cash1000 || 0;
    if ($("#setCash500")) $("#setCash500").value = DB.settings.cash500 || 0;
    if ($("#setCash250")) $("#setCash250").value = DB.settings.cash250 || 0;
    if ($("#setCash100")) $("#setCash100").value = DB.settings.cash100 || 0;
    if ($("#setCash50")) $("#setCash50").value = DB.settings.cash50 || 0;
    if ($("#setCash25")) $("#setCash25").value = DB.settings.cash25 || 0;
    if ($("#setCash10")) $("#setCash10").value = DB.settings.cash10 || 0;
    if ($("#setCash5")) $("#setCash5").value = DB.settings.cash5 || 0;
    if ($("#setCash1")) $("#setCash1").value = DB.settings.cash1 || 0;
    if ($("#setRequireCashCount")) $("#setRequireCashCount").value = DB.settings.requireCashCount || "on";
    if ($("#setEnableCashDrawer")) $("#setEnableCashDrawer").value = DB.settings.enableCashDrawer || "off";
    if ($("#setAutoOpenDrawer")) $("#setAutoOpenDrawer").value = DB.settings.autoOpenDrawer || "on";
  }
  if (typeof updatePosHeaderInfo === "function") updatePosHeaderInfo();
  renderUsersTable();
  renderPermissionsUI();
  renderLoginLogsUI();
  renderActivityLogsUI();
  renderPriceHistoryUI();
  renderMarketLogoPreview();
  updateLiveReceiptPreview();
  fetchDbBackupInfo();
  updateMarketBrandUI();
  if (typeof FeatureModules !== "undefined") FeatureModules.applyModules();
  if (window.CashierButtons) {
    CashierButtons.render();
    CashierButtons.apply();
  }
}

function userIsOwner(u) {
  if (!u) return false;
  if (typeof AuthService !== "undefined" && AuthService.isOwnerRole) {
    if (AuthService.isOwnerRole(u.role)) return true;
  }
  var uname = String(u.username || "").toLowerCase();
  return uname === "admin" || uname === "smartserve@gmail.iq" || uname === "manager";
}

function buildRoleBadgeHtml(role) {
  var meta = (typeof AuthService !== "undefined" && AuthService.getRoleMeta) ? AuthService.getRoleMeta(role) : { label: role || "کاشیر", color: "#10b981", icon: "fa-user-tag" };
  return '<span style="background:' + meta.color + '22;color:' + meta.color + ';font-weight:700;border:1px solid ' + meta.color + '55;padding:3px 9px;border-radius:6px;display:inline-flex;align-items:center;gap:4px;font-size:0.8rem;"><i class="fas ' + meta.icon + '"></i> ' + meta.label + '</span>';
}

function refreshUsersViews() {
  renderUsersTable();
  if (typeof SwitchCashier !== "undefined" && typeof SwitchCashier.loadCashiers === "function") {
    SwitchCashier.loadCashiers();
  }
}

function renderUsersTable() {
  var tbodies = [$("#usersTableBody"), $("#dedicatedUsersTableBody")].filter(Boolean);
  if (tbodies.length === 0) return;
  if (!DB.users || DB.users.length === 0) {
    tbodies.forEach(function (tbody) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text-muted);">هیچ بەکارهێنەرێک نییە</td></tr>';
    });
    renderDedicatedPermissionsMatrix();
    renderDedicatedLoginLogs();
    return;
  }
  var statusNames = { active: "چالاک", inactive: "ناچالاک" };
  var ownerCount = (typeof AuthService !== "undefined" && AuthService.countMarketOwnerUsers) ? AuthService.countMarketOwnerUsers() : 1;

  var rowsHtml = DB.users.filter(function (u) {
    if (!u) return false;
    if (u.isSystemMaster === true) return false;
    if (typeof AuthService !== "undefined" && AuthService.isMasterUsername && AuthService.isMasterUsername(u.username)) return false;
    return true;
  }).map(function (u) {
    var lastLoginStr = u.lastLogin ? formatSaleDateTime(u.lastLogin) : "-";
    var isCurrentUser = DB.currentUser && (u.id === DB.currentUser.id || u.username === DB.currentUser.username);
    var isOwner = userIsOwner(u);
    var isMaster = false;

    var roleBadge = isMaster
      ? '<span style="background:rgba(56,189,248,0.15);color:#7dd3fc;font-weight:800;border:1px solid rgba(56,189,248,0.4);padding:3px 9px;border-radius:6px;display:inline-flex;align-items:center;gap:4px;font-size:0.78rem;"><i class="fas fa-lock"></i> هەژماری فریاگوزاری — ناگۆڕدرێت</span>'
      : buildRoleBadgeHtml(u.role);

    // Granular allowed pages pill display
    var perms = u.permissions;
    if (typeof perms === "string") {
      try { perms = JSON.parse(perms); } catch (e) { perms = null; }
    }
    var pagesHtml = "";
    if (isOwner) {
      pagesHtml = '<span style="color:#f59e0b;font-size:0.75rem;font-weight:700;display:inline-flex;align-items:center;gap:4px;"><i class="fas fa-check-double"></i> هەموو پەڕەکان</span>';
    } else {
      var allowedList = (typeof AuthService !== "undefined" && AuthService.describePagePermissions)
        ? AuthService.describePagePermissions(perms, u.role)
        : [];
      pagesHtml = '<div style="display:flex;gap:4px;flex-wrap:wrap;max-width:280px;">' +
        allowedList.map(function (p) {
          return '<span style="font-size:0.68rem;padding:2px 6px;border-radius:4px;background:rgba(56,189,248,0.1);color:#38bdf8;border:1px solid rgba(56,189,248,0.2);">' + p + '</span>';
        }).join("") +
        '</div>';
    }

    var sStart = u.shiftStart || "08:00";
    var sEnd = u.shiftEnd || "16:00";
    var sNotify = u.shiftNotifyMinutes != null ? u.shiftNotifyMinutes : 10;
    var shiftCell = '<div style="font-weight:700;font-size:0.8rem;color:#38bdf8;white-space:nowrap;"><i class="fas fa-clock" style="font-size:0.75rem;margin-left:3px;"></i>' + sStart + ' - ' + sEnd + '</div>' +
      '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;white-space:nowrap;"><i class="fas fa-bell" style="color:#f59e0b;font-size:0.65rem;margin-left:3px;"></i>ئاگاداری: ' + sNotify + ' خولەک پێشتر</div>';

    var canDelete = !isMaster && !isCurrentUser && !(isOwner && !isMaster && ownerCount <= 1);
    var actions = isMaster
      ? '<span style="color:#64748b;font-size:0.78rem;font-weight:700;">قفڵکراو</span>'
      : ('<button class="btn btn-sm btn-outline" onclick="editUser(\'' + u.id + '\')"><i class="fas fa-edit"></i> دەستکاری</button>' +
        (canDelete ? ' <button class="btn btn-sm btn-danger" onclick="deleteUser(\'' + u.id + '\')"><i class="fas fa-trash"></i> سڕینەوە</button>' : ''));

    return '<tr>' +
      '<td><strong>' + (u.fullName || u.name) + '</strong>' + (isCurrentUser ? ' <span style="color:var(--success);font-size:0.8rem;font-weight:700;">(تۆ)</span>' : '') + '</td>' +
      '<td>' + (u.username || u.email || "-") + '</td>' +
      '<td>' + (u.phone || "-") + '</td>' +
      '<td>' + roleBadge + '</td>' +
      '<td>' + pagesHtml + '</td>' +
      '<td><span style="color:' + (u.status === "active" ? "var(--success)" : "var(--danger)") + '">' + (statusNames[u.status] || u.status || "چالاک") + '</span></td>' +
      '<td>' + shiftCell + '</td>' +
      '<td>' + lastLoginStr + '</td>' +
      '<td>' + actions + '</td>' +
    '</tr>';
  }).join("");

  tbodies.forEach(function (tbody) {
    tbody.innerHTML = rowsHtml;
  });

  renderDedicatedPermissionsMatrix();
  renderDedicatedLoginLogs();
}

function renderDedicatedPermissionsMatrix() {
  var container = $("#dedicatedPermissionsContainer");
  if (!container) return;
  if (!DB.users || DB.users.length === 0) {
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);">هیچ بەکارهێنەرێک نییە</div>';
    return;
  }

  var pageCols = [
    { key: "pos", label: "POS" },
    { key: "orders", label: "پسوولە" },
    { key: "returnSales", label: "گەڕانەوە" },
    { key: "shifts", label: "شێفت" },
    { key: "products", label: "بەرهەم" },
    { key: "categories", label: "پۆل" },
    { key: "inventory", label: "کۆگا" },
    { key: "barcode", label: "بارکۆد" },
    { key: "suppliers", label: "کۆمپانیا" },
    { key: "customers", label: "کڕیار" },
    { key: "dashboard", label: "داشبۆرد" },
    { key: "users", label: "بەکارهێنەر" },
    { key: "settings", label: "ڕێکخستن" }
  ];
  var html = '<div class="table-wrap" style="max-height:280px;overflow:auto;"><table class="data-table" style="font-size:0.72rem;">' +
    '<thead><tr><th>کاشیر</th><th>ڕۆڵ</th>' + pageCols.map(function (c) { return "<th>" + c.label + "</th>"; }).join("") + "<th>کردار</th></tr></thead><tbody>";

  DB.users.forEach(function (u) {
    var isMgr = userIsOwner(u);
    var perms = u.permissions;
    if (typeof perms === "string") {
      try { perms = JSON.parse(perms); } catch (e) { perms = null; }
    }
    function checkIcon(key) {
      var on = isMgr || (typeof AuthService !== "undefined" && AuthService.pagePermIsOn && AuthService.pagePermIsOn(perms, u.role, key));
      return on ? '<span style="color:#10b981;font-weight:900;">✓</span>' : '<span style="color:#ef4444;font-weight:700;">✗</span>';
    }

    var roleMeta = AuthService.getRoleMeta ? AuthService.getRoleMeta(u.role) : { label: u.role, color: "#10b981" };
    var roleLabel = '<span style="color:' + roleMeta.color + ';font-weight:700;">' + roleMeta.label + '</span>';

    html += '<tr>' +
      '<td><strong>' + (u.fullName || u.name) + '</strong></td>' +
      '<td>' + roleLabel + '</td>' +
      pageCols.map(function (c) { return '<td style="text-align:center;">' + checkIcon(c.key) + "</td>"; }).join("") +
      '<td><button class="btn btn-sm btn-outline" onclick="editUser(\'' + u.id + '\')" style="padding:2px 6px;font-size:0.7rem;"><i class="fas fa-edit"></i></button></td>' +
    '</tr>';
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function renderDedicatedLoginLogs() {
  var container = $("#dedicatedLoginLogsContainer");
  if (!container) return;
  if (!DB.users || DB.users.length === 0) {
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);">هیچ زانیارییەک نییە</div>';
    return;
  }

  var html = '<div style="display:flex;flex-direction:column;gap:8px;">';
  DB.users.forEach(function (u) {
    var isMgr = userIsOwner(u);
    var roleMeta = AuthService.getRoleMeta ? AuthService.getRoleMeta(u.role) : { label: "کاشیر", color: "#10b981" };
    var roleBadge = '<span style="font-size:0.68rem;padding:2px 6px;border-radius:4px;background:' + roleMeta.color + '22;color:' + roleMeta.color + ';font-weight:700;">' + roleMeta.label + '</span>';
    var timeStr = u.lastLogin ? formatSaleDateTime(u.lastLogin) : "تا ئێستا نەچووەتە ژوورەوە";
    var avInitial = (u.fullName || u.name || "C").charAt(0).toUpperCase();

    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<div style="width:34px;height:34px;border-radius:50%;background:' + (roleMeta.color) + ';color:#000;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.85rem;">' + avInitial + '</div>' +
        '<div>' +
          '<div style="font-weight:700;font-size:0.85rem;color:var(--text);">' + (u.fullName || u.name) + '</div>' +
          '<div style="font-size:0.72rem;color:var(--text-muted);">' + (u.username || u.email || "-") + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="text-align:left;">' +
        '<div>' + roleBadge + '</div>' +
        '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;"><i class="fas fa-clock" style="font-size:0.68rem;margin-left:3px;"></i>' + timeStr + '</div>' +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

var EDIT_USER_ID = null;

function applyStaffCredentialFields(role) {
  var pinRole = staffUsesPin(role);
  var label = $("#uPasswordLabel");
  var input = $("#uPassword");
  var hint = $("#uPinHint");
  var confirmWrap = $("#uPasswordConfirmWrap");
  var confirmInput = $("#uPasswordConfirm");
  var confirmLabel = confirmWrap ? confirmWrap.querySelector("label") : null;
  if (pinRole) {
    if (label) label.textContent = EDIT_USER_ID ? "PINـی نوێ (بەجێی بهێڵە ئەگەر ناگۆڕیت)" : "PINـی ٤ ژمارەیی *";
    if (input) {
      input.placeholder = EDIT_USER_ID ? "••••" : "بۆ نموونە 2580";
      input.setAttribute("maxlength", "6");
      input.setAttribute("inputmode", "numeric");
    }
    if (hint) {
      hint.style.display = "";
      hint.textContent = "کاشێر / کۆگا لە شاشەی POS ئەم PINـە دەنوسێت. بەڕێوەبەر وشەی نهێنی خۆی بەکاردەهێنێت.";
    }
    if (confirmWrap) confirmWrap.style.display = "";
    if (confirmLabel) confirmLabel.textContent = EDIT_USER_ID ? "دووبارە PINـی نوێ" : "دووبارە PIN *";
    if (confirmInput) confirmInput.placeholder = "هەمان ٤ ژمارە";
  } else {
    if (label) label.textContent = EDIT_USER_ID ? "وشەی نهێنی نوێ (بەجێی بهێڵە ئەگەر ناگۆڕیت)" : "وشەی نهێنی (ئیمەیل) *";
    if (input) {
      input.placeholder = "لانیکەم ٤ نووسە";
      input.removeAttribute("maxlength");
      input.setAttribute("inputmode", "text");
    }
    if (hint) {
      hint.style.display = "";
      hint.textContent = "ئەدمین و بەڕێوەبەر لە شاشەی کردنەوەی POS بە ئیمەیل و ئەم وشەی نهێنییە دێنە ژوورەوە.";
    }
    if (confirmWrap) confirmWrap.style.display = "";
    if (confirmLabel) confirmLabel.textContent = EDIT_USER_ID ? "دووبارە وشەی نهێنی نوێ" : "دووبارە وشەی نهێنی *";
    if (confirmInput) confirmInput.placeholder = "هەمان وشەی نهێنی";
  }
}

function onUserRoleChanged() {
  var role = $("#uRole") ? $("#uRole").value : "cashier";
  var isManager = typeof AuthService !== "undefined" && AuthService.isOwnerRole ? AuthService.isOwnerRole(role) : (role === "manager" || role === "admin");
  var permNote = $("#uPermNoteManager");
  if (permNote) permNote.style.display = isManager ? "block" : "none";
  var permBoxes = $("#uPermCheckboxes");
  if (permBoxes) {
    var inputs = permBoxes.querySelectorAll("input[type='checkbox']");
    inputs.forEach(function (cb) {
      cb.disabled = isManager;
      if (isManager) cb.checked = true;
    });
    if (!EDIT_USER_ID && !isManager && typeof AuthService !== "undefined" && AuthService.applyFormPagePermissions && AuthService.getDefaultPermissionsForRole) {
      AuthService.applyFormPagePermissions("perm_", AuthService.getDefaultPermissionsForRole(role));
    }
  }
  var titleEl = $("#userModalTitle");
  if (titleEl && !EDIT_USER_ID) {
    var titles = { cashier: "زیادکردنی کاشێر + PIN", admin: "زیادکردنی ئەدمین", manager: "زیادکردنی بەڕێوەبەر", warehouse: "زیادکردنی کارمەندی کۆگا + PIN" };
    titleEl.textContent = titles[role] || "زیادکردنی بەکارهێنەر";
  }
  applyStaffCredentialFields(role);
}
window.onUserRoleChanged = onUserRoleChanged;

function setUserPagePermsAll(on) {
  if (typeof AuthService !== "undefined" && AuthService.setFormPagePermissionsAll) {
    AuthService.setFormPagePermissionsAll("perm_", on);
  }
}
window.setUserPagePermsAll = setUserPagePermsAll;

function openUserModal(id, presetRole) {
  if (!AuthService.canManageUsers()) {
    toast("ڕێگەپێدراو نییە", "تەنها بەڕێوەبەر یان ئەدمین دەتوانێت بەکارهێنەر بەڕێوە ببات", "error");
    return;
  }
  EDIT_USER_ID = id;
  var u = id ? DB.users.find(function (x) { return x.id === id; }) : null;
  if (u && typeof AuthService !== "undefined" && AuthService.isMasterUsername && AuthService.isMasterUsername(u.username)) {
    toast("قفڵکراو", "هەژماری فریاگوزاری SmartServe ناگۆڕدرێت", "warning");
    return;
  }
  var role = u ? (u.role || "cashier") : (presetRole || "cashier");
  if (typeof AuthService !== "undefined" && AuthService.normalizeRole) role = AuthService.normalizeRole(role);
  var titles = {
    cashier: { add: "زیادکردنی کاشیر", edit: "دەستکاری کاشیر" },
    admin: { add: "زیادکردنی ئەدمین", edit: "دەستکاری ئەدمین" },
    manager: { add: "زیادکردنی بەڕێوەبەر", edit: "دەستکاری بەڕێوەبەر" },
    warehouse: { add: "زیادکردنی کارمەندی کۆگا", edit: "دەستکاری کارمەندی کۆگا" }
  };
  var t = titles[role] || titles.cashier;
  $("#userModalTitle").textContent = id ? t.edit : t.add;
  $("#uName").value = u ? (u.fullName || u.name) : "";
  $("#uEmployeeId").value = u ? (u.employeeId || "") : "";
  $("#uEmail").value = u ? (u.username || u.email || "") : "";
  $("#uPhone").value = u ? (u.phone || "") : "";
  $("#uPassword").value = "";
  if ($("#uPasswordConfirm")) $("#uPasswordConfirm").value = "";
  $("#uRole").value = role;
  if ($("#uRole")) { $("#uRole").disabled = false; }
  $("#uSalary").value = u ? (u.salary || 0) : 0;
  $("#uStatus").value = u ? (u.status || "active") : "active";

  var sStart = u && u.shiftStart ? u.shiftStart : "08:00";
  var sEnd = u && u.shiftEnd ? u.shiftEnd : "16:00";
  var sNotify = u && u.shiftNotifyMinutes != null ? u.shiftNotifyMinutes : 10;
  if ($("#uShiftStart")) $("#uShiftStart").value = sStart;
  if ($("#uShiftEnd")) $("#uShiftEnd").value = sEnd;
  if ($("#uShiftNotify")) $("#uShiftNotify").value = String(sNotify);
  if ($("#uShift")) {
    if (sStart === "08:00" && sEnd === "16:00") $("#uShift").value = "morning";
    else if (sStart === "16:00" && (sEnd === "00:00" || sEnd === "24:00" || sEnd === "23:59")) $("#uShift").value = "afternoon";
    else if (sStart === "00:00" && sEnd === "08:00") $("#uShift").value = "night";
    else $("#uShift").value = "custom";
  }

  // Granular page permissions
  var perms = u && u.permissions ? u.permissions : null;
  if (typeof perms === "string") {
    try { perms = JSON.parse(perms); } catch (ePerm) { perms = null; }
  }
  if (!perms) {
    perms = (typeof AuthService !== "undefined" && AuthService.getDefaultPermissionsForRole)
      ? AuthService.getDefaultPermissionsForRole(role)
      : { pos: true, orders: true, returnSales: true, customers: true, shifts: true };
  }
  if (typeof AuthService !== "undefined" && AuthService.applyFormPagePermissions) {
    AuthService.applyFormPagePermissions("perm_", perms);
  }

  onUserRoleChanged();
  showModal("userModal");
}

function onUserShiftPresetChanged() {
  var s = $("#uShift") ? $("#uShift").value : "morning";
  if (!$("#uShiftStart") || !$("#uShiftEnd")) return;
  if (s === "morning") {
    $("#uShiftStart").value = "08:00";
    $("#uShiftEnd").value = "16:00";
  } else if (s === "afternoon" || s === "evening") {
    $("#uShiftStart").value = "16:00";
    $("#uShiftEnd").value = "00:00";
  } else if (s === "night") {
    $("#uShiftStart").value = "00:00";
    $("#uShiftEnd").value = "08:00";
  }
}
window.onUserShiftPresetChanged = onUserShiftPresetChanged;

function editUser(id) {
  openUserModal(id);
}

function saveUser() {
  if (!AuthService.canManageUsers()) {
    toast("ڕێگەپێدراو نییە", "تەنها بەڕێوەبەر دەتوانێت بەکارهێنەر بەڕێوە ببات", "error");
    return;
  }
  var name = $("#uName").value.trim();
  var username = $("#uEmail").value.trim().toLowerCase();
  if (typeof AuthService !== "undefined" && AuthService.isMasterUsername && AuthService.isMasterUsername(username)) {
    toast("قفڵکراو", "ناتوانیت هەژمارێک بە ئیمەیلی SmartServe دروست بکەیت یان بگۆڕیت", "error");
    return;
  }
  if (EDIT_USER_ID) {
    var existingEdit = DB.users.find(function (x) { return x.id === EDIT_USER_ID; });
    if (existingEdit && AuthService.isMasterUsername && AuthService.isMasterUsername(existingEdit.username)) {
      toast("قفڵکراو", "هەژماری فریاگوزاری SmartServe ناگۆڕدرێت", "error");
      return;
    }
  }
  var phone = $("#uPhone").value.trim();
  var password = $("#uPassword").value.trim();
  var passwordConfirm = $("#uPasswordConfirm") ? $("#uPasswordConfirm").value.trim() : "";
  var status = $("#uStatus").value;
  var role = $("#uRole") ? $("#uRole").value : "cashier";
  var pinRole = staffUsesPin(role);
  if (!name || !username) {
    toast("هەڵە", "ناو و ناوی بەکارهێنەر داواکراون", "error");
    return;
  }
  if (!EDIT_USER_ID && !password) {
    toast("هەڵە", pinRole ? "PINـی ٤ ژمارەیی بنووسە" : "وشەی نهێنی بنووسە", "error");
    return;
  }
  if (password) {
    if (pinRole && !/^\d{4,6}$/.test(password)) {
      toast("PIN", "PIN دەبێت ٤ بۆ ٦ ژمارە بێت، بۆ نموونە 2580", "error");
      return;
    }
    if (!pinRole && password.length < 4) {
      toast("هەڵە", "وشەی نهێنی دەبێت لانیکەم ٤ نووسە بێت", "error");
      return;
    }
    if (!EDIT_USER_ID && password !== passwordConfirm) {
      toast("هەڵە", pinRole ? "دووبارەکردنەوەی PIN وەک یەک نین" : "دووبارەکردنەوەی وشەی نهێنی وەک یەک نین", "error");
      return;
    }
    if (EDIT_USER_ID && passwordConfirm && password !== passwordConfirm) {
      toast("هەڵە", pinRole ? "دووبارەکردنەوەی PIN وەک یەک نین" : "دووبارەکردنەوەی وشەی نهێنی وەک یەک نین", "error");
      return;
    }
  }

  var shiftStart = $("#uShiftStart") ? $("#uShiftStart").value.trim() : "08:00";
  var shiftEnd = $("#uShiftEnd") ? $("#uShiftEnd").value.trim() : "16:00";
  var shiftNotifyMinutes = $("#uShiftNotify") ? parseInt($("#uShiftNotify").value, 10) : 10;
  if (isNaN(shiftNotifyMinutes) || shiftNotifyMinutes < 1) shiftNotifyMinutes = 10;
  if (!shiftStart) shiftStart = "08:00";
  if (!shiftEnd) shiftEnd = "16:00";

  var permissions = (typeof AuthService !== "undefined" && AuthService.collectFormPagePermissions)
    ? AuthService.collectFormPagePermissions("perm_")
    : { pos: true, orders: true, returnSales: true, customers: true, shifts: true };
  if (typeof AuthService !== "undefined" && AuthService.isOwnerRole && AuthService.isOwnerRole(role)) {
    permissions = AuthService.getDefaultPermissionsForRole(role);
  }

  var payload = {
    fullName: name,
    username: username,
    phone: phone,
    password: password || null,
    pin: pinRole ? (password || null) : null,
    role: role,
    permissions: permissions,
    shiftStart: shiftStart,
    shiftEnd: shiftEnd,
    shiftNotifyMinutes: shiftNotifyMinutes,
    employeeId: $("#uEmployeeId") ? $("#uEmployeeId").value.trim() : "",
    salary: $("#uSalary") ? (parseFloat($("#uSalary").value) || 0) : 0,
    isActive: status !== "inactive"
  };
  var promise = EDIT_USER_ID ? AuthService.updateCashier(EDIT_USER_ID, payload) : AuthService.createCashier(payload);
  promise.then(function (saved) {
    if (saved && DB && Array.isArray(DB.users)) {
      var idx = DB.users.findIndex(function (x) { return x.id === saved.id; });
      if (idx >= 0) DB.users[idx] = saved;
      else DB.users.push(saved);
    }
    // Synchronize to backend server /api/users
    var apiBase = (typeof ApiClient !== "undefined" && typeof ApiClient.getBaseUrl === "function") ? ApiClient.getBaseUrl() : "http://localhost:3005";
    var bePayload = {
      fullName: name,
      username: username,
      role: role,
      phone: phone,
      passcode: password || undefined,
      permissions: permissions,
      shiftStart: shiftStart,
      shiftEnd: shiftEnd,
      shiftNotifyMinutes: shiftNotifyMinutes,
      employeeId: payload.employeeId,
      salary: payload.salary
    };
    var beUrl = EDIT_USER_ID ? (apiBase + "/api/users/" + EDIT_USER_ID) : (apiBase + "/api/users");
    var beMethod = EDIT_USER_ID ? "PUT" : "POST";
    fetch(beUrl, {
      method: beMethod,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bePayload)
    }).then(function () {
      if (typeof SwitchCashier !== "undefined" && typeof SwitchCashier.loadCashiers === "function") {
        SwitchCashier.loadCashiers();
      }
    }).catch(function (e) {
      console.warn("Backend user sync warning:", e);
    });

  hideModal("userModal");
  refreshUsersViews();
  var savedMsg = pinRole
    ? "کارمەند پاشکەوت کرا. دەتوانێت لە شاشەی POS بە PIN بچێتە ژوورەوە"
    : "هەژمار پاشکەوت کرا. بە ئیمەیل و وشەی نهێنی دێتە ژوورەوە";
  toast("سەرکەوتوو", savedMsg, "success");
  }).catch(function (err) {
    var msg = err && err.message === "Username exists" ? "ئەم ناوی بەکارهێنەرە پێشتر هەیە"
      : (err && String(err.message || "").indexOf("SmartServe") >= 0 ? "هەژماری فریاگوزاری SmartServe ناگۆڕدرێت" : "هەڵە لە پاشکەوتکردن");
    toast("هەڵە", msg, "error");
  });
}

function deleteUser(id) {
  if (!AuthService.canManageUsers()) {
    toast("ڕێگەپێدراو نییە", "تەنها بەڕێوەبەر دەتوانێت بەکارهێنەر بسڕێتەوە", "error");
    return;
  }
  var target = DB.users.find(function (x) { return x.id === id; });
  if (target && typeof AuthService !== "undefined" && AuthService.isMasterUsername && AuthService.isMasterUsername(target.username)) {
    toast("قفڵکراو", "هەژماری فریاگوزاری SmartServe ناسڕدرێتەوە", "error");
    return;
  }
  if (!confirm("ئایا دڵنیایت کە دەتەوێت ئەم بەکارهێنەرە بسڕیتەوە؟")) return;
  AuthService.deleteCashier(id).then(function () {
    var apiBase = (typeof ApiClient !== "undefined" && typeof ApiClient.getBaseUrl === "function") ? ApiClient.getBaseUrl() : "http://localhost:3005";
    fetch(apiBase + "/api/users/" + id, { method: "DELETE" }).then(function () {
      if (typeof SwitchCashier !== "undefined" && typeof SwitchCashier.loadCashiers === "function") {
        SwitchCashier.loadCashiers();
      }
    }).catch(function () {});
  refreshUsersViews();
  toast("سەرکەوتوو", "بەکارهێنەر سڕایەوە", "success");
  }).catch(function (err) {
    var msg = (err && err.message === "Cannot delete last manager") ? "ناتوانیت دوایین ئەدمین / بەڕێوەبەر بسڕیتەوە"
      : (err && String(err.message || "").indexOf("SmartServe") >= 0) ? "هەژماری فریاگوزاری SmartServe ناسڕدرێتەوە"
      : (err && err.message ? err.message : "ناتوانرێت بسڕدرێتەوە");
    toast("هەڵە", msg, "error");
  });
}

/* ═══ SUSPENDED SALES & FAST PRICE CHECKER ═══ */

function renderSuspendedSales() {
  var container = $("#suspendedSalesList");
  updateHeldSalesBadgeCount();
  if (!container) return;
  if (DB.suspendedSales.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);font-weight:700;">هیچ وەسڵێکی ڕاگیراو لە لیستدا نییە</div>';
    return;
  }
  var html = '<div class="table-wrap"><table class="data-table"><thead><tr><th>کڕیار</th><th>کاڵاکان</th><th>کۆی گشتی</th><th>کات</th><th>کردار</th></tr></thead><tbody>';
  DB.suspendedSales.forEach(function (s) {
    var dateStr = formatSaleDateTime(s.heldAt);
    var itemsPreview = (s.cart || []).slice(0, 2).map(function (c) { return c.name + " (×" + c.qty + ")"; }).join("، ");
    if ((s.cart || []).length > 2) itemsPreview += " ...";
    html += '<tr>' +
      '<td><strong>' + s.customerName + '</strong></td>' +
      '<td>' + s.cart.length + ' بڕگە <div style="font-size:0.72rem;color:var(--text-muted);">' + itemsPreview + '</div></td>' +
      '<td><strong style="color:#10b981;">' + fmt(s.total) + '</strong></td>' +
      '<td style="font-size:0.78rem;">' + dateStr + '</td>' +
      '<td><button class="btn btn-sm btn-primary" onclick="resumeSale(\'' + s.id + '\')"><i class="fas fa-play"></i> گەڕاندنەوە</button> <button class="btn btn-sm btn-danger" onclick="deleteSuspendedSale(\'' + s.id + '\')"><i class="fas fa-trash"></i></button></td>' +
    '</tr>';
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

function resumeSale(id) {
  var suspendedSale = DB.suspendedSales.find(function (s) { return s.id === id; });
  if (!suspendedSale) return;
  CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart = suspendedSale.cart.map(function (c) {
    return {
      prodId: c.prodId,
      cartItemId: c.cartItemId || (c.prodId + "_" + (c.unitType || "piece")),
      name: c.name,
      price: c.price,
      cost: c.cost || 0,
      qty: c.qty,
      unitType: c.unitType || "piece",
      packQty: c.packQty || 1
    };
  });
  DB.suspendedSales = DB.suspendedSales.filter(function (s) { return s.id !== id; });
  DataStore.saveSuspendedSales();
  updateHeldSalesBadgeCount();
  renderCart();
  hideModal("suspendedSalesModal");
  toast("سەرکەوتوو", "وەسڵە ڕاگیراوەکە گەڕێندرایەوە سەبەتە", "success");
  logActivity("resume_sale", "Sale resumed: " + id);
}

function deleteSuspendedSale(id) {
  if (!confirm("ئایا دڵنیایت کە دەتەوێت ئەم فرۆشتە بسڕیتەوە؟")) return;
  DB.suspendedSales = DB.suspendedSales.filter(function (s) { return s.id !== id; });
  DataStore.saveSuspendedSales();
  updateHeldSalesBadgeCount();
  renderSuspendedSales();
  toast("سەرکەوتوو", "فرۆشتە سڕایەوە", "success");
}

function openPriceCheckerModal() {
  openModal("priceCheckerModal");
  var inp = document.getElementById("priceCheckerInput");
  if (inp) {
    inp.value = "";
    runPriceCheckLookup("");
    setTimeout(function () { inp.focus(); }, 100);
  }
}

function runPriceCheckLookup(query, isEnter) {
  var box = document.getElementById("priceCheckerResultBox");
  if (!box) return;
  var q = String(query || "").trim();
  if (!q) {
    box.innerHTML = '<i class="fas fa-barcode" style="font-size:2.6rem;color:#475569;margin-bottom:8px;"></i>' +
      '<div style="font-size:0.95rem;font-weight:800;color:#94a3b8;">چاوەڕێی سکانکردنی بارکۆد یان ناوی کاڵایە...</div>';
    return;
  }

  var products = (DB && Array.isArray(DB.products)) ? DB.products : [];
  var scaleInfo = null;
  var matched = null;

  // 1. Check scale barcode first (prefix 20..29)
  if (typeof SupermarketEngine !== "undefined" && SupermarketEngine.decodeScaleBarcode) {
    scaleInfo = SupermarketEngine.decodeScaleBarcode(q);
    if (scaleInfo && scaleInfo.product) {
      matched = scaleInfo.product;
    }
  }

  // 2. Exact barcode match
  if (!matched) {
    matched = products.find(function (p) {
      return String(p.barcode || "").trim() === q || String(p.packBarcode || "").trim() === q;
    });
  }

  // 3. Name or partial barcode match
  if (!matched) {
    var lower = q.toLowerCase();
    matched = products.find(function (p) {
      return String(p.name || "").toLowerCase().indexOf(lower) !== -1 || String(p.barcode || "").indexOf(q) !== -1;
    });
  }

  if (!matched) {
    box.innerHTML = '<i class="fas fa-exclamation-circle" style="font-size:2.4rem;color:#ef4444;margin-bottom:8px;"></i>' +
      '<div style="font-size:1rem;font-weight:900;color:#fca5a5;">هیچ کاڵایەک بەم کۆدە یان ناوە نەدۆزرایەوە!</div>' +
      '<div style="font-size:0.8rem;color:#94a3b8;margin-top:4px;">کۆدی گەڕان: ' + q + '</div>';
    return;
  }

  var regularPrice = parseFloat(matched.price) || 0;
  var activePrice = regularPrice;
  var badgeHtml = "";
  var offer = (typeof getOfferInfo === "function") ? getOfferInfo(matched) : { active: false };
  var clearanceDisc = parseFloat(matched.clearanceDiscount) || 0;

  if (offer.active) {
    activePrice = offer.price || offer.offerPrice || regularPrice;
    badgeHtml = '<span style="background:#ef4444;color:#fff;padding:3px 10px;border-radius:20px;font-size:0.78rem;font-weight:800;">🔥 ئۆفەری تایبەت (-%' + (offer.discountPct || offer.percent || 0) + ')</span>';
  } else if (clearanceDisc > 0) {
    activePrice = (parseFloat(matched.clearancePrice) > 0) ? parseFloat(matched.clearancePrice) : Math.round(regularPrice * (1 - clearanceDisc / 100));
    badgeHtml = '<span style="background:#f59e0b;color:#09090b;padding:3px 10px;border-radius:20px;font-size:0.78rem;font-weight:800;">🏷️ داشکاندنی پاکتاو (-%' + clearanceDisc + ')</span>';
  }

  var scaleExtraHtml = "";
  if (scaleInfo && scaleInfo.weightKg) {
    var totalScalePrice = Math.round(activePrice * scaleInfo.weightKg);
    scaleExtraHtml = '<div style="margin-top:8px;padding:8px 14px;background:rgba(16,185,129,0.15);border:1px solid #10b981;border-radius:10px;color:#a7f3d0;font-weight:800;font-size:0.9rem;">' +
      '⚖️ کێشی لەزگەی تەرازوو: ' + scaleInfo.weightKg.toFixed(3) + ' کغم ⬅ نرخی ئەم کیسەیە: <strong style="color:#fff;font-size:1.1rem;">' + fmt(totalScalePrice) + '</strong>' +
    '</div>';
  }

  var packHtml = "";
  if (matched.packQty > 1 || matched.packPrice > 0) {
    var pPrice = matched.packPrice > 0 ? matched.packPrice : (regularPrice * (matched.packQty || 1));
    packHtml = '<div style="font-size:0.84rem;color:#93c5fd;margin-top:6px;font-weight:700;"><i class="fas fa-box"></i> نرخی کارتۆن (' + (matched.packQty || 1) + ' دانە): <strong>' + fmt(pPrice) + '</strong></div>';
  }

  var usdStr = (typeof SupermarketEngine !== "undefined" && SupermarketEngine.iqdToUsd) ? ("≈ $" + SupermarketEngine.iqdToUsd(activePrice) + " USD") : "";

  box.innerHTML =
    '<div style="font-size:1.25rem;font-weight:900;color:#f8fafc;margin-bottom:4px;">' + matched.name + '</div>' +
    (badgeHtml ? '<div style="margin-bottom:6px;">' + badgeHtml + '</div>' : '') +
    '<div style="font-size:2.4rem;font-weight:900;color:#10b981;text-shadow:0 0 16px rgba(16,185,129,0.4);line-height:1.1;margin:4px 0;">' + fmt(activePrice) + '</div>' +
    (activePrice < regularPrice ? '<div style="font-size:0.85rem;color:#94a3b8;"><del>نرخی پێشوو: ' + fmt(regularPrice) + '</del></div>' : '') +
    '<div style="font-size:0.82rem;color:#38bdf8;font-weight:700;">' + usdStr + '</div>' +
    packHtml +
    scaleExtraHtml +
    '<div style="display:flex;align-items:center;justify-content:center;gap:14px;margin-top:12px;font-size:0.8rem;color:#cbd5e1;">' +
      '<span><i class="fas fa-cubes" style="color:#eab308;"></i> ماوە لە کۆگا: <strong>' + (matched.stock || 0) + '</strong></span>' +
      (matched.barcode ? '<span><i class="fas fa-barcode" style="color:#94a3b8;"></i> ' + matched.barcode + '</span>' : '') +
    '</div>' +
    '<div style="margin-top:14px;">' +
      '<button type="button" class="btn btn-primary btn-sm" onclick="addToCart(\'' + matched.id + '\');closeModal(\'priceCheckerModal\');" style="padding:8px 18px;font-weight:800;"><i class="fas fa-cart-plus"></i> زیادکردن بۆ سەبەتەی فرۆشتن</button>' +
    '</div>';

  if (isEnter) {
    var inp = document.getElementById("priceCheckerInput");
    if (inp) inp.select();
  }
}

function setPosPageMode(fullscreen) {
  if (fullscreen) {
    document.body.classList.add("pos-fullscreen");
    document.body.classList.remove("pos-compact");
    } else {
    document.body.classList.remove("pos-fullscreen");
    document.body.classList.add("pos-compact");
  }
  updatePosViewButtons();
}

function updatePosViewButtons() {
  var toggleBtn = $("#togglePosViewBtn");
  if (toggleBtn) {
    toggleBtn.style.display = "none";
  }
}

function updatePosHeaderInfo() {
  var name = getActiveOperatorName();
  var cashierEl = $("#headerCashierName");
  if (cashierEl) {
    cashierEl.removeAttribute("data-i18n-src");
    cashierEl.textContent = name;
  }
  var nameEl = $("#userName");
  if (nameEl) {
    nameEl.removeAttribute("data-i18n-src");
    nameEl.textContent = name;
  }
  var av = $("#userAvatar");
  if (av && !av.querySelector("img")) {
    av.textContent = name.charAt(0).toUpperCase();
  }
  var sess = (typeof AuthService !== "undefined" && AuthService.getSession) ? AuthService.getSession() : null;
  var currentRole = (sess && sess.role) || (DB.currentUser && DB.currentUser.role) || "cashier";
  var roleMeta = (typeof AuthService !== "undefined" && AuthService.getRoleMeta)
    ? AuthService.getRoleMeta(currentRole)
    : { label: currentRole === "cashier" ? "کاشیر" : currentRole, color: "#10b981" };
  var roleEl = $("#userRole");
  if (roleEl) {
    roleEl.removeAttribute("data-i18n-src");
    roleEl.textContent = roleMeta.label;
    if (roleMeta.color) {
      roleEl.style.color = roleMeta.color;
      roleEl.style.fontWeight = "700";
    }
  }
  var storeEl = $("#posStoreName");
  if (storeEl) {
    storeEl.textContent = getStoreName();
  }
}

function getPosDiscountPct() {
  var el = $("#posDiscountInput") || $("#discountInput");
  return parseFloat(el ? el.value : "0") || 0;
}

function getPosTaxAmount(subtotal, discAmt) {
  var rate = parseFloat((DB.settings && DB.settings.taxRate) || 0) || 0;
  if (!rate || (DB.settings && DB.settings.taxType === "none")) return 0;
  var base = subtotal - discAmt;
  return Math.round((base * rate) / 100);
}

function getCartTotals(cart) {
  cart = cart || (CUSTOMER_QUEUE[ACTIVE_CUSTOMER] && CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart) || [];
  var subtotal = cart.reduce(function (s, c) { return s + c.price * c.qty; }, 0);
  var totalCost = cart.reduce(function (s, c) { return s + (c.cost || 0) * c.qty; }, 0);
  var totalQty = cart.reduce(function (s, c) { return s + c.qty; }, 0);
  var discPct = getPosDiscountPct();
  var discAmt = Math.round((subtotal * discPct) / 100);
  var taxAmt = getPosTaxAmount(subtotal, discAmt);
  var netSales = subtotal - discAmt;
  var grandTotal = netSales + taxAmt;
  var profit = netSales - totalCost;
  return {
    subtotal: subtotal,
    totalCost: totalCost,
    totalQty: totalQty,
    discPct: discPct,
    discAmt: discAmt,
    taxAmt: taxAmt,
    netSales: netSales,
    grandTotal: grandTotal,
    profit: profit,
    itemCount: cart.length
  };
}

function togglePosFullscreen() {
  if (typeof SupermarketEngine !== "undefined" && SupermarketEngine.togglePosFullscreen) {
    SupermarketEngine.togglePosFullscreen();
    toast("شاشە", document.fullscreenElement ? "شاشەی ئاسایی" : "شاشەی تەواو (Fullscreen)", "info");
    return;
  }
  var isFull = document.body.classList.contains("pos-fullscreen");
  setPosPageMode(!isFull);
  toast("شاشە", !isFull ? "شاشەی تەواو چالاک کرا" : "شاشەی ئاسایی", "info");
}

var CashierButtons = (function () {
  var TOOLS = [
    { key: "style", label: "ستایلی کاشێر (VIP)", icon: "fa-crown", selectors: ["#headerLuxuryStyleBtn"] },
    { key: "held", label: "ڕاگیراوەکان", icon: "fa-pause", selectors: ["#recallHeldBtn"] },
    { key: "productsStore", label: "کۆگای کاڵا (F10)", icon: "fa-boxes", selectors: ["#headerHeldSalesBtn"] },
    { key: "excelImport", label: "داغڵکردنی Excel", icon: "fa-file-excel", selectors: ["#headerExcelImportBtn"] },
    { key: "return", label: "گەڕانەوە (F8)", icon: "fa-undo", selectors: ["#posReturnBtn", "#returnOrderBtn"] },
    { key: "handover", label: "تەسلیمکردنی سندوق", icon: "fa-hand-holding-usd", selectors: ["#headerHandoverTabBtn"], module: "enableHandover" },
    { key: "shortcuts", label: "دوگمە خێراکان", icon: "fa-keyboard", selectors: ["#headerShortcutsTabBtn"] },
    { key: "customerDisplay", label: "شاشەی کڕیار (F9)", icon: "fa-desktop", selectors: ["#headerCustomerDispBtn"], module: "enableCustomerDisplay" },
    { key: "newProduct", label: "کاڵای نوێ (F4)", icon: "fa-plus", selectors: ["#posFnNewProductBtn"] },
    { key: "discount", label: "داشکاندن (F5)", icon: "fa-percent", selectors: ["#discountBtn"] },
    { key: "card", label: "کارت / Card", icon: "fa-credit-card", selectors: ["#posFnCardBtn"] },
    { key: "reprint", label: "دوایین پسوڵە", icon: "fa-redo-alt", selectors: ["#posReprintBtn"] },
    { key: "keypad", label: "ژمارەکان", icon: "fa-calculator", selectors: ["#posFnKeypadBtn"] },
    { key: "orderPaper", label: "کاغەزی داواکاری", icon: "fa-scroll", selectors: ["#posFnPaperBtn"] },
    { key: "clearCart", label: "پاککردنەوە (Delete)", icon: "fa-trash-alt", selectors: ["#clearCartBtn"] },
    { key: "sale", label: "دروستکردنی QR", icon: "fa-qrcode", selectors: ["#headerSaleTabBtn"] }
  ];
  var PAGES = [
    { key: "orders", page: "orders", label: "پسوولەکانی فرۆشتن", icon: "fa-receipt" },
    { key: "returnSales", page: "returnSales", label: "گەڕانەوەی فرۆشتن", icon: "fa-undo" },
    { key: "shifts", page: "shifts", label: "شێفت و سندوق", icon: "fa-clock" },
    { key: "products", page: "products", label: "بەرهەمەکان و نرخ", icon: "fa-boxes" },
    { key: "categories", page: "categories", label: "پۆلەکان", icon: "fa-tags" },
    { key: "inventory", page: "inventory", label: "کۆگا و بەسەرچوون", icon: "fa-warehouse" },
    { key: "barcode", page: "barcode", label: "چاپی بارکۆد و لەزگە", icon: "fa-qrcode" },
    { key: "suppliers", page: "suppliers", label: "کۆمپانیا و کڕین", icon: "fa-truck" },
    { key: "customers", page: "customers", label: "کڕیاران و قەرز", icon: "fa-users" },
    { key: "dashboard", page: "dashboard", label: "داشبۆردی بەڕێوەبەر", icon: "fa-chart-pie" },
    { key: "users", page: "users", label: "بەکارهێنەران و کاشیرەکان", icon: "fa-users-cog" },
    { key: "settings", page: "settings", label: "ڕێکخستنەکان", icon: "fa-cog" }
  ];

  function defaults() {
    var tools = {};
    TOOLS.forEach(function (t) { tools[t.key] = true; });
    var pages = {};
    PAGES.forEach(function (p) { pages[p.key] = false; });
    return { tools: tools, pages: pages, labels: {} };
  }

  function get() {
    var d = defaults();
    var saved = (typeof DB !== "undefined" && DB.settings && DB.settings.cashierButtons) || {};
    var tools = Object.assign({}, d.tools, saved.tools || {});
    var pages = Object.assign({}, d.pages, saved.pages || {});
    var labels = Object.assign({}, d.labels, saved.labels || {});
    TOOLS.forEach(function (t) {
      if (saved.tools === undefined && typeof saved[t.key] === "boolean") tools[t.key] = saved[t.key];
    });
    return { tools: tools, pages: pages, labels: labels };
  }

  function defaultLabel(key) {
    var t = TOOLS.find(function (x) { return x.key === key; });
    if (t) return t.label;
    var p = PAGES.find(function (x) { return x.key === key; });
    return p ? p.label : key;
  }

  function getLabel(key) {
    var cfg = get();
    var custom = cfg.labels && cfg.labels[key] ? String(cfg.labels[key]).trim() : "";
    if (key === "sale" && (custom === "فرۆشتن" || custom === "فرۆشتن (F1)")) custom = "";
    if (key === "shortcuts" && (custom === "دوگمە خێراکان" || custom === "دوگمە خێراکان (F1)")) custom = "";
    if (key === "clearCart" && (/Ctrl\s*\+?\s*Del/i.test(custom) || custom === "پاککردنەوە")) custom = "";
    return custom || defaultLabel(key);
  }

  function escAttr(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function persist(cfg) {
    if (typeof DB === "undefined") return;
    if (!DB.settings) DB.settings = {};
    DB.settings.cashierButtons = cfg;
    if (typeof DataStore !== "undefined" && DataStore.saveSettings) {
      try { DataStore.saveSettings(); } catch (e) {}
    }
  }

  function moduleOn(key) {
    if (!key || typeof FeatureModules === "undefined" || !FeatureModules.getActiveModules) return true;
    var mods = FeatureModules.getActiveModules() || {};
    return mods[key] !== false;
  }

  function canPage(page) {
    if (typeof AuthService !== "undefined" && AuthService.canAccessPage) return AuthService.canAccessPage(page);
    return true;
  }

  function setVisible(selector, on) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.style.display = on ? "" : "none";
    });
  }

  function apply() {
    var cfg = get();
    TOOLS.forEach(function (t) {
      var on = cfg.tools[t.key] !== false;
      if (t.module && !moduleOn(t.module)) on = false;
      if (t.key === "discount" && DB.settings && DB.settings.allowDiscounts === "off") on = false;
      if (t.key === "held" && DB.settings && DB.settings.holdSale === "off") on = false;
      t.selectors.forEach(function (sel) { setVisible(sel, on); });
      applyLabel(t.key);
    });
    PAGES.forEach(function (p) { applyLabel(p.key); });
    renderPageBar(cfg);
  }

  function applyLabel(key) {
    var label = getLabel(key);
    var custom = !!(get().labels && get().labels[key]);
    document.querySelectorAll('[data-cashier-label="' + key + '"]').forEach(function (el) {
      el.textContent = label;
      if (custom) el.setAttribute("data-no-i18n", "");
      else el.removeAttribute("data-no-i18n");
    });
  }

  function renderPageBar(cfg) {
    cfg = cfg || get();
    var bar = document.getElementById("posPageButtonsBar");
    if (!bar) return;
    var html = "";
    PAGES.forEach(function (p) {
      if (!cfg.pages[p.key]) return;
      if (!canPage(p.page)) return;
      html += '<button type="button" class="pos-page-jump' + (window.CURRENT_PAGE === p.page ? " is-active" : "") + '" data-page="' + p.page + '" onclick="switchSection(\'' + p.page + '\')">' +
        '<i class="fas ' + p.icon + '"></i><span data-cashier-label="' + p.key + '">' + getLabel(p.key) + "</span></button>";
    });
    bar.innerHTML = html;
    var show = !!html;
    bar.hidden = !show;
    bar.classList.toggle("is-on", show);
    bar.style.display = show ? "flex" : "none";
  }

  function renderChip(item, active, kind) {
    var shown = getLabel(item.key);
    return '<div class="cashier-btn-choice' + (active ? " is-active" : "") + '">' +
      '<button type="button" class="cashier-btn-vis" onclick="CashierButtons.toggle(\'' + kind + '\',\'' + item.key + '\')">' +
      '<i class="fas ' + item.icon + '"></i><strong>' + item.label + "</strong>" +
      "<em>" + (active ? "پیشاندراو" : "شاراوە") + "</em></button>" +
      '<label class="cashier-btn-rename-wrap">دەقی دوگمە' +
      '<input type="text" class="cashier-btn-rename" maxlength="40" value="' + escAttr(shown) + '" onchange="CashierButtons.rename(\'' + item.key + '\', this.value)" onclick="event.stopPropagation()">' +
      "</label></div>";
  }

  function render() {
    var cfg = get();
    var toolsGrid = document.getElementById("cashierButtonsToolsGrid");
    var pagesGrid = document.getElementById("cashierButtonsPagesGrid");
    if (toolsGrid) {
      toolsGrid.innerHTML = TOOLS.map(function (t) { return renderChip(t, cfg.tools[t.key] !== false, "tool"); }).join("");
    }
    if (pagesGrid) {
      pagesGrid.innerHTML = PAGES.map(function (p) { return renderChip(p, !!cfg.pages[p.key], "page"); }).join("");
    }
    if (window.I18n && typeof I18n.apply === "function") {
      var card = document.getElementById("cashierButtonsCard");
      try { I18n.apply(card || document.body); } catch (e) {}
    }
  }

  function toggle(kind, key) {
    var cfg = get();
    if (kind === "page") cfg.pages[key] = !cfg.pages[key];
    else cfg.tools[key] = cfg.tools[key] === false;
    persist(cfg);
    apply();
    render();
    if (typeof toast === "function") toast("شاشەی کاشێر", "دوگمەکان نوێکرانەوە.", "success");
  }

  function rename(key, text) {
    var cfg = get();
    if (!cfg.labels) cfg.labels = {};
    text = String(text || "").trim().slice(0, 40);
    if (!text || text === defaultLabel(key)) delete cfg.labels[key];
    else cfg.labels[key] = text;
    persist(cfg);
    apply();
    if (typeof toast === "function") toast("دەقی دوگمە", "دەق نوێکرایەوە.", "success");
  }

  function showAllTools() {
    var cfg = get();
    TOOLS.forEach(function (t) { cfg.tools[t.key] = true; });
    persist(cfg); apply(); render();
    if (typeof toast === "function") toast("شاشەی کاشێر", "هەموو ئامرازەکان پیشاندران.", "success");
  }

  function simpleCashier() {
    var cfg = get();
    TOOLS.forEach(function (t) { cfg.tools[t.key] = true; });
    cfg.tools.style = false;
    cfg.tools.shortcuts = false;
    cfg.tools.keypad = false;
    cfg.tools.newProduct = false;
    cfg.tools.customerDisplay = false;
    persist(cfg); apply(); render();
    if (typeof toast === "function") toast("کاشێری سادە", "تەنها دوگمە پێویستەکان مانەوە.", "success");
  }

  function clearPages() {
    var cfg = get();
    PAGES.forEach(function (p) { cfg.pages[p.key] = false; });
    persist(cfg); apply(); render();
    if (typeof toast === "function") toast("شاشەی کاشێر", "دوگمەی پەڕەکان لە کاشێر شاردرایەوە.", "success");
  }

  return {
    get: get,
    apply: apply,
    render: render,
    toggle: toggle,
    rename: rename,
    getLabel: getLabel,
    showAllTools: showAllTools,
    simpleCashier: simpleCashier,
    clearPages: clearPages
  };
})();
window.CashierButtons = CashierButtons;

function updatePosToolbarActive(page) {
  $$(".pos-bottom-toolbar .toolbar-btn[data-page]").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-page") === page);
  });
}

function initPosToolbar() {
  $$(".pos-bottom-toolbar .toolbar-btn[data-page]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var page = btn.getAttribute("data-page");
      if (page === "pos") {
        switchSection("pos");
        updatePosToolbarActive("pos");
        return;
      }
      switchSection(page);
    });
  });

  var posLogoutBtn = $("#posLogoutBtn");
  if (posLogoutBtn) {
    posLogoutBtn.addEventListener("click", function () {
      var logoutBtn = $("#logoutBtn");
      if (logoutBtn) logoutBtn.click();
    });
  }
}

function renderPermissionsUI() {
  var container = $("#permissionsContainer");
  if (!container) return;
  var roles = ["manager", "cashier"];
  var roleNames = { manager: "بەڕێوەبەر", cashier: "کاشیر" };
  var permissions = ["dashboard", "pos", "products", "categories", "inventory", "barcode", "orders", "customers", "debt", "shifts", "reports", "expenses", "suppliers", "purchases", "settings", "users"];
  var permNames = {
    dashboard: "داشبۆرد و دارایی", pos: "فرۆشتن / POS", products: "بەرهەمەکان", categories: "پۆلەکان",
    inventory: "کۆگا", barcode: "بارکۆد", orders: "فرۆشتنەکان", customers: "کڕیاران",
    debt: "قەرز", shifts: "شێفت", reports: "داشبۆرد و دارایی", expenses: "مەسرەف",
    suppliers: "کۆمپانیا و کڕین", purchases: "وەسڵی کڕین", settings: "ڕێکخستن", users: "بەکارهێنەران"
  };
  var html = '<p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;">دوای گۆڕینی دەسەڵاتی کاشیر، کاشیر دەبێت دەرچێت و دووبارە بچێتە ژوورەوە یان گۆڕینی کاشیر بکات.</p>';
  roles.forEach(function (role) {
    html += '<div style="margin-bottom:15px;padding:15px;background:var(--card-bg);border-radius:var(--radius-md);border:1px solid var(--border-color);">';
    html += '<h4 style="margin:0 0 12px 0;">' + roleNames[role] + '</h4>';
    html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">';
    permissions.forEach(function (perm) {
      var checked = PERMISSIONS[role] && PERMISSIONS[role][perm] ? "checked" : "";
      html += '<label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;"><input type="checkbox" class="perm-checkbox" data-role="' + role + '" data-perm="' + perm + '" ' + checked + '> ' + permNames[perm] + '</label>';
    });
    html += '</div></div>';
  });
  container.innerHTML = html;
  var checkboxes = $$(".perm-checkbox");
  checkboxes.forEach(function (cb) {
    cb.addEventListener("change", function () {
      var role = cb.dataset.role;
      var perm = cb.dataset.perm;
      if (!PERMISSIONS[role]) PERMISSIONS[role] = {};
      PERMISSIONS[role][perm] = cb.checked;
      if (perm === "products") {
        if (PERMISSIONS[role].categories === undefined || cb.checked) PERMISSIONS[role].categories = cb.checked;
        if (PERMISSIONS[role].barcode === undefined || cb.checked) PERMISSIONS[role].barcode = cb.checked;
      }
      if (perm === "inventory") PERMISSIONS[role].stock = cb.checked;
      if (perm === "reports" || perm === "dashboard") {
        PERMISSIONS[role].profitReports = cb.checked;
        PERMISSIONS[role].dashboard = cb.checked;
        PERMISSIONS[role].reports = cb.checked;
      }
      DataStore.savePermissions(PERMISSIONS);
      AuthService.applyNavPermissions();
      if (window.CashierButtons) CashierButtons.apply();
      logActivity("permission_change", "Changed " + role + " permission for " + perm + " to " + cb.checked);
      toast("پاشکەوت کرا", "دەسەڵاتی " + roleNames[role] + " نوێکرایەوە. کاشیر دەبێت دووبارە بچێتە ژوورەوە.", "success");
    });
  });
}

function renderLoginLogsUI() {
  var container = $("#loginLogsContainer");
  if (!container) return;
  if (LOGIN_LOGS.length === 0) {
    container.innerHTML = '<div style="padding:10px;color:var(--text-muted);text-align:center;">هیچ لۆگێک نییە</div>';
    return;
  }
  var html = '<table style="width:100%;border-collapse:collapse;font-size:0.8rem;"><thead><tr style="background:var(--card-bg);"><th style="padding:8px;text-align:right;">ئیمەیڵ</th><th style="padding:8px;text-align:center;">دۆخ</th><th style="padding:8px;text-align:left;">کات</th></tr></thead><tbody>';
  LOGIN_LOGS.slice(-20).reverse().forEach(function (log) {
    var dateStr = formatSaleDateTime(log.timestamp, true);
    var statusColor = log.success ? "var(--success)" : "var(--danger)";
    var statusText = log.success ? "سەرکەوتوو" : "شکستی هێنا";
    html += '<tr style="border-bottom:1px solid var(--border-color);"><td style="padding:8px;">' + log.email + '</td><td style="padding:8px;text-align:center;color:' + statusColor + ';">' + statusText + '</td><td style="padding:8px;">' + dateStr + '</td></tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderActivityLogsUI() {
  var container = $("#activityLogsContainer");
  if (!container) return;
  if (ACTIVITY_LOGS.length === 0) {
    container.innerHTML = '<div style="padding:10px;color:var(--text-muted);text-align:center;">هیچ لۆگێک نییە</div>';
    return;
  }
  var html = '<table style="width:100%;border-collapse:collapse;font-size:0.8rem;"><thead><tr style="background:var(--card-bg);"><th style="padding:8px;text-align:right;">بەکارهێنەر</th><th style="padding:8px;text-align:right;">چالاکی</th><th style="padding:8px;text-align:left;">کات</th></tr></thead><tbody>';
  ACTIVITY_LOGS.slice(-20).reverse().forEach(function (log) {
    var dateStr = formatSaleDateTime(log.timestamp, true);
    html += '<tr style="border-bottom:1px solid var(--border-color);"><td style="padding:8px;">' + log.userName + ' (' + log.userRole + ')</td><td style="padding:8px;">' + log.action + '</td><td style="padding:8px;">' + dateStr + '</td></tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderPriceHistoryUI() {
  var container = $("#priceHistoryContainer");
  if (!container) return;
  if (PRICE_HISTORY.length === 0) {
    container.innerHTML = '<div style="padding:10px;color:var(--text-muted);text-align:center;">هیچ مێژوویەکی نرخ نییە</div>';
    return;
  }
  var html = '<table style="width:100%;border-collapse:collapse;font-size:0.8rem;"><thead><tr style="background:var(--card-bg);"><th style="padding:8px;text-align:right;">بەرهەم</th><th style="padding:8px;text-align:center;">کۆن</th><th style="padding:8px;text-align:center;">نوێ</th><th style="padding:8px;text-align:right;">بەکارهێنەر</th><th style="padding:8px;text-align:left;">کات</th></tr></thead><tbody>';
  PRICE_HISTORY.slice(-20).reverse().forEach(function (ph) {
    var dateStr = formatSaleDateTime(ph.timestamp, true);
    var changeColor = ph.newPrice > ph.oldPrice ? "var(--success)" : (ph.newPrice < ph.oldPrice ? "var(--danger)" : "var(--text-secondary)");
    html += '<tr style="border-bottom:1px solid var(--border-color);"><td style="padding:8px;">' + ph.productName + '</td><td style="padding:8px;text-align:center;">' + fmt(ph.oldPrice) + '</td><td style="padding:8px;text-align:center;color:' + changeColor + ';font-weight:700;">' + fmt(ph.newPrice) + '</td><td style="padding:8px;">' + ph.userName + '</td><td style="padding:8px;">' + dateStr + '</td></tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderThemeSwitcher() {
  var container = $("#themeSwitcher"); if (!container) return;
  var themes = [
    { id: "ivory-luxe", name: "سپی گرادیێنت", icon: "fa-gem", colors: ["#fffef9", "#efe4d0", "#d4af37"] },
    { id: "noir-gold", name: "ڕەشی زێڕین", icon: "fa-crown", colors: ["#0c0a08", "#1c1814", "#d4af37"] },
    { id: "dark", name: "تاریک زێڕین", icon: "fa-moon", colors: ["#0a0e1a", "#1a2236", "#eab308"] },
    { id: "light", name: "ڕووناک", icon: "fa-sun", colors: ["#f6f5f1", "#ffffff", "#059669"] },
    { id: "ocean", name: "دەریایی", icon: "fa-water", colors: ["#0c1929", "#1a3558", "#0ea5e9"] },
    { id: "emerald", name: "زەمروتی", icon: "fa-leaf", colors: ["#022c22", "#065f46", "#10b981"] },
    { id: "rose", name: "جەرگی", icon: "fa-heart", colors: ["#1c1917", "#44403c", "#ec4899"] },
    { id: "amber", name: "کەرەبەیی", icon: "fa-fire", colors: ["#1c1917", "#451a03", "#f59e0b"] },
    { id: "purple", name: "مۆر", icon: "fa-gem", colors: ["#1e1b4b", "#3730a3", "#8b5cf6"] },
    { id: "crimson", name: "سووری تۆخ", icon: "fa-tint", colors: ["#1a0505", "#3b0a0a", "#ef4444"] },
    { id: "forest", name: "دارستانی", icon: "fa-tree", colors: ["#052e16", "#14532d", "#22c55e"] },
    { id: "coral", name: "مەرجانی", icon: "fa-circle", colors: ["#1c0a06", "#7c2d12", "#f97316"] },
    { id: "steel", name: "پۆڵا", icon: "fa-cog", colors: ["#111827", "#334155", "#94a3b8"] },
    { id: "minimal", name: "سادە", icon: "fa-minus", colors: ["#18181b", "#27272a", "#e4e4e7"] }
  ];
  var current = document.documentElement.getAttribute("data-theme") || "dark";
  container.innerHTML = themes.map(function (t) {
    return '<button type="button" class="theme-btn' + (current === t.id ? " active" : "") + '" onclick="setTheme(\'' + t.id + '\');renderThemeSwitcher()">' +
      '<span class="theme-preview" style="background:linear-gradient(135deg,' + t.colors[0] + "," + t.colors[1] + ");border-color:" + t.colors[2] + '">' +
      '<span class="theme-dot" style="background:' + t.colors[2] + '"></span></span>' +
      '<span class="theme-name"><i class="fas ' + t.icon + '"></i> ' + t.name + "</span></button>";
  }).join("");

  var currentLux = document.documentElement.getAttribute("data-cashier-theme") || "";
  highlightActiveCashierLuxuryBtn(currentLux);
  try { renderBillStylePicker(); } catch (eBill) {}
}

function saveSettings() {
  var prevSettings = DB.settings || {};
  var settingsPatch = {
    marketName: ($("#setMarketName") ? $("#setMarketName").value.trim() : "") || "",
    marketTagline: ($("#setMarketTagline") ? $("#setMarketTagline").value : "") || "",
    marketLogo: (DB.settings && DB.settings.marketLogo) || "",
    customAccentColor: (DB.settings && DB.settings.customAccentColor) || "",
    customPageColors: (DB.settings && DB.settings.customPageColors) || "",
    customCashierColors: (DB.settings && DB.settings.customCashierColors) || "",
    phone: $("#setPhone") ? $("#setPhone").value : "",
    address: $("#setAddress") ? $("#setAddress").value : "",
    taxId: $("#setTaxId") ? $("#setTaxId").value : "",
    licenseNumber: $("#setLicenseNumber") ? $("#setLicenseNumber").value : "",
    email: $("#setEmail") ? $("#setEmail").value : "",
    website: $("#setWebsite") ? $("#setWebsite").value : "",
    cashier: $("#setCashier") ? $("#setCashier").value : "کاشیر",
    receiptHeader: $("#setReceiptHeader") ? $("#setReceiptHeader").value : "",
    receiptFooter: $("#setReceiptFooter") ? $("#setReceiptFooter").value : "",
    printType: $("#setPrintType") ? $("#setPrintType").value : "thermal",
    printMode: $("#setPrintMode") ? $("#setPrintMode").value : "direct",
    selectedPrinter: $("#setSelectedPrinter") ? $("#setSelectedPrinter").value : "",
    autoPrint: $("#setAutoPrint") ? $("#setAutoPrint").value : "on",
    showLogo: $("#setShowLogo") ? $("#setShowLogo").value : "on",
    showBarcode: $("#setShowBarcode") ? $("#setShowBarcode").value : "on",
    currency: $("#setCurrency") ? $("#setCurrency").value : "IQD",
    secondaryCurrency: $("#setSecondaryCurrency") ? $("#setSecondaryCurrency").value : "",
    exchangeRate: $("#setExchangeRate") ? parseFloat($("#setExchangeRate").value) || 0 : 0,
    currencyPosition: $("#setCurrencyPosition") ? $("#setCurrencyPosition").value : "before",
    decimalPlaces: $("#setDecimalPlaces") ? parseInt($("#setDecimalPlaces").value) || 0 : 0,
    thousandsSeparator: $("#setThousandsSeparator") ? $("#setThousandsSeparator").value : ",",
    taxType: $("#setTaxType") ? $("#setTaxType").value : "exclusive",
    taxRate: $("#setTaxRate") ? parseFloat($("#setTaxRate").value) || 0 : 0,
    taxName: $("#setTaxName") ? $("#setTaxName").value : "",
    taxNumber: $("#setTaxNumber") ? $("#setTaxNumber").value : "",
    language: $("#setLanguage") ? $("#setLanguage").value : "ku",
    dateFormat: $("#setDateFormat") ? $("#setDateFormat").value : "dd/mm/yyyy",
    timeFormat: $("#setTimeFormat") ? $("#setTimeFormat").value : "24",
    lowStockThreshold: $("#setLowStockThreshold") ? parseInt($("#setLowStockThreshold").value) || 5 : 5,
    expiryAlertDays: $("#setExpiryAlertDays") ? parseInt($("#setExpiryAlertDays").value) || 7 : 7,
    
    shiftDuration: $("#setShiftDuration") ? parseInt($("#setShiftDuration").value) || 8 : 8,
    defaultShift: $("#setDefaultShift") ? $("#setDefaultShift").value : "morning",
    morningShiftStart: $("#setMorningShiftStart") ? $("#setMorningShiftStart").value : "06:00",
    morningShiftEnd: $("#setMorningShiftEnd") ? $("#setMorningShiftEnd").value : "14:00",
    afternoonShiftStart: $("#setAfternoonShiftStart") ? $("#setAfternoonShiftStart").value : "14:00",
    afternoonShiftEnd: $("#setAfternoonShiftEnd") ? $("#setAfternoonShiftEnd").value : "22:00",
    nightShiftStart: $("#setNightShiftStart") ? $("#setNightShiftStart").value : "22:00",
    nightShiftEnd: $("#setNightShiftEnd") ? $("#setNightShiftEnd").value : "06:00",
    openingBalance: $("#setOpeningBalance") ? parseFloat($("#setOpeningBalance").value) || 0 : 0,
    requireOpenShift: $("#setRequireOpenShift") ? $("#setRequireOpenShift").value : "off",
    autoCloseShift: $("#setAutoCloseShift") ? $("#setAutoCloseShift").value : "off",
    cashDifferenceWarning: $("#setCashDifferenceWarning") ? $("#setCashDifferenceWarning").value : "on",
    shiftHandover: $("#setShiftHandover") ? $("#setShiftHandover").value : "on",
    endShiftReport: $("#setEndShiftReport") ? $("#setEndShiftReport").value : "on",
    
    defaultPayment: $("#setDefaultPayment") ? $("#setDefaultPayment").value : "cash",
    autoSaveCart: $("#setAutoSaveCart") ? $("#setAutoSaveCart").value : "off",
    showProductCode: $("#setShowProductCode") ? $("#setShowProductCode").value : "on",
    showStockInPOS: $("#setShowStockInPOS") ? $("#setShowStockInPOS").value : "on",
    maxReceiptValue: $("#setMaxReceiptValue") ? parseFloat($("#setMaxReceiptValue").value) || 1000000 : 1000000,
    allowNegative: $("#setAllowNegative") ? $("#setAllowNegative").value : "off",
    allowManualPrice: $("#setAllowManualPrice") ? $("#setAllowManualPrice").value : "on",
    allowDiscounts: $("#setAllowDiscounts") ? $("#setAllowDiscounts").value : "on",
    maxDiscountPercent: $("#setMaxDiscountPercent") ? parseFloat($("#setMaxDiscountPercent").value) || 50 : 50,
    autoFocusBarcode: $("#setAutoFocusBarcode") ? $("#setAutoFocusBarcode").value : "on",
    holdSale: $("#setHoldSale") ? $("#setHoldSale").value : "on",
    multipleCustomerTabs: $("#setMultipleCustomerTabs") ? $("#setMultipleCustomerTabs").value : "off",
    openCashDrawer: $("#setOpenCashDrawer") ? $("#setOpenCashDrawer").value : "on",
    
    lowStockAlert: $("#setLowStockAlert") ? $("#setLowStockAlert").value : "on",
    lowStockLimit: $("#setLowStockLimit") ? parseInt($("#setLowStockLimit").value) || 5 : 5,
    expiryAlert: $("#setExpiryAlert") ? $("#setExpiryAlert").value : "on",
    expiryDays: $("#setExpiryDays") ? parseInt($("#setExpiryDays").value) || 7 : 7,
    autoDeductStock: $("#setAutoDeductStock") ? $("#setAutoDeductStock").value : "on",
    allowOverStock: $("#setAllowOverStock") ? $("#setAllowOverStock").value : "off",
    outOfStockWarning: $("#setOutOfStockWarning") ? $("#setOutOfStockWarning").value : "on",
    inventoryAuditReminder: $("#setInventoryAuditReminder") ? $("#setInventoryAuditReminder").value : "on",
    
    creditLimitEnabled: $("#setCreditLimitEnabled") ? $("#setCreditLimitEnabled").value : "on",
    creditLimit: $("#setCreditLimit") ? Math.max(0, parseFloat($("#setCreditLimit").value) || 0) : 0,
    loyaltyRate: $("#setLoyaltyRate") ? parseFloat($("#setLoyaltyRate").value) || 1 : 1,
    loyaltyPoints: $("#setLoyaltyPoints") ? parseInt($("#setLoyaltyPoints").value) || 1 : 1,
    autoAddCustomer: $("#setAutoAddCustomer") ? $("#setAutoAddCustomer").value : "off",
    requireCustomerInfo: $("#setRequireCustomerInfo") ? $("#setRequireCustomerInfo").value : "off",
    showPurchaseHistory: $("#setShowPurchaseHistory") ? $("#setShowPurchaseHistory").value : "on",
    membershipCards: $("#setMembershipCards") ? $("#setMembershipCards").value : "off",
    
    supplierPaymentTerms: $("#setSupplierPaymentTerms") ? parseInt($("#setSupplierPaymentTerms").value) || 30 : 30,
    supplierStockAlert: $("#setSupplierStockAlert") ? $("#setSupplierStockAlert").value : "on",
    autoPurchaseOrder: $("#setAutoPurchaseOrder") ? $("#setAutoPurchaseOrder").value : "off",
    autoOrderLimit: $("#setAutoOrderLimit") ? parseFloat($("#setAutoOrderLimit").value) || 10000 : 10000,
    supplierCredit: $("#setSupplierCredit") ? $("#setSupplierCredit").value : "off",
    purchaseApproval: $("#setPurchaseApproval") ? $("#setPurchaseApproval").value : "off",
    purchaseReturn: $("#setPurchaseReturn") ? $("#setPurchaseReturn").value : "on",
    
    sessionTimeout: $("#setSessionTimeout") ? parseInt($("#setSessionTimeout").value) || 30 : 30,
    strongPassword: $("#setStrongPassword") ? $("#setStrongPassword").value : "on",
    auditLogging: $("#setAuditLogging") ? $("#setAuditLogging").value : "on",
    autoBackup: $("#setAutoBackup") ? parseInt($("#setAutoBackup").value) || 60 : 60,
    allowRoleChange: $("#setAllowRoleChange") ? $("#setAllowRoleChange").value : "off",
    allowDataDeletion: $("#setAllowDataDeletion") ? $("#setAllowDataDeletion").value : "off",
    loginAttemptLimit: $("#setLoginAttemptLimit") ? parseInt($("#setLoginAttemptLimit").value) || 5 : 5,
    twoFactorAuth: $("#setTwoFactorAuth") ? $("#setTwoFactorAuth").value : "off",
    
    defaultReportType: $("#setDefaultReportType") ? $("#setDefaultReportType").value : "daily",
    defaultExportFormat: $("#setDefaultExportFormat") ? $("#setDefaultExportFormat").value : "pdf",
    hideProductCode: $("#setHideProductCode") ? $("#setHideProductCode").value : "off",
    showProfitInReport: $("#setShowProfitInReport") ? $("#setShowProfitInReport").value : "on",
    autoDailyReport: $("#setAutoDailyReport") ? $("#setAutoDailyReport").value : "off",
    autoMonthlyReport: $("#setAutoMonthlyReport") ? $("#setAutoMonthlyReport").value : "off",
    
    barcodeType: $("#setBarcodeType") ? $("#setBarcodeType").value : "EAN13",
    barcodeLength: $("#setBarcodeLength") ? $("#setBarcodeLength").value : "13",
    autoGenerateBarcode: $("#setAutoGenerateBarcode") ? $("#setAutoGenerateBarcode").value : "on",
    barcodePrefix: $("#setBarcodePrefix") ? $("#setBarcodePrefix").value : "",
    barcodeLabelPrinting: $("#setBarcodeLabelPrinting") ? $("#setBarcodeLabelPrinting").value : "off",
    
    lowStockNotification: $("#setLowStockNotification") ? $("#setLowStockNotification").value : "on",
    largeSaleNotification: $("#setLargeSaleNotification") ? $("#setLargeSaleNotification").value : "on",
    largeSaleThreshold: $("#setLargeSaleThreshold") ? parseFloat($("#setLargeSaleThreshold").value) || 50000 : 50000,
    expiryNotification: $("#setExpiryNotification") ? $("#setExpiryNotification").value : "on",
    debtNotification: $("#setDebtNotification") ? $("#setDebtNotification").value : "on",
    shiftEndNotification: $("#setShiftEndNotification") ? $("#setShiftEndNotification").value : "on",
    supplierNotification: $("#setSupplierNotification") ? $("#setSupplierNotification").value : "on",
    dailySummaryAlert: $("#setDailySummaryAlert") ? $("#setDailySummaryAlert").value : "on",
    
    cash25000: $("#setCash25000") ? parseInt($("#setCash25000").value) || 0 : 0,
    cash10000: $("#setCash10000") ? parseInt($("#setCash10000").value) || 0 : 0,
    cash5000: $("#setCash5000") ? parseInt($("#setCash5000").value) || 0 : 0,
    cash1000: $("#setCash1000") ? parseInt($("#setCash1000").value) || 0 : 0,
    cash500: $("#setCash500") ? parseInt($("#setCash500").value) || 0 : 0,
    cash250: $("#setCash250") ? parseInt($("#setCash250").value) || 0 : 0,
    cash100: $("#setCash100") ? parseInt($("#setCash100").value) || 0 : 0,
    cash50: $("#setCash50") ? parseInt($("#setCash50").value) || 0 : 0,
    cash25: $("#setCash25") ? parseInt($("#setCash25").value) || 0 : 0,
    cash10: $("#setCash10") ? parseInt($("#setCash10").value) || 0 : 0,
    cash5: $("#setCash5") ? parseInt($("#setCash5").value) || 0 : 0,
    cash1: $("#setCash1") ? parseInt($("#setCash1").value) || 0 : 0,
    requireCashCount: $("#setRequireCashCount") ? $("#setRequireCashCount").value : "on",
    enableCashDrawer: $("#setEnableCashDrawer") ? $("#setEnableCashDrawer").value : "off",
    autoOpenDrawer: $("#setAutoOpenDrawer") ? $("#setAutoOpenDrawer").value : "on",
    receiptStyle: prevSettings.receiptStyle || (typeof getReceiptStyleId === "function" ? getReceiptStyleId() : ""),
    receiptColors: prevSettings.receiptColors || (typeof getReceiptColors === "function" ? getReceiptColors() : undefined)
  };
  DB.settings = Object.assign({}, prevSettings, settingsPatch);
  DataStore.saveSettings();
  if (typeof SqliteDB !== "undefined" && SqliteDB.persistNow) {
    try { SqliteDB.persistNow(); } catch (ePersistSet) {}
  }
  syncStoreNameToServer(DB.settings.marketName || "");
  syncReceiptSettingsToServer();
  updateMarketBrandUI();
  updateLiveReceiptPreview();
  if (window.I18n && DB.settings.language) I18n.set(DB.settings.language, { persist: false, toast: false });
  if (window.CashierButtons) CashierButtons.apply();
  toast("سەرکەوتوو", "ڕێکخستنەکان پاشکەوت کران!", "success");
}

function handleMarketLogoUpload(event) {
  var file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast("هەڵە", "تکایە تەنها وێنە هەڵبژێرە", "error");
    return;
  }
  var reader = new FileReader();
  reader.onload = function (e) {
    var rawUrl = e.target.result;
    var img = new Image();
    img.onload = function () {
      var maxDim = 380;
      var w = img.width;
      var h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      var canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      var compressedDataUrl = canvas.toDataURL("image/webp", 0.90);

      if (!DB.settings) DB.settings = {};
      DB.settings.marketLogo = compressedDataUrl;
      if (typeof SqliteDB !== "undefined" && SqliteDB.setSetting) {
        SqliteDB.setSetting("market_logo", compressedDataUrl);
      }
      DataStore.saveSettings();
      renderMarketLogoPreview();
      updateMarketBrandUI();
      updateLiveReceiptPreview();
      toast("سەرکەوتوو", "لۆگۆی مارکێت بە سەرکەوتوویی بارکرا", "success");
    };
    img.src = rawUrl;
  };
  reader.readAsDataURL(file);
}

function removeMarketLogo() {
  if (!DB.settings) DB.settings = {};
  DB.settings.marketLogo = "";
  if (typeof SqliteDB !== "undefined" && SqliteDB.setSetting) {
    SqliteDB.setSetting("market_logo", "");
  }
  DataStore.saveSettings();
  renderMarketLogoPreview();
  updateMarketBrandUI();
  updateLiveReceiptPreview();
  toast("سەرکەوتوو", "لۆگۆی مارکێت سڕایەوە", "info");
}

function renderMarketLogoPreview() {
  var logo = DB.settings && DB.settings.marketLogo;
  var imgEl = document.getElementById("marketLogoImg");
  var placeholderEl = document.getElementById("marketLogoPlaceholder");
  if (imgEl && placeholderEl) {
    if (logo) {
      imgEl.src = logo;
      imgEl.style.display = "block";
      placeholderEl.style.display = "none";
    } else {
      imgEl.src = "";
      imgEl.style.display = "none";
      placeholderEl.style.display = "block";
    }
  }
}

function pushCustomerBrand(extra) {
  var nameEl = document.getElementById("setMarketName");
  var tagEl = document.getElementById("setMarketTagline");
  var payload = {
    type: "brand_update",
    marketName: getStoreName(""),
    marketTagline: (tagEl && tagEl.value.trim()) || (DB.settings && DB.settings.marketTagline) || "",
    marketLogo: (DB.settings && DB.settings.marketLogo) || "",
    phone: (DB.settings && DB.settings.phone) || "",
    address: (DB.settings && DB.settings.address) || ""
  };
  if (extra) {
    Object.keys(extra).forEach(function (k) { payload[k] = extra[k]; });
  }
  try { localStorage.setItem("sm_settings", JSON.stringify(payload)); } catch (e) {}
  if ("BroadcastChannel" in window) {
    try {
      var bc = new BroadcastChannel("pos_customer_display");
      bc.postMessage(payload);
    } catch (e) {}
  }
  try {
    var baseUrl = (typeof ApiClient !== "undefined" && ApiClient.getBaseUrl) ? ApiClient.getBaseUrl() : "";
    fetch(baseUrl + "/api/customer-display/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(function () {});
  } catch (eSync) {}
}

function updateMarketBrandUI() {
  var name = getStoreName();
  var logo = DB.settings && DB.settings.marketLogo;

  var posStoreName = document.getElementById("posStoreName");
  if (posStoreName) posStoreName.textContent = name;

  var posLogo = document.getElementById("posStoreLogo");
  var posLogoWrap = document.getElementById("posStoreLogoWrap");
  if (posLogo && posLogoWrap) {
    if (logo) {
      posLogo.src = logo;
      posLogoWrap.style.display = "block";
    } else {
      posLogoWrap.style.display = "none";
    }
  }

  var brandText = document.getElementById("sidebarBrandText");
  if (brandText) brandText.textContent = name;
  var scaleName = document.getElementById("simScaleShopName");
  if (scaleName) scaleName.textContent = name;

  var brandLogo = document.getElementById("sidebarBrandLogo");
  var brandIcon = document.getElementById("sidebarBrandIcon");
  if (brandLogo && brandIcon) {
    if (logo) {
      brandLogo.src = logo;
      brandLogo.style.display = "inline-block";
      brandIcon.style.display = "none";
    } else {
      brandLogo.style.display = "none";
      brandIcon.style.display = "flex";
    }
  }

  document.title = name + " - سیستەمی وەرگرتنی پارە";
  var loginBrand = document.getElementById("loginBrandName");
  if (loginBrand) loginBrand.textContent = name;
  var loginAppLogo = document.getElementById("loginAppLogo");
  var loginBrandIcon = document.getElementById("loginBrandIcon");
  if (loginAppLogo) {
    loginAppLogo.src = logo || "assets/smart-serve-logo.svg?v=7";
    loginAppLogo.style.display = "block";
  }
  if (loginBrandIcon) loginBrandIcon.style.display = "none";
  if (name && !isFactoryBrandName(name)) {
    try {
      if (!DB.settings) DB.settings = {};
      if (DB.settings.marketName !== name) {
        DB.settings.marketName = name;
        if (typeof DataStore !== "undefined" && DataStore.saveSettings) DataStore.saveSettings();
      }
    } catch (eName) {}
    syncStoreNameToServer(name);
  }
  pushCustomerBrand();
}

function updateLiveReceiptPreview() {
  var name = getStoreName();
  var tagline = ($("#setMarketTagline") && $("#setMarketTagline").value.trim()) || (DB.settings && DB.settings.marketTagline) || "";
  var phone = ($("#setPhone") && $("#setPhone").value.trim()) || (DB.settings && DB.settings.phone) || "";
  var addr = ($("#setAddress") && $("#setAddress").value.trim()) || (DB.settings && DB.settings.address) || "";
  var header = ($("#setReceiptHeader") && $("#setReceiptHeader").value.trim()) || (DB.settings && DB.settings.receiptHeader) || "";
  var footer = ($("#setReceiptFooter") && $("#setReceiptFooter").value.trim()) || (DB.settings && DB.settings.receiptFooter) || "";
  pushCustomerBrand({
    marketName: name,
    marketTagline: tagline,
    phone: phone,
    address: addr
  });
  var showLogo = ($("#setShowLogo") && $("#setShowLogo").value !== "off");
  var showBc = !($("#setShowBarcode") && $("#setShowBarcode").value === "off");
  var logo = DB.settings && DB.settings.marketLogo;
  var prevSettings = DB.settings || {};
  var is58 = $("#setPrintType") && $("#setPrintType").value === "thermal58";
  var sample = {
    id: "SAMPLE-01",
    date: new Date().toISOString(),
    cashier: receiptLabel("cashier"),
    items: receiptSampleItems(),
    subtotal: 23000,
    discount: 0,
    total: 23000
  };
  var ctx;
  try {
    DB.settings = Object.assign({}, prevSettings, {
      marketName: name,
      marketTagline: tagline,
      phone: phone,
      address: addr,
      receiptHeader: header,
      receiptFooter: footer,
      showLogo: showLogo ? "on" : "off",
      showBarcode: showBc ? "on" : "off",
      marketLogo: logo
    });
    ctx = collectReceiptPrintCtx(sample, { isPreview: true, is58mm: is58 });
  } finally {
    DB.settings = prevSettings;
  }

  var sid = getReceiptStyleId();
  applyReceiptLiveCss(is58);
  var preview = document.getElementById("thermalReceiptPreview");
  if (preview) {
    preview.className = "thermal-receipt-preview rc-style-" + sid;
    preview.setAttribute("data-receipt-style", sid);
    preview.setAttribute("dir", receiptUiLang() === "en" ? "ltr" : "rtl");
    preview.innerHTML = '<div class="rc-style-' + sid + '"><div class="rc">' + buildReceiptInnerHtml(ctx) + "</div></div>";
  }
  var previewLbl = document.getElementById("rcPreviewStyleName");
  if (previewLbl) {
    var meta = getReceiptStyleMeta();
    previewLbl.textContent = billStyleLabel(meta);
  }
}

function runSettingsTestPrint() {
  var testOrder = {
    id: "SAMPLE-" + Math.floor(1000 + Math.random() * 9000),
    date: new Date().toISOString(),
    cashier: (AuthService.getSession() && AuthService.getSession().name) || receiptLabel("cashier"),
    items: receiptSampleItems().concat([{
      name: receiptUiLang() === "en" ? "Orange juice" : (receiptUiLang() === "ar" ? "عصير برتقال" : "شەربەتی پرتەقاڵ"),
      qty: 1, price: 18000, unitType: "carton", isPack: true, packQty: 12
    }]),
    subtotal: 39500,
    discount: 0,
    total: 39500
  };
  printReceiptDirect(testOrder);
  toast("سەرکەوتوو", "پێشبینینی چاپی پسوڵە ئامادە کرا", "info");
}

function downloadServerDatabase() {
  if (typeof BackupRestore !== "undefined" && typeof BackupRestore.downloadBackupFile === "function") {
    BackupRestore.downloadBackupFile();
    return;
  }
  toast("داتابەیس", "داگرتنی داتابەیسی سەرەکی SQLite دەستیپێکرد...", "info");
  window.open("/api/backup/download", "_blank");
}

function fetchDbBackupInfo() {
  if (typeof BackupRestore !== "undefined" && typeof BackupRestore.refreshDbStats === "function") {
    BackupRestore.refreshDbStats();
    return;
  }
}


function exportBackup() {
  var data = DataStore.exportJsonBackup({
    returnSales: RETURN_SALES,
    stockTransactions: STOCK_TRANSACTIONS,
    permissions: PERMISSIONS,
    loginLogs: LOGIN_LOGS,
    activityLogs: ACTIVITY_LOGS,
    changeTracker: CHANGE_TRACKER,
    deletedRecords: DELETED_RECORDS,
    offlineQueue: OFFLINE_QUEUE,
    priceHistory: PRICE_HISTORY,
    imageCache: getImageCacheMap()
  });
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "market_pos_backup_" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  DataStore.exportSqliteBackup();
  logActivity("backup", "Manual JSON + SQLite backup created");
  toast("سەرکەوتوو", "پاڕگەی پشتگیری هەناردە کرا (JSON + SQLite)", "success");
}

function restoreBackup() {
  if (typeof BackupRestore !== "undefined" && typeof BackupRestore.triggerRestore === "function") {
    BackupRestore.triggerRestore();
    return;
  }
  var input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,.sqlite,.db";
  input.onchange = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var name = (file.name || "").toLowerCase();
    if (name.endsWith(".sqlite") || name.endsWith(".db")) {
      if (typeof BackupRestore !== "undefined") {
        BackupRestore.handleFileSelect(e);
        return;
      }
      DataStore.importSqliteBackup(file).then(function () {
        toast("سەرکەوتوو", "داتابەیس گێڕایەوە", "success");
        location.reload();
      }).catch(function () {
        toast("هەڵە", "فایڵی SQLite نادروستە", "error");
      });
      return;
    }
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var data = JSON.parse(ev.target.result);
        DataStore.importJsonBackup(data, {
          returnSales: data.returnSales,
          stockTransactions: data.stockTransactions,
          permissions: data.permissions,
          loginLogs: data.loginLogs,
          activityLogs: data.activityLogs,
          changeTracker: data.changeTracker,
          deletedRecords: data.deletedRecords,
          offlineQueue: data.offlineQueue,
          priceHistory: data.priceHistory,
          imageCache: data.imageCache
        });
        if (data.returnSales) RETURN_SALES = data.returnSales;
        if (data.permissions) PERMISSIONS = data.permissions;
        if (data.loginLogs) LOGIN_LOGS = data.loginLogs;
        if (data.activityLogs) ACTIVITY_LOGS = data.activityLogs;
        if (data.changeTracker) CHANGE_TRACKER = data.changeTracker;
        if (data.deletedRecords) DELETED_RECORDS = data.deletedRecords;
        if (data.offlineQueue) OFFLINE_QUEUE = data.offlineQueue;
        if (data.priceHistory) PRICE_HISTORY = data.priceHistory;
        if (data.stockTransactions) STOCK_TRANSACTIONS = data.stockTransactions;
        if (data.imageCache) saveImageCacheMap(data.imageCache);
        logActivity("restore", "System restored from backup");
        toast("سەرکەوتوو", "سیستەم گێڕایەوە", "success");
        location.reload();
      } catch (err) {
        toast("هەڵە", "فایڵی نادروست", "error");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function exportData() {
  var data = { products: DB.products, orders: DB.orders, exportDate: new Date().toISOString() };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "market_pos_export_" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  logActivity("export", "Data exported");
  toast("سەرکەوتوو", "داتا هەناردەکرا", "success");
}

function importData() {
  var input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (data.products) {
          data.products.forEach(function (p) {
            if (!p.id) p.id = gid();
            DB.products.push(p);
          });
          DataStore.saveProducts();
        }
        if (data.orders) {
          data.orders.forEach(function (o) {
            if (!o.id) o.id = gid();
            DB.orders.push(o);
          });
          DataStore.saveOrders();
        }
        logActivity("import", "Data imported");
        toast("سەرکەوتوو", "داتا هاوردەکرا", "success");
        renderPosGrid();
        renderInventory();
      } catch (err) {
        toast("هەڵە", "فایڵی نادروست", "error");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function autoBackup() {
  DataStore.runAutoBackup({
    returnSales: RETURN_SALES,
    stockTransactions: STOCK_TRANSACTIONS,
    permissions: PERMISSIONS,
    loginLogs: LOGIN_LOGS,
    activityLogs: ACTIVITY_LOGS,
    changeTracker: CHANGE_TRACKER,
    deletedRecords: DELETED_RECORDS,
    offlineQueue: OFFLINE_QUEUE,
    priceHistory: PRICE_HISTORY,
    imageCache: getImageCacheMap()
  });
  logActivity("auto_backup", "Automatic backup saved to SQLite");
}

function applyEmptyCatalog() {
  var ids = [];
  (DB.products || []).forEach(function (p) { if (p && p.id) ids.push(p.id); });
  (DB.categories || []).forEach(function (c) { if (c && c.id) ids.push(c.id); });
  ids.forEach(function (id) {
    try { removeCachedImage(id); } catch (e) {}
  });
  DB.products = [];
  DB.categories = [];
  DataStore.saveProducts();
  DataStore.saveCategories();
  if (!DB.settings) DB.settings = {};
  DB.settings.demoCatalogCleared = true;
  DB.settings.incompletePosProducts = [];
  DataStore.saveSettings();
  CART = [];
  try {
    if (typeof CUSTOMER_QUEUE !== "undefined") {
      Object.keys(CUSTOMER_QUEUE).forEach(function (k) {
        if (CUSTOMER_QUEUE[k]) CUSTOMER_QUEUE[k].cart = [];
      });
    }
  } catch (e) {}
  try { renderProducts(); } catch (e) {}
  try { renderCategories(); } catch (e) {}
  try { renderPosGrid(); } catch (e) {}
  try { renderPosCategories(); } catch (e) {}
  try { if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs(); } catch (e) {}
  try { if (typeof renderCart === "function") renderCart(); } catch (e) {}
  try { refreshProductCategorySelects(); } catch (e) {}
}

function clearCatalogForLiveSelling() {
  var pCount = (DB.products || []).length;
  var cCount = (DB.categories || []).length;
  DELETE_CALLBACK = function () {
    var finish = function () {
      applyEmptyCatalog();
      toast("سەرکەوتوو", "هەموو کاڵا و پۆلەکان سڕانەوە. ئێستا پۆل و کاڵای خۆت زیاد بکە، پاشان لە وەرگرتنی پارە بفرۆشە.", "success");
    };
    if (typeof ApiClient !== "undefined" && typeof ApiClient.isOnline === "function" && ApiClient.isOnline() && typeof ApiClient.clearCatalog === "function") {
      ApiClient.clearCatalog().then(finish).catch(finish);
    } else {
      finish();
    }
  };
  var msgEl = $("#deleteModalText");
  if (msgEl) {
    msgEl.textContent = "هەموو " + pCount + " کاڵا و " + cCount + " پۆل بسڕدرێتەوە؟ فرۆشتن و کڕیار و ڕێکخستن نامێنێت. دوای سڕینەوە دەتوانیت کاڵای خۆت زیاد بکەیت و بفرۆشیت.";
  }
  showModal("deleteModal");
}
window.clearCatalogForLiveSelling = clearCatalogForLiveSelling;

function saleLinePieces(item, prod) {
  var qty = parseFloat(item && (item.qty != null ? item.qty : item.returnQty)) || 0;
  var isCarton = !!(item && (item.unitType === "carton" || item.isPack === true));
  var pack = parseFloat((item && item.packQty) || (prod && prod.packQty) || 1) || 1;
  return isCarton ? qty * pack : qty;
}

function restoreProductStockPieces(prodId, pieces) {
  if (!prodId || !pieces) return;
  var prod = (DB.products || []).find(function (p) { return p.id === prodId; });
  if (!prod || !productTracksStock(prod)) return;
  prod.stock = Math.max(0, (parseFloat(prod.stock) || 0) + pieces);
}

function getSalesResetParts(forceAll) {
  if (forceAll) {
    return { sales: true, returns: true, debts: true, shifts: true, held: true, expenses: true, stockLogs: true };
  }
  return {
    sales: !!(document.getElementById("resetPartSales") && document.getElementById("resetPartSales").checked),
    returns: !!(document.getElementById("resetPartReturns") && document.getElementById("resetPartReturns").checked),
    debts: !!(document.getElementById("resetPartDebts") && document.getElementById("resetPartDebts").checked),
    shifts: !!(document.getElementById("resetPartShifts") && document.getElementById("resetPartShifts").checked),
    held: !!(document.getElementById("resetPartHeld") && document.getElementById("resetPartHeld").checked),
    expenses: !!(document.getElementById("resetPartExpenses") && document.getElementById("resetPartExpenses").checked),
    stockLogs: !!(document.getElementById("resetPartStockLogs") && document.getElementById("resetPartStockLogs").checked)
  };
}

function setSalesResetChecks(on) {
  ["resetPartSales", "resetPartReturns", "resetPartDebts", "resetPartShifts", "resetPartHeld", "resetPartExpenses", "resetPartStockLogs"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.checked = !!on;
  });
  refreshSalesResetPreview();
}

function setSalesClearMode(mode) {
  SALES_CLEAR_MODE = mode === "list" ? "list" : (mode === "all" ? "all" : "");
  var allBtn = document.getElementById("salesClearModeAll");
  var listBtn = document.getElementById("salesClearModeList");
  var allPanel = document.getElementById("salesClearAllPanel");
  var listPanel = document.getElementById("salesClearListPanel");
  if (allBtn) allBtn.classList.toggle("active", SALES_CLEAR_MODE === "all");
  if (listBtn) listBtn.classList.toggle("active", SALES_CLEAR_MODE === "list");
  if (allPanel) allPanel.style.display = SALES_CLEAR_MODE === "all" ? "block" : "none";
  if (listPanel) listPanel.style.display = SALES_CLEAR_MODE === "list" ? "block" : "none";
  if (SALES_CLEAR_MODE === "list") {
    showSalesResetList(SALES_RESET_LIST_TAB || "sales");
  } else {
    refreshSalesResetPreview();
  }
}

function getCashHandoversList() {
  try {
    if (typeof SqliteDB !== "undefined" && SqliteDB.getCollection) {
      return SqliteDB.getCollection("cash_handovers") || [];
    }
  } catch (eHo) {}
  try { return JSON.parse(localStorage.getItem("sm_cash_handovers") || "[]"); } catch (eLs) { return []; }
}

function saveCashHandoversList(list) {
  list = list || [];
  try {
    if (typeof SqliteDB !== "undefined" && SqliteDB.replaceCollection) {
      SqliteDB.replaceCollection("cash_handovers", list, "id");
    }
  } catch (eHo) {}
  try { localStorage.setItem("sm_cash_handovers", JSON.stringify(list)); } catch (eLs) {}
}

function persistCashMovementsLocal() {
  if (typeof DataStore !== "undefined" && DataStore.saveCashMovements) {
    DataStore.saveCashMovements();
    return;
  }
  try {
    if (typeof SqliteDB !== "undefined" && SqliteDB.replaceCollection) {
      SqliteDB.replaceCollection("cash_movements", DB.cashMovements || [], "id");
    }
  } catch (eMv) {}
}

function refreshSalesResetPreview() {
  var box = document.getElementById("salesResetPreview");
  if (box) {
    var n = function (arr) { return (arr || []).length; };
    var cashDrawer = n(DB.cashMovements) + n(getCashHandoversList());
    var cells = [
      { label: "پسوڵە", val: n(DB.orders) },
      { label: "گەڕانەوە", val: n(typeof RETURN_SALES !== "undefined" ? RETURN_SALES : []) },
      { label: "قەرز", val: n(DB.debts) },
      { label: "شێفت", val: n(DB.shifts) },
      { label: "سندوق / تەسلیم", val: cashDrawer },
      { label: "ڕاگیراو", val: n(DB.suspendedSales) },
      { label: "مەسرەف", val: n(DB.expenses) }
    ];
    box.innerHTML = cells.map(function (c) {
      return '<div style="background:var(--bg-input);border:1px solid var(--border-color);border-radius:10px;padding:8px;text-align:center;">' +
        '<div style="font-size:1.05rem;font-weight:900;font-family:monospace;">' + c.val + '</div>' +
        '<div style="font-size:0.72rem;color:var(--text-muted);">' + c.label + '</div></div>';
    }).join("");
  }
  if (SALES_CLEAR_MODE === "list") renderSalesResetList();
}

var SALES_RESET_LIST_TAB = "sales";
var SALES_CLEAR_MODE = "";

function salesResetSafe(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function showSalesResetList(tab) {
  SALES_RESET_LIST_TAB = tab || "sales";
  ["sales", "expenses", "returns", "debts", "shifts", "held"].forEach(function (t) {
    var btn = document.getElementById("resetListTab" + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.classList.toggle("active", t === SALES_RESET_LIST_TAB);
  });
  renderSalesResetList();
}

function getSalesResetListRows() {
  var q = ((document.getElementById("salesResetListSearch") || {}).value || "").trim().toLowerCase();
  var rows = [];
  if (SALES_RESET_LIST_TAB === "expenses") {
    (DB.expenses || []).forEach(function (e) {
      var title = (e.description || e.category || e.type || "مەسرەف");
      if (q && (title + " " + (e.amount || "")).toLowerCase().indexOf(q) < 0) return;
      rows.push({ kind: "expense", id: e.id, date: e.date, title: title, amount: parseFloat(e.amount) || 0 });
    });
  } else if (SALES_RESET_LIST_TAB === "returns") {
    ((typeof RETURN_SALES !== "undefined" ? RETURN_SALES : []) || []).forEach(function (r) {
      var names = (r.items || []).map(function (i) { return i.name; }).join("، ");
      var title = names || ("گەڕانەوە " + String(r.id || "").slice(-6));
      if (q && title.toLowerCase().indexOf(q) < 0) return;
      rows.push({ kind: "return", id: r.id, date: r.date, title: title, amount: parseFloat(r.totalRefund || r.refundAmount) || 0 });
    });
  } else if (SALES_RESET_LIST_TAB === "debts") {
    (DB.debts || []).forEach(function (d) {
      var title = (d.customerName || "کڕیار") + (d.customerPhone ? " · " + d.customerPhone : "");
      if (q && title.toLowerCase().indexOf(q) < 0) return;
      var rem = typeof getDebtRemainingAmount === "function" ? getDebtRemainingAmount(d) : (parseFloat(d.remainingAmount || d.amount) || 0);
      rows.push({ kind: "debt", id: d.id, date: d.date, title: title, amount: rem });
    });
  } else if (SALES_RESET_LIST_TAB === "shifts") {
    (DB.shifts || []).forEach(function (s) {
      var title = "شێفت: " + (s.shiftType || s.type || "گشتی") + (s.cashier ? " · " + s.cashier : "") + (s.status === "open" ? " · کراوە" : " · داخراو");
      if (q && (title + " " + (s.id || "")).toLowerCase().indexOf(q) < 0) return;
      rows.push({ kind: "shift", id: s.id, date: s.openedAt || s.startTime || s.date, title: title, amount: parseFloat(s.totalSales || s.cashSales) || 0 });
    });
    (DB.cashMovements || []).forEach(function (m) {
      var dir = m.type === "out" ? "دەرچوونی سندوق" : "هاتنەژووری سندوق";
      var title = dir + (m.reason ? " · " + m.reason : "") + (m.cashier ? " · " + m.cashier : "");
      if (q && title.toLowerCase().indexOf(q) < 0) return;
      rows.push({ kind: "cash", id: m.id, date: m.date || m.timestamp, title: title, amount: parseFloat(m.amount) || 0 });
    });
    getCashHandoversList().forEach(function (h) {
      var title = "تەسلیمی سندوق" + (h.cashier ? " · " + h.cashier : "") + (h.toCashier ? " → " + h.toCashier : "");
      if (q && title.toLowerCase().indexOf(q) < 0) return;
      rows.push({ kind: "handover", id: h.id, date: h.date || h.createdAt, title: title, amount: parseFloat(h.cashOnHand || h.expectedCash || h.received) || 0 });
    });
  } else if (SALES_RESET_LIST_TAB === "held") {
    (DB.suspendedSales || []).forEach(function (s) {
      var names = (s.items || []).map(function (i) { return i.name; }).join("، ");
      var title = "ڕاگیراو: " + (s.customerName || s.customer || "کڕیار") + (names ? " · " + names : "");
      if (q && title.toLowerCase().indexOf(q) < 0) return;
      rows.push({ kind: "held", id: s.id, date: s.date || s.heldAt || s.createdAt, title: title, amount: parseFloat(s.total) || 0 });
    });
  } else {
    incomeOrders(DB.orders || []).forEach(function (o) {
      var names = (o.items || []).map(function (i) { return i.name; }).join("، ");
      var title = (o.customerName || "فرۆشتن") + (names ? " · " + names : "") + " #" + String(o.id || "").slice(-6);
      if (q && (title + " " + (o.cashier || "")).toLowerCase().indexOf(q) < 0) return;
      rows.push({ kind: "order", id: o.id, date: o.date || o.orderDate, title: title, amount: parseFloat(o.total) || 0 });
    });
  }
  rows.sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });
  return rows;
}

function renderSalesResetList() {
  var tbody = document.getElementById("salesResetListBody");
  if (!tbody) return;
  var rows = getSalesResetListRows();
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:22px;color:var(--text-muted);">هیچ تۆمارێک نییە</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(function (r) {
    var d = r.date ? new Date(r.date) : null;
    var ds = d && !isNaN(d.getTime()) ? formatSaleDateTime(d, true) : "-";
    return '<tr>' +
      '<td><input type="checkbox" class="sales-reset-row" data-kind="' + r.kind + '" data-id="' + salesResetSafe(r.id) + '"></td>' +
      '<td style="white-space:nowrap;font-size:0.78rem;">' + salesResetSafe(ds) + '</td>' +
      '<td>' + salesResetSafe(r.title) + '</td>' +
      '<td style="font-weight:800;">' + (typeof fmt === "function" ? fmt(r.amount) : r.amount) + '</td>' +
      '<td><button type="button" class="btn btn-danger btn-sm" onclick="deleteSalesResetRecord(\'' + r.kind + '\',\'' + String(r.id).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + '\')"><i class="fas fa-trash"></i> سڕینەوە</button></td>' +
      '</tr>';
  }).join("");
}

function toggleSalesResetListSelectAll() {
  var boxes = document.querySelectorAll("#salesResetListBody .sales-reset-row");
  var allOn = true;
  boxes.forEach(function (b) { if (!b.checked) allOn = false; });
  boxes.forEach(function (b) { b.checked = !allOn; });
}

function restoreStockForOrder(order) {
  if (!order) return;
  (order.items || []).forEach(function (it) {
    var prod = (DB.products || []).find(function (p) { return p.id === it.prodId; });
    restoreProductStockPieces(it.prodId, saleLinePieces(it, prod));
  });
}

function undoStockForReturn(ret) {
  if (!ret) return;
  (ret.items || []).forEach(function (it) {
    var prod = (DB.products || []).find(function (p) { return p.id === it.prodId; });
    var pieces = parseFloat(it.returnQty != null ? it.returnQty : it.qty) || 0;
    if (it.unitType === "carton" || it.isPack) {
      pieces = saleLinePieces({ qty: pieces, unitType: "carton", packQty: it.packQty }, prod);
    }
    restoreProductStockPieces(it.prodId, -pieces);
  });
}

function deleteSalesResetRecord(kind, id, silent) {
  if (!id) return;
  if (kind === "order") {
    var order = (DB.orders || []).find(function (o) { return o.id === id; });
    if (!order) return;
    ((typeof RETURN_SALES !== "undefined" ? RETURN_SALES : []) || []).filter(function (r) { return r.originalOrderId === id; }).forEach(undoStockForReturn);
    if (typeof RETURN_SALES !== "undefined") {
      RETURN_SALES = RETURN_SALES.filter(function (r) { return r.originalOrderId !== id; });
      if (DataStore.saveReturnSales) DataStore.saveReturnSales(RETURN_SALES);
    }
    restoreStockForOrder(order);
    (DB.debts || []).filter(function (d) { return d.orderId === id; }).forEach(function (debt) {
      if (!debt.customerId) return;
      var remain = typeof getDebtRemainingAmount === "function" ? getDebtRemainingAmount(debt) : (parseFloat(debt.remainingAmount || debt.amount) || 0);
      var cust = (DB.customers || []).find(function (c) { return c.id === debt.customerId; });
      if (cust) cust.currentDebt = Math.max(0, (parseFloat(cust.currentDebt) || 0) - remain);
    });
    DB.debts = (DB.debts || []).filter(function (d) { return d.orderId !== id; });
    if (DataStore.saveDebts) DataStore.saveDebts();
    if (DataStore.saveCustomers) DataStore.saveCustomers();
    DB.orders = (DB.orders || []).filter(function (o) { return o.id !== id; });
    if (LAST_ORDER && LAST_ORDER.id === id) LAST_ORDER = null;
    if (DataStore.saveOrders) DataStore.saveOrders();
    if (DataStore.saveProducts) DataStore.saveProducts();
  } else if (kind === "expense") {
    DB.expenses = (DB.expenses || []).filter(function (e) { return e.id !== id; });
    if (DataStore.saveExpenses) DataStore.saveExpenses();
  } else if (kind === "return") {
    var ret = ((typeof RETURN_SALES !== "undefined" ? RETURN_SALES : []) || []).find(function (r) { return r.id === id; });
    if (ret) undoStockForReturn(ret);
    RETURN_SALES = (RETURN_SALES || []).filter(function (r) { return r.id !== id; });
    if (DataStore.saveReturnSales) DataStore.saveReturnSales(RETURN_SALES);
    if (DataStore.saveProducts) DataStore.saveProducts();
  } else if (kind === "debt") {
    var debt = (DB.debts || []).find(function (d) { return d.id === id; });
    if (debt && debt.customerId) {
      var remain = typeof getDebtRemainingAmount === "function" ? getDebtRemainingAmount(debt) : (parseFloat(debt.remainingAmount || debt.amount) || 0);
      var cust = (DB.customers || []).find(function (c) { return c.id === debt.customerId; });
      if (cust) cust.currentDebt = Math.max(0, (parseFloat(cust.currentDebt) || 0) - remain);
      if (DataStore.saveCustomers) DataStore.saveCustomers();
    }
    DB.debts = (DB.debts || []).filter(function (d) { return d.id !== id; });
    if (DataStore.saveDebts) DataStore.saveDebts();
  } else if (kind === "shift") {
    DB.shifts = (DB.shifts || []).filter(function (s) { return s.id !== id; });
    if (typeof CURRENT_SHIFT !== "undefined" && CURRENT_SHIFT && CURRENT_SHIFT.id === id) CURRENT_SHIFT = null;
    if (typeof DataStore !== "undefined" && DataStore.saveShifts) DataStore.saveShifts();
    try { if (typeof updateShiftButtons === "function") updateShiftButtons(); } catch (eShUi) {}
  } else if (kind === "cash") {
    DB.cashMovements = (DB.cashMovements || []).filter(function (m) { return m.id !== id; });
    persistCashMovementsLocal();
  } else if (kind === "handover") {
    saveCashHandoversList(getCashHandoversList().filter(function (h) { return h.id !== id; }));
  } else if (kind === "held") {
    DB.suspendedSales = (DB.suspendedSales || []).filter(function (s) { return s.id !== id; });
    if (typeof DataStore !== "undefined" && DataStore.saveSuspendedSales) DataStore.saveSuspendedSales();
  }
  if (typeof ApiClient !== "undefined" && ApiClient.isOnline && ApiClient.isOnline() && ApiClient.deleteSalesRecord) {
    ApiClient.deleteSalesRecord(kind, id).catch(function () {});
  }
  if (!silent) {
    toast("سەرکەوتوو", "تۆمارەکە سڕایەوە و بڕی کاڵا گەڕایەوە (ئەگەر پسوڵە بوو)", "warning");
    try { if (typeof renderDashboard === "function") renderDashboard(); } catch (e) {}
    try { if (typeof renderProductGrid === "function") renderProductGrid(); } catch (e2) {}
    try { if (typeof renderInventory === "function") renderInventory(); } catch (e3) {}
  }
  refreshSalesResetPreview();
}

function deleteSelectedSalesResetRows() {
  var boxes = document.querySelectorAll("#salesResetListBody .sales-reset-row:checked");
  if (!boxes.length) {
    toast("ئاگاداری", "تۆمارێک هەڵبژێرە", "warning");
    return;
  }
  var items = [];
  boxes.forEach(function (b) { items.push({ kind: b.getAttribute("data-kind"), id: b.getAttribute("data-id") }); });
  DELETE_CALLBACK = function () {
    items.forEach(function (it) { deleteSalesResetRecord(it.kind, it.id, true); });
    toast("سەرکەوتوو", items.length + " تۆمار سڕایەوە", "warning");
    try { if (typeof renderDashboard === "function") renderDashboard(); } catch (e) {}
    try { if (typeof renderProductGrid === "function") renderProductGrid(); } catch (e2) {}
    refreshSalesResetPreview();
  };
  var msgEl = $("#deleteModalText");
  if (msgEl) msgEl.textContent = items.length + " تۆماری هەڵبژێردراو بسڕدرێتەوە؟ کاڵا و پۆل دەمێننەوە. بڕی کاڵای پسوڵەکان دەگەڕێتەوە.";
  showModal("deleteModal");
}

function confirmClearCurrentResetList() {
  var tab = SALES_RESET_LIST_TAB || "sales";
  var parts = { sales: false, returns: false, debts: false, shifts: false, held: false, expenses: false, stockLogs: false };
  var label = "ئەم لیستە";
  if (tab === "sales") { parts.sales = true; parts.returns = true; parts.held = true; parts.stockLogs = true; label = "هەموو پسوڵە و داهات"; }
  else if (tab === "expenses") { parts.expenses = true; label = "هەموو مەسرەف"; }
  else if (tab === "returns") { parts.returns = true; label = "هەموو گەڕانەوە"; }
  else if (tab === "debts") { parts.debts = true; label = "هەموو قەرز"; }
  else if (tab === "shifts") { parts.shifts = true; label = "هەموو شێفت و سندوق"; }
  else if (tab === "held") { parts.held = true; label = "هەموو ڕاگیراوەکان"; }
  DELETE_CALLBACK = function () { executeSalesReset(parts); };
  var msgEl = $("#deleteModalText");
  if (msgEl) msgEl.textContent = label + " بسڕدرێتەوە؟ کاڵا و پۆل دەمێننەوە. بڕی کاڵا دەگەڕێتەوە بۆ کۆگا.";
  showModal("deleteModal");
}

window.setSalesClearMode = setSalesClearMode;
window.showSalesResetList = showSalesResetList;
window.renderSalesResetList = renderSalesResetList;
window.toggleSalesResetListSelectAll = toggleSalesResetListSelectAll;
window.deleteSalesResetRecord = deleteSalesResetRecord;
window.deleteSelectedSalesResetRows = deleteSelectedSalesResetRows;
window.confirmClearCurrentResetList = confirmClearCurrentResetList;

function applySalesResetLocal(parts, opts) {
  opts = opts || {};
  var skipStock = !!opts.skipStock;
  var returnsList = (typeof RETURN_SALES !== "undefined" && Array.isArray(RETURN_SALES)) ? RETURN_SALES : [];

  if (!skipStock) {
    if (parts.returns || parts.sales) {
      returnsList.forEach(function (ret) {
        (ret.items || []).forEach(function (it) {
          var prod = (DB.products || []).find(function (p) { return p.id === it.prodId; });
          var pieces = parseFloat(it.returnQty != null ? it.returnQty : it.qty) || 0;
          if (it.unitType === "carton" || it.isPack) {
            pieces = saleLinePieces({ qty: pieces, unitType: "carton", packQty: it.packQty }, prod);
          }
          restoreProductStockPieces(it.prodId, -pieces);
        });
      });
    }
    if (parts.sales) {
      (DB.orders || []).forEach(function (o) {
        (o.items || []).forEach(function (it) {
          var prod = (DB.products || []).find(function (p) { return p.id === it.prodId; });
          restoreProductStockPieces(it.prodId, saleLinePieces(it, prod));
        });
      });
    }
  }

  if (parts.sales) {
    DB.orders = [];
    LAST_ORDER = null;
    PENDING_DEBT = null;
    try { localStorage.removeItem("sm_offline_orders"); } catch (eOff) {}
    if (typeof DataStore !== "undefined" && DataStore.saveOrders) DataStore.saveOrders();
  }
  if (parts.returns) {
    RETURN_SALES = [];
    if (typeof DataStore !== "undefined" && DataStore.saveReturnSales) DataStore.saveReturnSales([]);
  }
  if (parts.debts) {
    (DB.debts || []).forEach(function (d) {
      var remain = parseFloat(d.remainingAmount != null ? d.remainingAmount : d.amount) || 0;
      if (!remain || !d.customerId) return;
      var cust = (DB.customers || []).find(function (c) { return c.id === d.customerId; });
      if (cust) cust.currentDebt = Math.max(0, (parseFloat(cust.currentDebt) || 0) - remain);
    });
    DB.debts = [];
    if (typeof DataStore !== "undefined" && DataStore.saveDebts) DataStore.saveDebts();
    if (typeof DataStore !== "undefined" && DataStore.saveCustomers) DataStore.saveCustomers();
  }
  if (parts.shifts) {
    DB.shifts = [];
    CURRENT_SHIFT = null;
    DB.cashMovements = [];
    saveCashHandoversList([]);
    persistCashMovementsLocal();
    if (typeof DataStore !== "undefined" && DataStore.saveShifts) DataStore.saveShifts();
    try { if (typeof updateShiftButtons === "function") updateShiftButtons(); } catch (eShClr) {}
  }
  if (parts.held) {
    DB.suspendedSales = [];
    CART = [];
    if (typeof POS_CASH_RECEIVED !== "undefined") POS_CASH_RECEIVED = 0;
    try {
      if (typeof CUSTOMER_QUEUE !== "undefined") {
        Object.keys(CUSTOMER_QUEUE).forEach(function (k) {
          if (CUSTOMER_QUEUE[k]) CUSTOMER_QUEUE[k].cart = [];
        });
      }
    } catch (eCart) {}
    if (typeof DataStore !== "undefined" && DataStore.saveSuspendedSales) DataStore.saveSuspendedSales();
    if (typeof renderCart === "function") renderCart();
  }
  if (parts.expenses) {
    DB.expenses = [];
    if (typeof DataStore !== "undefined" && DataStore.saveExpenses) DataStore.saveExpenses();
  } else if (parts.returns) {
    DB.expenses = (DB.expenses || []).filter(function (e) { return e.type !== "return" && e.category !== "return"; });
    if (typeof DataStore !== "undefined" && DataStore.saveExpenses) DataStore.saveExpenses();
  }
  if (parts.stockLogs) {
    STOCK_TRANSACTIONS = [];
    if (typeof DataStore !== "undefined" && DataStore.saveStockTransactions) DataStore.saveStockTransactions([]);
  }
  if (!skipStock && typeof DataStore !== "undefined" && DataStore.saveProducts) DataStore.saveProducts();
  try { if (typeof renderDashboard === "function") renderDashboard(); } catch (e1) {}
  try { if (typeof renderReports === "function") renderReports(); } catch (e2) {}
  try { if (typeof renderInventory === "function") renderInventory(); } catch (e3) {}
  try { if (typeof renderPosGrid === "function") renderPosGrid(); } catch (e4) {}
  try { if (typeof renderProductGrid === "function") renderProductGrid(); } catch (e5) {}
  try { if (typeof renderDebtPage === "function") renderDebtPage(); } catch (e6) {}
  try { if (typeof updateShiftButtons === "function") updateShiftButtons(); } catch (e7) {}
  refreshSalesResetPreview();
}

function confirmSalesReset(all) {
  var role = (DB.currentUser && DB.currentUser.role) || "";
  var isManager = typeof AuthService !== "undefined" && AuthService.isOwnerRole
    ? AuthService.isOwnerRole(role)
    : (role === "manager" || role === "admin");
  if (!isManager) {
    toast("ڕێگەپێنەدراو", "تەنها بەڕێوەبەر دەتوانێت فرۆشتن ڕێسێت بکات", "warning");
    return;
  }
  var parts = getSalesResetParts(!!all);
  if (parts.sales) parts.returns = true;
  var any = parts.sales || parts.returns || parts.debts || parts.shifts || parts.held || parts.expenses || parts.stockLogs;
  if (!any) {
    toast("ئاگاداری", "بەشێک هەڵبژێرە بۆ ڕێسێت", "warning");
    return;
  }
  var msg = all
    ? "هەموو پسوڵە، داهات، قەرز، گەڕانەوە، مەسرەف، شێفت و سندوق، و ڕاگیراو بسڕدرێتەوە؟ بڕی کاڵا دەگەڕێتەوە بۆ کۆگا. کاڵا و پۆل دەمێننەوە."
    : "بەشە هەڵبژێردراوەکان بسڕدرێنەوە؟ کاڵا و پۆل دەمێننەوە. بڕی کاڵا دەگەڕێتەوە.";
  DELETE_CALLBACK = function () { executeSalesReset(parts); };
  var msgEl = $("#deleteModalText");
  if (msgEl) msgEl.textContent = msg;
  showModal("deleteModal");
}

function executeSalesReset(parts) {
  var online = typeof ApiClient !== "undefined" && ApiClient.isOnline && ApiClient.isOnline() && typeof ApiClient.resetSales === "function";
  var done = function (skipStock) {
    applySalesResetLocal(parts, { skipStock: !!skipStock });
    logActivity("sales_reset", "ڕێسێتی فرۆشتن/داهاتی تاقیکردنەوە");
    toast("سەرکەوتوو", "فرۆشتن و داهات پاککرانەوە و بڕی کاڵا گەڕایەوە. کاڵا و پۆل ماون.", "warning");
  };
  if (online) {
    ApiClient.resetSales(parts).then(function (res) {
      if (res && Array.isArray(res.products) && res.products.length) {
        DB.products = res.products;
        if (typeof DataStore !== "undefined" && DataStore.saveProducts) DataStore.saveProducts();
      }
      done(true);
    }).catch(function () { done(false); });
  } else {
    done(false);
  }
}

window.setSalesResetChecks = setSalesResetChecks;
window.refreshSalesResetPreview = refreshSalesResetPreview;
window.confirmSalesReset = confirmSalesReset;

function clearAllData() {
  DELETE_CALLBACK = function () {
    SqliteDB.resetDatabase();
    AuthService.init().then(function () {
    DB.products = []; DB.orders = []; DB.categories = []; DB.settings = null; DB.debts = []; DB.shifts = []; DB.expenses = [];
      DB.users = []; DB.suspendedSales = []; DB.suppliers = []; DB.purchases = [];
      RETURN_SALES = []; STOCK_TRANSACTIONS = []; PRICE_HISTORY = [];
    CART = []; renderCart();
    toast("سەرکەوتوو", "هەموو داتاکان سڕانەوە", "info");
    setTimeout(function () { location.reload(); }, 1500);
    });
  };
  $("#deleteModalText").textContent = "هەموو داتاکان بسڕەوە؟ ئەمە ناگەڕێتەوە.";
  showModal("deleteModal");
}


/* ═══ OFFLINE IMAGE SYSTEM ═══ */

function generatePlaceholderImage(label, color, emoji) {
  var canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 200;
  var ctx = canvas.getContext("2d");

  // Elegant dark obsidian gradient well
  var gradient = ctx.createLinearGradient(0, 0, 200, 200);
  gradient.addColorStop(0, "#1e293b");
  gradient.addColorStop(1, "#0f172a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 200, 200);

  // Subtle colored glow accent matching category
  if (color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.28;
  ctx.beginPath();
    ctx.arc(100, 92, 54, 0, Math.PI * 2);
  ctx.fill();
    ctx.restore();
  }

  // Soft glass circle
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.beginPath();
  ctx.arc(100, 92, 46, 0, Math.PI * 2);
  ctx.fill();

  // Crisp centered emoji
  ctx.font = "64px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji || "📦", 100, 92);

  // Subtle title badge
  ctx.font = "bold 13px sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  ctx.fillText(label || "", 100, 168);

  return canvas.toDataURL("image/png");
}

function shadeColor(color, percent) {
  var num = parseInt(color.replace("#", ""), 16);
  var amt = Math.round(2.55 * percent);
  var R = Math.max(0, Math.min(255, (num >> 16) + amt));
  var G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  var B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

var PLACEHOLDER_IMAGES = {};
var IMAGE_CACHE_KEY = "image_cache";
var IMAGE_CACHE_MEMORY = null;

function getImageCacheMap() {
  if (IMAGE_CACHE_MEMORY) return IMAGE_CACHE_MEMORY;
  try {
    IMAGE_CACHE_MEMORY = SqliteDB.getSetting("image_cache", {}) || {};
  } catch (e) {
    IMAGE_CACHE_MEMORY = {};
  }
  return IMAGE_CACHE_MEMORY;
}

function saveImageCacheMap(map) {
  IMAGE_CACHE_MEMORY = map || {};
  DataStore.saveImageCache(IMAGE_CACHE_MEMORY);
}

function getCachedImage(id) {
  if (!id) return null;
  return getImageCacheMap()[id] || null;
}

function setCachedImage(id, dataUrl) {
  if (!id || !dataUrl) return false;
  var map = getImageCacheMap();
  map[id] = dataUrl;
  try {
    saveImageCacheMap(map);
    return true;
  } catch (e) {
    pruneImageCache(map);
    try {
      saveImageCacheMap(map);
      return true;
    } catch (e2) {
      toast("هەڵە", "بیرگەی وێنە پڕ بوو — فایل بەکاربهێنە یان وێنە بچووکتر بکە", "error");
      return false;
    }
  }
}

function removeCachedImage(id) {
  if (!id) return;
  var map = getImageCacheMap();
  if (!map[id]) return;
  delete map[id];
  saveImageCacheMap(map);
}

function pruneImageCache(map) {
  var keys = Object.keys(map);
  while (keys.length > 80) delete map[keys.shift()];
}

function isRemoteImageUrl(url) {
  return !!url && /^https?:\/\//i.test(url);
}

function isDataImage(url) {
  return !!url && url.indexOf("data:image") === 0;
}

function escapeAttr(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function loadImageElement(url) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () { resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

function compressImageElement(img, maxSize) {
  maxSize = maxSize || 480;
  var w = img.naturalWidth || img.width;
  var h = img.naturalHeight || img.height;
  if (!w || !h) return null;
  var side = Math.min(w, h);
  var sx = Math.max(0, Math.floor((w - side) / 2));
  var sy = Math.max(0, Math.floor((h - side) / 2));
  var canvas = document.createElement("canvas");
  canvas.width = maxSize;
  canvas.height = maxSize;
  var ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, maxSize, maxSize);
  try {
    ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch (e) {
    return null;
  }
}

function cacheRemoteImage(id, url) {
  if (!id || !isRemoteImageUrl(url)) return Promise.resolve(null);
  if (getCachedImage(id)) return Promise.resolve(getCachedImage(id));

  return fetch(url, { mode: "cors" })
    .then(function (response) {
      if (!response.ok) throw new Error("fetch failed");
      return response.blob();
    })
    .then(function (blob) {
      var objectUrl = URL.createObjectURL(blob);
      return loadImageElement(objectUrl).finally(function () { URL.revokeObjectURL(objectUrl); });
    })
    .catch(function () { return loadImageElement(url); })
    .then(function (img) {
      var dataUrl = compressImageElement(img);
      if (dataUrl) setCachedImage(id, dataUrl);
      return dataUrl;
    })
    .catch(function () { return null; });
}

function storeImageForItem(id, imageUrl, label) {
  if (!id || !imageUrl) return;
  if (isDataImage(imageUrl)) {
    var compressedPromise = loadImageElement(imageUrl).then(function (img) {
      return compressImageElement(img) || imageUrl;
    }).catch(function () { return imageUrl; });
    compressedPromise.then(function (dataUrl) {
      if (setCachedImage(id, dataUrl)) refreshImageViews();
    });
    return;
  }
  if (isRemoteImageUrl(imageUrl)) {
    if (!navigator.onLine) {
      toast("ئاگادارکردن", "ئۆفلاین — وێنە دوای گەڕانەوەی ئینتەرنێت پاشکەوت دەکرێت", "warning");
      return;
    }
    cacheRemoteImage(id, imageUrl).then(function (dataUrl) {
      if (dataUrl) {
        toast("وێنە هەڵگیرا", (label || "بەرهەم") + " — ئامادەیە بێ ئینتەرنێت", "success");
        refreshImageViews();
      } else {
        toast("ئاگادارکردن", "ناتوانرێت وێنە داگیرێت — فایل هەڵبژێرە", "warning");
      }
    });
  }
}

function refreshImageViews() {
  try { renderProducts(); } catch (e) {}
  try { renderPosGrid(); } catch (e) {}
  try { renderPosCategories(); } catch (e) {}
  try { if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs(); } catch (e) {}
  try { if (typeof renderProductGrid === "function") renderProductGrid(); } catch (e) {}
  try { renderCategories(); } catch (e) {}
  try { renderCart(); } catch (e) {}
}

function warmImageCache(silent) {
  if (!navigator.onLine) return;
  var pending = 0;
  DB.products.forEach(function (p) {
    if (isRemoteImageUrl(p.image) && !getCachedImage(p.id)) {
      pending++;
      cacheRemoteImage(p.id, p.image).then(function (dataUrl) {
        if (dataUrl) refreshImageViews();
      });
    }
  });
  DB.categories.forEach(function (c) {
    if (isRemoteImageUrl(c.image) && !getCachedImage(c.id)) {
      pending++;
      cacheRemoteImage(c.id, c.image).then(function (dataUrl) {
        if (dataUrl) refreshImageViews();
      });
    }
  });
  if (!silent && pending > 0) toast("داگرتن...", pending + " وێنە لە داگرتندا", "info");
  else if (!silent && pending === 0) toast("ئامادە", "هەموو وێنەکان پێشتر پاشکەوت کراون", "info");
}

function cacheAllImagesManual() {
  warmImageCache(false);
}

function normalizeFaIcon(icon) {
  var s = String(icon || "fa-tag").trim();
  if (!s) s = "fa-tag";
  s = s.replace(/^fa[srlb]?\s+/i, "");
  if (s.indexOf("fa-") !== 0) s = "fa-" + s.replace(/^fa-?/, "");
  return s;
}

function hasUserImage(image) {
  if (image == null) return false;
  var s = String(image).trim();
  return !!(s && s !== "undefined" && s !== "null");
}

function buildCategoryMediaHtml(c, sizeClass) {
  c = c || {};
  var color = c.color || "#6366f1";
  var cls = "lux-media-tile " + (sizeClass || "lux-media-tile-md");
  if (hasUserImage(c.image)) {
    var src = getImageSrc(c.id, c.image);
    return '<span class="' + cls + '"><img class="lux-fill-img" src="' + src + '" alt="" onerror="handleImageError(this,\'' + (c.id || "") + '\')"></span>';
  }
  return '<span class="' + cls + ' lux-media-tile-icon" style="background:linear-gradient(160deg,' + color + '66,' + color + '18);color:' + color + ';box-shadow:inset 0 0 0 1px ' + color + '55;"><i class="fas ' + normalizeFaIcon(c.icon) + '"></i></span>';
}

function getImageSrc(id, customImage) {
  initPlaceholders();
  var cached = id ? getCachedImage(id) : null;
  if (cached) return cached;
  if (customImage) {
    if (isDataImage(customImage) || customImage.startsWith('assets/') || customImage.startsWith('/assets/') || customImage.startsWith('./assets/')) {
      return customImage;
    }
    if (!navigator.onLine && customImage.startsWith('http')) {
      return PLACEHOLDER_IMAGES[id] || generatePlaceholderImage("product", "#6b7280", "📦");
    }
    return customImage;
  }
  return PLACEHOLDER_IMAGES[id] || generatePlaceholderImage("product", "#6b7280", "📦");
}

function applyImageFallback(img, id) {
  initPlaceholders();
  img.onerror = null;
  img.classList.add("lux-fill-img");
  img.src = PLACEHOLDER_IMAGES[id] || generatePlaceholderImage("product", "#6b7280", "📦");
  img.style.objectFit = "cover";
  img.style.objectPosition = "center";
  img.style.width = "100%";
  img.style.height = "100%";
}

function handleImageError(img, id) {
  if (!img) return;
  var cached = id ? getCachedImage(id) : null;
  if (cached && img.src !== cached) {
    img.onerror = function () { applyImageFallback(img, id); };
    img.src = cached;
    return;
  }
  applyImageFallback(img, id);
}

function buildImageHtml(id, name, customImage) {
  var cached = id ? getCachedImage(id) : null;
  if (!hasUserImage(customImage) && !cached) {
    return '<span class="lux-media-fallback" aria-hidden="true"><i class="fas fa-box-open"></i></span>';
  }
  var src = getImageSrc(id, customImage);
  return '<img class="lux-fill-img" src="' + src + '" alt="' + escapeAttr(name) + '" onerror="handleImageError(this,\'' + id + '\')">';
}

function initPlaceholders() {
  if (Object.keys(PLACEHOLDER_IMAGES).length > 0) return;
  PLACEHOLDER_IMAGES = {
    cat_dairy: generatePlaceholderImage("دairy", "#6366f1", "🧀"),
    cat_bread: generatePlaceholderImage("bread", "#f59e0b", "🍞"),
    cat_drinks: generatePlaceholderImage("drinks", "#3b82f6", "🥤"),
    cat_snacks: generatePlaceholderImage("snacks", "#ec4899", "🍪"),
    cat_coffee: generatePlaceholderImage("coffee", "#78716c", "☕"),
    cat_meat: generatePlaceholderImage("meat", "#ef4444", "🍗"),
    cat_household: generatePlaceholderImage("household", "#10b981", "🧴"),
    cat_personal: generatePlaceholderImage("personal", "#8b5cf6", "🧼"),
    p1: generatePlaceholderImage("milk", "#6366f1", "🥛"),
    p2: generatePlaceholderImage("bread", "#f59e0b", "🍞"),
    p3: generatePlaceholderImage("water", "#3b82f6", "💧"),
    p4: generatePlaceholderImage("cola", "#3b82f6", "🥤"),
    p5: generatePlaceholderImage("cheese", "#6366f1", "🧀"),
    p6: generatePlaceholderImage("coffee", "#78716c", "☕"),
    p7: generatePlaceholderImage("chips", "#ec4899", "🍟"),
    p8: generatePlaceholderImage("chicken", "#ef4444", "🍗"),
    p9: generatePlaceholderImage("soap", "#8b5cf6", "🧼"),
    p10: generatePlaceholderImage("juice", "#f59e0b", "🧃")
  };
}

/* ═══ SEED DATA ═══ */

function seedCategories() {
  if (!(window.isPosDemoMode && window.isPosDemoMode())) return;
  if (DB.categories && DB.categories.some(function (c) { return c && c.id && c.id !== "all"; })) return;
  DB.categories = [
    { id: "all", name: "هەموو", icon: "fa-th-large", color: "#6366f1", image: "", sortOrder: 0 },
    { id: "cat_drinks", name: "خواردنەوە و شەربەت", icon: "fa-glass-water", color: "#0284c7", image: "assets/images/categories/drinks.svg", sortOrder: 1 },
    { id: "cat_dairy", name: "شیرەمەنی و پەنیر", icon: "fa-cheese", color: "#059669", image: "assets/images/categories/dairy.svg", sortOrder: 2 },
    { id: "cat_snacks", name: "شیرینی، چپس و پسکیت", icon: "fa-cookie", color: "#ea580c", image: "assets/images/categories/snacks.svg", sortOrder: 3 },
    { id: "cat_pantry", name: "خۆراکی وشکە و زەیت", icon: "fa-wheat-awn", color: "#b45309", image: "assets/images/categories/pantry.svg", sortOrder: 4 },
    { id: "cat_household", name: "ماددەی پاککەرەوە", icon: "fa-soap", color: "#16a34a", image: "assets/images/categories/household.svg", sortOrder: 5 },
    { id: "cat_personal", name: "تەندروستی و پاکوخاوێنی", icon: "fa-pump-soap", color: "#db2777", image: "assets/images/categories/personal.svg", sortOrder: 6 },
    { id: "cat_bread", name: "نان و هەویرەمەنی", icon: "fa-bread-slice", color: "#d97706", image: "assets/images/categories/bread.svg", sortOrder: 7 },
    { id: "cat_fruits", name: "میوە و سەوزە (تەرازوو)", icon: "fa-apple-whole", color: "#10b981", image: "assets/images/categories/fruits.svg", sortOrder: 8 },
    { id: "cat_meat", name: "گۆشت و مریشکی تازە", icon: "fa-drumstick-bite", color: "#dc2626", image: "assets/images/categories/meat.svg", sortOrder: 9 },
    { id: "cat_coffee", name: "قاوە و چا", icon: "fa-mug-hot", color: "#78350f", image: "assets/images/categories/coffee.svg", sortOrder: 10 }
  ];
  DataStore.saveCategories();
}

function seedData() {
  if (!(window.isPosDemoMode && window.isPosDemoMode())) return;
  if (DB.products && DB.products.length) return;
  DB.products = [
    { id: "p_pepsi", name: "پێپسی قتوو 330ml", cat: "cat_drinks", price: 500, cost: 400, stock: 150, minAlert: 24, barcode: "4820000000018", image: "assets/images/products/pepsi.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_cola", name: "کۆکاکۆلا شووشە 250ml", cat: "cat_drinks", price: 500, cost: 380, stock: 120, minAlert: 24, barcode: "5449000000996", image: "assets/images/products/cocacola.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_masafi", name: "ئاوی ماسافی 500ml", cat: "cat_drinks", price: 250, cost: 140, stock: 350, minAlert: 50, barcode: "6291003001015", image: "assets/images/products/masafi.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_rani", name: "شەربەتی ڕانی پڕتەقاڵ 240ml", cat: "cat_drinks", price: 500, cost: 375, stock: 90, minAlert: 20, barcode: "6281033100125", image: "assets/images/products/rani.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_redbull", name: "ڕێدبوڵ وزەبەخش 250ml", cat: "cat_drinks", price: 2500, cost: 1950, stock: 65, minAlert: 12, barcode: "9002490100070", image: "assets/images/products/redbull.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_milk", name: "شیری تازەی کالی 1L", cat: "cat_dairy", price: 1500, cost: 1200, stock: 85, minAlert: 15, barcode: "6260100201013", image: "assets/images/products/kalleh_milk.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_labneh", name: "لەبنەی پیناری تورکی 400g", cat: "cat_dairy", price: 3500, cost: 2750, stock: 45, minAlert: 10, barcode: "8690555001234", image: "assets/images/products/pinar_labneh.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_almarai", name: "پەنیری سێگۆشەی المراعي (8د)", cat: "cat_dairy", price: 1500, cost: 1100, stock: 110, minAlert: 20, barcode: "6281007123456", image: "assets/images/products/almarai_cheese.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_puck", name: "پەنیری شووشەی بووک 500g", cat: "cat_dairy", price: 4500, cost: 3600, stock: 55, minAlert: 12, barcode: "5760466712345", image: "assets/images/products/puck_cheese.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_lays", name: "چپسی لەیز بە خوێ 170g", cat: "cat_snacks", price: 1500, cost: 1150, stock: 95, minAlert: 20, barcode: "028400010012", image: "assets/images/products/lays_chips.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_doritos", name: "چپسی دوریتۆس پەنیری 175g", cat: "cat_snacks", price: 1500, cost: 1150, stock: 80, minAlert: 15, barcode: "028400020011", image: "assets/images/products/doritos.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_nutella", name: "نۆتێلا شوکولاتە 350g", cat: "cat_snacks", price: 5000, cost: 4100, stock: 40, minAlert: 8, barcode: "8000500123456", image: "assets/images/products/nutella.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_kitkat", name: "شوکۆلاتەی کیت کات ٤ پەنجە", cat: "cat_snacks", price: 750, cost: 550, stock: 140, minAlert: 30, barcode: "7613035123456", image: "assets/images/products/kitkat.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_rice", name: "برنجی مەحمود ٥ کیلۆ", cat: "cat_pantry", price: 14000, cost: 11800, stock: 50, minAlert: 10, barcode: "8690123456789", image: "assets/images/products/mahmood_rice.svg", unit: "bag", isScaleItem: 0 },
    { id: "p_oil", name: "زەیتی ئاڵتونسا 1L", cat: "cat_pantry", price: 2500, cost: 1950, stock: 90, minAlert: 15, barcode: "8697424123456", image: "assets/images/products/altunsa_oil.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_paste", name: "دۆشاوی تەماتەی زێر 800g", cat: "cat_pantry", price: 2000, cost: 1550, stock: 75, minAlert: 15, barcode: "8691234567890", image: "assets/images/products/zer_paste.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_fairy", name: "زاهی فێری لیمۆ 800ml", cat: "cat_household", price: 2500, cost: 1900, stock: 70, minAlert: 12, barcode: "5410076123456", image: "assets/images/products/fairy.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_tide", name: "تایدی جلشۆردن ۲.٥ کیلۆ", cat: "cat_household", price: 7500, cost: 6000, stock: 45, minAlert: 8, barcode: "5410076987654", image: "assets/images/products/tide.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_shampoo", name: "شامپۆی هێد ئەند شۆڵدەرز 400ml", cat: "cat_personal", price: 4500, cost: 3500, stock: 50, minAlert: 10, barcode: "5011321123456", image: "assets/images/products/head_shoulders.svg", unit: "piece", isScaleItem: 0 },
    { id: "p_samun", name: "سەموونی عێراقی (٨ دانە)", cat: "cat_bread", price: 1000, cost: 750, stock: 120, minAlert: 20, barcode: "2002000000018", image: "assets/images/products/samun.svg", unit: "pack", isScaleItem: 0 },
    { id: "p_apple", name: "سێوی لوبنانی پلە یەک", cat: "cat_fruits", price: 1750, cost: 1300, stock: 80, minAlert: 15, barcode: "20001", image: "assets/images/products/apples.svg", unit: "kg", isScaleItem: 1, scaleCode: "0001" },
    { id: "p_banana", name: "مۆزی تازە (تەرازوو)", cat: "cat_fruits", price: 1500, cost: 1100, stock: 90, minAlert: 20, barcode: "20002", image: "assets/images/products/bananas.svg", unit: "kg", isScaleItem: 1, scaleCode: "0002" },
    { id: "p_meat", name: "گۆشتی بەرخی تازە (تەرازوو)", cat: "cat_meat", price: 22000, cost: 18500, stock: 35, minAlert: 8, barcode: "20003", image: "assets/images/products/meat.svg", unit: "kg", isScaleItem: 1, scaleCode: "0003" },
    { id: "p_tea", name: "چای ئەلۆکۆزەی سەفەری (100 کیس)", cat: "cat_coffee", price: 4000, cost: 3100, stock: 60, minAlert: 10, barcode: "6291100123456", image: "assets/images/products/tea.svg", unit: "box", isScaleItem: 0 }
  ];
  DataStore.saveProducts();
}


/* ═══ EVENTS ═══ */

function setupEvents() {
  enhancePasswordFields();
  var signInBtn = $("#signInBtn");
  if (signInBtn) {
    signInBtn.disabled = false;
    signInBtn.removeAttribute("disabled");
  }
  var resetMgrBtn = $("#resetManagerBtn");
  if (resetMgrBtn) resetMgrBtn.addEventListener("click", resetManagerLogin);
  var loginPass = $("#loginPass"); if (loginPass) loginPass.addEventListener("keydown", function (e) { if (e.key === "Enter") doSignIn(); });
  var loginUser = $("#loginUsername") || $("#loginEmail");
  if (loginUser) loginUser.addEventListener("keydown", function (e) { if (e.key === "Enter") doSignIn(); });
  var logoutBtn = $("#logoutBtn"); if (logoutBtn) logoutBtn.addEventListener("click", logout);
  $$(".nav-item[data-page]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.dataset.page === "dashboard") window.CURRENT_FINANCE_TAB = "overview";
      switchSection(btn.dataset.page);
    });
  });
  $$(".toolbar-btn[data-page]").forEach(function (btn) { btn.addEventListener("click", function () { switchSection(btn.dataset.page); }); });
  var posLogoutBtn = $("#posLogoutBtn"); if (posLogoutBtn) posLogoutBtn.addEventListener("click", logout);
  var posBarcodeBtn = $("#posBarcodeBtn"); if (posBarcodeBtn) posBarcodeBtn.addEventListener("click", function () { switchSection("barcode"); });
  var hdrBarcodeBtn = $("#headerBarcodeBtn"); if (hdrBarcodeBtn) hdrBarcodeBtn.addEventListener("click", focusBarcodeSearch);

  var menuToggle = $("#menuToggleBtn"); var sidebar = $("#sidebar"); var overlay = $("#sidebarOverlay");
  if (menuToggle && sidebar) { menuToggle.addEventListener("click", function () { sidebar.classList.toggle("open"); if (overlay) overlay.classList.toggle("active"); }); }
  if (overlay) { overlay.addEventListener("click", function () { sidebar.classList.remove("open"); overlay.classList.remove("active"); document.body.classList.remove("pos-sidebar-open"); }); }

  var calcToggle = $("#calcToggleBtn"); var calcBody = $("#calcBody");
  if (calcToggle && calcBody) { calcToggle.addEventListener("click", function () { calcBody.classList.toggle("show"); }); }

  var discountInput = $("#discountInput"); if (discountInput) discountInput.addEventListener("input", renderCart);
  var clearCartBtn = $("#clearCartBtn"); if (clearCartBtn) clearCartBtn.addEventListener("click", clearCurrentCart);
  var checkoutBtn = $("#checkoutBtn"); if (checkoutBtn) checkoutBtn.addEventListener("click", checkout);
  var confirmPrintBtn = $("#confirmPrintBtn"); if (confirmPrintBtn) confirmPrintBtn.addEventListener("click", function () { confirmPrint(true); });
  var confirmNoPrintBtn = $("#confirmNoPrintBtn"); if (confirmNoPrintBtn) confirmNoPrintBtn.addEventListener("click", function () { confirmPrint(false); });
  var cancelPrintBtn = $("#cancelPrintBtn"); if (cancelPrintBtn) cancelPrintBtn.addEventListener("click", cancelPrint);
  var debtPrintBtn = $("#debtPrintBtn"); if (debtPrintBtn) debtPrintBtn.addEventListener("click", openDebtCustomerModal);
  var closePrintConfirmBtn = $("#closePrintConfirmBtn"); if (closePrintConfirmBtn) closePrintConfirmBtn.addEventListener("click", function () { hideModal("printConfirmModal"); restorePendingCheckoutCart(); renderCart(); });
  var printReceiptBtn = $("#printReceiptBtn"); if (printReceiptBtn) printReceiptBtn.addEventListener("click", function () {
    var order = LAST_ORDER || DB.orders[DB.orders.length - 1];
    if (order) {
      printReceiptDirect(order);
      hideModal("receiptModal");
    } else {
      toast("هەڵە", "هیچ پسوڵەیەک نییە بۆ چاپکردن", "error");
    }
  });
  var closeReceiptBtn = $("#closeReceiptBtn"); if (closeReceiptBtn) closeReceiptBtn.addEventListener("click", function () { hideModal("receiptModal"); });

  var closeDebtCustomerBtn = $("#closeDebtCustomerBtn"); if (closeDebtCustomerBtn) closeDebtCustomerBtn.addEventListener("click", function () { hideModal("debtCustomerModal"); PENDING_DEBT = null; });
  var cancelDebtCustomerBtn = $("#cancelDebtCustomerBtn"); if (cancelDebtCustomerBtn) cancelDebtCustomerBtn.addEventListener("click", function () { hideModal("debtCustomerModal"); PENDING_DEBT = null; });
  var saveDebtBtn = $("#saveDebtBtn"); if (saveDebtBtn) saveDebtBtn.addEventListener("click", saveDebt);
  var debtCustomerName = $("#debtCustomerName");
  if (debtCustomerName) {
    debtCustomerName.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        saveDebt();
      }
    });
    debtCustomerName.addEventListener("input", refreshDebtLimitHint);
    debtCustomerName.addEventListener("change", refreshDebtLimitHint);
    debtCustomerName.addEventListener("blur", refreshDebtLimitHint);
  }
  var debtCustomerPhone = $("#debtCustomerPhone");
  if (debtCustomerPhone) {
    debtCustomerPhone.addEventListener("input", refreshDebtLimitHint);
    debtCustomerPhone.addEventListener("change", refreshDebtLimitHint);
  }

  $$(".modal-close").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var modal = btn.closest(".modal-overlay");
      if (modal) {
        modal.classList.remove("active");
        if (modal.id === "cashHandoverModal") {
          var board = $("#pageHandoverWrapper");
          var tabPane = $("#shiftsTabHandover");
          if (board && tabPane && board.parentElement !== tabPane) {
            tabPane.appendChild(board);
          }
        }
      }
    });
  });

  var closeQrModal = $("#closeQrModal"); if (closeQrModal) closeQrModal.addEventListener("click", function () { if (typeof Html5Qrcode !== "undefined" && html5QrcodeScanner) { try { html5QrcodeScanner.stop(); } catch (e) {} } hideModal("qrModal"); });
  var cancelQrModal = $("#cancelQrModal"); if (cancelQrModal) cancelQrModal.addEventListener("click", function () { if (typeof Html5Qrcode !== "undefined" && html5QrcodeScanner) { try { html5QrcodeScanner.stop(); } catch (e) {} } hideModal("qrModal"); });

  var manualLookupBtn = $("#manualLookupBtn");
  if (manualLookupBtn) manualLookupBtn.addEventListener("click", function () { var code = $("#manualBarcodeInput").value.trim(); if (code) processBarcode(code); });
  var manualBarcodeInput = $("#manualBarcodeInput");
  if (manualBarcodeInput) {
    manualBarcodeInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { processBarcode(this.value.trim()); this.value = ""; } });
  }

  var confirmDeleteBtn = $("#confirmDeleteBtn");
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener("click", function () { if (DELETE_CALLBACK) DELETE_CALLBACK(); DELETE_CALLBACK = null; hideModal("deleteModal"); });
  var cancelDeleteBtn = $("#cancelDeleteBtn"); if (cancelDeleteBtn) cancelDeleteBtn.addEventListener("click", function () { DELETE_CALLBACK = null; hideModal("deleteModal"); });
  var closeDeleteModalBtn = $("#closeDeleteModalBtn"); if (closeDeleteModalBtn) closeDeleteModalBtn.addEventListener("click", function () { DELETE_CALLBACK = null; hideModal("deleteModal"); });

  var addProductBtn = $("#addProductBtn"); if (addProductBtn) addProductBtn.addEventListener("click", function () { openProductModal(); });
  setupModalEnterToNext("productModal");
  setupModalEnterToNext("quickProductModal");
  setupModalEnterToNext("categoryModal");
  setupModalEnterToNext("expenseModal");
  setupProductFormBarcodeScan();
  var saveProductBtn = $("#saveProductBtn"); if (saveProductBtn) saveProductBtn.addEventListener("click", saveProduct);
  var cancelProductBtn = $("#cancelProductBtn"); if (cancelProductBtn) cancelProductBtn.addEventListener("click", function () { hideModal("productModal"); });
  var closeProductModalBtn = $("#closeProductModalBtn"); if (closeProductModalBtn) closeProductModalBtn.addEventListener("click", function () { hideModal("productModal"); });
  var productSearch = $("#productSearch"); if (productSearch) productSearch.addEventListener("input", function (e) {
    var value = e.target.value.trim();
    if (/^\d+$/.test(value) && value.length >= 8) {
      toast("ئاگاداری", "تۆ بارکۆد دەنووسیت، تکایە بەکارهێنەری ناوەڕۆکی بارکۆد بکە", "warning");
    }
    filterProducts();
  });
  var productCatFilter = $("#productCatFilter"); if (productCatFilter) productCatFilter.addEventListener("change", filterProducts);

  var pCostInput = $("#pCost"); if (pCostInput) pCostInput.addEventListener("input", updateProductProfitPreview);
  var pPriceInput = $("#pPrice"); if (pPriceInput) pPriceInput.addEventListener("input", updateProductProfitPreview);
  var pBarcode = $("#pBarcode"); if (pBarcode) pBarcode.addEventListener("input", function (e) {
    var value = e.target.value.trim();
    if (value.length > 0 && !/^\d+$/.test(value)) {
      toast("ئاگاداری", "بارکۆد دەبێت تەنها ژمارە بێت", "warning");
    }
  });

  var addUserBtn = $("#addUserBtn"); if (addUserBtn) addUserBtn.addEventListener("click", function () { openUserModal(null, "cashier"); });
  var addCashierUserBtn = $("#addCashierUserBtn"); if (addCashierUserBtn) addCashierUserBtn.addEventListener("click", function () { openUserModal(null, "cashier"); });
  var addAdminUserBtn = $("#addAdminUserBtn"); if (addAdminUserBtn) addAdminUserBtn.addEventListener("click", function () { openUserModal(null, "admin"); });
  var saveUserBtn = $("#saveUserBtn"); if (saveUserBtn) saveUserBtn.addEventListener("click", saveUser);
  var cancelUserBtn = $("#cancelUserBtn"); if (cancelUserBtn) cancelUserBtn.addEventListener("click", function () { hideModal("userModal"); });
  var closeUserModalBtn = $("#closeUserModalBtn"); if (closeUserModalBtn) closeUserModalBtn.addEventListener("click", function () { hideModal("userModal"); });

  var holdSaleBtn = $("#holdSaleBtn"); if (holdSaleBtn) holdSaleBtn.addEventListener("click", holdSale);
  var resumeSaleBtn = $("#resumeSaleBtn"); if (resumeSaleBtn) resumeSaleBtn.addEventListener("click", function () { renderSuspendedSales(); showModal("suspendedSalesModal"); });
  var closeSuspendedSalesBtn = $("#closeSuspendedSalesBtn"); if (closeSuspendedSalesBtn) closeSuspendedSalesBtn.addEventListener("click", function () { hideModal("suspendedSalesModal"); });
  var closePosBtn = $("#closePosBtn"); if (closePosBtn) closePosBtn.addEventListener("click", function () { switchSection("dashboard"); });
  var toggleFullscreenBtn = $("#toggleFullscreenBtn"); if (toggleFullscreenBtn) toggleFullscreenBtn.addEventListener("click", togglePosFullscreen);
  var togglePosViewBtn = $("#togglePosViewBtn"); if (togglePosViewBtn) togglePosViewBtn.addEventListener("click", togglePosFullscreen);

  var saveCategoryBtn = $("#saveCategoryBtn"); if (saveCategoryBtn) saveCategoryBtn.addEventListener("click", saveCategory);
  var cancelCategoryBtn = $("#cancelCategoryBtn"); if (cancelCategoryBtn) cancelCategoryBtn.addEventListener("click", function () { hideModal("categoryModal"); });
  var closeCategoryModalBtn = $("#closeCategoryModalBtn"); if (closeCategoryModalBtn) closeCategoryModalBtn.addEventListener("click", function () { hideModal("categoryModal"); });
  var catName = $("#catName"); if (catName) catName.addEventListener("input", updateCatPreview);
  var catIcon = $("#catIcon"); if (catIcon) catIcon.addEventListener("input", updateCatPreview);
  var catColor = $("#catColor"); if (catColor) catColor.addEventListener("input", updateCatPreview);
  var catImage = $("#catImage"); if (catImage) catImage.addEventListener("input", updateCatPreview);
  var catImageFile = $("#catImageFile"); if (catImageFile) catImageFile.addEventListener("change", updateCatPreview);
  var pImage = $("#pImage"); if (pImage) pImage.addEventListener("input", updateProductImagePreview);
  var pImageFile = $("#pImageFile"); if (pImageFile) pImageFile.addEventListener("change", updateProductImagePreview);

  var inventorySearch = $("#inventorySearch"); if (inventorySearch) inventorySearch.addEventListener("input", function (e) {
    var value = e.target.value.trim();
    if (/^\d+$/.test(value) && value.length >= 8) {
      toast("ئاگاداری", "تۆ بارکۆد دەنووسیت، تکایە بەکارهێنەری ناوەڕۆکی بارکۆد بکە", "warning");
    }
    filterInventory();
  });
  var confirmWeightBtn = $("#confirmWeightBtn"); if (confirmWeightBtn) confirmWeightBtn.addEventListener("click", confirmWeightedProduct);
  var previewPrintBtn = $("#previewPrintBtn"); if (previewPrintBtn) previewPrintBtn.addEventListener("click", showPrintPreview);
  var closePrintPreviewBtn = $("#closePrintPreviewBtn"); if (closePrintPreviewBtn) closePrintPreviewBtn.addEventListener("click", function () { hideModal("printPreviewModal"); });
  var printFromPreviewBtn = $("#printFromPreviewBtn"); if (printFromPreviewBtn) printFromPreviewBtn.addEventListener("click", function () { hideModal("printPreviewModal"); printReceiptDirect(LAST_ORDER); });
  var saveSettingsBtn = $("#saveSettingsBtn"); if (saveSettingsBtn) saveSettingsBtn.addEventListener("click", saveSettings);
  var backupBtn = $("#backupBtn"); if (backupBtn) backupBtn.addEventListener("click", exportBackup);
  var cacheImagesBtn = $("#cacheImagesBtn"); if (cacheImagesBtn) cacheImagesBtn.addEventListener("click", cacheAllImagesManual);
  var restoreBtn = $("#restoreBtn"); if (restoreBtn) restoreBtn.addEventListener("click", restoreBackup);
  var exportBtn = $("#exportBtn"); if (exportBtn) exportBtn.addEventListener("click", exportData);
  var importBtn = $("#importBtn"); if (importBtn) importBtn.addEventListener("click", importData);
  var clearDataBtn = $("#clearDataBtn"); if (clearDataBtn) clearDataBtn.addEventListener("click", clearAllData);
  var stockAlertBtn = $("#stockAlertBtn"); if (stockAlertBtn) stockAlertBtn.addEventListener("click", function (e) { e.stopPropagation(); switchSection("inventory"); });
  var exportReportBtn = $("#exportReportBtn"); if (exportReportBtn) exportReportBtn.addEventListener("click", exportBackup);
  var posSearch = $("#posSearch"); if (posSearch) posSearch.addEventListener("input", function (e) {
    var value = e.target.value.trim();
    if (/^\d+$/.test(value) && value.length >= 8) {
      toast("ئاگاداری", "تۆ بارکۆد دەنووسیت، تکایە بەکارهێنەری ناوەڕۆکی بارکۆد بکە", "warning");
    }
    renderPosGrid();
  });

  var openShiftBtn = $("#openShiftBtn"); if (openShiftBtn) openShiftBtn.addEventListener("click", openShiftModal);
  var closeShiftBtn = $("#closeShiftBtn"); if (closeShiftBtn) closeShiftBtn.addEventListener("click", closeShiftModal);
  var confirmOpenShiftBtn = $("#confirmOpenShiftBtn"); if (confirmOpenShiftBtn) confirmOpenShiftBtn.addEventListener("click", confirmOpenShift);
  var cancelOpenShiftBtn = $("#cancelOpenShiftBtn"); if (cancelOpenShiftBtn) cancelOpenShiftBtn.addEventListener("click", function () { hideModal("openShiftModal"); });
  var closeOpenShiftBtn = $("#closeOpenShiftBtn"); if (closeOpenShiftBtn) closeOpenShiftBtn.addEventListener("click", function () { hideModal("openShiftModal"); });
  var confirmCloseShiftBtn = $("#confirmCloseShiftBtn"); if (confirmCloseShiftBtn) confirmCloseShiftBtn.addEventListener("click", confirmCloseShift);
  var cancelCloseShiftBtn = $("#cancelCloseShiftBtn"); if (cancelCloseShiftBtn) cancelCloseShiftBtn.addEventListener("click", function () { hideModal("closeShiftModal"); });
  var closeCloseShiftBtn = $("#closeCloseShiftBtn"); if (closeCloseShiftBtn) closeCloseShiftBtn.addEventListener("click", function () { hideModal("closeShiftModal"); });

  var cancelExpenseBtn = $("#cancelExpenseBtn"); if (cancelExpenseBtn) cancelExpenseBtn.addEventListener("click", function () { hideModal("expenseModal"); });
  var closeExpenseBtn = $("#closeExpenseBtn"); if (closeExpenseBtn) closeExpenseBtn.addEventListener("click", function () { hideModal("expenseModal"); });

  var holdSaleBtn = $("#holdSaleBtn"); if (holdSaleBtn) holdSaleBtn.addEventListener("click", holdSale);

  var manualPrintBtn = $("#manualPrintBtn"); if (manualPrintBtn) manualPrintBtn.addEventListener("click", function () {
    if (LAST_ORDER) {
      printReceiptDirect(LAST_ORDER);
    } else {
      toast("هەڵە", "هیچ پسوڵەیەک نییە بۆ چاپکردن", "error");
    }
  });

  var stockInBtn = $("#stockInBtn"); if (stockInBtn) stockInBtn.addEventListener("click", function () { openStockModal("in"); });
  var stockOutBtn = $("#stockOutBtn"); if (stockOutBtn) stockOutBtn.addEventListener("click", function () { openStockModal("out"); });
  var stockAdjustBtn = $("#stockAdjustBtn"); if (stockAdjustBtn) stockAdjustBtn.addEventListener("click", function () { openStockModal("adjust"); });
  var saveStockBtn = $("#saveStockBtn"); if (saveStockBtn) saveStockBtn.addEventListener("click", saveStockOperation);
  var cancelStockBtn = $("#cancelStockBtn"); if (cancelStockBtn) cancelStockBtn.addEventListener("click", function () { hideModal("stockModal"); });
  var closeStockModalBtn = $("#closeStockModalBtn"); if (closeStockModalBtn) closeStockModalBtn.addEventListener("click", function () { hideModal("stockModal"); });

  var openBarcodeStudioBtn = $("#openBarcodeStudioBtn"); if (openBarcodeStudioBtn) openBarcodeStudioBtn.addEventListener("click", function () { openBarcodeLabelModal(); });
  var inventoryBarcodeBtn = $("#inventoryBarcodeBtn"); if (inventoryBarcodeBtn) inventoryBarcodeBtn.addEventListener("click", function () { openBarcodeLabelModal(); });
  var posBarcodeBtn = $("#posBarcodeBtn"); if (posBarcodeBtn) posBarcodeBtn.addEventListener("click", function () { openBarcodeLabelModal(); });

  var barcodeProductSelect = $("#barcodeProductSelect");
  if (barcodeProductSelect) barcodeProductSelect.addEventListener("change", function () {
    updateBarcodeStockHint();
    generateBarcodePreview();
  });

  var barcodeCategorySelect = $("#barcodeCategorySelect");
  if (barcodeCategorySelect) barcodeCategorySelect.addEventListener("change", function () {
    updateBarcodeStockHint();
    generateBarcodePreview();
  });

  var barcodeSearchFilter = $("#barcodeSearchFilter");
  if (barcodeSearchFilter) {
    barcodeSearchFilter.addEventListener("input", filterBarcodeProductsList);
    barcodeSearchFilter.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== "Tab") return;
      var q = String(this.value || "").trim();
      if (!q) return;
      e.preventDefault();
      var hit = (typeof findProductByScannedCodeFresh === "function")
        ? findProductByScannedCodeFresh(q)
        : (typeof findProductByScannedCode === "function" ? findProductByScannedCode(q) : null);
      if (hit && typeof selectBarcodeStudioSavedProduct === "function") {
        selectBarcodeStudioSavedProduct(hit, q);
      } else {
        filterBarcodeProductsList();
      }
    });
  }

  var barcodeThermalSizeSelect = $("#barcodeThermalSizeSelect");
  if (barcodeThermalSizeSelect) barcodeThermalSizeSelect.addEventListener("change", function () {
    var badge = $("#barcodePreviewSizeBadge");
    if (badge && BARCODE_STUDIO_STATE.template === 'thermal') {
      badge.textContent = this.value.replace('x', 'mm × ') + 'mm (Xprinter)';
    }
    generateBarcodePreview();
  });

  var barcodeScaleWeightInput = $("#barcodeScaleWeightInput");
  if (barcodeScaleWeightInput) barcodeScaleWeightInput.addEventListener("input", generateBarcodePreview);

  var labelCount = $("#labelCount");
  if (labelCount) labelCount.addEventListener("input", generateBarcodePreview);

  var printBarcodeBtn = $("#printBarcodeBtn");
  if (printBarcodeBtn) printBarcodeBtn.addEventListener("click", function () { printBarcodeLabels(false); });

  var quickTestLabelBtn = $("#quickTestLabelBtn");
  if (quickTestLabelBtn) quickTestLabelBtn.addEventListener("click", function () { printBarcodeLabels(true); });

  var cancelBarcodeLabelBtn = $("#cancelBarcodeLabelBtn");
  if (cancelBarcodeLabelBtn) cancelBarcodeLabelBtn.addEventListener("click", function () { hideModal("barcodeLabelModal"); });

  var closeBarcodeLabelBtn = $("#closeBarcodeLabelBtn");
  if (closeBarcodeLabelBtn) closeBarcodeLabelBtn.addEventListener("click", function () { hideModal("barcodeLabelModal"); });

  var barcodeScopeCreateBtn = $("#barcodeScopeCreateBtn");
  if (barcodeScopeCreateBtn) barcodeScopeCreateBtn.addEventListener("click", function () { updateBarcodeScopeUI('create'); });

  var barcodeScopeSingleBtn = $("#barcodeScopeSingleBtn");
  if (barcodeScopeSingleBtn) barcodeScopeSingleBtn.addEventListener("click", function () { updateBarcodeScopeUI('single'); });

  var barcodeScopeCategoryBtn = $("#barcodeScopeCategoryBtn");
  if (barcodeScopeCategoryBtn) barcodeScopeCategoryBtn.addEventListener("click", function () { updateBarcodeScopeUI('category'); });

  var barcodeScopeAllBtn = $("#barcodeScopeAllBtn");
  if (barcodeScopeAllBtn) barcodeScopeAllBtn.addEventListener("click", function () { updateBarcodeScopeUI('all'); });

  var newBcGenerateBtn = $("#newBcGenerateBtn");
  if (newBcGenerateBtn) newBcGenerateBtn.addEventListener("click", fillNewBarcodeNumber);

  var newBcSaveBtn = $("#newBcSaveBtn");
  if (newBcSaveBtn) newBcSaveBtn.addEventListener("click", function () { saveCreatedBarcodeProduct(); });

  var newBcImageFile = $("#newBcImageFile");
  if (newBcImageFile) {
    newBcImageFile.addEventListener("change", function () {
      previewNewBarcodeImage(this.files && this.files[0] ? this.files[0] : null);
    });
  }

  var bcPreviewTypeTimer = null;
  function scheduleBarcodeStudioPreview() {
    if (bcPreviewTypeTimer) clearTimeout(bcPreviewTypeTimer);
    bcPreviewTypeTimer = setTimeout(function () {
      bcPreviewTypeTimer = null;
      generateBarcodePreview();
      updateBarcodeStockHint();
    }, 220);
  }
  ["newBcName", "newBcNumber", "newBcPrice", "newBcCost", "newBcStock", "newBcCategory"].forEach(function (id) {
    var el = $("#" + id);
    if (!el) return;
    el.addEventListener("input", scheduleBarcodeStudioPreview);
    el.addEventListener("change", function () {
      if (bcPreviewTypeTimer) {
        clearTimeout(bcPreviewTypeTimer);
        bcPreviewTypeTimer = null;
      }
      generateBarcodePreview();
      updateBarcodeStockHint();
    });
  });
  setupBarcodeStudioScanLink();

  $$(".barcode-template-card").forEach(function (card) {
    card.addEventListener("click", function () {
      setBarcodeTemplate(this.dataset.template);
    });
  });
  if (window.BarcodeDesigner) BarcodeDesigner.boot();

  ["lblOptProductName", "lblOptStoreName", "lblOptPriceIQD", "lblOptPriceUSD", "lblOptBarcodeDigits", "lblOptExpiry"].forEach(function (id) {
    var el = $("#" + id);
    if (el) el.addEventListener("change", generateBarcodePreview);
  });

  var btnCount1 = $("#btnCount1"); if (btnCount1) btnCount1.addEventListener("click", function () { setLabelCount(1); generateBarcodePreview(); });
  var btnCount5 = $("#btnCount5"); if (btnCount5) btnCount5.addEventListener("click", function () { setLabelCount(5); generateBarcodePreview(); });
  var btnCount10 = $("#btnCount10"); if (btnCount10) btnCount10.addEventListener("click", function () { setLabelCount(10); generateBarcodePreview(); });
  var btnCount24 = $("#btnCount24"); if (btnCount24) btnCount24.addEventListener("click", function () { setLabelCount(24); generateBarcodePreview(); });
  var btnMatchStockCount = $("#btnMatchStockCount");
  if (btnMatchStockCount) {
    btnMatchStockCount.addEventListener("click", function () {
      var sel = $("#barcodeProductSelect");
      var p = sel ? DB.products.find(function (x) { return x.id === sel.value; }) : null;
      if (p) {
        setLabelCount(Math.max(1, p.stock || 1));
      } else {
        setLabelCount(1);
      }
      generateBarcodePreview();
    });
  }

  var returnOrderSearch = $("#returnOrderSearch");
  if (returnOrderSearch) {
    returnOrderSearch.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var val = (this.value || "").trim();
      e.preventDefault();
      if (typeof ReturnEngine !== "undefined" && ReturnEngine.handleReturnSearchEnter) {
        ReturnEngine.handleReturnSearchEnter(val);
      }
      this.value = "";
    });
  }
  var confirmReturnBtn = $("#confirmReturnBtn"); if (confirmReturnBtn) confirmReturnBtn.addEventListener("click", confirmReturnSale);
  var cancelReturnBtn = $("#cancelReturnBtn"); if (cancelReturnBtn) cancelReturnBtn.addEventListener("click", function () { hideModal("returnSaleModal"); });
  var closeReturnSaleBtn = $("#closeReturnSaleBtn"); if (closeReturnSaleBtn) closeReturnSaleBtn.addEventListener("click", function () { hideModal("returnSaleModal"); });

  var tabs = $$(".login-card .tab");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      var tabName = tab.dataset.tab;
      var signinTab = $("#signinTab"); var registerTab = $("#registerTab");
      if (signinTab && registerTab) {
        if (tabName === "signin") { signinTab.classList.add("active"); registerTab.classList.remove("active"); }
        else { registerTab.classList.add("active"); signinTab.classList.remove("active"); }
      }
    });
  });

  var registerBtn = $("#registerBtn");
  if (registerBtn) registerBtn.addEventListener("click", function () {
    toast("ئاگاداری", "تەنها بەڕێوەبەر دەتوانێت کاشیر زیاد بکات لە ڕێکخستنەکان", "warning");
  });

  var calcPaidInput = $("#calcPaidInput");
  if (calcPaidInput) {
    calcPaidInput.addEventListener("input", function () {
      var raw = this.value.replace(/[^0-9.]/g, "");
      if (raw !== this.value) this.value = raw;
      var paid = parseFloat(raw) || 0;
      var total = CART.reduce(function (s, c) { return s + c.price * c.qty; }, 0);
      var discIn = $("#discountInput");
      var discPct = parseFloat(discIn ? discIn.value : "0") || 0;
      var discAmt = Math.round((total * discPct) / 100);
      var totalAfterDisc = total - discAmt;
      var change = paid - totalAfterDisc;
      var resultEl = $("#calcResult");
      if (resultEl) {
        resultEl.classList.remove("calc-success", "calc-danger");
        if (change >= 0) { resultEl.textContent = "گەڕانەوە: " + fmt(change); resultEl.classList.add("calc-success"); }
        else { resultEl.textContent = "کەمبوونەوە: " + fmt(Math.abs(change)); resultEl.classList.add("calc-danger"); }
      }
    });
  }

  // Reports vs Expenses Add Expense Buttons
  var reportsAddExpenseBtn = $("#reportsAddExpenseBtn");
  if (reportsAddExpenseBtn) reportsAddExpenseBtn.addEventListener("click", openExpenseModal);

  // Customers Management Listeners
  var addCustomerBtn = $("#addCustomerBtn");
  if (addCustomerBtn) addCustomerBtn.addEventListener("click", function () {
    selectCustomerHubTab("list");
    openCustomerModal();
  });
  var saveCustomerBtn = $("#saveCustomerBtn");
  if (saveCustomerBtn) saveCustomerBtn.addEventListener("click", saveCustomer);
  var customerSearchInput = $("#customerSearchInput");
  if (customerSearchInput) {
    customerSearchInput.addEventListener("input", function () {
      CUSTOMER_SEARCH_QUERY = this.value.trim();
      renderCustomers();
    });
  }
  var customerFilterSelect = $("#customerFilterSelect");
  if (customerFilterSelect) {
    customerFilterSelect.addEventListener("change", function () {
      CUSTOMER_FILTER = this.value;
      renderCustomers();
    });
  }
  var exportCustomersBtn = $("#exportCustomersBtn");
  if (exportCustomersBtn) exportCustomersBtn.addEventListener("click", exportCustomers);

  // Orders Management Listeners
  var ordersSearchInput = $("#ordersSearchInput");
  if (ordersSearchInput) {
    ordersSearchInput.addEventListener("input", function () {
      ORDERS_SEARCH_QUERY = this.value.trim();
      renderOrders();
    });
    ordersSearchInput.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      var v = this.value.trim();
      ORDERS_SEARCH_QUERY = v;
      if (v && typeof fillOrdersSearchFromScan === "function" && (/^B?\d{1,5}$/i.test(v.replace(/\s/g, "")) || /^B\d{5}$/i.test(v))) {
        fillOrdersSearchFromScan(v);
        return;
      }
      renderOrders();
    });
  }
  var ordersPeriodFilter = $("#ordersPeriodFilter");
  if (ordersPeriodFilter) {
    ordersPeriodFilter.addEventListener("change", function () {
      ORDERS_PERIOD = this.value;
      if (ORDERS_PERIOD === "custom") {
        var today = localYmd(new Date());
        var fromEl = $("#ordersDateFrom");
        var toEl = $("#ordersDateTo");
        if (fromEl && !fromEl.value) fromEl.value = today;
        if (toEl && !toEl.value) toEl.value = today;
        ORDERS_DATE_FROM = fromEl ? fromEl.value : today;
        ORDERS_DATE_TO = toEl ? toEl.value : today;
      }
      renderOrders();
    });
  }
  var ordersDateFrom = $("#ordersDateFrom");
  if (ordersDateFrom) {
    ordersDateFrom.addEventListener("change", function () {
      ORDERS_DATE_FROM = this.value;
      ORDERS_PERIOD = "custom";
      var p = $("#ordersPeriodFilter");
      if (p) p.value = "custom";
      renderOrders();
    });
  }
  var ordersDateTo = $("#ordersDateTo");
  if (ordersDateTo) {
    ordersDateTo.addEventListener("change", function () {
      ORDERS_DATE_TO = this.value;
      ORDERS_PERIOD = "custom";
      var p = $("#ordersPeriodFilter");
      if (p) p.value = "custom";
      renderOrders();
    });
  }
  var ordersCashierFilter = $("#ordersCashierFilter");
  if (ordersCashierFilter) {
    ordersCashierFilter.addEventListener("change", function () {
      ORDERS_CASHIER_FILTER = this.value;
      renderOrders();
    });
  }
  var ordersPaymentFilter = $("#ordersPaymentFilter");
  if (ordersPaymentFilter) {
    ordersPaymentFilter.addEventListener("change", function () {
      ORDERS_PAYMENT_FILTER = this.value;
      renderOrders();
    });
  }
  var ordersReceiptFilter = $("#ordersReceiptFilter");
  if (ordersReceiptFilter) {
    ordersReceiptFilter.addEventListener("change", function () {
      ORDERS_RECEIPT_FILTER = this.value;
      renderOrders();
    });
  }
  var exportOrdersBtn = $("#exportOrdersBtn");
  if (exportOrdersBtn) exportOrdersBtn.addEventListener("click", exportOrders);

  // Suppliers & Purchases Listeners
  var addSupplierBtn = $("#addSupplierBtn");
  if (addSupplierBtn) addSupplierBtn.addEventListener("click", function () { openSupplierModal(); });
  var saveSupplierBtn = $("#saveSupplierBtn");
  if (saveSupplierBtn) saveSupplierBtn.addEventListener("click", saveSupplier);

  var addPurchaseBtn = $("#addPurchaseBtn");
  if (addPurchaseBtn) addPurchaseBtn.addEventListener("click", function () { openPurchaseModal(); });
  var savePurchaseBtn = $("#savePurchaseBtn");
  if (savePurchaseBtn) savePurchaseBtn.addEventListener("click", savePurchase);

  // Inventory Count Sheet Listener
  var inventoryCountBtn = $("#inventoryCountBtn");
  if (inventoryCountBtn) inventoryCountBtn.addEventListener("click", printInventoryCountSheet);

  // Settings Cash Drawer Test Button
  var testDrawerBtn = $("#testDrawerBtn");
  if (testDrawerBtn) {
    testDrawerBtn.addEventListener("click", function () {
      if (typeof PosSound !== "undefined") PosSound.playSuccess();
      toast("تاقیکردنەوەی سندوق", "سیگناڵی کردنەوەی کەشتی پارە نێردرا (ESC/POS 27,112,0,25,250)", "success");
    });
  }

  // Profit Report Export
  var exportProfitBtn = $("#exportProfitBtn");
  if (exportProfitBtn) exportProfitBtn.addEventListener("click", exportProfitReport);
}

function renderStockAlerts() {
  var badge = $("#alertBadge");
  var low = DB.products.filter(function (p) { return productTracksStock(p) && p.stock <= (p.minAlert || 5); });
  if (badge && low.length > 0) { badge.textContent = low.length; badge.style.display = ""; }
  else if (badge) { badge.style.display = "none"; }
}

/* ═══ INIT ═══ */

function setupBarcodeDeviceListener() {
  if (setupBarcodeDeviceListener.bound) return;
  setupBarcodeDeviceListener.bound = true;

  var SCAN_GAP_MS = 110;
  var SCAN_TERM_MS = 180;
  var SCAN_FLUSH_MS = 200;
  var SCAN_CONTINUE_MS = 220;
  var buf = "";
  var rapid = 0;
  var lastTs = 0;
  var flushTimer = null;
  var leak = null;
  var flushExtend = false;

  function resetBuf() {
    buf = "";
    rapid = 0;
    leak = null;
    flushExtend = false;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }

  function snapshotLeak(t) {
    if (!t) {
      leak = null;
      return;
    }
    var tag = t.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA") {
      leak = null;
      return;
    }
    var type = (t.type || "").toLowerCase();
    if (type === "checkbox" || type === "radio" || type === "button" || type === "submit" || type === "file") {
      leak = null;
      return;
    }
    leak = {
      el: t,
      value: t.value,
      start: t.selectionStart,
      end: t.selectionEnd
    };
  }

  function restoreLeak() {
    if (!leak || !leak.el) return;
    try {
      leak.el.value = leak.value;
      if (typeof leak.start === "number" && typeof leak.el.setSelectionRange === "function") {
        leak.el.setSelectionRange(leak.start, leak.end);
      }
    } catch (err) {}
  }

  function swallow(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }

  function commitScan() {
    var live = "";
    try {
      if (leak && leak.el && typeof leak.el.value === "string") live = leak.el.value;
      else if (document.activeElement && typeof document.activeElement.value === "string") {
        live = document.activeElement.value;
      }
    } catch (eLive) {}
    var code = (typeof pickBestScannedCode === "function")
      ? pickBestScannedCode(buf, live)
      : buf;
    var searchEl = leak && leak.el && leak.el.id === "headerSearchInput";
    restoreLeak();
    try {
      var ae = document.getElementById("headerSearchInput");
      if (ae && code) {
        var v = normalizeScannedCode(ae.value);
        if (v && (v === code || code.indexOf(v) >= 0 || v.indexOf(code) >= 0)) ae.value = "";
      }
    } catch (eClr) {}
    resetBuf();
    if (searchEl) {
      POS_GRID_SEARCH = "";
      try { renderProductGrid(POS_GRID_CATEGORY); } catch (errGrid) {}
    }
    if (!code) return;
    if (typeof isProductAddModalOpen === "function" && isProductAddModalOpen()) {
      if (typeof applyScannedBarcodeToProductForm === "function") applyScannedBarcodeToProductForm(code);
      return;
    }
    if (typeof isBarcodeStudioActive === "function" && isBarcodeStudioActive()) {
      if (typeof fillBarcodeStudioFromScan === "function") fillBarcodeStudioFromScan(code);
      return;
    }
    if (typeof processBarcode === "function") processBarcode(code);
  }

  function armFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(function () {
      flushTimer = null;
      if (/^B\d{5}$/i.test(buf) && rapid >= 3) {
        commitScan();
        return;
      }
      if (buf.length >= 8 && rapid >= 5) {
        var hit = (typeof findProductByScannedCode === "function") ? findProductByScannedCode(buf) : null;
        var digits = String(buf).replace(/\D/g, "");
        if (hit || digits.length >= 12) {
          commitScan();
          return;
        }
        if (!flushExtend) {
          flushExtend = true;
          flushTimer = setTimeout(function () {
            flushTimer = null;
            flushExtend = false;
            if (buf.length >= 8 && rapid >= 5) commitScan();
            else resetBuf();
          }, 180);
          return;
        }
        commitScan();
        return;
      }
      resetBuf();
    }, SCAN_FLUSH_MS);
  }

  document.addEventListener("keydown", function (e) {
    if (typeof isPosOrderPaperOpen === "function" && isPosOrderPaperOpen()) {
      if (buf) resetBuf();
      return;
    }
    if (isPosLoginActive()) {
      if (buf) resetBuf();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) {
      if (buf) resetBuf();
      return;
    }
    if (e.isComposing) return;

    var leaveKeys = typeof hidScanShouldLeaveKeys === "function" && hidScanShouldLeaveKeys(e.target);
    if (typeof isOrdersPageActive === "function" && isOrdersPageActive()) leaveKeys = true;
    var now = Date.now();
    var gap = lastTs ? (now - lastTs) : 9999;

    if (hidScanIsTerminator(e)) {
      var formOpen = typeof isProductAddModalOpen === "function" && isProductAddModalOpen();
      var fastTerm = gap < SCAN_TERM_MS;
      var looksLikeScan = (buf.length >= 8 && rapid >= 4) ||
        (buf.length >= 6 && rapid >= 3 && fastTerm);
      if (formOpen) {
        if (looksLikeScan && buf.length && typeof applyScannedBarcodeToProductForm === "function") {
          try { applyScannedBarcodeToProductForm(buf); } catch (eForm) {}
        }
        resetBuf();
        lastTs = now;
        return;
      }
      if (looksLikeScan && buf.length) {
        if (!leaveKeys) swallow(e);
        lastTs = now;
        commitScan();
        return;
      }
      resetBuf();
      lastTs = now;
      return;
    }

    var ch = hidScanChar(e);
    if (!ch) {
      if (e.key !== "Shift") resetBuf();
      return;
    }

    lastTs = now;
    var continueScan = buf.length > 0 && gap < SCAN_GAP_MS;
    if (!continueScan && buf.length >= 6 && ch && gap < SCAN_CONTINUE_MS) {
      continueScan = true;
    }
    if (continueScan) {
      rapid += 1;
      buf += ch;
      if (!leaveKeys && buf.length >= 3 && rapid >= 2) {
        swallow(e);
        restoreLeak();
      }
    } else {
      rapid = 0;
      buf = ch;
      snapshotLeak(e.target);
    }
    armFlush();
  }, true);

  document.addEventListener("paste", function (e) {
    if (isPosLoginActive()) return;
    if (typeof isPosOrderPaperOpen === "function" && isPosOrderPaperOpen()) return;
    if (typeof isProductAddModalOpen === "function" && isProductAddModalOpen()) return;
    if (typeof hidScanShouldLeaveKeys === "function" && hidScanShouldLeaveKeys(e.target)) return;
    var txt = "";
    try {
      txt = (e.clipboardData || window.clipboardData).getData("text") || "";
    } catch (errP) {}
    txt = normalizeScannedCode(txt);
    if (!/^[0-9A-Z.\-\/+]{6,32}$/i.test(txt)) return;
    var hit = (typeof findProductByScannedCodeFresh === "function")
      ? findProductByScannedCodeFresh(txt)
      : findProductByScannedCode(txt);
    if (!hit) return;
    e.preventDefault();
    if (typeof processBarcode === "function") processBarcode(txt);
  }, true);
}

function printLastReceipt() {
  var order = LAST_ORDER || DB.orders[DB.orders.length - 1];

  if (!order && CART.length === 0) {
    toast("هەڵە", "سەبەتە بەتاڵەیە - بەرهەم زیادکردە پێش چاپکردن", "error");
    return;
  }

  if (!order) {
    var subtotal = CART.reduce(function (s, c) { return s + c.price * c.qty; }, 0);
    var discIn = $("#discountInput");
    var discPct = parseFloat(discIn ? discIn.value : "0") || 0;
    var discAmt = Math.round((subtotal * discPct) / 100);
    var total = subtotal - discAmt;
    order = {
      id: gid(),
      items: CART.map(function (c) { return { name: c.name, price: c.price, qty: c.qty }; }),
      subtotal: subtotal,
      discount: discAmt,
      total: total,
      cashier: getActiveOperatorName(),
      date: new Date().toISOString()
    };
    stampOrderBillNo(order);
    LAST_ORDER = order;
  }

  var printArea = $("#receiptPrintArea");
  if (!printArea) { printReceiptDirect(order); return; }

  var marketName = getStoreName();
  var marketAddress = DB.settings && DB.settings.address ? DB.settings.address : "";
  var marketPhone = DB.settings && DB.settings.phone ? DB.settings.phone : "";
  var cashierName = order.cashier || receiptLabel("cashier");
  var orderDate = order.date ? new Date(order.date) : new Date();
  var dateStr = orderDate.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  var timeStr = formatSaleTime(orderDate, true);
  var orderNum = orderBillNo(order) || order.id.slice(-5).toUpperCase();
  var itemCount = order.items.reduce(function (s, i) { return s + i.qty; }, 0);

  var itemsRows = order.items.map(function (i) {
    var lineTotal = i.qty * i.price;
    return '<tr class="rc-item"><td class="rc-item-qty">' + i.qty + " " + receiptLabel("qtyMark") + '</td><td class="rc-item-name">' + i.name + '</td><td class="rc-item-price">' + Number(i.price).toLocaleString("en-US") + '</td><td class="rc-item-total">' + Number(lineTotal).toLocaleString("en-US") + '</td></tr>';
  }).join("");

  var html = '';
  html += '<div class="rc-modal-center">';
  html += '<div class="rc-modal-dash">========================</div>';
  html += '<div class="rc-modal-shop-en">' + marketName + '</div>';
  if (marketAddress) html += '<div class="rc-modal-addr">' + marketAddress + '</div>';
  if (marketPhone) html += '<div class="rc-modal-meta">' + receiptLabel("tel") + ": " + marketPhone + "</div>";
  html += '<div class="rc-modal-dash">========================</div>';
  html += '</div>';
  html += '<hr class="rc-modal-line">';
  html += '<div class="rc-modal-meta">' + receiptLabel("receipt") + ': <strong>' + orderNum + '</strong></div>';
  html += '<div class="rc-modal-meta">' + receiptLabel("date") + ": " + dateStr + " " + timeStr + "</div>";
  html += '<div class="rc-modal-meta">' + receiptLabel("cashier") + ": " + cashierName + "</div>";
  html += '<div class="rc-modal-meta">' + receiptLabel("items") + ": " + itemCount + "</div>";
  html += '<hr class="rc-modal-line">';
  html += '<table class="rc-modal-table"><thead><tr><th>' + receiptLabel("qty") + "</th><th>" + receiptLabel("item") + "</th><th>" + receiptLabel("price") + "</th><th>" + receiptLabel("totalCol") + "</th></tr></thead><tbody>" + itemsRows + "</tbody></table>";
  html += '<hr class="rc-modal-dot">';
  html += '<div class="rc-modal-summary"><div class="rc-modal-row"><span>' + receiptLabel("subtotal") + ":</span><span>" + Number(order.subtotal || order.total || 0).toLocaleString("en-US") + " " + receiptLabel("iqd") + "</span></div>";
  if (order.discount > 0) html += '<div class="rc-modal-row"><span>' + receiptLabel("discount") + ":</span><span>-" + Number(order.discount).toLocaleString("en-US") + " " + receiptLabel("iqd") + "</span></div>";
  html += "</div>";
  html += '<div class="rc-modal-total-row"><span>' + receiptLabel("grand") + ":</span><span>" + Number(order.total || 0).toLocaleString("en-US") + " " + receiptLabel("iqd") + "</span></div>";
  html += '<hr class="rc-modal-line">';
  html += '<div class="rc-modal-center rc-modal-footer">';
  html += '<div class="rc-modal-thanks">' + receiptLabel("thanks") + "</div>";
  html += '</div>';

  if (typeof printReceiptDirect === "function") {
    printReceiptDirect(order);
    return;
  }
  if (typeof ImmediatePrinter !== "undefined") {
    ImmediatePrinter.print(html, { pageSize: "80mm" });
  } else {
  printArea.innerHTML = html;
  printArea.style.display = "block";
  setTimeout(function () {
    window.print();
    setTimeout(function () {
      printArea.style.display = "none";
      printArea.innerHTML = "";
    }, 500);
  }, 200);
  }
}

// ══════════════════════════════════════════════════════════════════
// UNIFIED FINANCIAL STATEMENT: PROFIT & LOSS (INCOME VS EXPENSES)
// ══════════════════════════════════════════════════════════════════

window.CURRENT_PROFIT_PERIOD = 'today';
window.PROFIT_CUSTOM_FROM = null;
window.PROFIT_CUSTOM_TO = null;

function filterProfitByCustomRange() {
  var fromEl = $("#profitDateFrom");
  var toEl = $("#profitDateTo");
  var from = fromEl ? fromEl.value : null;
  var to = toEl ? toEl.value : null;
  if (!from || !to) {
    toast("ئاگاداری", "تکایە هەردوو بەرواری (لە ... بۆ ...) دیاری بکە", "warning");
    return;
  }
  window.PROFIT_CUSTOM_FROM = from;
  window.PROFIT_CUSTOM_TO = to;
  renderProfitReport('custom');
}

function switchFinanceHubTab(tab) {
  window.CURRENT_FINANCE_TAB = tab || "overview";
  tab = window.CURRENT_FINANCE_TAB;
  var buttons = {
    overview: document.getElementById("fhTabBtn_overview"),
    balance: document.getElementById("fhTabBtn_balance"),
    expenses: document.getElementById("fhTabBtn_expenses"),
    analytics: document.getElementById("fhTabBtn_analytics"),
    close: document.getElementById("fhTabBtn_close")
  };
  var wraps = {
    overview: document.getElementById("fhWrap_overview"),
    balance: document.getElementById("fhWrap_balance"),
    expenses: document.getElementById("fhWrap_expenses"),
    analytics: document.getElementById("fhWrap_analytics"),
    close: document.getElementById("fhWrap_close")
  };
  Object.keys(buttons).forEach(function (key) {
    var btn = buttons[key];
    if (!btn) return;
    var on = tab === key;
    btn.className = on ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm";
    btn.style.fontWeight = on ? "800" : "700";
  });
  Object.keys(wraps).forEach(function (key) {
    if (wraps[key]) wraps[key].style.display = tab === key ? "block" : "none";
  });
  var sub = $("#pageSubtitle");
  if (sub) {
    var labels = {
      overview: "پوختەی کار، پارە، مەسرەف و قازانج",
      balance: "تەرازووی فرۆشتن، مەسرەف و قازانجی سافی",
      expenses: "مەسرەف و خەرجییەکان",
      analytics: "شیکاری فرۆشتن",
      close: "کۆتایی ڕۆژ و مانگ — هەموو فرۆشتن بۆ چاپ"
    };
    sub.textContent = labels[tab] || labels.overview;
  }
  if (tab === "overview") renderDashboard();
  else if (tab === "balance") renderProfitReport(window.CURRENT_PROFIT_PERIOD || "today");
  else if (tab === "expenses") renderExpenses();
  else if (tab === "analytics") renderFinanceAnalytics();
  else if (tab === "close" && window.PeriodClose) PeriodClose.show();
}
window.switchFinanceHubTab = switchFinanceHubTab;

function renderFinanceAnalytics() {
  var container = document.getElementById("fhAnalyticsContent");
  if (!container) return;
  var orders = incomeOrders(branchRecords(DB.orders || []));

  // 1. Daily breakdown for the last 30 days
  var days = {};
  orders.forEach(function (o) {
    if (!o.date) return;
    var d = o.date.slice(0, 10);
    if (!days[d]) days[d] = { sales: 0, cost: 0, profit: 0, count: 0 };
    days[d].sales += o.total || 0;
    days[d].cost += o.totalCost || 0;
    days[d].profit += (o.profit !== undefined) ? o.profit : ((o.total || 0) - (o.totalCost || 0));
    days[d].count++;
  });
  var sortedDays = Object.keys(days).sort().reverse().slice(0, 30);

  // 2. Payment methods distribution
  var payCounts = { cash: 0, card: 0, debt: 0, usd: 0 };
  var payTotals = { cash: 0, card: 0, debt: 0, usd: 0 };
  orders.forEach(function (o) {
    var m = (typeof orderPayKind === "function") ? orderPayKind(o) : (o.paymentMethod || "cash");
    if (!payCounts[m]) { payCounts[m] = 0; payTotals[m] = 0; }
    payCounts[m]++;
    payTotals[m] += (o.total || 0);
  });

  // 3. Top selling products
  var prodSales = {};
  orders.forEach(function (o) {
    (o.items || []).forEach(function (it) {
      var name = it.name || "کاڵا";
      if (!prodSales[name]) prodSales[name] = { qty: 0, revenue: 0 };
      prodSales[name].qty += (it.qty || 1);
      prodSales[name].revenue += ((it.price || 0) * (it.qty || 1));
    });
  });
  var topProds = Object.keys(prodSales).map(function (k) {
    return { name: k, qty: prodSales[k].qty, revenue: prodSales[k].revenue };
  }).sort(function (a, b) { return b.revenue - a.revenue; }).slice(0, 10);

  // Build HTML
  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:18px;">';
  html += '<div class="stat-card success" style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);"><div class="stat-icon" style="color:#10b981;"><i class="fas fa-money-bill-wave"></i></div><div class="stat-label">نەختینەی فرۆشراو (Cash)</div><div class="stat-value" style="color:#10b981;">' + fmt(payTotals.cash || 0) + '</div><div class="stat-hint">' + (payCounts.cash || 0) + ' پسوولەی فرۆشتن</div></div>';
  html += '<div class="stat-card info" style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.3);"><div class="stat-icon" style="color:#38bdf8;"><i class="fas fa-credit-card"></i></div><div class="stat-label">فرۆشتن بە کارت (Card)</div><div class="stat-value" style="color:#38bdf8;">' + fmt(payTotals.card || 0) + '</div><div class="stat-hint">' + (payCounts.card || 0) + ' پسوولەی فرۆشتن</div></div>';
  html += '<div class="stat-card warning" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);"><div class="stat-icon" style="color:#f59e0b;"><i class="fas fa-hand-holding-dollar"></i></div><div class="stat-label">فرۆشتن بە قەرز (Debt)</div><div class="stat-value" style="color:#f59e0b;">' + fmt(payTotals.debt || 0) + '</div><div class="stat-hint">' + (payCounts.debt || 0) + ' پسوولەی فرۆشتن</div></div>';
  if (payCounts.usd) {
    html += '<div class="stat-card success" style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);"><div class="stat-icon" style="color:#86efac;"><i class="fas fa-dollar-sign"></i></div><div class="stat-label">فرۆشتن بە دۆلار</div><div class="stat-value">' + fmt(payTotals.usd || 0) + '</div><div class="stat-hint">' + payCounts.usd + ' پسوولەی فرۆشتن</div></div>';
  }
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:1.5fr 1fr;gap:16px;flex-wrap:wrap;">';

  // Daily breakdown table
  html += '<div class="panel-card dash-panel" style="border-radius:14px;padding:16px;">' +
    '<h3 style="margin:0 0 12px;font-size:0.95rem;display:flex;align-items:center;gap:8px;"><i class="fas fa-calendar-alt" style="color:#2563eb;"></i> مێژووی فرۆشتنی ڕۆژانە (٣٠ ڕۆژی ڕابردوو)</h3>' +
    '<div class="table-wrap" style="max-height:360px;overflow-y:auto;"><table class="data-table"><thead><tr><th>بەروار</th><th>پسوولە</th><th>کۆی فرۆشتن</th><th>تێچووی کاڵا</th><th>قازانج</th></tr></thead><tbody>';
  if (sortedDays.length === 0) {
    html += '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">هیچ فرۆشتنێک تۆمار نەکراوە</td></tr>';
  } else {
    sortedDays.forEach(function (d) {
      var r = days[d];
      var profitColor = r.profit >= 0 ? "var(--success)" : "var(--danger)";
      html += '<tr><td><strong>' + d + '</strong></td><td>' + r.count + '</td><td style="color:#38bdf8;font-weight:700;">' + fmt(r.sales) + '</td><td style="color:var(--text-muted);">-' + fmt(r.cost) + '</td><td style="color:' + profitColor + ';font-weight:800;">' + fmt(r.profit) + '</td></tr>';
    });
  }
  html += '</tbody></table></div></div>';

  // Top products table
  html += '<div class="panel-card dash-panel" style="border-radius:14px;padding:16px;">' +
    '<h3 style="margin:0 0 12px;font-size:0.95rem;display:flex;align-items:center;gap:8px;"><i class="fas fa-trophy" style="color:#d97706;"></i> ١٠ پڕفرۆشترین بەرهەم بەپێی داهات</h3>' +
    '<div class="table-wrap" style="max-height:360px;overflow-y:auto;"><table class="data-table"><thead><tr><th>#</th><th>ناوی بەرهەم</th><th>دانە</th><th>کۆی داهات</th></tr></thead><tbody>';
  if (topProds.length === 0) {
    html += '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">هیچ فرۆشتنێک تۆمار نەکراوە</td></tr>';
  } else {
    topProds.forEach(function (p, idx) {
      html += '<tr><td>' + (idx + 1) + '</td><td><strong>' + p.name + '</strong></td><td>' + p.qty.toLocaleString() + '</td><td style="color:#10b981;font-weight:800;">' + fmt(p.revenue) + '</td></tr>';
    });
  }
  html += '</tbody></table></div></div>';

  html += '</div>';

  container.innerHTML = html;
}
window.renderFinanceAnalytics = renderFinanceAnalytics;

function renderProfitReport(period) {
  // If invoked with a DOM element (container), redirect to renderReportsProfitTab
  if (period && typeof period === "object" && (period.nodeType || period.innerHTML !== undefined)) {
    renderReportsProfitTab(period);
    return;
  }
  if (!period || period === "profit" || period === "daily") period = window.CURRENT_PROFIT_PERIOD || 'today';
  window.CURRENT_PROFIT_PERIOD = period;

  // Highlight active tab
  var tabs = document.querySelectorAll("#profitPeriodTabs button");
  tabs.forEach(function (btn) {
    if (btn.getAttribute("data-period") === period) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  var orders = incomeOrders(branchRecords((typeof DB !== "undefined" && DB.orders) ? DB.orders : []));
  var expenses = branchRecords((typeof DB !== "undefined" && DB.expenses) ? DB.expenses : []);
  var now = new Date();
  var todayStr = now.toISOString().slice(0, 10);
  var thisMonthStr = now.toISOString().slice(0, 7);

  var periodLabel = "ئەمڕۆ";
  var filteredOrders = [];
  var filteredExpenses = [];

  if (period === 'today' || period === 'daily') {
    periodLabel = "ئەمڕۆ (" + todayStr + ")";
    filteredOrders = orders.filter(function (o) { return o.date && o.date.indexOf(todayStr) === 0; });
    filteredExpenses = expenses.filter(function (e) { return e.date && e.date.indexOf(todayStr) === 0; });
  } else if (period === 'last7' || period === 'weekly') {
    var weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    periodLabel = "٧ ڕۆژی ڕابردوو";
    filteredOrders = orders.filter(function (o) { return o.date && new Date(o.date) >= weekAgo; });
    filteredExpenses = expenses.filter(function (e) { return e.date && new Date(e.date) >= weekAgo; });
  } else if (period === 'this_month' || period === 'monthly') {
    periodLabel = "ئەم مانگە (" + thisMonthStr + ")";
    filteredOrders = orders.filter(function (o) { return o.date && o.date.indexOf(thisMonthStr) === 0; });
    filteredExpenses = expenses.filter(function (e) { return e.date && e.date.indexOf(thisMonthStr) === 0; });
  } else if (period === 'last_month') {
    var prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var prevMonthStr = prevMonth.toISOString().slice(0, 7);
    periodLabel = "مانگی پێشوو (" + prevMonthStr + ")";
    filteredOrders = orders.filter(function (o) { return o.date && o.date.indexOf(prevMonthStr) === 0; });
    filteredExpenses = expenses.filter(function (e) { return e.date && e.date.indexOf(prevMonthStr) === 0; });
  } else if (period === 'this_year' || period === 'yearly') {
    var thisYearStr = now.getFullYear().toString();
    periodLabel = "ئەمساڵ (" + thisYearStr + ")";
    filteredOrders = orders.filter(function (o) { return o.date && o.date.indexOf(thisYearStr) === 0; });
    filteredExpenses = expenses.filter(function (e) { return e.date && e.date.indexOf(thisYearStr) === 0; });
  } else if (period === 'custom') {
    var f = window.PROFIT_CUSTOM_FROM || todayStr;
    var t = window.PROFIT_CUSTOM_TO || todayStr;
    periodLabel = "لە " + f + " تا " + t;
    filteredOrders = orders.filter(function (o) {
      if (!o.date) return false;
      var d = o.date.slice(0, 10);
      return d >= f && d <= t;
    });
    filteredExpenses = expenses.filter(function (e) {
      if (!e.date) return false;
      var d = e.date.slice(0, 10);
      return d >= f && d <= t;
    });
  } else {
    periodLabel = "هەموو کات (All Time)";
    filteredOrders = orders;
    filteredExpenses = expenses;
  }

  // Financial Calculations
  var totalSales = filteredOrders.reduce(function (s, o) { return s + (o.total || 0); }, 0);
  var totalCost = filteredOrders.reduce(function (s, o) { return s + (o.totalCost || 0); }, 0);
  var grossProfit = totalSales - totalCost;
  var grossMargin = totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : "0.0";

  var totalExpenses = filteredExpenses.reduce(function (s, e) { return s + (e.amount || 0); }, 0);
  var netProfit = grossProfit - totalExpenses;
  var netMargin = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : "0.0";
  var netColor = netProfit >= 0 ? "#10b981" : "#ef4444";

  // 1. Render 5 Financial Master Cards
  var statsHtml = '';
  // Card 1: Gross Sales / Incomes
  statsHtml += '<div class="stat-card accent" style="background:linear-gradient(135deg,rgba(56,189,248,0.1),rgba(14,165,233,0.03));border:1px solid rgba(56,189,248,0.3);">' +
    '<div class="stat-icon" style="color:#38bdf8;"><i class="fas fa-coins"></i></div>' +
    '<div class="stat-label">١. کۆی داهاتی فرۆشتن (Gross Sales)</div>' +
    '<div class="stat-value" style="color:#38bdf8;font-size:1.45rem;">' + fmt(totalSales) + '</div>' +
    '<div class="stat-hint">' + filteredOrders.length + ' پسوڵەی فرۆشراو لە ' + periodLabel + '</div>' +
  '</div>';

  // Card 2: Cost of Goods (COGS)
  statsHtml += '<div class="stat-card info" style="background:linear-gradient(135deg,rgba(148,163,184,0.1),rgba(100,116,139,0.03));border:1px solid rgba(148,163,184,0.3);">' +
    '<div class="stat-icon" style="color:#94a3b8;"><i class="fas fa-boxes"></i></div>' +
    '<div class="stat-label">٢. تێچووی کڕینی کاڵا (COGS)</div>' +
    '<div class="stat-value" style="color:var(--text-secondary);font-size:1.45rem;">-' + fmt(totalCost) + '</div>' +
    '<div class="stat-hint">سەرمایەی کڕینی کاڵاکان</div>' +
  '</div>';

  // Card 3: Gross Profit
  statsHtml += '<div class="stat-card success" style="background:linear-gradient(135deg,rgba(245,158,11,0.1),rgba(217,119,6,0.03));border:1px solid rgba(245,158,11,0.3);">' +
    '<div class="stat-icon" style="color:#f59e0b;"><i class="fas fa-chart-line"></i></div>' +
    '<div class="stat-label">٣. قازانجی ناپوختە (Gross Margin)</div>' +
    '<div class="stat-value" style="color:#f59e0b;font-size:1.45rem;">' + fmt(grossProfit) + '</div>' +
    '<div class="stat-hint">ڕێژە: ' + grossMargin + '% (پێش کەمکردنی مەسرەف)</div>' +
  '</div>';

  // Card 4: Total Expenses / Masraf
  statsHtml += '<div class="stat-card danger" style="background:linear-gradient(135deg,rgba(239,68,68,0.1),rgba(185,28,28,0.03));border:1px solid rgba(239,68,68,0.3);">' +
    '<div class="stat-icon" style="color:#ef4444;"><i class="fas fa-receipt"></i></div>' +
    '<div class="stat-label">٤. کۆی گشتی مەسرەف (Expenses)</div>' +
    '<div class="stat-value" style="color:#ef4444;font-size:1.45rem;">-' + fmt(totalExpenses) + '</div>' +
    '<div class="stat-hint">کارەبا، کرێ، مووچە، نان (' + filteredExpenses.length + ' خەرجی)</div>' +
  '</div>';

  // Card 5: Net Real Profit
  statsHtml += '<div class="stat-card" style="background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(5,150,105,0.05));border:2px solid ' + netColor + ';box-shadow:0 10px 25px rgba(0,0,0,0.3);">' +
    '<div class="stat-icon" style="color:' + netColor + ';"><i class="fas fa-gem"></i></div>' +
    '<div class="stat-label" style="font-weight:900;color:' + netColor + ';">٥. قازانجی سافی پوختە (Net Profit)</div>' +
    '<div class="stat-value" style="color:' + netColor + ';font-size:1.6rem;font-weight:900;">' + fmt(netProfit) + '</div>' +
    '<div class="stat-hint" style="font-weight:700;">ڕێژەی پوختەی قازانج: ' + netMargin + '%</div>' +
  '</div>';
  
  var profitStats = $("#profitStats");
  if (profitStats) profitStats.innerHTML = statsHtml;
  
  // 2. Render Mathematical Formula Equation Strip
  var eqEl = $("#profitEquationStrip");
  if (eqEl) {
    eqEl.innerHTML = '<div class="dash-eq">' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<span style="color:var(--text-secondary);">داهاتی فرۆشتن:</span>' +
        '<strong style="color:var(--info);">' + fmt(totalSales) + '</strong>' +
      '</div>' +
      '<span style="color:var(--text-muted);font-weight:900;">—</span>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<span style="color:var(--text-secondary);">تێچووی کاڵا:</span>' +
        '<strong class="dash-ink">' + fmt(totalCost) + '</strong>' +
      '</div>' +
      '<span style="color:var(--text-muted);font-weight:900;">=</span>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<span style="color:var(--text-secondary);">قازانجی ناپوختە:</span>' +
        '<strong style="color:var(--warning);">' + fmt(grossProfit) + '</strong>' +
      '</div>' +
      '<span style="color:var(--text-muted);font-weight:900;">—</span>' +
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<span style="color:var(--text-secondary);">کۆی مەسرەف:</span>' +
        '<strong style="color:var(--danger);">' + fmt(totalExpenses) + '</strong>' +
      '</div>' +
      '<span style="color:var(--text-muted);font-weight:900;">=</span>' +
      '<div class="dash-eq-net" style="border:1px solid ' + netColor + ';">' +
        '<span>قازانجی سافی:</span>' +
        '<strong style="color:' + netColor + ';font-size:1.15rem;font-weight:900;">' + fmt(netProfit) + '</strong>' +
      '</div>' +
    '</div>';
  }

  // 3. Render Expenses Category Breakdown
  var breakdownEl = $("#profitExpensesBreakdownList");
  if (breakdownEl) {
    if (filteredExpenses.length === 0) {
      breakdownEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:0.86rem;"><i class="fas fa-check-circle" style="color:#10b981;margin-left:6px;"></i>هیچ مەسرەفێک لەم ماوەیەدا نییە</div>';
    } else {
      var catTotals = {};
      filteredExpenses.forEach(function (e) {
        var k = e.category || e.type || "other";
        catTotals[k] = (catTotals[k] || 0) + (e.amount || 0);
      });
      var sortedCats = Object.keys(catTotals).sort(function (a, b) { return catTotals[b] - catTotals[a]; });
      breakdownEl.innerHTML = sortedCats.map(function (k) {
        var info = getExpenseCategoryInfo(k);
        var amt = catTotals[k];
        var pct = totalExpenses > 0 ? ((amt / totalExpenses) * 100).toFixed(1) : 0;
        return '<div style="display:flex;flex-direction:column;gap:4px;">' +
          '<div style="display:flex;justify-content:space-between;font-size:0.84rem;">' +
            '<span style="display:inline-flex;align-items:center;gap:6px;font-weight:700;color:' + info.color + ';"><i class="fas ' + info.icon + '"></i> ' + info.name + '</span>' +
            '<span class="dash-ink" style="font-weight:800;">' + fmt(amt) + ' <small style="color:var(--text-muted);">(' + pct + '%)</small></span>' +
          '</div>' +
          '<div style="background:var(--bg-input);height:6px;border-radius:3px;overflow:hidden;">' +
            '<div style="background:' + info.color + ';width:' + pct + '%;height:100%;border-radius:3px;"></div>' +
          '</div>' +
        '</div>';
      }).join("");
    }
  }

  // 4. Render Daily/Period Breakdown Table
  var daysMap = {};
  filteredOrders.forEach(function (o) {
    if (!o.date) return;
    var d = o.date.slice(0, 10);
    if (!daysMap[d]) daysMap[d] = { sales: 0, cost: 0, expenses: 0, count: 0 };
    daysMap[d].sales += (o.total || 0);
    daysMap[d].cost += (o.totalCost || 0);
    daysMap[d].count++;
  });
  filteredExpenses.forEach(function (e) {
    if (!e.date) return;
    var d = e.date.slice(0, 10);
    if (!daysMap[d]) daysMap[d] = { sales: 0, cost: 0, expenses: 0, count: 0 };
    daysMap[d].expenses += (e.amount || 0);
  });

  var sortedDays = Object.keys(daysMap).sort().reverse();
  var tbody = $("#profitTableBody");
  if (tbody) {
    if (sortedDays.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);font-weight:700;"><i class="fas fa-inbox" style="margin-left:6px;"></i>هیچ داتایەکی فرۆشتن یان مەسرەف نییە بۆ ئەم ماوەیە</td></tr>';
    } else {
      tbody.innerHTML = sortedDays.map(function (d) {
        var item = daysMap[d];
        var dGross = item.sales - item.cost;
        var dNet = dGross - item.expenses;
        var dMargin = item.sales > 0 ? ((dNet / item.sales) * 100).toFixed(1) : "0.0";
        var dColor = dNet >= 0 ? "var(--success)" : "var(--danger)";
        return '<tr>' +
          '<td><strong>' + d + '</strong> <small style="color:var(--text-muted);">(' + item.count + ' پسوڵە)</small></td>' +
          '<td style="color:#38bdf8;font-weight:700;">' + fmt(item.sales) + '</td>' +
          '<td style="color:var(--text-muted);">-' + fmt(item.cost) + '</td>' +
          '<td style="color:#ef4444;font-weight:700;">-' + fmt(item.expenses) + '</td>' +
          '<td style="color:' + dColor + ';font-weight:900;font-size:0.95rem;">' + fmt(dNet) + '</td>' +
          '<td><span style="background:' + (dNet >= 0 ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)") + ';color:' + dColor + ';padding:2px 8px;border-radius:6px;font-weight:800;font-size:0.8rem;">' + dMargin + '%</span></td>' +
        '</tr>';
      }).join("");
    }
  }
}

function printFinancialStatementReport() {
  var period = window.CURRENT_PROFIT_PERIOD || 'today';
  var orders = incomeOrders(branchRecords((typeof DB !== "undefined" && DB.orders) ? DB.orders : []));
  var expenses = branchRecords((typeof DB !== "undefined" && DB.expenses) ? DB.expenses : []);
  var now = new Date();
  var todayStr = now.toISOString().slice(0, 10);
  var thisMonthStr = now.toISOString().slice(0, 7);

  var periodLabel = "ئەمڕۆ";
  var filteredOrders = [];
  var filteredExpenses = [];

  if (period === 'today' || period === 'daily') {
    periodLabel = "ئەمڕۆ (" + todayStr + ")";
    filteredOrders = orders.filter(function (o) { return o.date && o.date.indexOf(todayStr) === 0; });
    filteredExpenses = expenses.filter(function (e) { return e.date && e.date.indexOf(todayStr) === 0; });
  } else if (period === 'last7' || period === 'weekly') {
    var weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    periodLabel = "٧ ڕۆژی ڕابردوو";
    filteredOrders = orders.filter(function (o) { return o.date && new Date(o.date) >= weekAgo; });
    filteredExpenses = expenses.filter(function (e) { return e.date && new Date(e.date) >= weekAgo; });
  } else if (period === 'this_month' || period === 'monthly') {
    periodLabel = "ئەم مانگە (" + thisMonthStr + ")";
    filteredOrders = orders.filter(function (o) { return o.date && o.date.indexOf(thisMonthStr) === 0; });
    filteredExpenses = expenses.filter(function (e) { return e.date && e.date.indexOf(thisMonthStr) === 0; });
  } else if (period === 'last_month') {
    var prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var prevMonthStr = prevMonth.toISOString().slice(0, 7);
    periodLabel = "مانگی پێشوو (" + prevMonthStr + ")";
    filteredOrders = orders.filter(function (o) { return o.date && o.date.indexOf(prevMonthStr) === 0; });
    filteredExpenses = expenses.filter(function (e) { return e.date && e.date.indexOf(prevMonthStr) === 0; });
  } else if (period === 'this_year' || period === 'yearly') {
    var thisYearStr = now.getFullYear().toString();
    periodLabel = "ئەمساڵ (" + thisYearStr + ")";
    filteredOrders = orders.filter(function (o) { return o.date && o.date.indexOf(thisYearStr) === 0; });
    filteredExpenses = expenses.filter(function (e) { return e.date && e.date.indexOf(thisYearStr) === 0; });
  } else if (period === 'custom') {
    var f = window.PROFIT_CUSTOM_FROM || todayStr;
    var t = window.PROFIT_CUSTOM_TO || todayStr;
    periodLabel = "لە " + f + " تا " + t;
    filteredOrders = orders.filter(function (o) {
      if (!o.date) return false;
      var d = o.date.slice(0, 10);
      return d >= f && d <= t;
    });
    filteredExpenses = expenses.filter(function (e) {
      if (!e.date) return false;
      var d = e.date.slice(0, 10);
      return d >= f && d <= t;
    });
  } else {
    periodLabel = "هەموو کات";
    filteredOrders = orders;
    filteredExpenses = expenses;
  }

  var totalSales = filteredOrders.reduce(function (s, o) { return s + (o.total || 0); }, 0);
  var totalCost = filteredOrders.reduce(function (s, o) { return s + (o.totalCost || 0); }, 0);
  var grossProfit = totalSales - totalCost;
  var totalExpenses = filteredExpenses.reduce(function (s, e) { return s + (e.amount || 0); }, 0);
  var netProfit = grossProfit - totalExpenses;
  var netMargin = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : "0.0";

  var catTotals = {};
  filteredExpenses.forEach(function (e) {
    var k = e.category || e.type || "other";
    catTotals[k] = (catTotals[k] || 0) + (e.amount || 0);
  });

  var marketName = getStoreName();
  var row = 'display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin:6px 0;font-size:28px;line-height:1.35;';
  var inner =
    '<div class="rc" style="width:100%;max-width:100%;margin:0;padding:0;font-family:Tahoma,Arial,sans-serif;direction:rtl;color:#000;font-size:28px;line-height:1.4;">' +
      '<div style="text-align:center;border-bottom:3px dashed #000;padding-bottom:12px;margin-bottom:12px;">' +
        '<div style="margin:0;font-size:40px;font-weight:900;line-height:1.15;">' + marketName + '</div>' +
        '<div style="font-size:30px;font-weight:800;margin-top:8px;">تەرازووی دارایی و قازانجی سافی</div>' +
        '<div style="font-size:24px;font-weight:700;margin-top:8px;">ماوە: ' + periodLabel + '</div>' +
        '<div style="font-size:22px;margin-top:6px;">چاپکرا لە: ' + formatSaleDateTime(new Date(), true) + '</div>' +
      '</div>' +
      '<div style="border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:10px;">' +
        '<div style="' + row + '"><span>کۆی فرۆشتن:</span><strong>' + fmt(totalSales) + '</strong></div>' +
        '<div style="' + row + '"><span>تێچووی کاڵا:</span><span>-' + fmt(totalCost) + '</span></div>' +
        '<div style="' + row + 'border-top:2px dashed #000;padding-top:8px;font-weight:800;"><span>قازانجی ناپوختە:</span><strong>' + fmt(grossProfit) + '</strong></div>' +
      '</div>' +
      '<div style="margin-bottom:10px;border-bottom:2px solid #000;padding-bottom:10px;">' +
        '<div style="font-weight:800;margin-bottom:8px;font-size:28px;">وردەکاری مەسرەفەکان:</div>';

  var catKeys = Object.keys(catTotals);
  if (catKeys.length === 0) {
    inner += '<div style="font-size:26px;">هیچ مەسرەفێک تۆمار نەکراوە</div>';
  } else {
    catKeys.forEach(function (k) {
      var info = getExpenseCategoryInfo(k);
      inner += '<div style="' + row + '"><span>' + info.name + ':</span><span>-' + fmt(catTotals[k]) + '</span></div>';
    });
  }
  inner +=
        '<div style="' + row + 'font-weight:800;border-top:2px dashed #000;margin-top:8px;padding-top:8px;"><span>کۆی گشتی مەسرەف:</span><span>-' + fmt(totalExpenses) + '</span></div>' +
      '</div>' +
      '<div style="padding:14px 8px;border:3px solid #000;margin-top:12px;text-align:center;">' +
        '<div style="font-size:26px;font-weight:800;">قازانجی سافی پوختە</div>' +
        '<div style="font-size:48px;font-weight:900;margin:10px 0;line-height:1.1;">' + fmt(netProfit) + '</div>' +
        '<div style="font-size:26px;font-weight:800;">ڕێژەی قازانج: ' + netMargin + '%</div>' +
      '</div>' +
      '<div style="text-align:center;font-size:22px;margin-top:16px;font-weight:700;">سیستەمی وەرگرتنی پارە</div>' +
    '</div>';

  var html = '<!DOCTYPE html><html lang="ku" dir="rtl"><head><meta charset="UTF-8"><title>تەرازووی دارایی</title>' +
    '<style>html,body{margin:0;padding:8px 10px;width:100%;max-width:100%;background:#fff;color:#000;font-family:Tahoma,Arial,sans-serif;font-size:28px;line-height:1.4;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact;}body > div,.rc{width:100% !important;max-width:100% !important;margin:0 !important;}</style>' +
    '</head><body>' + inner + '</body></html>';

  if (typeof ImmediatePrinter !== "undefined" && typeof ImmediatePrinter.print === "function") {
    ImmediatePrinter.print(html, { pageSize: "80mm" });
  } else {
    var p = document.getElementById("printArea");
    if (p) {
      p.innerHTML = html;
      p.style.display = "block";
      setTimeout(function () {
        window.print();
        setTimeout(function () { p.style.display = "none"; p.innerHTML = ""; }, 500);
      }, 200);
    }
  }
  toast("چاپکردن", "ڕاپۆرتی دارایی نێردرا بۆ چاپکەر", "info");
}

function exportProfitToExcel() {
  var table = document.getElementById("profitTable");
  if (!table) return;
  var rows = table.querySelectorAll("tr");
  var csv = "\uFEFF"; // UTF-8 BOM
  rows.forEach(function (r) {
    var cols = r.querySelectorAll("th, td");
    var rowData = [];
    cols.forEach(function (c) {
      var text = c.innerText.replace(/"/g, '""').trim();
      rowData.push('"' + text + '"');
    });
    csv += rowData.join(",") + "\r\n";
  });
  var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = "Financial_Statement_" + (new Date().toISOString().slice(0, 10)) + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast("Excel", "ڕاپۆرتی دارایی بە سەرکەوتوویی هەناردە کرا", "success");
}

// Return Sales
function renderReturnSales() {
  if (typeof ReturnEngine !== "undefined" && typeof ReturnEngine.renderReturnSalesArchive === "function") {
    ReturnEngine.renderReturnSalesArchive();
    return;
  }
  var returns = RETURN_SALES || [];
  var totalReturns = returns.reduce(function (s, r) { return s + (r.refundAmount || 0); }, 0);
  
  var statsHtml = '<div class="stat-card accent"><div class="stat-icon"><i class="fas fa-undo"></i></div><div class="stat-label">گشتی گەڕانەوە</div><div class="stat-value">' + returns.length + '</div></div>';
  statsHtml += '<div class="stat-card warning"><div class="stat-icon"><i class="fas fa-money-bill-wave"></i></div><div class="stat-label">بەهای گەڕانەوە</div><div class="stat-value">' + fmt(totalReturns) + '</div></div>';
  
  var returnStats = $("#returnStats");
  if (returnStats) returnStats.innerHTML = statsHtml;
  
  var tbody = $("#returnSalesTableBody");
  if (tbody) {
    if (returns.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">هیچ گەڕانەوەیەک نییە</td></tr>';
    } else {
      tbody.innerHTML = returns.map(function (r, i) {
        var dateStr = r.date ? r.date.replace("T", " ").slice(0, 16) : "-";
        return '<tr><td>' + (i + 1) + '</td><td>' + (r.orderId || "-") + '</td><td>' + dateStr + '</td><td>' + (r.customerName || "-") + '</td><td>' + fmt(r.refundAmount || 0) + '</td><td>' + (r.reason || "-") + '</td><td><span style="color:' + (r.status === 'completed' ? 'var(--success)' : 'var(--warning)') + '">' + (r.status || 'pending') + '</span></td><td><button class="btn btn-sm btn-outline" onclick="viewReturnSale(\'' + r.id + '\')">بینین</button></td></tr>';
      }).join("");
    }
  }
}

// ══════════════════════════════════════════════════════════════════
// EXPENSES RENDERING & FILTERING
// ══════════════════════════════════════════════════════════════════

window.CURRENT_EXPENSE_FILTER = 'today';

function filterExpensesView(filter, btnEl) {
  window.CURRENT_EXPENSE_FILTER = filter;
  if (btnEl) {
    var tabs = document.querySelectorAll("#expenseFilterTabs button");
    tabs.forEach(function (b) { b.classList.remove("active"); });
    btnEl.classList.add("active");
  }
  renderExpenses();
}

function renderExpenses() {
  rebuildExpenseCategoryFilter();
  var expenses = branchRecords(DB.expenses || []);
  var now = new Date();
  var todayStr = now.toISOString().slice(0, 10);
  var thisMonthStr = now.toISOString().slice(0, 7);

  var todayTotal = expenses.filter(function (e) { return e.date && e.date.startsWith(todayStr); }).reduce(function (s, e) { return s + (e.amount || 0); }, 0);
  var monthTotal = expenses.filter(function (e) { return e.date && e.date.startsWith(thisMonthStr); }).reduce(function (s, e) { return s + (e.amount || 0); }, 0);
  var allTimeTotal = expenses.reduce(function (s, e) { return s + (e.amount || 0); }, 0);

  var statsHtml = '<div class="stat-card accent" style="border-right:4px solid #ef4444;"><div class="stat-icon" style="color:#ef4444;"><i class="fas fa-calendar-day"></i></div><div class="stat-label">مەسرەفی ئەمڕۆ</div><div class="stat-value" style="color:#ef4444;">' + fmt(todayTotal) + '</div><div class="stat-hint">کارەبا، خواردن و هیتر</div></div>';
  statsHtml += '<div class="stat-card warning" style="border-right:4px solid #f59e0b;"><div class="stat-icon" style="color:#f59e0b;"><i class="fas fa-calendar-alt"></i></div><div class="stat-label">مەسرەفی ئەم مانگە</div><div class="stat-value" style="color:#f59e0b;">' + fmt(monthTotal) + '</div><div class="stat-hint">' + thisMonthStr + '</div></div>';
  statsHtml += '<div class="stat-card danger" style="border-right:4px solid #dc2626;"><div class="stat-icon" style="color:#dc2626;"><i class="fas fa-money-bill-wave"></i></div><div class="stat-label">کۆی گشتی مەسرەفەکان</div><div class="stat-value" style="color:#dc2626;">' + fmt(allTimeTotal) + '</div><div class="stat-hint">تەواوی مێژوو</div></div>';
  statsHtml += '<div class="stat-card info" style="border-right:4px solid #38bdf8;"><div class="stat-icon" style="color:#38bdf8;"><i class="fas fa-receipt"></i></div><div class="stat-label">ژمارەی خەرجییەکان</div><div class="stat-value">' + expenses.length + '</div><div class="stat-hint">پسوڵە تۆمارکراوەکان</div></div>';
  
  var expenseStats = $("#expenseStats");
  if (expenseStats) expenseStats.innerHTML = statsHtml;

  // Filter list
  var filtered = expenses.slice().reverse();
  var filter = window.CURRENT_EXPENSE_FILTER || 'today';

  if (filter === 'today') {
    filtered = filtered.filter(function (e) { return e.date && e.date.startsWith(todayStr); });
  } else if (filter === 'week') {
    var weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(function (e) { return e.date && new Date(e.date) >= weekAgo; });
  } else if (filter === 'month') {
    filtered = filtered.filter(function (e) { return e.date && e.date.startsWith(thisMonthStr); });
  }

  var catFilter = $("#expenseCategoryFilter") ? $("#expenseCategoryFilter").value : "all";
  if (catFilter && catFilter !== "all") {
    filtered = filtered.filter(function (e) { return (e.category || e.type) === catFilter; });
  }
  
  var tbody = $("#expensesTableBody");
  if (tbody) {
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);font-weight:700;"><i class="fas fa-info-circle" style="margin-left:6px;"></i>هیچ مەسرەفێک لەم ماوەیەدا تۆمار نەکراوە</td></tr>';
    } else {
      tbody.innerHTML = filtered.map(function (e, i) {
        var catInfo = getExpenseCategoryInfo(e.category || e.type);
        var dateStr = e.date ? e.date.replace("T", " ").slice(0, 16) : "-";
        var sourceBadge = (e.paidFrom === 'drawer')
          ? '<span style="background:rgba(245,158,11,0.15);color:#f59e0b;padding:3px 8px;border-radius:6px;font-size:0.75rem;font-weight:700;"><i class="fas fa-cash-register"></i> سندوق</span>'
          : '<span style="background:rgba(56,189,248,0.15);color:#38bdf8;padding:3px 8px;border-radius:6px;font-size:0.75rem;font-weight:700;"><i class="fas fa-wallet"></i> دەرەوە</span>';

        return '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td><small style="color:var(--text-muted);">' + dateStr + '</small></td>' +
          '<td><span style="display:inline-flex;align-items:center;gap:6px;font-weight:700;color:' + catInfo.color + ';"><i class="fas ' + catInfo.icon + '"></i> ' + (e.categoryName || catInfo.name) + '</span></td>' +
          '<td>' + (e.description || "-") + '</td>' +
          '<td>' + sourceBadge + '</td>' +
          '<td style="color:#ef4444;font-weight:800;font-size:0.95rem;">' + fmt(e.amount || 0) + '</td>' +
          '<td><small>' + (e.addedBy || e.paidBy || "کاشیر") + '</small></td>' +
          '<td style="text-align:center;"><button type="button" class="btn btn-sm btn-danger" onclick="deleteExpense(\'' + e.id + '\')" title="سڕینەوە"><i class="fas fa-trash-alt"></i></button></td>' +
        '</tr>';
      }).join("");
    }
  }
}

// Suppliers
function renderSuppliers() {
  if (typeof SuppliersManager !== "undefined") {
    SuppliersManager.render();
    return;
  }
  var suppliers = DB.suppliers || [];
  
  var statsHtml = '<div class="stat-card accent"><div class="stat-icon"><i class="fas fa-truck"></i></div><div class="stat-label">گشتی دابینکەر</div><div class="stat-value">' + suppliers.length + '</div></div>';
  
  var supplierStats = $("#supplierStats");
  if (supplierStats) supplierStats.innerHTML = statsHtml;
  
  var tbody = $("#suppliersTableBody");
  if (tbody) {
    if (suppliers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-muted);">هیچ دابینکەرێک نییە</td></tr>';
    } else {
      tbody.innerHTML = suppliers.map(function (s, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + (s.name || "-") + '</td><td>' + (s.phone || "-") + '</td><td>' + (s.email || "-") + '</td><td>' + (s.address || "-") + '</td><td>' + fmt(s.credit || 0) + '</td><td><button class="btn btn-sm btn-outline" onclick="editSupplier(\'' + s.id + '\')">دەستکاری</button> <button class="btn btn-sm btn-danger" onclick="deleteSupplier(\'' + s.id + '\')">سڕینەوە</button></td></tr>';
      }).join("");
    }
  }
}

// Purchases & Stock Restock Page
function renderPurchases() {
  var purchases = DB.purchases || [];
  var totalPurchasesVal = purchases.reduce(function (s, p) { return s + (parseFloat(p.total) || 0); }, 0);
  var totalDebtVal = purchases.reduce(function (s, p) {
    var tot = parseFloat(p.total) || 0;
    var paid = p.paid !== undefined ? (parseFloat(p.paid) || 0) : (p.paymentType === 'debt' ? 0 : tot);
    var debtAmt = p.debtAmount !== undefined ? (parseFloat(p.debtAmount) || 0) : Math.max(0, tot - paid);
    return s + debtAmt;
  }, 0);
  var totalPaidVal = Math.max(0, totalPurchasesVal - totalDebtVal);
  var totalRestockedPieces = purchases.reduce(function (s, p) {
    var items = Array.isArray(p.items) ? p.items : [];
    return s + items.reduce(function (is, it) { return is + (parseFloat(it.addedPieces || it.qty) || 0); }, 0);
  }, 0);

  var statsHtml = '<div class="stat-card accent"><div class="stat-icon"><i class="fas fa-file-invoice"></i></div><div class="stat-label">ژمارەی وەسڵەکانی کڕین</div><div class="stat-value">' + purchases.length + '</div></div>';
  statsHtml += '<div class="stat-card info"><div class="stat-icon"><i class="fas fa-shopping-bag"></i></div><div class="stat-label">کۆی گشتی بەهای کڕین</div><div class="stat-value">' + fmt(totalPurchasesVal) + '</div></div>';
  statsHtml += '<div class="stat-card success"><div class="stat-icon"><i class="fas fa-check-circle"></i></div><div class="stat-label">کۆی پارەی دراو (نەقد)</div><div class="stat-value" style="color:#10b981;">' + fmt(totalPaidVal) + '</div></div>';
  statsHtml += '<div class="stat-card warning"><div class="stat-icon"><i class="fas fa-hand-holding-usd"></i></div><div class="stat-label">کڕین بە قەرز (' + totalRestockedPieces + ' دانە زیادکراو)</div><div class="stat-value" style="color:#ef4444;">' + fmt(totalDebtVal) + '</div></div>';
  
  var purchaseStats = $("#purchaseStats");
  if (purchaseStats) purchaseStats.innerHTML = statsHtml;
  
  var tbody = $("#purchasesTableBody");
  if (!tbody) return;

  var q = ($("#purchaseSearchInput") ? $("#purchaseSearchInput").value : "").trim().toLowerCase();
  var payFilter = $("#purchasePayFilter") ? $("#purchasePayFilter").value : "all";

  var filtered = purchases.filter(function (p) {
    if (payFilter !== "all" && (p.paymentType || "cash") !== payFilter) return false;
    if (q) {
      var invMatch = p.invoiceNumber && p.invoiceNumber.toLowerCase().includes(q);
      var suppMatch = p.supplierName && p.supplierName.toLowerCase().includes(q);
      var items = Array.isArray(p.items) ? p.items : [];
      var itemMatch = items.some(function (it) { return it.name && it.name.toLowerCase().includes(q); });
      if (!invMatch && !suppMatch && !itemMatch) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted);font-weight:700;">هیچ وەسڵێکی کڕین نەدۆزرایەوە</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function (p, i) {
        var dateStr = p.date ? p.date.replace("T", " ").slice(0, 16) : "-";
    var tot = parseFloat(p.total) || 0;
    var pType = p.paymentType || "cash";
    var paid = p.paid !== undefined ? (parseFloat(p.paid) || 0) : (pType === "debt" ? 0 : tot);
    var debtAmt = p.debtAmount !== undefined ? (parseFloat(p.debtAmount) || 0) : Math.max(0, tot - paid);
    var items = Array.isArray(p.items) ? p.items : [];
    var totalPieces = items.reduce(function (s, it) { return s + (parseFloat(it.addedPieces || it.qty) || 0); }, 0);

    var itemsSummary = items.length > 0
      ? '<span style="color:#38bdf8;font-weight:700;"><i class="fas fa-boxes"></i> ' + items.length + ' جۆر کاڵا (+' + totalPieces + ' دانە)</span>'
      : '<span style="color:var(--text-muted);font-size:0.82rem;">وەسڵی گشتی</span>';

    var payBadge = pType === "debt"
      ? '<span style="background:rgba(239,68,68,0.15);color:#ef4444;padding:3px 9px;border-radius:12px;font-size:0.75rem;font-weight:800;">قەرز (Credit)</span>'
      : (pType === "partial"
        ? '<span style="background:rgba(245,158,11,0.15);color:#f59e0b;padding:3px 9px;border-radius:12px;font-size:0.75rem;font-weight:800;">بەشێکی دراوە</span>'
        : (pType === "bank"
          ? '<span style="background:rgba(56,189,248,0.15);color:#38bdf8;padding:3px 9px;border-radius:12px;font-size:0.75rem;font-weight:800;">حەواڵە / بانک</span>'
          : '<span style="background:rgba(16,185,129,0.15);color:#10b981;padding:3px 9px;border-radius:12px;font-size:0.75rem;font-weight:800;">نەقد / کاش</span>'));

    var paidAndDebtCol = debtAmt > 0
      ? '<div><small style="color:#10b981;">دراوە: ' + fmt(paid) + '</small><br><strong style="color:#ef4444;">قەرز: ' + fmt(debtAmt) + '</strong></div>'
      : '<span style="color:#10b981;font-weight:700;">تەواو دراوە (' + fmt(paid) + ')</span>';

    return '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td><strong style="font-family:monospace;">' + (p.invoiceNumber || p.id.slice(-8)) + '</strong></td>' +
      '<td><small style="color:var(--text-muted);">' + dateStr + '</small></td>' +
      '<td><strong>' + (p.supplierName || "-") + '</strong></td>' +
      '<td>' + itemsSummary + '</td>' +
      '<td style="font-weight:900;color:var(--text-bright);">' + fmt(tot) + '</td>' +
      '<td>' + paidAndDebtCol + '</td>' +
      '<td>' + payBadge + '</td>' +
      '<td>' +
        '<div style="display:flex;gap:6px;">' +
          '<button type="button" class="btn btn-sm btn-outline" onclick="viewPurchase(\'' + p.id + '\')" title="بینین و چاپی وەسڵ"><i class="fas fa-eye"></i> بینین</button>' +
          '<button type="button" class="btn btn-sm btn-danger" onclick="deletePurchase(\'' + p.id + '\')" title="سڕینەوە"><i class="fas fa-trash"></i></button>' +
        '</div>' +
      '</td>' +
    '</tr>';
      }).join("");
}

// Initialize data structures if they don't exist
if (!DB.expenses) DB.expenses = [];
if (!DB.suppliers) DB.suppliers = [];
if (!DB.purchases) DB.purchases = [];
if (!DB.customers) DB.customers = [];

// ══════════════════════════════════════
// CUSTOMERS MANAGEMENT
// ══════════════════════════════════════

var CUSTOMER_SEARCH_QUERY = "";
var CUSTOMER_FILTER = "all";

function renderCustomers() {
  collapseDuplicateCustomersLocal();
  var customers = DB.customers || [];
  var totalCustomers = customers.length;
  var totalDebt = customers.reduce(function (s, c) { return s + (parseFloat(c.currentDebt) || 0); }, 0);
  var totalPoints = customers.reduce(function (s, c) { return s + (parseFloat(c.loyaltyPoints) || 0); }, 0);
  var activeCustomers = customers.filter(function (c) { return (parseFloat(c.currentDebt) || 0) > 0 || (parseFloat(c.loyaltyPoints) || 0) > 0; }).length;

  var statsHtml = '<div class="stat-card accent"><div class="stat-icon"><i class="fas fa-users"></i></div><div class="stat-label">کۆی کڕیاران</div><div class="stat-value">' + totalCustomers + '</div></div>';
  statsHtml += '<div class="stat-card warning"><div class="stat-icon"><i class="fas fa-hand-holding-usd"></i></div><div class="stat-label">کۆی قەرزی ماوە</div><div class="stat-value">' + fmt(totalDebt) + '</div></div>';
  statsHtml += '<div class="stat-card success"><div class="stat-icon"><i class="fas fa-star"></i></div><div class="stat-label">کۆی خاڵەکانی پاداشت</div><div class="stat-value">' + Number(totalPoints).toLocaleString() + '</div></div>';
  statsHtml += '<div class="stat-card info"><div class="stat-icon"><i class="fas fa-user-check"></i></div><div class="stat-label">کڕیارانی چالاک</div><div class="stat-value">' + activeCustomers + '</div></div>';

  var statsEl = $("#customersStats");
  if (statsEl) statsEl.innerHTML = statsHtml;

  var filtered = customers.filter(function (c) {
    var q = CUSTOMER_SEARCH_QUERY.toLowerCase();
    var matchSearch = !q || (c.name && c.name.toLowerCase().includes(q)) || (c.phone && c.phone.includes(q)) || (c.address && c.address.toLowerCase().includes(q));
    if (!matchSearch) return false;
    if (CUSTOMER_FILTER === "hasDebt") return (parseFloat(c.currentDebt) || 0) > 0;
    if (CUSTOMER_FILTER === "hasPoints") return (parseFloat(c.loyaltyPoints) || 0) > 0;
    return true;
  });

  var tbody = $("#customersTableBody");
  if (!tbody) return;
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text-muted);font-weight:600;"><i class="fas fa-user-slash" style="font-size:1.8rem;display:block;margin-bottom:8px;opacity:0.4;"></i>هیچ کڕیارێک نەدۆزرایەوە</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function (c, i) {
    var debt = parseFloat(c.currentDebt) || 0;
    var debtLimit = getCustomerDebtLimit(c);
    var unlimitedCap = isDebtUnlimited(debtLimit);
    var atCap = !unlimitedCap && debt >= debtLimit;
    var remainingBuy = unlimitedCap ? Infinity : Math.max(0, debtLimit - debt);
    var debtBadge = debt > 0
      ? '<span style="color:' + (atCap ? '#ef4444' : 'var(--danger)') + ';font-weight:800;background:rgba(239,68,68,0.12);padding:3px 8px;border-radius:6px;">' + fmt(debt) + (atCap ? ' · سنوور تەواو' : '') + '</span>'
      : '<span style="color:var(--success);font-weight:600;">0 د.ع</span>';
    var remainBadge = unlimitedCap
      ? '<span style="color:#10b981;font-weight:800;">بێ سنوور</span>'
      : (atCap
        ? '<span style="color:#ef4444;font-weight:800;">0 د.ع</span>'
        : '<span style="color:#10b981;font-weight:800;">' + fmt(remainingBuy) + '</span>');

    var pointsBadge = (parseFloat(c.loyaltyPoints) || 0) > 0
      ? '<span style="color:#f59e0b;font-weight:700;"><i class="fas fa-star"></i> ' + Number(c.loyaltyPoints).toLocaleString() + '</span>'
      : '<span style="color:var(--text-muted);">-</span>';

    return '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td><strong>' + (c.name || "-") + '</strong></td>' +
      '<td>' + (c.phone ? '<a href="tel:' + c.phone + '" style="color:inherit;text-decoration:none;"><i class="fas fa-phone-alt" style="font-size:0.75rem;color:var(--primary);margin-left:4px;"></i>' + c.phone + '</a>' : '-') + '</td>' +
      '<td>' + (c.address || "-") + '</td>' +
      '<td>' + formatDebtLimit(debtLimit) + '</td>' +
      '<td>' + remainBadge + '</td>' +
      '<td>' + debtBadge + '</td>' +
      '<td>' + pointsBadge + '</td>' +
      '<td><span style="font-size:0.85rem;color:var(--text-muted);">' + (c.notes || "-") + '</span></td>' +
      '<td>' +
        (debt > 0 ? '<button class="btn btn-sm btn-warning" style="margin-left:4px;font-weight:700;" onclick="openCustomerDebtsFromCustomersPage(\'' + (c.name || '').replace(/'/g, "\\'") + '\')" title="وەرگرتنەوەی قەرز"><i class="fas fa-hand-holding-usd"></i> قەرز</button> ' : '') +
        (debt > 0 ? '<button class="btn btn-sm" style="margin-left:4px;background:#25d366;border:none;color:#052e16;font-weight:800;" onclick="sendCustomerDebtWhatsApp(\'' + c.id + '\')" title="داوای قەرز بە واتسئاپ"><i class="fab fa-whatsapp"></i></button> ' : '') +
        '<button class="btn btn-sm btn-outline" onclick="editCustomer(\'' + c.id + '\')" title="دەستکاری"><i class="fas fa-edit"></i></button> ' +
        '<button class="btn btn-sm btn-danger" onclick="deleteCustomer(\'' + c.id + '\')" title="سڕینەوە"><i class="fas fa-trash"></i></button>' +
      '</td>' +
    '</tr>';
  }).join("");
}

function openCustomerModal(id) {
  var cust = id ? (DB.customers || []).find(function (c) { return c.id === id; }) : null;
  $("#custEditId").value = cust ? cust.id : "";
  $("#custName").value = cust ? cust.name : "";
  $("#custPhone").value = cust ? (cust.phone || "") : "";
  $("#custAddress").value = cust ? (cust.address || "") : "";
  var ownUnlimited = customerWantsUnlimitedDebt(cust);
  var shownLimit = ownUnlimited ? 0 : (cust ? getCustomerDebtLimit(cust) : getGlobalDebtLimit());
  var limitInp = $("#custDebtLimit");
  if (limitInp) limitInp.value = ownUnlimited ? "" : (shownLimit || "");
  var unlCb = document.getElementById("custDebtUnlimited");
  if (unlCb) unlCb.checked = !!(ownUnlimited || isDebtUnlimited(shownLimit));
  var debtNowEl = $("#custCurrentDebt");
  if (debtNowEl) debtNowEl.value = cust ? getCustomerCurrentDebt(cust, cust.name, cust.phone) : 0;
  $("#custNotes").value = cust ? (cust.notes || "") : "";
  $("#customerModalTitle").innerHTML = cust ? '<i class="fas fa-user-edit"></i> دەستکاری کڕیار' : '<i class="fas fa-user-plus"></i> کڕیاری نوێ';
  showModal("customerModal");
  toggleCustDebtUnlimited();
  updateCustDebtLimitHint();
  setTimeout(function () { $("#custName").focus(); }, 100);
}

function toggleCustDebtUnlimited() {
  var cb = document.getElementById("custDebtUnlimited");
  var inp = document.getElementById("custDebtLimit");
  var on = !!(cb && cb.checked);
  if (inp) {
    inp.disabled = on;
    inp.style.opacity = on ? "0.45" : "1";
  }
  updateCustDebtLimitHint();
}

function setCustDebtLimitPreset(n) {
  var cb = document.getElementById("custDebtUnlimited");
  var inp = document.getElementById("custDebtLimit");
  if (n === 0 || n === "unlimited") {
    if (cb) cb.checked = true;
    if (inp) inp.value = "";
  } else {
    if (cb) cb.checked = false;
    if (inp) inp.value = Math.max(0, Number(n) || 0);
  }
  toggleCustDebtUnlimited();
}

function updateCustDebtLimitHint() {
  var hint = document.getElementById("custDebtLimitHint");
  if (!hint) return;
  var cb = document.getElementById("custDebtUnlimited");
  var unlimited = !!(cb && cb.checked);
  var inp = document.getElementById("custDebtLimit");
  var limit = unlimited ? 0 : (parseFloat(inp && inp.value) || 0);
  var id = $("#custEditId") ? $("#custEditId").value : "";
  var cust = id ? (DB.customers || []).find(function (c) { return c.id === id; }) : null;
  var current = cust ? getCustomerCurrentDebt(cust, cust.name, cust.phone) : 0;
  if (unlimited || isDebtUnlimited(limit)) {
    hint.innerHTML = 'سنوور: <strong style="color:#10b981;">بێ سنوور</strong> — دەتوانیت هەر بڕێک دابنێیت، یان بیکەیتە بێ سنوور' +
      (current > 0 ? ' (قەرزی ئێستا ' + fmt(current) + ')' : '');
    return;
  }
  var remain = Math.max(0, limit - current);
  hint.innerHTML = 'سنووری ئەم کڕیارە: <strong>' + fmt(limit) + '</strong> — ئێستا دەتوانێت هێشتا <strong style="color:#10b981;">' + fmt(remain) + '</strong> قەرز بکات' +
    (current > 0 ? ' (قەرزی ئێستا ' + fmt(current) + ')' : '');
}
window.setCustDebtLimitPreset = setCustDebtLimitPreset;
window.updateCustDebtLimitHint = updateCustDebtLimitHint;
window.toggleCustDebtUnlimited = toggleCustDebtUnlimited;

function editCustomer(id) {
  openCustomerModal(id);
}

function saveCustomer() {
  var id = $("#custEditId").value.trim();
  var name = $("#custName").value.trim();
  var phone = $("#custPhone").value.trim();
  var address = $("#custAddress").value.trim();
  var unlimitedDebt = !!(document.getElementById("custDebtUnlimited") && document.getElementById("custDebtUnlimited").checked);
  var debtLimit = unlimitedDebt ? 0 : Math.max(0, parseFloat($("#custDebtLimit") && $("#custDebtLimit").value) || 0);
  var notes = $("#custNotes").value.trim();
  var currentDebtVal = 0;
  var debtNowInp = $("#custCurrentDebt");
  if (debtNowInp) currentDebtVal = Math.max(0, parseFloat(debtNowInp.value) || 0);

  if (!name) {
    toast("هەڵە", "تکایە ناوی کڕیار بنووسە", "error");
    $("#custName").focus();
    return;
  }

  if (!DB.customers) DB.customers = [];

  var existing = id ? DB.customers.find(function (c) { return c.id === id; }) : null;
  if (existing) {
    existing.name = name;
    existing.phone = phone;
    existing.address = address;
    existing.debtLimit = debtLimit;
    existing.debtUnlimited = unlimitedDebt;
    existing.notes = notes;
    applyManualCustomerDebtTotal(existing, currentDebtVal);
    if (typeof ApiClient !== "undefined" && ApiClient.isOnline) {
      fetch('/api/customers/' + existing.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(existing)
      }).catch(function (e) { console.warn("API sync customer edit failed", e); });
    }
  } else {
    var newCust = {
      id: "cust_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      name: name,
      phone: phone,
      address: address,
      debtLimit: debtLimit,
      debtUnlimited: unlimitedDebt,
      currentDebt: 0,
      loyaltyPoints: 0,
      notes: notes,
      createdAt: new Date().toISOString()
    };
    DB.customers.unshift(newCust);
    if (currentDebtVal > 0) {
      createManualLedgerDebt({
        customerId: newCust.id,
        name: newCust.name,
        phone: newCust.phone,
        amount: currentDebtVal,
        paid: 0,
        note: notes || "قەرزی سەرەتا"
      });
    }
    if (typeof ApiClient !== "undefined" && ApiClient.isOnline) {
      fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCust)
      }).catch(function (e) { console.warn("API sync customer add failed", e); });
    }
  }

  if (typeof DataStore !== "undefined" && DataStore.saveCustomers) {
    DataStore.saveCustomers();
  }
  hideModal("customerModal");
  renderCustomers();
  try { renderDebtPage(); } catch (eDebtAfterCust) {}
  toast("سەرکەوتوو", "زانیاری کڕیار پاشکەوت کرا", "success");
}

function deleteCustomer(id) {
  var cust = (DB.customers || []).find(function (c) { return c.id === id; });
  if (!cust) return;
  if (cust.currentDebt > 0) {
    toast("ئاگاداری", "ناتوانیت کڕیار بسڕیتەوە لە کاتێکدا قەرزی ماوە (" + fmt(cust.currentDebt) + ")", "warning");
    return;
  }
  if (!confirm("ئایا دڵنیایت لە سڕینەوەی کڕیار: " + cust.name + "؟")) return;
  DB.customers = DB.customers.filter(function (c) { return c.id !== id; });
  if (typeof DataStore !== "undefined" && DataStore.saveCustomers) {
    DataStore.saveCustomers();
  }
  if (typeof ApiClient !== "undefined" && ApiClient.isOnline) {
    fetch('/api/customers/' + id, { method: 'DELETE' }).catch(function (e) { console.warn("Customer delete API sync", e); });
  }
  renderCustomers();
  toast("سەرکەوتوو", "کڕیار سڕایەوە", "success");
}

function exportCustomers() {
  var customers = DB.customers || [];
  if (customers.length === 0) {
    toast("ئاگاداری", "هیچ داتایەک نییە بۆ هەناردەکردن", "warning");
    return;
  }
  var csv = "\uFEFF#,ناوی کڕیار,مۆبایل,ناونیشان,سنوری قەرز,قەرزی ئێستا,خاڵی پاداشت,تێبینی\n";
  customers.forEach(function (c, i) {
    csv += (i + 1) + ',"' + (c.name || "").replace(/"/g, '""') + '","' + (c.phone || "") + '","' + (c.address || "").replace(/"/g, '""') + '",' + (c.debtLimit || 0) + ',' + (c.currentDebt || 0) + ',' + (c.loyaltyPoints || 0) + ',"' + (c.notes || "").replace(/"/g, '""') + '"\n';
  });
  var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "customers_" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  toast("سەرکەوتوو", "لیستی کڕیاران هەناردە کرا", "success");
}

// ══════════════════════════════════════
// ORDERS / SALES HISTORY
// ══════════════════════════════════════

var ORDERS_SEARCH_QUERY = "";
var ORDERS_PERIOD = "today";
var ORDERS_PAYMENT_FILTER = "all";
var ORDERS_RECEIPT_FILTER = "all";
var ORDERS_CASHIER_FILTER = "all";
var ORDERS_DATE_FROM = "";
var ORDERS_DATE_TO = "";

function isOrderPrinted(o) {
  if (!o) return false;
  if (o.printed === false || o.printed === 0 || o.printed === "0" || o.noPrint === true) return false;
  if (o.printed === true || o.printed === 1) return true;
  return true;
}

function orderCustomerName(o) {
  return String((o && (o.customerName || o.customer)) || "").trim();
}

function orderPayKind(o) {
  if (!o) return "cash";
  if (o.paidCurrency === "USD" || o.paymentMethod === "usd_cash") return "usd";
  var raw = String(o.paymentMethod || o.payType || o.method || o.payment_type || "").toLowerCase().trim();
  if (raw === "card" || raw === "visa" || raw === "mastercard" || raw === "credit_card" ||
      raw.indexOf("card") >= 0 || raw.indexOf("کارت") >= 0) return "card";
  if (raw === "debt" || raw === "credit" || raw === "loan" || raw.indexOf("قەرز") >= 0 || raw.indexOf("قرز") >= 0) return "debt";
  if (raw === "usd" || raw === "usd_cash" || raw.indexOf("دۆلار") >= 0) return "usd";
  return "cash";
}

function orderPayLabel(o) {
  var kind = orderPayKind(o);
  if (kind === "usd") return "دۆلار (USD)";
  if (kind === "card") return "کارت (Card)";
  if (kind === "debt") return "قەرز (Debt)";
  return "نقد (Cash)";
}

function orderProfitOf(o) {
  if (!o) return 0;
  if (o.profit !== undefined && o.profit !== null && o.profit !== "") return Number(o.profit) || 0;
  return (Number(o.total) || 0) - (Number(o.totalCost) || 0);
}

function orderItemQty(o) {
  return (o && o.items || []).reduce(function (s, it) { return s + (Number(it.qty) || 1); }, 0);
}

function orderItemTypes(o) {
  return (o && o.items || []).length;
}

function syncOrdersDateRangeUi() {
  var wrap = $("#ordersDateRange");
  if (!wrap) return;
  wrap.classList.toggle("is-on", ORDERS_PERIOD === "custom");
  var fromEl = $("#ordersDateFrom");
  var toEl = $("#ordersDateTo");
  if (fromEl && !fromEl.value) fromEl.value = ORDERS_DATE_FROM || localYmd(new Date());
  if (toEl && !toEl.value) toEl.value = ORDERS_DATE_TO || localYmd(new Date());
  if (ORDERS_PERIOD === "custom") {
    ORDERS_DATE_FROM = fromEl ? fromEl.value : ORDERS_DATE_FROM;
    ORDERS_DATE_TO = toEl ? toEl.value : ORDERS_DATE_TO;
  }
}

function fillOrdersCashierFilter(allOrders) {
  var sel = $("#ordersCashierFilter");
  if (!sel) return;
  var names = {};
  (allOrders || []).forEach(function (o) {
    var n = String(o.cashier || "").trim();
    if (n) names[n] = true;
  });
  var html = '<option value="all">هەموو کاشێرەکان</option>';
  Object.keys(names).sort().forEach(function (n) {
    html += '<option value="' + n.replace(/"/g, "&quot;") + '"' + (ORDERS_CASHIER_FILTER === n ? " selected" : "") + ">" + n + "</option>";
  });
  sel.innerHTML = html;
}

function setOrdersReceiptFilter(v) {
  ORDERS_RECEIPT_FILTER = (ORDERS_RECEIPT_FILTER === v) ? "all" : v;
  var el = $("#ordersReceiptFilter");
  if (el) el.value = ORDERS_RECEIPT_FILTER;
  renderOrders();
}
window.setOrdersReceiptFilter = setOrdersReceiptFilter;

function setOrdersPaymentFilter(v) {
  ORDERS_PAYMENT_FILTER = (ORDERS_PAYMENT_FILTER === v) ? "all" : v;
  var el = $("#ordersPaymentFilter");
  if (el) el.value = ORDERS_PAYMENT_FILTER;
  renderOrders();
}
window.setOrdersPaymentFilter = setOrdersPaymentFilter;

function renderOrders() {
  var orders = incomeOrders(branchRecords(DB.orders || []));
  var now = new Date();
  var todayStr = localYmd(now);

  var yDate = new Date();
  yDate.setDate(now.getDate() - 1);
  var yesterdayStr = localYmd(yDate);

  var weekAgo = new Date();
  weekAgo.setDate(now.getDate() - 7);

  var monthAgo = new Date();
  monthAgo.setDate(now.getDate() - 30);

  fillOrdersCashierFilter(orders);
  syncOrdersDateRangeUi();
  var paySel = $("#ordersPaymentFilter");
  if (paySel) paySel.value = ORDERS_PAYMENT_FILTER || "all";
  var recSel = $("#ordersReceiptFilter");
  if (recSel) recSel.value = ORDERS_RECEIPT_FILTER || "all";
  var perSel = $("#ordersPeriodFilter");
  if (perSel && ORDERS_PERIOD) perSel.value = ORDERS_PERIOD;

  var filtered = orders.filter(function (o) {
    var oDate = o.date || "";
    var oLocalDay = localYmd(oDate);
    if (ORDERS_PERIOD === "today") {
      if (oLocalDay !== todayStr) return false;
    } else if (ORDERS_PERIOD === "yesterday") {
      if (oLocalDay !== yesterdayStr) return false;
    } else if (ORDERS_PERIOD === "week") {
      if (new Date(oDate) < weekAgo) return false;
    } else if (ORDERS_PERIOD === "month") {
      if (new Date(oDate) < monthAgo) return false;
    } else if (ORDERS_PERIOD === "custom") {
      if (ORDERS_DATE_FROM && oLocalDay < ORDERS_DATE_FROM) return false;
      if (ORDERS_DATE_TO && oLocalDay > ORDERS_DATE_TO) return false;
    }

    if (ORDERS_CASHIER_FILTER !== "all" && String(o.cashier || "").trim() !== ORDERS_CASHIER_FILTER) return false;

    if (ORDERS_PAYMENT_FILTER !== "all" && orderPayKind(o) !== ORDERS_PAYMENT_FILTER) return false;
    if (ORDERS_RECEIPT_FILTER === "printed" && !isOrderPrinted(o)) return false;
    if (ORDERS_RECEIPT_FILTER === "noprint" && isOrderPrinted(o)) return false;

    if (ORDERS_SEARCH_QUERY) {
      var q = ORDERS_SEARCH_QUERY.toLowerCase();
      var qDigits = String(ORDERS_SEARCH_QUERY).replace(/\D/g, "");
      var bill = orderBillNo(o);
      var billCode = orderBillBarcode(o).toLowerCase();
      var cust = orderCustomerName(o).toLowerCase();
      var matchId = o.id && String(o.id).toLowerCase().includes(q);
      var matchBill = false;
      if (bill) {
        if (q === bill.toLowerCase() || q === billCode) matchBill = true;
        else if (qDigits && bill.indexOf(qDigits) >= 0) matchBill = true;
      }
      var matchCust = cust.indexOf(q) >= 0;
      var matchCashier = o.cashier && String(o.cashier).toLowerCase().includes(q);
      var matchProd = (o.items || []).some(function (it) {
        return String(it.name || "").toLowerCase().indexOf(q) >= 0;
      });
      if (!matchId && !matchBill && !matchCust && !matchCashier && !matchProd) return false;
    }

    return true;
  });

  var totalSales = filtered.reduce(function (s, o) { return s + (o.total || 0); }, 0);
  var totalItems = filtered.reduce(function (s, o) { return s + orderItemQty(o); }, 0);
  var totalProfit = filtered.reduce(function (s, o) { return s + orderProfitOf(o); }, 0);
  var totalDiscount = filtered.reduce(function (s, o) { return s + (Number(o.discount) || 0); }, 0);
  var printedList = filtered.filter(isOrderPrinted);
  var noPrintList = filtered.filter(function (o) { return !isOrderPrinted(o); });
  var printedCount = printedList.length;
  var noPrintCount = noPrintList.length;
  var printedSales = printedList.reduce(function (s, o) { return s + (o.total || 0); }, 0);
  var noPrintSales = noPrintList.reduce(function (s, o) { return s + (o.total || 0); }, 0);
  var payMoney = { cash: 0, card: 0, debt: 0, usd: 0 };
  var payCount = { cash: 0, card: 0, debt: 0, usd: 0 };
  filtered.forEach(function (o) {
    var k = orderPayKind(o);
    payMoney[k] = (payMoney[k] || 0) + (o.total || 0);
    payCount[k] = (payCount[k] || 0) + 1;
  });
  var avgSale = filtered.length ? totalSales / filtered.length : 0;

  var isManager = DB.currentUser && (typeof AuthService !== "undefined" && AuthService.isOwnerRole ? AuthService.isOwnerRole(DB.currentUser.role) : true);

  function ordersCard(cls, icon, label, value, hint, clickFn) {
    var extra = clickFn ? ' clickable" onclick="' + clickFn + '"' : '"';
    return '<div class="stat-card ' + cls + extra + ">" +
      '<div class="stat-icon"><i class="fas ' + icon + '"></i></div>' +
      '<div class="stat-label">' + label + "</div>" +
      '<div class="stat-value">' + value + "</div>" +
      (hint ? '<div class="stat-hint">' + hint + "</div>" : "") +
      "</div>";
  }

  var statsHtml = "";
  statsHtml += ordersCard("accent", "fa-receipt", "ژمارەی فرۆشتن", String(filtered.length), "وەسڵ — بە پسوڵە و بێ پسوڵە");
  if (isManager) {
    statsHtml += ordersCard("success", "fa-coins", "کۆی پارەی فرۆشتن", fmt(totalSales), "دینار — هەموو فرۆشتنەکان، نەک تەنها پسوڵە");
  }
  statsHtml += ordersCard("warning", "fa-boxes", "کۆی دانەی کاڵا", totalItems.toLocaleString(), "دانە — ژمارەی کاڵا، نەک پارە");
  statsHtml += ordersCard("info", "fa-print", "بە پسوڵە / چاپکراو", String(printedCount), isManager ? fmt(printedSales) : "وەسڵی چاپکراو", "setOrdersReceiptFilter('printed')");
  statsHtml += ordersCard("danger", "fa-ban", "بێ پسوڵە / بێ چاپ", String(noPrintCount), isManager ? fmt(noPrintSales) : "فرۆشتن بەبێ چاپ", "setOrdersReceiptFilter('noprint')");
  if (isManager) {
    statsHtml += ordersCard("profit", "fa-chart-line", "کۆی قازانج", fmt(totalProfit), "قازانجی کاڵا لەم لیستە");
    statsHtml += ordersCard("success", "fa-money-bill-wave", "نەقد", fmt(payMoney.cash), payCount.cash + " فرۆشتن · ناوەند: " + fmt(avgSale), "setOrdersPaymentFilter('cash')");
    statsHtml += ordersCard("info", "fa-credit-card", "کارت", fmt(payMoney.card), payCount.card + " فرۆشتن", "setOrdersPaymentFilter('card')");
    statsHtml += ordersCard("warning", "fa-hand-holding-dollar", "قەرز", fmt(payMoney.debt), payCount.debt + " فرۆشتن", "setOrdersPaymentFilter('debt')");
    if (payCount.usd) {
      statsHtml += ordersCard("success", "fa-dollar-sign", "دۆلار", fmt(payMoney.usd), payCount.usd + " فرۆشتن", "setOrdersPaymentFilter('usd')");
    }
    if (totalDiscount > 0) {
      statsHtml += ordersCard("danger", "fa-percent", "کۆی داشکاندن", fmt(totalDiscount), "داشکاندنی دراو لەم ماوەیە");
    }
  } else {
    statsHtml += ordersCard("success", "fa-money-bill-wave", "فرۆشتنی نەقد", String(payCount.cash), "ژمارەی وەسڵی نەقد", "setOrdersPaymentFilter('cash')");
    statsHtml += ordersCard("info", "fa-credit-card", "فرۆشتنی کارت", String(payCount.card), "ژمارەی وەسڵی کارت", "setOrdersPaymentFilter('card')");
  }

  var statsEl = $("#ordersStats");
  if (statsEl) statsEl.innerHTML = statsHtml;

  var tbody = $("#ordersTableBody");
  if (!tbody) return;

  if (filtered.length === 0) {
    window.LAST_FILTERED_ORDERS = [];
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--text-muted);font-weight:600;"><i class="fas fa-search" style="font-size:1.8rem;display:block;margin-bottom:8px;opacity:0.4;"></i>هیچ داواکارییەک لەم ماوەیەدا نەدۆزرایەوە</td></tr>';
    return;
  }

  window.LAST_FILTERED_ORDERS = filtered;
  var payColor = { cash: "var(--success)", usd: "#86efac", card: "#3b82f6", debt: "var(--warning)" };

  tbody.innerHTML = filtered.map(function (o) {
    var dateStr = formatSaleDateTime(o.date);
    var kind = orderPayKind(o);
    var payBadge = '<span style="font-weight:700;color:' + (payColor[kind] || "var(--text-muted)") + ';">' + orderPayLabel(o) + '</span>';
    var isCancelled = (o.status === "cancelled" || o.status === "refunded");
    var statusBadge = isCancelled
      ? '<span style="background:rgba(239,68,68,0.15);color:var(--danger);padding:2px 8px;border-radius:4px;font-weight:800;">هەڵوەشاوە</span>'
      : '<span style="background:rgba(16,185,129,0.15);color:var(--success);padding:2px 8px;border-radius:4px;font-weight:700;">سەرکەوتوو</span>';
    var qty = orderItemQty(o);
    var types = orderItemTypes(o);
    var cust = orderCustomerName(o) || "کڕیاری گشتی";
    var profit = orderProfitOf(o);
    var moneyCell = '<strong style="color:var(--success);">' + fmt(o.total || 0) + '</strong>';
    if (isManager) {
      moneyCell += '<div style="font-size:0.72rem;font-weight:700;color:' + (profit >= 0 ? "var(--success)" : "var(--danger)") + ';">قازانج: ' + fmt(profit) + "</div>";
    }

    var billDisp = orderBillNo(o) || "-";
    return '<tr>' +
      '<td><strong class="orders-bill-no" title="کۆپی ژمارەی پسوولە" style="font-family:Consolas,monospace;letter-spacing:1px;user-select:all;cursor:copy;font-size:1.05rem;" onclick="copyOrderBillNo(\'' + billDisp + '\',event)">' + billDisp + '</strong></td>' +
      '<td>' + dateStr + '</td>' +
      '<td>' + (o.cashier || "کاشیر") + '</td>' +
      '<td>' + cust + '</td>' +
      '<td><strong>' + qty + ' دانە</strong><div style="font-size:0.72rem;color:var(--text-muted);">' + types + ' جۆر</div></td>' +
      '<td>' + moneyCell + '</td>' +
      '<td>' + payBadge + '</td>' +
      '<td>' + (isOrderPrinted(o)
        ? '<span style="background:rgba(16,185,129,0.15);color:#10b981;padding:2px 8px;border-radius:6px;font-weight:800;">بە پسوڵە</span>'
        : '<span style="background:rgba(245,158,11,0.18);color:#f59e0b;padding:2px 8px;border-radius:6px;font-weight:800;">بێ پسوڵە</span>') + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' +
        '<button class="btn btn-sm btn-outline" onclick="openOrderDetailModal(\'' + o.id + '\')" title="بینینی پسوولە"><i class="fas fa-eye"></i></button> ' +
        '<button class="btn btn-sm btn-outline" onclick="reprintOrder(\'' + o.id + '\')" title="چاپکردنەوە"><i class="fas fa-print"></i></button> ' +
        '<button class="btn btn-sm btn-outline" style="color:#25d366;border-color:rgba(37,211,102,0.4);" onclick="sendOrderWhatsAppById(\'' + o.id + '\')" title="ناردن بە WhatsApp"><i class="fab fa-whatsapp"></i></button>' +
      '</td>' +
    '</tr>';
  }).join("");
}

function sendOrderWhatsAppById(orderId) {
  try {
    var wanted = String(orderId || "");
    var order = (DB.orders || []).find(function (o) { return String(o.id) === wanted; });
    if (!order) {
      toast("ئاگاداری", "پسوڵەکە نەدۆزرایەوە", "warning");
      return;
    }
    sendOrderWhatsApp(order);
  } catch (err) {
    console.error("sendOrderWhatsAppById", err);
    toast("هەڵە", "ناردنی واتسئاپ سەری نەگرت", "error");
  }
}

function openOrderDetailModal(orderId) {
  var order = (DB.orders || []).find(function (o) { return o.id === orderId; });
  if (!order) return;
  window.SELECTED_ORDER = order;
  var body = $("#orderDetailBody");
  if (!body) return;

  var dateStr = formatSaleDateTime(order.date, true);
  var itemsHtml = (order.items || []).map(function (it, idx) {
    var sub = (it.price || 0) * (it.qty || 1);
    return '<tr>' +
      '<td style="padding:6px 8px;border-bottom:1px solid var(--border-color);">' + (idx + 1) + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid var(--border-color);"><strong>' + (it.name || "کاڵا") + '</strong></td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid var(--border-color);text-align:center;">' + (it.qty || 1) + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid var(--border-color);text-align:right;">' + fmt(it.price || 0) + '</td>' +
      '<td style="padding:6px 8px;border-bottom:1px solid var(--border-color);text-align:right;font-weight:700;">' + fmt(sub) + '</td>' +
    '</tr>';
  }).join("");

  body.innerHTML = '<div style="background:var(--card-bg);padding:14px;border-radius:var(--radius-md);margin-bottom:14px;border:1px solid var(--border-color);">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>ژمارەی پسوولە:</span><strong class="orders-bill-no" style="font-family:Consolas,monospace;letter-spacing:1px;user-select:all;cursor:copy;" onclick="copyOrderBillNo(\'' + (orderBillNo(order) || "") + '\',event)">' + (orderBillNo(order) || order.id) + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>بەروار و کات:</span><span>' + dateStr + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>کاشیر:</span><strong>' + (order.cashier || "کاشیر") + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>کڕیار:</span><span>' + (orderCustomerName(order) || "کڕیاری گشتی") + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>شێوازی پارەدان:</span><strong>' + orderPayLabel(order) + '</strong></div>' +
    '<div style="display:flex;justify-content:space-between;"><span>پسوڵە:</span><strong>' + (isOrderPrinted(order) ? "چاپکراو" : "بێ چاپ") + '</strong></div>' +
  '</div>' +
  '<table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:0.9rem;">' +
    '<thead>' +
      '<tr style="background:var(--bg-secondary);">' +
        '<th style="padding:6px 8px;text-align:right;">#</th>' +
        '<th style="padding:6px 8px;text-align:right;">کاڵا</th>' +
        '<th style="padding:6px 8px;text-align:center;">دانە</th>' +
        '<th style="padding:6px 8px;text-align:right;">نرخ</th>' +
        '<th style="padding:6px 8px;text-align:right;">کۆی نرخ</th>' +
      '</tr>' +
    '</thead>' +
    '<tbody>' + itemsHtml + '</tbody>' +
  '</table>' +
  '<div style="background:var(--bg-secondary);padding:12px;border-radius:var(--radius-md);">' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>کۆی بڕ:</span><span>' + fmt(order.subtotal || order.total || 0) + '</span></div>' +
    (order.discount ? '<div style="display:flex;justify-content:space-between;margin-bottom:4px;color:var(--danger);"><span>داشکاندن:</span><span>-' + fmt(order.discount) + '</span></div>' : '') +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>دانە:</span><span>' + orderItemQty(order) + ' دانە / ' + orderItemTypes(order) + ' جۆر</span></div>' +
    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;color:var(--success);"><span>قازانج:</span><span>' + fmt(orderProfitOf(order)) + '</span></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:1.15rem;font-weight:800;color:var(--success);border-top:1px dashed var(--border-color);padding-top:6px;margin-top:6px;"><span>کۆی پارە:</span><span>' + fmt(order.total || 0) + '</span></div>' +
  '</div>';

  var printBtn = $("#orderDetailPrintBtn");
  if (printBtn) {
    printBtn.onclick = function () {
      reprintOrder(order.id);
    };
  }

  var waBtn = $("#orderDetailWhatsAppBtn");
  if (waBtn) {
    waBtn.onclick = function () {
      sendOrderWhatsApp(order);
    };
  }

  showModal("orderDetailModal");
}

function reprintOrder(orderId) {
  var order = (DB.orders || []).find(function (o) { return o.id === orderId; });
  if (!order) {
    toast("هەڵە", "پسوولە نەدۆزرایەوە", "error");
    return;
  }
  printReceiptDirect(order);
  toast("سەرکەوتوو", "پسوولەی #" + (orderBillNo(order) || order.id) + " نێردرا بۆ چاپکەر", "success");
}

function exportOrders() {
  var orders = window.LAST_FILTERED_ORDERS;
  if (!orders || !orders.length) orders = branchRecords(DB.orders || []);
  if (!orders.length) {
    toast("ئاگاداری", "هیچ فرۆشتنێک نییە بۆ هەناردەکردن", "warning");
    return;
  }
  var csv = "\uFEFFژمارەی پسوولە,بەروار,کاشیر,کڕیار,دانە,جۆر,کۆی پارە,قازانج,شێوازی پارەدان,پسوڵە,دۆخ\n";
  orders.forEach(function (o) {
    var dateStr = formatSaleDateTime(o.date);
    csv += '"' + (o.id || "") + '","' + dateStr + '","' + (o.cashier || "") + '","' + orderCustomerName(o) + '",' +
      orderItemQty(o) + ',' + orderItemTypes(o) + ',' + (o.total || 0) + ',' + orderProfitOf(o) + ',"' +
      orderPayLabel(o) + '","' + (isOrderPrinted(o) ? "بە پسوڵە" : "بێ پسوڵە") + '","' + (o.status || "completed") + '"\n';
  });
  var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "orders_history_" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  toast("سەرکەوتوو", orders.length + " فرۆشتن هەناردە کرا (هەمان فلتەری لاپەڕە)", "success");
}

// ══════════════════════════════════════
// SUPPLIERS & PURCHASES MODAL LOGIC
// ══════════════════════════════════════

function openSupplierModal(id) {
  if (typeof SuppliersManager !== "undefined") {
    SuppliersManager.openModal(id);
    return;
  }
  var supp = id ? (DB.suppliers || []).find(function (s) { return s.id === id; }) : null;
  $("#suppEditId").value = supp ? supp.id : "";
  $("#suppName").value = supp ? supp.name : "";
  $("#suppPhone").value = supp ? (supp.phone || "") : "";
  $("#suppEmail").value = supp ? (supp.email || "") : "";
  $("#suppAddress").value = supp ? (supp.address || "") : "";
  $("#suppNotes").value = supp ? (supp.notes || "") : "";
  $("#supplierModalTitle").innerHTML = supp ? '<i class="fas fa-truck"></i> دەستکاری دابینکەر' : '<i class="fas fa-truck"></i> دابینکەری نوێ';
  showModal("supplierModal");
  setTimeout(function () { $("#suppName").focus(); }, 100);
}

function editSupplier(id) {
  openSupplierModal(id);
}

function saveSupplier() {
  if (typeof SuppliersManager !== "undefined") {
    SuppliersManager.save();
    return;
  }
  var id = $("#suppEditId").value.trim();
  var name = $("#suppName").value.trim();
  var phone = $("#suppPhone").value.trim();
  var email = $("#suppEmail").value.trim();
  var address = $("#suppAddress").value.trim();
  var notes = $("#suppNotes").value.trim();

  if (!name) {
    toast("هەڵە", "ناوی دابینکەر داواکراوە", "error");
    $("#suppName").focus();
    return;
  }

  if (!DB.suppliers) DB.suppliers = [];

  var existing = id ? DB.suppliers.find(function (s) { return s.id === id; }) : null;
  if (existing) {
    existing.name = name;
    existing.phone = phone;
    existing.email = email;
    existing.address = address;
    existing.notes = notes;
    if (typeof ApiClient !== "undefined" && ApiClient.isOnline) {
      fetch('/api/suppliers/' + existing.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(existing)
      }).catch(function (e) { console.warn("API sync supplier edit failed", e); });
    }
  } else {
    var newSupp = {
      id: "supp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      name: name,
      phone: phone,
      email: email,
      address: address,
      notes: notes,
      balance: 0,
      createdAt: new Date().toISOString()
    };
    DB.suppliers.unshift(newSupp);
    if (typeof ApiClient !== "undefined" && ApiClient.isOnline) {
      fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSupp)
      }).catch(function (e) { console.warn("API sync supplier add failed", e); });
    }
  }

  if (typeof DataStore !== "undefined" && DataStore.saveSuppliers) {
    DataStore.saveSuppliers();
  }
  hideModal("supplierModal");
  renderSuppliers();
  toast("سەرکەوتوو", "دابینکەر پاشکەوت کرا", "success");
}

function deleteSupplier(id) {
  if (typeof SuppliersManager !== "undefined") {
    SuppliersManager.remove(id);
    return;
  }
  var supp = (DB.suppliers || []).find(function (s) { return s.id === id; });
  if (!supp) return;
  if (!confirm("ئایا دڵنیایت لە سڕینەوەی دابینکەر: " + supp.name + "؟")) return;
  DB.suppliers = DB.suppliers.filter(function (s) { return s.id !== id; });
  if (typeof DataStore !== "undefined" && DataStore.saveSuppliers) {
    DataStore.saveSuppliers();
  }
  if (typeof ApiClient !== "undefined" && ApiClient.isOnline) {
    fetch('/api/suppliers/' + id, { method: 'DELETE' }).catch(function (e) { console.warn("Supplier delete API sync", e); });
  }
  renderSuppliers();
  toast("سەرکەوتوو", "دابینکەر سڕایەوە", "success");
}

var PURCHASE_MODAL_ITEMS = [];
var SELECTED_PURCHASE_PRODUCT = null;
var SELECTED_PURCHASE_FOR_PRINT = null;

function findProductForPurchase(query) {
  if (!query) return null;
  var q = String(query).trim();
  if (!q) return null;
  var prods = DB.products || [];
  // 1. Exact barcode or packBarcode match
  var byCode = prods.find(function (p) {
    return (p.barcode && String(p.barcode) === q) || (p.packBarcode && String(p.packBarcode) === q);
  });
  if (byCode) return byCode;
  // 2. Exact name match
  var lower = q.toLowerCase();
  var byExactName = prods.find(function (p) { return p.name && p.name.trim().toLowerCase() === lower; });
  if (byExactName) return byExactName;
  // 3. Name starts with or contains when formatted like "Name (barcode)"
  var namePart = q.split(" (")[0].trim().toLowerCase();
  var byPrefix = prods.find(function (p) { return p.name && p.name.trim().toLowerCase() === namePart; });
  if (byPrefix) return byPrefix;
  return prods.find(function (p) { return p.name && p.name.toLowerCase().includes(lower); }) || null;
}

function populatePurchaseProductDatalist() {
  var dl = $("#purchaseProductsDatalist");
  if (!dl) return;
  var prods = DB.products || [];
  dl.innerHTML = prods.map(function (p) {
    var label = p.name + (p.barcode ? " (" + p.barcode + ")" : "") + " — کۆگا: " + (p.stock || 0);
    return '<option value="' + p.name.replace(/"/g, "&quot;") + '">' + label + '</option>';
  }).join("");
}

function onPurchaseProductLookup(val) {
  var prod = findProductForPurchase(val);
  SELECTED_PURCHASE_PRODUCT = prod;
  var hintEl = $("#purchaseItemSelectedHint");
  var costInput = $("#purchaseItemCost");
  var unitSelect = $("#purchaseItemUnitType");
  var expInput = $("#purchaseItemExpiry");

  if (prod) {
    var isCarton = (unitSelect && unitSelect.value === "carton") || (prod.packBarcode && String(prod.packBarcode) === String(val).trim());
    if (prod.packBarcode && String(prod.packBarcode) === String(val).trim() && unitSelect) {
      unitSelect.value = "carton";
      isCarton = true;
    }
    var defaultCost = isCarton
      ? (prod.packCost > 0 ? prod.packCost : ((prod.cost || 0) * (prod.packQty || 1)))
      : (prod.cost || 0);
    if (costInput) costInput.value = defaultCost;
    if (expInput && prod.expiryDate) expInput.value = String(prod.expiryDate).slice(0, 10);
    if (hintEl) {
      hintEl.textContent = "✓ " + prod.name + " | لە کۆگا: " + (prod.stock || 0) + " دانە" + ((prod.packQty || 1) > 1 ? " | کارتۆن: " + prod.packQty + " دانە" : "");
    }
  } else {
    if (hintEl) hintEl.textContent = "";
  }
}

function onPurchaseUnitTypeChange() {
  if (!SELECTED_PURCHASE_PRODUCT) {
    var searchVal = $("#purchaseItemSearchInput") ? $("#purchaseItemSearchInput").value : "";
    SELECTED_PURCHASE_PRODUCT = findProductForPurchase(searchVal);
  }
  if (!SELECTED_PURCHASE_PRODUCT) return;
  var unitType = $("#purchaseItemUnitType") ? $("#purchaseItemUnitType").value : "piece";
  var isCarton = (unitType === "carton");
  var packQty = SELECTED_PURCHASE_PRODUCT.packQty || 1;
  var costInput = $("#purchaseItemCost");
  if (costInput) {
    costInput.value = isCarton
      ? (SELECTED_PURCHASE_PRODUCT.packCost > 0 ? SELECTED_PURCHASE_PRODUCT.packCost : ((SELECTED_PURCHASE_PRODUCT.cost || 0) * packQty))
      : (SELECTED_PURCHASE_PRODUCT.cost || 0);
  }
}

function handlePurchaseSearchKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    var val = (e.target.value || "").trim();
    if (!val) return;
    var prod = findProductForPurchase(val);
    if (prod) {
      SELECTED_PURCHASE_PRODUCT = prod;
      onPurchaseProductLookup(val);
      var unitSelect = $("#purchaseItemUnitType");
      if (unitSelect) {
        if (prod.packBarcode && String(prod.packBarcode) === val) {
          unitSelect.value = "carton";
        }
      }
      onPurchaseUnitTypeChange();

      // Move focus straight to Quantity input with text selected so manager can type '5'
      var qtyInp = $("#purchaseItemQty");
      if (qtyInp) {
        qtyInp.value = "1";
        qtyInp.focus();
        qtyInp.select();
      }
      if (typeof PosSound !== "undefined") PosSound.playSuccess();
    } else {
      var hintEl = $("#purchaseItemSelectedHint");
      if (hintEl) {
        hintEl.innerHTML = '<span style="color:#ef4444;font-weight:800;">⚠️ ئەم بارکۆدە [' + val + '] لە کۆگادا تۆمار نەکراوە! </span>' +
          '<button type="button" class="btn btn-xs btn-warning" onclick="quickRegisterPurchaseProduct(\'' + val.replace(/'/g, "\\'") + '\')" style="margin-right:6px;padding:3px 10px;font-weight:800;"><i class="fas fa-plus"></i> زیادکردنی ئەم کاڵا نوێیە</button>';
      }
      if (typeof PosAudio !== "undefined") PosAudio.playErrorBuzz();
    }
  }
}

function quickRegisterPurchaseProduct(barcode) {
  openProductModal(null);
  setTimeout(function () {
    var bcInp = $("#pBarcode");
    if (bcInp && barcode) {
      bcInp.value = barcode;
      bcInp.focus();
    }
  }, 150);
}

function quickTogglePurchaseUnit() {
  var sel = $("#purchaseItemUnitType");
  if (!sel) return;
  sel.value = (sel.value === "carton") ? "piece" : "carton";
  onPurchaseUnitTypeChange();
}

function addPurchaseLineItem() {
  var searchInput = $("#purchaseItemSearchInput");
  var query = searchInput ? searchInput.value.trim() : "";
  var prod = SELECTED_PURCHASE_PRODUCT || findProductForPurchase(query);
  if (!prod) {
    toast("ئاگاداری", "تکایە کاڵایەک لە لیستەکە هەڵبژێرە یان بارکۆدەکەی لێبدە", "warning");
    if (searchInput) searchInput.focus();
    return;
  }

  var unitType = $("#purchaseItemUnitType") ? $("#purchaseItemUnitType").value : "carton";
  var qty = parseFloat($("#purchaseItemQty") ? $("#purchaseItemQty").value : 1) || 1;
  var cost = parseFloat($("#purchaseItemCost") ? $("#purchaseItemCost").value : 0) || 0;
  var expiryDate = ($("#purchaseItemExpiry") ? $("#purchaseItemExpiry").value : "").trim();

  if (qty <= 0) {
    toast("هەڵە", "بڕی کاڵا دەبێت لە سفر زیاتر بێت", "error");
    return;
  }

  var isCarton = (unitType === "carton");
  var packQty = parseFloat(prod.packQty) || 1;
  var addedPieces = isCarton ? Math.round(qty * packQty) : qty;
  var lineTotal = Math.round(qty * cost);

  var existingIdx = PURCHASE_MODAL_ITEMS.findIndex(function (it) {
    return it.prodId === prod.id && it.unitType === unitType;
  });

  if (existingIdx >= 0) {
    PURCHASE_MODAL_ITEMS[existingIdx].qty += qty;
    PURCHASE_MODAL_ITEMS[existingIdx].addedPieces += addedPieces;
    if (cost > 0) PURCHASE_MODAL_ITEMS[existingIdx].cost = cost;
    PURCHASE_MODAL_ITEMS[existingIdx].lineTotal = Math.round(PURCHASE_MODAL_ITEMS[existingIdx].qty * PURCHASE_MODAL_ITEMS[existingIdx].cost);
    if (expiryDate) PURCHASE_MODAL_ITEMS[existingIdx].expiryDate = expiryDate;
    toast("نوێکرایەوە", "بڕی [" + prod.name + "] بوو بە " + PURCHASE_MODAL_ITEMS[existingIdx].qty + " " + (isCarton ? "کارتۆن" : "دانە"), "success");
  } else {
    PURCHASE_MODAL_ITEMS.push({
      prodId: prod.id,
      name: prod.name,
      barcode: prod.barcode || "",
      unitType: unitType,
      packQty: packQty,
      qty: qty,
      addedPieces: addedPieces,
      cost: cost,
      lineTotal: lineTotal,
      expiryDate: expiryDate || prod.expiryDate || ""
    });
    toast("زیادکرا", "[" + prod.name + "] خرایە سەر وەسڵی کڕین", "success");
  }

  if (searchInput) {
    searchInput.value = "";
    searchInput.focus();
  }
  if ($("#purchaseItemQty")) $("#purchaseItemQty").value = 1;
  if ($("#purchaseItemSelectedHint")) $("#purchaseItemSelectedHint").textContent = "";
  SELECTED_PURCHASE_PRODUCT = null;

  renderPurchaseModalItems();
}

function updatePurchaseItemField(idx, field, value) {
  var item = PURCHASE_MODAL_ITEMS[idx];
  if (!item) return;
  if (field === "qty") {
    var q = parseFloat(value);
    if (isNaN(q) || q < 1) q = 1;
    item.qty = q;
    item.addedPieces = (item.unitType === "carton") ? Math.round(item.qty * (item.packQty || 1)) : item.qty;
    item.lineTotal = Math.round(item.qty * item.cost);
  } else if (field === "cost") {
    var c = parseFloat(value);
    if (isNaN(c) || c < 0) c = 0;
    item.cost = c;
    item.lineTotal = Math.round(item.qty * item.cost);
  }

  var piecesEl = document.getElementById("pRowPieces_" + idx);
  if (piecesEl) piecesEl.textContent = "+" + item.addedPieces + " دانە";

  var lineTotalEl = document.getElementById("pRowTotal_" + idx);
  if (lineTotalEl) lineTotalEl.textContent = fmt(item.lineTotal);

  var autoSum = PURCHASE_MODAL_ITEMS.reduce(function (s, it) { return s + (it.lineTotal || 0); }, 0);
  var totalEl = $("#purchaseTotal");
  if (totalEl) totalEl.value = autoSum;
  onPurchaseTotalInput();
}

function togglePurchaseItemUnit(idx) {
  var item = PURCHASE_MODAL_ITEMS[idx];
  if (!item) return;
  var prod = (DB.products || []).find(function (p) { return p.id === item.prodId; });
  if (item.unitType === "carton") {
    item.unitType = "piece";
    item.addedPieces = item.qty;
    if (prod && prod.cost > 0) item.cost = prod.cost;
    else if ((item.packQty || 1) > 1) item.cost = Math.round(item.cost / item.packQty);
  } else {
    item.unitType = "carton";
    item.addedPieces = Math.round(item.qty * (item.packQty || 1));
    if (prod && prod.packCost > 0) item.cost = prod.packCost;
    else if ((item.packQty || 1) > 1) item.cost = Math.round(item.cost * item.packQty);
  }
  item.lineTotal = Math.round(item.qty * item.cost);
  renderPurchaseModalItems();
}

function removePurchaseLineItem(idx) {
  PURCHASE_MODAL_ITEMS.splice(idx, 1);
  renderPurchaseModalItems();
}

function renderPurchaseModalItems() {
  var tbody = $("#purchaseItemsTableBody");
  if (!tbody) return;

  if (PURCHASE_MODAL_ITEMS.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:14px;color:var(--text-muted);">هیچ کاڵایەک زیاد نەکراوە (دەتوانیت کاڵا بە بارکۆد سکان بکەیت یان بنووسیت)</td></tr>';
  } else {
    tbody.innerHTML = PURCHASE_MODAL_ITEMS.map(function (it, idx) {
      var isCarton = (it.unitType === "carton");
      var unitBadge = isCarton
        ? ('<button type="button" class="btn btn-xs btn-primary" onclick="togglePurchaseItemUnit(' + idx + ')" style="background:#2563eb;color:#fff;font-weight:800;border:none;padding:2px 8px;border-radius:6px;" title="کلیک بکە بۆ گۆڕین">📦 کارتۆن (' + it.packQty + ' دانە)</button>')
        : ('<button type="button" class="btn btn-xs btn-outline" onclick="togglePurchaseItemUnit(' + idx + ')" style="border-color:#64748b;color:#cbd5e1;font-weight:700;padding:2px 8px;border-radius:6px;" title="کلیک بکە بۆ گۆڕین">🔹 دانە (Piece)</button>');

      return '<tr>' +
        '<td>' + (idx + 1) + '</td>' +
        '<td><strong>' + it.name + '</strong>' +
          (it.barcode ? '<div style="font-size:0.7rem;color:var(--text-muted);font-family:monospace;">' + it.barcode + '</div>' : '') +
          (it.expiryDate ? '<div style="font-size:0.72rem;color:#f59e0b;">بەسەرچوون: ' + it.expiryDate + '</div>' : '') +
        '</td>' +
        '<td>' + unitBadge + '</td>' +
        '<td>' +
          '<input type="number" min="1" step="1" value="' + it.qty + '" oninput="updatePurchaseItemField(' + idx + ', \'qty\', this.value)" style="width:68px;padding:4px 6px;text-align:center;font-weight:900;border-radius:6px;border:1px solid rgba(59,130,246,0.5);background:#0f172a;color:#fff;font-size:0.95rem;">' +
        '</td>' +
        '<td id="pRowPieces_' + idx + '" style="color:#10b981;font-weight:800;">+' + it.addedPieces + ' دانە</td>' +
        '<td>' +
          '<div style="display:flex;align-items:center;gap:4px;">' +
            '<input type="number" min="0" step="250" value="' + it.cost + '" oninput="updatePurchaseItemField(' + idx + ', \'cost\', this.value)" style="width:105px;padding:4px 6px;text-align:center;font-weight:900;border-radius:6px;border:1px solid rgba(16,185,129,0.5);background:#0f172a;color:#34d399;font-size:0.95rem;">' +
            '<span style="font-size:0.7rem;color:var(--text-muted);">د.ع</span>' +
          '</div>' +
        '</td>' +
        '<td id="pRowTotal_' + idx + '" style="font-weight:900;color:#fde047;">' + fmt(it.lineTotal) + '</td>' +
        '<td><button type="button" class="btn btn-xs btn-danger" onclick="removePurchaseLineItem(' + idx + ')" style="padding:4px 8px;" title="سڕینەوە"><i class="fas fa-trash-alt"></i></button></td>' +
      '</tr>';
    }).join("");

    var autoSum = PURCHASE_MODAL_ITEMS.reduce(function (s, it) { return s + (it.lineTotal || 0); }, 0);
    var totalEl = $("#purchaseTotal");
    if (totalEl) totalEl.value = autoSum;
  }
  onPurchaseTotalInput();
}

function onPurchasePayTypeChange() {
  var payType = $("#purchasePaymentType") ? $("#purchasePaymentType").value : "cash";
  var paidGroup = $("#purchasePaidGroup");
  var totalVal = parseFloat($("#purchaseTotal") ? $("#purchaseTotal").value : 0) || 0;
  var paidInput = $("#purchasePaidAmount");

  if (payType === "partial") {
    if (paidGroup) paidGroup.style.display = "block";
    if (paidInput && (parseFloat(paidInput.value) <= 0 || parseFloat(paidInput.value) >= totalVal)) {
      paidInput.value = Math.round((totalVal / 2) / 250) * 250 || 0;
    }
  } else {
    if (paidGroup) paidGroup.style.display = "none";
    if (paidInput) paidInput.value = (payType === "debt") ? 0 : totalVal;
  }
  onPurchaseTotalInput();
}

function onPurchaseTotalInput() {
  var totalVal = parseFloat($("#purchaseTotal") ? $("#purchaseTotal").value : 0) || 0;
  var payType = $("#purchasePaymentType") ? $("#purchasePaymentType").value : "cash";
  var paidVal = 0;

  if (payType === "cash" || payType === "bank") {
    paidVal = totalVal;
  } else if (payType === "debt") {
    paidVal = 0;
  } else if (payType === "partial") {
    paidVal = Math.min(totalVal, Math.max(0, parseFloat($("#purchasePaidAmount") ? $("#purchasePaidAmount").value : 0) || 0));
  }

  var debtRem = Math.max(0, totalVal - paidVal);
  var remEl = $("#purchaseRemainingDebtPreview");
  if (remEl) {
    remEl.value = fmt(debtRem);
    remEl.style.color = debtRem > 0 ? "#ef4444" : "#10b981";
  }
}

function openPurchaseModal(preselectedSupplierId, seedItems) {
  PURCHASE_MODAL_ITEMS = [];
  SELECTED_PURCHASE_PRODUCT = null;
  if (seedItems && seedItems.length) {
    PURCHASE_MODAL_ITEMS = seedItems.map(function (it) {
      var prod = (DB.products || []).find(function (p) { return p.id === it.prodId; }) || {};
      var packQty = parseFloat(prod.packQty) || 1;
      var unitType = it.unit || it.unitType || "carton";
      var qty = parseFloat(it.qty) || 1;
      var isCarton = unitType === "carton";
      var cost = parseFloat(it.cost) || (isCarton ? (prod.packCost || prod.cost || 0) : (prod.cost || 0));
      return {
        prodId: it.prodId || prod.id,
        name: it.name || prod.name || "",
        barcode: prod.barcode || "",
        unitType: unitType,
        packQty: packQty,
        qty: qty,
        addedPieces: isCarton ? Math.round(qty * packQty) : qty,
        cost: cost,
        lineTotal: Math.round(qty * cost),
        expiryDate: ""
      };
    });
  }

  var select = $("#purchaseSupplierSelect");
  if (select) {
    var suppliers = DB.suppliers || [];
    if (suppliers.length === 0) {
      select.innerHTML = '<option value="">دابینکەری گشتی (بێ ناو)</option>';
    } else {
      select.innerHTML = suppliers.map(function (s) {
        return '<option value="' + s.id + '">' + s.name + (s.repName ? ' (' + s.repName + ')' : '') + '</option>';
      }).join("");
      if (preselectedSupplierId) select.value = preselectedSupplierId;
    }
  }

  populatePurchaseProductDatalist();

  if ($("#purchaseItemSearchInput")) $("#purchaseItemSearchInput").value = "";
  if ($("#purchaseItemQty")) $("#purchaseItemQty").value = 1;
  if ($("#purchaseItemCost")) $("#purchaseItemCost").value = 0;
  if ($("#purchaseItemExpiry")) $("#purchaseItemExpiry").value = "";
  if ($("#purchaseItemSelectedHint")) $("#purchaseItemSelectedHint").textContent = "";
  if ($("#purchaseTotal")) $("#purchaseTotal").value = "";
  if ($("#purchasePaidAmount")) $("#purchasePaidAmount").value = "0";
  if ($("#purchaseInvoiceNum")) $("#purchaseInvoiceNum").value = "INV-" + Math.floor(100000 + Math.random() * 900000);
  if ($("#purchasePaymentType")) $("#purchasePaymentType").value = "cash";
  if ($("#purchaseNotes")) $("#purchaseNotes").value = "";

  onPurchasePayTypeChange();
  renderPurchaseModalItems();
  if (PURCHASE_MODAL_ITEMS.length) {
    var autoSum = PURCHASE_MODAL_ITEMS.reduce(function (s, it) { return s + (it.lineTotal || 0); }, 0);
    if ($("#purchaseTotal") && autoSum > 0) $("#purchaseTotal").value = autoSum;
    onPurchaseTotalInput();
  }
  showModal("purchaseModal");
  setTimeout(function () {
    var inp = $("#purchaseItemSearchInput") || $("#purchaseTotal");
    if (inp) inp.focus();
  }, 100);
}

function savePurchase() {
  var select = $("#purchaseSupplierSelect");
  var supplierId = select ? select.value : "";
  var supplier = (DB.suppliers || []).find(function (s) { return s.id === supplierId; });
  var total = parseFloat($("#purchaseTotal") ? $("#purchaseTotal").value : 0) || 0;
  var invNum = ($("#purchaseInvoiceNum") ? $("#purchaseInvoiceNum").value : "").trim() || ("INV-" + Date.now().toString().slice(-6));
  var payType = $("#purchasePaymentType") ? $("#purchasePaymentType").value : "cash";
  var notes = ($("#purchaseNotes") ? $("#purchaseNotes").value : "").trim();

  if (total <= 0) {
    toast("هەڵە", "تکایە کاڵا زیاد بکە یان کۆی گشتی پسوولەی کڕین بنووسە", "error");
    if ($("#purchaseTotal")) $("#purchaseTotal").focus();
    return;
  }

  var paidAmt = total;
  if (payType === "debt") {
    paidAmt = 0;
  } else if (payType === "partial") {
    paidAmt = Math.min(total, Math.max(0, parseFloat($("#purchasePaidAmount") ? $("#purchasePaidAmount").value : 0) || 0));
  }
  var debtAmount = Math.max(0, total - paidAmt);
  var nowIso = new Date().toISOString();
  var operatorName = (DB.currentUser && (DB.currentUser.fullName || DB.currentUser.name || DB.currentUser.username)) || "بەڕێوەبەر";

  if (!DB.purchases) DB.purchases = [];
  if (typeof STOCK_TRANSACTIONS === "undefined") window.STOCK_TRANSACTIONS = [];

  // Apply stock & cost updates locally for each item in PURCHASE_MODAL_ITEMS
  var totalRestockedPieces = 0;
  var itemsSnapshot = PURCHASE_MODAL_ITEMS.map(function (it) {
    var prod = (DB.products || []).find(function (p) { return p.id === it.prodId; });
    var prevStock = prod ? (parseFloat(prod.stock) || 0) : 0;
    var newStock = prevStock + (parseFloat(it.addedPieces) || 0);
    totalRestockedPieces += (parseFloat(it.addedPieces) || 0);

    if (prod) {
      prod.stock = newStock;
      if (it.cost > 0) {
        if (it.unitType === "carton") {
          prod.packCost = it.cost;
          prod.cost = Math.round(it.cost / (it.packQty || prod.packQty || 1));
        } else {
          prod.cost = it.cost;
          if ((prod.packQty || 1) > 1) prod.packCost = Math.round(it.cost * (prod.packQty || 1));
        }
      }
      if (it.expiryDate) {
        prod.expiryDate = it.expiryDate;
      }

      STOCK_TRANSACTIONS.unshift({
        id: gid(),
        productId: prod.id,
        productName: prod.name,
        type: "purchase_in",
        quantity: it.addedPieces,
        previousStock: prevStock,
        newStock: newStock,
        reason: "کڕین لە کۆمپانیا (" + (supplier ? supplier.name : "گشتی") + ") - #" + invNum,
        timestamp: nowIso,
        operator: operatorName
      });
    }

    return Object.assign({}, it, {
      previousStock: prevStock,
      newStock: newStock
    });
  });

  if (itemsSnapshot.length > 0) {
    DataStore.saveProducts();
    if (typeof DataStore.saveStockTransactions === "function") {
      DataStore.saveStockTransactions(STOCK_TRANSACTIONS);
    }
    if (typeof renderProducts === "function") renderProducts();
    if (typeof renderPosGrid === "function") renderPosGrid();
    if (typeof updateHeaderExpiryBadge === "function") updateHeaderExpiryBadge();
  }

  var newPur = {
    id: "pur_" + Date.now(),
    supplierId: supplierId,
    supplierName: supplier ? supplier.name : "دابینکەری گشتی",
    invoiceNumber: invNum,
    total: total,
    paid: paidAmt,
    debtAmount: debtAmount,
    paymentType: payType,
    notes: notes,
    status: debtAmount > 0 ? (paidAmt > 0 ? "partial" : "debt") : "completed",
    items: itemsSnapshot,
    date: nowIso
  };

  DB.purchases.unshift(newPur);

  if (debtAmount > 0 && supplier) {
    supplier.credit = (parseFloat(supplier.credit || supplier.balance) || 0) + debtAmount;
    supplier.balance = supplier.credit;
    if (typeof DataStore !== "undefined" && DataStore.saveSuppliers) DataStore.saveSuppliers();
    if (typeof SuppliersManager !== "undefined") SuppliersManager.render();
  }

  if (typeof DataStore !== "undefined" && DataStore.savePurchases) {
    DataStore.savePurchases();
  }

  // Sync with backend server
  if (typeof ApiClient !== "undefined" && typeof ApiClient.isOnline === "function" && ApiClient.isOnline()) {
    var base = typeof ApiClient.getBaseUrl === "function" ? ApiClient.getBaseUrl() : "";
    fetch(base + "/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({}, newPur, {
        applyStock: true,
        applySupplierDebt: true,
        operator: operatorName
      }))
    }).catch(function () {});
  }

  hideModal("purchaseModal");
  renderPurchases();
  var msgExtra = itemsSnapshot.length > 0 ? (" و +" + totalRestockedPieces + " دانە خرایە سەر کۆگا") : "";
  toast("سەرکەوتوو", "وەسڵی کڕین (#" + invNum + ") پاشکەوت کرا" + msgExtra, "success");
}

function viewPurchase(id) {
  var p = (DB.purchases || []).find(function (x) { return x.id === id; });
  if (!p) return;
  SELECTED_PURCHASE_FOR_PRINT = p;
  var body = $("#purchaseDetailBody");
  if (!body) return;

  var dateStr = p.date ? p.date.replace("T", " ").slice(0, 16) : "-";
  var tot = parseFloat(p.total) || 0;
  var pType = p.paymentType || "cash";
  var paid = p.paid !== undefined ? (parseFloat(p.paid) || 0) : (pType === "debt" ? 0 : tot);
  var debtAmt = p.debtAmount !== undefined ? (parseFloat(p.debtAmount) || 0) : Math.max(0, tot - paid);
  var items = Array.isArray(p.items) ? p.items : [];

  var itemsHtml = items.length === 0
    ? '<div style="padding:14px;text-align:center;color:var(--text-muted);background:var(--bg-input);border-radius:10px;">ئەم وەسڵە بە شێوەی کۆی گشتی (بێ دیاریکردنی تاکە کاڵا) تۆمارکراوە</div>'
    : '<table style="width:100%;border-collapse:collapse;font-size:0.88rem;margin-top:8px;">' +
        '<thead><tr style="background:var(--bg-secondary);">' +
          '<th style="padding:7px;text-align:right;">#</th>' +
          '<th style="padding:7px;text-align:right;">ناوی کاڵا</th>' +
          '<th style="padding:7px;text-align:center;">یەکە و بڕ</th>' +
          '<th style="padding:7px;text-align:center;">زیادکراو بۆ کۆگا</th>' +
          '<th style="padding:7px;text-align:right;">نرخی کڕین</th>' +
          '<th style="padding:7px;text-align:right;">کۆ</th>' +
        '</tr></thead><tbody>' +
        items.map(function (it, idx) {
          var uStr = it.unitType === "carton" ? (it.qty + " کارتۆن") : (it.qty + " دانە");
          return '<tr>' +
            '<td style="padding:6px 7px;border-bottom:1px solid var(--border-color);">' + (idx + 1) + '</td>' +
            '<td style="padding:6px 7px;border-bottom:1px solid var(--border-color);"><strong>' + (it.name || "-") + '</strong></td>' +
            '<td style="padding:6px 7px;border-bottom:1px solid var(--border-color);text-align:center;">' + uStr + '</td>' +
            '<td style="padding:6px 7px;border-bottom:1px solid var(--border-color);text-align:center;color:#10b981;font-weight:700;">+' + (it.addedPieces || it.qty) + ' دانە</td>' +
            '<td style="padding:6px 7px;border-bottom:1px solid var(--border-color);">' + fmt(it.cost || 0) + '</td>' +
            '<td style="padding:6px 7px;border-bottom:1px solid var(--border-color);font-weight:700;">' + fmt(it.lineTotal || ((it.qty || 1) * (it.cost || 0))) + '</td>' +
          '</tr>';
        }).join("") +
        '</tbody></table>';

  body.innerHTML =
    '<div style="background:var(--bg-input);padding:14px;border-radius:12px;border:1px solid var(--border-color);margin-bottom:14px;">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>ژمارەی وەسڵ:</span><strong style="font-family:monospace;">' + (p.invoiceNumber || p.id) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>کۆمپانیا / دابینکەر:</span><strong>' + (p.supplierName || "-") + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>بەروار و کات:</span><span>' + dateStr + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span>کۆی گشتی وەسڵ:</span><strong style="font-size:1.05rem;">' + fmt(tot) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#10b981;"><span>بڕی پارەی دراو:</span><strong>' + fmt(paid) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;color:' + (debtAmt > 0 ? '#ef4444' : 'var(--text-muted)') + ';"><span>قەرزی ماوە لەسەر ئەم وەسڵە:</span><strong>' + fmt(debtAmt) + '</strong></div>' +
      (p.notes ? '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border-color);font-size:0.84rem;color:var(--text-muted);">تێبینی: ' + p.notes + '</div>' : '') +
    '</div>' +
    itemsHtml;

  showModal("purchaseDetailModal");
}

function printSelectedPurchase() {
  var p = SELECTED_PURCHASE_FOR_PRINT;
  if (!p) return;
  var storeName = getStoreName();
  var dateStr = p.date ? p.date.replace("T", " ").slice(0, 16) : "-";
  var tot = parseFloat(p.total) || 0;
  var paid = p.paid !== undefined ? (parseFloat(p.paid) || 0) : (p.paymentType === "debt" ? 0 : tot);
  var debtAmt = p.debtAmount !== undefined ? (parseFloat(p.debtAmount) || 0) : Math.max(0, tot - paid);
  var items = Array.isArray(p.items) ? p.items : [];

  var rows = items.map(function (it, idx) {
    return '<tr>' +
      '<td style="border:1px solid #333;padding:6px;text-align:center;">' + (idx + 1) + '</td>' +
      '<td style="border:1px solid #333;padding:6px;">' + (it.name || "-") + '</td>' +
      '<td style="border:1px solid #333;padding:6px;text-align:center;">' + (it.unitType === "carton" ? (it.qty + " کارتۆن") : (it.qty + " دانە")) + '</td>' +
      '<td style="border:1px solid #333;padding:6px;text-align:center;">+' + (it.addedPieces || it.qty) + '</td>' +
      '<td style="border:1px solid #333;padding:6px;">' + fmt(it.cost || 0) + '</td>' +
      '<td style="border:1px solid #333;padding:6px;font-weight:bold;">' + fmt(it.lineTotal || ((it.qty || 1) * (it.cost || 0))) + '</td>' +
    '</tr>';
  }).join("");

  var html = '<!DOCTYPE html><html dir="rtl" lang="ku"><head><meta charset="utf-8"><title>پسوولەی کڕین - ' + (p.invoiceNumber || p.id) + '</title>' +
    '<style>body{font-family:Tahoma,Arial,sans-serif;padding:20px;color:#000;font-size:15px;}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px;}th{background:#eee;border:1px solid #333;padding:8px;text-align:right;}</style></head><body>' +
    '<h2 style="text-align:center;margin:0 0 4px;">' + storeName + ' — بەڵگەنامەی کڕینی کاڵا</h2>' +
    '<p style="text-align:center;margin:0 0 14px;">کۆمپانیا: <strong>' + (p.supplierName || "-") + '</strong> | ژمارەی وەسڵ: <strong>' + (p.invoiceNumber || p.id) + '</strong> | بەروار: ' + dateStr + '</p>' +
    (items.length > 0 ? ('<table><thead><tr><th>#</th><th>کاڵا</th><th>بڕ</th><th>زیادکراو بۆ کۆگا</th><th>نرخی کڕین</th><th>کۆ</th></tr></thead><tbody>' + rows + '</tbody></table>') : '') +
    '<div style="margin-top:16px;padding:12px;border:2px solid #000;display:flex;justify-content:space-around;font-size:14px;font-weight:bold;">' +
      '<span>کۆی وەسڵ: ' + fmt(tot) + '</span>' +
      '<span>پارەی دراو: ' + fmt(paid) + '</span>' +
      '<span>ماوە (قەرز): ' + fmt(debtAmt) + '</span>' +
    '</div>' +
    '</body></html>';

  if (typeof ImmediatePrinter !== "undefined") {
    ImmediatePrinter.print(html, { pageSize: "A4" });
  } else {
    try { window.print(); } catch (e) {}
  }
}

function deletePurchase(id) {
  var p = (DB.purchases || []).find(function (x) { return x.id === id; });
  if (!p) return;
  if (!confirm("ئایا دڵنیایت لە سڕینەوەی وەسڵی کڕین (" + (p.invoiceNumber || p.id) + ")؟")) return;

  var tot = parseFloat(p.total) || 0;
  var paid = p.paid !== undefined ? (parseFloat(p.paid) || 0) : (p.paymentType === "debt" ? 0 : tot);
  var debtAmt = p.debtAmount !== undefined ? (parseFloat(p.debtAmount) || 0) : Math.max(0, tot - paid);

  if (debtAmt > 0 && p.supplierId) {
    var supp = (DB.suppliers || []).find(function (s) { return s.id === p.supplierId; });
    if (supp) {
      supp.credit = Math.max(0, (parseFloat(supp.credit || supp.balance) || 0) - debtAmt);
      supp.balance = supp.credit;
      if (typeof DataStore !== "undefined" && DataStore.saveSuppliers) DataStore.saveSuppliers();
      if (typeof SuppliersManager !== "undefined") SuppliersManager.render();
    }
  }

  DB.purchases = (DB.purchases || []).filter(function (x) { return x.id !== id; });
  if (typeof DataStore !== "undefined" && DataStore.savePurchases) DataStore.savePurchases();

  if (typeof ApiClient !== "undefined" && typeof ApiClient.isOnline === "function" && ApiClient.isOnline()) {
    var base = typeof ApiClient.getBaseUrl === "function" ? ApiClient.getBaseUrl() : "";
    fetch(base + "/api/purchases/" + id, { method: "DELETE" }).catch(function () {});
  }

  renderPurchases();
  toast("سەرکەوتوو", "وەسڵی کڕین سڕایەوە", "info");
}

// ══════════════════════════════════════
// INVENTORY COUNT SHEET & PROFIT EXPORT
// ══════════════════════════════════════

function printInventoryCountSheet() {
  var prods = DB.products || [];
  if (prods.length === 0) {
    toast("ئاگاداری", "هیچ کاڵایەک لە کۆگا نییە بۆ سەرژمێری", "warning");
    return;
  }

  var storeName = getStoreName();
  var dateStr = formatSaleDateTime(new Date());

  var rowsHtml = prods.map(function (p, i) {
    var cat = (DB.categories || []).find(function (c) { return c.id === p.cat; });
    return '<tr>' +
      '<td style="border:1px solid #333;padding:6px;text-align:center;">' + (i + 1) + '</td>' +
      '<td style="border:1px solid #333;padding:6px;font-family:monospace;direction:ltr;">' + (p.barcode || "-") + '</td>' +
      '<td style="border:1px solid #333;padding:6px;font-weight:bold;">' + (p.name || "") + '</td>' +
      '<td style="border:1px solid #333;padding:6px;">' + (cat ? cat.name : "-") + '</td>' +
      '<td style="border:1px solid #333;padding:6px;text-align:center;font-weight:bold;">' + (p.stock || 0) + ' ' + (p.unit || "") + '</td>' +
      '<td style="border:1px solid #333;padding:6px;width:90px;background:#f9f9f9;"></td>' +
      '<td style="border:1px solid #333;padding:6px;width:90px;background:#f9f9f9;"></td>' +
    '</tr>';
  }).join("");

  var docHtml = '<!DOCTYPE html><html dir="rtl" lang="ku"><head><meta charset="utf-8"><title>لیستی سەرژمێری کۆگا - ' + storeName + '</title>' +
    '<style>' +
      'body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; color: #111; }' +
      'h1, h2, h3 { margin: 4px 0; }' +
      '.header { text-align: center; border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 16px; }' +
      'table { width: 100%; border-collapse: collapse; font-size: 13px; }' +
      'th { background: #e5e7eb; border: 1px solid #333; padding: 8px 6px; text-align: right; }' +
      '@media print { body { padding: 0; } @page { margin: 1cm; size: A4 landscape; } }' +
    '</style></head><body>' +
    '<div class="header">' +
      '<h1>' + storeName + '</h1>' +
      '<h2>فۆرمی فەرمی سەرژمێری فیعلی کۆگا (Physical Inventory Count Sheet)</h2>' +
      '<p>کاتی دەرکردن: ' + dateStr + ' | ژمارەی بەرهەمەکان: ' + prods.length + ' کاڵا</p>' +
    '</div>' +
    '<table>' +
      '<thead>' +
        '<tr>' +
          '<th style="width:30px;text-align:center;">#</th>' +
          '<th style="width:140px;">باڕکۆد</th>' +
          '<th>ناوی کاڵا</th>' +
          '<th style="width:110px;">پۆل</th>' +
          '<th style="width:90px;text-align:center;">لە سیستەم</th>' +
          '<th style="width:100px;text-align:center;">ژمێردراو (کۆگا)</th>' +
          '<th style="width:100px;text-align:center;">جیاوازی (+ / -)</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
    '</table>' +
    '<div style="margin-top:24px;display:flex;justify-content:space-between;padding:0 20px;font-size:14px;">' +
      '<div>واژۆی بەرپرسی کۆگا: _______________________</div>' +
      '<div>واژۆی ژمێریار / کاشیر: _______________________</div>' +
      '<div>واژۆی بەڕێوەبەری مارکێت: _______________________</div>' +
    '</div>' +
    '</body></html>';

  if (typeof ImmediatePrinter !== "undefined") {
    ImmediatePrinter.print(docHtml, { pageSize: 'A4' });
  } else {
    try { window.print(); } catch (e) {}
  }
}

function exportProfitReport() {
  var orders = DB.orders || [];
  if (orders.length === 0) {
    toast("ئاگاداری", "هیچ داتایەکی فرۆشتن نییە بۆ هەناردەکردن", "warning");
    return;
  }
  var csv = "\uFEFFبەروار,پسوولە #,کۆی فرۆشتن,تێچوو,قازانجی سافی,ڕێژەی قازانج\n";
  orders.forEach(function (o) {
    var dateStr = o.date ? o.date.slice(0, 10) : "-";
    var total = o.total || 0;
    var cost = o.totalCost || 0;
    var profit = total - cost;
    var margin = total > 0 ? ((profit / total) * 100).toFixed(1) + "%" : "0%";
    csv += '"' + dateStr + '","' + (o.id || "") + '",' + total + ',' + cost + ',' + profit + ',"' + margin + '"\n';
  });
  var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "profit_report_" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  toast("سەرکەوتوو", "ڕاپۆرتی قازانج هەناردە کرا", "success");
}

function printProductCatalog() {
  var prods = DB.products || [];
  if (prods.length === 0) {
    toast("ئاگاداری", "هیچ کاڵایەک نییە بۆ چاپکردن", "warning");
    return;
  }
  var storeName = getStoreName();
  var rowsHtml = prods.map(function (p, i) {
    var cat = (DB.categories || []).find(function (c) { return c.id === p.cat; });
    return '<tr>' +
      '<td style="border:1px solid #ccc;padding:6px;text-align:center;">' + (i + 1) + '</td>' +
      '<td style="border:1px solid #ccc;padding:6px;direction:ltr;font-family:monospace;">' + (p.barcode || "-") + '</td>' +
      '<td style="border:1px solid #ccc;padding:6px;font-weight:bold;">' + (p.name || "") + '</td>' +
      '<td style="border:1px solid #ccc;padding:6px;">' + (cat ? cat.name : "-") + '</td>' +
      '<td style="border:1px solid #ccc;padding:6px;text-align:right;font-weight:bold;color:#059669;">' + (typeof fmt === "function" ? fmt(p.price) : p.price) + '</td>' +
      '<td style="border:1px solid #ccc;padding:6px;text-align:center;">' + (p.stock || 0) + ' ' + (p.unit || "") + '</td>' +
    '</tr>';
  }).join("");

  var catalogDocHtml = '<!DOCTYPE html><html dir="rtl" lang="ku"><head><meta charset="utf-8"><title>کەتەلۆگی بەرهەمەکان - ' + storeName + '</title>' +
    '<style>' +
      'body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; color: #111; }' +
      '.header { text-align: center; border-bottom: 2px solid #222; padding-bottom: 10px; margin-bottom: 16px; }' +
      'table { width: 100%; border-collapse: collapse; font-size: 14px; }' +
      'th { background: #f3f4f6; border: 1px solid #ccc; padding: 8px; text-align: right; }' +
      '@media print { body { padding: 0; } @page { margin: 1cm; size: A4; } }' +
    '</style></head><body>' +
    '<div class="header"><h1>' + storeName + '</h1><h2>کەتەلۆگی گشتی بەرهەمەکان</h2></div>' +
    '<table><thead><tr><th>#</th><th>بارکۆد</th><th>ناوی کاڵا</th><th>پۆل</th><th>نرخی فرۆشتن</th><th>مەخزەن</th></tr></thead><tbody>' +
    rowsHtml +
    '</tbody></table>' +
    '</body></html>';

  if (typeof ImmediatePrinter !== "undefined") {
    ImmediatePrinter.print(catalogDocHtml, { pageSize: 'A4' });
  } else {
    try { window.print(); } catch (e) {}
  }
}
window.printProductCatalog = printProductCatalog;
window.exportProfitReport = exportProfitReport;
window.printInventoryCountSheet = printInventoryCountSheet;
if (typeof toast === "function") window.toast = toast;

// ══════════════════════════════════════
// POS CENTER PANEL ACTION SHORTCUTS
// ══════════════════════════════════════

function generateQuotationReceipt() {
  var currentCart = (CUSTOMER_QUEUE[ACTIVE_CUSTOMER] && CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart) || [];
  if (currentCart.length === 0) {
    toast("ئاگاداری", "سەبەتە بەتاڵە! کاڵا زیاد بکە پێش دەرکردنی نرخەڕە", "warning");
    return;
  }

  var totals = getCartTotals(currentCart);
  var quoteOrder = {
    id: "QTE-" + Math.floor(100000 + Math.random() * 900000),
    isQuotation: true,
    date: new Date().toISOString(),
    cashier: getActiveOperatorName(),
    customer: (CUSTOMER_QUEUE[ACTIVE_CUSTOMER] && CUSTOMER_QUEUE[ACTIVE_CUSTOMER].name) || "کڕیاری نرخەڕە",
    items: JSON.parse(JSON.stringify(currentCart)),
    subtotal: totals.subtotal,
    discount: totals.discAmt,
    tax: totals.taxAmt,
    total: totals.grandTotal,
    paymentMethod: "quotation"
  };

  printReceiptDirect(quoteOrder);
  toast("سەرکەوتوو", "پسوولەی نرخەڕە (Estimate) چاپکرا بەبێ کەمکردنی کۆگا", "success");
}

function applyKeypadDiscount() {
  var val = parseFloat(keypadValue) || 0;
  if (val <= 0) {
    var p = prompt("تکایە ڕێژەی داشکاندن بنووسە (%):", "5");
    val = parseFloat(p) || 0;
  }
  if (val < 0 || val > 100) {
    toast("هەڵە", "داشکاندن دەبێت لە نێوان 0 بۆ 100% بێت", "error");
    return;
  }
  var discIn = $("#posDiscountInput");
  if (discIn) {
    discIn.value = val;
    renderCartTable();
    toast("داشکاندن", "%" + val + " داشکاندن لەسەر سەبەتە دانرا", "success");
    keypadValue = "0";
    updateKeypadDisplay();
  }
}

function overrideLastItemPrice() {
  var currentCart = (CUSTOMER_QUEUE[ACTIVE_CUSTOMER] && CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart) || [];
  if (currentCart.length === 0) {
    toast("ئاگاداری", "سەبەتە بەتاڵە", "warning");
    return;
  }

  var lastItem = currentCart[currentCart.length - 1];
  var newPrice = parseFloat(keypadValue) || 0;
  if (newPrice <= 0) {
    var p = prompt("نرخی نوێ بنووسە بۆ کاڵای [" + lastItem.name + "]:", lastItem.price);
    if (!p) return;
    newPrice = parseFloat(p) || 0;
  }

  if (newPrice <= 0) {
    toast("هەڵە", "نرخ دەبێت زیاتر بێت لە سفر", "error");
    return;
  }

  lastItem.price = newPrice;
  lastItem.isOverridden = true;
  keypadValue = "0";
  updateKeypadDisplay();
  renderCartTable();
  toast("نرخی نوێ", "نرخی " + lastItem.name + " گۆڕدرا بۆ " + fmt(newPrice), "success");
}

function setOrderNotePrompt() {
  var curNote = (CUSTOMER_QUEUE[ACTIVE_CUSTOMER] && CUSTOMER_QUEUE[ACTIVE_CUSTOMER].orderNote) || "";
  var note = prompt("تێبینی بنووسە بۆ ئەم فرۆشتنە (لەسەر پسوولە چاپ دەبێت):", curNote);
  if (note !== null) {
    if (CUSTOMER_QUEUE[ACTIVE_CUSTOMER]) {
      CUSTOMER_QUEUE[ACTIVE_CUSTOMER].orderNote = note.trim();
    }
    toast("تێبینی فرۆشتن", note.trim() ? "تێبینی تۆمارکرا: " + note : "تێبینی سڕایەوە", "info");
  }
}

var APP_VERSION = "3.1.0";

// ══════════════════════════════════════
// NEW POS UI FUNCTIONS
// ══════════════════════════════════════

// Toggle POS Sidebar Drawer
function toggleSidebarMenu() {
  var sidebar = $("#sidebar");
  var overlay = $("#sidebarOverlay");
  if (!sidebar) return;
  var isOpen = sidebar.classList.contains("open") || document.body.classList.contains("pos-sidebar-open");
  if (isOpen) {
    sidebar.classList.remove("open");
    document.body.classList.remove("pos-sidebar-open");
    if (overlay) overlay.classList.remove("active");
  } else {
    sidebar.classList.add("open");
    document.body.classList.add("pos-sidebar-open");
    if (overlay) overlay.classList.add("active");
  }
}
window.toggleSidebarMenu = toggleSidebarMenu;

// Toggle More POS Modules Dropdown
function togglePosMoreDropdown(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  var menu = $("#posMoreMenu");
  if (menu) menu.classList.toggle("show");
}
window.togglePosMoreDropdown = togglePosMoreDropdown;

function closePosMoreDropdown() {
  var menu = $("#posMoreMenu");
  if (menu) menu.classList.remove("show");
}
window.closePosMoreDropdown = closePosMoreDropdown;

// Clear Current Cart (Instant, Direct, Reliable - No Confirm Modal)
function clearCurrentCart() {
  var currentCart = (CUSTOMER_QUEUE[ACTIVE_CUSTOMER] && CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart) || [];
  if (!currentCart || currentCart.length === 0) {
    toast("سەبەتە", "سەبەتە خۆی بەتاڵە!", "info");
    return;
  }
  CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart = [];
  POS_CASH_RECEIVED = 0;
  renderCart();
  toast("سەبەتە", "سەبەتە بە سەرکەوتوویی پاککرایەوە", "success");
}
window.clearCurrentCart = clearCurrentCart;

/* ═══════════════════════════════════════════════════════════════════
   QUICK ADD & FIX PRODUCT MODAL (Directly on Cashier Screen)
   Triggered whenever an unread/unknown barcode is scanned
   ═══════════════════════════════════════════════════════════════════ */
var QUICK_PROD_SCANNED_CODE = "";
var QUICK_PROD_BARCODE_TARGET = "piece";
var QUICK_PROD_BARCODE_TARGET_AT = 0;

function bindQuickProductBarcodeTarget() {
  var modal = document.getElementById("quickProductModal");
  if (!modal || modal.getAttribute("data-bc-target-bound") === "1") return;
  modal.setAttribute("data-bc-target-bound", "1");
  modal.addEventListener("focusin", function (e) {
    var id = e.target && e.target.id;
    if (id === "quickProdPackBarcode") {
      QUICK_PROD_BARCODE_TARGET = "carton";
      QUICK_PROD_BARCODE_TARGET_AT = Date.now();
    } else if (id === "quickProdBarcode") {
      QUICK_PROD_BARCODE_TARGET = "piece";
      QUICK_PROD_BARCODE_TARGET_AT = Date.now();
    }
  });
}

function updateQuickProductImagePreview() {
  var frame = document.getElementById("quickProdImagePreview");
  if (!frame) return;
  var fileInput = document.getElementById("quickProdImageFile");
  var urlIn = document.getElementById("quickProdImageUrl");
  var url = urlIn ? urlIn.value.trim() : "";
  function paint(src) {
    if (src) {
      frame.innerHTML = '<img src="' + src + '" alt="" style="width:100%;height:100%;object-fit:cover;">';
    } else {
      frame.innerHTML = '<i class="fas fa-camera" style="font-size:1.4rem;"></i>';
    }
  }
  if (fileInput && fileInput.files && fileInput.files[0]) {
    var reader = new FileReader();
    reader.onload = function (e) { paint(e.target.result); };
    reader.readAsDataURL(fileInput.files[0]);
    return;
  }
  paint(url);
}
window.updateQuickProductImagePreview = updateQuickProductImagePreview;

function readQuickProductImage(cb) {
  var fileInput = document.getElementById("quickProdImageFile");
  var urlIn = document.getElementById("quickProdImageUrl");
  var url = urlIn ? urlIn.value.trim() : "";
  function done(src) { cb(src || ""); }
  if (fileInput && fileInput.files && fileInput.files[0]) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var data = e.target.result;
      if (typeof loadImageElement === "function" && typeof compressImageElement === "function") {
        loadImageElement(data).then(function (img) {
          done(compressImageElement(img, 480) || data);
        }).catch(function () { done(data); });
      } else {
        done(data);
      }
    };
    reader.readAsDataURL(fileInput.files[0]);
    return;
  }
  done(url);
}

function openQuickAddProductModal(barcode, skipWarn) {
  if (typeof isPosOrderPaperOpen === "function" && isPosOrderPaperOpen()) return;
  QUICK_PROD_SCANNED_CODE = normalizeScannedCode(barcode);
  if (!QUICK_PROD_SCANNED_CODE) return;
  var already = (typeof findProductByScannedCodeFresh === "function")
    ? findProductByScannedCodeFresh(QUICK_PROD_SCANNED_CODE)
    : findProductByScannedCode(QUICK_PROD_SCANNED_CODE);
  if (already) {
    addKnownScannedProduct(already, QUICK_PROD_SCANNED_CODE);
    return;
  }
  var existingModal = document.getElementById("quickProductModal");
  if (existingModal && existingModal.classList.contains("active")) {
    if (typeof applyScannedBarcodeToProductForm === "function") {
      applyScannedBarcodeToProductForm(QUICK_PROD_SCANNED_CODE);
    }
    return;
  }
  if (!skipWarn) {
    flashUnknownProductWarning(QUICK_PROD_SCANNED_CODE, function () {
      var later = (typeof findProductByScannedCodeFresh === "function")
        ? findProductByScannedCodeFresh(QUICK_PROD_SCANNED_CODE)
        : findProductByScannedCode(QUICK_PROD_SCANNED_CODE);
      if (later) {
        addKnownScannedProduct(later, QUICK_PROD_SCANNED_CODE);
        return;
      }
      openQuickAddProductModal(QUICK_PROD_SCANNED_CODE, true);
    });
    return;
  }
  QUICK_PROD_BARCODE_TARGET = "piece";
  QUICK_PROD_BARCODE_TARGET_AT = 0;

  var modal = document.getElementById("quickProductModal");
  if (!modal) return;
  bindQuickProductBarcodeTarget();

  var disp = document.getElementById("quickProdBarcodeDisplay");
  var pieceIn = document.getElementById("quickProdBarcode");
  if (disp) disp.textContent = QUICK_PROD_SCANNED_CODE;
  if (pieceIn) pieceIn.value = QUICK_PROD_SCANNED_CODE;

  // Reset inputs
  var nameIn = document.getElementById("quickProdName");
  var priceIn = document.getElementById("quickProdPrice");
  var costIn = document.getElementById("quickProdCost");
  var stockIn = document.getElementById("quickProdStock");
  var catSelect = document.getElementById("quickProdCategory");
  var linkWrap = document.getElementById("quickLinkExistingWrap");

  if (nameIn) nameIn.value = "";
  if (priceIn) priceIn.value = "";
  if (costIn) costIn.value = "0";
  if (stockIn) stockIn.value = "100";
  if (linkWrap) linkWrap.style.display = "none";
  var unitIn = document.getElementById("quickProdUnit");
  var minIn = document.getElementById("quickProdMinAlert");
  var wholeIn = document.getElementById("quickProdWholesale");
  var packQtyIn = document.getElementById("quickProdPackQty");
  var packPriceIn = document.getElementById("quickProdPackPrice");
  var packCostIn = document.getElementById("quickProdPackCost");
  var packBcIn = document.getElementById("quickProdPackBarcode");
  var expiryIn = document.getElementById("quickProdExpiry");
  var imgFile = document.getElementById("quickProdImageFile");
  var imgUrl = document.getElementById("quickProdImageUrl");
  if (unitIn) unitIn.value = "piece";
  if (minIn) minIn.value = "5";
  if (wholeIn) wholeIn.value = "";
  if (packQtyIn) packQtyIn.value = "1";
  if (packPriceIn) packPriceIn.value = "";
  if (packCostIn) packCostIn.value = "";
  if (packBcIn) packBcIn.value = "";
  if (expiryIn) expiryIn.value = "";
  if (imgFile) imgFile.value = "";
  if (imgUrl) imgUrl.value = "";
  updateQuickProductImagePreview();

  if (catSelect) {
    fillCategorySelectEl(catSelect, preferredProductAssignId(), false);
  }

  // Populate existing products for "Fix item" option
  var existSelect = document.getElementById("quickExistingProductSelect");
  if (existSelect) {
    var existHtml = '<option value="">-- هەڵبژاردنی کاڵای پێشوو بۆ نوێکردنەوەی بارکۆد --</option>';
    (DB.products || []).forEach(function (p) {
      existHtml += '<option value="' + p.id + '">' + p.name + ' (' + fmt(p.price) + ')' + '</option>';
    });
    existSelect.innerHTML = existHtml;
  }

  if (typeof applyQuickProductKindPreset === "function") applyQuickProductKindPreset("grocery");
  fillFavGroupSelect(document.getElementById("qFavCategory"), "");
  showModal("quickProductModal");
  if (typeof setupModalEnterToNext === "function") setupModalEnterToNext("quickProductModal");

  setTimeout(function () {
    if (nameIn) nameIn.focus();
  }, 120);
}
window.openQuickAddProductModal = openQuickAddProductModal;

function closeQuickProductModal() {
  hideModal("quickProductModal");
  // Restore focus to scanner input
  var bInput = document.getElementById("headerSearchInput") || document.getElementById("barcodeInput");
  if (bInput) bInput.focus();
}
window.closeQuickProductModal = closeQuickProductModal;

function toggleQuickLinkExisting() {
  var wrap = document.getElementById("quickLinkExistingWrap");
  if (wrap) {
    wrap.style.display = (wrap.style.display === "none" || !wrap.style.display) ? "block" : "none";
  }
}
window.toggleQuickLinkExisting = toggleQuickLinkExisting;

function applyExistingProductToQuickModal() {
  var select = document.getElementById("quickExistingProductSelect");
  if (!select || !select.value) return;
  var prod = (DB.products || []).find(function (p) { return p.id === select.value; });
  if (!prod) return;

  var nameIn = document.getElementById("quickProdName");
  var priceIn = document.getElementById("quickProdPrice");
  var costIn = document.getElementById("quickProdCost");
  var catSelect = document.getElementById("quickProdCategory");

  if (nameIn) nameIn.value = prod.name;
  if (priceIn) priceIn.value = prod.price;
  if (costIn) costIn.value = prod.cost || 0;
  if (catSelect && prod.cat) catSelect.value = prod.cat;
  var unitIn = document.getElementById("quickProdUnit");
  var minIn = document.getElementById("quickProdMinAlert");
  var wholeIn = document.getElementById("quickProdWholesale");
  var packQtyIn = document.getElementById("quickProdPackQty");
  var packPriceIn = document.getElementById("quickProdPackPrice");
  var packCostIn = document.getElementById("quickProdPackCost");
  var packBcIn = document.getElementById("quickProdPackBarcode");
  var expiryIn = document.getElementById("quickProdExpiry");
  var imgUrl = document.getElementById("quickProdImageUrl");
  if (unitIn) unitIn.value = prod.unit || "piece";
  if (minIn) minIn.value = prod.minAlert != null ? prod.minAlert : 5;
  if (wholeIn) wholeIn.value = prod.wholesalePrice || "";
  if (packQtyIn) packQtyIn.value = prod.packQty || 1;
  if (packPriceIn) packPriceIn.value = prod.packPrice || "";
  if (packCostIn) packCostIn.value = prod.packCost || "";
  if (packBcIn) packBcIn.value = prod.packBarcode || "";
  if (expiryIn) expiryIn.value = prod.expiryDate || "";
  if (imgUrl) imgUrl.value = prod.image && String(prod.image).indexOf("data:") !== 0 ? prod.image : "";
  updateQuickProductImagePreview();
  if (typeof setQuickProductFeature === "function") {
    setQuickProductFeature("stock", productTracksStock(prod));
    setQuickProductFeature("expiry", productTracksExpiry(prod));
    setQuickProductFeature("pack", productTracksPack(prod));
  }
  fillFavGroupSelect(document.getElementById("qFavCategory"), getProductFavGroupId(prod));
}
window.applyExistingProductToQuickModal = applyExistingProductToQuickModal;

function saveQuickProductAndAddToCart() {
  if (saveQuickProductAndAddToCart._busy) return;
  var name = ($("#quickProdName") ? $("#quickProdName").value : "").trim();
  var price = parseFloat($("#quickProdPrice") ? $("#quickProdPrice").value : 0);
  var cost = parseFloat($("#quickProdCost") ? $("#quickProdCost").value : 0) || 0;
  var stock = parseInt($("#quickProdStock") ? $("#quickProdStock").value : 100, 10) || 100;
  var qPicked = readProductAssignChoice($("#quickProdCategory") ? $("#quickProdCategory").value : "all");
  var cat = qPicked.cat || "";
  var qFavPick = readFavGroupSelect("qFavCategory");
  if (qPicked.origin === "fav" && !qFavPick) {
    var qFavG = (typeof ensureDefaultFavCategory === "function") ? ensureDefaultFavCategory() : null;
    qFavPick = qFavG && qFavG.id ? qFavG.id : "";
  }
  var barcode = normalizeScannedCode((($("#quickProdBarcode") ? $("#quickProdBarcode").value : "") || QUICK_PROD_SCANNED_CODE || ""));
  var unit = ($("#quickProdUnit") ? $("#quickProdUnit").value : "") || "piece";
  var minAlert = parseFloat($("#quickProdMinAlert") ? $("#quickProdMinAlert").value : 5) || 5;
  var wholesale = parseFloat($("#quickProdWholesale") ? $("#quickProdWholesale").value : 0) || 0;
  var packQty = parseFloat($("#quickProdPackQty") ? $("#quickProdPackQty").value : 1) || 1;
  var packPrice = parseFloat($("#quickProdPackPrice") ? $("#quickProdPackPrice").value : 0) || 0;
  var packCost = parseFloat($("#quickProdPackCost") ? $("#quickProdPackCost").value : 0) || 0;
  var packBarcode = normalizeScannedCode($("#quickProdPackBarcode") ? $("#quickProdPackBarcode").value : "");
  var expiryDate = ($("#quickProdExpiry") ? $("#quickProdExpiry").value : "") || "";
  var trackStock = typeof isQuickFeatureOn === "function" ? (isQuickFeatureOn("stock") ? 1 : 0) : 1;
  var trackExpiry = typeof isQuickFeatureOn === "function" ? (isQuickFeatureOn("expiry") ? 1 : 0) : 1;
  var trackPack = typeof isQuickFeatureOn === "function" ? (isQuickFeatureOn("pack") ? 1 : 0) : 1;

  if (!name) {
    toast("ئاگاداری", "تکایە ناوی بەرهەم بنووسە", "warning");
    var nIn = $("#quickProdName");
    if (nIn) nIn.focus();
    return;
  }

  if (isNaN(price) || price < 0) {
    toast("ئاگاداری", "تکایە نرخی فرۆشتن بنووسە", "warning");
    var pIn = $("#quickProdPrice");
    if (pIn) pIn.focus();
    return;
  }

  saveQuickProductAndAddToCart._busy = true;
  readQuickProductImage(function (imageUrl) {
    try {
      var existSelect = document.getElementById("quickExistingProductSelect");
      var selectedExistId = existSelect ? existSelect.value : null;
      var targetProd = null;
      if (selectedExistId) {
        targetProd = (DB.products || []).find(function (p) { return p.id === selectedExistId; });
      }
      if (targetProd) {
        targetProd.barcode = barcode;
        targetProd.name = name;
        targetProd.price = price;
        if (cost > 0) targetProd.cost = cost;
        targetProd.cat = cat;
        targetProd.unit = unit;
        targetProd.minAlert = minAlert;
        if (wholesale > 0) targetProd.wholesalePrice = wholesale;
        targetProd.packQty = packQty;
        targetProd.packPrice = packPrice;
        targetProd.packCost = packCost;
        if (packBarcode) targetProd.packBarcode = packBarcode;
        if (expiryDate) targetProd.expiryDate = expiryDate;
        targetProd.trackStock = trackStock;
        targetProd.trackExpiry = trackExpiry;
        targetProd.trackPack = trackPack;
        if (!trackStock) targetProd.stock = targetProd.stock || 0;
        if (!trackPack) {
          targetProd.packBarcode = "";
        }
        if (imageUrl) {
          targetProd.image = imageUrl;
          if (typeof setCachedImage === "function") setCachedImage(targetProd.id, imageUrl);
        }
        applyFavGroupToProduct(targetProd, qFavPick);
      } else {
        targetProd = {
          id: gid(),
          name: name,
          price: price,
          cost: cost,
          barcode: barcode,
          stock: stock,
          minAlert: minAlert,
          cat: cat,
          unit: unit,
          wholesalePrice: wholesale,
          packQty: packQty,
          packPrice: packPrice,
          packCost: packCost,
          packBarcode: trackPack ? packBarcode : "",
          expiryDate: trackExpiry ? expiryDate : "",
          trackStock: trackStock,
          trackExpiry: trackExpiry,
          trackPack: trackPack,
          image: imageUrl || "",
          quickFavorite: 0,
          quickFavoriteAt: 0,
          favCatId: "",
          sortOrder: nextProductSortOrder()
        };
        applyFavGroupToProduct(targetProd, qFavPick);
        if (!trackStock) targetProd.stock = 0;
        DB.products.push(targetProd);
        if (imageUrl && typeof setCachedImage === "function") setCachedImage(targetProd.id, imageUrl);
        markProductIncompleteFromPos(targetProd.id);
      }

      DataStore.saveProducts();
      if (typeof ApiClient !== "undefined" && ApiClient.saveProduct) {
        ApiClient.saveProduct(targetProd).catch(function (err) {
          toast("ئاگاداری", "کاڵا لەم ئامێرە پاشەکەوت بوو، بەڵام سێرڤەر وەری نەگرت: " + (err && err.message ? err.message : ""), "warning");
        });
      }
      renderProducts();
      renderPosGrid();
      if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
      if (typeof renderProductGrid === "function") renderProductGrid(targetProd.cat || POS_GRID_CATEGORY);
      if (typeof renderPosQuickRow === "function") renderPosQuickRow();

      var qty = (typeof getPendingScanQty === "function") ? getPendingScanQty() : 1;
      addToCart(targetProd.id, qty, "piece");
      if (typeof resetPendingScanQty === "function") resetPendingScanQty();
      closeQuickProductModal();
      toast("سەرکەوتوو", targetProd.name + " (" + fmt(targetProd.price) + " د.ع) زیادکرا بۆ سەبەتە", "success");
    } finally {
      saveQuickProductAndAddToCart._busy = false;
    }
  });
}
window.saveQuickProductAndAddToCart = saveQuickProductAndAddToCart;

// Keyboard handler inside Quick Product Modal (Esc closes; Enter moves to next field)
document.addEventListener("keydown", function (e) {
  var quickModal = document.getElementById("quickProductModal");
  if (quickModal && quickModal.classList.contains("active")) {
    if (e.key === "Escape") {
      closeQuickProductModal();
    }
  }
});

// Update header date and time (Luxury 12-Hour Live Clock with Ticking Seconds)
function updateHeaderDateTime() {
  var now = new Date();
  var dateEl = $("#headerDate");
  var timeEl = $("#headerTime");
  var ampmEl = $("#headerAmPm");
  
  var hours = now.getHours();
  var ampm = hours >= 12 ? "PM" : "AM";
  var h = hours % 12;
  if (h === 0) h = 12;
  var hStr = String(h).padStart(2, "0");
  var mStr = String(now.getMinutes()).padStart(2, "0");
  var sStr = String(now.getSeconds()).padStart(2, "0");

  if (timeEl) {
    timeEl.textContent = hStr + ":" + mStr + ":" + sStr;
  }
  if (ampmEl) {
    ampmEl.textContent = ampm;
  }
  
  if (dateEl) {
    var d = String(now.getDate()).padStart(2, "0");
    var mo = String(now.getMonth() + 1).padStart(2, "0");
    var y = now.getFullYear();
    var days = ["یەکشەممە", "دووشەممە", "سێشەممە", "چوارشەممە", "پێنجشەممە", "هەینی", "شەممە"];
    var dayName = days[now.getDay()];
    dateEl.textContent = dayName + " " + d + "/" + mo + "/" + y;
  }
}

// Initialize header date/time
function initHeaderDateTime() {
  updateHeaderDateTime();
  setInterval(updateHeaderDateTime, 1000);
}

// Numeric keypad functionality
var keypadValue = "0";

function updateKeypadDisplay() {
  var display = $("#keypadDisplay");
  if (display) display.textContent = keypadValue;
}

function handleKeypadInput(key) {
  if (key === "backspace") {
    keypadValue = keypadValue.length > 1 ? keypadValue.slice(0, -1) : "0";
  } else if (key === "enter") {
    // Enter key - could be used to confirm quantity or price
    toast("تەواو", "بەها: " + keypadValue, "success");
    keypadValue = "0";
  } else if (key === "+" || key === "-") {
    // Could implement calculator functionality
    toast("زانیاری", "کاڵکۆڵەیتەر", "info");
  } else if (key === ".") {
    if (!keypadValue.includes(".")) {
      keypadValue += ".";
    }
  } else {
    if (keypadValue === "0") {
      keypadValue = key;
    } else {
      keypadValue += key;
    }
  }
  updateKeypadDisplay();
}

// Initialize keypad
function initKeypad() {
  var keypadBtns = $$(".keypad-btn");
  keypadBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      var key = this.getAttribute("data-key");
      handleKeypadInput(key);
    });
  });
}

// New POS UI state
var POS_GRID_PAGE = 1;
var POS_GRID_PAGE_SIZE = 16;
var POS_GRID_CATEGORY = "all";
var POS_GRID_SEARCH = "";
var POS_GRID_FIT_LOCK = false;
var POS_GRID_RESIZE_TIMER = null;

function getPosGridColumnCount() {
  var n = parseInt(document.documentElement.getAttribute("data-cashier-grid-cols") || "4", 10);
  if (n === 3 || n === 5) return n;
  try {
    var grid = document.getElementById("productGrid");
    if (grid) {
      var computed = window.getComputedStyle(grid).gridTemplateColumns;
      if (computed && computed !== "none") {
        var parts = computed.split(" ").filter(function (p) { return p && p !== "0px"; });
        if (parts.length >= 2 && parts.length <= 6) return parts.length;
      }
    }
  } catch (e) {}
  if (window.innerWidth <= 1400 && window.innerWidth > 1100) return 3;
  return 4;
}

function estimatePosProductCardHeight(cols) {
  var imagesOff = document.documentElement.getAttribute("data-pos-view-images") === "off";
  if (imagesOff) return 72;
  if (cols === 3) return 186;
  if (cols === 5) return 138;
  return 162;
}

function fitPosGridPageSize() {
  var cols = getPosGridColumnCount();
  var grid = document.getElementById("productGrid");
  var h = grid ? grid.clientHeight : 0;
  if (h < 80) {
    var card = document.querySelector("#posSection .products-card");
    var tabs = document.getElementById("posCategoryTabs");
    if (card && card.clientHeight > 80) {
      var quick = document.getElementById("posQuickRow");
      var quickH = (quick && !quick.hidden && quick.offsetHeight) ? quick.offsetHeight : 0;
      h = card.clientHeight - (tabs ? tabs.offsetHeight : 42) - quickH - 8;
    }
  }
  if (h < 80) h = Math.max(240, (window.innerHeight || 900) - 300);
  var sample = grid && grid.querySelector(".product-item");
  var itemH = (sample && sample.offsetHeight >= 60) ? sample.offsetHeight : estimatePosProductCardHeight(cols);
  var gap = 6;
  function sizeFor(avail) {
    var rows = Math.max(1, Math.floor((avail + gap) / (itemH + gap)));
    return rows * cols;
  }
  var size = sizeFor(h);
  var count = 0;
  try { count = getFilteredPosProducts(POS_GRID_CATEGORY).length; } catch (eCount) {}
  if (count > size) size = sizeFor(Math.max(itemH, h - 36));
  if (size < cols) size = cols;
  POS_GRID_PAGE_SIZE = size;
  return size;
}

function schedulePosGridRefit() {
  if (POS_GRID_RESIZE_TIMER) clearTimeout(POS_GRID_RESIZE_TIMER);
  POS_GRID_RESIZE_TIMER = setTimeout(function () {
    POS_GRID_RESIZE_TIMER = null;
    var pos = document.getElementById("posSection");
    if (pos && pos.classList.contains("active") && typeof renderProductGrid === "function") {
      fitPosGridPageSize();
      renderProductGrid(POS_GRID_CATEGORY);
    }
  }, 120);
}

function renderPosCategoryTabs() {
  var container = $("#posCategoryTabs");
  if (!container) return;
  if (typeof migrateLegacyQuickFavorites === "function") migrateLegacyQuickFavorites();
  var fav = ensureDefaultFavCategory();
  var favId = favTabId(fav.id);
  var cats = getCashierCategories();
  ensureVisiblePosCategorySelected();
  var active = POS_GRID_CATEGORY || "all";
  if (active !== "all" && !isFavTabId(active) && !cats.some(function (c) { return c.id === active; })) {
    active = firstVisiblePosTab();
    POS_GRID_CATEGORY = active;
  }
  var showAll = isPosTabVisible("all");
  var showFav = isPosTabVisible("fav");
  var visCats = cats.filter(function (c) { return isPosTabVisible(c.id); });
  if (!showAll && !showFav && !visCats.length) {
    showAll = true;
    showFav = true;
  }
  var allTab = (typeof getOriginTab === "function") ? getOriginTab("all") : { name: "هەموو", icon: "fa-th-large", color: "#10b981", image: "" };
  var favTab = (typeof getOriginTab === "function") ? getOriginTab("fav") : { name: "دڵخواز", icon: "fa-star", color: "#fbbf24", image: "" };
  var sig = [showAll ? "1" : "0", showFav ? "1" : "0", favId || "", allTab.name + ":" + (allTab.image || "") + ":" + (allTab.icon || "") + ":" + (allTab.color || ""), favTab.name + ":" + (favTab.image || "") + ":" + (favTab.icon || "") + ":" + (favTab.color || ""), visCats.map(function (c) { return c.id + ":" + (c.name || "") + ":" + (c.icon || "") + ":" + (c.color || "") + ":" + String(c.sortOrder || 0); }).join(",")].join("|");
  if (container.getAttribute("data-cat-sig") === sig && container.querySelector(".category-tab")) {
    container.querySelectorAll(".category-tab").forEach(function (t) {
      t.classList.toggle("active", (t.getAttribute("data-category") || "all") === active);
    });
    return;
  }
  var scrollLeft = container.scrollLeft;
  container.setAttribute("data-cat-sig", sig);
  var html = "";
  if (showAll) {
    html += '<button type="button" class="category-tab' + (active === "all" ? " active" : "") + '" data-category="all">' +
      buildCategoryMediaHtml(allTab, "lux-media-tile-sm") +
      ' <span>' + String(allTab.name || "هەموو").replace(/</g, "") + '</span></button>';
  }
  if (showFav) {
    html += '<button type="button" class="category-tab is-fav-tab' + (active === favId ? " active" : "") + '" data-category="' + String(favId).replace(/"/g, "") + '">' +
      buildCategoryMediaHtml(favTab, "lux-media-tile-sm") +
      '<span>' + String(favTab.name || "دڵخواز").replace(/</g, "") + '</span>' +
      '</button>';
  }
  visCats.forEach(function (c) {
    html += '<button type="button" class="category-tab is-real-cat' + (active === c.id ? " active" : "") + '" data-category="' + String(c.id).replace(/"/g, "") + '">' +
      buildCategoryMediaHtml(c, "lux-media-tile-sm") +
      '<span>' + String(c.name || "").replace(/</g, "") + '</span></button>';
  });
  if (canManageCategories()) {
    html += '<button type="button" class="category-tab fav-tab-add" data-category="__add_cat__" title="زیادکردنی پۆل"><i class="fas fa-plus"></i></button>';
  }
  container.innerHTML = html;
  fillAllFavGroupSelects();
  container.querySelectorAll(".category-tab").forEach(function (tab) {
    tab.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var cat = tab.getAttribute("data-category") || "all";
      if (cat === "__add_cat__") {
        openCategoryModal();
        return;
      }
      container.querySelectorAll(".category-tab").forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      POS_GRID_CATEGORY = cat;
      POS_GRID_PAGE = 1;
      renderProductGrid(POS_GRID_CATEGORY);
    });
  });
  container.scrollLeft = scrollLeft;
}

function getFilteredPosProducts(category) {
  var products = DB.products || [];
  var cat = category || POS_GRID_CATEGORY || "all";
  var search = (POS_GRID_SEARCH || "").toLowerCase();
  var list = products.filter(function (p) {
    var catOk = false;
    if (cat === "all") {
      catOk = true;
    } else if (cat === "__none__") {
      catOk = !productCategoryIsReal(p.cat);
    } else if (isFavTabId(cat)) {
      catOk = isProductQuickFavorite(p) && getProductFavGroupId(p) === favGroupIdFromTab(cat);
    } else if (cat === "fast_nobarcode") {
      var bc = String(p.barcode || "").trim();
      var isShortOrEmpty = !bc || bc.length <= 6;
      var isScale = (p.unit === "kg" || p.unit === "gram" || p.isScaleItem);
      var nm = String(p.name || "");
      var isDailyFast = /نان|سەمون|هێلکە|ئاو|سەهۆڵ|کیسە|چا|شەکر|تەماتە|پەتاتە|خەیار|سێو|مۆز/i.test(nm);
      catOk = isShortOrEmpty || isScale || isDailyFast;
    } else {
      catOk = (p.cat === cat);
    }
    var searchOk = !search || p.name.toLowerCase().indexOf(search) !== -1 || String(p.barcode || "").indexOf(search) !== -1;
    return catOk && searchOk;
  });
  if (isFavTabId(cat)) {
    list.sort(function (a, b) { return (b.quickFavoriteAt || 0) - (a.quickFavoriteAt || 0); });
  } else {
    list.sort(compareSortOrder);
  }
  return list;
}

function renderProductPagination(totalPages) {
  var wrap = $("#productPagination");
  if (!wrap) return;
  if (totalPages <= 1) {
    wrap.innerHTML = "";
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "flex";
  var cur = Math.max(1, Math.min(POS_GRID_PAGE || 1, totalPages));
  POS_GRID_PAGE = cur;
  var windowSize = 5;
  var start = Math.max(1, cur - 2);
  var end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  var prev = Math.max(1, cur - 1);
  var next = Math.min(totalPages, cur + 1);
  var html = "";
  html += '<button type="button" class="pagination-btn pagination-edge" onclick="goPosProductPage(1)"' + (cur <= 1 ? " disabled" : "") + ' title="یەکەم لاپەڕە"><i class="fas fa-angle-double-right"></i> یەکەم</button>';
  html += '<button type="button" class="pagination-btn pagination-nav" onclick="goPosProductPage(' + prev + ')"' + (cur <= 1 ? " disabled" : "") + ' title="پێشوو"><i class="fas fa-angle-right"></i></button>';
  if (start > 1) {
    html += '<button type="button" class="pagination-btn" onclick="goPosProductPage(1)">1</button>';
    if (start > 2) html += '<span class="pagination-ellipsis">…</span>';
  }
  for (var i = start; i <= end; i++) {
    html += '<button type="button" class="pagination-btn' + (i === cur ? " active" : "") + '" onclick="goPosProductPage(' + i + ')">' + i + '</button>';
  }
  if (end < totalPages) {
    if (end < totalPages - 1) html += '<span class="pagination-ellipsis">…</span>';
    html += '<button type="button" class="pagination-btn" onclick="goPosProductPage(' + totalPages + ')">' + totalPages + '</button>';
  }
  html += '<button type="button" class="pagination-btn pagination-nav" onclick="goPosProductPage(' + next + ')"' + (cur >= totalPages ? " disabled" : "") + ' title="دواتر"><i class="fas fa-angle-left"></i></button>';
  html += '<button type="button" class="pagination-btn pagination-edge" onclick="goPosProductPage(' + totalPages + ')"' + (cur >= totalPages ? " disabled" : "") + ' title="کۆتایی لاپەڕە">کۆتایی <i class="fas fa-angle-double-left"></i></button>';
  wrap.innerHTML = html;
}

function goPosProductPage(page) {
  POS_GRID_PAGE = Math.max(1, parseInt(page, 10) || 1);
  renderProductGrid(POS_GRID_CATEGORY);
}

function getProductSalesQtyMap() {
  var map = {};
  var orders = (typeof incomeOrders === "function") ? incomeOrders(DB.orders || []) : (DB.orders || []);
  orders.forEach(function (o) {
    (o.items || []).forEach(function (it) {
      if (!it) return;
      var pid = it.prodId || it.productId || it.id;
      if (!pid) return;
      var q = parseFloat(it.qty) || 0;
      if (it.unitType === "carton" && it.packQty) q = q * (parseFloat(it.packQty) || 1);
      map[pid] = (map[pid] || 0) + q;
    });
  });
  return map;
}

function getPosQuickProducts() {
  var MAX = 12;
  var MIN_FILL = 8;
  var products = (DB.products || []).filter(function (p) { return p && p.id; });
  var seen = {};
  var out = [];
  products.filter(isProductQuickFavorite).sort(function (a, b) {
    return (b.quickFavoriteAt || 0) - (a.quickFavoriteAt || 0);
  }).forEach(function (p) {
    if (out.length >= MAX || seen[p.id]) return;
    seen[p.id] = true;
    out.push(p);
  });
  var soldMap = getProductSalesQtyMap();
  products.filter(function (p) {
    return !seen[p.id] && (soldMap[p.id] || 0) > 0 && (!productTracksStock(p) || (parseFloat(p.stock) || 0) > 0);
  }).sort(function (a, b) {
    return (soldMap[b.id] || 0) - (soldMap[a.id] || 0);
  }).forEach(function (p) {
    if (out.length >= MAX) return;
    seen[p.id] = true;
    out.push(p);
  });
  if (!out.length) {
    products.filter(function (p) {
      return !productTracksStock(p) || (parseFloat(p.stock) || 0) > 0;
    }).slice().reverse().slice(0, MIN_FILL).forEach(function (p) {
      out.push(p);
    });
  }
  return out.slice(0, MAX);
}

function posQuickCartClick(p) {
  if (!p) return "return";
  if (p.unit === "kg" || p.unit === "gram" || p.isScaleItem) return "addToCart('" + p.id + "')";
  return "addToCart('" + p.id + "', 1, 'piece')";
}

function renderPosQuickRow() {
  var row = document.getElementById("posQuickRow");
  if (!row) return;
  row.hidden = true;
  row.classList.remove("is-on");
  row.innerHTML = "";
}

function toggleQuickFavorite(id, ev) {
  if (ev) {
    if (ev.preventDefault) ev.preventDefault();
    if (ev.stopPropagation) ev.stopPropagation();
  }
  var p = (DB.products || []).find(function (x) { return x && x.id === id; });
  if (!p) return;
  var viewingFav = isFavTabId(POS_GRID_CATEGORY) ? favGroupIdFromTab(POS_GRID_CATEGORY) : "";
  if (isProductQuickFavorite(p) && (!viewingFav || getProductFavGroupId(p) === viewingFav)) {
    applyFavGroupToProduct(p, "");
  } else {
    applyFavGroupToProduct(p, viewingFav || LAST_FAV_GROUP_ID || ensureDefaultFavCategory().id);
  }
  if (typeof DataStore !== "undefined" && DataStore.saveProducts) DataStore.saveProducts();
  if (typeof ApiClient !== "undefined" && ApiClient.saveProduct) {
    ApiClient.saveProduct(p).catch(function () {});
  }
  renderPosQuickRow();
  if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
  if (typeof renderProductGrid === "function") renderProductGrid(POS_GRID_CATEGORY);
  if (typeof renderProducts === "function") renderProducts();
}
window.toggleQuickFavorite = toggleQuickFavorite;
window.renderPosQuickRow = renderPosQuickRow;
window.getPosQuickProducts = getPosQuickProducts;

function addQuickNoBarcodeItem(itemName, defaultPrice, askCustom) {
  var name = itemName || "کاڵای خێرای بێ بارکۆد";
  var price = parseFloat(defaultPrice) || 0;
  if (askCustom) {
    var pStr = prompt("نرخی کاڵا بە دینار بنووسە (نموونە: 1000):", defaultPrice || 1000);
    if (pStr === null) return;
    price = parseFloat(String(pStr).replace(/,/g, "")) || 0;
    if (price <= 0) {
      toast("ئاگاداری", "تکایە نرخێکی دروست بنووسە", "warning");
      return;
    }
    var nStr = prompt("ناوی کاڵاکە (ئارەزوومەندانە):", name);
    if (nStr && nStr.trim()) name = nStr.trim();
  }
  var currentCart = CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart;
  var customId = "quick_" + name + "_" + price;
  var existing = currentCart.find(function (c) { return c.cartItemId === customId; });
  if (existing) {
    existing.qty += 1;
  } else {
    currentCart.push({
      prodId: customId,
      cartItemId: customId,
      name: name,
      price: price,
      cost: Math.round(price * 0.8),
      qty: 1,
      unitType: "piece",
      packQty: 1
    });
  }
  if (typeof PosAudio !== "undefined") PosAudio.playBeep();
  renderCart();
}

function renderProductGrid(category) {
  var grid = $("#productGrid");
  if (!grid) return;

  if (category) POS_GRID_CATEGORY = category;
  if (POS_GRID_CATEGORY === "fast_nobarcode") POS_GRID_CATEGORY = "all";
  if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
  var tabs = document.getElementById("posCategoryTabs");
  if (tabs) {
    tabs.querySelectorAll(".category-tab").forEach(function (t) {
      t.classList.toggle("active", (t.getAttribute("data-category") || "all") === POS_GRID_CATEGORY);
    });
  }
  if (!POS_GRID_FIT_LOCK) fitPosGridPageSize();
  renderPosQuickRow();
  var filteredProducts = getFilteredPosProducts(POS_GRID_CATEGORY);
  var totalPages = Math.max(1, Math.ceil(filteredProducts.length / POS_GRID_PAGE_SIZE));
  if (POS_GRID_PAGE > totalPages) POS_GRID_PAGE = totalPages;
  var start = (POS_GRID_PAGE - 1) * POS_GRID_PAGE_SIZE;
  var pageProducts = filteredProducts.slice(start, start + POS_GRID_PAGE_SIZE);

  var quickPresetsHtml = "";

  if (filteredProducts.length === 0 && !quickPresetsHtml) {
    grid.innerHTML = '<div class="pos-empty-state"><i class="fas fa-box-open"></i><p>هیچ بەرهەمێک نییە</p></div>';
    renderProductPagination(0);
    return;
  }

  grid.innerHTML = quickPresetsHtml + pageProducts.map(function (p) {
    var disabled = (productTracksStock(p) && p.stock <= 0) ? " product-item-disabled" : "";
    var imageHtml = buildImageHtml(p.id, p.name, p.image);

    // Expiry badge
    var expiryBadge = "";
    if (productTracksExpiry(p) && p.expiryDate) {
      var expDate = new Date(p.expiryDate);
      var today = new Date();
      today.setHours(0,0,0,0);
      expDate.setHours(0,0,0,0);
      var daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
      if (daysLeft < 0) {
        expiryBadge = '<span class="pos-expiry-badge exp-expired" style="position:absolute;top:4px;left:4px;background:#7f1d1d;color:#fecaca;font-size:0.62rem;font-weight:800;padding:2px 5px;border-radius:4px;z-index:2;border:1px solid #ef4444;"><i class="fas fa-ban"></i> بەسەرچووە</span>';
      } else if (daysLeft <= 3) {
        expiryBadge = '<span class="pos-expiry-badge exp-crit" style="position:absolute;top:4px;left:4px;background:#dc2626;color:#fff;font-size:0.62rem;font-weight:800;padding:2px 5px;border-radius:4px;z-index:2;box-shadow:0 0 8px rgba(220,38,38,0.8);"><i class="fas fa-radiation"></i> ' + daysLeft + ' ڕۆژ</span>';
      } else if (daysLeft <= 7) {
        expiryBadge = '<span class="pos-expiry-badge exp-warn" style="position:absolute;top:4px;left:4px;background:#d97706;color:#fff;font-size:0.62rem;font-weight:800;padding:2px 5px;border-radius:4px;z-index:2;"><i class="fas fa-clock"></i> ' + daysLeft + ' ڕۆژ</span>';
      }
    }

    // Clearance & Offer price calculation
    var priceDisplay = fmt(p.price);
    var clearanceDisc = parseFloat(p.clearanceDiscount) || 0;
    var gridOffer = (typeof getOfferInfo === "function") ? getOfferInfo(p) : { active: false };
    if (gridOffer.active) {
      priceDisplay = '<div style="display:flex;align-items:center;justify-content:center;gap:4px;flex-wrap:wrap;">' +
        '<del style="opacity:0.6;font-size:0.75rem;color:var(--text-muted);">' + fmt(p.price) + '</del> ' +
        '<strong style="color:#ef4444;font-size:0.95rem;">' + fmt(gridOffer.offerPrice) + '</strong> ' +
        '<span style="background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:0.6rem;padding:1px 5px;border-radius:3px;font-weight:800;"><i class="fas fa-fire"></i> -%' + gridOffer.percent + ' ئۆفەر</span>' +
      '</div>';
    } else if (clearanceDisc > 0) {
      var promoPrice = (parseFloat(p.clearancePrice) > 0) ? parseFloat(p.clearancePrice) : Math.round(p.price * (1 - clearanceDisc / 100));
      priceDisplay = '<div style="display:flex;align-items:center;justify-content:center;gap:4px;flex-wrap:wrap;">' +
        '<del style="opacity:0.6;font-size:0.75rem;color:var(--text-muted);">' + fmt(p.price) + '</del> ' +
        '<strong style="color:#ef4444;font-size:0.95rem;">' + fmt(promoPrice) + '</strong> ' +
        '<span style="background:#ef4444;color:#fff;font-size:0.6rem;padding:1px 4px;border-radius:3px;font-weight:800;">-%' + clearanceDisc + ' پاکتاو</span>' +
      '</div>';
    }

    var packBtn = "";
    if (productTracksPack(p) && (p.packQty > 1 || p.packPrice > 0) && (!productTracksStock(p) || p.stock > 0)) {
      var packPrice = p.packPrice > 0 ? p.packPrice : (p.price * (p.packQty || 1));
      packBtn = '<button type="button" class="btn-pos-pack" onclick="event.stopPropagation();addToCart(\'' + p.id + '\', 1, \'carton\')" title="فرۆشتنی ١ کارتۆن (' + (p.packQty || 1) + ' دانە)"><i class="fas fa-box"></i> کارتۆن: ' + fmt(packPrice) + '</button>';
    }
    var isWeightedItem = (p.unit === "kg" || p.unit === "gram" || p.isScaleItem);
    var clickCall = isWeightedItem ? "addToCart('" + p.id + "')" : "addToCart('" + p.id + "', 1, 'piece')";
    var favOn = isProductQuickFavorite(p);
    return '<div class="product-item' + disabled + '" style="position:relative;" onclick="' + clickCall + '">' +
      expiryBadge +
      '<button type="button" class="pos-quick-star' + (favOn ? " is-on" : "") + '" onclick="event.stopPropagation();toggleQuickFavorite(\'' + p.id + '\', event)" title="دڵخواز"><i class="fas fa-star"></i></button>' +
      '<div class="product-image">' + imageHtml + '</div>' +
      '<div class="product-name">' + p.name + '</div>' +
      '<div class="product-price">' + priceDisplay + '</div>' +
      packBtn +
      '</div>';
  }).join("");

  renderProductPagination(totalPages);
  if (!POS_GRID_FIT_LOCK) {
    requestAnimationFrame(function () {
      var before = POS_GRID_PAGE_SIZE;
      fitPosGridPageSize();
      if (POS_GRID_PAGE_SIZE !== before) {
        POS_GRID_FIT_LOCK = true;
        try { renderProductGrid(POS_GRID_CATEGORY); } finally { POS_GRID_FIT_LOCK = false; }
      }
    });
  }
}

function getCartEmptyInnerHtml() {
  return (
    '<div class="cart-empty-stage">' +
      '<div class="cart-empty-art" aria-hidden="true">' +
        '<span class="cart-empty-glow"></span>' +
        '<span class="cart-empty-frame"><span class="tl"></span><span class="tr"></span><span class="bl"></span><span class="br"></span></span>' +
        '<svg class="cart-empty-svg" viewBox="0 0 160 160" fill="none">' +
          '<circle class="cart-empty-orbit" cx="80" cy="80" r="68"></circle>' +
          '<path class="cart-empty-bag-handle" d="M30 44h24c5 0 9 3 11 8"></path>' +
          '<path class="cart-empty-bag-handle" d="M30 44v14"></path>' +
          '<path class="cart-empty-bag-body" d="M46 54h76l-11 46H59L46 54z"></path>' +
          '<path class="cart-empty-bag-fold" d="M56 70h56"></path>' +
          '<path class="cart-empty-bag-fold" d="M62 84h46"></path>' +
          '<g class="cart-empty-barcode">' +
            '<rect x="68" y="60" width="3" height="18" rx="1"></rect>' +
            '<rect x="74" y="60" width="2" height="18" rx="1"></rect>' +
            '<rect x="79" y="60" width="5" height="18" rx="1"></rect>' +
            '<rect x="87" y="60" width="2" height="18" rx="1"></rect>' +
            '<rect x="92" y="60" width="4" height="18" rx="1"></rect>' +
            '<rect x="99" y="60" width="2" height="18" rx="1"></rect>' +
          '</g>' +
          '<circle class="cart-empty-wheel" cx="66" cy="114" r="9"></circle>' +
          '<circle class="cart-empty-wheel-hub" cx="66" cy="114" r="3.2"></circle>' +
          '<circle class="cart-empty-wheel" cx="108" cy="114" r="9"></circle>' +
          '<circle class="cart-empty-wheel-hub" cx="108" cy="114" r="3.2"></circle>' +
        '</svg>' +
        '<span class="cart-empty-scanline"></span>' +
      '</div>' +
      '<span class="empty-title">سەبەتە ئامادەیە بۆ سکانکردن</span>' +
    '</div>'
  );
}

function getCartEmptyHtml() {
  return '<tr class="cart-empty-row"><td colspan="6" class="cart-empty-cell">' + getCartEmptyInnerHtml() + '</td></tr>';
}

function renderCartTable() {
  var tbody = $("#cartTableBody");
  var countEl = $("#cartItemsCount");
  var subtotalEl = $("#summarySubtotal");
  var discountEl = $("#summaryDiscount");
  var taxEl = $("#summaryTax");
  var profitEl = $("#summaryProfit");
  var grandTotalEl = $("#summaryGrandTotal");
  var headerTotalEl = $("#headerTotalAmount");
  var headerProfitEl = $("#headerProfitAmount");
  var itemCountEl = $("#summaryItemCount");
  var totalQtyEl = $("#summaryTotalQty");
  var profitRow = document.querySelector(".summary-row.profit-row");

  if (!tbody) return;

  var currentCart = CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart || [];

  if (currentCart.length === 0) {
    tbody.innerHTML = getCartEmptyHtml();
    if (countEl) countEl.textContent = "0";
    if (itemCountEl) itemCountEl.textContent = "0";
    if (totalQtyEl) totalQtyEl.textContent = "0";
    if (subtotalEl) subtotalEl.textContent = "0 د.ع";
    if (discountEl) discountEl.textContent = "0 د.ع";
    if (taxEl) taxEl.textContent = "0 د.ع";
    if (profitEl) profitEl.textContent = "0 د.ع";
    if (grandTotalEl) grandTotalEl.textContent = "0 د.ع";
    if (headerTotalEl) headerTotalEl.textContent = "0 د.ع";
    if (headerProfitEl) {
      headerProfitEl.textContent = "قازانج: 0 د.ع";
      headerProfitEl.classList.remove("profit-negative");
    }
    if (profitRow) profitRow.classList.remove("profit-negative");

    var ledTotalEl = $("#ledTotalAmount");
    if (ledTotalEl) ledTotalEl.textContent = "0 د.ع";
    var ledUsdEl = $("#ledUsdAmount");
    if (ledUsdEl) ledUsdEl.textContent = "≈ $0.00 USD";
    var ledItemsEl = $("#ledItemsBadge");
    if (ledItemsEl) ledItemsEl.textContent = "٠ بڕگە";

    if (typeof updateCashReturnDisplay === "function") {
      updateCashReturnDisplay(0);
    }
    if (typeof updateHeldSalesBadgeCount === "function") {
      updateHeldSalesBadgeCount();
    }
    return;
  }

  if (typeof updateHeldSalesBadgeCount === "function") {
    updateHeldSalesBadgeCount();
  }
  var totals = getCartTotals(currentCart);

  tbody.innerHTML = currentCart.map(function (item, index) {
    var prod = DB.products.find(function (p) { return p.id === item.prodId; });
    var itemId = item.cartItemId || (item.prodId + "_" + (item.unitType || "piece"));
    item.cartItemId = itemId;
    var isCarton = (item.unitType === "carton");
    var hasPack = prod && (prod.packQty > 1 || prod.packPrice > 0);
    var itemTotal = item.price * item.qty;
    var itemProfit = (item.price - (item.cost || 0)) * item.qty;
    var profitClass = itemProfit >= 0 ? "" : " negative";

    var packBadge = (!hasPack && isCarton)
      ? ' <span style="background:rgba(59,130,246,0.2);color:#38bdf8;font-size:0.68rem;padding:2px 6px;border-radius:4px;font-weight:700;display:inline-block;margin-right:4px;"><i class="fas fa-box"></i> کارتۆن</span>'
      : '';
    var clearanceBadge = (item.clearanceDiscount > 0)
      ? ' <span style="background:rgba(239,68,68,0.2);color:#f87171;font-size:0.68rem;padding:1px 5px;border-radius:4px;font-weight:800;display:inline-block;margin-right:4px;"><i class="fas fa-tag"></i> پاکتاو -%' + item.clearanceDiscount + '</span>'
      : '';
    var offerBadge = (item.offerActive)
      ? ' <span style="background:rgba(239,68,68,0.2);color:#f87171;font-size:0.68rem;padding:1px 5px;border-radius:4px;font-weight:800;display:inline-block;margin-right:4px;"><i class="fas fa-fire"></i> ئۆفەر</span>'
      : '';

    var unitSwitcher = hasPack ? cartUnitSwitcherHtml(itemId, isCarton, item.packQty || prod.packQty) : "";

    var showProfitCol = (document.documentElement.getAttribute("data-cashier-profit") === "visible");
    var selectedId = (typeof getSelectedCartItemId === "function") ? getSelectedCartItemId() : SELECTED_CART_ITEM_ID;
    var isSel = selectedId && (itemId === selectedId || item.prodId === selectedId);
    var escId = String(itemId).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return '<tr class="cart-line-row' + (isSel ? ' is-selected' : '') + '" data-cart-item="' + escId + '" onclick="selectCartLine(\'' + escId + '\')">' +
      '<td>' + (index + 1) + '</td>' +
      '<td class="cart-name-cell"><div class="cart-name-stack' + (hasPack ? ' has-unit' : '') + '"><div class="cart-name-main"><span class="cart-item-title">' + item.name + '</span>' + packBadge + clearanceBadge + offerBadge + '</div>' + unitSwitcher + '</div></td>' +
      '<td><div class="cart-qty-editor">' +
        '<button type="button" class="qty-mini-btn" onclick="changeQty(\'' + itemId + '\',-1)">-</button>' +
        '<input type="number" class="cart-qty-input" value="' + item.qty + '" min="0.01" step="' + ((item.unit === "kg" || item.unit === "gram") ? "0.05" : "1") + '" inputmode="numeric" onclick="event.stopPropagation();this.select();" onfocus="this.select()" onwheel="event.preventDefault()" onkeydown="handleCartQtyKey(event,\'' + itemId + '\')" onchange="setQty(\'' + itemId + '\',this.value)">' +
        '<button type="button" class="qty-mini-btn" onclick="changeQty(\'' + itemId + '\',1)">+</button>' +
      '</div></td>' +
      '<td>' + fmt(item.price) + '</td>' +
      '<td class="profit-cell' + profitClass + '" style="' + (showProfitCol ? '' : 'display:none;') + '">' + fmt(itemProfit) + '</td>' +
      '<td>' + fmt(itemTotal) + '</td>' +
      '<td><div class="cart-row-actions">' +
        '<button type="button" class="cart-info-btn" onclick="openCartItemDetails(\'' + String(itemId).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + '\')" title="وردەکاری کاڵا"><i class="fas fa-info"></i></button>' +
        '<button type="button" class="delete-btn" onclick="removeFromCart(\'' + itemId + '\')"><i class="fas fa-trash"></i></button>' +
      '</div></td>' +
      '</tr>';
  }).join("");

  if (countEl) countEl.textContent = totals.itemCount;
  if (itemCountEl) itemCountEl.textContent = totals.itemCount;
  if (totalQtyEl) totalQtyEl.textContent = totals.totalQty;
  if (subtotalEl) subtotalEl.textContent = fmt(totals.subtotal);
  if (discountEl) discountEl.textContent = fmt(totals.discAmt);
  if (taxEl) taxEl.textContent = fmt(totals.taxAmt);
  if (profitEl) profitEl.textContent = fmt(totals.profit);
  if (grandTotalEl) grandTotalEl.textContent = fmt(totals.grandTotal);
  var grandTotalUsdEl = $("#summaryGrandTotalUsd");
  if (grandTotalUsdEl && typeof SupermarketEngine !== "undefined") {
    grandTotalUsdEl.textContent = "≈ $" + SupermarketEngine.iqdToUsd(totals.grandTotal) + " USD";
  }
  if (headerTotalEl) headerTotalEl.textContent = fmt(totals.grandTotal);
  var headerUsdEl = $("#headerUsdAmount");
  if (headerUsdEl && typeof SupermarketEngine !== "undefined") {
    headerUsdEl.textContent = "≈ $" + SupermarketEngine.iqdToUsd(totals.grandTotal) + " USD";
  }
  if (headerProfitEl) {
    headerProfitEl.textContent = "قازانج: " + fmt(totals.profit);
    headerProfitEl.classList.toggle("profit-negative", totals.profit < 0);
  }
  if (profitRow) profitRow.classList.toggle("profit-negative", totals.profit < 0);

  // Update Giant LED Display
  var ledTotalEl = $("#ledTotalAmount");
  if (ledTotalEl) ledTotalEl.textContent = fmt(totals.grandTotal);
  var ledUsdEl = $("#ledUsdAmount");
  if (ledUsdEl && typeof SupermarketEngine !== "undefined") {
    ledUsdEl.textContent = "≈ $" + SupermarketEngine.iqdToUsd(totals.grandTotal) + " USD";
  }
  var ledItemsEl = $("#ledItemsBadge");
  if (ledItemsEl) {
    ledItemsEl.textContent = (totals.totalQty % 1 === 0 ? totals.totalQty : totals.totalQty.toFixed(2)) + " بڕگە";
  }

  // Update Instant Cash Return Calculation
  if (typeof updateCashReturnDisplay === "function") {
    updateCashReturnDisplay(totals.grandTotal);
  }

  // Sync dual-monitor customer display
  if (typeof SupermarketEngine !== "undefined") {
    SupermarketEngine.syncCustomerDisplay(currentCart, totals);
  }
}

function findLastSoldDateForProduct(prodId) {
  var orders = (typeof DB !== "undefined" && DB.orders) ? DB.orders : [];
  var best = "";
  var bestTs = 0;
  for (var i = 0; i < orders.length; i++) {
    var o = orders[i];
    var items = o.items || [];
    var hit = false;
    for (var j = 0; j < items.length; j++) {
      if (String(items[j].prodId || items[j].id || "") === String(prodId)) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;
    var raw = o.date || o.createdAt || "";
    var ts = raw ? new Date(raw).getTime() : 0;
    if (!best || ts >= bestTs) {
      best = raw;
      bestTs = ts;
    }
  }
  return best;
}

function renderInlineProductQr(text, size, holderId) {
  size = size || 118;
  var code = String(text || "").trim();
  var holder = holderId || "cidQrSvg";
  if (!code) return '<div id="' + holder + '" style="color:#64748b;font-size:0.75rem;">بارکۆد نییە</div>';
  var apiSrc = "/api/qrcode?text=" + encodeURIComponent(code) + "&type=svg";
  return '<div id="' + holder + '"><img alt="QR" style="width:' + size + 'px;height:' + size + 'px;display:block;margin:0 auto;" src="' + apiSrc + '"></div>';
}

function fillInlineProductQr(text, size, holderId) {
  size = size || 118;
  var code = String(text || "").trim();
  var el = document.getElementById(holderId || "cidQrSvg");
  if (!el || !code) return;
  var qrLib = (typeof QRCode !== "undefined") ? QRCode : (typeof window !== "undefined" ? window.QRCode : null);
  var applySvg = function (svg) {
    if (!svg || !el) return;
    el.innerHTML = String(svg).replace("<svg ", '<svg style="width:' + size + 'px;height:' + size + 'px;display:block;margin:0 auto;" ');
  };
  if (qrLib && typeof qrLib.toString === "function") {
    try {
      var maybe = qrLib.toString(code, { type: "svg", margin: 1, width: size }, function (err, svg) {
        if (!err && svg) applySvg(svg);
      });
      if (maybe && typeof maybe.then === "function") {
        maybe.then(applySvg).catch(function () {});
      }
    } catch (e) {}
  }
}

function openCartItemDetails(cartItemId) {
  var queue = (typeof CUSTOMER_QUEUE !== "undefined" && typeof ACTIVE_CUSTOMER !== "undefined") ? CUSTOMER_QUEUE[ACTIVE_CUSTOMER] : null;
  var cart = (queue && queue.cart) || [];
  var item = cart.find(function (c) { return c.cartItemId === cartItemId || c.prodId === cartItemId; });
  if (!item) {
    toast("هەڵە", "کاڵاکە لە سەبەتە نەدۆزرایەوە", "error");
    return;
  }
  var prod = (DB.products || []).find(function (p) { return p.id === item.prodId; }) || {};
  var cat = (DB.categories || []).find(function (c) { return c.id === prod.cat || c.id === prod.category; });
  var unitMap = { piece: "دانە", carton: "کارتۆن", kg: "کگ", gram: "گرام" };
  var unitLabel = unitMap[item.unitType || item.unit] || unitMap[prod.unit] || "دانە";
  var barcode = item.unitType === "carton" ? (prod.packBarcode || prod.barcode || "") : (prod.barcode || prod.packBarcode || "");
  var imgSrc = (typeof getImageSrc === "function") ? getImageSrc(prod.id || item.prodId, prod.image || item.image) : "";
  var cost = Number(item.cost != null ? item.cost : prod.cost) || 0;
  var sell = Number(item.price != null ? item.price : prod.price) || 0;
  var qty = Number(item.qty) || 1;
  var lineTotal = sell * qty;
  var profit = (sell - cost) * qty;
  var showProfit = document.documentElement.getAttribute("data-cashier-profit") === "visible";
  var nowStr = formatSaleDateTime(new Date(), true);
  var lastSold = findLastSoldDateForProduct(item.prodId);
  var lastSoldStr = lastSold ? formatSaleDateTime(lastSold, true) : "هێشتا نەفرۆشراوە";
  var exp = (typeof getProductExpiryStatus === "function") ? getProductExpiryStatus(prod) : {};
  var expText = prod.expiryDate ? String(prod.expiryDate).slice(0, 10) : "—";
  if (exp.daysLeft != null) {
    if (exp.expired) expText += " (بەسەرچووە)";
    else expText += " (" + exp.daysLeft + " ڕۆژ ماوە)";
  }
  var barcodeSvg = "";
  if (barcode && typeof BarcodeGen !== "undefined" && BarcodeGen.autoBarcodeSvg) {
    try { barcodeSvg = BarcodeGen.autoBarcodeSvg(barcode, { height: 52, barWidth: 1.4, showText: true, fontSize: 11 }); } catch (e) {}
  }
  var qrHtml = renderInlineProductQr(barcode || String(prod.id || ""), 118, "cidQrSvg");
  var name = (typeof escapeAttr === "function") ? escapeAttr(item.name || prod.name || "کاڵا") : (item.name || "کاڵا");
  var stock = (prod.stock != null) ? prod.stock : "—";
  var minAlert = (prod.minAlert != null) ? prod.minAlert : "—";
  var packQty = prod.packQty || item.packQty || 1;
  CART_ITEM_DETAIL_CONTEXT = { cartItemId: item.cartItemId || cartItemId, prodId: item.prodId || prod.id || "" };
  var body = document.getElementById("cartItemDetailBody");
  if (!body) return;
  body.innerHTML =
    '<div class="cid-hero">' +
      '<div class="cid-hero-img">' + (imgSrc ? '<img class="lux-fill-img" src="' + imgSrc + '" alt="">' : '<span class="lux-media-fallback"><i class="fas fa-box"></i></span>') + '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<h3>' + name + '</h3>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
          '<span style="font-size:0.72rem;font-weight:800;background:rgba(16,185,129,0.15);color:#6ee7b7;border-radius:999px;padding:2px 8px;">' + unitLabel + '</span>' +
          (cat ? '<span style="font-size:0.72rem;font-weight:800;background:rgba(56,189,248,0.12);color:#7dd3fc;border-radius:999px;padding:2px 8px;">' + escapeAttr(cat.name) + '</span>' : '') +
          (item.unitType === "carton" ? '<span style="font-size:0.72rem;font-weight:800;background:rgba(59,130,246,0.18);color:#93c5fd;border-radius:999px;padding:2px 8px;">کارتۆن ×' + packQty + '</span>' : '') +
        '</div>' +
        '<button type="button" class="cid-edit-btn" onclick="editScannedCartProduct()"><i class="fas fa-edit"></i> دەستکاری کاڵا</button>' +
      '</div>' +
    '</div>' +
    '<div class="cid-grid">' +
      '<div class="cid-fact"><span>نرخی فرۆشتن</span><strong style="color:#6ee7b7;">' + fmt(sell) + '</strong></div>' +
      '<div class="cid-fact"><span>نرخی کڕین / تێچوو</span><strong>' + fmt(cost) + '</strong></div>' +
      '<div class="cid-fact"><span>دانە لە سەبەتە</span><strong>' + qty + ' ' + unitLabel + '</strong></div>' +
      '<div class="cid-fact"><span>کۆی ئەم کاڵایە</span><strong>' + fmt(lineTotal) + '</strong></div>' +
      (showProfit ? '<div class="cid-fact"><span>قازانج</span><strong style="color:' + (profit >= 0 ? '#34d399' : '#f87171') + ';">' + fmt(profit) + '</strong></div>' : '') +
      '<div class="cid-fact"><span>کۆگای ماوە</span><strong>' + stock + (minAlert !== "—" ? ' <span style="font-size:0.7rem;color:#94a3b8;">(ئاگاداری: ' + minAlert + ')</span>' : '') + '</strong></div>' +
      '<div class="cid-fact"><span>بەرواری ئەم فرۆشتنە</span><strong>' + nowStr + '</strong></div>' +
      '<div class="cid-fact"><span>دوایین فرۆشتن</span><strong>' + lastSoldStr + '</strong></div>' +
      '<div class="cid-fact"><span>بەرواری دروستکردن</span><strong>' + (prod.productionDate || "—") + '</strong></div>' +
      '<div class="cid-fact"><span>بەرواری بەسەرچوون</span><strong>' + expText + '</strong></div>' +
      '<div class="cid-fact"><span>ژمارەی وەجبە</span><strong>' + (prod.batchNumber || "—") + '</strong></div>' +
      '<div class="cid-fact"><span>یەکە</span><strong>' + (prod.unit || item.unit || "piece") + '</strong></div>' +
      (prod.packBarcode ? '<div class="cid-fact"><span>بارکۆدی کارتۆن</span><strong>' + escapeAttr(prod.packBarcode) + '</strong></div>' : '') +
      (prod.barcode && prod.packBarcode && prod.barcode !== prod.packBarcode ? '<div class="cid-fact"><span>بارکۆدی دانە</span><strong>' + escapeAttr(prod.barcode) + '</strong></div>' : '') +
    '</div>' +
    '<div class="cid-codes">' +
      '<div class="cid-code-card">' +
        '<label>بارکۆد</label>' +
        (barcodeSvg || '<div style="color:#64748b;font-size:0.78rem;padding:18px 0;">بارکۆد تۆمار نەکراوە</div>') +
        '<div class="cid-code-text">' + (barcode ? escapeAttr(barcode) : "—") + '</div>' +
      '</div>' +
      '<div class="cid-code-card">' +
        '<label>کۆدی QR</label>' +
        qrHtml +
        '<div class="cid-code-text">' + (barcode ? escapeAttr(barcode) : "—") + '</div>' +
      '</div>' +
    '</div>';
  showModal("cartItemDetailModal");
  fillInlineProductQr(barcode || String(prod.id || ""), 118, "cidQrSvg");
}
window.openCartItemDetails = openCartItemDetails;

var CART_ITEM_DETAIL_CONTEXT = { cartItemId: "", prodId: "" };

function applyProductPricesToCartItem(item, prod) {
  if (!item || !prod) return;
  var isCarton = item.unitType === "carton";
  var packQty = prod.packQty || 1;
  var clearanceDisc = (!isCarton && prod.clearanceDiscount > 0) ? prod.clearanceDiscount : 0;
  var regularPiecePrice = (clearanceDisc > 0 && prod.clearancePrice > 0)
    ? prod.clearancePrice
    : (clearanceDisc > 0 ? Math.round(prod.price * (1 - clearanceDisc / 100)) : prod.price);
  var activeOfferPrice = (!isCarton && typeof getActiveOfferPrice === "function") ? getActiveOfferPrice(prod) : null;
  if (activeOfferPrice !== null && activeOfferPrice > 0) regularPiecePrice = activeOfferPrice;
  item.name = prod.name;
  item.image = prod.image || "";
  item.packQty = packQty;
  item.unit = isCarton ? "carton" : (prod.unit || "piece");
  item.price = isCarton ? (prod.packPrice > 0 ? prod.packPrice : (prod.price * packQty)) : regularPiecePrice;
  item.originalPrice = isCarton ? (prod.packPrice > 0 ? prod.packPrice : (prod.price * packQty)) : prod.price;
  item.cost = isCarton ? (prod.packCost > 0 ? prod.packCost : ((prod.cost || 0) * packQty)) : (prod.cost || 0);
  item.clearanceDiscount = clearanceDisc;
  item.offerActive = (activeOfferPrice !== null && activeOfferPrice > 0);
  item.offerPrice = item.offerActive ? activeOfferPrice : 0;
}

function syncCartLinesFromProduct(prodId) {
  var prod = (DB.products || []).find(function (p) { return p.id === prodId; });
  if (!prod) return;
  var queues = (typeof CUSTOMER_QUEUE !== "undefined" && CUSTOMER_QUEUE) ? CUSTOMER_QUEUE : null;
  if (!queues) return;
  Object.keys(queues).forEach(function (key) {
    var cart = queues[key] && queues[key].cart;
    if (!cart) return;
    cart.forEach(function (item) {
      if (String(item.prodId) === String(prodId)) applyProductPricesToCartItem(item, prod);
    });
  });
}

function refreshCartItemDetailsIfOpen() {
  var m = document.getElementById("cartItemDetailModal");
  if (!m || !m.classList.contains("active")) return;
  if (CART_ITEM_DETAIL_CONTEXT && CART_ITEM_DETAIL_CONTEXT.cartItemId) {
    openCartItemDetails(CART_ITEM_DETAIL_CONTEXT.cartItemId);
  }
}

function editScannedCartProduct() {
  var prodId = CART_ITEM_DETAIL_CONTEXT && CART_ITEM_DETAIL_CONTEXT.prodId;
  if (!prodId) {
    toast("هەڵە", "کاڵاکە نەدۆزرایەوە", "error");
    return;
  }
  var prod = (DB.products || []).find(function (p) { return p.id === prodId; });
  if (!prod) {
    toast("هەڵە", "کاڵاکە لە لیست نییە", "error");
    return;
  }
  if (typeof openProductModal === "function") openProductModal(prodId);
  var pm = document.getElementById("productModal");
  if (pm) {
    try { if (document.body) document.body.appendChild(pm); } catch (eMove) {}
    pm.style.setProperty("z-index", "1000002", "important");
  }
}
window.editScannedCartProduct = editScannedCartProduct;
window.syncCartLinesFromProduct = syncCartLinesFromProduct;
window.refreshCartItemDetailsIfOpen = refreshCartItemDetailsIfOpen;

function openPosDiscountPrompt() {
  var cur = (typeof getPosDiscountPct === "function") ? (getPosDiscountPct() || 0) : 0;
  var val = prompt("ڕێژەی داشکاندن بنووسە بە لەسەدا (%) :", cur > 0 ? cur : "");
  if (val !== null) {
    var num = parseFloat(val) || 0;
    if (num < 0) num = 0;
    if (num > 100) num = 100;
    var dInput = $("#posDiscountInput") || $("#discountInput");
    if (dInput) dInput.value = num;
    renderCart();
    toast("داشکاندن", "%" + num + " داشکاندن جێبەجێکرا", "info");
  }
}

function initPosActions() {
  // Pay button is bound via onclick="handlePosDirectPayment()" on #payBtn

  $$(".action-btn.payment-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var method = btn.getAttribute("data-payment") || "cash";
      if (method === "more") { toast("زانیاری", "شێوازەکانی تر بەزوویی", "info"); return; }
      if (method === "cash") {
        handlePosDirectPayment();
      } else {
        checkout("card");
      }
    });
  });

  var holdCartBtn = $("#holdCartBtn");
  var holdOrderBtn = $("#holdOrderBtn");
  if (holdCartBtn) holdCartBtn.onclick = holdSale;
  if (holdOrderBtn) holdOrderBtn.onclick = holdSale;

  var posReturnBtn = $("#posReturnBtn");
  if (posReturnBtn) posReturnBtn.addEventListener("click", openReturnSaleModal);

  var customerBtn = $("#customerBtn");
  if (customerBtn) customerBtn.addEventListener("click", createNewCustomerTab);

  var returnBtn = $("#returnOrderBtn");
  if (returnBtn) returnBtn.addEventListener("click", openReturnSaleModal);

  var addReturnBtn = $("#addReturnBtn");
  if (addReturnBtn) addReturnBtn.addEventListener("click", function () { openReturnSaleModal(); });

  var printBtn = $("#headerPrintBtn");
  if (printBtn) printBtn.addEventListener("click", function () {
    if (typeof SupermarketEngine !== "undefined") SupermarketEngine.smartPrintReceipt();
    else if (LAST_ORDER) printReceiptDirect(LAST_ORDER);
    else if (typeof SupermarketEngine !== "undefined") SupermarketEngine.printTestReceipt();
  });

  var testPrintBtn = $("#headerTestPrintBtn");
  if (testPrintBtn) testPrintBtn.addEventListener("click", function () {
    if (typeof SupermarketEngine !== "undefined") SupermarketEngine.printTestReceipt();
  });

  var settingsTestPrintBtn = $("#settingsTestPrintBtn");
  if (settingsTestPrintBtn) settingsTestPrintBtn.addEventListener("click", function () {
    if (typeof SupermarketEngine !== "undefined") SupermarketEngine.printTestReceipt();
  });

  var barcodeBtn = $("#headerBarcodeBtn");
  if (barcodeBtn) barcodeBtn.addEventListener("click", function () {
    var input = $("#barcodeInput");
    if (input) { input.focus(); toast("بارکۆد", "بارکۆد بنووسە یان سکان بکە", "info"); }
  });

  var searchInput = $("#headerSearchInput");
  if (searchInput) {
    var searchDebounce = null;
    searchInput.addEventListener("input", function () {
      if (window.PosScanGuard && window.PosScanGuard.isBursting && window.PosScanGuard.isBursting()) return;
      if (searchDebounce) clearTimeout(searchDebounce);
      var val = searchInput.value.trim();
      searchDebounce = setTimeout(function () {
        POS_GRID_SEARCH = val;
        POS_GRID_PAGE = 1;
        renderProductGrid(POS_GRID_CATEGORY);
      }, 180);
    });
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "*" || e.key === "x" || e.key === "X" || e.key === "×") {
        var rawMul = searchInput.value.trim();
        var onlyNum = rawMul.match(/^(\d+(?:\.\d+)?)$/);
        if (onlyNum) {
          e.preventDefault();
          setPendingScanQty(onlyNum[1]);
          searchInput.value = "";
          POS_GRID_SEARCH = "";
          toast("دانە", onlyNum[1] + " دانە — ئێستا کاڵا سکان بکە", "info");
          return;
        }
        if (!rawMul) {
          e.preventDefault();
          var qtyBox = document.getElementById("posScanQtyInput");
          if (qtyBox) { qtyBox.focus(); qtyBox.select(); }
          return;
        }
      }
      if (e.key === "Enter") {
        if (typeof isProductAddModalOpen === "function" && isProductAddModalOpen()) {
          var modalCode = searchInput.value.trim();
          if (modalCode) {
            e.preventDefault();
            processBarcode(modalCode);
            searchInput.value = "";
            POS_GRID_SEARCH = "";
          }
          return;
        }
        var originalQuery = searchInput.value.trim();
        var query = parseScanQtyPrefix(originalQuery);
        if (!query && originalQuery) {
          e.preventDefault();
          searchInput.value = "";
          POS_GRID_SEARCH = "";
          toast("دانە", getPendingScanQty() + " دانە — ئێستا کاڵا سکان بکە", "info");
          return;
        }
        if (query) {
          e.preventDefault();
          var exact = (typeof findProductByScannedCodeFresh === "function"
            ? findProductByScannedCodeFresh(query)
            : (typeof findProductByScannedCode === "function" ? findProductByScannedCode(query) : null)) ||
            (DB.products || []).find(function (p) {
              return String(p.name).toLowerCase() === query.toLowerCase();
            });
          if (exact) {
            if (typeof addKnownScannedProduct === "function") addKnownScannedProduct(exact, query);
            else addToCart(exact.id, 1, "piece");
            searchInput.value = "";
            POS_GRID_SEARCH = "";
            renderProductGrid(POS_GRID_CATEGORY);
          } else {
            processBarcode(query);
            searchInput.value = "";
            POS_GRID_SEARCH = "";
            renderProductGrid(POS_GRID_CATEGORY);
          }
        } else {
          // Empty search + Enter is often a scanner CR/LF after the barcode was cleared.
          // Never auto-pay/print from this box — Space or the Pay button completes the sale.
          if (window.PosScanGuard && window.PosScanGuard.shouldSkipCheckoutKey(e)) {
            e.preventDefault();
            return;
          }
        }
      }
    });
  }

  var discountInput = $("#posDiscountInput");
  if (discountInput) discountInput.addEventListener("input", renderCart);

  var discountBtn = $("#discountBtn");
  if (discountBtn) discountBtn.addEventListener("click", function () {
    if (discountInput) discountInput.focus();
  });

  var quoteBtn = $("#quoteBtn");
  if (quoteBtn) quoteBtn.addEventListener("click", generateQuotationReceipt);

  var percentBtn = $("#percentBtn");
  if (percentBtn) percentBtn.addEventListener("click", applyKeypadDiscount);

  var overrideBtn = $("#overrideBtn");
  if (overrideBtn) overrideBtn.addEventListener("click", overrideLastItemPrice);

  var noteBtn = $("#noteBtn");
  if (noteBtn) noteBtn.addEventListener("click", setOrderNotePrompt);

  // Bind Supermarket features
  var custDispBtn = $("#headerCustomerDispBtn");
  if (custDispBtn && typeof SupermarketEngine !== "undefined") {
    custDispBtn.addEventListener("click", SupermarketEngine.openCustomerDisplay);
  }
  var shortcutsBtn = $("#headerShortcutsBtn");
  if (shortcutsBtn && typeof SupermarketEngine !== "undefined") {
    shortcutsBtn.addEventListener("click", function () {
      if (SupermarketEngine.showShortcutsHelpModal) SupermarketEngine.showShortcutsHelpModal();
    });
  }
  var audioBtn = $("#headerAudioBtn");
  if (audioBtn && typeof PosAudio !== "undefined") {
    audioBtn.addEventListener("click", function () {
      var muted = PosAudio.toggleMute();
      audioBtn.innerHTML = muted ? '<i class="fas fa-volume-mute" style="color:var(--danger);"></i>' : '<i class="fas fa-volume-up"></i>';
      toast("دەنگ", muted ? "دەنگی سکانەر بێدەنگ کرا" : "دەنگی سکانەر چالاک کرا", "info");
    });
  }

  // Preserved header button bindings
  var headerDrawerBtn = $("#headerDrawerBtn");
  if (headerDrawerBtn) {
    headerDrawerBtn.addEventListener("click", function () {
      if (typeof PosAudio !== "undefined") PosAudio.playDrawerKick();
      toast("سندوق", "سندوقی نەختینە کرایەوە", "info");
    });
  }
  var headerNoSaleBtn = $("#headerNoSaleBtn");
  if (headerNoSaleBtn) {
    headerNoSaleBtn.addEventListener("click", function () {
      showModal("noSaleDrawerModal");
    });
  }
  var headerHandoverBtn = $("#headerHandoverBtn");
  if (headerHandoverBtn) {
    headerHandoverBtn.addEventListener("click", function () {
      if (typeof ShiftsManager !== "undefined") ShiftsManager.openCashHandoverModal();
    });
  }
  var headerSwitchCashierBtn = $("#headerSwitchCashierBtn");
  if (headerSwitchCashierBtn) {
    headerSwitchCashierBtn.addEventListener("click", function () {
      if (typeof SwitchCashier !== "undefined") SwitchCashier.open(false);
    });
  }
  var headerOwnerMobileBtn = $("#headerOwnerMobileBtn");
  if (headerOwnerMobileBtn) {
    headerOwnerMobileBtn.addEventListener("click", function () {
      openOwnerMobileQrModal();
    });
  }
  var headerSecurityAlertBtn = $("#headerSecurityAlertBtn");
  if (headerSecurityAlertBtn) {
    headerSecurityAlertBtn.addEventListener("click", function () {
      showModal("securityAuditModal");
    });
  }
}

function focusBarcodeSearch() {
  var input = $("#headerSearchInput") || $("#barcodeInput");
  if (input) {
    input.focus();
    if (input.select) input.select();
    toast("بارکۆد", "بارکۆد بنووسە یان کاڵا بگەڕێ", "info");
  }
}
window.focusBarcodeSearch = focusBarcodeSearch;

// Outside click listener for posMoreMenu
document.addEventListener("click", function (e) {
  var menu = $("#posMoreMenu");
  var trigger = $("#posMoreDropdownBtn");
  if (menu && menu.classList.contains("show")) {
    if (!menu.contains(e.target) && (!trigger || !trigger.contains(e.target))) {
      menu.classList.remove("show");
    }
  }
});

// Category tab switching (legacy fallback)
function initCategoryTabs() {
  renderPosCategoryTabs();
}

// Override renderCart to also update new cart table
var originalRenderCart = renderCart;
renderCart = function() {
  // Only call original renderCart if old UI elements exist
  if ($("#cartItems")) {
    originalRenderCart();
  }
  renderCartTable();
};

// Initialize new POS UI
function initNewPOSUI() {
  initHeaderDateTime();
  initKeypad();
  initCategoryTabs();
  initPosToolbar();
  initPosActions();
  renderCustomerTabs();
  renderProductGrid("all");
  renderCartTable();
  updatePosViewButtons();
  setupBarcodeStudioScanLink();
  if (!window._posGridResizeBound) {
    window._posGridResizeBound = true;
    window.addEventListener("resize", schedulePosGridRefit);
    try {
      var card = document.querySelector("#posSection .products-card");
      if (card && typeof ResizeObserver !== "undefined") {
        var ro = new ResizeObserver(function () { schedulePosGridRefit(); });
        ro.observe(card);
      }
    } catch (eRo) {}
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   IRAQI DINAR CASH ENGINE, INSTANT RETURN CALCULATION & QUICK PAY
   ═══════════════════════════════════════════════════════════════════════ */

var POS_CASH_RECEIVED = 0;
var LAST_CASH_NOTE = 0;

/**
 * Apply quick cash denomination (50000, 25000, 10000, 5000 IQD)
 * Matches user requirement:
 * "when i scaned items it = 15000 when i clik 25000 it direct calculate to me say give back 10 so we ganna put 25000 , 50000 , and 10000"
 */
function applyQuickCash(amount) {
  var addAmt = Number(amount) || 0;
  if (addAmt <= 0) return;

  // Accumulate cash received (e.g. 50,000 + 25,000 = 75,000 IQD)
  POS_CASH_RECEIVED = (Number(POS_CASH_RECEIVED) || 0) + addAmt;
  LAST_CASH_NOTE = addAmt;
  if (typeof window !== "undefined") {
    window.POS_CASH_RECEIVED = POS_CASH_RECEIVED;
    window.LAST_CASH_NOTE = LAST_CASH_NOTE;
  }

  if (typeof PosAudio !== "undefined") {
    PosAudio.playCashChime();
  }
  var totals = (typeof getCartTotals === "function") ? getCartTotals() : { grandTotal: 0 };
  updateCashReturnDisplay(totals.grandTotal);

  if (totals.grandTotal > 0) {
    var diff = POS_CASH_RECEIVED - totals.grandTotal;
    if (diff > 0) {
      toast("پارەی وەرگیراو", "+" + fmt(addAmt) + " | کۆی وەرگیراو: " + fmt(POS_CASH_RECEIVED) + " | ماوە: " + fmt(diff), "success");
    } else if (diff === 0) {
      toast("پارەی وەرگیراو", "+" + fmt(addAmt) + " | پارەی تەواو: " + fmt(POS_CASH_RECEIVED), "info");
    } else {
      toast("پارەی وەرگیراو", "+" + fmt(addAmt) + " | کۆی وەرگیراو: " + fmt(POS_CASH_RECEIVED) + " (ماوە بۆ دان: " + fmt(Math.abs(diff)) + ")", "warning");
    }
  } else {
    toast("نەختینە", "+" + fmt(addAmt) + " د.ع وەرگیرا | کۆی نەختینە: " + fmt(POS_CASH_RECEIVED), "info");
  }
}

/**
 * Apply exact cash (پارەی تەواو)
 */
function applyExactCash() {
  var totals = (typeof getCartTotals === "function") ? getCartTotals() : { grandTotal: 0 };
  POS_CASH_RECEIVED = totals.grandTotal > 0 ? totals.grandTotal : 0;
  LAST_CASH_NOTE = POS_CASH_RECEIVED;
  if (typeof window !== "undefined") {
    window.POS_CASH_RECEIVED = POS_CASH_RECEIVED;
    window.LAST_CASH_NOTE = LAST_CASH_NOTE;
  }
  if (typeof UsdExchangeEngine !== "undefined" && typeof UsdExchangeEngine.resetPaymentState === "function") {
    UsdExchangeEngine.resetPaymentState();
  }
  if (typeof PosAudio !== "undefined") {
    PosAudio.playCashChime();
  }
  updateCashReturnDisplay(totals.grandTotal);
  toast("پارەی تەواو", fmt(POS_CASH_RECEIVED) + " دانرا", "info");
}

/**
 * Apply USD cash note (e.g. $100 USD -> converted to IQD)
 */
function applyUsdCash(usdAmount) {
  if (typeof UsdExchangeEngine !== "undefined" && typeof UsdExchangeEngine.applyUsd === "function") {
    UsdExchangeEngine.applyUsd(usdAmount);
    return;
  }
  var rate = (typeof SupermarketEngine !== "undefined") ? SupermarketEngine.getUsdRate() : 1530;
  var iqd = Math.round((Number(usdAmount) || 100) * rate);
  POS_CASH_RECEIVED = (Number(POS_CASH_RECEIVED) || 0) + iqd;
  LAST_CASH_NOTE = iqd;
  if (typeof window !== "undefined") {
    window.POS_CASH_RECEIVED = POS_CASH_RECEIVED;
    window.LAST_CASH_NOTE = LAST_CASH_NOTE;
  }
  if (typeof PosAudio !== "undefined") {
    PosAudio.playCashChime();
  }
  var totals = (typeof getCartTotals === "function") ? getCartTotals() : { grandTotal: 0 };
  updateCashReturnDisplay(totals.grandTotal);
  toast("دۆلار ($" + usdAmount + ")", "+" + fmt(iqd) + " د.ع | کۆ: " + fmt(POS_CASH_RECEIVED), "info");
}

/**
 * Clear received cash back to 0
 */
function clearCashReceived() {
  POS_CASH_RECEIVED = 0;
  LAST_CASH_NOTE = 0;
  if (typeof window !== "undefined") {
    window.POS_CASH_RECEIVED = 0;
    window.LAST_CASH_NOTE = 0;
  }
  if (typeof UsdExchangeEngine !== "undefined" && typeof UsdExchangeEngine.resetPaymentState === "function") {
    UsdExchangeEngine.resetPaymentState();
  }
  var totals = (typeof getCartTotals === "function") ? getCartTotals() : { grandTotal: 0 };
  updateCashReturnDisplay(totals.grandTotal);
  toast("سڕینەوە", "پارەی وەرگیراو سفرکرایەوە", "info");
}

function undoLastCashNote() {
  var last = Number(LAST_CASH_NOTE || 0);
  var current = Number(POS_CASH_RECEIVED || 0);
  if (last > 0 && current >= last) {
    POS_CASH_RECEIVED = Math.max(0, current - last);
    LAST_CASH_NOTE = 0;
    if (typeof window !== "undefined") {
      window.POS_CASH_RECEIVED = POS_CASH_RECEIVED;
      window.LAST_CASH_NOTE = 0;
    }
    var totals = (typeof getCartTotals === "function") ? getCartTotals() : { grandTotal: 0 };
    updateCashReturnDisplay(totals.grandTotal);
    toast("گەڕاندنەوە", fmt(last) + " لابرا", "info");
    return;
  }
  clearCashReceived();
}

function getPosChangeAmount() {
  var totals = (typeof getCartTotals === "function") ? getCartTotals() : { grandTotal: 0 };
  var grand = Number(totals.grandTotal) || 0;
  var received = Number(POS_CASH_RECEIVED) || 0;
  return { grand: grand, received: received, change: received - grand };
}

function getPosChangeBreakdown(changeAmount) {
  if (typeof UsdExchangeEngine !== "undefined" && typeof UsdExchangeEngine.getChangeBreakdownDetails === "function") {
    return UsdExchangeEngine.getChangeBreakdownDetails(changeAmount);
  }
  var rem = Math.max(0, Math.round(Number(changeAmount) || 0));
  var original = rem;
  var denoms = [
    { name: "٥٠ هەزاری", short: "٥٠,٠٠٠", val: 50000 },
    { name: "٢٥ هەزاری", short: "٢٥,٠٠٠", val: 25000 },
    { name: "١٠ هەزاری", short: "١٠,٠٠٠", val: 10000 },
    { name: "٥ هەزاری", short: "٥,٠٠٠", val: 5000 },
    { name: "هەزاری", short: "١,٠٠٠", val: 1000 },
    { name: "٥٠٠ دینار", short: "٥٠٠", val: 500 },
    { name: "٢٥٠ دینار", short: "٢٥٠", val: 250 }
  ];
  var parts = [];
  denoms.forEach(function (d) {
    if (rem >= d.val) {
      var count = Math.floor(rem / d.val);
      rem = rem % d.val;
      parts.push({ name: d.name, short: d.short, val: d.val, count: count });
    }
  });
  var labels = parts.map(function (p) { return p.count + " دانە " + p.name; });
  if (rem > 0) labels.push(rem + " د.ع");
  return {
    change: original,
    remainder: rem,
    parts: parts,
    text: labels.length ? ("پارەی گەڕاوە لە سندوق: " + labels.join(" + ")) : "پارەی تەواو"
  };
}

function refreshChangeZoomOverlay() {
  var overlay = document.getElementById("changeZoomOverlay");
  if (!overlay || !overlay.classList.contains("active")) return;
  var amt = document.getElementById("changeZoomAmount");
  var meta = document.getElementById("changeZoomMeta");
  var sentence = document.getElementById("changeZoomSentence");
  var notes = document.getElementById("changeZoomNotes");
  var info = getPosChangeAmount();
  var change = info.change;

  if (amt) amt.textContent = change > 0 ? fmt(change) : (change < 0 ? ("-" + fmt(Math.abs(change))) : "0 د.ع");
  if (meta) {
    meta.textContent = "پارەی وەرگیراو: " + fmt(info.received) + "  •  کۆی پسوڵە: " + fmt(info.grand);
  }

  if (change > 0) {
    var detail = getPosChangeBreakdown(change);
    if (sentence) {
      sentence.style.display = "";
      sentence.textContent = detail.text;
    }
    if (notes) {
      notes.style.display = "";
      notes.innerHTML = detail.parts.map(function (p) {
        return '<div class="change-zoom-note">' +
          '<strong>' + p.count + '</strong>' +
          '<span>دانە</span>' +
          '<em>' + p.name + '</em>' +
          '</div>';
      }).join("") + (detail.remainder > 0
        ? '<div class="change-zoom-note leftover"><strong>' + detail.remainder + '</strong><span>د.ع</span><em>دیکە</em></div>'
        : "");
    }
  } else if (change < 0) {
    if (sentence) {
      sentence.style.display = "";
      sentence.textContent = "هێشتا " + fmt(Math.abs(change)) + " ماویەتی — پارەی زیاتر وەربگرە";
    }
    if (notes) { notes.style.display = "none"; notes.innerHTML = ""; }
  } else {
    if (sentence) {
      sentence.style.display = "";
      sentence.textContent = info.received > 0 ? "پارەی تەواو — هیچ شتێک مەگەڕێنەوە" : "سەرەتا پارە وەربگرە بۆ بینینی وردەکاری سندوق";
    }
    if (notes) { notes.style.display = "none"; notes.innerHTML = ""; }
  }
}

function openChangeZoom() {
  var overlay = document.getElementById("changeZoomOverlay");
  if (!overlay) return;
  overlay.classList.add("active");
  refreshChangeZoomOverlay();
  if (!window._changeZoomEscBound) {
    window._changeZoomEscBound = true;
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var ov = document.getElementById("changeZoomOverlay");
      if (ov && ov.classList.contains("active")) {
        e.preventDefault();
        closeChangeZoom();
      }
    });
  }
}

function closeChangeZoom() {
  var overlay = document.getElementById("changeZoomOverlay");
  if (overlay) overlay.classList.remove("active");
}

window.openChangeZoom = openChangeZoom;
window.closeChangeZoom = closeChangeZoom;
window.undoLastCashNote = undoLastCashNote;

/**
 * Prompt manual cash entry or open keypad
 */
function promptManualCashReceived() {
  toggleQuickKeypadModal();
}

/**
 * Update the Live Cash Received & Instant Return Change UI
 */
function updateCashReturnDisplay(grandTotal) {
  if (typeof grandTotal === "undefined") {
    var totals = (typeof getCartTotals === "function") ? getCartTotals() : { grandTotal: 0 };
    grandTotal = totals.grandTotal || 0;
  }

  var receivedEl = $("#posCashReceivedDisplay");
  var changeEl = $("#posCashChangeDisplay");
  var changeCard = $("#posCashChangeCard");
  var statusPill = $("#posChangeStatusPill");
  var changeLabel = $("#posCashChangeLabel");
  var breakdownEl = $("#posChangeBreakdownText");

  if (receivedEl) {
    if (typeof UsdExchangeEngine !== "undefined" && UsdExchangeEngine.getLastPaidCurrency() === "USD" && UsdExchangeEngine.getLastPaidUsd() > 0) {
      receivedEl.innerHTML = '<span style="color:#10b981;font-weight:900;">$' + UsdExchangeEngine.getLastPaidUsd() + ' USD</span> (' + fmt(POS_CASH_RECEIVED) + ')';
    } else {
      receivedEl.textContent = (POS_CASH_RECEIVED > 0) ? fmt(POS_CASH_RECEIVED) : "0 د.ع";
    }
  }

  if (!changeEl) {
    if (typeof refreshChangeZoomOverlay === "function") refreshChangeZoomOverlay();
    return;
  }

  if (grandTotal === 0 && POS_CASH_RECEIVED === 0) {
    changeEl.textContent = "0 د.ع";
    if (statusPill) statusPill.textContent = "ئامادەیە";
    if (changeCard) {
      changeCard.classList.remove("is-positive-change", "is-underpaid", "is-exact");
    }
    if (breakdownEl) breakdownEl.style.display = "none";
    if (typeof refreshChangeZoomOverlay === "function") refreshChangeZoomOverlay();
    return;
  }

  if (POS_CASH_RECEIVED === 0) {
    changeEl.textContent = "0 د.ع";
    if (statusPill) statusPill.textContent = "چاوەڕوانی پارە";
    if (changeCard) {
      changeCard.classList.remove("is-positive-change", "is-underpaid", "is-exact");
    }
    if (breakdownEl) breakdownEl.style.display = "none";
    if (typeof refreshChangeZoomOverlay === "function") refreshChangeZoomOverlay();
    return;
  }

  var diff = POS_CASH_RECEIVED - grandTotal;
  if (diff > 0) {
    // CUSTOMER GETS CHANGE BACK (Example: $100 received (153,000 IQD) for 38,000 total -> 115,000 IQD change)
    changeEl.textContent = fmt(diff);
    if (changeLabel) changeLabel.innerHTML = '<i class="fas fa-hand-holding-dollar" style="color:#10b981;"></i> پارەی گەڕاوە بە دینار (بدەرەوە):';
    if (statusPill) {
      statusPill.textContent = "بیدەرەوە بە کڕیار";
      statusPill.style.background = "#10b981";
    }
    if (changeCard) {
      changeCard.classList.remove("is-underpaid");
      changeCard.classList.add("is-positive-change");
    }

    // Show smart banknote breakdown
    if (breakdownEl && typeof UsdExchangeEngine !== "undefined") {
      breakdownEl.style.display = "block";
      breakdownEl.innerHTML = '<i class="fas fa-lightbulb" style="color:#f59e0b;"></i> ' + UsdExchangeEngine.calculateChangeBreakdown(diff);
    }
  } else if (diff === 0) {
    // Exact payment
    changeEl.textContent = "0 د.ع (تەواوە)";
    if (changeLabel) changeLabel.innerHTML = '<i class="fas fa-check-double"></i> پارەی تەواو';
    if (statusPill) {
      statusPill.textContent = "تەواوە";
      statusPill.style.background = "#3b82f6";
    }
    if (changeCard) {
      changeCard.classList.remove("is-underpaid");
      changeCard.classList.add("is-positive-change", "is-exact");
    }
    if (breakdownEl) breakdownEl.style.display = "none";
  } else {
    // Underpaid / remaining
    var needed = Math.abs(diff);
    changeEl.textContent = "-" + fmt(needed);
    if (changeLabel) changeLabel.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:#ef4444;"></i> هێشتا ماویەتی:';
    if (statusPill) {
      statusPill.textContent = "کەمە: " + fmt(needed);
      statusPill.style.background = "#ef4444";
    }
    if (changeCard) {
      changeCard.classList.remove("is-positive-change");
      changeCard.classList.add("is-underpaid");
    }
    if (breakdownEl) breakdownEl.style.display = "none";
  }

  // Dual display sync
  if (typeof SupermarketEngine !== "undefined" && typeof SupermarketEngine.syncCashDisplay === "function") {
    SupermarketEngine.syncCashDisplay(POS_CASH_RECEIVED, Math.max(0, diff));
  }
  if (typeof refreshChangeZoomOverlay === "function") refreshChangeZoomOverlay();
}

/**
 * Handle POS Direct Instant Payment (Master Pay button / Space / Enter / Shift+Enter)
 * @param {boolean} [shouldPrint] - true to print, false to skip printing
 * @param {{method?: string}} [paymentOpts] - e.g. { method: "card" }
 */
function handlePosDirectPayment(shouldPrint, paymentOpts) {
  if (typeof shouldPrint === "undefined") {
    shouldPrint = (!DB.settings || DB.settings.autoPrint !== "off");
  }
  paymentOpts = paymentOpts || {};
  if (!paymentOpts.method && typeof isPosCardChoiceOpen === "function" && isPosCardChoiceOpen()) {
    if (typeof confirmPosCardPayment === "function") {
      confirmPosCardPayment(!!shouldPrint);
      return;
    }
  }
  if (typeof closePosCardChoice === "function") closePosCardChoice();
  var isCard = paymentOpts.method === "card";

  var currentCart = (CUSTOMER_QUEUE[ACTIVE_CUSTOMER] && CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart) || [];
  if (currentCart.length === 0) {
    toast("ئاگاداری", "سەبەتە بەتاڵە! تکایە سەرەتا کاڵا سکان بکە", "warning");
    if (typeof PosAudio !== "undefined") PosAudio.playErrorBuzz();
    return;
  }
  var nowPay = Date.now();
  if (handlePosDirectPayment._lock && (nowPay - handlePosDirectPayment._lock) < 1200) return;
  handlePosDirectPayment._lock = nowPay;

  // Auto-open shift if closed
  if (!CURRENT_SHIFT) {
    var shift = {
      id: gid(),
      cashier: getActiveOperatorName(),
      startTime: new Date().toISOString(),
      startCash: 0,
      endCash: 0,
      difference: 0,
      status: "open"
    };
    if (typeof BranchManager !== "undefined" && BranchManager.stamp) BranchManager.stamp(shift);
    DB.shifts.push(shift);
    CURRENT_SHIFT = shift;
    DataStore.saveShifts();
    updateShiftButtons();
    toast("شێفت", "شێفت بە سەرکەوتوویی کرایەوە", "info");
  }

  var totals = getCartTotals(currentCart);

  // If no cash specified, default to exact cash
  if (!isCard && POS_CASH_RECEIVED <= 0) {
    POS_CASH_RECEIVED = totals.grandTotal;
  }

  var changeDue = isCard ? 0 : Math.max(0, POS_CASH_RECEIVED - totals.grandTotal);
  var receivedAmt = isCard ? totals.grandTotal : POS_CASH_RECEIVED;

  var cartCopy = currentCart.map(function (c) {
    return {
      prodId: c.prodId,
      name: c.name,
      price: c.price,
      cost: c.cost || 0,
      qty: c.qty,
      unitType: c.unitType || 'piece',
      unit: c.unit || 'piece',
      packQty: c.packQty || 1,
      isPack: (c.unitType === 'carton')
    };
  });

  var isUsdPaid = !isCard && (typeof UsdExchangeEngine !== "undefined" && UsdExchangeEngine.getLastPaidCurrency() === "USD");
  var usdRec = isUsdPaid ? UsdExchangeEngine.getLastPaidUsd() : 0;
  var usdRate = isUsdPaid ? UsdExchangeEngine.getRate() : 0;

  var order = {
    id: gid(),
    items: cartCopy,
    subtotal: totals.subtotal,
    totalCost: totals.totalCost,
    discount: totals.discAmt,
    tax: totals.taxAmt,
    total: totals.grandTotal,
    profit: totals.profit,
    cashier: getActiveOperatorName(),
    date: new Date().toISOString(),
    paymentMethod: isCard ? "card" : (isUsdPaid ? "usd_cash" : "cash"),
    paidCurrency: isUsdPaid ? "USD" : "IQD",
    usdReceived: usdRec,
    usdRate: usdRate,
    cashReceived: isCard ? 0 : receivedAmt,
    changeDue: isCard ? 0 : changeDue,
    shiftId: CURRENT_SHIFT ? CURRENT_SHIFT.id : null,
    customerId: ACTIVE_CUSTOMER,
    customerName: CUSTOMER_QUEUE[ACTIVE_CUSTOMER].name,
    printed: !!shouldPrint,
    noPrint: !shouldPrint
  };
  stampOrderBillNo(order);

  LAST_ORDER = order;

  // Deduct stock
  currentCart.forEach(function (c) {
    var prod = DB.products.find(function (p) { return p.id === c.prodId; });
    if (prod) {
      var deductQty = (c.unitType === 'carton') ? (c.qty * (c.packQty || prod.packQty || 1)) : c.qty;
      deductProductStock(prod, deductQty);
    }
  });

  // Save to DB and backend
  if (typeof ApiClient !== "undefined") {
    ApiClient.submitOrder(order);
  }
  if (!IS_ONLINE) {
    queueOfflineOperation("sale", order);
  } else {
    DB.orders.push(order);
  }

  DataStore.saveProducts();
  DataStore.saveOrders();

  // Play mechanical drawer kick & chime (cash drawer only for cash)
  if (typeof PosAudio !== "undefined") {
    if (!isCard) PosAudio.playDrawerKick();
    setTimeout(function () { PosAudio.playCashChime(); }, isCard ? 0 : 120);
  }

  // Optional luxury sale completion modal (only if explicitly enabled in settings, disabled by default)
  if (!isCard && DB.settings && DB.settings.showSaleModal === "on") {
    showSaleCompletionBanner(totals.grandTotal, receivedAmt, changeDue, isUsdPaid, usdRec);
  }

  // Broadcast sale to customer facing dual display
  if (typeof SupermarketEngine !== "undefined" && typeof SupermarketEngine.broadcastSaleComplete === "function") {
    SupermarketEngine.broadcastSaleComplete(order);
  }

  // Auto-print receipt if requested
  if (shouldPrint && (!DB.settings || DB.settings.autoPrint !== "off")) {
    printReceiptDirect(order);
  }

  var changeNotice = changeDue > 0 ? " (ماوەی گەڕاوە: " + fmt(changeDue) + ")" : "";
  toast("سەرکەوتوو", (isCard ? "فرۆشتنی کارت تەواوکرا" : "فرۆشتن تەواوکرا") + (shouldPrint ? " و چاپکرا" : " (بێ چاپ)") + changeNotice, "success");

  // Clear current customer cart & reset cash
  CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart = [];
  POS_CASH_RECEIVED = 0;
  if (typeof UsdExchangeEngine !== "undefined") {
    UsdExchangeEngine.resetPaymentState();
  }
  renderCart();
  renderPosGrid();

  // Refocus barcode search input immediately so cashier can scan next customer with zero delay
  var bInput = document.getElementById("headerSearchInput");
  if (bInput) bInput.focus();
}

function closePosCardChoice() {
  var pop = document.getElementById("posCardChoicePop");
  if (pop) {
    pop.hidden = true;
    pop.classList.remove("is-open");
    pop.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("pos-card-pay-open");
}

function handlePosCardSale() {
  var currentCart = (CUSTOMER_QUEUE[ACTIVE_CUSTOMER] && CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart) || [];
  if (!currentCart.length) {
    toast("ئاگاداری", "سەبەتە بەتاڵە! کاڵا سکان بکە پێش پارەدان بە کارت", "warning");
    if (typeof PosAudio !== "undefined") PosAudio.playErrorBuzz();
    return;
  }
  var pop = document.getElementById("posCardChoicePop");
  if (pop) {
    pop.hidden = false;
    pop.classList.add("is-open");
    pop.setAttribute("aria-hidden", "false");
    try { pop.focus(); } catch (eF) {}
  }
  document.body.classList.add("pos-card-pay-open");
}

function confirmPosCardPayment(shouldPrint) {
  closePosCardChoice();
  handlePosDirectPayment(!!shouldPrint, { method: "card" });
}

function handlePosCardPayment(shouldPrint) {
  confirmPosCardPayment(shouldPrint);
}

/**
 * Direct Debt Sale from POS Checkout Suite (بە قەرز)
 */
function handlePosDebtSale() {
  if (isPosCardChoiceOpen()) return;
  var currentCart = (CUSTOMER_QUEUE[ACTIVE_CUSTOMER] && CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart) || [];
  if (currentCart.length === 0) {
    toast("ئاگاداری", "سەبەتە بەتاڵە! کاڵا سکان بکە بۆ تۆمارکردن بە قەرز", "warning");
    if (typeof PosAudio !== "undefined") PosAudio.playErrorBuzz();
    return;
  }

  // Auto-open shift if closed
  if (!CURRENT_SHIFT) {
    var shift = {
      id: gid(),
      cashier: getActiveOperatorName(),
      startTime: new Date().toISOString(),
      startCash: 0,
      endCash: 0,
      difference: 0,
      status: "open"
    };
    if (typeof BranchManager !== "undefined" && BranchManager.stamp) BranchManager.stamp(shift);
    DB.shifts.push(shift);
    CURRENT_SHIFT = shift;
    DataStore.saveShifts();
    updateShiftButtons();
  }

  var totals = getCartTotals(currentCart);
  var cartCopy = currentCart.map(function (c) {
    return {
      prodId: c.prodId,
      name: c.name,
      price: c.price,
      cost: c.cost || 0,
      qty: c.qty,
      unitType: c.unitType || 'piece',
      unit: c.unit || 'piece',
      packQty: c.packQty || 1,
      isPack: (c.unitType === 'carton')
    };
  });

  var order = {
    id: gid(),
    items: cartCopy,
    subtotal: totals.subtotal,
    totalCost: totals.totalCost,
    discount: totals.discAmt,
    tax: totals.taxAmt,
    total: totals.grandTotal,
    profit: totals.profit,
    cashier: getActiveOperatorName(),
    date: new Date().toISOString(),
    paymentMethod: "debt",
    shiftId: CURRENT_SHIFT ? CURRENT_SHIFT.id : null,
    customerId: ACTIVE_CUSTOMER,
    customerName: CUSTOMER_QUEUE[ACTIVE_CUSTOMER].name
  };
  stampOrderBillNo(order);

  PENDING_DEBT = { order: order, total: totals.grandTotal, cartItems: cartCopy };

  var nameInput = document.getElementById("debtCustomerName");
  if (nameInput) nameInput.value = "";
  var phoneInput = document.getElementById("debtCustomerPhone");
  if (phoneInput) phoneInput.value = "";
  var noteInput = document.getElementById("debtCustomerNote");
  if (noteInput) noteInput.value = "";

  var totalEl = document.getElementById("debtCartTotal");
  if (totalEl) totalEl.textContent = fmt(totals.grandTotal);

  var itemsEl = document.getElementById("debtCartItems");
  if (itemsEl) {
    itemsEl.innerHTML = cartCopy.map(function (i) {
      return '<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>' + i.name + ' × ' + i.qty + '</span><span style="color:#f59e0b;font-weight:700;">' + fmt(i.price * i.qty) + '</span></div>';
    }).join("");
  }

  // Populate datalist with existing customer names
  var datalist = document.getElementById("debtCustomerDatalist");
  if (datalist && DB.debts) {
    var uniqueNames = {};
    DB.debts.forEach(function (d) { if (d.customerName) uniqueNames[d.customerName] = true; });
    if (DB.customers) {
      DB.customers.forEach(function (c) { if (c.name) uniqueNames[c.name] = true; });
    }
    datalist.innerHTML = Object.keys(uniqueNames).map(function (n) {
      return '<option value="' + n + '">';
    }).join("");
  }

  showModal("debtCustomerModal");
  setTimeout(function () {
    if (nameInput) nameInput.focus();
    refreshDebtLimitHint();
  }, 100);
}

/**
 * Reprint the last bill anytime (دوایین پسوڵە)
 */
function handlePosReprintLastBill() {
  var ord = LAST_ORDER;
  if (!ord && typeof DB !== "undefined" && DB.orders && DB.orders.length > 0) {
    ord = DB.orders[DB.orders.length - 1];
  }
  if (!ord) {
    toast("ئاگاداری", "هیچ پسوڵەیەکی پێشوو نییە بۆ چاپکردنەوە", "warning");
    if (typeof PosAudio !== "undefined") PosAudio.playErrorBuzz();
    return;
  }
  toast("چاپکردنەوە", "دوایین پسوڵە چاپ دەکرێتەوە...", "info");
  printReceiptDirect(ord);
  if (typeof PosAudio !== "undefined") PosAudio.playCashChime();
}

/**
 * Handle POS WhatsApp Bill Button
 */
var PENDING_WHATSAPP_ORDER = null;

function handlePosWhatsAppBill() {
  var currentCart = (CUSTOMER_QUEUE[ACTIVE_CUSTOMER] && CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart) || [];
  if (currentCart.length > 0) {
    PENDING_WHATSAPP_ORDER = 'CURRENT_CART';
  } else if (LAST_ORDER || (DB.orders && DB.orders.length > 0)) {
    PENDING_WHATSAPP_ORDER = LAST_ORDER || DB.orders[DB.orders.length - 1];
  } else {
    toast("ئاگاداری", "هیچ فرۆشتن یان کاڵایەک نییە بۆ ناردن بە واتسئاپ", "warning");
    if (typeof PosAudio !== "undefined") PosAudio.playErrorBuzz();
    return;
  }

  var phoneInput = document.getElementById("posWhatsAppPhoneInput");
  if (phoneInput) {
    var prevPhone = (PENDING_WHATSAPP_ORDER && PENDING_WHATSAPP_ORDER !== 'CURRENT_CART' && PENDING_WHATSAPP_ORDER.customerPhone)
      ? PENDING_WHATSAPP_ORDER.customerPhone
      : "0750";
    phoneInput.value = prevPhone;
  }
  showModal("posWhatsAppModal");
  setTimeout(function () {
    if (phoneInput) {
      phoneInput.focus();
      phoneInput.select();
    }
  }, 100);
}

function confirmSendWhatsAppModal() {
  var phoneInput = document.getElementById("posWhatsAppPhoneInput");
  var phone = phoneInput ? phoneInput.value.trim() : "";
  hideModal("posWhatsAppModal");

  var targetOrder = null;
  if (PENDING_WHATSAPP_ORDER === 'CURRENT_CART') {
    // Complete the sale without paper print
    handlePosDirectPayment(false);
    targetOrder = LAST_ORDER;
  } else {
    targetOrder = PENDING_WHATSAPP_ORDER || LAST_ORDER;
  }
  PENDING_WHATSAPP_ORDER = null;

  if (targetOrder) {
    sendOrderWhatsApp(targetOrder, phone);
  }
}

/**
 * Show large instant sale completion overlay with the change clearly shown
 */
function showSaleCompletionBanner(total, received, change, isUsdPaid, usdRec) {
  // If disabled (default), do not block the cashier with a popup
  if (!DB.settings || DB.settings.showSaleModal !== "on") {
    return;
  }

  var overlay = document.getElementById("posSaleSuccessOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "posSaleSuccessOverlay";
    overlay.className = "pos-sale-success-overlay";
    document.body.appendChild(overlay);
  }

  var receivedHtml = isUsdPaid
    ? '<span style="color:#10b981;font-weight:900;">$' + usdRec + ' USD</span> (' + fmt(received) + ')'
    : fmt(received);

  var breakdownHtml = (change > 0 && typeof UsdExchangeEngine !== "undefined")
    ? '<div style="font-size:0.84rem;color:#fef08a;margin-top:8px;font-weight:700;line-height:1.4;"><i class="fas fa-lightbulb" style="color:#f59e0b;"></i> ' + UsdExchangeEngine.calculateChangeBreakdown(change) + '</div>'
    : '';

  overlay.innerHTML = '<div class="sale-success-modal">' +
    '<div class="success-top-glow"><i class="fas fa-check-circle"></i></div>' +
    '<h2 class="success-title">فرۆشتن سەرکەوتوو بوو!</h2>' +
    '<div class="success-details-grid">' +
      '<div class="s-detail-box"><span class="s-lbl">کۆی پسوڵە:</span><strong class="s-val">' + fmt(total) + '</strong></div>' +
      '<div class="s-detail-box"><span class="s-lbl">پارەی وەرگیراو:</span><strong class="s-val text-blue">' + receivedHtml + '</strong></div>' +
    '</div>' +
    '<div class="success-change-card">' +
      '<span class="change-callout-lbl"><i class="fas fa-hand-holding-dollar"></i> پارەی گەڕاوە بۆ کڕیار بە دینار:</span>' +
      '<div class="change-callout-val">' + fmt(change) + '</div>' +
      breakdownHtml +
    '</div>' +
    '<div class="success-actions">' +
      '<button type="button" class="btn-success-close" onclick="closeSaleSuccessBanner()"><i class="fas fa-arrow-right"></i> کڕیاری نوێ (Enter / Space)</button>' +
      '<button type="button" class="btn-success-print" onclick="if(typeof smartPrintReceipt===\'function\') smartPrintReceipt(); else if(LAST_ORDER) printReceiptDirect(LAST_ORDER);"><i class="fas fa-print"></i> چاپی پسوڵە</button>' +
      '<button type="button" class="btn-success-whatsapp" onclick="sendOrderWhatsApp()"><i class="fab fa-whatsapp"></i> ناردن بە WhatsApp</button>' +
    '</div>' +
  '</div>';

  overlay.classList.add("active");

  // Auto dismiss after 1 second (1000ms) as requested
  if (window._saleSuccessTimer) clearTimeout(window._saleSuccessTimer);
  window._saleSuccessTimer = setTimeout(function () {
    closeSaleSuccessBanner();
  }, 1000);
}

var LAST_WA_RECEIPT_BLOB = null;
var LAST_WA_RECEIPT_URL = "";
var LAST_WA_RECEIPT_PHONE = "";

function resolveOrderCustomerPhone(ord) {
  if (!ord) return "";
  if (ord.customerPhone) return String(ord.customerPhone).trim();
  var name = ord.customer || ord.customerName || "";
  if (name && DB.customers) {
    var hit = DB.customers.find(function (c) { return c.name === name && c.phone; });
    if (hit) return String(hit.phone).trim();
  }
  return "";
}

function sanitizeWaPhone(phone) {
  var clean = String(phone || "").replace(/[^0-9]/g, "");
  if (!clean) return "";
  if (clean.indexOf("964") === 0 && clean.length >= 12) return clean;
  if (clean.indexOf("0") === 0 && clean.length >= 10) return "964" + clean.substring(1);
  if (clean.indexOf("7") === 0 && clean.length === 10) return "964" + clean;
  return clean;
}

function wrapCanvasText(ctx, text, maxWidth) {
  text = String(text || "");
  var lines = [];
  var words = text.split(/\s+/);
  var line = "";
  function flush() { if (line) { lines.push(line); line = ""; } }
  if (words.length <= 1) {
    var s = "";
    for (var i = 0; i < text.length; i++) {
      var t = s + text.charAt(i);
      if (s && ctx.measureText(t).width > maxWidth) {
        lines.push(s);
        s = text.charAt(i);
      } else s = t;
    }
    if (s) lines.push(s);
    return lines.length ? lines : [text];
  }
  words.forEach(function (w) {
    var test = line ? (line + " " + w) : w;
    if (line && ctx.measureText(test).width > maxWidth) {
      flush();
      line = w;
    } else line = test;
  });
  flush();
  return lines.length ? lines : [text];
}

function drawOrderReceiptCanvas(order) {
  var storeName = getStoreName();
  var storePhone = (DB.settings && (DB.settings.phone || DB.settings.marketPhone)) || "";
  var storeAddr = (DB.settings && DB.settings.address) || "";
  var items = order.items || [];
  var W = 720;
  var pad = 36;
  var measure = document.createElement("canvas").getContext("2d");
  measure.font = "700 22px 'Segoe UI', Tahoma, Arial, sans-serif";
  var nameWidth = W - pad * 2 - 220;
  var itemHeights = items.map(function (it) {
    var label = it.name + ((it.unitType === "carton") ? " (" + receiptLabel("carton") + ")" : "");
    return Math.max(1, wrapCanvasText(measure, label, nameWidth).length) * 32 + 12;
  });
  var itemsH = itemHeights.reduce(function (s, h) { return s + h; }, 0);
  var H = 250 + itemsH + 220;
  var canvas = document.createElement("canvas");
  var scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  var ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.textBaseline = "top";
  ctx.direction = receiptUiLang() === "en" ? "ltr" : "rtl";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#0f766e";
  ctx.fillRect(0, 0, W, 118);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "900 36px 'Segoe UI', Tahoma, Arial, sans-serif";
  ctx.fillText(storeName, W / 2, 24);
  ctx.font = "800 20px 'Segoe UI', Tahoma, Arial, sans-serif";
  ctx.fillText(receiptLabel("saleReceipt"), W / 2, 68);
  if (storePhone || storeAddr) {
    ctx.font = "700 16px 'Segoe UI', Tahoma, Arial, sans-serif";
    ctx.fillText((storeAddr ? storeAddr + "  " : "") + (storePhone ? (receiptLabel("tel") + ": " + storePhone) : ""), W / 2, 92);
  }

  var dateStr = formatSaleDateTime(order.date || new Date(), true);
  var ordId = orderBillNo(order) || String(order.id || "").slice(-5).toUpperCase();
  var y = 140;
  ctx.textAlign = "right";
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 20px 'Segoe UI', Tahoma, Arial, sans-serif";
  ctx.fillText(receiptLabel("receipt") + ": #" + ordId, W - pad, y);
  ctx.textAlign = "left";
  ctx.fillText(dateStr, pad, y);
  y += 30;
  ctx.textAlign = "right";
  ctx.font = "700 18px 'Segoe UI', Tahoma, Arial, sans-serif";
  ctx.fillText(receiptLabel("cashier") + ": " + (order.cashier || receiptLabel("cashier")), W - pad, y);
  if (order.customer || order.customerName) {
    ctx.textAlign = "left";
    ctx.fillText(receiptLabel("customer") + ": " + (order.customer || order.customerName), pad, y);
  }

  y += 36;
  ctx.strokeStyle = "#0f766e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  y += 14;

  ctx.fillStyle = "#64748b";
  ctx.font = "800 18px 'Segoe UI', Tahoma, Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(receiptLabel("item"), W - pad, y);
  ctx.textAlign = "center";
  ctx.fillText(receiptLabel("qty"), W - pad - nameWidth - 70, y);
  ctx.textAlign = "left";
  ctx.fillText(receiptLabel("totalCol"), pad, y);
  y += 28;

  items.forEach(function (it, idx) {
    var label = it.name + ((it.unitType === "carton") ? " (" + receiptLabel("carton") + ")" : "");
    ctx.font = "700 22px 'Segoe UI', Tahoma, Arial, sans-serif";
    var lines = wrapCanvasText(ctx, label, nameWidth);
    if (idx % 2 === 0) {
      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(pad - 8, y - 4, W - pad * 2 + 16, itemHeights[idx]);
    }
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 22px 'Segoe UI', Tahoma, Arial, sans-serif";
    ctx.textAlign = "right";
    lines.forEach(function (ln, li) {
      ctx.fillText(ln, W - pad, y + li * 32);
    });
    ctx.textAlign = "center";
    ctx.fillText(String(it.qty || 1), W - pad - nameWidth - 70, y);
    ctx.textAlign = "left";
    ctx.font = "800 22px 'Segoe UI', Tahoma, Arial, sans-serif";
    ctx.fillText(fmt((it.price || 0) * (it.qty || 1)), pad, y);
    y += itemHeights[idx];
  });

  y += 10;
  ctx.strokeStyle = "#0f766e";
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(W - pad, y);
  ctx.stroke();
  y += 18;

  ctx.fillStyle = "#0f766e";
  roundRect(ctx, pad - 8, y, W - pad * 2 + 16, 64, 12);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 24px 'Segoe UI', Tahoma, Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(receiptLabel("grand"), W - pad, y + 18);
  ctx.textAlign = "left";
  ctx.font = "900 30px 'Segoe UI', Tahoma, Arial, sans-serif";
  ctx.fillText(fmt(order.total || 0), pad, y + 14);
  y += 80;

  if (order.cashReceived > 0) {
    ctx.fillStyle = "#334155";
    ctx.font = "700 16px 'Segoe UI', Tahoma, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(receiptLabel("received") + ": " + fmt(order.cashReceived), W - pad, y);
    if (order.changeDue > 0) {
      ctx.textAlign = "left";
      ctx.fillText(receiptLabel("change") + ": " + fmt(order.changeDue), pad, y);
    }
    y += 28;
  }

  ctx.fillStyle = "#0f766e";
  ctx.textAlign = "center";
  ctx.font = "800 20px 'Segoe UI', Tahoma, Arial, sans-serif";
  ctx.fillText(receiptLabel("thanksVisit"), W / 2, y + 8);
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function copyImageBlobToClipboard(blob, onOk) {
  if (!blob) return;
  if (navigator.clipboard && window.ClipboardItem) {
    navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(function () {
      if (onOk) onOk();
    }).catch(function () {
      if (onOk) onOk();
    });
    return;
  }
  if (onOk) onOk();
}

function copyLastReceiptImage() {
  copyImageBlobToClipboard(LAST_WA_RECEIPT_BLOB, function () {
    toast("کۆپی", "وێنەی پسوڵە کۆپی کرا — لە واتسئاپ Ctrl+V بکە", "success");
  });
}

function downloadLastReceiptImage() {
  if (!LAST_WA_RECEIPT_URL) return;
  var a = document.createElement("a");
  a.href = LAST_WA_RECEIPT_URL;
  a.download = "receipt_" + new Date().toISOString().slice(0, 10) + ".png";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function openWhatsAppForReceipt(phone) {
  var typed = document.getElementById("waReceiptPhoneInput");
  var raw = phone || (typed ? typed.value : "") || LAST_WA_RECEIPT_PHONE;
  LAST_WA_RECEIPT_PHONE = raw;
  copyLastReceiptImage();
  var clean = sanitizeWaPhone(raw);
  var url = clean ? ("https://wa.me/" + clean) : "https://web.whatsapp.com/";
  try {
    if (window.POS_DESKTOP && typeof POS_DESKTOP.openExternal === "function") {
      POS_DESKTOP.openExternal(url);
    } else {
      window.open(url, "_blank");
    }
    toast("واتسئاپ", "واتسئاپ کرایەوە — Ctrl+V بۆ ناردنی وێنەی پسوڵە", "success");
  } catch (err) {
    toast("ئاگاداری", "واتسئاپ نەکرایەوە. وێنەکە کۆپی بکە و خۆت پەیست بکە", "warning");
  }
}

function finishReceiptImage(blob, dataUrl) {
  if (!blob && dataUrl) {
    try {
      var parts = dataUrl.split(",");
      var bin = atob(parts[1] || "");
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      blob = new Blob([arr], { type: "image/png" });
    } catch (e) {}
  }
  if (!blob) {
    toast("هەڵە", "وێنەی پسوڵە دروست نەبوو", "error");
    return;
  }
  LAST_WA_RECEIPT_BLOB = blob;
  if (LAST_WA_RECEIPT_URL) URL.revokeObjectURL(LAST_WA_RECEIPT_URL);
  LAST_WA_RECEIPT_URL = URL.createObjectURL(blob);
  var img = document.getElementById("waReceiptPreviewImg");
  if (img) img.src = LAST_WA_RECEIPT_URL || dataUrl;
  var phoneEl = document.getElementById("waReceiptPhoneInput");
  if (phoneEl) phoneEl.value = LAST_WA_RECEIPT_PHONE || "";
  copyImageBlobToClipboard(blob);
  if (typeof showModal === "function") showModal("waReceiptImageModal");
  toast("ئامادەیە", "وێنەی پسوڵە دروست بوو. واتسئاپ بکەرەوە و Ctrl+V بکە", "success");
}

/**
 * Send receipt image to customer via WhatsApp (copy image + open chat)
 */
function sendOrderWhatsApp(order, customerPhone) {
  var ord = order || LAST_ORDER;
  if (!ord && typeof DB !== "undefined" && DB.orders && DB.orders.length > 0) {
    ord = DB.orders[DB.orders.length - 1];
  }
  if (!ord) {
    toast("ئاگاداری", "هیچ پسوڵەیەک نەدۆزرایەوە بۆ ناردن", "warning");
    return;
  }

  LAST_WA_RECEIPT_PHONE = customerPhone || resolveOrderCustomerPhone(ord) || "";
  toast("چاوەڕوان بە", "وێنەی پسوڵە ئامادە دەکرێت...", "info");

  var canvas;
  try {
    canvas = drawOrderReceiptCanvas(ord);
  } catch (err) {
    console.error("drawOrderReceiptCanvas", err);
    toast("هەڵە", "وێنەی پسوڵە دروست نەبوو", "error");
    return;
  }

  try {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob(function (blob) {
        finishReceiptImage(blob, canvas.toDataURL("image/png"));
      }, "image/png");
    } else {
      finishReceiptImage(null, canvas.toDataURL("image/png"));
    }
  } catch (err2) {
    console.error("receipt toBlob", err2);
    toast("هەڵە", "وێنەی پسوڵە دروست نەبوو", "error");
  }
}

function closeSaleSuccessBanner() {
  if (window._saleSuccessTimer) clearTimeout(window._saleSuccessTimer);
  var overlay = document.getElementById("posSaleSuccessOverlay");
  if (overlay) overlay.classList.remove("active");
  var bInput = document.getElementById("headerSearchInput");
  if (bInput) bInput.focus();
}

/**
 * Cashier calculator (center modal)
 */
var POS_CALC = { expr: "", current: "0", last: null, op: null, fresh: true, x: null, y: null, dragged: false };

function posCalcOpLabel(op) {
  if (op === "*") return "×";
  if (op === "/") return "÷";
  if (op === "-") return "−";
  return op || "";
}

function posCalcFormat(n) {
  var x = Number(n);
  if (!isFinite(x)) return "هەڵە";
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return String(parseFloat(x.toFixed(8)));
}

function posCalcRender() {
  var exprEl = document.getElementById("posCalcExpr");
  var disp = document.getElementById("posCalcDisplay");
  if (exprEl) exprEl.textContent = POS_CALC.expr || "\u00a0";
  if (disp) disp.textContent = posCalcFormat(POS_CALC.current);
}

function posCalcReset() {
  POS_CALC.expr = "";
  POS_CALC.current = "0";
  POS_CALC.last = null;
  POS_CALC.op = null;
  POS_CALC.fresh = true;
  posCalcRender();
}

function posCalcCompute(a, op, b) {
  a = Number(a);
  b = Number(b);
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return b === 0 ? NaN : a / b;
  return b;
}

function posCalcDigit(d) {
  d = String(d);
  if (POS_CALC.fresh || POS_CALC.current === "0" || POS_CALC.current === "هەڵە") {
    POS_CALC.current = d === "0" ? "0" : d;
    POS_CALC.fresh = false;
  } else if (String(POS_CALC.current).replace(".", "").length < 12) {
    POS_CALC.current += d;
  }
  posCalcRender();
}

function posCalcZeros(zeros) {
  if (POS_CALC.fresh || POS_CALC.current === "0" || POS_CALC.current === "هەڵە") {
    POS_CALC.current = "0";
    POS_CALC.fresh = false;
    posCalcRender();
    return;
  }
  var raw = String(POS_CALC.current);
  if (raw.replace(".", "").length + zeros.length > 12) return;
  POS_CALC.current = raw + zeros;
  posCalcRender();
}

function posCalcDot() {
  if (POS_CALC.fresh || POS_CALC.current === "هەڵە") {
    POS_CALC.current = "0.";
    POS_CALC.fresh = false;
  } else if (String(POS_CALC.current).indexOf(".") === -1) {
    POS_CALC.current += ".";
  }
  posCalcRender();
}

function posCalcBack() {
  if (POS_CALC.fresh) return;
  var raw = String(POS_CALC.current);
  raw = raw.slice(0, -1);
  POS_CALC.current = raw === "" || raw === "-" ? "0" : raw;
  if (POS_CALC.current === "0") POS_CALC.fresh = true;
  posCalcRender();
}

function posCalcClear() {
  posCalcReset();
}

function posCalcOp(op) {
  var cur = Number(POS_CALC.current);
  if (!isFinite(cur)) {
    posCalcReset();
    return;
  }
  if (POS_CALC.op && POS_CALC.last != null && !POS_CALC.fresh) {
    cur = posCalcCompute(POS_CALC.last, POS_CALC.op, cur);
    POS_CALC.current = String(cur);
  }
  POS_CALC.last = cur;
  POS_CALC.op = op;
  POS_CALC.expr = posCalcFormat(cur) + " " + posCalcOpLabel(op);
  POS_CALC.fresh = true;
  posCalcRender();
}

function posCalcPercent() {
  var cur = Number(POS_CALC.current) || 0;
  if (POS_CALC.op && POS_CALC.last != null) {
    var left = Number(POS_CALC.last) || 0;
    if (POS_CALC.op === "+" || POS_CALC.op === "-") {
      var part = left * cur / 100;
      var res = POS_CALC.op === "+" ? left + part : left - part;
      POS_CALC.expr = posCalcFormat(left) + " " + posCalcOpLabel(POS_CALC.op) + " " + posCalcFormat(cur) + "%";
      POS_CALC.current = String(res);
      POS_CALC.last = null;
      POS_CALC.op = null;
    } else {
      POS_CALC.current = String(cur / 100);
    }
  } else {
    POS_CALC.current = String(cur / 100);
  }
  POS_CALC.fresh = true;
  posCalcRender();
}

function posCalcEquals() {
  var cur = Number(POS_CALC.current);
  if (POS_CALC.op && POS_CALC.last != null) {
    var res = posCalcCompute(POS_CALC.last, POS_CALC.op, cur);
    POS_CALC.expr = posCalcFormat(POS_CALC.last) + " " + posCalcOpLabel(POS_CALC.op) + " " + posCalcFormat(cur) + " =";
    POS_CALC.current = isFinite(res) ? String(res) : "هەڵە";
    POS_CALC.last = null;
    POS_CALC.op = null;
  }
  POS_CALC.fresh = true;
  posCalcRender();
}

function posCalcPreset(amt) {
  POS_CALC.current = String(Number(amt) || 0);
  POS_CALC.fresh = true;
  posCalcRender();
}

function posCalcExact() {
  var totals = (typeof getCartTotals === "function") ? getCartTotals() : { grandTotal: 0 };
  posCalcPreset(totals.grandTotal || 0);
}

function posCalcApplyCash() {
  if (POS_CALC.op && POS_CALC.last != null) posCalcEquals();
  var val = Number(POS_CALC.current);
  if (!isFinite(val) || val < 0) val = 0;
  POS_CASH_RECEIVED = val;
  if (typeof window !== "undefined") window.POS_CASH_RECEIVED = val;
  var totals = (typeof getCartTotals === "function") ? getCartTotals() : { grandTotal: 0 };
  if (typeof updateCashReturnDisplay === "function") updateCashReturnDisplay(totals.grandTotal);
  if (typeof PosAudio !== "undefined" && PosAudio.playCashChime) PosAudio.playCashChime();
  hideModal("quickKeypadModal");
}

function posCalcKeydown(e) {
  var modal = document.getElementById("quickKeypadModal");
  if (!modal || !modal.classList.contains("active")) return;
  var win = document.getElementById("posCalcWindow") || modal.querySelector(".pos-calc-modal");
  if (win && document.activeElement && !win.contains(document.activeElement) && document.activeElement !== win && document.activeElement !== modal) {
    return;
  }
  if (typeof isKeyboardTypingTarget === "function" && isKeyboardTypingTarget(e.target) && !(win && win.contains(e.target))) {
    return;
  }
  var k = e.key;
  if (k === "Escape") { e.preventDefault(); toggleQuickKeypadModal(); return; }
  if (k === "Enter" || k === "=") { e.preventDefault(); posCalcEquals(); return; }
  if (k === "Backspace") { e.preventDefault(); posCalcBack(); return; }
  if ((k === "Delete" || k === "c" || k === "C") && !e.ctrlKey && !e.metaKey) { e.preventDefault(); posCalcClear(); return; }
  if (k === "%") { e.preventDefault(); posCalcPercent(); return; }
  if (k === "+" || k === "-" || k === "*" || k === "/") { e.preventDefault(); posCalcOp(k); return; }
  if (k === ".") { e.preventDefault(); posCalcDot(); return; }
  if (/^[0-9]$/.test(k)) { e.preventDefault(); posCalcDigit(k); }
}

function posCalcCenterCoords() {
  var box = document.getElementById("posCalcWindow");
  var w = (box && box.offsetWidth) ? box.offsetWidth : 400;
  var h = (box && box.offsetHeight) ? box.offsetHeight : 540;
  return {
    x: Math.max(8, Math.round((window.innerWidth - w) / 2)),
    y: Math.max(8, Math.round((window.innerHeight - h) / 2))
  };
}

function posCalcHasSavedPos() {
  return POS_CALC.dragged && isFinite(Number(POS_CALC.x)) && isFinite(Number(POS_CALC.y));
}

function applyPosCalcPosition(forceCenter) {
  var box = document.getElementById("posCalcWindow");
  if (!box) return;
  var x;
  var y;
  if (forceCenter || !posCalcHasSavedPos()) {
    var c = posCalcCenterCoords();
    x = c.x;
    y = c.y;
    POS_CALC.x = x;
    POS_CALC.y = y;
  } else {
    x = Number(POS_CALC.x);
    y = Number(POS_CALC.y);
  }
  box.style.setProperty("--pos-calc-x", x + "px");
  box.style.setProperty("--pos-calc-y", y + "px");
  box.style.setProperty("left", x + "px", "important");
  box.style.setProperty("top", y + "px", "important");
  box.style.setProperty("right", "auto", "important");
  box.style.setProperty("bottom", "auto", "important");
  box.style.setProperty("position", "fixed", "important");
  box.style.setProperty("margin", "0", "important");
  box.style.setProperty("transform", "none", "important");
  box.style.setProperty("pointer-events", "auto", "important");
  box.style.setProperty("z-index", "1000000", "important");
}

function posCalcPoint(e) {
  var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
  if (t) return { x: t.clientX, y: t.clientY };
  return { x: e.clientX, y: e.clientY };
}

function bindPosCalcDrag() {
  if (window._posCalcDragBound) return;
  var handle = document.getElementById("posCalcDragHandle");
  var box = document.getElementById("posCalcWindow");
  if (!handle || !box) return;
  window._posCalcDragBound = true;
  var dragging = false;
  var ox = 0;
  var oy = 0;
  function startDrag(e) {
    if (e.type === "mousedown" && e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest("button, .modal-close")) return;
    dragging = true;
    var rect = box.getBoundingClientRect();
    var p = posCalcPoint(e);
    ox = p.x - rect.left;
    oy = p.y - rect.top;
    e.preventDefault();
    e.stopPropagation();
  }
  function moveDrag(e) {
    if (!dragging) return;
    var p = posCalcPoint(e);
    var nx = Math.max(8, Math.min(window.innerWidth - 80, p.x - ox));
    var ny = Math.max(8, Math.min(window.innerHeight - 40, p.y - oy));
    POS_CALC.x = nx;
    POS_CALC.y = ny;
    POS_CALC.dragged = true;
    applyPosCalcPosition();
    e.preventDefault();
  }
  function endDrag() { dragging = false; }
  handle.addEventListener("mousedown", startDrag);
  handle.addEventListener("touchstart", startDrag, { passive: false });
  document.addEventListener("mousemove", moveDrag, true);
  document.addEventListener("touchmove", moveDrag, { capture: true, passive: false });
  document.addEventListener("mouseup", endDrag, true);
  document.addEventListener("touchend", endDrag, true);
}

function stylePosCalcOverlay() {
  var modal = document.getElementById("quickKeypadModal");
  if (!modal) return;
  modal.style.setProperty("background", "transparent", "important");
  modal.style.setProperty("backdrop-filter", "none", "important");
  modal.style.setProperty("-webkit-backdrop-filter", "none", "important");
  modal.style.setProperty("pointer-events", "none", "important");
  modal.style.setProperty("align-items", "stretch", "important");
  modal.style.setProperty("justify-content", "stretch", "important");
  modal.style.setProperty("width", "0", "important");
  modal.style.setProperty("height", "0", "important");
  modal.style.setProperty("inset", "auto", "important");
  modal.style.setProperty("top", "0", "important");
  modal.style.setProperty("left", "0", "important");
  modal.style.setProperty("right", "auto", "important");
  modal.style.setProperty("bottom", "auto", "important");
  modal.style.setProperty("overflow", "visible", "important");
  var box = document.getElementById("posCalcWindow");
  if (box) box.style.setProperty("pointer-events", "auto", "important");
}

function toggleQuickKeypadModal() {
  var modal = document.getElementById("quickKeypadModal");
  if (!modal) return;
  if (modal.classList.contains("active")) {
    hideModal("quickKeypadModal");
    return;
  }
  posCalcRender();
  showModal("quickKeypadModal");
  stylePosCalcOverlay();
  applyPosCalcPosition(!POS_CALC.dragged);
  bindPosCalcDrag();
  function centerFirstOpen() {
    if (!POS_CALC.dragged) applyPosCalcPosition(true);
  }
  requestAnimationFrame(function () {
    requestAnimationFrame(centerFirstOpen);
  });
  setTimeout(centerFirstOpen, 40);
  var win = document.getElementById("posCalcWindow");
  if (win && win.focus) {
    setTimeout(function () { try { win.focus(); } catch (eF) {} }, 40);
  }
}

if (!window._posCalcKeysBound) {
  window._posCalcKeysBound = true;
  document.addEventListener("keydown", posCalcKeydown, true);
}

function keypadAddDigit(d) { posCalcDigit(d); }
function keypadBackspace() { posCalcBack(); }
function keypadClear() { posCalcClear(); }
function keypadAddAmount(amt) { posCalcPreset(amt); }
function keypadExactAmount() { posCalcExact(); }
function keypadApplyCash() { posCalcApplyCash(); }

window.toggleQuickKeypadModal = toggleQuickKeypadModal;
window.posCalcDigit = posCalcDigit;
window.posCalcZeros = posCalcZeros;
window.posCalcDot = posCalcDot;
window.posCalcBack = posCalcBack;
window.posCalcClear = posCalcClear;
window.posCalcOp = posCalcOp;
window.posCalcPercent = posCalcPercent;
window.posCalcEquals = posCalcEquals;
window.posCalcPreset = posCalcPreset;
window.posCalcExact = posCalcExact;
window.posCalcApplyCash = posCalcApplyCash;

/* ═══════════════ OWNER MOBILE DASHBOARD (QR & URL) ═══════════════ */
function openOwnerMobileQrModal() {
  fetch('/api/network-info')
    .then(function(r) { return r.json(); })
    .then(function(info) {
      var url = info.ownerUrl || (window.location.origin + '/owner.html');
      var urlEl = $("#ownerMobileUrlText");
      if (urlEl) urlEl.textContent = url;
      var qrImg = $("#ownerQrImg");
      if (qrImg) {
        qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(url);
      }
      showModal("ownerMobileQrModal");
    })
    .catch(function() {
      var url = window.location.origin + '/owner.html';
      var urlEl = $("#ownerMobileUrlText");
      if (urlEl) urlEl.textContent = url;
      var qrImg = $("#ownerQrImg");
      if (qrImg) {
        qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(url);
      }
      showModal("ownerMobileQrModal");
    });
}

function closeOwnerMobileQrModal() {
  hideModal("ownerMobileQrModal");
}

function copyOwnerMobileUrl() {
  var urlEl = $("#ownerMobileUrlText");
  if (!urlEl) return;
  var text = urlEl.textContent;
  navigator.clipboard.writeText(text).then(function() {
    toast("سەرکەوتوو", "لینکی داشبۆردی مۆبایل کۆپیکرا ✅", "success");
  }).catch(function() {
    toast("زانیاری", text, "info");
  });
}

/* ═══════════════ EXPIRY DATE & CLEARANCE PRICING ENGINE ═══════════════ */
var EXPIRY_ITEMS_CACHE = [];
var CURRENT_EXPIRY_FILTER = 'all';

function openExpiryManagerModal() {
  showModal("expiryManagerModal");
  loadExpiringProducts();
}

function closeExpiryManagerModal() {
  hideModal("expiryManagerModal");
}

function loadExpiringProducts() {
  var tbody = $("#expiryTableBody");
  if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> بارکردنی زانیارییەکان...</td></tr>';

  fetch('/api/products/expiring')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      EXPIRY_ITEMS_CACHE = data.items || [];
      var s = data.summary || {};

      // Metrics
      var riskEl = $("#emRiskValue");
      if (riskEl) riskEl.textContent = fmt(s.totalAtRiskValue || 0);
      var expEl = $("#emExpiredCount");
      if (expEl) expEl.textContent = s.expiredCount || 0;
      var critEl = $("#emCriticalCount");
      if (critEl) critEl.textContent = s.criticalCount || 0;
      var warnEl = $("#emWarningCount");
      if (warnEl) warnEl.textContent = s.warningCount || 0;
      var upEl = $("#emUpcomingCount");
      if (upEl) upEl.textContent = s.upcomingCount || 0;

      // Update header badge
      var totalUrgent = (s.criticalCount || 0) + (s.warningCount || 0) + (s.expiredCount || 0);
      var badgeEl = $("#headerExpiryBadge");
      if (badgeEl) {
        if (totalUrgent > 0) {
          badgeEl.textContent = totalUrgent;
          badgeEl.style.display = "inline-block";
        } else {
          badgeEl.style.display = "none";
        }
      }

      // Tab Counts
      if ($("#emTabAllCount")) $("#emTabAllCount").textContent = EXPIRY_ITEMS_CACHE.length;
      if ($("#emTabCritCount")) $("#emTabCritCount").textContent = s.criticalCount || 0;
      if ($("#emTabWarnCount")) $("#emTabWarnCount").textContent = s.warningCount || 0;
      if ($("#emTabExpCount")) $("#emTabExpCount").textContent = s.expiredCount || 0;
      if ($("#emTabClearCount")) $("#emTabClearCount").textContent = EXPIRY_ITEMS_CACHE.filter(function(i){ return i.clearanceDiscount > 0; }).length;

      renderExpiryTable();
    })
    .catch(function(err) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--danger);">هەڵە لە هێنانی داتای بەسەرچوون</td></tr>';
    });
}

function setExpiryFilter(filter, btn) {
  CURRENT_EXPIRY_FILTER = filter;
  var container = $("#emFilterTabs");
  if (container) {
    var btns = container.querySelectorAll("button");
    btns.forEach(function(b) {
      b.classList.remove("btn-primary");
      b.classList.add("btn-outline");
    });
  }
  if (btn) {
    btn.classList.add("btn-primary");
    btn.classList.remove("btn-outline");
  }
  renderExpiryTable();
}

function renderExpiryTable() {
  var tbody = $("#expiryTableBody");
  if (!tbody) return;

  var filtered = EXPIRY_ITEMS_CACHE.filter(function(item) {
    if (CURRENT_EXPIRY_FILTER === 'all') return true;
    if (CURRENT_EXPIRY_FILTER === 'critical') return item.status === 'critical';
    if (CURRENT_EXPIRY_FILTER === 'warning') return item.status === 'warning';
    if (CURRENT_EXPIRY_FILTER === 'expired') return item.status === 'expired';
    if (CURRENT_EXPIRY_FILTER === 'clearance') return (item.clearanceDiscount > 0);
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-muted);"><i class="fas fa-check-circle" style="color:var(--success);font-size:1.5rem;display:block;margin-bottom:8px;"></i>هیچ بەرهەمێک نەدۆزرایەوە لەم بەشەدا</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function(item) {
    var expPill = '';
    if (item.status === 'expired') {
      expPill = '<span style="background:rgba(239,68,68,0.2);color:var(--danger);padding:3px 8px;border-radius:6px;font-weight:800;border:1px solid rgba(239,68,68,0.4);"><i class="fas fa-ban"></i> بەسەرچووە</span>';
    } else if (item.status === 'critical') {
      expPill = '<span style="background:#dc2626;color:#fff;padding:3px 8px;border-radius:6px;font-weight:800;box-shadow:0 0 8px rgba(220,38,38,0.6);"><i class="fas fa-radiation"></i> ' + item.daysLeft + ' ڕۆژ ماوە</span>';
    } else if (item.status === 'warning') {
      expPill = '<span style="background:#d97706;color:#fff;padding:3px 8px;border-radius:6px;font-weight:800;"><i class="fas fa-clock"></i> ' + item.daysLeft + ' ڕۆژ ماوە</span>';
    } else {
      expPill = '<span style="background:rgba(59,130,246,0.15);color:#60a5fa;padding:3px 8px;border-radius:6px;font-weight:700;">' + item.daysLeft + ' ڕۆژ ماوە</span>';
    }

    var disc = parseFloat(item.clearanceDiscount) || 0;
    var promoPrice = (parseFloat(item.clearancePrice) > 0) ? parseFloat(item.clearancePrice) : Math.round(item.price * (1 - disc / 100));

    var clearanceCell = (disc > 0)
      ? ('<div><strong style="color:var(--danger);font-size:0.95rem;">' + fmt(promoPrice) + '</strong> <span style="background:var(--danger);color:#fff;font-size:0.68rem;padding:1px 5px;border-radius:4px;font-weight:800;">-%' + disc + '</span></div>')
      : '<span style="color:var(--text-muted);">-</span>';

    return '<tr>' +
      '<td style="text-align:center;"><input type="checkbox" class="em-row-check" data-id="' + item.id + '"></td>' +
      '<td><strong>' + item.name + '</strong></td>' +
      '<td style="font-family:monospace;font-size:0.75rem;">' + (item.barcode || '-') + '</td>' +
      '<td><span style="font-weight:800;color:' + (item.stock <= 0 ? 'var(--danger)' : '#fff') + '">' + item.stock + '</span></td>' +
      '<td>' + fmt(item.price) + '</td>' +
      '<td>' + (item.expiryDate || '-') + '</td>' +
      '<td>' + expPill + '</td>' +
      '<td>' + clearanceCell + '</td>' +
      '<td style="text-align:center;">' +
        '<div style="display:flex;align-items:center;justify-content:center;gap:4px;">' +
          '<button type="button" class="btn btn-sm" onclick="setProductClearance(\'' + item.id + '\', 25)" style="background:#059669;color:#fff;font-size:0.7rem;padding:3px 7px;" title="دانانی داشکاندنی 25%">-25%</button>' +
          '<button type="button" class="btn btn-sm" onclick="setProductClearance(\'' + item.id + '\', 50)" style="background:#d97706;color:#fff;font-size:0.7rem;padding:3px 7px;" title="دانانی داشکاندنی 50%">-50%</button>' +
          '<button type="button" class="btn btn-sm btn-danger" onclick="writeOffProductWaste(\'' + item.id + '\')" style="font-size:0.7rem;padding:3px 7px;" title="تەلەفکردن (Waste / Write-Off)"><i class="fas fa-trash-can"></i> تەلەف</button>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function toggleSelectAllExpiry(master) {
  var checks = document.querySelectorAll(".em-row-check");
  checks.forEach(function(c) { c.checked = master.checked; });
}

function getSelectedExpiryIds() {
  var ids = [];
  var checks = document.querySelectorAll(".em-row-check:checked");
  checks.forEach(function(c) {
    var id = c.getAttribute("data-id");
    if (id) ids.push(id);
  });
  return ids;
}

function setProductClearance(productId, pct) {
  var prod = EXPIRY_ITEMS_CACHE.find(function(p){ return p.id === productId; });
  var name = prod ? prod.name : 'بەرهەم';
  fetch('/api/products/clearance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: productId, discountPct: pct, cashier: (DB.currentUser ? DB.currentUser.name : 'بەڕێوەبەر') })
  })
  .then(function(r) { return r.json(); })
  .then(function(res) {
    if (res.success) {
      toast("داشکاندنی پاکتاوکردن", name + ": داشکاندنی -%" + pct + " دانرا ✅", "success");
      var localP = DB.products.find(function(p){ return p.id === productId; });
      if (localP) {
        localP.clearanceDiscount = pct;
        localP.clearancePrice = res.clearancePrice;
      }
      loadExpiringProducts();
      renderProductGrid(POS_GRID_CATEGORY);
    }
  });
}

function applyBulkClearance(pct) {
  var ids = getSelectedExpiryIds();
  if (ids.length === 0) {
    toast("ئاگاداری", "تکایە سەرەتا چەند بەرهەمێک دیاری بکە لە خشتەکەدا", "warning");
    return;
  }

  fetch('/api/products/clearance/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productIds: ids, discountPct: pct, cashier: (DB.currentUser ? DB.currentUser.name : 'بەڕێوەبەر') })
  })
  .then(function(r) { return r.json(); })
  .then(function(res) {
    if (res.success) {
      toast("داشکاندنی بەکۆمەڵ", "داشکاندنی -%" + pct + " بۆ " + res.count + " بەرهەم جێبەجێکرا ✅", "success");
      ids.forEach(function(id) {
        var localP = DB.products.find(function(p){ return p.id === id; });
        if (localP) {
          localP.clearanceDiscount = pct;
          localP.clearancePrice = (pct > 0) ? Math.round(localP.price * (1 - pct / 100)) : 0;
        }
      });
      loadExpiringProducts();
      renderProductGrid(POS_GRID_CATEGORY);
    }
  });
}

function writeOffProductWaste(productId) {
  var prod = EXPIRY_ITEMS_CACHE.find(function(p){ return p.id === productId; });
  if (!prod) return;

  if (!confirm("ئایا دڵنیایت کە دەتەوێت تەواوی کۆگای ئەم کاڵایە (" + prod.stock + " دانە) بە تەلەف و فەوتاو تۆمار بکەیت؟")) return;

  fetch('/api/products/waste-writeoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: productId, quantity: prod.stock, reason: 'تەلەف بەهۆی بەسەرچوون (Clearance Expiry)', cashier: (DB.currentUser ? DB.currentUser.name : 'بەڕێوەبەر') })
  })
  .then(function(r) { return r.json(); })
  .then(function(res) {
    if (res.success) {
      toast("تەلەفکرا", prod.name + ": بە فەوتاو و تەلەف تۆمارکرا", "info");
      var localP = DB.products.find(function(p){ return p.id === productId; });
      if (localP) localP.stock = 0;
      loadExpiringProducts();
      renderProductGrid(POS_GRID_CATEGORY);
    }
  });
}

/* ═══════════════ OWNER BROADCAST LISTENER (POS) ═══════════════ */
var LAST_SEEN_BROADCAST_ID = null;

function pollOwnerBroadcasts() {
  if (window.isPosDemoMode && window.isPosDemoMode()) return;
  fetch('/api/owner/broadcasts')
    .then(function(r) { return r.json(); })
    .then(function(broadcasts) {
      if (broadcasts && broadcasts.length > 0) {
        var latest = broadcasts[0];
        if (latest.id !== LAST_SEEN_BROADCAST_ID && !sessionStorage.getItem('dismissed_bc_' + latest.id)) {
          LAST_SEEN_BROADCAST_ID = latest.id;
          showBroadcastBanner(latest);
        }
      }
    })
    .catch(function(){});
}

function showBroadcastBanner(bc) {
  var banner = $("#ownerBroadcastBanner");
  var textEl = $("#ownerBroadcastText");
  if (banner && textEl) {
    textEl.textContent = bc.message;
    banner.style.display = "block";
    if (typeof PosAudio !== "undefined") PosAudio.playCashChime();
  }
}

function dismissBroadcastBanner() {
  var banner = $("#ownerBroadcastBanner");
  if (banner) banner.style.display = "none";
  if (LAST_SEEN_BROADCAST_ID) {
    sessionStorage.setItem('dismissed_bc_' + LAST_SEEN_BROADCAST_ID, 'true');
  }
}

function updateHeaderExpiryBadge() {
  fetch('/api/products/expiring')
    .then(function(r){ return r.json(); })
    .then(function(data) {
      var s = data.summary || {};
      var totalUrgent = (s.criticalCount || 0) + (s.warningCount || 0) + (s.expiredCount || 0);
      var badgeEl = $("#headerExpiryBadge");
      if (badgeEl) {
        if (totalUrgent > 0) {
          badgeEl.textContent = totalUrgent;
          badgeEl.style.display = "inline-block";
        } else {
          badgeEl.style.display = "none";
        }
      }
    })
    .catch(function(){});
}

/* ═══════════════ CASHIER ANTI-THEFT & FRAUD DETECTION UI ═══════════════ */
var CURRENT_SECURITY_FILTER = 'all';
var ACTIVE_CANCEL_ORDER_ID = null;
var SELECTED_NO_SALE_REASON = '🪙 هێنانی وردە پارە بۆ سندوق';

// 1. Clear Cart Confirmation Modal (Routed to clearCurrentCart)
function openClearCartModal() {
  clearCurrentCart();
}

function closeClearCartModal() {
  hideModal("clearCartConfirmModal");
}

function confirmClearCart() {
  var pin = ($("#clearCartPinInput") ? $("#clearCartPinInput").value : "").trim();
  if (!pin) {
    toast("هەڵە", "تکایە پینی بەڕێوەبەر داخڵ بکە", "error");
    return;
  }

  fetch('/api/security/verify-pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: pin })
  })
  .then(function(r) { return r.json(); })
  .then(function(res) {
    if (!res.success) {
      toast("ڕەتکرایەوە", res.error || "پینی بەڕێوەبەر هەڵەیە", "error");
      return;
    }

    var currentCart = CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart;
    var totalAmt = currentCart.reduce(function (s, c) { return s + c.price * c.qty; }, 0);
    var reason = ($("#clearCartReasonSelect") ? $("#clearCartReasonSelect").value : "پاککردنەوەی سەبەتە");
    var shiftId = CURRENT_SHIFT ? CURRENT_SHIFT.id : null;
    var cashierName = (DB.currentUser && (DB.currentUser.fullName || DB.currentUser.username)) || 'کاشیر';

    // Log Cart Void
    fetch('/api/security/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shiftId: shiftId,
        cashier: cashierName,
        actionType: 'cart_clear',
        severity: 'high',
        details: 'پاککردنەوەی تەواوی سەبەتە (' + currentCart.length + ' جۆر کاڵا) بە بەهای ' + fmt(totalAmt) + ' بە ڕەزامەندی [' + res.authorizedBy + ']',
        amount: totalAmt,
        reason: reason,
        managerPinUsed: 1
      })
    }).then(function(){ updateHeaderSecurityBadge(); }).catch(function(){});

    CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart = [];
    renderCart();
    closeClearCartModal();
    toast("سەرکەوتوو", "سەبەتە بە سەرکەوتوویی پاککرایەوە و لە ئاسایش تۆمارکرا", "success");
  })
  .catch(function() {
    toast("هەڵە", "کێشە لە پەیوەندی بە سێرڤەر", "error");
  });
}

// 2. No-Sale Drawer Kick Modal (F12)
function openNoSaleDrawerModal() {
  SELECTED_NO_SALE_REASON = '🪙 هێنانی وردە پارە بۆ سندوق';
  $$(".no-sale-chip").forEach(function(b, idx) {
    if (idx === 0) b.classList.add('active');
    else b.classList.remove('active');
  });

  var noteIn = $("#noSaleNoteInput");
  var pinIn = $("#noSalePinInput");
  if (noteIn) noteIn.value = "";
  if (pinIn) pinIn.value = "";

  showModal("noSaleDrawerModal");
  if (pinIn) setTimeout(function(){ pinIn.focus(); }, 100);
}

function closeNoSaleDrawerModal() {
  hideModal("noSaleDrawerModal");
}

function selectNoSaleReason(btn, reason) {
  SELECTED_NO_SALE_REASON = reason;
  $$(".no-sale-chip").forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
}

function confirmNoSaleDrawer() {
  var note = ($("#noSaleNoteInput") ? $("#noSaleNoteInput").value : "").trim();
  var pin = ($("#noSalePinInput") ? $("#noSalePinInput").value : "").trim();
  var shiftId = CURRENT_SHIFT ? CURRENT_SHIFT.id : null;
  var cashierName = (DB.currentUser && (DB.currentUser.fullName || DB.currentUser.username)) || 'کاشیر';

  fetch('/api/security/drawer-kick', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shiftId: shiftId,
      cashier: cashierName,
      reason: SELECTED_NO_SALE_REASON,
      note: note,
      managerPin: pin
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(res) {
    if (res.success) {
      if (typeof PosAudio !== 'undefined') PosAudio.playDrawerKick();
      toast("کەشتی پارە", "دەرگای سندوق کرایەوە و هۆکارەکەی لە ئاسایش پاشکەوت کرا", "success");
      closeNoSaleDrawerModal();
      updateHeaderSecurityBadge();
    } else {
      toast("هەڵە", res.error || "کردنەوەی سندوق سەرکەوتوو نەبوو", "error");
    }
  })
  .catch(function() {
    // Local fallback sound
    if (typeof PosAudio !== 'undefined') PosAudio.playDrawerKick();
    toast("کەشتی پارە", "دەرگای سندوق کرایەوە", "success");
    closeNoSaleDrawerModal();
  });
}

// 3. Post-Sale Cancel Modal
function openCancelSaleModal(orderId) {
  var order = DB.orders.find(function(o){ return o.id === orderId; });
  if (!order) {
    toast("هەڵە", "پسوڵەکە نەدۆزرایەوە", "error");
    return;
  }
  if (order.status === 'cancelled') {
    toast("ئاگاداری", "ئەم پسوڵەیە پێشتر هەڵوەشاوەتەوە", "warning");
    return;
  }

  ACTIVE_CANCEL_ORDER_ID = orderId;
  var numEl = $("#cancelSaleOrderNum");
  if (numEl) numEl.textContent = '#' + (orderBillNo(order) || (order.id ? order.id.slice(-5).toUpperCase() : 'ORD'));
  var cashEl = $("#cancelSaleCashier");
  var totEl = $("#cancelSaleTotal");
  var methEl = $("#cancelSaleMethod");
  var pinIn = $("#cancelSalePinInput");

  if (cashEl) cashEl.textContent = order.cashier || 'کاشیر';
  if (totEl) totEl.textContent = fmt(order.total);
  if (methEl) methEl.textContent = order.paymentMethod === 'debt' ? 'قەرز' : (order.paymentMethod === 'card' ? 'کارت' : 'نەقد');
  if (pinIn) pinIn.value = "";

  showModal("cancelSaleModal");
  if (pinIn) setTimeout(function(){ pinIn.focus(); }, 100);
}

function closeCancelSaleModal() {
  hideModal("cancelSaleModal");
  ACTIVE_CANCEL_ORDER_ID = null;
}

function confirmCancelSale() {
  if (!ACTIVE_CANCEL_ORDER_ID) return;
  var pin = ($("#cancelSalePinInput") ? $("#cancelSalePinInput").value : "").trim();
  if (!pin) {
    toast("پێویستە", "پینی بەڕێوەبەر پێویستە بۆ پووچەڵکردنەوە", "error");
    return;
  }

  var reason = ($("#cancelSaleReasonSelect") ? $("#cancelSaleReasonSelect").value : "هەڵوەشاندنەوە");
  var cashierName = (DB.currentUser && (DB.currentUser.fullName || DB.currentUser.username)) || 'کاشیر';

  fetch('/api/security/cancel-sale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: ACTIVE_CANCEL_ORDER_ID,
      managerPin: pin,
      reason: reason,
      cashier: cashierName
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(res) {
    if (res.success) {
      toast("سەرکەوتوو", "پسوڵەی #" + ACTIVE_CANCEL_ORDER_ID.slice(-8).toUpperCase() + " هەڵوەشایەوە، کاڵاکان گەڕانەوە و پارەکە لە سندوق کەمکرایەوە", "success");
      
      // Update local order
      var localO = DB.orders.find(function(o){ return o.id === ACTIVE_CANCEL_ORDER_ID; });
      if (localO) localO.status = 'cancelled';
      
      closeCancelSaleModal();
      updateHeaderSecurityBadge();
      
      // Refresh shift & reports if on reports page
      if (typeof ShiftsManager !== 'undefined' && ShiftsManager.refreshCurrentShift) {
        ShiftsManager.refreshCurrentShift();
      }
      var activeReportTab = $(".report-tab.active");
      if (activeReportTab && typeof switchReportTab === 'function') {
        renderSalesReport($("#reportContent"));
      }
    } else {
      toast("ڕەتکرایەوە", res.error || "هەڵوەشاندنەوە سەرکەوتوو نەبوو", "error");
    }
  })
  .catch(function(err) {
    toast("هەڵە", "کێشە لە پەیوەندی بە سێرڤەر", "error");
  });
}

// 4. Security Audit Modal & Badge
function openSecurityAuditModal() {
  showModal("securityAuditModal");
  loadSecurityLogs();
}

function closeSecurityAuditModal() {
  hideModal("securityAuditModal");
}

function setSecurityFilter(filter, btn) {
  CURRENT_SECURITY_FILTER = filter;
  $$("#secFilterTabs button").forEach(function(b) {
    b.classList.remove('btn-primary');
    b.classList.add('btn-outline');
  });
  if (btn) {
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-outline');
  }
  loadSecurityLogs();
}

function loadSecurityLogs() {
  var tbody = $("#securityAuditTableBody");
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> بارکردنی داتاکان...</td></tr>';

  // 1. Fetch summary
  fetch('/api/security/summary')
    .then(function(r){ return r.json(); })
    .then(function(data) {
      var vCount = $("#secModalVoidCount");
      var vAmt = $("#secModalVoidAmt");
      var nsCount = $("#secModalNoSaleCount");
      var cCount = $("#secModalCancelCount");
      var cAmt = $("#secModalCancelAmt");
      var critCount = $("#secModalCritCount");

      if (vCount) vCount.textContent = data.voidCount || 0;
      if (vAmt) vAmt.textContent = fmt(data.voidAmount || 0);
      if (nsCount) nsCount.textContent = data.noSaleCount || 0;
      if (cCount) cCount.textContent = data.cancelCount || 0;
      if (cAmt) cAmt.textContent = fmt(data.cancelAmount || 0);
      if (critCount) critCount.textContent = data.criticalCount || 0;
    })
    .catch(function(){});

  // 2. Fetch logs with filter
  var url = '/api/security/logs?limit=50';
  if (CURRENT_SECURITY_FILTER !== 'all') {
    url += '&actionType=' + CURRENT_SECURITY_FILTER;
  }

  fetch(url)
    .then(function(r){ return r.json(); })
    .then(function(logs) {
      if (!tbody) return;
      if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted);">هیچ تۆمارێکی ئاسایش بەردەست نییە</td></tr>';
        return;
      }

      tbody.innerHTML = logs.map(function(item) {
        var timeStr = item.timestamp ? formatSaleDateTime(item.timestamp) : '';
        var actionLabel = item.actionType === 'item_void' ? '<span style="color:#f87171;"><i class="fas fa-trash"></i> سڕینەوەی کاڵا</span>' :
                         (item.actionType === 'cart_clear' ? '<span style="color:#ef4444;"><i class="fas fa-trash-can"></i> پاککردنەوەی سەبەتە</span>' :
                         (item.actionType === 'no_sale_drawer' ? '<span style="color:#fbbf24;"><i class="fas fa-door-open"></i> سندوقی بێ فرۆشتن</span>' :
                         (item.actionType === 'post_sale_cancel' ? '<span style="color:#38bdf8;"><i class="fas fa-ban"></i> پووچەڵکردنی پسوڵە</span>' : item.actionType)));

        var sevColor = item.severity === 'critical' ? '#ef4444' : (item.severity === 'high' ? '#f59e0b' : '#38bdf8');
        var sevLabel = item.severity === 'critical' ? 'مەترسیدار' : (item.severity === 'high' ? 'بەرز' : 'ئاسایی');

        var authBadge = item.managerPinUsed 
          ? '<span style="background:rgba(16,185,129,0.2);color:#34d399;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:700;"><i class="fas fa-check"></i> پینی بەڕێوەبەر</span>'
          : '<span style="color:var(--text-muted);font-size:0.75rem;">دەستی کاشیر</span>';

        return '<tr>' +
          '<td>' + timeStr + '</td>' +
          '<td><strong>' + (item.cashier || 'کاشیر') + '</strong></td>' +
          '<td>' + actionLabel + '</td>' +
          '<td><span style="color:' + sevColor + ';font-weight:800;font-size:0.75rem;padding:2px 6px;border-radius:4px;border:1px solid ' + sevColor + ';">' + sevLabel + '</span></td>' +
          '<td style="max-width:260px;font-size:0.78rem;">' + item.details + '</td>' +
          '<td style="font-weight:700;">' + (item.amount > 0 ? fmt(item.amount) : '-') + '</td>' +
          '<td style="font-size:0.75rem;color:var(--text-muted);">' + (item.reason || '-') + '</td>' +
          '<td style="text-align:center;">' + authBadge + '</td>' +
        '</tr>';
      }).join('');
    })
    .catch(function() {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--danger);">هەڵە لە بارکردنی تۆمارەکانی ئاسایش</td></tr>';
    });
}

function updateHeaderSecurityBadge() {
  fetch('/api/security/summary')
    .then(function(r){ return r.json(); })
    .then(function(data) {
      var badge = $("#headerSecurityBadge");
      if (badge) {
        var total = (data.criticalCount || 0) + (data.noSaleCount || 0);
        if (total > 0) {
          badge.textContent = total;
          badge.style.display = "inline-block";
        } else {
          badge.style.display = "none";
        }
      }
    })
    .catch(function(){});
}

var DEMO_PRODUCT_IDS = {
  p_pepsi: 1, p_cola: 1, p_masafi: 1, p_rani: 1, p_redbull: 1, p_milk: 1, p_labneh: 1,
  p_almarai: 1, p_puck: 1, p_lays: 1, p_doritos: 1, p_nutella: 1, p_kitkat: 1, p_rice: 1,
  p_oil: 1, p_paste: 1, p_fairy: 1, p_tide: 1, p_shampoo: 1, p_samun: 1, p_apple: 1,
  p_banana: 1, p_meat: 1, p_tea: 1
};
var DEMO_CATEGORY_IDS = {
  cat_drinks: 1, cat_dairy: 1, cat_snacks: 1, cat_pantry: 1, cat_household: 1,
  cat_personal: 1, cat_bread: 1, cat_fruits: 1, cat_meat: 1, cat_coffee: 1
};
var DEMO_STRIP_SENT = {};

function stripDemoCatalogItems(list, demoMap, kind) {
  list = list || [];
  var kept = [];
  var removed = [];
  list.forEach(function (item) {
    if (item && item.id && demoMap[item.id]) removed.push(item);
    else kept.push(item);
  });
  if (!DEMO_STRIP_SENT[kind] && removed.length && typeof ApiClient !== "undefined") {
    DEMO_STRIP_SENT[kind] = true;
    removed.forEach(function (item) {
      try {
        if (kind === "product" && ApiClient.deleteProduct) ApiClient.deleteProduct(item.id).catch(function () {});
        if (kind === "category" && ApiClient.deleteCategory) ApiClient.deleteCategory(item.id).catch(function () {});
      } catch (e) {}
    });
  }
  return kept;
}

function bootstrapApp() {
  return DataStore.init().then(function () {
    var extras = DataStore.loadIntoApp(DB);
    if (!DB.settings) DB.settings = { marketName: "" };
    try {
      if (window.isPosDemoMode && window.isPosDemoMode()) {
        if (window.PosDemo && typeof PosDemo.seedIfEmpty === "function") PosDemo.seedIfEmpty();
      } else {
        DB.products = stripDemoCatalogItems(DB.products, DEMO_PRODUCT_IDS, "product");
        DB.categories = stripDemoCatalogItems(DB.categories, DEMO_CATEGORY_IDS, "category");
        try { repairOrphanProductCategories(); } catch (eRepairCats) {}
        if (typeof AuthService !== "undefined" && AuthService.purgeFactoryUsersFromSqlite) {
          AuthService.purgeFactoryUsersFromSqlite();
          if (AuthService.syncUsersCache) DB.users = AuthService.syncUsersCache();
        }
        if (typeof DataStore !== "undefined") {
          if (DataStore.saveProducts) DataStore.saveProducts();
          if (DataStore.saveCategories) DataStore.saveCategories();
        }
      }
    } catch (eStripDemo) {}
    try { normalizeStoredProductBarcodes(); } catch (eNormBc) {}
    try { migrateOrderBillNumbers(); } catch (eBillNo) {}
    clearFactoryBrandIfNeeded();
    updateMarketBrandUI();
    try { if (typeof BranchManager !== "undefined" && BranchManager.init) BranchManager.init(); } catch (e) {}
    RETURN_SALES = extras.returnSales || [];
    STOCK_TRANSACTIONS = extras.stockTransactions || [];
    PERMISSIONS = extras.permissions || {};
    LOGIN_LOGS = extras.loginLogs || [];
    ACTIVITY_LOGS = extras.activityLogs || [];
    CHANGE_TRACKER = extras.changeTracker || [];
    DELETED_RECORDS = extras.deletedRecords || [];
    OFFLINE_QUEUE = extras.offlineQueue || [];
    PRICE_HISTORY = extras.priceHistory || [];
    IMAGE_CACHE_MEMORY = extras.imageCache || {};
    try {
  initPermissions();
      loadTheme();
    } catch (e) { console.error("bootstrap seed", e); }
  setupEvents();
  setupBarcodeDeviceListener();
  setupKeyboardShortcuts();
  setupOfflineSync();
    warmImageCache(true);
    initNewPOSUI();

    if (typeof PriceTools !== "undefined" && typeof PriceTools.startWatcher === "function") {
      PriceTools.startWatcher();
    }

    if (typeof ApiClient !== "undefined" && (window.isPosDemoMode && window.isPosDemoMode())) {
      ApiClient.init();
    } else if (typeof ApiClient !== "undefined") {
      var syncAllFromServer = function (isBackground) {
        if (!ApiClient.isOnline()) return;
        ApiClient.fetchCategories().then(function (cats) {
          if (!Array.isArray(cats)) return;
          cats = stripDemoCatalogItems(cats, DEMO_CATEGORY_IDS, "category");
          if (cats.length) {
            var catIds = {};
            cats.forEach(function (c) { if (c && c.id) catIds[c.id] = true; });
            var localCats = (DB.categories || []).filter(function (c) { return c && c.id && !catIds[c.id]; });
            DB.categories = cats.concat(localCats);
          }
          DataStore.saveCategories();
          try { repairOrphanProductCategories(); } catch (eRepairSync) {}
          if (!isBackground) {
            if (typeof renderPosCategoryTabs === "function") renderPosCategoryTabs();
            if (typeof refreshProductCategorySelects === "function") refreshProductCategorySelects();
          }
        }).catch(function () {});

        ApiClient.fetchProducts().then(function (prods) {
          if (!Array.isArray(prods)) return;
          prods = stripDemoCatalogItems(prods, DEMO_PRODUCT_IDS, "product");
          var merged = mergeCatalogProducts(prods, DB.products || []);
          merged = stripDemoCatalogItems(merged, DEMO_PRODUCT_IDS, "product");
          if (merged.length || (DB.products && DB.products.length)) {
            DB.products = merged;
            DataStore.saveProducts();
          }
          if (!isBackground) {
            if (typeof renderProductGrid === "function") renderProductGrid(POS_GRID_CATEGORY);
            if (typeof renderProducts === "function") renderProducts();
          }
        }).catch(function () {});

        if (typeof ApiClient.fetchOrders === "function") {
          ApiClient.fetchOrders(500).then(function (ords) {
            if (Array.isArray(ords) && ords.length > 0) {
              DB.orders = ords;
              DataStore.saveOrders();
            }
          }).catch(function () {});
        }

        if (typeof ApiClient.fetchDebts === "function") {
          ApiClient.fetchDebts().then(function (debts) {
            if (Array.isArray(debts) && debts.length > 0) {
              DB.debts = dedupeDebtsList(debts);
              DataStore.saveDebts();
              try { if (window.CURRENT_PAGE === "customers" || window.CURRENT_PAGE === "debt") renderDebtPage(); } catch (eRd) {}
            }
          }).catch(function () {});
        }

        ApiClient.fetchCustomers().then(function (custs) {
          if (Array.isArray(custs) && custs.length > 0) {
            DB.customers = dedupeCustomersList(custs);
            DataStore.saveCustomers();
            try { if (window.CURRENT_PAGE === "customers") renderCustomers(); } catch (eRc) {}
          }
        }).catch(function () {});

        ApiClient.fetchSuppliers().then(function (sups) {
          if (Array.isArray(sups) && sups.length > 0) {
            DB.suppliers = sups;
            DataStore.saveSuppliers();
          }
        }).catch(function () {});

        ApiClient.fetchExpenses().then(function (exps) {
          if (Array.isArray(exps) && exps.length > 0) {
            DB.expenses = exps;
            DataStore.saveExpenses();
          }
        }).catch(function () {});

        if (typeof ApiClient.fetchPurchases === "function") {
          ApiClient.fetchPurchases().then(function (purs) {
            if (Array.isArray(purs) && purs.length > 0) {
              DB.purchases = purs;
              DataStore.savePurchases();
            }
          }).catch(function () {});
        }
      };

      ApiClient.init().then(function (online) {
        if (online) syncAllFromServer(false);
      });
      setTimeout(function () {
        if (typeof ApiClient !== "undefined" && ApiClient.isOnline && ApiClient.isOnline()) syncAllFromServer(false);
      }, 800);
      setInterval(function () {
        if (document.body.classList.contains("pos-page")) return;
        syncAllFromServer(true);
      }, 30000);
    }
    try {
      if (typeof SupermarketEngine !== "undefined") {
        SupermarketEngine.initKeyboardHotkeys();
      }
    } catch (eHotkeys) { console.error("hotkeys", eHotkeys); }
    try {
      if (typeof ShiftsManager !== "undefined") {
        ShiftsManager.init();
      }
    } catch (eShifts) { console.error("shifts init", eShifts); }
    try { loadCurrentShift(); } catch (eShiftLoad) {}
    try { renderStockAlerts(); } catch (eStock) {}
    try {
      updateClock();
      setInterval(updateClock, 1000);
    } catch (eClock) {}

    try {
      updateHeaderExpiryBadge();
      updateHeaderSecurityBadge();
      if (!(window.isPosDemoMode && window.isPosDemoMode())) {
        setInterval(pollOwnerBroadcasts, 12000);
      }
      setInterval(updateHeaderExpiryBadge, 30000);
      setInterval(updateHeaderSecurityBadge, 25000);
    } catch (eBadges) {}

    try { SqliteDB.setSetting("app_version", APP_VERSION); } catch (eVer) {}
    APP_READY = true;
    var signInBtn = $("#signInBtn");
    if (signInBtn) {
      signInBtn.disabled = false;
      signInBtn.removeAttribute("disabled");
    }
    try {
      if (window.I18n) {
        var storedLang = "";
        try { storedLang = localStorage.getItem("pos_lang") || ""; } catch (eBootLang) {}
        var bootLang = (storedLang === "ar" || storedLang === "en" || storedLang === "ku")
          ? storedLang
          : ((DB.settings && DB.settings.language) || I18n.current());
        I18n.set(bootLang, { persist: true, toast: false });
        if (typeof I18n.observe === "function") I18n.observe();
      }
    } catch (eI18n) { console.error("boot i18n", eI18n); }

    // Only enter app if user has an existing active session; otherwise stay on Login Screen!
    try {
      var activeSession = AuthService.getSession();
      if (activeSession) {
        enterApp();
      } else {
        var loginPage = $("#loginPage");
        if (loginPage) loginPage.classList.add("active");
        var appPage = $("#appPage");
        if (appPage) appPage.classList.remove("active");
        switchLoginTab("signin");
        if (typeof SwitchCashier !== "undefined" && typeof SwitchCashier.loadCashiers === "function") {
          SwitchCashier.loadCashiers();
        }
      }
    } catch (eSession) { console.error("boot session", eSession); }

    try { if (typeof FeatureModules !== "undefined") FeatureModules.applyModules(); } catch (eFeat) {}
    try { if (window.CashierButtons) CashierButtons.apply(); } catch (eCash) {}
    try {
      var autoBackupMinutes = (DB.settings && DB.settings.autoBackup) ? parseInt(DB.settings.autoBackup, 10) : 60;
      if (autoBackupMinutes > 0) {
        setInterval(autoBackup, autoBackupMinutes * 60 * 1000);
      }
    } catch (eBackup) {}
  }).catch(function (err) {
    console.error("Bootstrap failed:", err);
    try {
      if (typeof AuthService !== "undefined" && AuthService.getSession && AuthService.getSession()) {
        enterApp();
      }
    } catch (eSessFail) {}
  }).then(function () {
    APP_READY = true;
    var signInBtnReady = $("#signInBtn");
    if (signInBtnReady) {
      signInBtnReady.disabled = false;
      signInBtnReady.removeAttribute("disabled");
    }
    try { enhancePasswordFields(); } catch (eEye) {}
    try {
      if (typeof AuthService !== "undefined" && AuthService.getSession && AuthService.getSession()) {
        enterApp();
      }
    } catch (eSessReady) {}
  });
}

var POS_PAPER_CLOCK = null;
var POS_PAPER_BLOB = null;
var POS_PAPER_URL = null;

function getPosPaperBrand() {
  var s = (typeof DB !== "undefined" && DB.settings) ? DB.settings : {};
  return {
    name: (typeof getStoreName === "function") ? getStoreName() : (s.marketName || "مارکێت"),
    logo: s.marketLogo || "",
    phone: s.phone || s.marketPhone || "",
    address: s.address || "",
    tagline: s.marketTagline || "کاغەزی داواکاری"
  };
}

function formatPosPaperClock(now) {
  now = now || new Date();
  var days = ["یەکشەممە", "دووشەممە", "سێشەممە", "چوارشەممە", "پێنجشەممە", "هەینی", "شەممە"];
  var d = String(now.getDate()).padStart(2, "0");
  var mo = String(now.getMonth() + 1).padStart(2, "0");
  var y = now.getFullYear();
  var hours = now.getHours();
  var ampm = hours >= 12 ? "PM" : "AM";
  var h = hours % 12;
  if (h === 0) h = 12;
  var time = String(h).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") + ":" + String(now.getSeconds()).padStart(2, "0") + " " + ampm;
  return { date: days[now.getDay()] + "  " + d + "/" + mo + "/" + y, time: time, stamp: now.toISOString() };
}

function refreshPosOrderPaperHeader() {
  var brand = getPosPaperBrand();
  var clock = formatPosPaperClock();
  var nameEl = document.getElementById("posPaperStoreName");
  var tagEl = document.getElementById("posPaperTagline");
  var metaEl = document.getElementById("posPaperMeta");
  var dateEl = document.getElementById("posPaperDate");
  var timeEl = document.getElementById("posPaperTime");
  var logo = document.getElementById("posPaperLogo");
  var wrap = document.getElementById("posPaperLogoWrap");
  if (nameEl) nameEl.textContent = brand.name || "مارکێت";
  if (tagEl) tagEl.textContent = brand.tagline || "کاغەزی داواکاری";
  if (metaEl) metaEl.textContent = [brand.address, brand.phone].filter(Boolean).join(" · ");
  if (dateEl) dateEl.textContent = clock.date;
  if (timeEl) timeEl.textContent = clock.time;
  if (logo && wrap) {
    if (brand.logo) {
      logo.src = brand.logo;
      wrap.classList.add("has-img");
    } else {
      logo.removeAttribute("src");
      wrap.classList.remove("has-img");
    }
  }
}

function openPosOrderPaper() {
  refreshPosOrderPaperHeader();
  if (POS_PAPER_CLOCK) clearInterval(POS_PAPER_CLOCK);
  POS_PAPER_CLOCK = setInterval(refreshPosOrderPaperHeader, 1000);
  if (typeof showModal === "function") showModal("posOrderPaperModal");
  else {
    var m = document.getElementById("posOrderPaperModal");
    if (m) m.classList.add("active");
  }
  setTimeout(function () {
    var ta = document.getElementById("posPaperText");
    if (ta) ta.focus();
  }, 80);
}

function closePosOrderPaper() {
  if (POS_PAPER_CLOCK) {
    clearInterval(POS_PAPER_CLOCK);
    POS_PAPER_CLOCK = null;
  }
  if (typeof hideModal === "function") hideModal("posOrderPaperModal");
  else {
    var m = document.getElementById("posOrderPaperModal");
    if (m) m.classList.remove("active");
  }
}

function readPosPaperLines() {
  var raw = document.getElementById("posPaperText");
  return String(raw ? raw.value : "")
    .split(/\r?\n/)
    .map(function (l) { return l.trim(); })
    .filter(Boolean);
}

function wrapPosPaperCanvasText(ctx, text, maxW) {
  var words = String(text || "").split(/\s+/);
  var lines = [];
  var cur = "";
  words.forEach(function (w) {
    var test = cur ? (cur + " " + w) : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  });
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function loadPosPaperLogo(src, done) {
  if (!src) {
    done(null);
    return;
  }
  var img = new Image();
  img.onload = function () { done(img); };
  img.onerror = function () { done(null); };
  img.src = src;
}

function drawPosOrderPaperCanvas(logoImg) {
  var brand = getPosPaperBrand();
  var clock = formatPosPaperClock();
  var items = readPosPaperLines();
  var W = 760;
  var pad = 36;
  var measure = document.createElement("canvas").getContext("2d");
  measure.font = "700 22px Tahoma, 'Segoe UI', Arial, sans-serif";
  var nameWidth = W - pad * 2 - 40;
  var itemHeights = items.map(function (line) {
    return Math.max(1, wrapPosPaperCanvasText(measure, line, nameWidth).length) * 30 + 8;
  });
  if (!itemHeights.length) itemHeights = [40];
  var itemsH = itemHeights.reduce(function (s, h) { return s + h; }, 0);
  var headerH = 150;
  var H = headerH + 70 + itemsH + 90;
  var canvas = document.createElement("canvas");
  var scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  var ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.textBaseline = "top";
  ctx.direction = "rtl";

  ctx.fillStyle = "#fffaf0";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#c9a227";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(16, 16, W - 32, H - 32);

  ctx.fillStyle = "#0b1220";
  ctx.fillRect(16, 16, W - 32, headerH);
  ctx.fillStyle = "#eab308";
  ctx.fillRect(16, 16, W - 32, 6);

  var meta = [brand.address, brand.phone].filter(Boolean).join("  ·  ");
  if (logoImg) {
    var logoSize = 88;
    var lx = W - 34 - logoSize;
    ctx.fillStyle = "#111827";
    ctx.fillRect(lx - 4, 28, logoSize + 8, logoSize + 8);
    ctx.drawImage(logoImg, lx, 32, logoSize, logoSize);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fde68a";
    ctx.font = "900 30px Tahoma, 'Segoe UI', Arial, sans-serif";
    ctx.fillText(brand.name, lx - 14, 40);
    ctx.fillStyle = "#fff7d6";
    ctx.font = "800 16px Tahoma, 'Segoe UI', Arial, sans-serif";
    ctx.fillText("کاغەزی داواکاری", lx - 14, 80);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 13px Tahoma, 'Segoe UI', Arial, sans-serif";
    ctx.fillText(clock.date + "  ·  " + clock.time, lx - 14, 108);
    if (meta) ctx.fillText(meta, lx - 14, 128);
  } else {
    ctx.textAlign = "center";
    ctx.fillStyle = "#fde68a";
    ctx.font = "900 32px Tahoma, 'Segoe UI', Arial, sans-serif";
    ctx.fillText(brand.name, W / 2, 40);
    ctx.fillStyle = "#fff7d6";
    ctx.font = "800 17px Tahoma, 'Segoe UI', Arial, sans-serif";
    ctx.fillText("کاغەزی داواکاری", W / 2, 80);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 14px Tahoma, 'Segoe UI', Arial, sans-serif";
    ctx.fillText(clock.date + "  ·  " + clock.time, W / 2, 108);
    if (meta) ctx.fillText(meta, W / 2, 128);
  }

  var y = headerH + 36;
  ctx.textAlign = "right";
  if (!items.length) {
    ctx.fillStyle = "#78716c";
    ctx.font = "700 18px Tahoma, 'Segoe UI', Arial, sans-serif";
    ctx.fillText("هێشتا داواکاری نەنووسراوە", W - pad, y);
  } else {
    items.forEach(function (line, i) {
      ctx.fillStyle = "#1c1917";
      ctx.font = "800 15px Tahoma, 'Segoe UI', Arial, sans-serif";
      ctx.fillText((i + 1) + ".", W - pad, y);
      ctx.font = "700 20px Tahoma, 'Segoe UI', Arial, sans-serif";
      var wrapped = wrapPosPaperCanvasText(ctx, line, nameWidth - 36);
      wrapped.forEach(function (wl, wi) {
        ctx.fillText(wl, W - pad - 36, y + wi * 30);
      });
      y += wrapped.length * 30 + 8;
    });
  }
  ctx.fillStyle = "#a16207";
  ctx.font = "700 13px Tahoma, 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(brand.name + " — سوپاس", W / 2, H - 42);
  return canvas;
}

function persistPosPaperOrder(text, phone) {
  var rec = {
    id: "pp_" + Date.now(),
    text: text,
    phone: phone || "",
    store: getPosPaperBrand().name,
    savedAt: new Date().toISOString()
  };
  var all = [];
  try { all = JSON.parse(localStorage.getItem("sm_pos_paper_orders") || "[]"); } catch (e) { all = []; }
  if (!Array.isArray(all)) all = [];
  all.unshift(rec);
  all = all.slice(0, 40);
  try { localStorage.setItem("sm_pos_paper_orders", JSON.stringify(all)); } catch (e2) {}
  try {
    if (typeof SqliteDB !== "undefined" && SqliteDB.setSetting) SqliteDB.setSetting("pos_paper_orders", all);
  } catch (e3) {}
}

function withPosPaperCanvas(done) {
  loadPosPaperLogo(getPosPaperBrand().logo, function (logo) {
    var canvas = drawPosOrderPaperCanvas(logo);
    done(canvas);
  });
}

function rememberPosPaperBlob(blob, dataUrl) {
  POS_PAPER_BLOB = blob;
  if (POS_PAPER_URL) {
    try { URL.revokeObjectURL(POS_PAPER_URL); } catch (e) {}
  }
  POS_PAPER_URL = dataUrl || (blob ? URL.createObjectURL(blob) : "");
}

function savePosOrderPaper() {
  var lines = readPosPaperLines();
  if (!lines.length) {
    toast("ئاگاداری", "سەرەتا داواکاری بنووسە", "warning");
    var ta = document.getElementById("posPaperText");
    if (ta) ta.focus();
    return;
  }
  persistPosPaperOrder(lines.join("\n"), "");
  toast("چاوەڕوان بە", "کاغەزەکە ئامادە دەکرێت بۆ پاشەکەوت...", "info");
  withPosPaperCanvas(function (canvas) {
    function finish(blob, dataUrl) {
      rememberPosPaperBlob(blob, dataUrl);
      var a = document.createElement("a");
      a.href = dataUrl || POS_PAPER_URL;
      a.download = "kaghaz-dawakari-" + new Date().toISOString().slice(0, 10) + ".png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast("سەرکەوتوو", "کاغەزەکە لەسەر کۆمپیوتەر پاشەکەوت کرا", "success");
    }
    if (canvas.toBlob) {
      canvas.toBlob(function (blob) {
        finish(blob, canvas.toDataURL("image/png"));
      }, "image/png");
    } else {
      finish(null, canvas.toDataURL("image/png"));
    }
  });
}

function blobFromPosPaperDataUrl(dataUrl) {
  try {
    var parts = String(dataUrl || "").split(",");
    var bin = atob(parts[1] || "");
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: "image/png" });
  } catch (e) {
    return null;
  }
}

function sendPosOrderPaperWhatsApp() {
  var lines = readPosPaperLines();
  if (!lines.length) {
    toast("ئاگاداری", "سەرەتا داواکاری بنووسە", "warning");
    var ta = document.getElementById("posPaperText");
    if (ta) ta.focus();
    return;
  }
  persistPosPaperOrder(lines.join("\n"), "");
  toast("چاوەڕوان بە", "وێنەی کاغەز ئامادە دەکرێت...", "info");
  withPosPaperCanvas(function (canvas) {
    var dataUrl = canvas.toDataURL("image/png");
    function sendImage(blob) {
      if (!blob) blob = blobFromPosPaperDataUrl(dataUrl);
      rememberPosPaperBlob(blob, dataUrl);
      if (!blob) {
        toast("هەڵە", "وێنەی کاغەز دروست نەبوو", "error");
        return;
      }
      copyImageBlobToClipboard(blob, function () {
        var url = "https://wa.me/";
        try {
          if (window.POS_DESKTOP && typeof POS_DESKTOP.openExternal === "function") {
            POS_DESKTOP.openExternal(url);
          } else {
            window.open(url, "_blank");
          }
          toast("واتسئاپ", "وێنەی کاغەز کۆپی کرا — کەس هەڵبژێرە و Ctrl+V بکە", "success");
        } catch (err) {
          toast("ئاگاداری", "وێنەکە کۆپی کرا. واتسئاپ بکەرەوە و Ctrl+V بکە", "warning");
        }
      });
    }
    if (canvas.toBlob) canvas.toBlob(sendImage, "image/png");
    else sendImage(null);
  });
}

window.openPosOrderPaper = openPosOrderPaper;
window.closePosOrderPaper = closePosOrderPaper;
window.savePosOrderPaper = savePosOrderPaper;
window.sendPosOrderPaperWhatsApp = sendPosOrderPaperWhatsApp;

// Global window helpers for seamless POS/Shifts navigation and actions
window.openCustomerModal = openCustomerModal;
window.openNewCustomerModal = function () { openCustomerModal(); };
window.openDebtLedgerModal = openDebtLedgerModal;
window.saveDebtLedger = saveDebtLedger;
window.deleteDebtLedger = deleteDebtLedger;
window.focusBarcodeSearch = function () {
  var el = $("#headerSearchInput");
  if (el) { el.focus(); el.select(); }
};
window.goToCashHandoverPage = function () {
  switchSection("shifts");
  if (typeof ShiftsManager !== "undefined") ShiftsManager.selectShiftTab("handover");
};

function persistLoginSessionNow() {
  if (window.__POS_DEMO_RESETTING) return;
  try {
    if (typeof AuthService !== "undefined" && AuthService.getSession) {
      var live = AuthService.getSession();
      if (live) {
        var sk = window.demoStorageKey ? window.demoStorageKey("market_pos_active_session") : "market_pos_active_session";
        var kk = window.demoStorageKey ? window.demoStorageKey("sm_pos_keep_login") : "sm_pos_keep_login";
        localStorage.setItem(sk, JSON.stringify(live));
        localStorage.setItem(kk, "1");
        document.documentElement.classList.add("has-saved-session");
      }
    }
  } catch (eSess) {}
  try { if (typeof SqliteDB !== "undefined" && SqliteDB.persistNow) SqliteDB.persistNow(); } catch (eDb) {}
}

document.addEventListener("DOMContentLoaded", function () {
  bootstrapApp();
});
window.addEventListener("beforeunload", persistLoginSessionNow);
window.addEventListener("pagehide", persistLoginSessionNow);
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") persistLoginSessionNow();
});
