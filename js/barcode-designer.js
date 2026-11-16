/**
 * Barcode / QR label designer — per-element font, size, color, drag.
 * Kurdish, Arabic and English fonts. Styles persist in DB.settings.barcodeDesign.
 */
(function (global) {
  "use strict";

  var FONTS = [
    { group: "کوردی و عەرەبی", items: [
      { name: "Tahoma", stack: 'Tahoma, "Segoe UI", sans-serif' },
      { name: "Arial", stack: "Arial, Helvetica, sans-serif" },
      { name: "Segoe UI", stack: '"Segoe UI", Tahoma, sans-serif' },
      { name: "Calibri", stack: 'Calibri, "Segoe UI", sans-serif' },
      { name: "Traditional Arabic", stack: '"Traditional Arabic", Tahoma, serif' },
      { name: "Simplified Arabic", stack: '"Simplified Arabic", Tahoma, sans-serif' },
      { name: "Arabic Typesetting", stack: '"Arabic Typesetting", "Traditional Arabic", serif' },
      { name: "Aldhabi", stack: 'Aldhabi, "Traditional Arabic", serif' },
      { name: "Microsoft Uighur", stack: '"Microsoft Uighur", Tahoma, sans-serif' },
      { name: "Cairo", stack: '"Cairo", Tahoma, sans-serif' },
      { name: "Tajawal", stack: '"Tajawal", Tahoma, sans-serif' },
      { name: "Almarai", stack: '"Almarai", Tahoma, sans-serif' },
      { name: "Amiri", stack: '"Amiri", "Traditional Arabic", serif' },
      { name: "Noto Naskh Arabic", stack: '"Noto Naskh Arabic", "Traditional Arabic", serif' },
      { name: "Noto Sans Arabic", stack: '"Noto Sans Arabic", Tahoma, sans-serif' },
      { name: "Noto Kufi Arabic", stack: '"Noto Kufi Arabic", Tahoma, sans-serif' },
      { name: "IBM Plex Sans Arabic", stack: '"IBM Plex Sans Arabic", Tahoma, sans-serif' },
      { name: "Changa", stack: '"Changa", Tahoma, sans-serif' },
      { name: "Reem Kufi", stack: '"Reem Kufi", Tahoma, sans-serif' },
      { name: "El Messiri", stack: '"El Messiri", Tahoma, sans-serif' },
      { name: "Lateef", stack: '"Lateef", "Traditional Arabic", serif' },
      { name: "Harmattan", stack: '"Harmattan", Tahoma, sans-serif' },
      { name: "Markazi Text", stack: '"Markazi Text", "Traditional Arabic", serif' },
      { name: "Readex Pro", stack: '"Readex Pro", Tahoma, sans-serif' },
      { name: "Scheherazade New", stack: '"Scheherazade New", "Traditional Arabic", serif' }
    ]},
    { group: "English", items: [
      { name: "Times New Roman", stack: '"Times New Roman", Times, serif' },
      { name: "Georgia", stack: "Georgia, serif" },
      { name: "Verdana", stack: "Verdana, Geneva, sans-serif" },
      { name: "Trebuchet MS", stack: '"Trebuchet MS", sans-serif' },
      { name: "Impact", stack: "Impact, Haettenschweiler, sans-serif" },
      { name: "Arial Black", stack: '"Arial Black", Arial, sans-serif' },
      { name: "Courier New", stack: '"Courier New", Courier, monospace' },
      { name: "Consolas", stack: 'Consolas, "Courier New", monospace' },
      { name: "Roboto", stack: "Roboto, Arial, sans-serif" },
      { name: "Montserrat", stack: "Montserrat, Arial, sans-serif" },
      { name: "Poppins", stack: "Poppins, Arial, sans-serif" },
      { name: "Oswald", stack: "Oswald, Arial, sans-serif" },
      { name: "Playfair Display", stack: '"Playfair Display", Georgia, serif' },
      { name: "Anton", stack: "Anton, Impact, sans-serif" }
    ]}
  ];

  var COLOR_PRESETS = [
    "#000000", "#111827", "#b91c1c", "#c2410c", "#a16207",
    "#15803d", "#0f766e", "#1d4ed8", "#6d28d9", "#be185d", "#ffffff"
  ];

  var GOOGLE_FONTS =
    "https://fonts.googleapis.com/css2?family=Almarai:wght@400;700;800&family=Amiri:wght@400;700&family=Anton&family=Cairo:wght@400;600;700;800;900&family=Changa:wght@400;600;700;800&family=El+Messiri:wght@400;600;700&family=Harmattan:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Lateef&family=Markazi+Text:wght@400;600;700&family=Montserrat:wght@400;700;800&family=Noto+Kufi+Arabic:wght@400;600;700&family=Noto+Naskh+Arabic:wght@400;600;700&family=Noto+Sans+Arabic:wght@400;600;700;800;900&family=Oswald:wght@400;600;700&family=Playfair+Display:wght@700;900&family=Poppins:wght@400;600;700;800&family=Readex+Pro:wght@400;600;700&family=Reem+Kufi:wght@400;600;700&family=Roboto:wght@400;700;900&family=Scheherazade+New:wght@400;700&family=Tajawal:wght@400;700;800;900&display=swap";

  var DESIGN = {
    canvas: { w: 80, h: 54, bg: "#ffffff" },
    elements: [],
    saved: [],
    selectedId: "name",
    layoutVer: 2
  };

  var lastProduct = null;
  var lastSettings = null;
  var persistTimer = null;
  var drag = null;
  var booted = false;
  var uiLock = false;

  function defaultElements() {
    var usd = el("usd", "text", "usd", "نرخ ($)", 2, 28, 76, 6, 11, "800", "#111111");
    usd.visible = false;
    var exp = el("expiry", "text", "expiry", "بەسەرچوون", 2, 50, 76, 4, 7, "700", "#444444");
    exp.visible = false;
    return [
      el("store", "text", "store", "ناوی مارکێت", 2, 1.5, 76, 6, 9, "700", "#333333"),
      el("name", "text", "name", "ناوی کاڵا", 2, 8.5, 76, 9, 15, "900", "#000000"),
      el("price", "text", "price", "نرخ (د.ع)", 2, 18.5, 76, 9, 18, "900", "#000000"),
      usd,
      el("barcode", "barcode", "barcode", "بارکۆد / QR", 5, 29, 70, 14, 8, "700", "#000000"),
      el("digits", "text", "digits", "ژمارەی بارکۆد", 2, 44.5, 76, 5, 8, "700", "#222222"),
      exp
    ];
  }

  function tidyKnownLayout(elements) {
    var map = {
      store: { x: 2, y: 1.5, w: 76, h: 6 },
      name: { x: 2, y: 8.5, w: 76, h: 9 },
      price: { x: 2, y: 18.5, w: 76, h: 9 },
      usd: { x: 2, y: 28, w: 76, h: 6, visible: false },
      barcode: { x: 5, y: 29, w: 70, h: 14 },
      digits: { x: 2, y: 44.5, w: 76, h: 5 },
      expiry: { x: 2, y: 50, w: 76, h: 4, visible: false }
    };
    (elements || []).forEach(function (item) {
      var t = map[item.bind];
      if (!t) return;
      item.x = t.x; item.y = t.y; item.w = t.w; item.h = t.h;
      if (t.visible === false) item.visible = false;
    });
  }

  function el(id, kind, bind, label, x, y, w, h, size, weight, color) {
    return {
      id: id,
      kind: kind,
      bind: bind,
      codeType: kind === "barcode" ? "barcode" : "",
      label: label,
      x: x, y: y, w: w, h: h,
      font: 'Tahoma, "Segoe UI", sans-serif',
      size: size,
      weight: weight,
      italic: false,
      color: color,
      align: "center",
      visible: true,
      customText: ""
    };
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatMoney(amount) {
    return Number(amount || 0).toLocaleString("en-US");
  }

  function storeName(settings) {
    if (typeof getStoreName === "function") return getStoreName();
    var n = settings && settings.marketName ? String(settings.marketName) : "";
    if (!n || /سام\s*مارکێت|sam\s*market/i.test(n)) return "مارکێت";
    return n;
  }

  function productCode(product) {
    return String((product && (product.barcode || product.id)) || "0000");
  }

  function elementText(item, product, settings) {
    product = product || {};
    var rate = (settings && settings.exchangeRate) || 1500;
    if (!rate) rate = 1500;
    switch (item.bind) {
      case "store": return storeName(settings);
      case "name": return product.name || "کاڵا";
      case "price": return formatMoney(product.price) + " د.ع";
      case "usd": return "$" + ((Number(product.price) || 0) / rate).toFixed(2);
      case "digits": return productCode(product);
      case "expiry": return product.expiryDate ? ("Exp: " + product.expiryDate) : "";
      case "custom": return item.customText || "دەقی خۆت";
      default: return productCode(product);
    }
  }

  function ensureFonts() {
    if (document.getElementById("bcDesignFonts")) return;
    var link = document.createElement("link");
    link.id = "bcDesignFonts";
    link.rel = "stylesheet";
    link.href = GOOGLE_FONTS;
    document.head.appendChild(link);
  }

  function hydrate() {
    var saved = null;
    try {
      saved = window.DB && DB.settings && DB.settings.barcodeDesign;
    } catch (e) { saved = null; }
    if (saved && saved.canvas && Array.isArray(saved.elements) && saved.elements.length) {
      DESIGN.canvas = Object.assign({ w: 80, h: 54, bg: "#ffffff" }, saved.canvas);
      DESIGN.elements = saved.elements.map(normalizeEl);
      DESIGN.saved = Array.isArray(saved.saved) ? saved.saved : [];
      if (!saved.layoutVer || saved.layoutVer < 2) {
        tidyKnownLayout(DESIGN.elements);
        DESIGN.layoutVer = 2;
      } else {
        DESIGN.layoutVer = saved.layoutVer;
      }
    } else {
      DESIGN.canvas = { w: 80, h: 54, bg: "#ffffff" };
      DESIGN.elements = defaultElements();
      DESIGN.saved = (saved && saved.saved) || [];
      DESIGN.layoutVer = 2;
    }
  }

  function normalizeEl(raw) {
    var base = el("x", "text", "custom", "دەق", 2, 2, 76, 6, 12, "700", "#000000");
    var out = Object.assign(base, raw || {});
    out.x = num(out.x, 2); out.y = num(out.y, 2);
    out.w = num(out.w, 40); out.h = num(out.h, 6);
    out.size = num(out.size, 12);
    out.visible = out.visible !== false;
    out.italic = !!out.italic;
    if (!out.font) out.font = base.font;
    if (!out.color) out.color = "#000000";
    if (!out.align) out.align = "center";
    if (!out.weight) out.weight = "700";
    if (out.kind === "barcode" && !out.codeType) out.codeType = "barcode";
    return out;
  }

  function num(v, d) {
    var n = parseFloat(v);
    return isNaN(n) ? d : n;
  }

  function persist(now) {
    if (!window.DB) return;
    DB.settings = DB.settings || {};
    DB.settings.barcodeDesign = {
      canvas: DESIGN.canvas,
      elements: DESIGN.elements,
      saved: DESIGN.saved,
      layoutVer: DESIGN.layoutVer || 2
    };
    var flush = function () {
      persistTimer = null;
      try {
        if (window.DataStore && DataStore.saveSettings) DataStore.saveSettings();
        else if (window.SqliteDB && SqliteDB.setSetting) SqliteDB.setSetting("app_settings", DB.settings);
      } catch (e) {}
    };
    if (now) {
      if (persistTimer) clearTimeout(persistTimer);
      flush();
      return;
    }
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(flush, 450);
  }

  function findEl(id) {
    for (var i = 0; i < DESIGN.elements.length; i++) {
      if (DESIGN.elements[i].id === id) return DESIGN.elements[i];
    }
    return null;
  }

  function qrSvg(code, color, sizePx) {
    var qrLib = typeof QRCode !== "undefined" ? QRCode : null;
    var fill = color || "#000000";
    if (qrLib && typeof qrLib.toString === "function") {
      var raw = "";
      try {
        qrLib.toString(code, {
          type: "svg",
          margin: 1,
          width: sizePx || 160,
          errorCorrectionLevel: "M",
          color: { dark: fill, light: (DESIGN.canvas && DESIGN.canvas.bg) || "#ffffff" }
        }, function (err, svg) {
          if (!err && svg) raw = svg;
        });
      } catch (e) { raw = ""; }
      if (raw) {
        return raw.replace("<svg ", '<svg class="bc-qr-svg" style="width:100%;height:100%;display:block;" ');
      }
    }
    return '<img class="bc-qr-svg" alt="QR" src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=1&color=' +
      encodeURIComponent(String(fill).replace("#", "")) + "&data=" + encodeURIComponent(code) +
      '" style="width:100%;height:100%;display:block;object-fit:contain;">';
  }

  function barcodeSvg(code, item) {
    if (typeof BarcodeGen === "undefined") return "";
    var hPx = Math.max(18, num(item.h, 16) * 3.2);
    return BarcodeGen.autoBarcodeSvg(code, {
      height: hPx,
      barWidth: 1.5,
      quietZone: 4,
      showText: false,
      barColor: item.color || "#000000",
      bgColor: (DESIGN.canvas && DESIGN.canvas.bg) || "#ffffff"
    });
  }

  function elementInnerHtml(item, product, settings, forPrint) {
    if (item.kind === "barcode") {
      var code = productCode(product);
      var graphic = item.codeType === "qr"
        ? qrSvg(code, item.color, 180)
        : barcodeSvg(code, item);
      return '<div class="bc-el-graphic">' + graphic + "</div>";
    }
    var text = elementText(item, product, settings);
    if (item.bind === "expiry" && !text) return "";
    return '<div class="bc-el-text" dir="auto">' + escapeHtml(text) + "</div>";
  }

  function elementBoxStyle(item) {
    var wPct = (num(item.w, 40) / DESIGN.canvas.w) * 100;
    if (wPct < 4) wPct = 4;
    if (wPct > 100) wPct = 100;
    var align = item.align || "center";
    var justify = align === "right" ? "flex-end" : (align === "left" ? "flex-start" : "center");
    var hStyle = item.kind === "barcode"
      ? ("height:" + num(item.h, 16) + "mm;")
      : ("min-height:" + num(item.h, 4) + "mm;");
    return "left:" + num(item.x, 0) + "mm;top:" + num(item.y, 0) + "mm;" +
      "width:" + wPct.toFixed(2) + "%;" + hStyle +
      "font-family:" + (item.font || "Tahoma, sans-serif") + ";" +
      "font-size:" + num(item.size, 12) + "pt;font-weight:" + (item.weight || "700") + ";" +
      "font-style:" + (item.italic ? "italic" : "normal") + ";" +
      "color:" + (item.color || "#000") + ";text-align:" + align + ";" +
      "display:" + (item.visible === false ? "none" : "flex") + ";" +
      "align-items:center;justify-content:" + justify + ";";
  }

  function renderCanvasHtml(product, settings, forPrint) {
    var c = DESIGN.canvas;
    var cls = "bc-design-canvas" + (forPrint ? " is-print" : "");
    var canvasStyle = "position:relative;width:" + c.w + "mm;height:" + c.h + "mm;background:" + (c.bg || "#fff") + ";overflow:hidden;box-sizing:border-box;";
    var html = '<div class="' + cls + '" dir="ltr" style="' + canvasStyle + '">';
    DESIGN.elements.forEach(function (item) {
      if (item.visible === false) return;
      var onCls = (DESIGN.selectedId === item.id && !forPrint) ? " is-on" : "";
      html += '<div class="bc-el bc-el-' + item.kind + onCls + '" data-id="' + escapeHtml(item.id) + '" data-bind="' + escapeHtml(item.bind || "") + '" style="' + elementBoxStyle(item) + '">';
      html += elementInnerHtml(item, product, settings, forPrint);
      html += "</div>";
    });
    html += "</div>";
    return html;
  }

  function previewScale() {
    var wrap = document.getElementById("barcodePreview");
    var canvas = wrap && wrap.querySelector(".bc-design-canvas");
    if (!canvas) return 3.4;
    var rect = canvas.getBoundingClientRect();
    return rect.width / DESIGN.canvas.w;
  }

  function mountPreview(container, product, settings) {
    if (!container) return;
    ensureFonts();
    lastProduct = product;
    lastSettings = settings;
    container.style.background = "transparent";
    container.style.boxShadow = "none";
    container.style.padding = "0";
    container.style.borderRadius = "0";
    container.setAttribute("dir", "ltr");
    container.style.direction = "ltr";
    var existing = container.querySelector(".bc-design-canvas");
    if (existing) {
      DESIGN.elements.forEach(function (item) {
        applyItemVisual(item, item.kind === "barcode");
      });
      refreshChips();
      updateBadge();
      return;
    }
    container.innerHTML = renderCanvasHtml(product, settings, false);
    bindCanvas(container.querySelector(".bc-design-canvas"));
    refreshChips();
    updateBadge();
  }

  function bindCanvas(canvas) {
    if (!canvas) return;
    canvas.addEventListener("pointerdown", onCanvasPointerDown);
    canvas.addEventListener("dblclick", onCanvasDblClick);
  }

  function pickElNode(e) {
    var stack = [];
    try {
      if (document.elementsFromPoint) stack = document.elementsFromPoint(e.clientX, e.clientY) || [];
    } catch (err) { stack = []; }
    if (!stack.length && e.target) stack = [e.target];
    var nodes = [];
    for (var i = 0; i < stack.length; i++) {
      var n = stack[i];
      var el = n && n.closest ? n.closest(".bc-el") : null;
      if (el && nodes.indexOf(el) < 0) nodes.push(el);
    }
    if (!nodes.length) return null;
    nodes.sort(function (a, b) {
      var ra = a.getBoundingClientRect();
      var rb = b.getBoundingClientRect();
      return (ra.width * ra.height) - (rb.width * rb.height);
    });
    return nodes[0];
  }

  function selectElement(id) {
    var same = DESIGN.selectedId === id;
    DESIGN.selectedId = id || null;
    syncSelectionClass();
    refreshChips();
    if (!same) fillInspector();
  }

  function onCanvasPointerDown(e) {
    var handle = e.target.closest ? e.target.closest(".bc-handle") : null;
    var node = handle ? (handle.closest ? handle.closest(".bc-el") : null) : pickElNode(e);
    if (!node) return;
    selectElement(node.getAttribute("data-id"));
    var item = findEl(DESIGN.selectedId);
    if (!item) return;
    var scale = previewScale();
    drag = {
      id: item.id,
      resize: !!handle,
      startX: e.clientX,
      startY: e.clientY,
      origX: item.x,
      origY: item.y,
      origW: item.w,
      origH: item.h,
      origSize: item.size,
      scale: scale,
      moved: false,
      pointerId: e.pointerId,
      canvas: e.currentTarget
    };
    document.addEventListener("pointermove", onDragMove);
    document.addEventListener("pointerup", onDragUp);
    document.addEventListener("pointercancel", onDragUp);
  }

  function onDragMove(e) {
    if (!drag) return;
    var dxMm = (e.clientX - drag.startX) / drag.scale;
    var dyMm = (e.clientY - drag.startY) / drag.scale;
    if (!drag.moved && Math.abs(dxMm) < 1.8 && Math.abs(dyMm) < 1.8) return;
    if (!drag.moved) {
      drag.moved = true;
      try {
        if (drag.canvas && drag.canvas.setPointerCapture) drag.canvas.setPointerCapture(drag.pointerId);
      } catch (cap) {}
      if (e.preventDefault) e.preventDefault();
    }
    drag.moved = true;
    var item = findEl(drag.id);
    if (!item) return;
    if (drag.resize) {
      item.w = clamp(drag.origW + dxMm, 8, DESIGN.canvas.w - item.x);
      item.h = clamp(drag.origH + dyMm, 3, DESIGN.canvas.h - item.y);
      if (item.kind === "text") {
        item.size = clamp(Math.round((item.h / drag.origH) * drag.origSize * 10) / 10, 4, 120);
      }
    } else {
      item.x = clamp(drag.origX + dxMm, 0, DESIGN.canvas.w - 4);
      item.y = clamp(drag.origY + dyMm, 0, DESIGN.canvas.h - 3);
    }
    applyItemBox(item);
    if (drag.resize) fillInspector();
  }

  function onDragUp(e) {
    document.removeEventListener("pointermove", onDragMove);
    document.removeEventListener("pointerup", onDragUp);
    document.removeEventListener("pointercancel", onDragUp);
    if (drag && drag.canvas && e) {
      try {
        if (drag.canvas.releasePointerCapture) drag.canvas.releasePointerCapture(e.pointerId);
      } catch (rel) {}
    }
    if (drag && drag.moved) persist();
    drag = null;
  }

  function onCanvasDblClick(e) {
    var node = e.target.closest ? e.target.closest(".bc-el") : null;
    if (!node) return;
    var item = findEl(node.getAttribute("data-id"));
    if (!item || item.bind !== "custom") return;
    var next = prompt("دەقی لەزگە:", item.customText || "");
    if (next == null) return;
    item.customText = next;
    persist();
    remount();
  }

  function applyItemBox(item) {
    var node = document.querySelector('#barcodePreview .bc-el[data-id="' + item.id + '"]');
    if (!node) return;
    node.style.cssText = elementBoxStyle(item);
  }

  function syncSelectionClass() {
    var nodes = document.querySelectorAll("#barcodePreview .bc-el");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle("is-on", nodes[i].getAttribute("data-id") === DESIGN.selectedId);
    }
    var chips = document.querySelectorAll("#bcDockPicks .bc-dock-btn");
    for (var c = 0; c < chips.length; c++) {
      chips[c].classList.toggle("is-on", chips[c].getAttribute("data-id") === DESIGN.selectedId);
    }
  }

  function clamp(n, a, b) {
    if (n < a) return a;
    if (n > b) return b;
    return Math.round(n * 10) / 10;
  }

  function remount() {
    var box = document.getElementById("barcodePreview");
    if (box) box.innerHTML = "";
    if (box && lastProduct) mountPreview(box, lastProduct, lastSettings || (window.DB && DB.settings) || {});
  }

  function updateBadge() {
    var badge = document.getElementById("barcodePreviewSizeBadge");
    if (badge) badge.textContent = DESIGN.canvas.w + "mm × " + DESIGN.canvas.h + "mm — ستایلی خۆت";
  }

  function fontOptionsHtml(selected) {
    var html = "";
    FONTS.forEach(function (g) {
      html += '<optgroup label="' + escapeHtml(g.group) + '">';
      g.items.forEach(function (f) {
        html += '<option value="' + escapeHtml(f.stack) + '"' + (f.stack === selected ? " selected" : "") +
          ' style="font-family:' + escapeHtml(f.stack) + ';">' + escapeHtml(f.name) + "</option>";
      });
      html += "</optgroup>";
    });
    return html;
  }

  function buildPanel() {
    var old = document.getElementById("barcodeDesignerPanel");
    if (old) old.style.display = "none";
    var font = document.getElementById("bcDockFont");
    if (font && !font.options.length) font.innerHTML = fontOptionsHtml("");
    var sw = document.getElementById("bcDockSwatches");
    if (sw && !sw.childNodes.length) {
      sw.innerHTML = COLOR_PRESETS.map(function (c) {
        return '<button type="button" class="bc-swatch" data-color="' + c + '" style="background:' + c + ';"></button>';
      }).join("");
    }
    bindDock();
    refreshChips();
    fillInspector();
  }

  function bindDock() {
    if (window.__BC_DOCK_BOUND) return;
    window.__BC_DOCK_BOUND = true;
    var picks = document.getElementById("bcDockPicks");
    if (picks) picks.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-id]") : null;
      if (btn) selectElement(btn.getAttribute("data-id"));
    });
    function patchSel(mut, rebuild) {
      if (uiLock) return;
      var item = findEl(DESIGN.selectedId);
      if (!item) return;
      mut(item);
      persist();
      applyItemVisual(item, rebuild);
    }
    var font = document.getElementById("bcDockFont");
    if (font) font.addEventListener("change", function () {
      if (uiLock) return;
      var v = this.value;
      patchSel(function (item) { item.font = v; });
    });
    var size = document.getElementById("bcDockSize");
    if (size) size.addEventListener("input", function () {
      if (uiLock) return;
      var v = clamp(parseFloat(this.value) || 16, 8, 48);
      var lbl = document.getElementById("bcDockSizeLbl");
      if (lbl) lbl.textContent = v;
      patchSel(function (item) { item.size = v; });
    });
    var color = document.getElementById("bcDockColor");
    if (color) color.addEventListener("input", function () {
      if (uiLock) return;
      var v = this.value;
      patchSel(function (item) { item.color = v; }, itemNeedsRebuild());
    });
    var sw = document.getElementById("bcDockSwatches");
    if (sw) sw.addEventListener("click", function (e) {
      if (uiLock) return;
      var b = e.target.closest ? e.target.closest(".bc-swatch") : null;
      if (!b) return;
      var v = b.getAttribute("data-color");
      var col = document.getElementById("bcDockColor");
      uiLock = true;
      if (col) col.value = v;
      uiLock = false;
      patchSel(function (item) { item.color = v; }, itemNeedsRebuild());
    });
    var usd = document.getElementById("bcDockUsd");
    if (usd) usd.addEventListener("change", function () {
      if (uiLock) return;
      var item = DESIGN.elements.filter(function (x) { return x.bind === "usd"; })[0];
      if (!item) return;
      item.visible = !!usd.checked;
      persist();
      remount();
    });
    var qr = document.getElementById("bcDockQr");
    if (qr) qr.addEventListener("change", function () {
      if (uiLock) return;
      var item = DESIGN.elements.filter(function (x) { return x.bind === "barcode"; })[0];
      if (!item) return;
      item.codeType = qr.checked ? "qr" : "barcode";
      persist();
      remount();
    });
  }

  function itemNeedsRebuild() {
    var item = findEl(DESIGN.selectedId);
    return !!(item && item.kind === "barcode");
  }

  function applyItemVisual(item, rebuild) {
    if (!item) return;
    applyItemBox(item);
    var wrap = document.querySelector('#barcodePreview .bc-el[data-id="' + item.id + '"]');
    if (!wrap) return;
    if (rebuild || item.kind === "barcode") {
      wrap.innerHTML = elementInnerHtml(item, lastProduct, lastSettings, false);
      return;
    }
    var node = wrap.querySelector(".bc-el-text");
    if (node) node.textContent = elementText(item, lastProduct, lastSettings);
  }

  function refreshChips() {
    var box = document.getElementById("bcDockPicks");
    if (!box) return;
    var order = ["store", "name", "price"];
    box.innerHTML = order.map(function (bind) {
      var item = null;
      DESIGN.elements.forEach(function (x) { if (x.bind === bind) item = x; });
      if (!item) return "";
      return '<button type="button" class="bc-dock-btn' + (item.id === DESIGN.selectedId ? " is-on" : "") + '" data-id="' + escapeHtml(item.id) + '">' +
        escapeHtml(item.label) + "</button>";
    }).join("");
  }

  function refreshSavedSelect() {
    var sel = document.getElementById("bcDesignSavedSelect");
    if (!sel) return;
    var cur = sel.value;
    sel.innerHTML = '<option value="">— هەڵبژێرە —</option>' + DESIGN.saved.map(function (s) {
      return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(s.name) + "</option>";
    }).join("");
    if (cur) sel.value = cur;
  }

  function saveNamedStyle() {
    var name = prompt("ناوی ستایل:", "ستایلی لەزگە");
    if (!name) return;
    name = String(name).trim();
    if (!name) return;
    var id = "st_" + Date.now();
    DESIGN.saved.push({
      id: id,
      name: name,
      canvas: JSON.parse(JSON.stringify(DESIGN.canvas)),
      elements: JSON.parse(JSON.stringify(DESIGN.elements))
    });
    persist(true);
    refreshSavedSelect();
    var sel = document.getElementById("bcDesignSavedSelect");
    if (sel) sel.value = id;
    if (typeof toast === "function") toast("سەرکەوتوو", "ستایل پاشکەوت کرا", "success");
  }

  function loadNamedStyle() {
    var sel = document.getElementById("bcDesignSavedSelect");
    if (!sel || !sel.value) return;
    var found = null;
    DESIGN.saved.forEach(function (s) { if (s.id === sel.value) found = s; });
    if (!found) return;
    DESIGN.canvas = Object.assign({ w: 80, h: 54, bg: "#ffffff" }, JSON.parse(JSON.stringify(found.canvas || {})));
    DESIGN.elements = (found.elements || []).map(normalizeEl);
    DESIGN.selectedId = DESIGN.elements[0] ? DESIGN.elements[0].id : null;
    persist(true);
    var sizeSel = document.getElementById("bcDesignCanvasSize");
    if (sizeSel) {
      var key = DESIGN.canvas.w + "x" + DESIGN.canvas.h;
      if ([].some.call(sizeSel.options, function (o) { return o.value === key; })) sizeSel.value = key;
    }
    var bg = document.getElementById("bcDesignCanvasBg");
    if (bg) bg.value = DESIGN.canvas.bg || "#ffffff";
    remount();
  }

  function deleteNamedStyle() {
    var sel = document.getElementById("bcDesignSavedSelect");
    if (!sel || !sel.value) return;
    DESIGN.saved = DESIGN.saved.filter(function (s) { return s.id !== sel.value; });
    persist(true);
    refreshSavedSelect();
  }

  function addCustomText() {
    var id = "custom_" + Date.now();
    var item = el(id, "text", "custom", "دەقی خۆت", 2, 12, 76, 7, 14, "800", "#7c3aed");
    item.customText = "دەقی خۆت";
    DESIGN.elements.push(item);
    DESIGN.selectedId = id;
    persist();
    remount();
  }

  function fillInspector() {
    uiLock = true;
    try {
      var item = findEl(DESIGN.selectedId);
      var font = document.getElementById("bcDockFont");
      var size = document.getElementById("bcDockSize");
      var lbl = document.getElementById("bcDockSizeLbl");
      var color = document.getElementById("bcDockColor");
      var usd = document.getElementById("bcDockUsd");
      var qr = document.getElementById("bcDockQr");
      if (item) {
        if (font) {
          if (!font.options.length) font.innerHTML = fontOptionsHtml(item.font);
          font.value = item.font;
        }
        if (size) size.value = Math.max(8, Math.min(48, item.size || 16));
        if (lbl) lbl.textContent = Math.round(item.size || 16);
        if (color) color.value = toHex(item.color);
      }
      var usdEl = DESIGN.elements.filter(function (x) { return x.bind === "usd"; })[0];
      if (usd) usd.checked = !!(usdEl && usdEl.visible);
      var bcEl = DESIGN.elements.filter(function (x) { return x.bind === "barcode"; })[0];
      if (qr) qr.checked = !!(bcEl && bcEl.codeType === "qr");
      refreshChips();
    } finally {
      uiLock = false;
    }
  }

  function weightOpt(val, label, cur) {
    return '<option value="' + val + '"' + (String(cur) === val ? " selected" : "") + ">" + label + "</option>";
  }

  function toHex(c) {
    c = String(c || "#000000").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
    if (/^#[0-9a-fA-F]{3}$/.test(c)) {
      return "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    }
    return "#000000";
  }

  function wireInspector(item) {
    function bind(id, ev, fn) {
      var n = document.getElementById(id);
      if (n) n.addEventListener(ev, fn);
    }
    function patch(mut, full) {
      mut();
      persist();
      if (full || item.kind === "barcode") remount();
      else {
        applyItemBox(item);
        var node = document.querySelector('#barcodePreview .bc-el[data-id="' + item.id + '"] .bc-el-text');
        if (node) node.textContent = elementText(item, lastProduct, lastSettings);
        refreshChips();
      }
    }
    bind("bcInspCustom", "input", function () { patch(function () { item.customText = this.value; }.bind(this)); });
    bind("bcInspCodeType", "change", function () { patch(function () { item.codeType = this.value; }.bind(this), true); });
    bind("bcInspFont", "change", function () { patch(function () { item.font = this.value; }.bind(this)); });
    bind("bcInspSize", "input", function () {
      var v = clamp(parseFloat(this.value) || 12, 4, 160);
      var range = document.getElementById("bcInspSizeRange");
      if (range) range.value = Math.min(96, v);
      patch(function () { item.size = v; });
    });
    bind("bcInspSizeRange", "input", function () {
      var v = clamp(parseFloat(this.value) || 12, 4, 160);
      var numEl = document.getElementById("bcInspSize");
      if (numEl) numEl.value = v;
      patch(function () { item.size = v; });
    });
    bind("bcInspColor", "input", function () {
      var hex = document.getElementById("bcInspHex");
      if (hex) hex.value = this.value;
      patch(function () { item.color = this.value; }.bind(this), item.kind === "barcode");
    });
    bind("bcInspHex", "change", function () {
      var v = toHex(this.value);
      this.value = v;
      var col = document.getElementById("bcInspColor");
      if (col) col.value = v;
      patch(function () { item.color = v; }, item.kind === "barcode");
    });
    bind("bcInspWeight", "change", function () { patch(function () { item.weight = this.value; }.bind(this)); });
    bind("bcInspItalic", "change", function () { patch(function () { item.italic = this.checked; }.bind(this)); });
    bind("bcInspAlign", "change", function () { patch(function () { item.align = this.value; }.bind(this)); });
    bind("bcInspVisible", "change", function () { patch(function () { item.visible = this.checked; }.bind(this), true); });
    bind("bcInspX", "change", function () { patch(function () { item.x = clamp(parseFloat(this.value) || 0, 0, DESIGN.canvas.w); }.bind(this)); });
    bind("bcInspY", "change", function () { patch(function () { item.y = clamp(parseFloat(this.value) || 0, 0, DESIGN.canvas.h); }.bind(this)); });
    bind("bcInspW", "change", function () { patch(function () { item.w = clamp(parseFloat(this.value) || 10, 6, DESIGN.canvas.w); }.bind(this), true); });
    bind("bcInspH", "change", function () { patch(function () { item.h = clamp(parseFloat(this.value) || 4, 3, DESIGN.canvas.h); }.bind(this), true); });
    var sw = document.getElementById("bcInspSwatches");
    if (sw) sw.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".bc-swatch") : null;
      if (!b) return;
      var c = b.getAttribute("data-color");
      item.color = c;
      persist();
      remount();
    });
    bind("bcInspDelete", "click", function () {
      DESIGN.elements = DESIGN.elements.filter(function (x) { return x.id !== item.id; });
      DESIGN.selectedId = DESIGN.elements[0] ? DESIGN.elements[0].id : null;
      persist(true);
      remount();
    });
  }

  function printCss() {
    var bg = (DESIGN.canvas && DESIGN.canvas.bg) || "#ffffff";
    return "@page{size:" + DESIGN.canvas.w + "mm " + DESIGN.canvas.h + "mm;margin:0;}" +
      "*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}" +
      "html,body{margin:0;padding:0;background:" + bg + ";direction:ltr;}" +
      ".bc-design-canvas{position:relative;overflow:hidden;page-break-after:always;}" +
      ".bc-el{position:absolute;box-sizing:border-box;overflow:hidden;display:flex;align-items:center;justify-content:center;}" +
      ".bc-el[style*='text-align:right']{justify-content:flex-end;}" +
      ".bc-el[style*='text-align:left']{justify-content:flex-start;}" +
      ".bc-el-text{width:100%;line-height:1.12;word-break:break-word;unicode-bidi:plaintext;}" +
      ".bc-el-graphic{width:100%;height:100%;display:flex;align-items:center;justify-content:center;}" +
      ".bc-el-graphic svg,.bc-el-graphic img{width:100%;height:100%;max-height:100%;object-fit:contain;display:block;}" +
      ".bc-handle,.bc-el-tag{display:none!important;}";
  }

  function renderLabelHtml(product, settings) {
    return renderCanvasHtml(product, settings, true);
  }

  function printDocument(labelsHtml) {
    return "<!DOCTYPE html><html lang=\"ku\" dir=\"ltr\"><head><meta charset=\"UTF-8\"><title>چاپی لەزگە</title>" +
      '<link rel="stylesheet" href="' + GOOGLE_FONTS + '">' +
      "<style>" + printCss() + "</style></head><body>" + labelsHtml + "</body></html>";
  }

  function printJobs(items, settings) {
    if (!items || !items.length) return;
    function sendOne(idx) {
      if (idx >= items.length) return;
      var html = printDocument(renderLabelHtml(items[idx], settings));
      if (typeof ImmediatePrinter !== "undefined") {
        ImmediatePrinter.print(html, {
          pageSize: DESIGN.canvas.w + "mm " + DESIGN.canvas.h + "mm",
          skipDebounce: true,
          kickDrawer: false,
          tightCut: true
        });
      }
      if (idx + 1 < items.length) setTimeout(function () { sendOne(idx + 1); }, 700);
    }
    sendOne(0);
    if (window.PosSound) PosSound.playSuccessChime();
  }

  function boot() {
    if (booted) return;
    booted = true;
    hydrate();
    buildPanel();
    document.addEventListener("keydown", function (e) {
      if (typeof BARCODE_STUDIO_STATE === "undefined" || BARCODE_STUDIO_STATE.template !== "design") return;
      var sec = document.getElementById("barcodeSection");
      if (!sec || !(sec.classList.contains("active") || sec.classList.contains("show") || window.CURRENT_PAGE === "barcode")) return;
      if (typeof isKeyboardTypingTarget === "function" && isKeyboardTypingTarget(e.target)) return;
      var tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      if (e.key === "Escape") {
        DESIGN.selectedId = null;
        syncSelectionClass();
        fillInspector();
        return;
      }
      var item = findEl(DESIGN.selectedId);
      if (!item) return;
      var step = e.shiftKey ? 1 : 0.5;
      if (e.key === "ArrowLeft") item.x = clamp(item.x - step, 0, DESIGN.canvas.w);
      else if (e.key === "ArrowRight") item.x = clamp(item.x + step, 0, DESIGN.canvas.w);
      else if (e.key === "ArrowUp") item.y = clamp(item.y - step, 0, DESIGN.canvas.h);
      else if (e.key === "ArrowDown") item.y = clamp(item.y + step, 0, DESIGN.canvas.h);
      else return;
      e.preventDefault();
      persist();
      applyItemBox(item);
      fillInspector();
    });
  }

  function show(on) {
    boot();
    if (on && (!DESIGN.elements || !DESIGN.elements.length)) hydrate();
    var panel = document.getElementById("barcodeDesignerPanel");
    if (panel) panel.style.display = "none";
    var dock = document.getElementById("barcodeDesignDock");
    if (dock) dock.style.display = on ? "" : "none";
    var opts = document.getElementById("barcodeOptionsPanel");
    if (opts) opts.style.display = on ? "none" : "";
    if (on) {
      ensureFonts();
      if (!DESIGN.selectedId || !findEl(DESIGN.selectedId)) DESIGN.selectedId = "name";
      fillInspector();
    }
  }

  function setCanvasBg(color, skipPersist) {
    color = String(color || "#ffffff");
    DESIGN.canvas = DESIGN.canvas || { w: 80, h: 54, bg: "#ffffff" };
    DESIGN.canvas.bg = color;
    var canvas = document.querySelector("#barcodePreview .bc-design-canvas");
    if (canvas) canvas.style.background = color;
    if (!skipPersist) persist();
  }

  global.BarcodeDesigner = {
    boot: boot,
    show: show,
    hydrate: hydrate,
    mountPreview: mountPreview,
    renderLabelHtml: renderLabelHtml,
    printJobs: printJobs,
    persist: persist,
    setCanvasBg: setCanvasBg
  };
})(typeof window !== "undefined" ? window : this);
