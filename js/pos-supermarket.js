/* Sam Market POS — Supermarket Engine (Scale Barcodes, Audio, Hotkeys, Dual Screen, Currencies) */
var SupermarketEngine = (function () {
  var broadcastChannel = null;
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      broadcastChannel = new BroadcastChannel('pos_customer_display');
    } catch (e) {}
  }

  // 1. DUAL SCREEN / CUSTOMER FACING DISPLAY BROADCAST
  function syncCustomerDisplay(cart, totals, usdRate) {
    var data = {
      items: (cart || []).map(function (c) {
        var isCarton = (c.unitType === 'carton');
        return {
          name: c.name + (isCarton ? ' (کارتۆن)' : ''),
          qty: c.qty,
          unit: isCarton ? 'carton' : (c.unit || 'piece'),
          price: c.price,
          total: c.price * c.qty
        };
      }),
      itemCount: totals ? totals.itemCount : 0,
      totalQty: totals ? totals.totalQty : 0,
      discount: totals ? totals.discAmt : 0,
      totalIqd: totals ? totals.grandTotal : 0,
      usdRate: usdRate || (DB.settings && DB.settings.usdRate ? parseFloat(DB.settings.usdRate) : 1530),
      marketName: (typeof getStoreName === 'function') ? getStoreName('') : '',
      marketTagline: (DB && DB.settings && DB.settings.marketTagline) ? DB.settings.marketTagline : '',
      marketLogo: (DB && DB.settings && DB.settings.marketLogo) ? DB.settings.marketLogo : ''
    };

    if (broadcastChannel) {
      try { broadcastChannel.postMessage(data); } catch (e) {}
    }
    try {
      localStorage.setItem('sm_customer_display_data', JSON.stringify(data));
    } catch (e) {}
    try {
      var baseUrl = (typeof ApiClient !== 'undefined' && ApiClient.getBaseUrl) ? ApiClient.getBaseUrl() : '';
      fetch(baseUrl + '/api/customer-display/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).catch(function () {});
    } catch (e) {}
  }

  function syncCashDisplay(received, change) {
    var data = {
      type: 'cash_update',
      cashReceived: received || 0,
      changeDue: change || 0
    };
    if (broadcastChannel) {
      try { broadcastChannel.postMessage(data); } catch (e) {}
    }
    try {
      localStorage.setItem('sm_customer_display_cash', JSON.stringify(data));
    } catch (e) {}
    try {
      var baseUrl = (typeof ApiClient !== 'undefined' && ApiClient.getBaseUrl) ? ApiClient.getBaseUrl() : '';
      fetch(baseUrl + '/api/customer-display/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).catch(function () {});
    } catch (e) {}
  }

  function openCustomerDisplay() {
    var w = 1024, h = 768;
    var left = window.screen.width ? window.screen.width : 0;
    var win = window.open('customer-display.html?v=7', 'CustomerDisplay', 'width=' + w + ',height=' + h + ',left=' + left + ',top=0');
    if (win) {
      toast('شاشەی کڕیار', 'شاشەی دووەمی کڕیار کرایەوە', 'success');
      if (typeof pushCustomerBrand === 'function') pushCustomerBrand();
      if (typeof renderCartTable === 'function') renderCartTable();
    } else {
      toast('ئاگاداری', 'تکایە ڕێگە بدە بە Pop-up بۆ کردنەوەی شاشەی کڕیار', 'warning');
    }
  }

  function broadcastSaleComplete(order) {
    if (!order) return;
    var data = {
      type: 'sale_completed',
      total: order.total || 0,
      received: order.cashReceived || 0,
      change: order.changeDue || 0,
      paidCurrency: order.paidCurrency || 'IQD',
      usdReceived: order.usdReceived || 0,
      itemsCount: (order.items || []).length
    };
    if (broadcastChannel) {
      try { broadcastChannel.postMessage(data); } catch (e) {}
    }
    try {
      localStorage.setItem('sm_customer_display_sale', JSON.stringify(data));
    } catch (e) {}
    try {
      var baseUrl = (typeof ApiClient !== 'undefined' && ApiClient.getBaseUrl) ? ApiClient.getBaseUrl() : '';
      fetch(baseUrl + '/api/customer-display/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).catch(function () {});
    } catch (e) {}
  }

  // 2. EMBEDDED SCALE BARCODE DECODER & GENERATOR (EAN-13 Scale Barcodes)
  // Supermarkets worldwide & Kurdistan use EAN-13 for scales:
  // Prefixes: 20, 21, 22, 23, 24, 25, 26, 27, 28, 29
  // Standard 13-digit EAN-13 Structure: [2-digit prefix][5-digit PLU code][5-digit weight/price][1-digit check]
  // Legacy 11/12-digit Structure:       [2-digit prefix][4-digit PLU code][5-digit weight/price][optional check]
  function decodeScaleBarcode(code) {
    if (!code || typeof code !== 'string') return null;
    var cleaned = code.trim().replace(/\D/g, '');
    if (cleaned.length < 11 || cleaned.length > 13) return null;
    if (!/^2[0-9]/.test(cleaned)) return null;

    var prefix = cleaned.slice(0, 2);
    var itemCode4, itemCode5, valuePart;

    if (cleaned.length === 13) {
      // Standard 13-digit EAN-13 from electronic scales (2 prefix + 5 PLU + 5 weight/price + 1 check digit)
      itemCode5 = cleaned.slice(2, 7);
      itemCode4 = cleaned.slice(3, 7);
      valuePart = parseInt(cleaned.slice(7, 12), 10) || 0;
    } else {
      // 11 or 12-digit format (2 prefix + 4 PLU + 5 weight/price)
      itemCode4 = cleaned.slice(2, 6);
      itemCode5 = '0' + itemCode4;
      valuePart = parseInt(cleaned.slice(6, 11), 10) || 0;
    }

    // Determine if weight-based or price-based
    var isPriceBased = (prefix === '22' || prefix === '23' || prefix === '25');
    var weight = 1.0;
    var totalPrice = 0;

    if (isPriceBased) {
      totalPrice = valuePart;
    } else {
      // Weight in grams: e.g. 01250 = 1.250 kg
      weight = valuePart / 1000.0;
      if (weight <= 0) weight = 1.0;
    }

    return {
      prefix: prefix,
      itemCode: itemCode4,
      itemCode5: itemCode5,
      weight: weight,
      isPriceBased: isPriceBased,
      totalPrice: totalPrice,
      rawCode: cleaned
    };
  }

  function calculateEan13CheckDigit(digits12) {
    var raw = String(digits12).replace(/\D/g, '').slice(0, 12);
    while (raw.length < 12) raw = raw.padEnd(12, '0');
    var sum = 0;
    for (var i = 0; i < 12; i++) {
      var n = parseInt(raw[i], 10);
      sum += (i % 2 === 0) ? n : (n * 3);
    }
    return (10 - (sum % 10)) % 10;
  }

  function generateScaleBarcode(pluCode, weightKg, prefix) {
    var pfx = prefix || '20';
    var plu = String(pluCode || '1').replace(/\D/g, '').slice(-5).padStart(5, '0');
    var grams = Math.round((parseFloat(weightKg) || 1.0) * 1000);
    var gramStr = String(Math.max(1, Math.min(99999, grams))).padStart(5, '0');
    var base12 = pfx + plu + gramStr; // 2 + 5 + 5 = 12 digits
    var checkDigit = calculateEan13CheckDigit(base12);
    return base12 + checkDigit; // 13-digit standard EAN-13
  }

  // ═══════════════════════════════════════════════════════════════
  // SCALE BARCODE SIMULATOR & INTERACTIVE TESTER
  // ═══════════════════════════════════════════════════════════════
  function openScaleSimulatorModal() {
    var modal = document.getElementById('scaleSimulatorModal');
    if (!modal) return;

    var select = document.getElementById('simScaleProductSelect');
    if (select && typeof DB !== 'undefined' && DB.products) {
      var scaleProds = DB.products.filter(function (p) {
        return p.isScaleItem || p.unit === 'kg' || p.unit === 'gram';
      });

      if (scaleProds.length === 0) {
        scaleProds = DB.products.slice(0, 5);
      }

      select.innerHTML = scaleProds.map(function (p) {
        var plu = String(p.scaleCode || p.barcode || p.id).replace(/\D/g, '').slice(-4).padStart(4, '0');
        return '<option value="' + p.id + '" data-plu="' + plu + '" data-price="' + p.price + '">' + p.name + ' (' + fmt(p.price) + ' د.ع/کگم - PLU: ' + plu + ')</option>';
      }).join('');
    }

    modal.classList.add('active');
    updateScaleSimPreview();
  }

  function closeScaleSimulatorModal() {
    var modal = document.getElementById('scaleSimulatorModal');
    if (modal) modal.classList.remove('active');
  }

  function setScaleSimWeight(w) {
    var input = document.getElementById('simScaleWeightInput');
    if (input) {
      input.value = Number(w).toFixed(3);
      updateScaleSimPreview();
    }
  }

  function updateScaleSimPreview() {
    var select = document.getElementById('simScaleProductSelect');
    var weightInput = document.getElementById('simScaleWeightInput');
    if (!select || !weightInput) return;

    var selOpt = select.options[select.selectedIndex];
    var plu = selOpt ? selOpt.getAttribute('data-plu') : '0001';
    var unitPrice = selOpt ? (parseFloat(selOpt.getAttribute('data-price')) || 0) : 0;
    var weightKg = parseFloat(weightInput.value) || 1.0;
    var totalPrice = Math.round(unitPrice * weightKg);

    var barcode13 = generateScaleBarcode(plu, weightKg, '20');

    if (document.getElementById('simScalePluCode')) document.getElementById('simScalePluCode').textContent = plu;
    if (document.getElementById('simScaleUnitPrice')) document.getElementById('simScaleUnitPrice').textContent = fmt(unitPrice) + ' د.ع / کگم';
    if (document.getElementById('simScaleTotalPrice')) document.getElementById('simScaleTotalPrice').textContent = fmt(totalPrice) + ' د.ع';
    if (document.getElementById('simScaleBarcodeDigits')) document.getElementById('simScaleBarcodeDigits').textContent = barcode13;

    var svgWrap = document.getElementById('simScaleBarcodeSvgWrap');
    if (svgWrap && typeof BarcodeGen !== 'undefined') {
      svgWrap.innerHTML = BarcodeGen.ean13Svg(barcode13, { height: 44, barWidth: 1.6, showText: true, fontSize: 11 });
    }
  }

  function simulateScaleScan() {
    var digitsEl = document.getElementById('simScaleBarcodeDigits');
    var code = digitsEl ? digitsEl.textContent.trim() : '';
    if (!code) return;

    closeScaleSimulatorModal();
    if (typeof processBarcode === 'function') {
      processBarcode(code);
    }
  }

  function printCurrentScaleLabel() {
    var select = document.getElementById('simScaleProductSelect');
    var weightInput = document.getElementById('simScaleWeightInput');
    if (!select || !weightInput) return;

    var prodId = select.value;
    var prod = DB.products.find(function (p) { return p.id === prodId; });
    if (!prod) return;

    var weightKg = parseFloat(weightInput.value) || 1.0;
    if (typeof BarcodeGen !== 'undefined') {
      var labelHtml = BarcodeGen.renderScaleLabelHtml(prod, DB.settings, { scaleWeight: weightKg });
      var fullLabelDoc = '<html><head><title>Scale Label</title><style>@page{size:50mm 35mm;margin:0;}body{margin:0;padding:2mm;font-family:sans-serif;}</style></head><body>' + labelHtml + '</body></html>';
      if (typeof ImmediatePrinter !== "undefined") {
        ImmediatePrinter.print(fullLabelDoc, { pageSize: '50mm' });
      } else {
        var win = window.open('', '_blank', 'width=450,height=400');
        if (win) {
          win.document.write(fullLabelDoc + '<script>window.onload=function(){window.print();window.close();};<\/script>');
          win.document.close();
        }
      }
    }
  }

  // 3. CURRENCY CONVERTER (IQD <-> USD)
  function getUsdRate() {
    var rate = DB.settings && DB.settings.usdRate ? parseFloat(DB.settings.usdRate) : 1530;
    return rate > 0 ? rate : 1530;
  }

  function iqdToUsd(iqdAmount) {
    var rate = getUsdRate();
    return (Number(iqdAmount || 0) / rate).toFixed(2);
  }

  function usdToIqd(usdAmount) {
    var rate = getUsdRate();
    return Math.round(Number(usdAmount || 0) * rate);
  }

  // 3.5 SMART RECEIPT PRINTING & TEST PRINT
  function printTestReceipt() {
    var marketName = (typeof getStoreName === "function") ? getStoreName() : "مارکێت";
    var testOrder = {
      id: "TEST-" + Math.floor(1000 + Math.random() * 9000),
      date: new Date().toISOString(),
      cashier: (DB && DB.currentUser) ? DB.currentUser.name : "ئەدمین",
      customerName: "کڕیاری تاقیکاری",
      paymentMethod: "نقد (Cash)",
      items: [
        { name: "شیری تازە 1L", qty: 1, price: 1500 },
        { name: "نان (١٠ دانە)", qty: 2, price: 1000 },
        { name: "سێوی لوبنانی (تەرازوو)", qty: 1.5, price: 2000, unit: "kg" },
        { name: "کۆکاکۆلا 330ml", qty: 2, price: 750 }
      ],
      subtotal: 8000,
      discount: 500,
      total: 7500,
      isTest: true
    };
    if (typeof printReceiptDirect === "function") {
      printReceiptDirect(testOrder);
      if (typeof PosAudio !== "undefined") PosAudio.playCashChime();
      toast("چاپی تاقیکاری", "پسوڵەی تاقیکاری بە سەرکەوتوویی ڕەوانەی چاپکەر کرا", "success");
    } else {
      toast("هەڵە", "سیستەمی چاپکردن ئامادە نییە", "error");
    }
  }

  function smartPrintReceipt() {
    // 1. If active customer has items in cart: print quote / receipt of current cart
    var currentCart = null;
    if (typeof CUSTOMER_QUEUE !== "undefined" && typeof ACTIVE_CUSTOMER !== "undefined" && CUSTOMER_QUEUE[ACTIVE_CUSTOMER]) {
      currentCart = CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart;
    } else if (typeof CART !== "undefined") {
      currentCart = CART;
    }

    if (currentCart && currentCart.length > 0) {
      var sub = 0;
      currentCart.forEach(function (i) { sub += (i.price * i.qty); });
      var discPct = typeof getPosDiscountPct === "function" ? getPosDiscountPct() : 0;
      var disc = Math.round((sub * discPct) / 100);
      var grand = sub - disc;

      var cartOrder = {
        id: "REC-" + Date.now().toString().slice(-6),
        date: new Date().toISOString(),
        cashier: (DB && DB.currentUser) ? DB.currentUser.name : "کاشیر",
        customerName: (typeof CUSTOMER_QUEUE !== "undefined" && CUSTOMER_QUEUE[ACTIVE_CUSTOMER]) ? CUSTOMER_QUEUE[ACTIVE_CUSTOMER].name : "موشتەری",
        paymentMethod: "نقد",
        items: currentCart.map(function (c) {
          return { name: c.name, qty: c.qty, price: c.price, unit: c.unit };
        }),
        subtotal: sub,
        discount: disc,
        total: grand
      };
      if (typeof printReceiptDirect === "function") printReceiptDirect(cartOrder);
      if (typeof PosAudio !== "undefined") PosAudio.playCashChime();
      toast("چاپکردن", "پسوڵەی سەبەتەی ئێستا چاپکرا (Ctrl+P)", "success");
      return;
    }

    // 2. If there is a last completed order:
    var order = (typeof LAST_ORDER !== "undefined" && LAST_ORDER) ? LAST_ORDER : (DB && DB.orders && DB.orders.length > 0 ? DB.orders[DB.orders.length - 1] : null);
    if (order) {
      if (typeof printReceiptDirect === "function") printReceiptDirect(order);
      if (typeof PosAudio !== "undefined") PosAudio.playCashChime();
      toast("چاپکردن", "دواین پسوڵەی فرۆشتن چاپکرا (Ctrl+P)", "success");
      return;
    }

    // 3. Fallback: Print Test Receipt!
    printTestReceipt();
  }

  // 4. KEYBOARD SHORTCUTS ENGINE
  var HOTKEYS_BOUND = false;
  function isCashierPage() {
    return window.CURRENT_PAGE === "pos" ||
      document.body.classList.contains("pos-page") ||
      document.body.classList.contains("pos-fullscreen") ||
      !!(document.getElementById("posSection") && document.getElementById("posSection").classList.contains("active"));
  }
  function initKeyboardHotkeys() {
    if (HOTKEYS_BOUND) return;
    HOTKEYS_BOUND = true;
    function isPosScanDumpTarget(t) {
      if (!t) return false;
      if (typeof isHidScanDumpField === "function" && isHidScanDumpField(t)) return true;
      var id = t.id || "";
      return id === "headerSearchInput" || id === "barcodeInput" || id === "manualBarcodeInput" ||
        id === "posSearch" || id === "posScanQtyInput";
    }
    function isTypingOrFormControl(e) {
      var t = e && e.target;
      if (!t) return false;
      if (isPosScanDumpTarget(t)) return false;
      var tag = t.tagName ? t.tagName.toLowerCase() : "";
      if (tag === "button" || tag === "a") return false;
      if (t.closest && t.closest("#posSection button, #posSection a, .suite-btn, .pos-master-pay-btn, .nav-item, .qty-btn, .remove-btn")) return false;
      if (tag === "input" && t.classList && (t.classList.contains("qty-input") || t.classList.contains("cart-qty-input"))) {
        var k = e && e.key;
        return k === "Delete" || k === "Del" || k === "Backspace" || (e && e.code === "Delete");
      }
      if (typeof isKeyboardTypingTarget === "function" && isKeyboardTypingTarget(t)) return true;
      if (tag === "input" || tag === "textarea" || tag === "select" || tag === "option") return true;
      if (t.isContentEditable) return true;
      if (t.closest && t.closest("textarea, select, [contenteditable='true']")) return true;
      return false;
    }
    window.addEventListener('keydown', function (e) {
      if (e.key !== ' ' && e.key !== 'Spacebar' && e.code !== 'Space') return;
      if (e.repeat) return;
      if (window.__posHotkeyFromNative) return;
      if (!isCashierPage()) return;
      var overlaySp = document.querySelector('.modal-overlay.active');
      if (overlaySp && overlaySp.id !== 'quickKeypadModal') return;
      var saleOv = document.getElementById('posSaleSuccessOverlay');
      if (saleOv && saleOv.classList.contains('active')) return;
      if (typeof isProductAddModalOpen === 'function' && isProductAddModalOpen()) return;
      var cardOpen = typeof isPosCardChoiceOpen === 'function' && isPosCardChoiceOpen();
      if (!cardOpen && isTypingOrFormControl(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (typeof posDispatchCashierHotkey === "function") {
        posDispatchCashierHotkey((e.ctrlKey || e.metaKey) ? "payNoPrint" : "payPrint");
        return;
      }
      if (cardOpen && typeof confirmPosCardPayment === 'function') {
        confirmPosCardPayment(!(e.ctrlKey || e.metaKey));
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (typeof posCheckoutNoPrint === "function") posCheckoutNoPrint();
        else if (typeof handlePosDirectPayment === 'function') handlePosDirectPayment(false);
        return;
      }
      if (window.ImmediatePrinter && typeof ImmediatePrinter.printCurrentBill === 'function') {
        ImmediatePrinter.printCurrentBill();
      } else if (typeof handlePosDirectPayment === 'function') {
        handlePosDirectPayment(true);
      }
    }, true);

    window.addEventListener('keydown', function (e) {
      var isCardHotkey = e.key === 'd' || e.key === 'D' || e.code === 'KeyD';
      if (!isCardHotkey || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.repeat) return;
      if (!isCashierPage()) return;
      var overlayC = document.querySelector('.modal-overlay.active');
      if (overlayC && overlayC.id !== 'quickKeypadModal') return;
      if (typeof isProductAddModalOpen === 'function' && isProductAddModalOpen()) return;
      var t = e.target;
      var scanId = t && t.id;
      var isScan = scanId === 'headerSearchInput' || scanId === 'barcodeInput' || scanId === 'manualBarcodeInput';
      if (!isScan && isTypingOrFormControl(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (typeof handlePosCardSale === 'function') handlePosCardSale();
    }, true);

    window.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      if (typeof isPosCardChoiceOpen !== 'function' || !isPosCardChoiceOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof closePosCardChoice === 'function') closePosCardChoice();
    }, true);

    window.addEventListener('keydown', function (e) {
      if (e.key !== 'Delete' && e.key !== 'Del' && e.code !== 'Delete') return;
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (window.__posHotkeyFromNative) return;
      if (!isCashierPage()) return;
      var overlayDel = document.querySelector('.modal-overlay.active');
      if (overlayDel && overlayDel.id !== 'quickKeypadModal') return;
      if (typeof isPosCardChoiceOpen === 'function' && isPosCardChoiceOpen()) return;
      if (isTypingOrFormControl(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (typeof posDispatchCashierHotkey === "function") {
        posDispatchCashierHotkey("clearCart");
        return;
      }
      if (typeof clearCurrentCart === 'function') clearCurrentCart();
    }, true);

    window.addEventListener('keydown', function (e) {
      if (e.key !== "F1") return;
      e.preventDefault();
      e.stopPropagation();
      goToCashierPage();
    }, true);

    window.addEventListener('keydown', function (e) {
      if (window.__posHotkeyFromNative) return;
      // Ctrl + P is centrally handled by ImmediatePrinter with debouncing and hardware targeting

      // F1 handled in capture: always return to cashier page
      if (e.key && e.key.charAt(0) === "F" && e.key !== "F1" && e.key !== "F11" && !isCashierPage()) return;

      // F2: Focus Barcode input
      if (e.key === 'F2') {
        e.preventDefault();
        var bInput = document.getElementById('barcodeInput') || document.getElementById('headerSearchInput');
        if (bInput) {
          bInput.focus();
          bInput.select && bInput.select();
        }
        return;
      }

      // F3: Focus Search input
      if (e.key === 'F3') {
        e.preventDefault();
        var sInput = document.getElementById('headerSearchInput');
        if (sInput) { sInput.focus(); sInput.select && sInput.select(); }
        return;
      }

      // F4: Hold Current Sale (Park Tab)
      if (e.key === 'F4') {
        e.preventDefault();
        if (typeof holdSale === 'function') holdSale();
        return;
      }

      // F5: New Customer Tab / Shift+F5: Delete Customer Tab
      if (e.key === 'F5' || e.code === 'F5') {
        e.preventDefault();
        if (e.shiftKey) {
          if (typeof removeActiveCustomerTab === 'function') removeActiveCustomerTab();
        } else {
          if (typeof createNewCustomerTab === 'function') createNewCustomerTab();
        }
        return;
      }

      // F6: Hold Sale (ڕاگرتنی وەسڵ) or Open Held Bills List if cart is empty
      if (e.key === 'F6') {
        e.preventDefault();
        var hasCartItems = false;
        if (typeof CUSTOMER_QUEUE !== 'undefined' && typeof ACTIVE_CUSTOMER !== 'undefined' && CUSTOMER_QUEUE[ACTIVE_CUSTOMER] && CUSTOMER_QUEUE[ACTIVE_CUSTOMER].cart.length > 0) hasCartItems = true;
        if (hasCartItems && typeof holdSale === 'function') {
          holdSale();
        } else if (typeof openSuspendedSalesModal === 'function') {
          openSuspendedSalesModal();
        }
        return;
      }

      // F7: Cash Drawer Movement / Shifts
      if (e.key === 'F7') {
        e.preventDefault();
        if (typeof ShiftsManager !== 'undefined') ShiftsManager.openCashMovementModal('out');
        return;
      }

      // F8: Return Sale (گەڕاندنەوەی کاڵا - مرتجع)
      if (e.key === 'F8') {
        e.preventDefault();
        if (typeof openReturnSaleModal === 'function') {
          openReturnSaleModal();
        } else if (typeof ReturnEngine !== 'undefined') {
          ReturnEngine.open();
        }
        return;
      }

      // F9: Open Customer Display (Dual Monitor)
      if (e.key === 'F9') {
        e.preventDefault();
        openCustomerDisplay();
        return;
      }

      // F10: Products store (کۆگای کاڵا)
      if (e.key === 'F10') {
        e.preventDefault();
        if (typeof openCashierProductsStore === 'function') openCashierProductsStore();
        else if (typeof switchSection === 'function') switchSection('products', true);
        return;
      }

      // F11: Fullscreen POS Mode
      if (e.key === 'F11') {
        e.preventDefault();
        togglePosFullscreen();
        return;
      }

      // F12: Sound Drawer Kick / Test Drawer (Secure No-Sale Audit)
      if (e.key === 'F12') {
        e.preventDefault();
        if (typeof openNoSaleDrawerModal === 'function') {
          openNoSaleDrawerModal();
        } else {
          if (typeof PosAudio !== 'undefined') PosAudio.playDrawerKick();
          toast('کەشتی پارە', 'دەرگای سندوق کرایەوە', 'success');
        }
        return;
      }

      // Ctrl + B: Toggle sidebar/screen
      if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        var toggleBtn = document.getElementById('togglePosViewBtn');
        if (toggleBtn) toggleBtn.click();
        return;
      }

      // Alt+B: Open Barcode & Shelf Label Studio
      if (e.altKey && (e.key === 'b' || e.key === 'B' || e.key === 'لا')) {
        e.preventDefault();
        if (typeof switchSection === 'function') switchSection('barcode');
        else if (typeof openBarcodeLabelModal === 'function') openBarcodeLabelModal();
        return;
      }

      // Alt+Q: Create QR barcode from cashier
      if (e.altKey && (e.key === 'q' || e.key === 'Q' || e.key === 'ض')) {
        e.preventDefault();
        if (typeof openCashierQrBarcode === 'function') openCashierQrBarcode();
        return;
      }

      // Alt+W: Open Scale Barcode Simulator (تەرازووی کێشان و باڕکۆد)
      if (e.altKey && (e.key === 'w' || e.key === 'W' || e.key === 'ص')) {
        e.preventDefault();
        openScaleSimulatorModal();
        return;
      }

      // Space is handled in capture: always complete sale + print (same as Ctrl+P)

      // Banknote Quick Keys:
      if (e.ctrlKey && e.key === '5') {
        e.preventDefault();
        if (typeof applyQuickCash === 'function') applyQuickCash(50000);
        return;
      }
      if (e.ctrlKey && e.key === '2') {
        e.preventDefault();
        if (typeof applyQuickCash === 'function') applyQuickCash(25000);
        return;
      }
      if (e.ctrlKey && e.key === '1') {
        e.preventDefault();
        if (typeof applyQuickCash === 'function') applyQuickCash(10000);
        return;
      }
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        if (typeof applyExactCash === 'function') applyExactCash();
        return;
      }

      // Ctrl + K: Calculator
      if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (typeof toggleQuickKeypadModal === 'function') toggleQuickKeypadModal();
        return;
      }

      // Ctrl + N: New product
      if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        if (typeof openNewProductModal === 'function') openNewProductModal();
        return;
      }

      // Ctrl + 3: 5,000 IQD
      if (e.ctrlKey && e.key === '3') {
        e.preventDefault();
        if (typeof applyQuickCash === 'function') applyQuickCash(5000);
        return;
      }

      // Arrow keys: selected cart line qty — Up/Right more, Down/Left less
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (!isCashierPage()) return;
        var calcOpenArrows = document.getElementById('quickKeypadModal');
        if (calcOpenArrows && calcOpenArrows.classList.contains('active')) return;
        var activeOverlay = document.querySelector('.modal-overlay.active');
        if (activeOverlay && activeOverlay.id !== 'quickKeypadModal') return;
        var tAr = e.target;
        var tagAr = tAr && tAr.tagName ? tAr.tagName.toLowerCase() : '';
        var idAr = tAr && tAr.id ? tAr.id : '';
        var clsAr = tAr && tAr.className ? String(tAr.className) : '';
        if (tagAr === 'textarea' || tagAr === 'select') return;
        var allowAr = !tAr || tagAr === 'body' || tagAr === 'html' || tagAr === 'button' || tagAr === 'td' || tagAr === 'tr' || tagAr === 'div' || tagAr === 'span' ||
          idAr === 'headerSearchInput' || idAr === 'barcodeInput' || idAr === 'posScanQtyInput' ||
          clsAr.indexOf('cart-qty-input') >= 0 || clsAr.indexOf('qty-input') >= 0;
        if (tagAr === 'input' && !allowAr) return;
        if (typeof adjustSelectedCartQty === 'function') {
          e.preventDefault();
          adjustSelectedCartQty((e.key === 'ArrowUp' || e.key === 'ArrowRight') ? 1 : -1);
        }
        return;
      }

      // % : invoice discount (when not typing)
      if (e.key === '%' && !e.ctrlKey && !e.altKey) {
        var calcOpen = document.getElementById('quickKeypadModal');
        if (calcOpen && calcOpen.classList.contains('active')) return;
        var pctTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (pctTag !== 'input' && pctTag !== 'textarea') {
          e.preventDefault();
          if (typeof openPosDiscountPrompt === 'function') openPosDiscountPrompt();
          return;
        }
      }

      // Escape: close active modal
      if (e.key === 'Escape') {
        var activeModal = document.querySelector('.modal-overlay.active');
        if (activeModal) activeModal.classList.remove('active');
        var successOverlay = document.getElementById('posSaleSuccessOverlay');
        if (successOverlay) successOverlay.classList.remove('active');
        return;
      }
    }, true);
  }

  function togglePosFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(function () {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  }

  function closeKeyboardHelpModal() {
    var el = document.getElementById('shortcutsHelpModal');
    if (el) {
      el.classList.remove('active');
      if (typeof hideModal === 'function') hideModal('shortcutsHelpModal');
    }
  }

  function runCashierShortcut(action) {
    closeKeyboardHelpModal();
    setTimeout(function () {
      if (action === 'help') { goToCashierPage(); return; }
      if (action === 'barcode') {
        var bInput = document.getElementById('barcodeInput') || document.getElementById('headerSearchInput');
        if (bInput) { bInput.focus(); if (bInput.select) bInput.select(); }
        return;
      }
      if (action === 'search') {
        var sInput = document.getElementById('headerSearchInput');
        if (sInput) { sInput.focus(); if (sInput.select) sInput.select(); }
        return;
      }
      if (action === 'hold' && typeof holdSale === 'function') holdSale();
      if (action === 'newTab' && typeof createNewCustomerTab === 'function') createNewCustomerTab();
      if (action === 'closeTab' && typeof removeActiveCustomerTab === 'function') removeActiveCustomerTab();
      if (action === 'held') {
        if (typeof openSuspendedSalesModal === 'function') openSuspendedSalesModal();
      }
      if (action === 'cashMove' && typeof ShiftsManager !== 'undefined') ShiftsManager.openCashMovementModal('out');
      if (action === 'return' && typeof openReturnSaleModal === 'function') openReturnSaleModal();
      if (action === 'customer' && typeof openCustomerDisplay === 'function') openCustomerDisplay();
      if (action === 'full') togglePosFullscreen();
      if (action === 'drawer' && typeof openNoSaleDrawerModal === 'function') openNoSaleDrawerModal();
      if (action === 'pay' && typeof handlePosDirectPayment === 'function') handlePosDirectPayment(true);
      if (action === 'noPrint' && typeof handlePosDirectPayment === 'function') handlePosDirectPayment(false);
      if (action === 'n50' && typeof applyQuickCash === 'function') applyQuickCash(50000);
      if (action === 'n25' && typeof applyQuickCash === 'function') applyQuickCash(25000);
      if (action === 'n10' && typeof applyQuickCash === 'function') applyQuickCash(10000);
      if (action === 'n5' && typeof applyQuickCash === 'function') applyQuickCash(5000);
      if (action === 'usd100' && typeof UsdExchangeEngine !== 'undefined') UsdExchangeEngine.applyUsd(100);
      if (action === 'usd' && typeof UsdExchangeEngine !== 'undefined') UsdExchangeEngine.openRateModal();
      if (action === 'exact' && typeof applyExactCash === 'function') applyExactCash();
      if (action === 'print' && typeof smartPrintReceipt === 'function') smartPrintReceipt();
      if (action === 'barcodePage' && typeof switchSection === 'function') switchSection('barcode');
      if (action === 'qrCreate' && typeof openCashierQrBarcode === 'function') openCashierQrBarcode();
      if (action === 'productsStore' && typeof openCashierProductsStore === 'function') openCashierProductsStore();
      if (action === 'scale') openScaleSimulatorModal();
      if (action === 'menu' && typeof toggleSidebarMenu === 'function') toggleSidebarMenu();
      if (action === 'calc' && typeof toggleQuickKeypadModal === 'function') toggleQuickKeypadModal();
      if (action === 'clear' && typeof clearCurrentCart === 'function') clearCurrentCart();
      if (action === 'qtyMore' && typeof adjustSelectedCartQty === 'function') adjustSelectedCartQty(1);
      if (action === 'qtyLess' && typeof adjustSelectedCartQty === 'function') adjustSelectedCartQty(-1);
      if (action === 'discount' && typeof openPosDiscountPrompt === 'function') openPosDiscountPrompt();
      if (action === 'newProduct' && typeof openNewProductModal === 'function') openNewProductModal();
      if (action === 'card' && typeof handlePosCardSale === 'function') handlePosCardSale();
    }, 40);
  }

  function goToCashierPage() {
    try {
      var help = document.getElementById('shortcutsHelpModal');
      if (help) {
        help.classList.remove('active');
        if (typeof hideModal === 'function') hideModal('shortcutsHelpModal');
      }
    } catch (eHelp) {}
    if (typeof switchSection === 'function') switchSection('pos');
    setTimeout(function () {
      var b = document.getElementById('headerSearchInput') || document.getElementById('barcodeInput');
      if (b) {
        try { b.focus(); } catch (eF) {}
      }
    }, 80);
  }

  function openShortcutsHelpModal() {
    var modalId = 'shortcutsHelpModal';
    var existing = document.getElementById(modalId);
    if (existing) existing.remove();
    var div = document.createElement('div');
    div.id = modalId;
    div.className = 'modal-overlay';
    div.setAttribute('data-skip-autofocus', '1');
    div.onclick = function (ev) { if (ev.target === div) closeKeyboardHelpModal(); };
    div.innerHTML =
      '<div class="modal shortcut-help-modal">' +
        '<div class="modal-header">' +
          '<h2><i class="fas fa-keyboard"></i> دوگمە خێراکانی کاشێر</h2>' +
          '<button type="button" class="modal-close" data-sc-close>&times;</button>' +
        '</div>' +
        '<div class="modal-body" style="padding:16px 18px;">' +
          '<p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px;">کلیلەکە لێبدە، یان کلیک لەسەر هێڵەکە بکە بۆ کردنەوەی هەمان کردار.</p>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.9rem;">' +
            '<div class="shortcut-group-title">فرۆشتن و سەبەتە</div>' +
            '<div class="shortcut-box" data-sc="pay"><kbd>Space</kbd> <span>تەواوکردنی فرۆشتن + چاپی پسوڵە (وەک Ctrl+P)</span></div>' +
            '<div class="shortcut-box" data-sc="noPrint"><kbd>Ctrl + Space</kbd> <span>فرۆشتن بەبێ چاپی پسوڵە</span></div>' +
            '<div class="shortcut-box" data-sc="clear"><kbd>Delete</kbd> <span>پاککردنەوەی هەموو کاڵاکانی سەبەتە</span></div>' +
            '<div class="shortcut-box" data-sc="qtyMore"><kbd>↑ / →</kbd> <span>زیادکردنی بڕی کاڵای هەڵبژێردراو</span></div>' +
            '<div class="shortcut-box" data-sc="qtyLess"><kbd>↓ / ←</kbd> <span>کەمکردنەوەی بڕی کاڵای هەڵبژێردراو</span></div>' +
            '<div class="shortcut-box" data-sc="hold"><kbd>F4</kbd> <span>ڕاگرتنی فرۆشتن (Hold)</span></div>' +
            '<div class="shortcut-box" data-sc="held"><kbd>F6</kbd> <span>لیستی وەسڵە ڕاگیراوەکان</span></div>' +
            '<div class="shortcut-box" data-sc="return"><kbd>F8</kbd> <span>گەڕاندنەوەی کاڵا (مرتجع)</span></div>' +
            '<div class="shortcut-box" data-sc="discount"><kbd>%</kbd> <span>داشکاندنی پسوڵە (دوگمەی داشکاندن)</span></div>' +
            '<div class="shortcut-group-title">کاڵکۆڵەیتەر و پارە</div>' +
            '<div class="shortcut-box" data-sc="calc"><kbd>Ctrl + K</kbd> <span>کردنەوەی کاڵکۆڵەیتەر / ژمارەکان</span></div>' +
            '<div class="shortcut-box" data-sc="n10"><kbd>Ctrl + 1</kbd> <span>١٠,٠٠٠ دینار</span></div>' +
            '<div class="shortcut-box" data-sc="n25"><kbd>Ctrl + 2</kbd> <span>٢٥,٠٠٠ دینار</span></div>' +
            '<div class="shortcut-box" data-sc="n5"><kbd>Ctrl + 3</kbd> <span>٥,٠٠٠ دینار</span></div>' +
            '<div class="shortcut-box" data-sc="n50"><kbd>Ctrl + 5</kbd> <span>٥٠,٠٠٠ دینار</span></div>' +
            '<div class="shortcut-box" data-sc="usd100"><kbd>$100</kbd> <span>پەڕەی ١٠٠ دۆلار</span></div>' +
            '<div class="shortcut-box" data-sc="usd"><kbd>Alt + D</kbd> <span>نرخی ١٠٠ دۆلار</span></div>' +
            '<div class="shortcut-box" data-sc="exact"><kbd>Ctrl + 0</kbd> <span>پارەی تەواو (Exact)</span></div>' +
            '<div class="shortcut-box" data-sc="card"><kbd>Ctrl + D</kbd> <span>پارەدان بە کارت — پاشان Space/Ctrl+P چاپ، Ctrl+Space بێ چاپ</span></div>' +
            '<div class="shortcut-group-title">کڕیار و گەڕان</div>' +
            '<div class="shortcut-box" data-sc="barcode"><kbd>F2</kbd> <span>فۆکەس بۆ سکانەری بارکۆد</span></div>' +
            '<div class="shortcut-box" data-sc="search"><kbd>F3</kbd> <span>گەڕان بە ناوی کاڵا</span></div>' +
            '<div class="shortcut-box" data-sc="newTab"><kbd>F5</kbd> <span>تابی کڕیاری نوێ</span></div>' +
            '<div class="shortcut-box" data-sc="closeTab"><kbd>Shift + F5</kbd> <span>سڕینەوەی تابی کڕیار</span></div>' +
            '<div class="shortcut-group-title">ئامرازەکانی کاشێر</div>' +
            '<div class="shortcut-box" data-sc="newProduct"><kbd>Ctrl + N</kbd> <span>زیادکردنی کاڵای نوێ</span></div>' +
            '<div class="shortcut-box" data-sc="productsStore"><kbd>F10</kbd> <span>کۆگای کاڵا / بەرهەمەکان</span></div>' +
            '<div class="shortcut-box" data-sc="qrCreate"><kbd>Alt + Q</kbd> <span>دروستکردنی بارکۆدی QR</span></div>' +
            '<div class="shortcut-box" data-sc="cashMove"><kbd>F7</kbd> <span>جوڵەی پارەی سندوق</span></div>' +
            '<div class="shortcut-box" data-sc="drawer"><kbd>F12</kbd> <span>کردنەوەی کەشتی پارە</span></div>' +
            '<div class="shortcut-box" data-sc="print"><kbd>Ctrl + P</kbd> <span>چاپی پسوڵە</span></div>' +
            '<div class="shortcut-box" data-sc="customer"><kbd>F9</kbd> <span>شاشەی کڕیار</span></div>' +
            '<div class="shortcut-box" data-sc="full"><kbd>F11</kbd> <span>شاشەی تەواو</span></div>' +
            '<div class="shortcut-box" data-sc="menu"><kbd>Ctrl + B</kbd> <span>مێنیوی پەڕەکان / شاشەی تەواو</span></div>' +
            '<div class="shortcut-box" data-sc="barcodePage"><kbd>Alt + B</kbd> <span>چاپی بارکۆد و لەزگە</span></div>' +
            '<div class="shortcut-box" data-sc="scale"><kbd>Alt + W</kbd> <span>تەرازوو / باڕکۆدی کێش</span></div>' +
            '<div class="shortcut-box" data-sc="help"><kbd>F1</kbd> <span>گەڕانەوە بۆ پەڕەی کاشێر</span></div>' +
            '<div class="shortcut-box" data-sc="esc"><kbd>ESC</kbd> <span>داخستنی پەنجەرەکان</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button type="button" class="btn btn-primary" data-sc-close>تێگەیشتم</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(div);
    div.addEventListener('click', function (ev) {
      if (ev.target && ev.target.getAttribute('data-sc-close') !== null) {
        closeKeyboardHelpModal();
        return;
      }
      var row = ev.target.closest ? ev.target.closest('[data-sc]') : null;
      if (!row) return;
      var act = row.getAttribute('data-sc');
      if (act === 'esc') { closeKeyboardHelpModal(); return; }
      runCashierShortcut(act);
    });
    if (typeof showModal === 'function') showModal(modalId);
    else div.classList.add('active');
  }

  return {
    syncCustomerDisplay: syncCustomerDisplay,
    syncCashDisplay: syncCashDisplay,
    openCustomerDisplay: openCustomerDisplay,
    broadcastSaleComplete: broadcastSaleComplete,
    decodeScaleBarcode: decodeScaleBarcode,
    generateScaleBarcode: generateScaleBarcode,
    calculateEan13CheckDigit: calculateEan13CheckDigit,
    openScaleSimulatorModal: openScaleSimulatorModal,
    closeScaleSimulatorModal: closeScaleSimulatorModal,
    setScaleSimWeight: setScaleSimWeight,
    updateScaleSimPreview: updateScaleSimPreview,
    simulateScaleScan: simulateScaleScan,
    printCurrentScaleLabel: printCurrentScaleLabel,
    iqdToUsd: iqdToUsd,
    usdToIqd: usdToIqd,
    getUsdRate: getUsdRate,
    initKeyboardHotkeys: initKeyboardHotkeys,
    goToCashierPage: goToCashierPage,
    showKeyboardHelpModal: goToCashierPage,
    showShortcutsHelpModal: openShortcutsHelpModal,
    togglePosFullscreen: togglePosFullscreen,
    printTestReceipt: printTestReceipt,
    smartPrintReceipt: smartPrintReceipt
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SupermarketEngine;
}
