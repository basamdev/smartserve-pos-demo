/* ══════════════════════════════════════════════════════════════════
   Sam Market POS — Price Tools
   1) OFFERS   : per-product promo price with start/end dates.
                 The regular price is never overwritten, so when the end date passes the product
                 automatically sells at its normal price again ("restore like before").
   2) BULK EDIT: change prices per category in one go (drinks +250, milk +1000 ...) with a preview
                 and a safe undo history. Useful when the dollar rate moves.
   ══════════════════════════════════════════════════════════════════ */

/* ───────── date + offer helpers (global: also used by app.js) ───────── */

function ptPad(n) { return n < 10 ? "0" + n : "" + n; }
function ptDateStr(d) { return d.getFullYear() + "-" + ptPad(d.getMonth() + 1) + "-" + ptPad(d.getDate()); }
function ptToday() { return ptDateStr(new Date()); }
function ptAddDays(dateStr, n) {
  var d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return ptDateStr(d);
}
function ptDiffDays(a, b) {
  return Math.round((new Date(a + "T00:00:00") - new Date(b + "T00:00:00")) / 86400000);
}
function ptEsc(s) {
  return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

/**
 * State of a product's offer on a given day (default: today, local time).
 * state: none | scheduled (starts later) | active | expired (end date passed)
 * The end date is inclusive: an offer ending on the 10th is still valid all day on the 10th.
 */
function getOfferInfo(p, todayStr) {
  var none = { state: "none", active: false, price: 0, start: "", end: "", daysLeft: null, discountPct: 0 };
  if (!p) return none;
  var price = parseFloat(p.offerPrice) || 0;
  if (price <= 0) return none;
  var start = p.offerStart ? String(p.offerStart).slice(0, 10) : "";
  var end = p.offerEnd ? String(p.offerEnd).slice(0, 10) : "";
  var today = todayStr || ptToday();
  var state = "active";
  if (start && today < start) state = "scheduled";
  else if (end && today > end) state = "expired";
  var base = parseFloat(p.price) || 0;
  return {
    state: state,
    active: state === "active",
    price: price,
    start: start,
    end: end,
    daysLeft: end ? ptDiffDays(end, today) : null,
    discountPct: base > 0 ? Math.round((1 - price / base) * 100) : 0
  };
}

function getActiveOfferPrice(p, todayStr) {
  var info = getOfferInfo(p, todayStr);
  return info.active ? info.price : 0;
}

/** Piece price before any offer: the normal price, or the expiry-clearance price when one is set. */
function getRegularPiecePrice(p) {
  var base = parseFloat(p.price) || 0;
  var cd = parseFloat(p.clearanceDiscount) || 0;
  if (cd <= 0) return base;
  var cp = parseFloat(p.clearancePrice) || 0;
  return cp > 0 ? cp : Math.round(base * (1 - cd / 100));
}

/** Price block shown on POS product tiles (regular / clearance / offer). */
function buildPriceHtml(p, align) {
  var justify = align === "center" ? "center" : "flex-start";
  var regular = getRegularPiecePrice(p);
  var offer = getOfferInfo(p);
  if (offer.active && offer.price < regular) {
    return '<div style="display:flex;align-items:center;justify-content:' + justify + ';gap:4px;flex-wrap:wrap;">' +
      '<del style="opacity:0.6;font-size:0.75rem;color:var(--text-muted);">' + fmt(p.price) + '</del> ' +
      '<strong style="color:#ef4444;font-size:0.95rem;">' + fmt(offer.price) + '</strong> ' +
      '<span style="background:#ef4444;color:#fff;font-size:0.6rem;padding:1px 4px;border-radius:3px;font-weight:800;">' +
      '<i class="fas fa-bolt"></i> ئۆفەر' + (offer.discountPct > 0 ? ' -%' + offer.discountPct : '') + '</span>' +
    '</div>';
  }
  var cd = parseFloat(p.clearanceDiscount) || 0;
  if (cd > 0) {
    return '<div style="display:flex;align-items:center;justify-content:' + justify + ';gap:4px;flex-wrap:wrap;">' +
      '<del style="opacity:0.6;font-size:0.75rem;color:var(--text-muted);">' + fmt(p.price) + '</del> ' +
      '<strong style="color:#ef4444;font-size:0.95rem;">' + fmt(regular) + '</strong> ' +
      '<span style="background:#ef4444;color:#fff;font-size:0.6rem;padding:1px 4px;border-radius:3px;font-weight:800;">-%' + cd + ' پاکتاو</span>' +
    '</div>';
  }
  return fmt(p.price);
}

/** Small status line for product cards on the management page. */
function buildOfferBadgeHtml(p) {
  var o = getOfferInfo(p);
  if (o.state === "none") return "";
  var base = 'font-size:0.72rem;margin-top:3px;font-weight:700;display:flex;align-items:center;gap:5px;flex-wrap:wrap;';
  if (o.state === "active") {
    var left = o.daysLeft === null ? "" : (o.daysLeft === 0 ? " — ئەمڕۆ کۆتایی دێت" : " — ماوە " + o.daysLeft + " ڕۆژ");
    return '<div style="' + base + 'color:#f87171;"><i class="fas fa-bolt"></i> ئۆفەر: ' + fmt(o.price) +
      (o.discountPct > 0 ? ' (-%' + o.discountPct + ')' : '') + left + '</div>';
  }
  if (o.state === "scheduled") {
    return '<div style="' + base + 'color:#38bdf8;"><i class="fas fa-hourglass-start"></i> ئۆفەر دەست پێدەکات: ' + ptEsc(o.start) + ' (' + fmt(o.price) + ')</div>';
  }
  return '<div style="' + base + 'color:var(--text-muted);"><i class="fas fa-history"></i> ئۆفەر تەواو بوو (' + ptEsc(o.end) + ') — نرخ گەڕاوەتەوە</div>';
}

/* ───────── PriceTools module ───────── */

var PriceTools = (function () {
  var STEP = 250;           // smallest practical dinar note step
  var watchTimer = null;
  var lastStates = null;
  var bpMode = "amount";
  var omFilter = "active";
  var bpTargetTab = "products";
  var bpSelectedProducts = new Set();
  var bpSpecificMode = "amount";
  var omTargetTab = "products";
  var omSelectedProducts = new Set();
  var omProdType = "percent";

  function el(id) { return document.getElementById(id); }
  function val(id) { var e = el(id); return e ? e.value : ""; }

  function apiBase() {
    return (typeof ApiClient !== "undefined" && ApiClient.getBaseUrl) ? ApiClient.getBaseUrl() : "";
  }
  function serverOnline() {
    return typeof ApiClient !== "undefined" && ApiClient.isOnline && ApiClient.isOnline();
  }
  function operatorName() {
    var u = (typeof DB !== "undefined") ? DB.currentUser : null;
    return (u && (u.fullName || u.name || u.username)) || "بەڕێوەبەر";
  }
  function note(title, msg, type) { if (typeof toast === "function") toast(title, msg, type); }

  function allowed() {
    if (typeof hasPermission === "function" && typeof DB !== "undefined" && DB.currentUser && !hasPermission("products")) {
      note("ڕێگەپێنەدراو", "تۆ مۆڵەتی گۆڕینی نرخ و ئۆفەرت نییە", "error");
      return false;
    }
    return true;
  }

  function signed(n) { return (n > 0 ? "+" : "") + Number(n).toLocaleString("en-US"); }

  function postJson(path, body) {
    return fetch(apiBase() + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); });
  }

  function refreshViews() {
    try { if (typeof DataStore !== "undefined") DataStore.saveProducts(); } catch (e) {}
    try { if (typeof renderProductGrid === "function") renderProductGrid(typeof POS_GRID_CATEGORY !== "undefined" ? POS_GRID_CATEGORY : "all"); } catch (e) {}
    try { if (typeof renderPosGrid === "function" && el("posGrid")) renderPosGrid(); } catch (e) {}
    try {
      var sec = el("productsSection");
      if (sec && el("productsGrid")) {
        if (typeof filterProducts === "function") filterProducts(); else if (typeof renderProducts === "function") renderProducts();
      }
    } catch (e) {}
    try { if (typeof renderCart === "function") renderCart(); } catch (e) {}
  }

  function reloadProductsFromServer() {
    if (typeof ApiClient === "undefined" || !ApiClient.fetchProducts) return Promise.resolve();
    return ApiClient.fetchProducts().then(function (prods) {
      if (prods && prods.length) { DB.products = prods; }
      refreshViews();
    });
  }

  function injectStyles() {
    if (el("ptStyles")) return;
    var s = document.createElement("style");
    s.id = "ptStyles";
    s.textContent =
      ".pt-note{background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.3);border-radius:10px;padding:10px 12px;font-size:0.82rem;color:#bae6fd;line-height:1.7;margin-bottom:12px;}" +
      ".pt-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;}" +
      ".pt-chip{padding:5px 12px;border-radius:20px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-secondary);cursor:pointer;font-size:0.8rem;font-weight:700;}" +
      ".pt-chip.active{background:var(--accent,#6366f1);border-color:var(--accent,#6366f1);color:#fff;}" +
      ".pt-quick{padding:2px 8px;font-size:0.72rem;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-secondary);cursor:pointer;font-weight:700;margin-left:3px;}" +
      ".pt-quick:hover{border-color:var(--accent,#6366f1);color:#fff;}" +
      ".pt-input{height:34px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary,#fff);padding:0 8px;font-weight:700;box-sizing:border-box;}" +
      ".pt-box{background:rgba(255,255,255,0.03);border:1px solid var(--border-color);border-radius:12px;padding:12px 14px;margin-top:14px;}" +
      ".pt-box h4{margin:0 0 8px;font-size:0.9rem;display:flex;align-items:center;gap:6px;}" +
      ".pt-opts{display:flex;flex-wrap:wrap;gap:14px;margin:10px 0;font-size:0.82rem;}" +
      ".pt-opts label{display:flex;align-items:center;gap:6px;cursor:pointer;}" +
      ".pt-table{width:100%;border-collapse:collapse;font-size:0.84rem;}" +
      ".pt-table th,.pt-table td{padding:7px 8px;border-bottom:1px solid var(--border-color);text-align:right;vertical-align:middle;}" +
      ".pt-table th{color:var(--text-muted);font-weight:700;font-size:0.76rem;}" +
      ".pt-prod-row{transition:background 0.15s ease;cursor:pointer;}" +
      ".pt-prod-row:hover{background:rgba(255,255,255,0.05);}" +
      ".pt-up{color:#f59e0b;font-weight:800;}.pt-ok{color:#10b981;font-weight:800;}.pt-bad{color:#ef4444;font-weight:800;}.pt-muted{color:var(--text-muted);}";
    document.head.appendChild(s);
  }

  function ensureModal(id, title, icon, width, bodyHtml, footerHtml, onClose) {
    var m = el(id);
    if (m) {
      var b = el(id + "Body");
      if (b) b.innerHTML = bodyHtml;
      var f = m.querySelector(".modal-footer");
      if (f && footerHtml) f.innerHTML = footerHtml;
      return m;
    }
    injectStyles();
    m = document.createElement("div");
    m.className = "modal-overlay";
    m.id = id;
    m.innerHTML =
      '<div class="modal" style="max-width:' + width + 'px;">' +
        '<div class="modal-header"><h2><i class="fas ' + icon + '" style="margin-left:8px;color:#10b981;"></i>' + title + '</h2>' +
        '<button type="button" class="modal-close" onclick="' + onClose + '">&times;</button></div>' +
        '<div class="modal-body" id="' + id + 'Body">' + bodyHtml + '</div>' +
        (footerHtml ? '<div class="modal-footer">' + footerHtml + '</div>' : '') +
      '</div>';
    document.body.appendChild(m);
    return m;
  }

  /* ═════════ PRODUCT FORM: offer fields ═════════ */

  function loadOfferFields(p) {
    var o = p ? getOfferInfo(p) : null;
    var hasOffer = p && (parseFloat(p.offerPrice) || 0) > 0;
    if (el("pOfferPrice")) el("pOfferPrice").value = hasOffer ? p.offerPrice : "";
    if (el("pOfferStart")) el("pOfferStart").value = hasOffer ? (o.start || "") : "";
    if (el("pOfferEnd")) el("pOfferEnd").value = hasOffer ? (o.end || "") : "";
    updateOfferBadge();
  }

  /** Validates + returns the offer fields of the product form. ok:false => error message. */
  function readOfferFields(regularPrice) {
    if (!el("pOfferPrice")) return { ok: true, untouched: true };
    var price = parseFloat(val("pOfferPrice")) || 0;
    if (price <= 0) return { ok: true, offerPrice: 0, offerStart: "", offerEnd: "" };
    var start = val("pOfferStart") || ptToday();
    var end = val("pOfferEnd");
    if (regularPrice > 0 && price >= regularPrice) {
      return { ok: false, error: "نرخی ئۆفەر دەبێت لە نرخی ئاسایی (" + Number(regularPrice).toLocaleString("en-US") + ") کەمتر بێت" };
    }
    if (!end) return { ok: false, error: "بەرواری کۆتایی ئۆفەر دیاری بکە — دوای ئەو بەروارە نرخ خۆکارانە دەگەڕێتەوە" };
    if (end < start) return { ok: false, error: "بەرواری کۆتایی ناکرێت پێش بەرواری دەستپێک بێت" };
    return { ok: true, offerPrice: price, offerStart: start, offerEnd: end };
  }

  function updateOfferBadge() {
    var badge = el("pOfferStateBadge");
    if (!badge) return;
    var price = parseFloat(val("pOfferPrice")) || 0;
    if (price <= 0) { badge.style.display = "none"; return; }
    var regular = parseFloat(val("pPrice")) || 0;
    var cost = parseFloat(val("pCost")) || 0;
    var info = getOfferInfo({ price: regular, offerPrice: price, offerStart: val("pOfferStart"), offerEnd: val("pOfferEnd") });
    var text = "";
    var color = "#f87171";
    if (info.state === "scheduled") { text = "دەست پێدەکات لە " + info.start; color = "#38bdf8"; }
    else if (info.state === "expired") { text = "ئەم ئۆفەرە بەسەرچووە"; color = "#94a3b8"; }
    else { text = "چالاکە" + (info.daysLeft !== null ? " — ماوە " + info.daysLeft + " ڕۆژ" : ""); }
    if (regular > 0 && price < regular) text += " | داشکاندن: %" + info.discountPct;
    if (regular > 0 && price >= regular) { text = "ئاگاداری: نرخی ئۆفەر دەبێت لە نرخی ئاسایی کەمتر بێت"; color = "#f59e0b"; }
    else if (cost > 0 && price < cost) { text += " | ⚠ لە نرخی کڕین کەمترە (زیان)"; color = "#f59e0b"; }
    badge.style.display = "inline-block";
    badge.style.color = color;
    badge.textContent = text;
  }

  function offerQuickDays(n) {
    var start = val("pOfferStart") || ptToday();
    if (el("pOfferStart")) el("pOfferStart").value = start;
    if (el("pOfferEnd")) el("pOfferEnd").value = ptAddDays(start, n);
    updateOfferBadge();
  }

  function clearOfferFields() {
    ["pOfferPrice", "pOfferStart", "pOfferEnd"].forEach(function (id) { if (el(id)) el(id).value = ""; });
    updateOfferBadge();
  }

  /* ═════════ OFFERS: live watcher (auto restore at midnight) ═════════ */

  function repriceCartsForOffers() {
    if (typeof CUSTOMER_QUEUE === "undefined" || typeof DB === "undefined") return 0;
    var changed = 0;
    Object.keys(CUSTOMER_QUEUE).forEach(function (k) {
      var cart = CUSTOMER_QUEUE[k] && CUSTOMER_QUEUE[k].cart;
      if (!cart) return;
      cart.forEach(function (item) {
        if (!item.offerApplied) return;
        var prod = DB.products.find(function (p) { return p.id === item.prodId; });
        if (!prod) return;
        var regular = getRegularPiecePrice(prod);
        var offerPrice = getActiveOfferPrice(prod);
        if (offerPrice > 0 && offerPrice < regular) return; // still on offer
        if (item.unitType === "carton") {
          item.price = prod.packPrice > 0 ? prod.packPrice : regular * (prod.packQty || 1);
        } else {
          item.price = regular;
        }
        item.offerApplied = false;
        changed++;
      });
    });
    return changed;
  }

  function currentStates() {
    var map = {};
    ((typeof DB !== "undefined" && DB.products) || []).forEach(function (p) {
      if ((parseFloat(p.offerPrice) || 0) > 0) map[p.id] = getOfferInfo(p).state;
    });
    return map;
  }

  function watchTick() {
    var now = currentStates();
    if (lastStates === null) { lastStates = now; return; }
    var changedIds = [];
    var expiredNames = [];
    Object.keys(now).forEach(function (id) {
      if (lastStates[id] !== now[id]) {
        changedIds.push(id);
        if (lastStates[id] === "active" && now[id] === "expired") {
          var prod = DB.products.find(function (p) { return p.id === id; });
          if (prod) expiredNames.push(prod.name);
        }
      }
    });
    Object.keys(lastStates).forEach(function (id) { if (!(id in now)) changedIds.push(id); });
    lastStates = now;
    if (!changedIds.length) return;
    repriceCartsForOffers();
    refreshViews();
    if (expiredNames.length) {
      note("ئۆفەر تەواو بوو", expiredNames.slice(0, 3).join("، ") + (expiredNames.length > 3 ? " و " + (expiredNames.length - 3) + " بەرهەمی تر" : "") + " — نرخ گەڕایەوە بۆ ئاسایی", "info");
    }
  }

  function startWatcher() {
    if (watchTimer) return;
    watchTimer = setInterval(watchTick, 30000);
    setTimeout(watchTick, 4000);
  }

  /* ═════════ OFFERS MANAGER ═════════ */

  function offerRows() {
    var rows = [];
    (DB.products || []).forEach(function (p) {
      var o = getOfferInfo(p);
      if (o.state !== "none") rows.push({ p: p, o: o });
    });
    var order = { active: 0, scheduled: 1, expired: 2 };
    rows.sort(function (a, b) {
      if (order[a.o.state] !== order[b.o.state]) return order[a.o.state] - order[b.o.state];
      return (a.o.end || "9999") < (b.o.end || "9999") ? -1 : 1;
    });
    return rows;
  }

  function openOffers() {
    if (!allowed()) return;
    ensureModal("offersManagerModal", "ئۆفەرەکان (Offers & Promotions)", "fa-bolt", 980,
      '<div class="pt-note"><i class="fas fa-info-circle"></i> نرخی ئۆفەر تەنها لە ماوەی دیاریکراودا کار دەکات. کاتێک بەرواری کۆتایی تێپەڕی، <strong>نرخی ئاسایی خۆکارانە دەگەڕێتەوە</strong> و پێویست بە دەستکاری ناکات.</div>' +
      '<div id="omCounters" class="pt-tabs"></div>' +
      '<div style="max-height:220px;overflow-y:auto;margin-bottom:14px;border:1px solid var(--border-color);border-radius:10px;"><table class="pt-table"><thead><tr><th>بەرهەم</th><th>نرخی ئاسایی</th><th>نرخی ئۆفەر</th><th>داشکاندن</th><th>لە</th><th>تا</th><th>دۆخ</th><th>کردار</th></tr></thead><tbody id="omTbody"></tbody></table></div>' +
      '<div class="pt-box" style="margin-top:0;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;border-bottom:1px solid var(--border-color);padding-bottom:8px;">' +
          '<h4 style="margin:0;font-size:0.92rem;"><i class="fas fa-plus-circle" style="color:#ec4899;"></i> زیادکردنی ئۆفەری نوێ</h4>' +
          '<div class="pt-tabs" style="margin-bottom:0;">' +
            '<button type="button" id="omTabBtn_prods" class="pt-chip active" onclick="PriceTools.omSetTargetTab(\'products\')"><i class="fas fa-check-square"></i> بەرهەمی دیاریکراو (Select Products)</button>' +
            '<button type="button" id="omTabBtn_cat" class="pt-chip" onclick="PriceTools.omSetTargetTab(\'category\')"><i class="fas fa-layer-group"></i> بەپێی پۆل (Whole Category)</button>' +
          '</div>' +
        '</div>' +

        '<!-- WRAP 1: SPECIFIC PRODUCTS -->' +
        '<div id="omSpecificWrap">' +
          '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;background:rgba(255,255,255,0.03);padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);margin-bottom:10px;">' +
            '<div><div class="pt-muted" style="font-size:0.74rem;">جۆری داشکاندن</div>' +
              '<select id="omProdType" class="pt-input" onchange="PriceTools.omSetProdType(this.value)">' +
                '<option value="percent">ڕێژەی داشکاندن (%)</option>' +
                '<option value="amount">کەمکردنەوەی دینار (-د.ع)</option>' +
                '<option value="fixed">نرخی ئۆفەری جێگیر</option>' +
              '</select>' +
            '</div>' +
            '<div><div class="pt-muted" style="font-size:0.74rem;" id="omProdValLabel">ڕێژەی داشکاندن (%)</div>' +
              '<input type="number" id="omProdValue" class="pt-input" placeholder="15" style="width:105px;" oninput="PriceTools.omRenderSpecificProds()">' +
            '</div>' +
            '<div style="display:flex;gap:4px;align-self:flex-end;" id="omProdQuickChips">' +
              '<button type="button" class="pt-quick" onclick="PriceTools.omSetProdQuick(10)">-%10</button>' +
              '<button type="button" class="pt-quick" onclick="PriceTools.omSetProdQuick(15)">-%15</button>' +
              '<button type="button" class="pt-quick" onclick="PriceTools.omSetProdQuick(20)">-%20</button>' +
              '<button type="button" class="pt-quick" onclick="PriceTools.omSetProdQuick(25)">-%25</button>' +
              '<button type="button" class="pt-quick" onclick="PriceTools.omSetProdQuick(500)">-500</button>' +
              '<button type="button" class="pt-quick" onclick="PriceTools.omSetProdQuick(1000)">-1000</button>' +
            '</div>' +
            '<div><div class="pt-muted" style="font-size:0.74rem;">لە بەرواری</div><input type="date" id="omProdStart" class="pt-input" onchange="PriceTools.omRenderSpecificProds()"></div>' +
            '<div><div class="pt-muted" style="font-size:0.74rem;">تا بەرواری (کۆتایی)</div><input type="date" id="omProdEnd" class="pt-input" onchange="PriceTools.omRenderSpecificProds()"></div>' +
            '<div style="display:flex;gap:4px;align-self:flex-end;">' +
              '<button type="button" class="pt-quick" onclick="PriceTools.omQuickDaysProd(3)">+٣ ڕۆژ</button>' +
              '<button type="button" class="pt-quick" onclick="PriceTools.omQuickDaysProd(7)">+٧ ڕۆژ</button>' +
              '<button type="button" class="pt-quick" onclick="PriceTools.omQuickDaysProd(15)">+١٥ ڕۆژ</button>' +
              '<button type="button" class="pt-quick" onclick="PriceTools.omQuickDaysProd(30)">+٣٠ ڕۆژ</button>' +
            '</div>' +
            '<div class="pt-opts" style="margin:0 4px 6px 0;"><label><input type="checkbox" id="omProdRound" checked onchange="PriceTools.omRenderSpecificProds()"> نزیکترین ٢٥٠ دینار</label></div>' +
            '<button type="button" class="btn btn-primary btn-sm" onclick="PriceTools.omApplySpecific()" style="background:linear-gradient(135deg, #ec4899, #db2777);border:none;font-weight:800;padding:8px 18px;">' +
              '<i class="fas fa-bolt"></i> دانانی ئۆفەر بۆ هەڵبژێردراوەکان' +
            '</button>' +
          '</div>' +
          '<div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">' +
            '<div style="flex:1;min-width:200px;position:relative;">' +
              '<input type="text" id="omProdSearch" class="pt-input" placeholder="گەڕان بە ناو یان باڕکۆدی بەرهەم..." style="width:100%;padding-right:28px;" oninput="PriceTools.omRenderSpecificProds()">' +
              '<i class="fas fa-search" style="position:absolute;right:9px;top:10px;color:var(--text-muted);font-size:0.8rem;"></i>' +
            '</div>' +
            '<select id="omProdCat" class="pt-input" style="min-width:140px;" onchange="PriceTools.omRenderSpecificProds()"><option value="all">هەموو پۆلەکان</option></select>' +
            '<div id="omSelectedCountBadge" style="font-size:0.82rem;color:#ec4899;font-weight:800;">٠ بەرهەم هەڵبژێردراوە</div>' +
          '</div>' +
          '<div style="max-height:200px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px;">' +
            '<table class="pt-table"><thead><tr><th style="width:36px;text-align:center;"><input type="checkbox" id="omMasterChk" onchange="PriceTools.omToggleSelectAllProds(this.checked)"></th><th>بەرهەم</th><th>پۆل</th><th>نرخی ئاسایی</th><th>نرخی نوێی ئۆفەر</th><th>ئۆفەری ئێستا</th></tr></thead><tbody id="omProdTbody"></tbody></table>' +
          '</div>' +
          '<div id="omSpecificPreview" class="pt-muted" style="font-size:0.8rem;margin-top:6px;"></div>' +
        '</div>' +

        '<!-- WRAP 2: WHOLE CATEGORY -->' +
        '<div id="omCategoryWrap" style="display:none;">' +
          '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;">' +
            '<div><div class="pt-muted" style="font-size:0.74rem;">پۆل</div><select id="omCat" class="pt-input" style="min-width:150px;" onchange="PriceTools.omPreview()"></select></div>' +
            '<div><div class="pt-muted" style="font-size:0.74rem;">جۆری داشکاندن</div><select id="omType" class="pt-input" onchange="PriceTools.omPreview()"><option value="amount">کەمکردنەوەی دینار</option><option value="percent">ڕێژەی %</option></select></div>' +
            '<div><div class="pt-muted" style="font-size:0.74rem;">بڕ</div><input type="number" id="omValue" class="pt-input" min="0" step="250" style="width:100px;" oninput="PriceTools.omPreview()"></div>' +
            '<div><div class="pt-muted" style="font-size:0.74rem;">لە بەرواری</div><input type="date" id="omStart" class="pt-input" onchange="PriceTools.omPreview()"></div>' +
            '<div><div class="pt-muted" style="font-size:0.74rem;">تا بەرواری (کۆتایی)</div><input type="date" id="omEnd" class="pt-input" onchange="PriceTools.omPreview()"></div>' +
            '<button type="button" class="btn btn-primary btn-sm" onclick="PriceTools.omApplyCategory()"><i class="fas fa-bolt"></i> دانانی ئۆفەر بۆ پۆلەکە</button>' +
          '</div>' +
          '<div class="pt-opts"><label><input type="checkbox" id="omRound" checked> نرخی ئۆفەر بکە بە نزیکترین ' + STEP + ' دینار</label>' +
          '<label><input type="checkbox" id="omOverwrite"> ئۆفەرە هەبووەکان بگۆڕە (ئەگەر دەستکاری نەکرێت تێدەپەڕێنرێن)</label></div>' +
          '<div id="omPreview" class="pt-muted" style="font-size:0.82rem;"></div>' +
        '</div>' +
      '</div>',
      '<button type="button" class="btn btn-outline" onclick="PriceTools.closeOffers()">داخستن</button>',
      "PriceTools.closeOffers()");

    var sel1 = el("omCat");
    if (sel1) {
      sel1.innerHTML = "";
      (DB.categories || []).forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.id; o.textContent = c.name;
        sel1.appendChild(o);
      });
    }
    var sel2 = el("omProdCat");
    if (sel2) {
      sel2.innerHTML = '<option value="all">هەموو پۆلەکان</option>';
      (DB.categories || []).forEach(function (c) {
        var o2 = document.createElement("option");
        o2.value = c.id; o2.textContent = c.name;
        sel2.appendChild(o2);
      });
    }
    if (el("omStart") && !el("omStart").value) el("omStart").value = ptToday();
    if (el("omEnd") && !el("omEnd").value) el("omEnd").value = ptAddDays(ptToday(), 7);
    if (el("omProdStart") && !el("omProdStart").value) el("omProdStart").value = ptToday();
    if (el("omProdEnd") && !el("omProdEnd").value) el("omProdEnd").value = ptAddDays(ptToday(), 7);

    omRender();
    omSetTargetTab("products");
    showModal("offersManagerModal");
  }

  function closeOffers() { hideModal("offersManagerModal"); }

  function omSetFilter(f) { omFilter = f; omRender(); }

  function omRender() {
    var rows = offerRows();
    var counts = { active: 0, scheduled: 0, expired: 0 };
    rows.forEach(function (r) { counts[r.o.state]++; });
    var tabs = [["active", "چالاک"], ["scheduled", "داهاتوو"], ["expired", "تەواوبوو"], ["all", "هەموو"]];
    el("omCounters").innerHTML = tabs.map(function (t) {
      var n = t[0] === "all" ? rows.length : counts[t[0]];
      return '<button type="button" class="pt-chip' + (omFilter === t[0] ? " active" : "") + '" onclick="PriceTools.omSetFilter(\'' + t[0] + '\')">' + t[1] + ' (' + n + ')</button>';
    }).join("");

    var shown = rows.filter(function (r) { return omFilter === "all" || r.o.state === omFilter; });
    var stateText = { active: '<span class="pt-ok">چالاک</span>', scheduled: '<span style="color:#38bdf8;font-weight:800;">داهاتوو</span>', expired: '<span class="pt-muted">تەواو بوو — نرخ گەڕاوەتەوە</span>' };
    el("omTbody").innerHTML = shown.length ? shown.map(function (r) {
      var p = r.p, o = r.o;
      var left = (o.state === "active" && o.daysLeft !== null) ? ' <small class="pt-muted">(ماوە ' + o.daysLeft + ' ڕۆژ)</small>' : "";
      var id = ptEsc(p.id);
      return '<tr>' +
        '<td><strong>' + ptEsc(p.name) + '</strong></td>' +
        '<td>' + fmt(p.price) + '</td>' +
        '<td class="pt-bad">' + fmt(o.price) + '</td>' +
        '<td>' + (o.discountPct > 0 ? '%' + o.discountPct : '-') + '</td>' +
        '<td>' + ptEsc(o.start || "-") + '</td>' +
        '<td>' + ptEsc(o.end || "-") + left + '</td>' +
        '<td>' + stateText[o.state] + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button type="button" class="btn btn-sm btn-outline" title="دەستکاری" onclick="PriceTools.omEdit(\'' + id + '\')"><i class="fas fa-edit"></i></button> ' +
          '<button type="button" class="btn btn-sm btn-outline" title="درێژکردنەوە +٧ ڕۆژ" onclick="PriceTools.omExtend(\'' + id + '\')"><i class="fas fa-calendar-plus"></i></button> ' +
          '<button type="button" class="btn btn-sm btn-outline" style="color:var(--danger)" title="کۆتاییپێهێنان و گەڕاندنەوەی نرخ" onclick="PriceTools.omStop(\'' + id + '\')"><i class="fas fa-stop-circle"></i></button>' +
        '</td></tr>';
    }).join("") : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">هیچ ئۆفەرێک لەم بەشەدا نییە</td></tr>';
  }

  function omEdit(id) {
    closeOffers();
    if (typeof editProduct === "function") editProduct(id);
  }

  /** Applies [{id, offerPrice, offerStart, offerEnd}] on the server, then locally. */
  function saveOfferItems(items, doneMsg) {
    if (!serverOnline()) {
      note("سێرڤەر ئۆفلاینە", "بۆ پاراستنی ئۆفەر پێویستە سێرڤەر کار بکات", "error");
      return Promise.resolve(false);
    }
    return postJson("/api/products/offers-batch", { items: items }).then(function (res) {
      if (!res || !res.success) throw new Error((res && res.error) || "هەڵە");
      items.forEach(function (it) {
        var p = DB.products.find(function (x) { return x.id === it.id; });
        if (!p) return;
        p.offerPrice = it.offerPrice || 0;
        p.offerStart = it.offerPrice > 0 ? (it.offerStart || "") : "";
        p.offerEnd = it.offerPrice > 0 ? (it.offerEnd || "") : "";
      });
      repriceCartsForOffers();
      lastStates = currentStates();
      refreshViews();
      if (el("offersManagerModal")) omRender();
      if (doneMsg) note("سەرکەوتوو", doneMsg, "success");
      return true;
    }).catch(function (err) {
      note("هەڵە", "ئۆفەر پاشکەوت نەکرا: " + err.message, "error");
      return false;
    });
  }

  function omStop(id) {
    var p = DB.products.find(function (x) { return x.id === id; });
    if (!p || !confirm("ئۆفەری «" + p.name + "» کۆتایی پێبهێنرێت و نرخ بگەڕێتەوە بۆ ئاسایی؟")) return;
    saveOfferItems([{ id: id, offerPrice: 0 }], "ئۆفەرەکە کۆتایی هات و نرخی ئاسایی گەڕایەوە");
  }

  function omExtend(id) {
    var p = DB.products.find(function (x) { return x.id === id; });
    if (!p) return;
    var o = getOfferInfo(p);
    var today = ptToday();
    var base = (o.end && o.end >= today) ? o.end : today;
    saveOfferItems([{ id: id, offerPrice: o.price, offerStart: o.start || today, offerEnd: ptAddDays(base, 7) }],
      "ئۆفەرەکە ٧ ڕۆژ درێژکرایەوە");
  }

  function offerPriceFor(price, type, value, round) {
    var n = type === "percent" ? price * (1 - value / 100) : price - value;
    n = round && n >= STEP ? Math.round(n / STEP) * STEP : Math.round(n);
    return n;
  }

  function omPlan() {
    var cat = val("omCat");
    var type = val("omType");
    var value = parseFloat(val("omValue")) || 0;
    var round = el("omRound") && el("omRound").checked;
    var overwrite = el("omOverwrite") && el("omOverwrite").checked;
    var items = [], skippedExisting = 0, skippedInvalid = 0, sample = [];
    (DB.products || []).forEach(function (p) {
      if (p.cat !== cat) return;
      var existing = getOfferInfo(p);
      if (!overwrite && (existing.state === "active" || existing.state === "scheduled")) { skippedExisting++; return; }
      var price = parseFloat(p.price) || 0;
      var np = offerPriceFor(price, type, value, round);
      if (value <= 0 || price <= 0 || np <= 0 || np >= price) { skippedInvalid++; return; }
      items.push({ id: p.id, offerPrice: np, offerStart: val("omStart") || ptToday(), offerEnd: val("omEnd") });
      if (sample.length < 3) sample.push(p.name + ": " + Number(price).toLocaleString("en-US") + " ← " + Number(np).toLocaleString("en-US"));
    });
    return { items: items, skippedExisting: skippedExisting, skippedInvalid: skippedInvalid, sample: sample };
  }

  function omPreview() {
    var box = el("omPreview");
    if (!box) return;
    var plan = omPlan();
    if (!(parseFloat(val("omValue")) > 0)) { box.textContent = "بڕی داشکاندن بنووسە بۆ پێشبینی"; return; }
    box.innerHTML = '<strong>' + plan.items.length + '</strong> بەرهەم ئۆفەریان بۆ دادەنرێت' +
      (plan.sample.length ? ' — نموونە: ' + plan.sample.map(ptEsc).join(" | ") : "") +
      (plan.skippedExisting ? ' <span class="pt-up">| ' + plan.skippedExisting + ' ئۆفەری هەیە (تێپەڕێنرا)</span>' : "") +
      (plan.skippedInvalid ? ' <span class="pt-muted">| ' + plan.skippedInvalid + ' بەرهەم تێپەڕێنرا (نرخی نادروست)</span>' : "");
  }

  function omApplyCategory() {
    var start = val("omStart") || ptToday();
    var end = val("omEnd");
    if (!(parseFloat(val("omValue")) > 0)) { note("ئاگاداری", "بڕی داشکاندن بنووسە", "warning"); return; }
    if (!end) { note("ئاگاداری", "بەرواری کۆتایی ئۆفەر دیاری بکە", "warning"); return; }
    if (end < start) { note("ئاگاداری", "بەرواری کۆتایی ناکرێت پێش دەستپێک بێت", "warning"); return; }
    var plan = omPlan();
    if (!plan.items.length) { note("ئاگاداری", "هیچ بەرهەمێک بۆ ئۆفەر نییە لەم پۆلەدا", "warning"); return; }
    if (!confirm("ئۆفەر بۆ " + plan.items.length + " بەرهەم دابنرێت لە " + start + " تا " + end + "؟")) return;
    saveOfferItems(plan.items, "ئۆفەر بۆ " + plan.items.length + " بەرهەم دانرا");
  }

  /* ───── Specific Products Offer Functions ───── */

  function omSetTargetTab(tab) {
    omTargetTab = tab;
    var bProds = el("omTabBtn_prods");
    var bCat = el("omTabBtn_cat");
    var wProds = el("omSpecificWrap");
    var wCat = el("omCategoryWrap");
    if (bProds) bProds.className = "pt-chip" + (tab === "products" ? " active" : "");
    if (bCat) bCat.className = "pt-chip" + (tab === "category" ? " active" : "");
    if (wProds) wProds.style.display = tab === "products" ? "block" : "none";
    if (wCat) wCat.style.display = tab === "category" ? "block" : "none";
    if (tab === "products") {
      omRenderSpecificProds();
    } else {
      omPreview();
    }
  }

  function omSetProdType(type) {
    omProdType = type;
    var lbl = el("omProdValLabel");
    if (lbl) {
      if (type === "percent") lbl.textContent = "ڕێژەی داشکاندن (%)";
      else if (type === "amount") lbl.textContent = "کەمکردنەوەی دینار (-د.ع)";
      else lbl.textContent = "نرخی ئۆفەری جێگیر (د.ع)";
    }
    var inp = el("omProdValue");
    if (inp) {
      inp.placeholder = type === "percent" ? "15" : (type === "fixed" ? "5000" : "500");
    }
    var quickDiv = el("omProdQuickChips");
    if (quickDiv) {
      if (type === "percent") {
        quickDiv.innerHTML =
          '<button type="button" class="pt-quick" onclick="PriceTools.omSetProdQuick(10)">-%10</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.omSetProdQuick(15)">-%15</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.omSetProdQuick(20)">-%20</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.omSetProdQuick(25)">-%25</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.omSetProdQuick(50)">-%50</button>';
      } else if (type === "amount") {
        quickDiv.innerHTML =
          '<button type="button" class="pt-quick" onclick="PriceTools.omSetProdQuick(250)">-250</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.omSetProdQuick(500)">-500</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.omSetProdQuick(1000)">-1000</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.omSetProdQuick(2000)">-2000</button>';
      } else {
        quickDiv.innerHTML = "";
      }
    }
    omRenderSpecificProds();
  }

  function omSetProdQuick(val) {
    if (el("omProdValue")) {
      el("omProdValue").value = val;
      omRenderSpecificProds();
    }
  }

  function omQuickDaysProd(n) {
    var start = val("omProdStart") || ptToday();
    if (el("omProdStart")) el("omProdStart").value = start;
    if (el("omProdEnd")) el("omProdEnd").value = ptAddDays(start, n);
    omRenderSpecificProds();
  }

  function omToggleProd(id, checked) {
    if (checked) omSelectedProducts.add(id);
    else omSelectedProducts.delete(id);
    omUpdateSelectedCount();
    omUpdatePreviewSpecific();
  }

  function omGetFilteredProds() {
    var q = (val("omProdSearch") || "").toLowerCase().trim();
    var cat = val("omProdCat") || "all";
    return (DB.products || []).filter(function (p) {
      if (cat !== "all" && p.cat !== cat) return false;
      if (!q) return true;
      var name = (p.name || "").toLowerCase();
      var barcode = (p.barcode || "").toLowerCase();
      var code = (p.code || "").toLowerCase();
      return name.indexOf(q) !== -1 || barcode.indexOf(q) !== -1 || code.indexOf(q) !== -1;
    });
  }

  function omToggleSelectAllProds(checked) {
    var prods = omGetFilteredProds();
    prods.forEach(function (p) {
      if (checked) omSelectedProducts.add(p.id);
      else omSelectedProducts.delete(p.id);
    });
    omRenderSpecificProds();
  }

  function omUpdateSelectedCount() {
    var badge = el("omSelectedCountBadge");
    if (badge) badge.textContent = omSelectedProducts.size + " بەرهەم هەڵبژێردراوە";
    var chk = el("omMasterChk");
    if (chk) {
      var visible = omGetFilteredProds();
      if (!visible.length) {
        chk.checked = false;
        chk.indeterminate = false;
      } else {
        var allChecked = visible.every(function (p) { return omSelectedProducts.has(p.id); });
        var someChecked = visible.some(function (p) { return omSelectedProducts.has(p.id); });
        chk.checked = allChecked;
        chk.indeterminate = !allChecked && someChecked;
      }
    }
  }

  function omCalcOfferPriceForProd(p, valNum, round) {
    var regular = getRegularPiecePrice(p);
    if (regular <= 0 || valNum <= 0) return 0;
    var np = 0;
    if (omProdType === "fixed") {
      np = (round && valNum >= STEP) ? Math.round(valNum / STEP) * STEP : Math.round(valNum);
    } else {
      np = offerPriceFor(regular, omProdType, valNum, round);
    }
    return np;
  }

  function omRenderSpecificProds() {
    var tbody = el("omProdTbody");
    if (!tbody) return;
    var prods = omGetFilteredProds();
    var valNum = parseFloat(val("omProdValue")) || 0;
    var round = !!(el("omProdRound") && el("omProdRound").checked);
    var catMap = {};
    (DB.categories || []).forEach(function (c) { catMap[c.id] = c.name; });

    var MAX_SHOW = 120;
    var toShow = prods.slice(0, MAX_SHOW);

    if (!toShow.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">هیچ بەرهەمێک نەدۆزرایەوە</td></tr>';
      omUpdateSelectedCount();
      omUpdatePreviewSpecific();
      return;
    }

    tbody.innerHTML = toShow.map(function (p) {
      var isChecked = omSelectedProducts.has(p.id);
      var reg = getRegularPiecePrice(p);
      var newOffer = omCalcOfferPriceForProd(p, valNum, round);
      var o = getOfferInfo(p);
      var newPriceHtml = '<span class="pt-muted">-</span>';
      if (valNum > 0) {
        if (newOffer > 0 && newOffer < reg) {
          var disc = reg > 0 ? Math.round((1 - newOffer / reg) * 100) : 0;
          newPriceHtml = '<strong class="pt-bad">' + fmt(newOffer) + '</strong> <small class="pt-muted">(-%' + disc + ')</small>';
        } else if (newOffer >= reg) {
          newPriceHtml = '<span style="color:#f59e0b;font-size:0.75rem;">⚠ کەمتر نییە</span>';
        } else {
          newPriceHtml = '<span style="color:var(--danger);font-size:0.75rem;">سفر یان نادروست</span>';
        }
      }

      var curOfferHtml = '<span class="pt-muted">-</span>';
      if (o.state === "active") {
        curOfferHtml = '<span class="pt-ok" style="font-size:0.76rem;">' + fmt(o.price) + ' (چالاک)</span>';
      } else if (o.state === "scheduled") {
        curOfferHtml = '<span style="color:#38bdf8;font-size:0.76rem;">' + fmt(o.price) + ' (لە ' + ptEsc(o.start) + ')</span>';
      }

      return '<tr class="pt-prod-row" onclick="if(event.target.tagName !== \'INPUT\') PriceTools.omToggleProd(\'' + ptEsc(p.id) + '\', ' + !isChecked + ')">' +
        '<td style="text-align:center;" onclick="event.stopPropagation();"><input type="checkbox" onchange="PriceTools.omToggleProd(\'' + ptEsc(p.id) + '\', this.checked)" ' + (isChecked ? 'checked' : '') + '></td>' +
        '<td><strong>' + ptEsc(p.name) + '</strong>' + (p.barcode ? ' <small class="pt-muted">(' + ptEsc(p.barcode) + ')</small>' : '') + '</td>' +
        '<td class="pt-muted" style="font-size:0.76rem;">' + ptEsc(catMap[p.cat] || "بێ پۆل") + '</td>' +
        '<td>' + fmt(reg) + '</td>' +
        '<td>' + newPriceHtml + '</td>' +
        '<td>' + curOfferHtml + '</td>' +
      '</tr>';
    }).join("");

    if (prods.length > MAX_SHOW) {
      tbody.innerHTML += '<tr><td colspan="6" style="text-align:center;padding:8px;font-size:0.76rem;color:var(--text-muted);background:rgba(255,255,255,0.02);">پیشاندانی ' + MAX_SHOW + ' لە ' + prods.length + ' بەرهەم. بۆ بەرهەمی تر ناو یان باڕکۆد بنووسە.</td></tr>';
    }

    omUpdateSelectedCount();
    omUpdatePreviewSpecific();
  }

  function omUpdatePreviewSpecific() {
    var box = el("omSpecificPreview");
    if (!box) return;
    var count = omSelectedProducts.size;
    if (count === 0) {
      box.innerHTML = '<span class="pt-muted"><i class="fas fa-hand-pointer"></i> تکایە ئەو بەرهەمانە دیاری بکە کە دەتەوێت ئۆفەریان بۆ دابنێیت. دەتوانیت لە سندوقی گەڕان ناو یان باڕکۆد بنووسیت.</span>';
      return;
    }
    var valNum = parseFloat(val("omProdValue")) || 0;
    var round = !!(el("omProdRound") && el("omProdRound").checked);
    var start = val("omProdStart") || ptToday();
    var end = val("omProdEnd") || ptAddDays(start, 7);
    var validItems = [];
    var names = [];
    (DB.products || []).forEach(function (p) {
      if (!omSelectedProducts.has(p.id)) return;
      var reg = getRegularPiecePrice(p);
      var np = omCalcOfferPriceForProd(p, valNum, round);
      if (valNum > 0 && np > 0 && np < reg) {
        validItems.push({ p: p, newPrice: np, reg: reg });
        if (names.length < 3) names.push(p.name + " (" + fmt(reg) + " ← " + fmt(np) + ")");
      }
    });

    box.innerHTML = '<span class="pt-ok"><i class="fas fa-check-circle"></i> ' + count + ' بەرهەم هەڵبژێردراوە.</span> ' +
      (valNum > 0 ? ('ئامادەیە بۆ ئۆفەر: <strong>' + validItems.length + '</strong> بەرهەم لە <strong>' + ptEsc(start) + '</strong> تا <strong>' + ptEsc(end) + '</strong>' +
        (names.length ? ' — نموونە: ' + names.map(ptEsc).join(" ، ") : '')) : '<span class="pt-up">تکایە بڕ یان ڕێژەی داشکاندن بنووسە.</span>');
  }

  function omApplySpecific() {
    if (omSelectedProducts.size === 0) {
      note("ئاگاداری", "تکایە لانیکەم یەک بەرهەم هەڵبژێرە", "warning");
      return;
    }
    var valNum = parseFloat(val("omProdValue")) || 0;
    if (valNum <= 0) {
      note("ئاگاداری", "تکایە بڕ یان ڕێژەی داشکاندن بنووسە", "warning");
      return;
    }
    var start = val("omProdStart") || ptToday();
    var end = val("omProdEnd");
    if (!end) {
      note("ئاگاداری", "تکایە بەرواری کۆتایی ئۆفەر دیاری بکە", "warning");
      return;
    }
    if (end < start) {
      note("ئاگاداری", "بەرواری کۆتایی ناکرێت پێش دەستپێک بێت", "warning");
      return;
    }
    var round = !!(el("omProdRound") && el("omProdRound").checked);
    var items = [];
    (DB.products || []).forEach(function (p) {
      if (!omSelectedProducts.has(p.id)) return;
      var reg = getRegularPiecePrice(p);
      var np = omCalcOfferPriceForProd(p, valNum, round);
      if (np > 0 && np < reg) {
        items.push({ id: p.id, offerPrice: np, offerStart: start, offerEnd: end });
      }
    });

    if (items.length === 0) {
      note("ئاگاداری", "هیچ بەرهەمێک لە هەڵبژێردراوەکان مەرجی نرخی ئۆفەری تێدا نییە (دەبێت نرخی ئۆفەر کەمتر بێت لە ئاسایی)", "warning");
      return;
    }

    if (!confirm("ئۆفەر بۆ " + items.length + " بەرهەمی دیاریکراو دابنرێت لە " + start + " تا " + end + "؟")) return;

    saveOfferItems(items, "ئۆفەر بۆ " + items.length + " بەرهەم سەرکەوتووانە دانرا").then(function (ok) {
      if (ok) {
        omSelectedProducts.clear();
        if (el("omProdValue")) el("omProdValue").value = "";
        omRenderSpecificProds();
      }
    });
  }

  function openOfferForProduct(id) {
    openOffers();
    omSetTargetTab("products");
    omSelectedProducts.clear();
    if (id) {
      omSelectedProducts.add(id);
      var p = (DB.products || []).find(function (x) { return x.id === id; });
      if (p && el("omProdSearch")) el("omProdSearch").value = p.name;
    }
    omRenderSpecificProds();
  }

  /* ═════════ BULK PRICE ADJUSTMENT ═════════ */

  function bpCategories() {
    var cats = (DB.categories || []).map(function (c) { return { id: c.id, name: c.name }; });
    var known = {};
    cats.forEach(function (c) { known[c.id] = true; });
    var orphan = (DB.products || []).some(function (p) { return !p.cat || !known[p.cat]; });
    if (orphan) cats.push({ id: "__none__", name: "بێ پۆل" });
    return cats;
  }

  function productCatKey(p, known) { return (p.cat && known[p.cat]) ? p.cat : "__none__"; }

  function bpQuickValues() { return bpMode === "percent" ? [5, 10, 15, -5] : [250, 500, 1000, 2000, -250]; }

  function bpRenderRows(reset) {
    var cats = bpCategories();
    var known = {};
    cats.forEach(function (c) { known[c.id] = true; });
    var counts = {};
    (DB.products || []).forEach(function (p) { var k = productCatKey(p, known); counts[k] = (counts[k] || 0) + 1; });
    var suffix = bpMode === "percent" ? "%" : "د.ع";
    var tbody = el("bpTbody");
    var previous = {};
    if (!reset) tbody.querySelectorAll(".bp-input").forEach(function (i) { previous[i.getAttribute("data-cat")] = i.value; });
    tbody.innerHTML = cats.map(function (c) {
      var n = counts[c.id] || 0;
      var quick = bpQuickValues().map(function (q) {
        return '<button type="button" class="pt-quick" onclick="PriceTools.bpQuick(\'' + ptEsc(c.id) + '\',' + q + ')">' + (q > 0 ? "+" : "") + q + (bpMode === "percent" ? "%" : "") + '</button>';
      }).join("") + '<button type="button" class="pt-quick" onclick="PriceTools.bpQuick(\'' + ptEsc(c.id) + '\',0)" title="پاککردنەوە">✕</button>';
      return '<tr' + (n === 0 ? ' style="opacity:0.45;"' : '') + '>' +
        '<td><strong>' + ptEsc(c.name) + '</strong></td>' +
        '<td>' + n + '</td>' +
        '<td style="white-space:nowrap;"><input type="number" class="pt-input bp-input" data-cat="' + ptEsc(c.id) + '" step="' + (bpMode === "percent" ? "1" : STEP) + '" placeholder="0" style="width:100px;" value="' + ptEsc(previous[c.id] || "") + '" oninput="PriceTools.bpPreview()" ' + (n === 0 ? "disabled" : "") + '> <small class="pt-muted">' + suffix + '</small></td>' +
        '<td>' + quick + '</td></tr>';
    }).join("");
  }

  function bpSetMode(mode, forceReset) {
    // Values typed in one mode (250 dinar) must never be reused in the other (250 %), so switching clears them.
    var reset = !!forceReset || mode !== bpMode;
    bpMode = mode;
    ["amount", "percent"].forEach(function (m) {
      var b = el("bpMode_" + m);
      if (b) b.className = "pt-chip" + (m === mode ? " active" : "");
    });
    if (el("bpAllValue")) { el("bpAllValue").step = mode === "percent" ? "1" : String(STEP); if (reset) el("bpAllValue").value = ""; }
    bpRenderRows(reset);
    bpPreview();
  }

  function bpQuick(catId, v) {
    var inputs = el("bpTbody").querySelectorAll(".bp-input");
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].getAttribute("data-cat") === catId) { inputs[i].value = v === 0 ? "" : v; break; }
    }
    bpPreview();
  }

  function bpFillAll() {
    var v = parseFloat(val("bpAllValue"));
    el("bpTbody").querySelectorAll(".bp-input").forEach(function (i) { if (!i.disabled) i.value = isNaN(v) || v === 0 ? "" : v; });
    bpPreview();
  }

  function bpReadRows() {
    var rows = {};
    el("bpTbody").querySelectorAll(".bp-input").forEach(function (inp) {
      var v = parseFloat(inp.value);
      if (!isNaN(v) && v !== 0) rows[inp.getAttribute("data-cat")] = v;
    });
    return rows;
  }

  function bpReadOptions() {
    return {
      mode: bpMode,
      pack: !!(el("bpOptPack") && el("bpOptPack").checked),
      wholesale: !!(el("bpOptWholesale") && el("bpOptWholesale").checked),
      cost: !!(el("bpOptCost") && el("bpOptCost").checked),
      round: !!(el("bpOptRound") && el("bpOptRound").checked)
    };
  }

  /**
   * Pure calculation (also used by tests). products: [{id,name,cat,price,cost,wholesalePrice,packPrice,packCost,packQty}]
   * valuesByCat: { categoryId: signedNumber }  — categoryId "__none__" targets uncategorised products.
   */
  function computePriceChanges(products, categories, valuesByCat, opts) {
    var known = {};
    (categories || []).forEach(function (c) { known[c.id] = true; });
    var changes = [], byCat = {}, skipped = 0;

    function roundSell(n) {
      return (opts.round && n >= STEP) ? Math.round(n / STEP) * STEP : Math.round(n);
    }
    function sell(old, v) {
      return roundSell(opts.mode === "percent" ? old * (1 + v / 100) : old + v);
    }
    function plain(old, v) {
      var n = opts.mode === "percent" ? old * (1 + v / 100) : old + v;
      return Math.max(0, Math.round(n));
    }

    (products || []).forEach(function (p) {
      var key = (p.cat && known[p.cat]) ? p.cat : "__none__";
      var v = valuesByCat[key];
      if (!v) return;
      var packQty = parseFloat(p.packQty) || 1;
      var oldPrice = parseFloat(p.price) || 0;
      if (oldPrice <= 0) { skipped++; return; }
      var newPrice = sell(oldPrice, v);
      if (newPrice <= 0) { skipped++; return; }

      var before = {
        price: oldPrice,
        cost: parseFloat(p.cost) || 0,
        wholesalePrice: parseFloat(p.wholesalePrice) || 0,
        packPrice: parseFloat(p.packPrice) || 0,
        packCost: parseFloat(p.packCost) || 0
      };
      var after = Object.assign({}, before, { price: newPrice });

      if (opts.pack && before.packPrice > 0) {
        // Amount mode: a carton of N pieces rises by N x the per-piece amount.
        var np = opts.mode === "percent" ? sell(before.packPrice, v) : roundSell(before.packPrice + v * packQty);
        if (np > 0) after.packPrice = np;
      }
      if (opts.wholesale && before.wholesalePrice > 0) {
        var nw = sell(before.wholesalePrice, v);
        if (nw > 0) after.wholesalePrice = nw;
      }
      if (opts.cost) {
        if (before.cost > 0) after.cost = plain(before.cost, v);
        if (before.packCost > 0) {
          after.packCost = opts.mode === "percent" ? plain(before.packCost, v) : plain(before.packCost, v * packQty);
        }
      }

      var changed = Object.keys(before).some(function (f) { return Math.abs(after[f] - before[f]) > 0.0001; });
      if (!changed) return;
      changes.push({ id: p.id, name: p.name, cat: key, old: before, new: after });
      byCat[key] = byCat[key] || { count: 0, value: v };
      byCat[key].count++;
    });
    return { changes: changes, byCat: byCat, skipped: skipped };
  }

  function bpCompute() {
    return computePriceChanges(DB.products, DB.categories, bpReadRows(), bpReadOptions());
  }

  function bpPreview() {
    var box = el("bpPreview");
    if (!box) return;
    var rows = bpReadRows();
    if (!Object.keys(rows).length) {
      box.innerHTML = '<span class="pt-muted">بۆ هەر پۆلێک بڕێک بنووسە (نموونە: خواردنەوە +٢٥٠، شیر +١٠٠٠) تا پێشبینی دەربکەوێت.</span>';
      return;
    }
    var res = bpCompute();
    if (!res.changes.length) { box.innerHTML = '<span class="pt-up">هیچ بەرهەمێک ناگۆڕدرێت.</span>'; return; }
    var names = {};
    bpCategories().forEach(function (c) { names[c.id] = c.name; });
    var summary = Object.keys(res.byCat).map(function (k) {
      return '<span class="pt-chip active" style="cursor:default;">' + ptEsc(names[k] || k) + ' ' + signed(res.byCat[k].value) + (bpMode === "percent" ? "%" : "") + ' ← ' + res.byCat[k].count + ' بەرهەم</span>';
    }).join(" ");
    var sample = res.changes.slice(0, 40).map(function (c) {
      var d = c.new.price - c.old.price;
      return '<tr><td>' + ptEsc(c.name) + '</td><td>' + fmt(c.old.price) + '</td><td class="' + (d > 0 ? "pt-up" : "pt-ok") + '">' + fmt(c.new.price) + ' <small>(' + signed(d) + ')</small></td>' +
        '<td class="pt-muted">' + (c.new.packPrice !== c.old.packPrice ? fmt(c.old.packPrice) + ' ← ' + fmt(c.new.packPrice) : '-') + '</td></tr>';
    }).join("");
    box.innerHTML = '<div style="margin-bottom:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;"><strong>' + res.changes.length + ' بەرهەم دەگۆڕدرێت:</strong> ' + summary + '</div>' +
      (res.skipped ? '<div class="pt-muted" style="font-size:0.78rem;margin-bottom:6px;">' + res.skipped + ' بەرهەم تێپەڕێنرا (نرخیان سفرە یان ئەنجامەکە سفر دەبێت)</div>' : '') +
      '<div style="max-height:230px;overflow:auto;"><table class="pt-table"><thead><tr><th>بەرهەم</th><th>نرخی ئێستا</th><th>نرخی نوێ</th><th>کارتۆن</th></tr></thead><tbody>' + sample + '</tbody></table></div>' +
      (res.changes.length > 40 ? '<div class="pt-muted" style="font-size:0.76rem;margin-top:4px;">... و ' + (res.changes.length - 40) + ' بەرهەمی تر</div>' : '');
  }

  function openBulkPrice() {
    if (!allowed()) return;
    ensureModal("bulkPriceModal", "گۆڕینی نرخ بە کۆمەڵ (Bulk Price)", "fa-tags", 960,
      '<div class="pt-note"><i class="fas fa-info-circle"></i> دەتوانیت نرخی <strong>بەرهەمی دیاریکراو</strong> یان <strong>هەموو پۆلەکە</strong> بە یەکجار زیاد یان کەم بکەیت. بەسوودە بۆ کاتی بەرزبوونەوەی دۆلار. هەموو گۆڕانکارییەکان تۆمار دەکرێن و بە یەک کلیک دەتوانیت بیگەڕێنیتەوە.</div>' +
      '<div class="pt-tabs" style="margin-bottom:12px;border-bottom:1px solid var(--border-color);padding-bottom:10px;">' +
        '<button type="button" id="bpTabBtn_prods" class="pt-chip active" onclick="PriceTools.bpSetTargetTab(\'products\')"><i class="fas fa-check-square"></i> بەرهەمی دیاریکراو (Select Products)</button>' +
        '<button type="button" id="bpTabBtn_cats" class="pt-chip" onclick="PriceTools.bpSetTargetTab(\'category\')"><i class="fas fa-layer-group"></i> بەپێی پۆل (Whole Category)</button>' +
      '</div>' +

      '<!-- WRAP 1: SPECIFIC PRODUCTS -->' +
      '<div id="bpSpecificWrap">' +
        '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;background:rgba(255,255,255,0.03);padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);margin-bottom:10px;">' +
          '<div><div class="pt-muted" style="font-size:0.74rem;">شێوازی گۆڕانکاری</div>' +
            '<div class="pt-tabs" style="margin-bottom:0;">' +
              '<button type="button" id="bpSpecMode_amount" class="pt-chip active" onclick="PriceTools.bpSetSpecificMode(\'amount\')">بڕ (+/- د.ع)</button>' +
              '<button type="button" id="bpSpecMode_percent" class="pt-chip" onclick="PriceTools.bpSetSpecificMode(\'percent\')">ڕێژە (+/- %)</button>' +
              '<button type="button" id="bpSpecMode_fixed" class="pt-chip" onclick="PriceTools.bpSetSpecificMode(\'fixed\')">نرخی جێگیر</button>' +
            '</div>' +
          '</div>' +
          '<div><div class="pt-muted" style="font-size:0.74rem;" id="bpSpecValLabel">بڕی گۆڕانکاری (+/- د.ع)</div>' +
            '<input type="number" id="bpSpecValue" class="pt-input" placeholder="250" step="250" style="width:115px;" oninput="PriceTools.bpRenderSpecificProds()">' +
          '</div>' +
          '<div style="display:flex;gap:4px;align-self:flex-end;" id="bpSpecQuickChips">' +
            '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(250)">+250</button>' +
            '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(500)">+500</button>' +
            '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(1000)">+1000</button>' +
            '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(2000)">+2000</button>' +
            '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(-250)">-250</button>' +
            '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(-500)">-500</button>' +
          '</div>' +
          '<div class="pt-opts" style="margin:0 4px 6px 0;">' +
            '<label><input type="checkbox" id="bpSpecOptPack" checked onchange="PriceTools.bpRenderSpecificProds()"> نرخی کارتۆن</label>' +
            '<label><input type="checkbox" id="bpSpecOptWholesale" checked onchange="PriceTools.bpRenderSpecificProds()"> جوملە</label>' +
            '<label><input type="checkbox" id="bpSpecOptCost" onchange="PriceTools.bpRenderSpecificProds()"> تێچوو (Cost)</label>' +
            '<label><input type="checkbox" id="bpSpecOptRound" checked onchange="PriceTools.bpRenderSpecificProds()"> نزیکترین ' + STEP + '</label>' +
          '</div>' +
          '<button type="button" class="btn btn-primary btn-sm" onclick="PriceTools.bpApplySpecific()" style="font-weight:800;padding:8px 18px;">' +
            '<i class="fas fa-check"></i> گۆڕینی نرخی هەڵبژێردراوەکان' +
          '</button>' +
        '</div>' +
        '<div style="display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">' +
          '<div style="flex:1;min-width:200px;position:relative;">' +
            '<input type="text" id="bpProdSearch" class="pt-input" placeholder="گەڕان بە ناو یان باڕکۆدی بەرهەم..." style="width:100%;padding-right:28px;" oninput="PriceTools.bpRenderSpecificProds()">' +
            '<i class="fas fa-search" style="position:absolute;right:9px;top:10px;color:var(--text-muted);font-size:0.8rem;"></i>' +
          '</div>' +
          '<select id="bpProdCat" class="pt-input" style="min-width:140px;" onchange="PriceTools.bpRenderSpecificProds()"><option value="all">هەموو پۆلەکان</option></select>' +
          '<div id="bpSelectedCountBadge" style="font-size:0.82rem;color:var(--accent,#38bdf8);font-weight:800;">٠ بەرهەم هەڵبژێردراوە</div>' +
        '</div>' +
        '<div style="max-height:220px;overflow-y:auto;border:1px solid var(--border-color);border-radius:8px;">' +
          '<table class="pt-table"><thead><tr><th style="width:36px;text-align:center;"><input type="checkbox" id="bpMasterChk" onchange="PriceTools.bpToggleSelectAllProds(this.checked)"></th><th>بەرهەم</th><th>پۆل</th><th>نرخی ئێستا</th><th>نرخی نوێ</th><th>کارتۆن</th></tr></thead><tbody id="bpProdTbody"></tbody></table>' +
        '</div>' +
        '<div id="bpSpecificPreview" class="pt-muted" style="font-size:0.8rem;margin-top:6px;"></div>' +
      '</div>' +

      '<!-- WRAP 2: WHOLE CATEGORY -->' +
      '<div id="bpCategoryWrap" style="display:none;">' +
        '<div class="pt-tabs">' +
          '<button type="button" id="bpMode_amount" class="pt-chip active" onclick="PriceTools.bpSetMode(\'amount\')">بڕی دینار (+٢٥٠)</button>' +
          '<button type="button" id="bpMode_percent" class="pt-chip" onclick="PriceTools.bpSetMode(\'percent\')">ڕێژە (%)</button>' +
          '<span style="flex:1"></span>' +
          '<span class="pt-muted" style="font-size:0.8rem;align-self:center;">هەمان بڕ بۆ هەموو پۆلەکان:</span>' +
          '<input type="number" id="bpAllValue" class="pt-input" step="250" style="width:90px;" placeholder="250">' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="PriceTools.bpFillAll()">پڕکردنەوە</button>' +
        '</div>' +
        '<div style="max-height:260px;overflow:auto;"><table class="pt-table"><thead><tr><th>پۆل</th><th>ژمارەی بەرهەم</th><th>زیادە / کەم (+/-)</th><th>خێرا</th></tr></thead><tbody id="bpTbody"></tbody></table></div>' +
        '<div class="pt-opts">' +
          '<label><input type="checkbox" id="bpOptPack" checked onchange="PriceTools.bpPreview()"> نرخی کارتۆن بگۆڕە (بڕ × ژمارەی دانە لە کارتۆن)</label>' +
          '<label><input type="checkbox" id="bpOptWholesale" checked onchange="PriceTools.bpPreview()"> نرخی جوملە (Wholesale)</label>' +
          '<label><input type="checkbox" id="bpOptCost" onchange="PriceTools.bpPreview()"> نرخی کڕینیش بگۆڕە (Cost)</label>' +
          '<label><input type="checkbox" id="bpOptRound" checked onchange="PriceTools.bpPreview()"> بیکە بە نزیکترین ' + STEP + ' دینار</label>' +
        '</div>' +
        '<div id="bpPreview" class="pt-box" style="margin-top:6px;"></div>' +
      '</div>' +

      '<div class="pt-box"><h4><i class="fas fa-history" style="color:#38bdf8;"></i> مێژووی گۆڕانکارییەکان (دەتوانیت بیگەڕێنیتەوە)</h4><div id="bpHistory" class="pt-muted" style="font-size:0.82rem;">...</div></div>',
      '<button type="button" id="bpMainApplyBtn" class="btn btn-primary" onclick="PriceTools.bpApply()"><i class="fas fa-check"></i> جێبەجێکردن</button>' +
      '<button type="button" class="btn btn-outline" onclick="PriceTools.closeBulkPrice()">داخستن</button>',
      "PriceTools.closeBulkPrice()");

    var selCat = el("bpProdCat");
    if (selCat) {
      selCat.innerHTML = '<option value="all">هەموو پۆلەکان</option>';
      (DB.categories || []).forEach(function (c) {
        var o = document.createElement("option");
        o.value = c.id; o.textContent = c.name;
        selCat.appendChild(o);
      });
    }

    bpSetMode("amount", true);
    bpSetTargetTab("products");
    showModal("bulkPriceModal");
  }

  function closeBulkPrice() { hideModal("bulkPriceModal"); }

  /* ───── Specific Products Bulk Price Functions ───── */

  function bpSetTargetTab(tab) {
    bpTargetTab = tab;
    var bProds = el("bpTabBtn_prods");
    var bCats = el("bpTabBtn_cats");
    var wProds = el("bpSpecificWrap");
    var wCats = el("bpCategoryWrap");
    var btnApply = el("bpMainApplyBtn");

    if (bProds) bProds.className = "pt-chip" + (tab === "products" ? " active" : "");
    if (bCats) bCats.className = "pt-chip" + (tab === "category" ? " active" : "");
    if (wProds) wProds.style.display = tab === "products" ? "block" : "none";
    if (wCats) wCats.style.display = tab === "category" ? "block" : "none";
    if (btnApply) {
      btnApply.innerHTML = tab === "products"
        ? '<i class="fas fa-check"></i> گۆڕینی نرخی هەڵبژێردراوەکان'
        : '<i class="fas fa-check"></i> جێبەجێکردنی پۆلەکان';
    }

    if (tab === "products") {
      bpRenderSpecificProds();
    } else {
      bpPreview();
    }
  }

  function bpSetSpecificMode(mode) {
    bpSpecificMode = mode;
    ["amount", "percent", "fixed"].forEach(function (m) {
      var b = el("bpSpecMode_" + m);
      if (b) b.className = "pt-chip" + (m === mode ? " active" : "");
    });
    var lbl = el("bpSpecValLabel");
    if (lbl) {
      if (mode === "percent") lbl.textContent = "ڕێژە (+/- %)";
      else if (mode === "fixed") lbl.textContent = "نرخی نوێی جێگیر (د.ع)";
      else lbl.textContent = "بڕی گۆڕانکاری (+/- د.ع)";
    }
    var inp = el("bpSpecValue");
    if (inp) {
      inp.step = mode === "percent" ? "1" : String(STEP);
      inp.placeholder = mode === "fixed" ? "5000" : "250";
    }
    var quickDiv = el("bpSpecQuickChips");
    if (quickDiv) {
      if (mode === "fixed") {
        quickDiv.innerHTML = "";
      } else if (mode === "percent") {
        quickDiv.innerHTML =
          '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(5)">+5%</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(10)">+10%</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(15)">+15%</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(-5)">-5%</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(-10)">-10%</button>';
      } else {
        quickDiv.innerHTML =
          '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(250)">+250</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(500)">+500</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(1000)">+1000</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(2000)">+2000</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(-250)">-250</button>' +
          '<button type="button" class="pt-quick" onclick="PriceTools.bpSetSpecificQuick(-500)">-500</button>';
      }
    }
    bpRenderSpecificProds();
  }

  function bpSetSpecificQuick(val) {
    if (el("bpSpecValue")) {
      el("bpSpecValue").value = val;
      bpRenderSpecificProds();
    }
  }

  function bpGetFilteredProds() {
    var q = (val("bpProdSearch") || "").toLowerCase().trim();
    var cat = val("bpProdCat") || "all";
    return (DB.products || []).filter(function (p) {
      if (cat !== "all" && p.cat !== cat) return false;
      if (!q) return true;
      var name = (p.name || "").toLowerCase();
      var barcode = (p.barcode || "").toLowerCase();
      var code = (p.code || "").toLowerCase();
      return name.indexOf(q) !== -1 || barcode.indexOf(q) !== -1 || code.indexOf(q) !== -1;
    });
  }

  function bpToggleProd(id, checked) {
    if (checked) bpSelectedProducts.add(id);
    else bpSelectedProducts.delete(id);
    bpUpdateSelectedCount();
    bpUpdatePreviewSpecific();
  }

  function bpToggleSelectAllProds(checked) {
    var prods = bpGetFilteredProds();
    prods.forEach(function (p) {
      if (checked) bpSelectedProducts.add(p.id);
      else bpSelectedProducts.delete(p.id);
    });
    bpRenderSpecificProds();
  }

  function bpUpdateSelectedCount() {
    var badge = el("bpSelectedCountBadge");
    if (badge) badge.textContent = bpSelectedProducts.size + " بەرهەم هەڵبژێردراوە";
    var chk = el("bpMasterChk");
    if (chk) {
      var visible = bpGetFilteredProds();
      if (!visible.length) {
        chk.checked = false;
        chk.indeterminate = false;
      } else {
        var allChecked = visible.every(function (p) { return bpSelectedProducts.has(p.id); });
        var someChecked = visible.some(function (p) { return bpSelectedProducts.has(p.id); });
        chk.checked = allChecked;
        chk.indeterminate = !allChecked && someChecked;
      }
    }
  }

  function bpCalcSpecificPrice(p, valNum, round) {
    var oldPrice = parseFloat(p.price) || 0;
    if (oldPrice <= 0 && bpSpecificMode !== "fixed") return 0;
    var np = 0;
    if (bpSpecificMode === "fixed") {
      np = (round && valNum >= STEP) ? Math.round(valNum / STEP) * STEP : Math.round(valNum);
    } else if (bpSpecificMode === "percent") {
      np = round ? Math.round((oldPrice * (1 + valNum / 100)) / STEP) * STEP : Math.round(oldPrice * (1 + valNum / 100));
    } else {
      np = (round && (oldPrice + valNum) >= STEP) ? Math.round((oldPrice + valNum) / STEP) * STEP : Math.round(oldPrice + valNum);
    }
    return Math.max(0, np);
  }

  function bpRenderSpecificProds() {
    var tbody = el("bpProdTbody");
    if (!tbody) return;
    var prods = bpGetFilteredProds();
    var valNum = parseFloat(val("bpSpecValue"));
    var hasVal = !isNaN(valNum) && valNum !== 0;
    var round = !!(el("bpSpecOptRound") && el("bpSpecOptRound").checked);
    var catMap = {};
    (DB.categories || []).forEach(function (c) { catMap[c.id] = c.name; });

    var MAX_SHOW = 120;
    var toShow = prods.slice(0, MAX_SHOW);

    if (!toShow.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted);">هیچ بەرهەمێک نەدۆزرایەوە</td></tr>';
      bpUpdateSelectedCount();
      bpUpdatePreviewSpecific();
      return;
    }

    tbody.innerHTML = toShow.map(function (p) {
      var isChecked = bpSelectedProducts.has(p.id);
      var curPrice = parseFloat(p.price) || 0;
      var newPrice = hasVal ? bpCalcSpecificPrice(p, valNum, round) : curPrice;
      var diff = newPrice - curPrice;
      var newPriceHtml = '<span class="pt-muted">-</span>';

      if (hasVal) {
        if (newPrice > 0) {
          var diffColor = diff > 0 ? "pt-up" : (diff < 0 ? "pt-ok" : "pt-muted");
          newPriceHtml = '<strong class="' + diffColor + '">' + fmt(newPrice) + '</strong> ' +
            (diff !== 0 ? '<small class="pt-muted">(' + signed(diff) + ')</small>' : '');
        } else {
          newPriceHtml = '<span style="color:var(--danger);font-size:0.75rem;">سفر یان نادروست</span>';
        }
      }

      var packText = "-";
      if (p.packQty > 1 || p.packPrice > 0) {
        packText = fmt(p.packPrice > 0 ? p.packPrice : curPrice * (p.packQty || 1));
      }

      return '<tr class="pt-prod-row" onclick="if(event.target.tagName !== \'INPUT\') PriceTools.bpToggleProd(\'' + ptEsc(p.id) + '\', ' + !isChecked + ')">' +
        '<td style="text-align:center;" onclick="event.stopPropagation();"><input type="checkbox" onchange="PriceTools.bpToggleProd(\'' + ptEsc(p.id) + '\', this.checked)" ' + (isChecked ? 'checked' : '') + '></td>' +
        '<td><strong>' + ptEsc(p.name) + '</strong>' + (p.barcode ? ' <small class="pt-muted">(' + ptEsc(p.barcode) + ')</small>' : '') + '</td>' +
        '<td class="pt-muted" style="font-size:0.76rem;">' + ptEsc(catMap[p.cat] || "بێ پۆل") + '</td>' +
        '<td>' + fmt(curPrice) + '</td>' +
        '<td>' + newPriceHtml + '</td>' +
        '<td class="pt-muted">' + packText + '</td>' +
      '</tr>';
    }).join("");

    if (prods.length > MAX_SHOW) {
      tbody.innerHTML += '<tr><td colspan="6" style="text-align:center;padding:8px;font-size:0.76rem;color:var(--text-muted);background:rgba(255,255,255,0.02);">پیشاندانی ' + MAX_SHOW + ' لە ' + prods.length + ' بەرهەم. بۆ بەرهەمی تر ناو یان باڕکۆدی بنووسە.</td></tr>';
    }

    bpUpdateSelectedCount();
    bpUpdatePreviewSpecific();
  }

  function bpUpdatePreviewSpecific() {
    var box = el("bpSpecificPreview");
    if (!box) return;
    var count = bpSelectedProducts.size;
    if (count === 0) {
      box.innerHTML = '<span class="pt-muted"><i class="fas fa-hand-pointer"></i> تکایە ئەو بەرهەمانە دیاری بکە کە دەتەوێت نرخیان دەستکاری بکەیت. دەتوانیت لە سندوقی گەڕان ناو یان باڕکۆد بنووسیت یان بەپێی پۆل فلتەریان بکەیت.</span>';
      return;
    }
    var valNum = parseFloat(val("bpSpecValue"));
    var hasVal = !isNaN(valNum) && valNum !== 0;
    var round = !!(el("bpSpecOptRound") && el("bpSpecOptRound").checked);
    var names = [];
    (DB.products || []).forEach(function (p) {
      if (!bpSelectedProducts.has(p.id)) return;
      var curPrice = parseFloat(p.price) || 0;
      var np = bpCalcSpecificPrice(p, valNum, round);
      if (hasVal && names.length < 3) {
        names.push(p.name + " (" + fmt(curPrice) + " ← " + fmt(np) + ")");
      }
    });

    box.innerHTML = '<span class="pt-ok"><i class="fas fa-check-circle"></i> ' + count + ' بەرهەم هەڵبژێردراوە.</span> ' +
      (hasVal ? ('گۆڕانکاری: <strong>' + (signed(valNum) + (bpSpecificMode === "percent" ? "%" : (bpSpecificMode === "fixed" ? " د.ع (جێگیر)" : " د.ع"))) + '</strong>' +
        (names.length ? ' — نموونە: ' + names.map(ptEsc).join(" ، ") : '')) : '<span class="pt-up">تکایە بڕ یان ڕێژەی گۆڕانکاری بنووسە.</span>');
  }

  function bpApplySpecific() {
    if (bpSelectedProducts.size === 0) {
      note("ئاگاداری", "تکایە لانیکەم یەک بەرهەم هەڵبژێرە", "warning");
      return;
    }
    var valNum = parseFloat(val("bpSpecValue"));
    if (isNaN(valNum) || valNum === 0) {
      note("ئاگاداری", "تکایە بڕ یان ڕێژەی گۆڕینی نرخ بنووسە", "warning");
      return;
    }
    if (!serverOnline()) {
      note("سێرڤەر ئۆفلاینە", "بۆ گۆڕینی نرخ پێویستە سێرڤەر کار بکات", "error");
      return;
    }

    var round = !!(el("bpSpecOptRound") && el("bpSpecOptRound").checked);
    var optPack = !!(el("bpSpecOptPack") && el("bpSpecOptPack").checked);
    var optWholesale = !!(el("bpSpecOptWholesale") && el("bpSpecOptWholesale").checked);
    var optCost = !!(el("bpSpecOptCost") && el("bpSpecOptCost").checked);

    var changes = [];
    var sample = [];

    (DB.products || []).forEach(function (p) {
      if (!bpSelectedProducts.has(p.id)) return;
      var oldPrice = parseFloat(p.price) || 0;
      var newPrice = bpCalcSpecificPrice(p, valNum, round);
      if (newPrice <= 0) return;

      var packQty = parseFloat(p.packQty) || 1;
      var before = {
        price: oldPrice,
        cost: parseFloat(p.cost) || 0,
        wholesalePrice: parseFloat(p.wholesalePrice) || 0,
        packPrice: parseFloat(p.packPrice) || 0,
        packCost: parseFloat(p.packCost) || 0
      };
      var after = Object.assign({}, before, { price: newPrice });

      if (optPack && before.packPrice > 0) {
        if (bpSpecificMode === "fixed") {
          after.packPrice = newPrice * packQty;
        } else if (bpSpecificMode === "percent") {
          after.packPrice = round ? Math.round((before.packPrice * (1 + valNum / 100)) / STEP) * STEP : Math.round(before.packPrice * (1 + valNum / 100));
        } else {
          after.packPrice = (round && (before.packPrice + valNum * packQty) >= STEP) ? Math.round((before.packPrice + valNum * packQty) / STEP) * STEP : Math.round(before.packPrice + valNum * packQty);
        }
      }

      if (optWholesale && before.wholesalePrice > 0) {
        if (bpSpecificMode === "fixed") {
          after.wholesalePrice = newPrice;
        } else if (bpSpecificMode === "percent") {
          after.wholesalePrice = round ? Math.round((before.wholesalePrice * (1 + valNum / 100)) / STEP) * STEP : Math.round(before.wholesalePrice * (1 + valNum / 100));
        } else {
          after.wholesalePrice = (round && (before.wholesalePrice + valNum) >= STEP) ? Math.round((before.wholesalePrice + valNum) / STEP) * STEP : Math.round(before.wholesalePrice + valNum);
        }
      }

      if (optCost) {
        if (before.cost > 0) {
          if (bpSpecificMode === "percent") {
            after.cost = Math.max(0, Math.round(before.cost * (1 + valNum / 100)));
          } else if (bpSpecificMode === "amount") {
            after.cost = Math.max(0, Math.round(before.cost + valNum));
          }
        }
        if (before.packCost > 0) {
          if (bpSpecificMode === "percent") {
            after.packCost = Math.max(0, Math.round(before.packCost * (1 + valNum / 100)));
          } else if (bpSpecificMode === "amount") {
            after.packCost = Math.max(0, Math.round(before.packCost + valNum * packQty));
          }
        }
      }

      var changed = Object.keys(before).some(function (k) { return Math.abs(after[k] - before[k]) > 0.0001; });
      if (!changed) return;

      changes.push(Object.assign({ id: p.id, name: p.name }, after));
      if (sample.length < 3) sample.push(p.name + " (" + fmt(oldPrice) + " ← " + fmt(newPrice) + ")");
    });

    if (!changes.length) {
      note("ئاگاداری", "هیچ گۆڕانکارییەک نییە بۆ بەرهەمە هەڵبژێردراوەکان", "warning");
      return;
    }

    var label = bpSpecificMode === "fixed" ? ("دانانی نرخی جێگیر " + valNum + " بۆ " + changes.length + " بەرهەم") : (signed(valNum) + (bpSpecificMode === "percent" ? "%" : " د.ع") + " بۆ " + changes.length + " بەرهەمی دیاریکراو");
    if (!confirm("نرخی " + changes.length + " بەرهەمی دیاریکراو دەگۆڕدرێت:\n" + label + "\n\nدڵنیایت؟ (دەتوانیت دواتر بیگەڕێنیتەوە)")) return;

    postJson("/api/products/price-batch", {
      changes: changes.map(function (c) {
        return {
          id: c.id,
          price: c.price,
          cost: c.cost,
          wholesalePrice: c.wholesalePrice,
          packPrice: c.packPrice,
          packCost: c.packCost
        };
      }),
      label: label,
      mode: bpSpecificMode,
      summary: [{ cat: "specific", catName: "بەرهەمی دیاریکراو", value: valNum, count: changes.length }],
      operator: operatorName()
    }).then(function (data) {
      if (!data || !data.success) throw new Error((data && data.error) || "هەڵە");
      changes.forEach(function (c) {
        var p = DB.products.find(function (x) { return x.id === c.id; });
        if (p) {
          p.price = c.price;
          p.cost = c.cost;
          p.wholesalePrice = c.wholesalePrice;
          p.packPrice = c.packPrice;
          p.packCost = c.packCost;
        }
      });
      refreshViews();
      bpSelectedProducts.clear();
      if (el("bpSpecValue")) el("bpSpecValue").value = "";
      bpRenderSpecificProds();
      bpLoadHistory();
      note("سەرکەوتوو", "نرخی " + (data.updated || changes.length) + " بەرهەم بە سەرکەوتوویی گۆڕدرا", "success");
    }).catch(function (err) {
      note("هەڵە", "نرخەکان نەگۆڕدران: " + err.message, "error");
    });
  }

  function openPriceForProduct(id) {
    openBulkPrice();
    bpSetTargetTab("products");
    bpSelectedProducts.clear();
    if (id) {
      bpSelectedProducts.add(id);
      var p = (DB.products || []).find(function (x) { return x.id === id; });
      if (p && el("bpProdSearch")) el("bpProdSearch").value = p.name;
    }
    bpRenderSpecificProds();
  }

  function bpApply() {
    if (bpTargetTab === "products") {
      bpApplySpecific();
      return;
    }
    var res = bpCompute();
    if (!res.changes.length) { note("ئاگاداری", "هیچ گۆڕانکارییەک نییە بۆ جێبەجێکردن", "warning"); return; }
    if (!serverOnline()) {
      note("سێرڤەر ئۆفلاینە", "بۆ گۆڕینی نرخ بە کۆمەڵ پێویستە سێرڤەر کار بکات (تاکو نرخەکان لە هەموو کاشیرەکان یەک بن)", "error");
      return;
    }
    var names = {};
    bpCategories().forEach(function (c) { names[c.id] = c.name; });
    var unit = bpMode === "percent" ? "%" : "";
    var summary = Object.keys(res.byCat).map(function (k) {
      return { cat: k, catName: names[k] || k, value: res.byCat[k].value, count: res.byCat[k].count };
    });
    var label = summary.map(function (s) { return s.catName + " " + signed(s.value) + unit; }).join(" ، ");
    if (!confirm("نرخی " + res.changes.length + " بەرهەم دەگۆڕدرێت:\n" + label + "\n\nدڵنیایت؟ (دەتوانیت دواتر بیگەڕێنیتەوە)")) return;

    postJson("/api/products/price-batch", {
      changes: res.changes.map(function (c) { return Object.assign({ id: c.id }, c.new); }),
      label: label, mode: bpMode, summary: summary, operator: operatorName()
    }).then(function (data) {
      if (!data || !data.success) throw new Error((data && data.error) || "هەڵە");
      res.changes.forEach(function (c) {
        var p = DB.products.find(function (x) { return x.id === c.id; });
        if (p) Object.assign(p, c.new);
      });
      refreshViews();
      el("bpTbody").querySelectorAll(".bp-input").forEach(function (i) { i.value = ""; });
      bpPreview();
      bpLoadHistory();
      note("سەرکەوتوو", "نرخی " + data.updated + " بەرهەم گۆڕدرا", "success");
    }).catch(function (err) {
      note("هەڵە", "نرخەکان نەگۆڕدران: " + err.message, "error");
    });
  }

  function bpLoadHistory() {
    var box = el("bpHistory");
    if (!box) return;
    if (!serverOnline()) { box.textContent = "سێرڤەر ئۆفلاینە"; return; }
    fetch(apiBase() + "/api/products/price-batches").then(function (r) { return r.json(); }).then(function (list) {
      if (!Array.isArray(list) || !list.length) { box.textContent = "هێشتا هیچ گۆڕانکارییەک نەکراوە"; return; }
      box.innerHTML = '<table class="pt-table"><tbody>' + list.map(function (b) {
        var when = (typeof formatSaleDateTime === "function") ? formatSaleDateTime(b.createdAt, true) : "";
        var action = b.reverted
          ? '<span class="pt-muted">گەڕێنرایەوە</span>'
          : '<button type="button" class="btn btn-sm btn-outline" onclick="PriceTools.bpUndo(\'' + ptEsc(b.id) + '\')"><i class="fas fa-undo"></i> گەڕاندنەوە</button>';
        return '<tr><td style="white-space:nowrap;">' + ptEsc(when) + '</td><td>' + ptEsc(b.label || "-") + '</td><td>' + b.productCount + ' بەرهەم</td><td class="pt-muted">' + ptEsc(b.operator || "") + '</td><td>' + action + '</td></tr>';
      }).join("") + '</tbody></table>';
    }).catch(function () { box.textContent = "نەتوانرا مێژوو بخوێنرێتەوە"; });
  }

  function bpUndo(id) {
    if (!serverOnline()) { note("سێرڤەر ئۆفلاینە", "بۆ گەڕاندنەوە پێویستە سێرڤەر کار بکات", "error"); return; }
    if (!confirm("ئەم گۆڕانکارییەی نرخ بگەڕێنرێتەوە بۆ نرخی پێشوو؟\n(ئەو بەرهەمانەی دواتر بە دەست نرخیان گۆڕدراوە دەستکاری ناکرێن)")) return;
    postJson("/api/products/price-batch/" + encodeURIComponent(id) + "/undo", {}).then(function (data) {
      if (!data || !data.success) throw new Error((data && data.error) || "هەڵە");
      return reloadProductsFromServer().then(function () {
        bpLoadHistory();
        note("سەرکەوتوو", data.restored + " بەرهەم گەڕێنرایەوە" + (data.skipped ? " (" + data.skipped + " تێپەڕێنرا چونکە دواتر گۆڕدرابوو)" : ""), "success");
      });
    }).catch(function (err) {
      note("هەڵە", "گەڕاندنەوە سەرکەوتوو نەبوو: " + err.message, "error");
    });
  }

  function init() { startWatcher(); }
  if (typeof document !== "undefined" && document.addEventListener) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  }

  return {
    // product form
    loadOfferFields: loadOfferFields,
    readOfferFields: readOfferFields,
    updateOfferBadge: updateOfferBadge,
    offerQuickDays: offerQuickDays,
    setOfferQuickDays: offerQuickDays,
    clearOfferFields: clearOfferFields,
    // offers manager
    openOffers: openOffers,
    closeOffers: closeOffers,
    omSetFilter: omSetFilter,
    omEdit: omEdit,
    omStop: omStop,
    omExtend: omExtend,
    omPreview: omPreview,
    omApplyCategory: omApplyCategory,
    omSetTargetTab: omSetTargetTab,
    omSetProdType: omSetProdType,
    omSetProdQuick: omSetProdQuick,
    omQuickDaysProd: omQuickDaysProd,
    omToggleProd: omToggleProd,
    omToggleSelectAllProds: omToggleSelectAllProds,
    omRenderSpecificProds: omRenderSpecificProds,
    omApplySpecific: omApplySpecific,
    openOfferForProduct: openOfferForProduct,
    repriceCartsForOffers: repriceCartsForOffers,
    // bulk price
    openBulkPrice: openBulkPrice,
    closeBulkPrice: closeBulkPrice,
    bpSetMode: bpSetMode,
    bpQuick: bpQuick,
    bpFillAll: bpFillAll,
    bpPreview: bpPreview,
    bpApply: bpApply,
    bpUndo: bpUndo,
    bpSetTargetTab: bpSetTargetTab,
    bpSetSpecificMode: bpSetSpecificMode,
    bpSetSpecificQuick: bpSetSpecificQuick,
    bpToggleProd: bpToggleProd,
    bpToggleSelectAllProds: bpToggleSelectAllProds,
    bpRenderSpecificProds: bpRenderSpecificProds,
    bpApplySpecific: bpApplySpecific,
    openPriceForProduct: openPriceForProduct,
    computePriceChanges: computePriceChanges,
    _watchTick: watchTick
  };
})();

if (typeof window !== "undefined") window.PriceTools = PriceTools;
