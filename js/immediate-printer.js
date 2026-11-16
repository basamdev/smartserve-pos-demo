/* Sam Market POS — Immediate Silent Printing Engine (Zero Browser Popups / Direct to Hardware) */
var ImmediatePrinter = (function () {
  var isPrinting = false;
  var lastPrintTimestamp = 0;

  function getSelectedPrinterName() {
    try {
      if (window.DB && window.DB.settings && window.DB.settings.selectedPrinter) {
        return window.DB.settings.selectedPrinter.trim();
      }
    } catch (e) {}
    return "XP-80C";
  }

  function expandThermalMmWidths(html, pageSize) {
    if (!html) return html;
    var ps = String(pageSize || "80mm");
    if (ps === "A4" || ps === "letter" || /50/i.test(ps)) return html;
    return String(html).replace(/@page\{[\s\S]*?\}|width\s*:\s*\d+(?:\.\d+)?mm|max-width\s*:\s*\d+(?:\.\d+)?mm|min-width\s*:\s*\d+(?:\.\d+)?mm/gi, function (m) {
      if (/^@page/i.test(m)) return m;
      if (/^max-width/i.test(m)) return "max-width:100%";
      if (/^min-width/i.test(m)) return "min-width:0";
      return "width:100%";
    });
  }

  function printHtml(html, options) {
    options = options || {};
    html = expandThermalMmWidths(html, options.pageSize);
    var deviceName = options.printer || getSelectedPrinterName() || "XP-80C";
    var silent = options.silent !== false;

    // Prevent duplicate triggers within 1500ms (label batches may skip this)
    var now = Date.now();
    if (!options.skipDebounce && now - lastPrintTimestamp < 1500) {
      console.warn("[ImmediatePrinter] Duplicate print request ignored (debounced within 1500ms)");
      return Promise.resolve({ success: true, method: "debounced" });
    }
    lastPrintTimestamp = now;

    if (window.isPosDemoMode && window.isPosDemoMode()) {
      if (typeof toast === "function") {
        toast("دیمۆ", "لە وەشانی مارکێت (دێسکتۆپ) پسوڵە چاپ دەکرێت", "info");
      }
      return Promise.resolve({ success: true, method: "demo" });
    }

    // 1. Electron Desktop Direct Silent Printing (No Browsers, No Dialogs)
    if (window.POS_DESKTOP && typeof window.POS_DESKTOP.printSilent === "function") {
      isPrinting = true;
      return window.POS_DESKTOP.printSilent({
        html: html,
        silent: silent,
        printBackground: true,
        pageSize: options.pageSize || "80mm",
        deviceName: deviceName,
        kickDrawer: options.kickDrawer,
        tightCut: !!options.tightCut
      })
      .then(function (result) {
        isPrinting = false;
        if (result && result.success) {
          return { success: true, method: "desktop-silent", printer: deviceName };
        } else {
          console.warn("Desktop silent print returned false, trying backend API:", result);
          return printViaBackendApi(html, deviceName, options);
        }
      })
      .catch(function (err) {
        isPrinting = false;
        console.warn("Desktop printSilent exception, trying backend API:", err);
        return printViaBackendApi(html, deviceName, options);
      });
    }

    // 2. Web Browser Mode (Chrome / Edge / App Mode): Print directly via Local Backend POS Server
    return printViaBackendApi(html, deviceName, options);
  }

  function printViaBackendApi(html, deviceName, options) {
    options = options || {};
    isPrinting = true;
    var targetUrl = (window.location && window.location.origin && window.location.origin.startsWith("http"))
      ? (window.location.origin + "/api/print/receipt")
      : "http://localhost:3005/api/print/receipt";

    return fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html: html,
        pageSize: options.pageSize || "80mm",
        printer: deviceName || "XP-80C"
      })
    })
    .then(function (res) {
      isPrinting = false;
      if (res.ok) {
        return res.json().then(function (data) {
          if (data && data.success) {
            return { success: true, method: "backend-silent", printer: data.printer || deviceName };
          }
          console.warn("Backend API returned unsuccessful print:", data);
          return printViaHiddenIframe(html);
        });
      } else {
        console.warn("Backend API print failed with status " + res.status);
        return printViaHiddenIframe(html);
      }
    })
    .catch(function (err) {
      isPrinting = false;
      console.warn("Network error calling /api/print/receipt, falling back to iframe:", err);
      return printViaHiddenIframe(html);
    });
  }

  function printViaHiddenIframe(html) {
    return new Promise(function (resolve) {
      try {
        var frame = document.getElementById("immediateSilentPrintIframe");
        if (!frame) {
          frame = document.createElement("iframe");
          frame.id = "immediateSilentPrintIframe";
          frame.setAttribute("aria-hidden", "true");
          frame.style.position = "fixed";
          frame.style.left = "0";
          frame.style.top = "0";
          frame.style.width = "80mm";
          frame.style.height = "100%";
          frame.style.zIndex = "-99999";
          frame.style.opacity = "0.01";
          frame.style.pointerEvents = "none";
          frame.style.border = "none";
          document.body.appendChild(frame);
        }

        var doc = frame.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();

        setTimeout(function () {
          try {
            frame.contentWindow.focus();
            frame.contentWindow.print();
          } catch (e) {
            console.error("Iframe print invocation error:", e);
          }
          resolve({ success: true, method: "iframe-silent" });
        }, 150);
      } catch (err) {
        console.error("Critical printing error in printViaHiddenIframe:", err);
        resolve({ success: false, error: err });
      }
    });
  }

  function getPrinters() {
    if (window.POS_DESKTOP && typeof window.POS_DESKTOP.getPrinters === "function") {
      return window.POS_DESKTOP.getPrinters().catch(function () {
        return fetchPrintersFromBackend();
      });
    }
    return fetchPrintersFromBackend();
  }

  function fetchPrintersFromBackend() {
    return fetch("/api/printers")
      .then(function (r) { return r.json(); })
      .then(function (list) {
        return Array.isArray(list) ? list : (list && list.value ? list.value : []);
      })
      .catch(function () {
        return [{ name: "XP-80C", isDefault: true }];
      });
  }

  function populatePrinterSelect(selectEl, selectedVal) {
    if (!selectEl) return;
    getPrinters().then(function (printers) {
      var html = '<option value="">-- چاپکەری پێشگریمانەی سیستەم (XP-80C) --</option>';
      if (printers && printers.length > 0) {
        printers.forEach(function (p) {
          var name = p.name || p;
          var isSel = (selectedVal && selectedVal === name) ? " selected" : "";
          html += '<option value="' + name + '"' + isSel + '>' + name + (p.isDefault ? ' (پێشگریمانە)' : '') + '</option>';
        });
      } else {
        html += '<option value="XP-80C"' + (selectedVal === 'XP-80C' ? ' selected' : '') + '>XP-80C (Thermal POS 80mm)</option>';
      }
      selectEl.innerHTML = html;
    });
  }

  function printCurrentBill() {
    // 1. If active cart has items, complete payment and print immediately
    var currentCart = null;
    if (typeof CUSTOMER_QUEUE !== "undefined" && typeof ACTIVE_CUSTOMER !== "undefined" && CUSTOMER_QUEUE[ACTIVE_CUSTOMER]) {
      currentCart = CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart;
    } else if (typeof CART !== "undefined") {
      currentCart = CART;
    }
    if (currentCart && currentCart.length > 0) {
      if (typeof isPosCardChoiceOpen === "function" && isPosCardChoiceOpen() && typeof confirmPosCardPayment === "function") {
        confirmPosCardPayment(true);
        return;
      }
      if (typeof handlePosDirectPayment === "function") {
        handlePosDirectPayment(true);
        return;
      }
    }

    // 2. If LAST_ORDER exists, reprint it
    if (typeof LAST_ORDER !== "undefined" && LAST_ORDER && typeof printReceiptDirect === "function") {
      printReceiptDirect(LAST_ORDER);
      if (typeof toast === "function") toast("چاپکردنەوە", "دوایین پسوڵە چاپ دەکرێتەوە...", "info");
      return;
    }
    // 3. Fallback to latest order in database
    if (window.DB && window.DB.orders && window.DB.orders.length > 0 && typeof printReceiptDirect === "function") {
      printReceiptDirect(window.DB.orders[window.DB.orders.length - 1]);
      if (typeof toast === "function") toast("چاپکردنەوە", "دوایین پسوڵە چاپ دەکرێتەوە...", "info");
      return;
    }
    if (typeof toast === "function") toast("ئاگاداری", "هیچ پسوڵەیەک نییە بۆ چاپکردن", "info");
  }

  // Intercept Ctrl+P in capturing phase to block browser print preview window unconditionally!
  window.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P" || e.keyCode === 80)) {
      e.preventDefault();
      e.stopPropagation();
      printCurrentBill();
      return false;
    }
  }, true);

  return {
    print: printHtml,
    printHtml: printHtml,
    getPrinters: getPrinters,
    populatePrinterSelect: populatePrinterSelect,
    printCurrentBill: printCurrentBill,
    isPrinting: function () { return isPrinting; }
  };
})();

window.ImmediatePrinter = ImmediatePrinter;
window.smartPrintReceipt = function () {
  if (typeof ImmediatePrinter !== "undefined") {
    ImmediatePrinter.printCurrentBill();
  }
};
