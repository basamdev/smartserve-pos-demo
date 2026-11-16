/* Sam Market POS — Barcode Return & Refund Engine (گەڕاندنەوەی کاڵا بە باڕکۆدی پسوڵە) */
var ReturnEngine = (function () {
  'use strict';

  var CURRENT_ORDER = null;
  var RETURN_ITEMS_STATE = [];
  var REFUND_METHOD = 'cash';
  var SELECTED_CUSTOMER = '';

  function t12(raw, sec) {
    return (typeof window.formatSaleTime === 'function') ? window.formatSaleTime(raw, sec) : '';
  }
  function t12dt(raw, sec) {
    return (typeof window.formatSaleDateTime === 'function') ? window.formatSaleDateTime(raw, sec) : '';
  }

  var REASON_LABELS = {
    'changed_mind': 'کڕیار پەشیمان بووەوە',
    'defective': 'خراپ/زیانلێکەوتوو',
    'expired': 'بەسەرچوو',
    'wrong_item': 'بەرهەمی هەڵە',
    'other': 'هۆکاری تر'
  };

  // 1. Barcode Detector for Invoice Numbers
  function isInvoiceBarcode(code) {
    if (!code || typeof code !== 'string') return false;
    var cleaned = code.trim();
    if (cleaned.length < 3) return false;

    // Direct prefix match for market invoice IDs
    if (/^(ord_|ORD-|REC-|TEST-|inv-|INV-|B\d{5})/i.test(cleaned)) {
      return true;
    }
    if (typeof parseBillScanCode === "function" && parseBillScanCode(cleaned) && typeof findOrderByBillScan === "function" && findOrderByBillScan(cleaned)) {
      return true;
    }

    // Match against DB orders in memory
    if (typeof DB !== 'undefined' && DB.orders && DB.orders.length > 0) {
      var upper = cleaned.toUpperCase();
      return DB.orders.some(function (o) {
        return o.id === cleaned ||
               o.id.toUpperCase() === upper ||
               o.id.slice(-8).toUpperCase() === upper ||
               o.id.slice(-6).toUpperCase() === upper;
      });
    }

    return false;
  }

  // 2. Open / Close Return Engine Modal
  function open(preloadedQuery) {
    if (typeof preloadedQuery !== 'string') preloadedQuery = '';
    preloadedQuery = preloadedQuery.trim();

    var modal = document.getElementById('returnSaleModal');
    if (!modal) return;

    if (typeof showModal === 'function') showModal('returnSaleModal');
    modal.classList.add('active');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    CURRENT_ORDER = null;
    RETURN_ITEMS_STATE = [];
    REFUND_METHOD = 'cash';
    SELECTED_CUSTOMER = '';

    var container = document.getElementById('returnOrderLoadedContainer');
    if (container) container.style.display = 'block';
    renderItemsTable();

    setConfirmButtonsDisabled(true);

    var refundBadge = document.getElementById('retTotalRefundAmountBadge');
    if (refundBadge) refundBadge.textContent = '0 د.ع';

    renderRecentOrdersChips();
    pickReason('changed_mind');

    var searchInput = document.getElementById('returnOrderSearch');
    if (searchInput) {
      searchInput.value = preloadedQuery || '';
      setTimeout(function () {
        searchInput.focus();
        if (preloadedQuery) {
          searchOrScanInvoice(preloadedQuery);
        }
      }, 100);
    }
  }

  function openWithBarcode(code) {
    open(code);
    if (typeof PosAudio !== 'undefined') PosAudio.playScanBeep();
    toast('پسوڵەی کڕین', 'باڕکۆدی پسوڵە خوێندرایەوە: ' + code, 'info');
  }

  function close() {
    var modal = document.getElementById('returnSaleModal');
    if (typeof hideModal === 'function') hideModal('returnSaleModal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = '';
      modal.setAttribute('aria-hidden', 'true');
    }
    CURRENT_ORDER = null;
    RETURN_ITEMS_STATE = [];
  }

  function customerKey(name) {
    return String(name || 'کڕیاری گشتی').trim() || 'کڕیاری گشتی';
  }

  function pickReason(reason) {
    var sel = document.getElementById('retReasonSelect');
    if (sel) sel.value = reason;
    document.querySelectorAll('.ret-reason-chip').forEach(function (btn) {
      var on = btn.getAttribute('data-reason') === reason;
      btn.style.background = on ? '#10b981' : 'transparent';
      btn.style.color = on ? '#fff' : '';
      btn.style.borderColor = on ? '#10b981' : '';
    });
    onReasonChange();
  }

  function handleReturnSearchEnter(query) {
    query = String(query || '').trim();
    if (!query) {
      toast('سکان', 'کاڵاکە سکان بکە (یان پسوڵە ئەگەر هەیە)', 'warning');
      return;
    }
    if (isInvoiceBarcode(query)) {
      searchOrScanInvoice(query);
      return;
    }
    scanProductForReturn(query);
    var searchInput = document.getElementById('returnOrderSearch');
    if (searchInput) searchInput.value = '';
  }

  // Today's receipts only — like a supermarket, not the full history
  function renderRecentOrdersChips() {
    var chipsContainer = document.getElementById('returnRecentOrdersChips');
    if (!chipsContainer) return;

    var today = new Date().toISOString().slice(0, 10);
    var orders = ((typeof DB !== 'undefined' && DB.orders) ? DB.orders : []).filter(function (o) {
      return String(o.date || o.orderDate || '').slice(0, 10) === today;
    }).reverse().slice(0, 6);

    if (orders.length === 0) {
      chipsContainer.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted,#94a3b8);">کاڵاکە سکان بکە — پێویست بە پسوڵە نییە</span>';
      return;
    }

    chipsContainer.innerHTML = orders.map(function (o) {
      var shortId = (typeof orderBillNo === "function" && orderBillNo(o)) || o.id.slice(-8).toUpperCase();
      var totalStr = (typeof fmt === 'function') ? fmt(o.total) : (Number(o.total || 0).toLocaleString() + ' د.ع');
      var dateStr = o.date ? t12(o.date) : '';
      return '<button type="button" class="btn btn-xs btn-outline" onclick="ReturnEngine.searchOrScanInvoice(\'' + o.id + '\')" style="white-space:nowrap;padding:4px 10px;font-size:0.75rem;display:flex;align-items:center;gap:6px;border-radius:6px;background:rgba(255,255,255,0.03);">' +
             '<i class="fas fa-receipt" style="color:#38bdf8;"></i>' +
             '<span>#' + shortId + '</span>' +
             '<span style="color:#10b981;font-weight:700;">' + totalStr + '</span>' +
             (dateStr ? '<span style="color:var(--text-muted);font-size:0.7rem;">(' + dateStr + ')</span>' : '') +
             '</button>';
    }).join('');
  }

  // 4. Search or Scan Invoice
  function searchOrScanInvoice(query) {
    if (!query || !query.trim()) {
      toast('ئاگاداری', 'تکایە باڕکۆد یان ژمارەی پسوڵە بنووسە', 'warning');
      return;
    }
    var cleanQuery = query.trim();

    // First try backend API for real-time lookup with returned quantities
    var baseUrl = (typeof ApiClient !== "undefined" && ApiClient.getBaseUrl) ? ApiClient.getBaseUrl() : ((window.location && window.location.origin && window.location.origin.indexOf("http") === 0) ? window.location.origin : "http://localhost:3005");
    var apiUrl = baseUrl + '/api/orders/lookup/' + encodeURIComponent(cleanQuery);
    fetch(apiUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('Not found on server');
        return res.json();
      })
      .then(function (data) {
        if (data && data.order) {
          loadOrderIntoUI(data.order);
        } else {
          fallbackLocalLookup(cleanQuery);
        }
      })
      .catch(function () {
        fallbackLocalLookup(cleanQuery);
      });
  }

  function fallbackLocalLookup(query) {
    if (typeof DB === 'undefined' || !DB.orders) {
      toast('هەڵە', 'داتابەیسی پسوڵەکان بەردەست نییە', 'error');
      return;
    }

    var upper = query.toUpperCase();
    var order = (typeof findOrderByBillScan === "function") ? findOrderByBillScan(query) : null;
    if (!order) {
      order = DB.orders.find(function (o) {
        return o.id === query ||
               o.id.toUpperCase() === upper ||
               o.id.slice(-8).toUpperCase() === upper ||
               o.id.slice(-6).toUpperCase() === upper ||
               (typeof orderBillNo === "function" && orderBillNo(o) && orderBillNo(o) === (typeof parseBillScanCode === "function" ? parseBillScanCode(query) : "")) ||
               (o.customerName && o.customerName.toLowerCase().indexOf(query.toLowerCase()) !== -1);
      });
    }

    if (!order) {
      if (typeof PosAudio !== 'undefined') PosAudio.playErrorBuzz();
      toast('نەدۆزرایەوە', 'هیچ پسوڵەیەک نەدۆزرایەوە بەم بارکۆدە: ' + query, 'error');
      return;
    }

    // Attach remaining returnables locally
    var prevReturns = (typeof RETURN_SALES !== 'undefined' && RETURN_SALES) ? RETURN_SALES.filter(function (r) {
      return r.originalOrderId === order.id;
    }) : [];

    var returnedMap = {};
    prevReturns.forEach(function (r) {
      (r.items || []).forEach(function (ri) {
        var key = ri.prodId || ri.name;
        returnedMap[key] = (returnedMap[key] || 0) + (parseFloat(ri.returnQty) || 0);
      });
    });

    var itemsWithLimits = (order.items || []).map(function (item) {
      var key = item.prodId || item.name;
      var already = returnedMap[key] || 0;
      var orig = parseFloat(item.qty) || 1;
      var max = Math.max(0, Math.round((orig - already) * 1000) / 1000);
      return Object.assign({}, item, {
        alreadyReturned: already,
        maxReturnable: max
      });
    });

    loadOrderIntoUI(Object.assign({}, order, { items: itemsWithLimits }));
  }

  function startNoReceiptReturn(product, qty) {
    addProductToReturnBasket(product, qty || 1);
  }

  function addProductToReturnBasket(product, qty) {
    qty = qty || 1;
    var metaP = lookupProductMeta({ prodId: product.id, name: product.name, barcode: product.barcode, image: product.image });
    var last = findLatestSaleOfProduct(product);
    var sold = null;
    if (last) {
      sold = (last.items || []).find(function (it) {
        return (it.prodId && String(it.prodId) === String(product.id)) || it.name === product.name;
      });
    }
    var price = sold ? (parseFloat(sold.price) || 0) : (parseFloat(product.price) || 0);
    var origQty = sold ? (parseFloat(sold.qty) || 1) : 999;
    var already = sold ? (parseFloat(sold.alreadyReturned) || 0) : 0;
    var maxR = sold ? Math.max(qty, origQty - already) : 999;

    var foundIdx = -1;
    for (var i = 0; i < RETURN_ITEMS_STATE.length; i++) {
      var it = RETURN_ITEMS_STATE[i];
      if ((it.prodId && String(it.prodId) === String(product.id)) || it.name === product.name) {
        foundIdx = i;
        break;
      }
    }
    if (foundIdx >= 0) {
      setReturnItemQty(foundIdx, (RETURN_ITEMS_STATE[foundIdx].returnQty || 0) + qty);
      toast('گەڕانەوە', '"' + product.name + '" — بڕ: ' + RETURN_ITEMS_STATE[foundIdx].returnQty, 'success');
      return;
    }

    if (!CURRENT_ORDER) {
      CURRENT_ORDER = {
        id: 'noreceipt_' + Date.now(),
        customerName: 'کڕیاری گشتی',
        cashier: (typeof getActiveOperatorName === 'function') ? getActiveOperatorName() : 'کاشیر',
        date: new Date().toISOString(),
        total: price * qty,
        items: []
      };
    }

    var container = document.getElementById('returnOrderLoadedContainer');
    if (container) container.style.display = 'block';

    RETURN_ITEMS_STATE.push({
      idx: RETURN_ITEMS_STATE.length,
      prodId: product.id,
      name: metaP.name,
      barcode: metaP.barcode || product.barcode || '',
      image: metaP.image || product.image || '',
      price: price,
      cost: parseFloat(product.cost) || 0,
      unit: product.unit || 'piece',
      originalQty: origQty,
      alreadyReturned: already,
      maxReturnable: maxR,
      returnQty: qty,
      packQty: parseFloat(product.packQty) || 1,
      restocked: true
    });
    renderItemsTable();
    recalculateRefund();
    if (typeof PosAudio !== 'undefined') PosAudio.playScanBeep();
    toast('گەڕانەوە', '"' + product.name + '"' + (metaP.barcode ? ' · ' + metaP.barcode : '') + ' زیادکرا', 'success');
  }

  function syncCustomerFromOrder(order) {
    if (!order) return;
    SELECTED_CUSTOMER = customerKey(order.customerName);
  }

  // 5. Load Order Into Return Modal UI
  function loadOrderIntoUI(order) {
    CURRENT_ORDER = order;
    syncCustomerFromOrder(order);
    var container = document.getElementById('returnOrderLoadedContainer');
    if (!container) return;

    container.style.display = 'block';

    // Header info
    var shortId = (typeof orderBillNo === "function" && orderBillNo(order)) || order.id.slice(-8).toUpperCase();
    var ordDate = order.date || order.orderDate ? new Date(order.date || order.orderDate) : new Date();
    var dateStr = t12dt(ordDate);

    if (document.getElementById('retOrdIdDisplay')) document.getElementById('retOrdIdDisplay').textContent = '#' + shortId;
    if (document.getElementById('retOrdDateDisplay')) document.getElementById('retOrdDateDisplay').textContent = dateStr;
    if (document.getElementById('retOrdCashierDisplay')) document.getElementById('retOrdCashierDisplay').textContent = order.cashier || 'کاشیر';
    if (document.getElementById('retOrdCustomerDisplay')) document.getElementById('retOrdCustomerDisplay').textContent = order.customerName || 'کڕیاری گشتی';
    if (document.getElementById('retOrdTotalDisplay')) {
      document.getElementById('retOrdTotalDisplay').textContent = (typeof fmt === 'function') ? fmt(order.total) : (Number(order.total || 0).toLocaleString() + ' د.ع');
    }

    // Initialize items state
    RETURN_ITEMS_STATE = (order.items || []).map(function (item, idx) {
      var origQty = parseFloat(item.qty) || 1;
      var alreadyReturned = parseFloat(item.alreadyReturned) || 0;
      var maxReturnable = (item.maxReturnable !== undefined) ? item.maxReturnable : Math.max(0, origQty - alreadyReturned);
      var metaP = lookupProductMeta(item);

      return {
        idx: idx,
        prodId: item.prodId || item.id || null,
        name: metaP.name,
        barcode: metaP.barcode,
        image: metaP.image,
        price: parseFloat(item.price) || 0,
        cost: parseFloat(item.cost) || 0,
        unit: item.unit || 'piece',
        originalQty: origQty,
        alreadyReturned: alreadyReturned,
        maxReturnable: maxReturnable,
        returnQty: 0,
        packQty: parseFloat(item.packQty) || 1,
        restocked: true
      };
    });

    renderItemsTable();
    recalculateRefund();
    if (typeof PosAudio !== 'undefined') PosAudio.playScanBeep();
  }

  function lookupProductMeta(item) {
    var products = (typeof DB !== 'undefined' && DB.products) ? DB.products : [];
    var p = products.find(function (x) {
      return (item.prodId && String(x.id) === String(item.prodId)) ||
             (item.name && x.name === item.name);
    });
    return {
      barcode: item.barcode || (p && (p.barcode || p.packBarcode)) || '',
      image: item.image || (p && p.image) || '',
      name: item.name || (p && p.name) || 'کاڵا'
    };
  }

  function isReceiptSession() {
    return CURRENT_ORDER && CURRENT_ORDER.id && String(CURRENT_ORDER.id).indexOf('noreceipt_') !== 0;
  }

  // 6. Render return item cards (name + barcode + price)
  function renderItemsTable() {
    var wrap = document.getElementById('returnItemsCards');
    var tbody = document.getElementById('returnItemsTableBody');
    var meta = document.getElementById('returnReceiptMeta');
    if (meta) meta.style.display = isReceiptSession() ? 'flex' : 'none';

    if (!RETURN_ITEMS_STATE.length) {
      var empty = '<div style="text-align:center;padding:22px;color:var(--text-muted);font-weight:700;">کاڵا سکان بکە — ناو، بارکۆد و نرخ لێرە دەردەکەوێت</div>';
      if (wrap) wrap.innerHTML = empty;
      if (tbody) tbody.innerHTML = '';
      return;
    }

    var html = RETURN_ITEMS_STATE.map(function (item, idx) {
      var metaP = lookupProductMeta(item);
      item.barcode = item.barcode || metaP.barcode;
      item.image = item.image || metaP.image;
      var unitLabel = item.unit === 'kg' ? 'کگم' : (item.unit === 'gram' ? 'گرام' : 'دانە');
      var priceStr = (typeof fmt === 'function') ? fmt(item.price) : (Number(item.price).toLocaleString() + ' د.ع');
      var lineStr = (typeof fmt === 'function') ? fmt((item.returnQty || 0) * item.price) : String(Math.round((item.returnQty || 0) * item.price));
      var isZeroReturnable = item.maxReturnable <= 0;
      var on = (item.returnQty || 0) > 0;
      var thumb = item.image
        ? '<img src="' + item.image + '" alt="">'
        : '<i class="fas fa-box"></i>';
      var already = item.alreadyReturned > 0 ? (' · پێشتر گەڕاوە: ' + item.alreadyReturned + ' ' + unitLabel) : '';
      var qtyCtl = isZeroReturnable
        ? '<span style="color:#ef4444;font-size:0.8rem;font-weight:800;">تەواوی گەڕاوەتەوە</span>'
        : '<div class="ret-item-qty">' +
            '<button type="button" class="btn btn-xs btn-outline" onclick="ReturnEngine.stepReturnItemQty(' + idx + ', -1)" style="width:32px;height:32px;padding:0;font-weight:900;">−</button>' +
            '<input type="number" id="retQtyInput_' + idx + '" value="' + item.returnQty + '" min="0" max="' + item.maxReturnable + '" step="' + (item.unit === 'kg' ? '0.25' : '1') + '" onchange="ReturnEngine.setReturnItemQty(' + idx + ', this.value)">' +
            '<button type="button" class="btn btn-xs" onclick="ReturnEngine.stepReturnItemQty(' + idx + ', 1)" style="width:32px;height:32px;padding:0;font-weight:900;background:#10b981;border:none;color:#fff;">+</button>' +
            '<button type="button" class="btn btn-xs btn-outline" onclick="ReturnEngine.returnAllItem(' + idx + ')" style="font-weight:800;">هەموو</button>' +
          '</div>';
      return '<div class="ret-item-card' + (on ? ' is-on' : '') + (isZeroReturnable ? ' is-done' : '') + '">' +
        '<div class="ret-item-thumb">' + thumb + '</div>' +
        '<div class="ret-item-info">' +
          '<div class="ret-item-name">' + (item.name || metaP.name) + '</div>' +
          (item.barcode ? '<div class="ret-item-barcode"><i class="fas fa-barcode"></i> ' + item.barcode + '</div>' : '<div class="ret-item-barcode" style="color:#94a3b8;">بارکۆد نییە</div>') +
          '<div class="ret-item-meta">نرخ: ' + priceStr + ' · کڕدراو: ' + item.originalQty + ' ' + unitLabel + already + '</div>' +
        '</div>' +
        qtyCtl +
        '<div class="ret-item-line">' + lineStr + '</div>' +
      '</div>';
    }).join('');
    if (wrap) wrap.innerHTML = html;
    if (tbody) tbody.innerHTML = '';
  }

  // 7. Quantity Change Handlers
  function setReturnItemQty(idx, val) {
    var item = RETURN_ITEMS_STATE[idx];
    if (!item) return;

    var num = parseFloat(val) || 0;
    if (num < 0) num = 0;
    if (num > item.maxReturnable) {
      num = item.maxReturnable;
      toast('ئاگاداری', 'بڕی گەڕانەوە ناتوانێت لە بڕی کڕدراوی ماوە زیاتر بێت (' + item.maxReturnable + ')', 'warning');
    }

    item.returnQty = Math.round(num * 1000) / 1000;
    renderItemsTable();
    recalculateRefund();
  }

  function stepReturnItemQty(idx, delta) {
    var item = RETURN_ITEMS_STATE[idx];
    if (!item) return;

    var step = (item.unit === 'kg') ? 0.25 : 1;
    var current = item.returnQty || 0;
    var newQty = current + (delta > 0 ? step : -step);
    setReturnItemQty(idx, newQty);
  }

  function returnAllItem(idx) {
    var item = RETURN_ITEMS_STATE[idx];
    if (!item) return;
    setReturnItemQty(idx, item.maxReturnable);
  }

  function returnAllOrder() {
    RETURN_ITEMS_STATE.forEach(function (item, idx) {
      setReturnItemQty(idx, item.maxReturnable);
    });
    toast('سەرکەوتوو', 'تەواوی کاڵاکانی پسوڵەکە بۆ گەڕاندنەوە دیاریکران', 'info');
  }

  // 8. Recalculate Total Refund
  function recalculateRefund() {
    var totalRefund = 0;
    var totalCount = 0;

    RETURN_ITEMS_STATE.forEach(function (item) {
      if (item.returnQty > 0) {
        totalRefund += (item.returnQty * item.price);
        totalCount += item.returnQty;
      }
    });

    totalRefund = Math.round(totalRefund);

    var badge = document.getElementById('retTotalRefundAmountBadge');
    if (badge) {
      badge.textContent = (typeof fmt === 'function') ? fmt(totalRefund) : (totalRefund.toLocaleString() + ' د.ع');
    }

    setConfirmButtonsDisabled(totalRefund <= 0);

    return totalRefund;
  }

  function setConfirmButtonsDisabled(disabled) {
    ['retConfirmBtn', 'retSaveBtn'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.disabled = !!disabled;
    });
  }

  // 9. Reason & Restock Management
  function onReasonChange() {
    var sel = document.getElementById('retReasonSelect');
    var chk = document.getElementById('retRestockCheckbox');
    if (!sel || !chk) return;

    var val = sel.value;
    // Defective or expired items should not be returned to sellable inventory by default
    if (val === 'defective' || val === 'expired') {
      chk.checked = false;
      toast('ئاگاداری کۆگا', 'بەرهەمی تێکچوو یان بەسەرچوو ناگەڕێتەوە ناو کۆگا', 'warning');
    } else {
      chk.checked = true;
    }
  }

  function setRefundMethod(method) {
    REFUND_METHOD = method;
    var btnCash = document.getElementById('retMethodCash');
    var btnDebt = document.getElementById('retMethodDebt');

    if (btnCash) {
      if (method === 'cash') {
        btnCash.style.background = '#10b981';
        btnCash.style.color = '#fff';
      } else {
        btnCash.style.background = 'var(--bg-input,#0f172a)';
        btnCash.style.color = '#fff';
      }
    }

    if (btnDebt) {
      if (method === 'debt') {
        btnDebt.style.background = '#10b981';
        btnDebt.style.color = '#fff';
      } else {
        btnDebt.style.background = 'var(--bg-input,#0f172a)';
        btnDebt.style.color = '#fff';
      }
    }
  }

  // 10. Submit Return Sale — printAfter true = save & print, false = save only
  function submitReturn(printAfter) {
    if (!CURRENT_ORDER) return;
    var shouldPrint = printAfter !== false;

    var reasonSel = document.getElementById('retReasonSelect');
    var reason = reasonSel ? reasonSel.value : '';
    var note = document.getElementById('retNoteInput') ? document.getElementById('retNoteInput').value.trim() : '';
    if (!reason) {
      toast('هۆکار', 'تکایە هۆکاری گەڕاندنەوە هەڵبژێرە', 'warning');
      if (reasonSel) reasonSel.focus();
      return;
    }
    if (reason === 'other' && !note) {
      toast('هۆکار', 'تکایە تێبینی بنووسە بۆ هۆکاری تر', 'warning');
      return;
    }

    var totalRefund = recalculateRefund();
    if (totalRefund <= 0) {
      toast('هەڵە', 'تکایە بڕی گەڕانەوە دیاری بکە — بۆ نموونە تەنها ١ دانە لە ١٠ (+١ دانە)', 'error');
      return;
    }

    var returnItems = RETURN_ITEMS_STATE.filter(function (i) { return i.returnQty > 0; }).map(function (i) {
      return {
        prodId: i.prodId,
        name: i.name,
        price: i.price,
        cost: i.cost,
        originalQty: i.originalQty,
        returnQty: i.returnQty,
        refundAmount: Math.round(i.returnQty * i.price),
        unit: i.unit,
        packQty: i.packQty || 1,
        restocked: document.getElementById('retRestockCheckbox') ? document.getElementById('retRestockCheckbox').checked : true
      };
    });

    var restocked = document.getElementById('retRestockCheckbox') ? document.getElementById('retRestockCheckbox').checked : true;

    var activeShiftId = null;
    if (typeof CURRENT_SHIFT !== 'undefined' && CURRENT_SHIFT) activeShiftId = CURRENT_SHIFT.id;
    else if (typeof DB !== 'undefined' && DB.currentShift) activeShiftId = DB.currentShift.id;

    var cashierName = (typeof DB !== 'undefined' && DB.currentUser) ? DB.currentUser.name : 'کاشیر';

    var returnRecord = {
      id: 'ret_' + Date.now(),
      originalOrderId: CURRENT_ORDER.id,
      cashier: cashierName,
      shiftId: activeShiftId,
      customerName: CURRENT_ORDER.customerName || 'کڕیاری گشتی',
      customerId: CURRENT_ORDER.customerId || null,
      date: new Date().toISOString(),
      refundAmount: totalRefund,
      refundMethod: REFUND_METHOD,
      reason: reason,
      restocked: restocked ? 1 : 0,
      items: returnItems,
      note: note
    };

    // Send to backend
    var baseUrl = (typeof ApiClient !== "undefined" && ApiClient.getBaseUrl) ? ApiClient.getBaseUrl() : ((window.location && window.location.origin && window.location.origin.indexOf("http") === 0) ? window.location.origin : "http://localhost:3005");
    fetch(baseUrl + '/api/returns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(returnRecord)
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      finalizeReturn(returnRecord, data, shouldPrint);
    })
    .catch(function () {
      finalizeReturn(returnRecord, { success: true, returnId: returnRecord.id }, shouldPrint);
    });
  }

  function finalizeReturn(returnRecord, apiResult, shouldPrint) {
    if (typeof RETURN_SALES === 'undefined') window.RETURN_SALES = [];
    RETURN_SALES.push(returnRecord);

    if (typeof DataStore !== 'undefined' && DataStore.saveReturnSales) {
      DataStore.saveReturnSales(RETURN_SALES);
    }

    // Local product stock increment — always numeric so 11 + 1 = 12 (not "111")
    var stockNotes = [];
    if (returnRecord.restocked && typeof DB !== 'undefined' && DB.products) {
      returnRecord.items.forEach(function (item) {
        var qty = parseFloat(item.returnQty) || 0;
        if (qty <= 0) return;
        var pieces = (item.unit === 'carton') ? (qty * (parseFloat(item.packQty) || 1)) : qty;
        var p = null;
        if (item.prodId) p = DB.products.find(function (prod) { return String(prod.id) === String(item.prodId); });
        if (!p && item.name) p = DB.products.find(function (prod) { return prod.name === item.name; });
        if (p) {
          var before = parseFloat(p.stock) || 0;
          p.stock = before + pieces;
          stockNotes.push(p.name + ': ' + before + ' → ' + p.stock);
        }
      });
      if (typeof DataStore !== 'undefined' && DataStore.saveProducts) DataStore.saveProducts();
      if (typeof ApiClient !== 'undefined' && ApiClient.saveProduct) {
        returnRecord.items.forEach(function (item) {
          var p = item.prodId ? DB.products.find(function (prod) { return String(prod.id) === String(item.prodId); }) : null;
          if (p) ApiClient.saveProduct(p).catch(function () {});
        });
      }
    }

    // Local shift expense / cash out deduction
    if (returnRecord.shiftId && returnRecord.refundMethod === 'cash') {
      if (typeof DB !== 'undefined' && DB.expenses) {
        DB.expenses.push({
          id: 'exp_' + Date.now(),
          type: 'return',
          category: 'return',
          amount: returnRecord.refundAmount,
          description: 'گەڕاندنەوەی پسوڵەی #' + returnRecord.originalOrderId.slice(-6),
          date: returnRecord.date,
          shiftId: returnRecord.shiftId,
          addedBy: returnRecord.cashier
        });
        if (typeof DataStore !== 'undefined' && DataStore.saveExpenses) DataStore.saveExpenses();
      }
    }

    var originalOrder = CURRENT_ORDER;
    close();
    if (shouldPrint !== false) {
      printReturnReceipt(returnRecord, originalOrder);
    }

    if (typeof PosAudio !== 'undefined') PosAudio.playCashChime();
    var reasonText = REASON_LABELS[returnRecord.reason] || returnRecord.reason;
    var stockMsg = stockNotes.length ? (' | کۆگا: ' + stockNotes.join('، ')) : '';
    var printMsg = shouldPrint !== false ? ' و چاپکرا' : ' (بێ چاپ)';
    toast('سەرکەوتوو', 'گەڕاندنەوە تۆمارکرا' + printMsg + ' (' + reasonText + ') ' + (typeof fmt === 'function' ? fmt(returnRecord.refundAmount) : returnRecord.refundAmount) + stockMsg, 'success');

    renderReturnSalesArchive();
    if (typeof renderPosGrid === 'function') renderPosGrid();
    if (typeof renderProducts === 'function') renderProducts();
    if (typeof renderInventory === 'function') renderInventory();
  }

  // 11. Print Return Receipt (80mm Xprinter Thermal Return Voucher)
  function printReturnReceipt(returnRecord, originalOrder) {
    var marketName = (typeof getStoreName === 'function') ? getStoreName() : 'مارکێت';
    var marketAddress = (typeof DB !== 'undefined' && DB.settings && DB.settings.address) ? DB.settings.address : '';
    var marketPhone = (typeof DB !== 'undefined' && DB.settings && DB.settings.phone) ? DB.settings.phone : '';

    var retDate = new Date(returnRecord.date);
    var dateStr = t12dt(retDate);

    var itemsRows = (returnRecord.items || []).map(function (i) {
      var unitLabel = i.unit === 'kg' ? 'کگم' : (i.unit === 'gram' ? 'گرام' : 'x');
      return '<tr>' +
             '<td style="text-align:right;padding:8px 2px;font-weight:800;">' + i.name + '</td>' +
             '<td style="text-align:center;padding:8px 2px;font-weight:800;">' + i.returnQty + ' ' + unitLabel + '</td>' +
             '<td style="text-align:left;padding:8px 2px;font-weight:900;">' + Number(i.refundAmount).toLocaleString() + '</td>' +
             '</tr>';
    }).join('');

    var returnBarcodeSvg = (typeof BarcodeGen !== 'undefined')
      ? BarcodeGen.code128Svg(returnRecord.id, { height: 48, barWidth: 2.0, showText: true, fontSize: 14 })
      : ('<div style="font-family:monospace;letter-spacing:2px;font-size:16px;font-weight:800;">*' + returnRecord.id + '*</div>');

    var reasonText = {
      'changed_mind': 'کڕیار پەشیمان بووەوە',
      'defective': 'بەرهەمی زیانلێکەوتوو/خراپ',
      'expired': 'بەسەرچوونی ماوە',
      'wrong_item': 'بەرهەمی هەڵە',
      'other': 'هۆکاری تر'
    }[returnRecord.reason] || returnRecord.reason;

    var html = '<!DOCTYPE html>' +
      '<html lang="ku" dir="rtl">' +
      '<head><meta charset="UTF-8"><title>Return Voucher</title>' +
      '<style>' +
      '@page { size: 80mm auto; margin: 0; }' +
      '@media print { @page { size: 80mm auto; margin: 0; } body { width: 100%; } }' +
      '* { box-sizing: border-box; }' +
      'body { margin: 0; padding: 8px 12px; font-family: "Segoe UI", Tahoma, Arial, sans-serif; font-size: 16px; color: #000; line-height: 1.45; width: 100%; }' +
      '.rc-center { text-align: center; }' +
      '.rc-dash { border: none; border-top: 2px dashed #000; margin: 8px 0; }' +
      '.rc-title { font-size: 18px; font-weight: 900; margin: 8px 0; text-align: center; background: #000; color: #fff; padding: 8px 4px; }' +
      '.rc-table { width: 100%; border-collapse: collapse; font-size: 16px; margin: 8px 0; }' +
      '.rc-table th { border-bottom: 2px solid #000; padding: 6px 2px; font-size: 15px; font-weight: 900; }' +
      '.rc-row { font-size: 16px; font-weight: 700; margin: 4px 0; }' +
      '</style>' +
      '</head>' +
      '<body>' +
      '<div class="rc-center">' +
      '<div style="font-size:26px;font-weight:900;line-height:1.2;">' + marketName + '</div>' +
      (marketAddress ? '<div style="font-size:14px;font-weight:700;margin-top:4px;">' + marketAddress + '</div>' : '') +
      (marketPhone ? '<div style="font-size:15px;font-weight:800;margin-top:2px;">Tel: ' + marketPhone + '</div>' : '') +
      '</div>' +
      '<div class="rc-title">پسوڵەی گەڕاندنەوە</div>' +
      '<div class="rc-dash"></div>' +
      '<div class="rc-row">ژمارەی گەڕاندنەوە: <strong>#' + returnRecord.id.slice(-8).toUpperCase() + '</strong></div>' +
      '<div class="rc-row">پسوڵەی سەرەکی: <strong>#' + (originalOrder ? ((typeof orderBillNo === "function" && orderBillNo(originalOrder)) || originalOrder.id.slice(-8).toUpperCase()) : returnRecord.originalOrderId.slice(-8).toUpperCase()) + '</strong></div>' +
      '<div class="rc-row">بەروار و کات: <strong>' + dateStr + '</strong></div>' +
      '<div class="rc-row">کاشیر: <strong>' + returnRecord.cashier + '</strong></div>' +
      '<div class="rc-row">کڕیار: <strong>' + returnRecord.customerName + '</strong></div>' +
      '<div class="rc-row">هۆکار: <strong>' + reasonText + '</strong></div>' +
      '<div class="rc-row">کۆگا: <strong>' + (returnRecord.restocked ? 'گەڕاوەتەوە بۆ کۆگا' : 'فەوتاو / زیانلێکەوتوو') + '</strong></div>' +
      '<div class="rc-dash"></div>' +
      '<table class="rc-table">' +
      '<thead><tr><th style="text-align:right;">کاڵا</th><th style="text-align:center;">بڕ</th><th style="text-align:left;">بڕی پارە</th></tr></thead>' +
      '<tbody>' + itemsRows + '</tbody>' +
      '</table>' +
      '<div class="rc-dash"></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:22px;font-weight:900;padding:10px 0;border-top:2px solid #000;border-bottom:2px solid #000;">' +
      '<span>کۆی پارەی گەڕاوە</span>' +
      '<span>' + Number(returnRecord.refundAmount).toLocaleString() + ' د.ع</span>' +
      '</div>' +
      '<div style="font-size:16px;font-weight:800;display:flex;justify-content:space-between;margin-top:8px;">' +
      '<span>شێوازی دانەوە:</span>' +
      '<span>' + (returnRecord.refundMethod === 'cash' ? 'نەقد لە سندوق' : 'داشکاندنی باڵانس') + '</span>' +
      '</div>' +
      '<div class="rc-dash"></div>' +
      '<div style="margin:10px 0;display:flex;justify-content:center;">' + returnBarcodeSvg + '</div>' +
      '<div style="text-align:center;font-size:15px;font-weight:800;margin-top:10px;">واژۆی کاشیر: ........................</div>' +
      '<div style="text-align:center;font-size:15px;font-weight:800;margin-top:10px;">واژۆی کڕیار: ........................</div>' +
      '</body></html>';

    if (typeof ImmediatePrinter !== "undefined") {
      ImmediatePrinter.print(html, { pageSize: '80mm' });
    } else {
      try { window.print(); } catch (e) {}
    }
  }

  // 12. Render Return Sales Archive Table
  function renderReturnSalesArchive() {
    var tbody = document.getElementById('returnSalesTableBody');
    if (!tbody) return;

    var returns = [];
    if (typeof RETURN_SALES !== 'undefined' && RETURN_SALES) returns = RETURN_SALES.slice().reverse();

    if (returns.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">هیچ گەڕاندنەوەیەکی فرۆشتن تۆمار نەکراوە</td></tr>';
      return;
    }

    tbody.innerHTML = returns.map(function (r, idx) {
      var shortRetId = r.id.slice(-8).toUpperCase();
      var shortOrdId = r.originalOrderId.slice(-8).toUpperCase();
      var retDate = r.date ? new Date(r.date) : new Date();
      var dateStr = t12dt(retDate);
      var amountStr = (typeof fmt === 'function') ? fmt(r.refundAmount) : (Number(r.refundAmount).toLocaleString() + ' د.ع');

      var reasonLabels = {
        'changed_mind': 'پەشیمان بووەوە',
        'defective': 'خراپ/تێکچوو',
        'expired': 'بەسەرچوو',
        'wrong_item': 'بەرهەمی هەڵە',
        'other': 'تر'
      };

      return '<tr>' +
             '<td>' + (idx + 1) + '</td>' +
             '<td><strong style="color:#38bdf8;cursor:pointer;" onclick="ReturnEngine.printReturnReceiptById(\'' + r.id + '\')">#' + shortRetId + '</strong> <span style="font-size:0.75rem;color:var(--text-muted);">(پسوڵە: #' + shortOrdId + ')</span></td>' +
             '<td>' + dateStr + '</td>' +
             '<td>' + (r.customerName || 'کڕیاری گشتی') + '</td>' +
             '<td style="font-weight:800;color:#ef4444;">' + amountStr + '</td>' +
             '<td><span class="badge badge-warning">' + (reasonLabels[r.reason] || r.reason) + '</span></td>' +
             '<td>' + (r.restocked ? '<span class="badge badge-success">کۆگا</span>' : '<span class="badge badge-danger">فەوتاو</span>') + '</td>' +
             '<td>' +
               '<button type="button" class="btn btn-xs btn-outline" onclick="ReturnEngine.printReturnReceiptById(\'' + r.id + '\')" title="چاپکردنەوەی پسوڵە"><i class="fas fa-print"></i> چاپ</button>' +
             '</td>' +
             '</tr>';
    }).join('');
  }

  function printReturnReceiptById(returnId) {
    var ret = (typeof RETURN_SALES !== 'undefined' && RETURN_SALES) ? RETURN_SALES.find(function (r) { return r.id === returnId; }) : null;
    if (!ret) return;

    var origOrder = (typeof DB !== 'undefined' && DB.orders) ? DB.orders.find(function (o) { return o.id === ret.originalOrderId; }) : null;
    printReturnReceipt(ret, origOrder);
  }

  // 13. Resolve a scanned barcode to a product (piece / pack / scale / weighed)
  function findLatestSaleOfProduct(product) {
    var orders = (typeof DB !== 'undefined' && DB.orders) ? DB.orders.slice() : [];
    var byId = [];
    var byName = [];
    orders.forEach(function (o) {
      (o.items || []).forEach(function (it) {
        var sameId = (it.prodId && String(it.prodId) === String(product.id)) ||
                     (it.id && String(it.id) === String(product.id));
        var sameName = it.name && product.name && it.name === product.name;
        if (sameId) byId.push(o);
        else if (sameName) byName.push(o);
      });
    });
    function newest(list) {
      return list.sort(function (a, b) {
        return new Date(b.date || b.orderDate || 0) - new Date(a.date || a.orderDate || 0);
      })[0] || null;
    }
    return newest(byId) || newest(byName);
  }

  function resolveProductByCode(code) {
    if (typeof DB === 'undefined' || !DB.products) return null;
    var c = String(code).trim();

    if (typeof findProductByScannedCode === 'function') {
      var known = findProductByScannedCode(c);
      if (known) return { product: known, qty: 1 };
    }

    // Direct match: barcode / id / pack barcode / scale code
    var prod = DB.products.find(function (p) {
      return String(p.barcode) === c ||
             String(p.id) === c ||
             (p.packBarcode && String(p.packBarcode).trim() === c) ||
             (p.scaleCode && String(p.scaleCode).trim() === c);
    });
    if (prod) return { product: prod, qty: 1 };

    // Embedded scale / weighed barcode
    if (typeof SupermarketEngine !== 'undefined' && SupermarketEngine.decodeScaleBarcode) {
      var sd = SupermarketEngine.decodeScaleBarcode(c);
      if (sd) {
        var itemCodeClean = sd.itemCode ? sd.itemCode.replace(/^0+/, '') : '';
        var itemCode5Clean = sd.itemCode5 ? sd.itemCode5.replace(/^0+/, '') : '';
        var sp = DB.products.find(function (p) {
          var pScale = p.scaleCode ? String(p.scaleCode).replace(/^0+/, '') : '';
          var pBar = p.barcode ? String(p.barcode).replace(/^0+/, '') : '';
          return (pScale && (pScale === itemCodeClean || pScale === itemCode5Clean || pScale === sd.itemCode)) ||
                 (pBar && (pBar === itemCodeClean || pBar === itemCode5Clean || pBar === sd.itemCode));
        });
        if (sp) {
          var w = sd.weight;
          if (sd.isPriceBased && sd.totalPrice > 0 && sp.price > 0) {
            w = Math.round((sd.totalPrice / sp.price) * 1000) / 1000;
          }
          if (!w || w <= 0) w = 1;
          return { product: sp, qty: w };
        }
      }
    }
    return null;
  }

  // 14. Scan a PRODUCT barcode inside the Return modal to add it to the return list
  function scanProductForReturn(code) {
    if (!code) return;
    code = String(code).trim();
    if (!code.length) return;

    // If an invoice barcode is scanned, load that order instead
    if (isInvoiceBarcode(code)) {
      searchOrScanInvoice(code);
      return;
    }

    var resolved = resolveProductByCode(code);
    if (!resolved) {
      if (typeof PosAudio !== 'undefined') PosAudio.playErrorBuzz();
      toast('نەدۆزرایەوە', 'بەرهەم بەم بارکۆدە نەدۆزرایەوە: ' + code, 'error');
      return;
    }
    addProductToReturnBasket(resolved.product, resolved.qty || 1);
  }

  return {
    isInvoiceBarcode: isInvoiceBarcode,
    open: open,
    openWithBarcode: openWithBarcode,
    close: close,
    searchOrScanInvoice: searchOrScanInvoice,
    handleReturnSearchEnter: handleReturnSearchEnter,
    pickReason: pickReason,
    loadOrderIntoUI: loadOrderIntoUI,
    setReturnItemQty: setReturnItemQty,
    stepReturnItemQty: stepReturnItemQty,
    returnAllItem: returnAllItem,
    returnAllOrder: returnAllOrder,
    onReasonChange: onReasonChange,
    setRefundMethod: setRefundMethod,
    submitReturn: submitReturn,
    printReturnReceipt: printReturnReceipt,
    printReturnReceiptById: printReturnReceiptById,
    renderReturnSalesArchive: renderReturnSalesArchive,
    scanProductForReturn: scanProductForReturn,
    resolveProductByCode: resolveProductByCode
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReturnEngine;
}
