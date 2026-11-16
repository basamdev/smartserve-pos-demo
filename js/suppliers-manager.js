/**
 * Suppliers & Companies Management Engine (بەڕێوەبردنی کۆمپانیاکان و دابینکەران)
 * Designed for market owners: simple, visual, zero-accounting headache.
 */
(function (global) {
  'use strict';

  var KURDISH_DAYS = [
    'یەکشەممە',
    'دووشەممە',
    'سێشەممە',
    'چوارشەممە',
    'پێنجشەممە',
    'هەینی',
    'شەممە'
  ];

  var filterKeyword = '';
  var filterDay = 'all';
  var filterDebtOnly = false;
  var activeStatementSupplierId = null;
  var orderLines = [];
  var currentBuyTab = 'companies';
  var orderCatFilter = 'all';

  function getTodayKurdishDay() {
    return KURDISH_DAYS[new Date().getDay()];
  }

  function el(id) { return document.getElementById(id); }
  function val(id) { var e = el(id); return e ? e.value : ''; }
  function setVal(id, v) { var e = el(id); if (e) e.value = (v === null || v === undefined) ? '' : v; }

  function getSuppliers() {
    if (!global.DB) global.DB = {};
    if (!global.DB.suppliers) global.DB.suppliers = [];
    return global.DB.suppliers;
  }

  function getPurchases() {
    if (!global.DB) global.DB = {};
    if (!global.DB.purchases) global.DB.purchases = [];
    return global.DB.purchases;
  }

  function getSupplierPayments() {
    if (!global.DB) global.DB = {};
    if (!global.DB.supplierPayments) global.DB.supplierPayments = [];
    return global.DB.supplierPayments;
  }

  function fmtIqd(n) {
    if (typeof global.fmt === 'function') return global.fmt(n);
    return Number(n || 0).toLocaleString('en-US') + ' د.ع';
  }

  function storeLabel() {
    if (typeof global.getStoreName === 'function') return global.getStoreName();
    var s = global.DB && global.DB.settings;
    var n = s && (s.marketName || s.name);
    if (n && !/سام\s*مارکێت|sam\s*market/i.test(String(n))) return String(n).trim();
    return 'مارکێت';
  }

  function storeBrand() {
    var s = (global.DB && global.DB.settings) || {};
    return {
      name: storeLabel(),
      logo: s.marketLogo || '',
      phone: s.phone || s.marketPhone || '',
      address: s.address || '',
      tagline: s.marketTagline || ''
    };
  }

  var cachedLogoImg = null;
  var cachedLogoSrc = '';
  var LAST_ORDER_WASL_BLOB = null;
  var LAST_ORDER_WASL_URL = null;
  var LAST_ORDER_WASL_PHONE = '';
  var previewTimer = null;

  function withStoreLogo(cb) {
    var src = storeBrand().logo;
    if (!src) { cb(null); return; }
    if (cachedLogoImg && cachedLogoSrc === src) { cb(cachedLogoImg); return; }
    var img = new Image();
    img.onload = function () { cachedLogoImg = img; cachedLogoSrc = src; cb(img); };
    img.onerror = function () { cb(null); };
    img.src = src;
  }

  function localRoundRect(ctx, x, y, w, h, r) {
    if (typeof global.roundRect === 'function') {
      global.roundRect(ctx, x, y, w, h, r);
      return;
    }
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

  function wrapWaslText(ctx, text, maxWidth) {
    if (typeof global.wrapCanvasText === 'function') return global.wrapCanvasText(ctx, text, maxWidth);
    var words = String(text || '').split(/\s+/);
    var lines = [];
    var line = '';
    words.forEach(function (w) {
      var test = line ? (line + ' ' + w) : w;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = w;
      } else line = test;
    });
    if (line) lines.push(line);
    return lines.length ? lines : [String(text || '')];
  }

  function drawLogoBox(ctx, img, x, y, size) {
    ctx.save();
    localRoundRect(ctx, x, y, size, size, 16);
    ctx.clip();
    ctx.fillStyle = '#fffdf7';
    ctx.fillRect(x, y, size, size);
    if (img && img.width) {
      var scale = Math.min(size / img.width, size / img.height);
      var dw = img.width * scale;
      var dh = img.height * scale;
      ctx.drawImage(img, x + (size - dw) / 2, y + (size - dh) / 2, dw, dh);
    }
    ctx.restore();
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2.5;
    localRoundRect(ctx, x, y, size, size, 16);
    ctx.stroke();
  }

  function drawSupplierOrderWasl(logoImg) {
    var brand = storeBrand();
    var s = selectedOrderSupplier();
    var extra = val('waOrderExtraNote').trim();
    var lines = orderLines.slice();
    var W = 760;
    var pad = 36;
    var measure = document.createElement('canvas').getContext('2d');
    measure.font = "700 22px Tahoma, 'Segoe UI', Arial, sans-serif";
    var nameWidth = W - pad * 2 - 150;
    var itemHeights = lines.map(function (it) {
      var label = it.name + (it.isText ? ' (نوێ)' : '');
      return Math.max(1, wrapWaslText(measure, label, nameWidth).length) * 28 + 12;
    });
    if (!itemHeights.length) itemHeights = [48];
    var itemsH = itemHeights.reduce(function (sum, h) { return sum + h; }, 0);
    var noteLines = extra ? wrapWaslText(measure, extra, W - pad * 2 - 20) : [];
    var headerH = 148;
    var H = headerH + 150 + itemsH + (noteLines.length ? 60 + noteLines.length * 24 : 0) + 120;
    var canvas = document.createElement('canvas');
    var scale = 2;
    canvas.width = W * scale;
    canvas.height = H * scale;
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.textBaseline = 'top';
    ctx.direction = 'rtl';

    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(14, 14, W - 28, H - 28);

    ctx.fillStyle = '#0b1220';
    ctx.fillRect(14, 14, W - 28, headerH);
    ctx.fillStyle = '#eab308';
    ctx.fillRect(14, 14, W - 28, 6);

    var meta = [brand.address, brand.phone].filter(Boolean).join('  ·  ');
    if (logoImg) {
      var logoSize = 92;
      drawLogoBox(ctx, logoImg, W - 30 - 18 - logoSize, 28, logoSize);
      ctx.fillStyle = '#fde68a';
      ctx.textAlign = 'right';
      ctx.font = "900 32px Tahoma, 'Segoe UI', Arial, sans-serif";
      ctx.fillText(brand.name, W - 30 - 18 - logoSize - 18, 42);
      ctx.fillStyle = '#fff7d6';
      ctx.font = "800 17px Tahoma, 'Segoe UI', Arial, sans-serif";
      ctx.fillText('وەسڵی داواکاری کاڵا', W - 30 - 18 - logoSize - 18, 82);
      if (meta) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = "600 13px Tahoma, 'Segoe UI', Arial, sans-serif";
        ctx.fillText(meta, W - 30 - 18 - logoSize - 18, 110);
      }
    } else {
      ctx.fillStyle = '#fde68a';
      ctx.textAlign = 'center';
      ctx.font = "900 34px Tahoma, 'Segoe UI', Arial, sans-serif";
      ctx.fillText(brand.name, W / 2, 42);
      ctx.fillStyle = '#fff7d6';
      ctx.font = "800 18px Tahoma, 'Segoe UI', Arial, sans-serif";
      ctx.fillText('وەسڵی داواکاری کاڵا', W / 2, 84);
      if (meta) {
        ctx.font = "600 14px Tahoma, 'Segoe UI', Arial, sans-serif";
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(meta, W / 2, 114);
      }
    }

    var y = headerH + 28;
    var dateStr = (typeof formatSaleDateTime === 'function') ? formatSaleDateTime(new Date(), true) : '';
    var waslNo = 'SO-' + Date.now().toString().slice(-8);
    ctx.fillStyle = '#111827';
    ctx.font = "800 16px Tahoma, 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = 'right';
    ctx.fillText('ژمارەی وەسڵ: ' + waslNo, W - pad, y);
    ctx.textAlign = 'left';
    ctx.fillText(dateStr, pad, y);
    y += 28;
    ctx.textAlign = 'right';
    ctx.font = "700 17px Tahoma, 'Segoe UI', Arial, sans-serif";
    ctx.fillText('بۆ: ' + ((s && s.name) || 'کۆمپانیا'), W - pad, y);
    if (s && s.repName) {
      ctx.textAlign = 'left';
      ctx.fillText('مەندوب: ' + s.repName, pad, y);
    }
    y += 22;
    if (brand.tagline) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#78716c';
      ctx.font = "600 13px Tahoma, 'Segoe UI', Arial, sans-serif";
      ctx.fillText(brand.tagline, W / 2, y);
      y += 20;
    }

    y += 8;
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - pad, y);
    ctx.stroke();
    y += 12;

    ctx.fillStyle = '#78716c';
    ctx.font = "800 14px Tahoma, 'Segoe UI', Arial, sans-serif";
    ctx.textAlign = 'right';
    ctx.fillText('کاڵا', W - pad, y);
    ctx.textAlign = 'center';
    ctx.fillText('بڕ', pad + 70, y);
    ctx.textAlign = 'left';
    ctx.fillText('یەکە', pad, y);
    y += 24;

    if (!lines.length) {
      ctx.fillStyle = '#a8a29e';
      ctx.textAlign = 'center';
      ctx.font = "700 18px Tahoma, 'Segoe UI', Arial, sans-serif";
      ctx.fillText('لیستی کاڵا بەتاڵە', W / 2, y + 8);
      y += 48;
    } else {
      lines.forEach(function (it, idx) {
        var label = it.name + (it.isText ? ' (نوێ)' : '');
        var wrapped = wrapWaslText(ctx, label, nameWidth);
        if (idx % 2 === 0) {
          ctx.fillStyle = 'rgba(234,179,8,0.10)';
          ctx.fillRect(pad - 8, y - 4, W - pad * 2 + 16, itemHeights[idx]);
        }
        ctx.fillStyle = '#1c1917';
        ctx.font = "700 20px Tahoma, 'Segoe UI', Arial, sans-serif";
        ctx.textAlign = 'right';
        wrapped.forEach(function (ln, li) {
          ctx.fillText(ln, W - pad, y + li * 28);
        });
        ctx.textAlign = 'center';
        ctx.font = "900 20px Tahoma, 'Segoe UI', Arial, sans-serif";
        ctx.fillText(String(it.qty || 1), pad + 70, y);
        ctx.textAlign = 'left';
        ctx.font = "800 16px Tahoma, 'Segoe UI', Arial, sans-serif";
        ctx.fillText(it.unit === 'carton' ? 'کارتۆن' : 'دانە', pad, y);
        y += itemHeights[idx];
      });
    }

    if (noteLines.length) {
      y += 8;
      ctx.fillStyle = 'rgba(15,23,42,0.92)';
      localRoundRect(ctx, pad - 8, y, W - pad * 2 + 16, 42 + noteLines.length * 24, 10);
      ctx.fill();
      ctx.fillStyle = '#fde68a';
      ctx.font = "800 14px Tahoma, 'Segoe UI', Arial, sans-serif";
      ctx.textAlign = 'right';
      ctx.fillText('تێبینی:', W - pad, y + 10);
      ctx.fillStyle = '#fff7ed';
      ctx.font = "700 16px Tahoma, 'Segoe UI', Arial, sans-serif";
      noteLines.forEach(function (ln, i) {
        ctx.fillText(ln, W - pad, y + 32 + i * 24);
      });
      y += 50 + noteLines.length * 24;
    }

    y += 16;
    ctx.strokeStyle = '#c9a227';
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W - pad, y);
    ctx.stroke();
    y += 18;
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'center';
    ctx.font = "800 18px Tahoma, 'Segoe UI', Arial, sans-serif";
    ctx.fillText('تکایە ئەم کاڵایانە بۆمان بنێرن', W / 2, y);
    y += 28;
    var foot = [brand.phone ? ('تەلەفۆن: ' + brand.phone) : '', brand.address || ''].filter(Boolean).join('  ·  ');
    ctx.fillStyle = '#78716c';
    ctx.font = "700 14px Tahoma, 'Segoe UI', Arial, sans-serif";
    if (foot) ctx.fillText(foot, W / 2, y);
    y += 22;
    ctx.fillStyle = '#c9a227';
    ctx.font = "800 13px Tahoma, 'Segoe UI', Arial, sans-serif";
    ctx.fillText(brand.name, W / 2, y);
    return canvas;
  }

  function setWaslPreviewFromCanvas(canvas) {
    if (!canvas) return;
    var img = el('waOrderWaslPreview');
    var frame = el('waOrderWaslFrame');
    var dataUrl = canvas.toDataURL('image/png');
    if (img) img.src = dataUrl;
    if (frame) frame.classList.add('has-wasl');
    var modalImg = el('waOrderWaslModalImg');
    if (modalImg) modalImg.src = dataUrl;
  }

  function canvasToWaslBlob(canvas, done) {
    if (!canvas) { done(null); return; }
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(function (blob) { done(blob, canvas.toDataURL('image/png')); }, 'image/png');
      return;
    }
    done(null, canvas.toDataURL('image/png'));
  }

  function rememberWaslBlob(blob, dataUrl, copyNow) {
    if (!blob && dataUrl) {
      try {
        var parts = dataUrl.split(',');
        var bin = atob(parts[1] || '');
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        blob = new Blob([arr], { type: 'image/png' });
      } catch (e) {}
    }
    LAST_ORDER_WASL_BLOB = blob;
    if (LAST_ORDER_WASL_URL) URL.revokeObjectURL(LAST_ORDER_WASL_URL);
    LAST_ORDER_WASL_URL = blob ? URL.createObjectURL(blob) : dataUrl;
    if (copyNow && blob) {
      if (typeof global.copyImageBlobToClipboard === 'function') {
        global.copyImageBlobToClipboard(blob);
      } else if (navigator.clipboard && window.ClipboardItem) {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(function () {});
      }
    }
  }

  function renderOrderWaslPreview() {
    withStoreLogo(function (logo) {
      var canvas = drawSupplierOrderWasl(logo);
      setWaslPreviewFromCanvas(canvas);
      canvasToWaslBlob(canvas, function (blob, dataUrl) {
        rememberWaslBlob(blob, dataUrl, false);
      });
    });
  }

  function sanitizePhoneForWhatsApp(phone) {
    if (!phone) return '';
    var clean = String(phone).replace(/[^0-9]/g, '');
    if (clean.indexOf('964') === 0 && clean.length >= 12) return clean;
    if (clean.indexOf('00964') === 0) clean = clean.substring(2);
    else if (clean.indexOf('00') === 0) clean = clean.substring(2);
    if (clean.indexOf('0') === 0 && clean.length >= 10) clean = '964' + clean.substring(1);
    else if (clean.indexOf('7') === 0 && clean.length === 10) clean = '964' + clean;
    return clean;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function openWhatsAppLink(url) {
    if (global.POS_DESKTOP && typeof global.POS_DESKTOP.openExternal === 'function') {
      global.POS_DESKTOP.openExternal(url);
      return;
    }
    window.open(url, '_blank');
  }

  /**
   * Main Render function for #suppliersSection
   */
  function render() {
    var suppliers = getSuppliers();
    var purchases = getPurchases();
    var todayDay = getTodayKurdishDay();

    // 1. Calculate Analytics
    var totalDebt = 0;
    var todayReps = [];
    var thisMonthPurchases = 0;
    var thisMonthPrefix = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    suppliers.forEach(function (s) {
      var debt = parseFloat(s.credit !== undefined ? s.credit : (s.balance || 0)) || 0;
      totalDebt += debt;

      if (s.visitDay && (s.visitDay === todayDay || s.visitDay === 'هەموو ڕۆژێک')) {
        todayReps.push(s);
      }
    });

    purchases.forEach(function (p) {
      if (p.date && p.date.startsWith(thisMonthPrefix)) {
        thisMonthPurchases += (parseFloat(p.total) || 0);
      }
    });

    // 2. Render Top Stats Cards
    var statsContainer = el('supplierStats');
    if (statsContainer) {
      var debtColorClass = totalDebt > 0 ? 'danger' : 'success';
      var debtBadge = totalDebt > 0
        ? '<span style="font-size:0.75rem;padding:2px 8px;border-radius:10px;background:rgba(239,68,68,0.2);color:#fca5a5;font-weight:800;margin-right:6px;">پێویستە بدرێتەوە</span>'
        : '<span style="font-size:0.75rem;padding:2px 8px;border-radius:10px;background:rgba(16,185,129,0.2);color:#86efac;font-weight:800;margin-right:6px;">هەمووی پاکتاوە</span>';

      statsContainer.innerHTML =
        '<div class="stat-card accent" style="background:linear-gradient(135deg, rgba(99,102,241,0.12), rgba(79,70,229,0.05));border-color:rgba(99,102,241,0.3);">' +
          '<div class="stat-icon" style="background:rgba(99,102,241,0.2);color:#818cf8;"><i class="fas fa-building"></i></div>' +
          '<div class="stat-label">کۆی کۆمپانیاکان</div>' +
          '<div class="stat-value">' + suppliers.length + ' <small style="font-size:0.8rem;color:var(--text-muted);font-weight:normal;">کۆمپانیا</small></div>' +
        '</div>' +

        '<div class="stat-card ' + debtColorClass + '" style="background:linear-gradient(135deg, rgba(239,68,68,0.12), rgba(220,38,38,0.05));border-color:rgba(239,68,68,0.3);">' +
          '<div class="stat-icon" style="background:rgba(239,68,68,0.2);color:#f87171;"><i class="fas fa-hand-holding-dollar"></i></div>' +
          '<div class="stat-label">کۆی قەرزی سەر شانمان ' + debtBadge + '</div>' +
          '<div class="stat-value" style="color:#ef4444;">' + fmtIqd(totalDebt) + '</div>' +
        '</div>' +

        '<div class="stat-card success" style="background:linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.05));border-color:rgba(16,185,129,0.3);">' +
          '<div class="stat-icon" style="background:rgba(16,185,129,0.2);color:#34d399;"><i class="fas fa-shopping-cart"></i></div>' +
          '<div class="stat-label">کڕینەکانی ئەم مانگە</div>' +
          '<div class="stat-value">' + fmtIqd(thisMonthPurchases) + '</div>' +
        '</div>' +

        '<div class="stat-card warning" style="background:linear-gradient(135deg, rgba(245,158,11,0.12), rgba(217,119,6,0.05));border-color:rgba(245,158,11,0.3);">' +
          '<div class="stat-icon" style="background:rgba(245,158,11,0.2);color:#fbbf24;"><i class="fas fa-calendar-check"></i></div>' +
          '<div class="stat-label">سەردانەکانی ئەمڕۆ (' + todayDay + ')</div>' +
          '<div class="stat-value">' + todayReps.length + ' <small style="font-size:0.8rem;color:var(--text-muted);font-weight:normal;">مەندوب</small></div>' +
        '</div>';
    }

    // 3. Filter Table rows
    var filtered = suppliers.filter(function (s) {
      if (filterDebtOnly) {
        var d = parseFloat(s.credit !== undefined ? s.credit : (s.balance || 0)) || 0;
        if (d <= 0) return false;
      }
      if (filterDay && filterDay !== 'all') {
        if (filterDay === 'today') {
          if (s.visitDay !== todayDay && s.visitDay !== 'هەموو ڕۆژێک') return false;
        } else if (s.visitDay !== filterDay) {
          return false;
        }
      }
      if (filterKeyword) {
        var kw = filterKeyword.toLowerCase().trim();
        var matchName = (s.name || '').toLowerCase().indexOf(kw) !== -1;
        var matchRep = (s.repName || '').toLowerCase().indexOf(kw) !== -1;
        var matchPhone = (s.phone || '').indexOf(kw) !== -1;
        var matchCat = (s.category || '').toLowerCase().indexOf(kw) !== -1;
        if (!matchName && !matchRep && !matchPhone && !matchCat) return false;
      }
      return true;
    });

    // 4. Render Table Body
    var tbody = el('suppliersTableBody');
    if (!tbody) return;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:36px 16px;color:var(--text-muted);font-size:0.95rem;">' +
        '<i class="fas fa-building" style="font-size:2.2rem;display:block;margin-bottom:10px;opacity:0.4;"></i>' +
        (suppliers.length === 0 ? 'هێشتا هیچ کۆمپانیایەک زیاد نەکراوە. کلیک لەسەر «کۆمپانیای نوێ» بکە.' : 'هیچ ئەنجامێک لەگەڵ ئەم گەڕانە یەکناگرێتەوە.') +
      '</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(function (s, i) {
      var debt = parseFloat(s.credit !== undefined ? s.credit : (s.balance || 0)) || 0;
      var isTodayVisit = (s.visitDay === todayDay || s.visitDay === 'هەموو ڕۆژێک');

      var debtHtml = debt > 0
        ? '<strong style="color:#ef4444;font-size:0.95rem;">' + fmtIqd(debt) + '</strong>'
        : '<span style="color:#10b981;font-weight:700;font-size:0.85rem;"><i class="fas fa-check-circle"></i> پاکتاوە</span>';

      var visitBadge = s.visitDay
        ? '<span style="padding:3px 8px;border-radius:6px;font-size:0.75rem;font-weight:700;background:rgba(255,255,255,0.06);color:var(--text-main);">' +
            (isTodayVisit ? '<span style="color:#fbbf24;font-weight:800;"><i class="fas fa-bell"></i> ئەمڕۆ: </span>' : '') +
            s.visitDay +
          '</span>'
        : '<span style="color:var(--text-muted);font-size:0.75rem;">دیاری نەکراوە</span>';

      var repHtml = s.repName
        ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;display:flex;align-items:center;gap:4px;"><i class="fas fa-user-tie" style="color:#818cf8;"></i> ' + s.repName + '</div>'
        : '';

      var catHtml = s.category
        ? '<span style="padding:2px 8px;border-radius:6px;font-size:0.72rem;background:rgba(59,130,246,0.12);color:#60a5fa;border:1px solid rgba(59,130,246,0.25);font-weight:700;">' + s.category + '</span>'
        : '<span style="color:var(--text-muted);font-size:0.75rem;">گشتی</span>';

      // WhatsApp Button
      var waBtn = '';
      var rawPhone = s.whatsapp || s.phone;
      if (rawPhone) {
        waBtn = '<button type="button" class="btn btn-xs" onclick="SuppliersManager.openWhatsApp(\'' + rawPhone + '\', \'' + (s.repName || '') + '\', \'' + (s.name || '') + '\')" title="چاتی ڕاستەوخۆ لە WhatsApp" style="background:#25D366;color:#fff;border:none;border-radius:6px;padding:3px 8px;font-weight:700;display:inline-flex;align-items:center;gap:4px;margin-right:6px;font-size:0.75rem;">' +
          '<i class="fab fa-whatsapp"></i> واتسئاپ' +
        '</button>';
      }

      var phoneDisplay = s.phone
        ? '<span style="font-size:0.85rem;font-weight:600;direction:ltr;unicode-bidi:embed;">' + s.phone + '</span>'
        : '<span style="color:var(--text-muted);font-size:0.75rem;">بێ ژمارە</span>';

      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' +
          '<div style="font-weight:800;color:var(--text-bright);font-size:0.95rem;">' + s.name + '</div>' +
          repHtml +
        '</td>' +
        '<td>' + phoneDisplay + ' ' + waBtn + '</td>' +
        '<td>' + visitBadge + '</td>' +
        '<td>' + catHtml + '</td>' +
        '<td>' + debtHtml + '</td>' +
        '<td>' +
          '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">' +
            // Pay debt button
            '<button type="button" class="btn btn-xs btn-success" onclick="SuppliersManager.openPayModal(\'' + s.id + '\')" title="دانەوەی پارە / کەمکردنەوەی قەرز" style="background:linear-gradient(135deg,#10b981,#059669);border:none;font-weight:700;padding:4px 8px;border-radius:6px;">' +
              '<i class="fas fa-hand-holding-usd"></i> دانەوەی پارە' +
            '</button>' +
            // New Purchase for this company
            '<button type="button" class="btn btn-xs" onclick="SuppliersManager.startOrder(\'' + s.id + '\')" title="داواکاری بنێرە بۆ مەندوب" style="background:#25D366;color:#fff;border:none;font-weight:700;padding:4px 8px;border-radius:6px;">' +
              '<i class="fab fa-whatsapp"></i> داواکاری' +
            '</button>' +
            '<button type="button" class="btn btn-xs btn-outline" onclick="SuppliersManager.quickPurchase(\'' + s.id + '\')" title="تۆمارکردنی وەسڵ کاتێک کاڵا دەگات" style="border-color:#3b82f6;color:#60a5fa;font-weight:700;padding:4px 8px;border-radius:6px;">' +
              '<i class="fas fa-file-invoice"></i> وەسڵ' +
            '</button>' +
            // Statement / کشف حساب
            '<button type="button" class="btn btn-xs btn-outline" onclick="SuppliersManager.openStatement(\'' + s.id + '\')" title="کەشف حیساب و مێژووی مامەڵەکان" style="border-color:#a855f7;color:#c084fc;font-weight:700;padding:4px 8px;border-radius:6px;">' +
              '<i class="fas fa-file-invoice"></i> کەشف حیساب' +
            '</button>' +
            // Edit
            '<button type="button" class="btn btn-xs btn-outline" onclick="SuppliersManager.edit(\'' + s.id + '\')" title="دەستکاری" style="padding:4px 7px;border-radius:6px;">' +
              '<i class="fas fa-edit"></i>' +
            '</button>' +
            // Delete
            '<button type="button" class="btn btn-xs btn-outline" onclick="SuppliersManager.remove(\'' + s.id + '\')" title="سڕینەوە" style="color:var(--danger);border-color:rgba(239,68,68,0.3);padding:4px 7px;border-radius:6px;">' +
              '<i class="fas fa-trash"></i>' +
            '</button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  /**
   * Search and filter handlers
   */
  function onSearchInput(val) {
    filterKeyword = val || '';
    render();
  }

  function onDayFilterChange(val) {
    filterDay = val || 'all';
    render();
  }

  function onDebtFilterToggle(checked) {
    filterDebtOnly = !!checked;
    render();
  }

  /**
   * Open WhatsApp with friendly Kurdish template
   */
  function openWhatsApp(phone, repName, companyName) {
    var clean = sanitizePhoneForWhatsApp(phone);
    if (!clean) {
      if (typeof global.toast === 'function') global.toast('هەڵە', 'ژمارەی مۆبایل بەردەست نییە یان نادروستە', 'error');
      return;
    }
    var marketName = storeLabel();
    var greeting = repName ? ('سڵاو کاک ' + repName) : 'سڵاو';
    var msg = greeting + '،\nلە ' + marketName + ' (هەولێر).\nتکایە کاتێک دێیت پەیوەندیمان پێوە بکە. سوپاس.';
    openWhatsAppLink('https://wa.me/' + clean + '?text=' + encodeURIComponent(msg));
  }

  /**
   * Open Supplier Add / Edit Modal
   */
  function openModal(id) {
    var supp = id ? getSuppliers().find(function (s) { return s.id === id; }) : null;
    setVal('suppEditId', supp ? supp.id : '');
    setVal('suppName', supp ? supp.name : '');
    setVal('suppRepName', supp ? (supp.repName || '') : '');
    setVal('suppPhone', supp ? (supp.phone || '') : '');
    setVal('suppWhatsapp', supp ? (supp.whatsapp || supp.phone || '') : '');
    setVal('suppVisitDay', supp ? (supp.visitDay || '') : '');
    setVal('suppCategory', supp ? (supp.category || '') : '');
    setVal('suppAddress', supp ? (supp.address || '') : '');
    setVal('suppCredit', supp ? (supp.credit !== undefined ? supp.credit : (supp.balance || 0)) : 0);
    setVal('suppEmail', supp ? (supp.email || '') : '');
    setVal('suppNotes', supp ? (supp.notes || '') : '');

    var titleEl = el('supplierModalTitle');
    if (titleEl) {
      titleEl.innerHTML = supp
        ? '<i class="fas fa-building" style="color:var(--accent);"></i> دەستکاریکردنی زانیاری کۆمپانیا'
        : '<i class="fas fa-building" style="color:var(--accent);"></i> زیادکردنی کۆمپانیا / دابینکەری نوێ';
    }

    if (typeof global.showModal === 'function') global.showModal('supplierModal');
    setTimeout(function () { var n = el('suppName'); if (n) n.focus(); }, 100);
  }

  /**
   * Save Supplier from Modal
   */
  function save() {
    var id = val('suppEditId').trim();
    var name = val('suppName').trim();
    var repName = val('suppRepName').trim();
    var phone = val('suppPhone').trim();
    var whatsapp = val('suppWhatsapp').trim();
    var visitDay = val('suppVisitDay');
    var category = val('suppCategory').trim();
    var address = val('suppAddress').trim();
    var email = val('suppEmail').trim();
    var credit = parseFloat(val('suppCredit')) || 0;
    var notes = val('suppNotes').trim();

    if (!name) {
      if (typeof global.toast === 'function') global.toast('هەڵە', 'ناوی کۆمپانیا / دابینکەر داواکراوە', 'error');
      var n = el('suppName'); if (n) n.focus();
      return;
    }

    var suppliers = getSuppliers();
    var existing = id ? suppliers.find(function (s) { return s.id === id; }) : null;

    if (existing) {
      existing.name = name;
      existing.repName = repName;
      existing.phone = phone;
      existing.whatsapp = whatsapp;
      existing.visitDay = visitDay;
      existing.category = category;
      existing.address = address;
      existing.email = email;
      existing.credit = credit;
      existing.balance = credit;
      existing.notes = notes;

      if (typeof global.ApiClient !== 'undefined' && global.ApiClient.isOnline) {
        fetch('/api/suppliers/' + existing.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(existing)
        }).catch(function (e) { console.warn('Supplier PUT sync failed', e); });
      }
    } else {
      var newSupp = {
        id: 'sup_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name: name,
        repName: repName,
        phone: phone,
        whatsapp: whatsapp,
        visitDay: visitDay,
        category: category,
        address: address,
        email: email,
        credit: credit,
        balance: credit,
        notes: notes,
        createdAt: new Date().toISOString()
      };
      suppliers.unshift(newSupp);

      if (typeof global.ApiClient !== 'undefined' && global.ApiClient.isOnline) {
        fetch('/api/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSupp)
        }).catch(function (e) { console.warn('Supplier POST sync failed', e); });
      }
    }

    if (typeof global.DataStore !== 'undefined' && global.DataStore.saveSuppliers) {
      global.DataStore.saveSuppliers();
    }

    if (typeof global.hideModal === 'function') global.hideModal('supplierModal');
    render();
    if (typeof global.toast === 'function') global.toast('سەرکەوتوو', 'زانیاری کۆمپانیا پاشکەوت کرا', 'success');
  }

  /**
   * Delete Supplier
   */
  function remove(id) {
    var supp = getSuppliers().find(function (s) { return s.id === id; });
    if (!supp) return;
    if (!confirm('ئایا دڵنیایت لە سڕینەوەی کۆمپانیای (' + supp.name + ')؟')) return;

    global.DB.suppliers = getSuppliers().filter(function (s) { return s.id !== id; });

    if (typeof global.DataStore !== 'undefined' && global.DataStore.saveSuppliers) {
      global.DataStore.saveSuppliers();
    }
    if (typeof global.ApiClient !== 'undefined' && global.ApiClient.isOnline) {
      fetch('/api/suppliers/' + id, { method: 'DELETE' }).catch(function (e) { console.warn('Supplier DELETE failed', e); });
    }
    render();
    if (typeof global.toast === 'function') global.toast('سەرکەوتوو', 'کۆمپانیا سڕایەوە', 'success');
  }

  /**
   * Open Quick Purchase for specific supplier
   */
  function quickPurchase(id) {
    selectBuyTab('invoices');
    if (typeof global.openPurchaseModal === 'function') {
      global.openPurchaseModal(id);
    }
  }

  function selectBuyTab(tab) {
    currentBuyTab = tab || 'companies';
    var tabs = ['companies', 'order', 'invoices'];
    tabs.forEach(function (name) {
      var pane = el('buyTab' + name.charAt(0).toUpperCase() + name.slice(1));
      if (pane) pane.style.display = name === currentBuyTab ? 'block' : 'none';
    });
    document.querySelectorAll('[data-buy-tab]').forEach(function (btn) {
      if (btn.getAttribute('data-buy-tab') === currentBuyTab) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    if (currentBuyTab === 'order') {
      fillOrderSupplierSelect();
      renderOrderCatalog();
      renderOrderLines();
      renderOrderHistory();
      refreshOrderPreview();
    } else if (currentBuyTab === 'invoices' && typeof global.renderPurchases === 'function') {
      global.renderPurchases();
    } else {
      render();
    }
  }

  function loadSavedOrders() {
    try {
      if (typeof SqliteDB !== 'undefined' && SqliteDB.getSetting) {
        return SqliteDB.getSetting('supplier_orders', []) || [];
      }
    } catch (e) {}
    try { return JSON.parse(localStorage.getItem('sm_supplier_orders') || '[]'); } catch (e2) { return []; }
  }

  function persistSavedOrders(list) {
    try {
      if (typeof SqliteDB !== 'undefined' && SqliteDB.setSetting) SqliteDB.setSetting('supplier_orders', list);
    } catch (e) {}
    try { localStorage.setItem('sm_supplier_orders', JSON.stringify(list)); } catch (e2) {}
  }

  function fillOrderSupplierSelect(preferredId) {
    var sel = el('waOrderSupplierSelect');
    if (!sel) return;
    var suppliers = getSuppliers();
    if (!suppliers.length) {
      sel.innerHTML = '<option value="">سەرەتا کۆمپانیایەک زیاد بکە</option>';
      return;
    }
    sel.innerHTML = suppliers.map(function (s) {
      return '<option value="' + s.id + '">' + s.name + (s.repName ? ' — مەندوب: ' + s.repName : '') + '</option>';
    }).join('');
    if (preferredId) sel.value = preferredId;
    onOrderSupplierChange();
  }

  function fillOrderProductList() {
    renderOrderCatalog();
  }

  function renderOrderCatalog() {
    renderOrderCategories();
    renderOrderProducts();
  }

  function getOrderCategories() {
    return (global.DB && global.DB.categories) || [];
  }

  function getOrderProducts() {
    return (global.DB && global.DB.products) || [];
  }

  function productQtyInOrder(prodId) {
    return orderLines.reduce(function (sum, l) {
      return l.prodId === prodId ? sum + (parseFloat(l.qty) || 0) : sum;
    }, 0);
  }

  function isLowStock(p) {
    return (parseFloat(p.stock) || 0) <= (parseFloat(p.minAlert) || 5);
  }

  function filterOrderCat(catId) {
    orderCatFilter = catId || 'all';
    renderOrderCategories();
    renderOrderProducts();
  }

  function renderOrderCategories() {
    var box = el('waOrderCats');
    if (!box) return;
    var cats = getOrderCategories();
    var html = '<button type="button" class="wa-cat-btn' + (orderCatFilter === 'all' ? ' active' : '') + '" onclick="SuppliersManager.filterOrderCat(\'all\')"><i class="fas fa-th-large"></i> هەموو</button>' +
      '<button type="button" class="wa-cat-btn' + (orderCatFilter === 'low' ? ' active' : '') + '" onclick="SuppliersManager.filterOrderCat(\'low\')"><i class="fas fa-exclamation-triangle"></i> کۆگای کەم</button>';
    cats.forEach(function (c) {
      html += '<button type="button" class="wa-cat-btn' + (orderCatFilter === c.id ? ' active' : '') + '" onclick="SuppliersManager.filterOrderCat(\'' + c.id + '\')">' +
        escapeHtml(c.name) + '</button>';
    });
    box.innerHTML = html;
  }

  function renderOrderProducts() {
    var grid = el('waOrderProducts');
    if (!grid) return;
    var searchEl = el('waOrderCatalogSearch');
    var q = String(searchEl && searchEl.value ? searchEl.value : '').trim().toLowerCase();
    var list = getOrderProducts().filter(function (p) {
      if (orderCatFilter === 'low' && !isLowStock(p)) return false;
      if (orderCatFilter !== 'all' && orderCatFilter !== 'low' && p.cat !== orderCatFilter) return false;
      if (!q) return true;
      return String(p.name || '').toLowerCase().indexOf(q) !== -1 ||
        String(p.barcode || '').toLowerCase().indexOf(q) !== -1;
    });
    if (!list.length) {
      grid.innerHTML = '<div class="wa-prod-empty">کاڵا نەدۆزرایەوە — دەتوانیت خوارەوە بنووسیت و زیادی بکەیت</div>';
      return;
    }
    grid.innerHTML = list.slice(0, 120).map(function (p) {
      var inQty = productQtyInOrder(p.id);
      var stock = parseFloat(p.stock) || 0;
      var stockClass = stock <= 0 ? 'out' : (isLowStock(p) ? 'low' : 'ok');
      var img = '';
      if (typeof global.buildImageHtml === 'function') img = global.buildImageHtml(p.id, p.name, p.image);
      else if (p.image) img = '<img src="' + p.image + '" alt="">';
      else img = '<i class="fas fa-box"></i>';
      return '<button type="button" class="wa-prod-card' + (inQty ? ' in-order' : '') + '" onclick="SuppliersManager.quickAddProduct(\'' + p.id + '\')">' +
        (inQty ? '<span class="wa-prod-badge">+' + inQty + '</span>' : '') +
        '<div class="wa-prod-img">' + img + '</div>' +
        '<div class="wa-prod-name">' + escapeHtml(p.name) + '</div>' +
        '<div class="wa-prod-meta"><span class="wa-stock ' + stockClass + '">کۆگا: ' + stock + '</span></div>' +
      '</button>';
    }).join('');
  }

  function findProductByQuery(q) {
    q = String(q || '').trim().toLowerCase();
    if (!q || !global.DB) return null;
    var list = global.DB.products || [];
    return list.find(function (p) { return p.id === q; }) ||
      list.find(function (p) { return String(p.barcode || '') === q; }) ||
      list.find(function (p) { return String(p.name || '').toLowerCase() === q; }) ||
      list.find(function (p) { return String(p.name || '').toLowerCase().indexOf(q) !== -1; });
  }

  function currentOrderUnit() {
    var unitEl = el('waOrderUnit');
    return unitEl && unitEl.value ? unitEl.value : 'carton';
  }

  function currentOrderQty() {
    var qtyEl = el('waOrderQty');
    return parseFloat(qtyEl && qtyEl.value ? qtyEl.value : 1) || 1;
  }

  function addOrderLine() {
    addFreeTextLine();
  }

  function parseFreeItemLine(raw, defaultQty, defaultUnit) {
    var t = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    var m = t.match(/^(.*?)[\s\-–—]+(\d+(?:\.\d+)?)[\s]*(کارتۆن|كارتون|carton|دانە|دانه|piece)?$/i);
    if (m && m[1].trim()) {
      var unit = defaultUnit;
      if (m[3]) {
        unit = /دانە|دانه|piece/i.test(m[3]) ? 'piece' : 'carton';
      }
      return { name: m[1].trim(), qty: parseFloat(m[2]) || defaultQty, unit: unit };
    }
    return { name: t, qty: defaultQty, unit: defaultUnit };
  }

  function addFreeTextLine() {
    var inp = el('waOrderFreeText') || el('waOrderProductSearch');
    var typed = inp ? String(inp.value || '').trim() : '';
    if (!typed) {
      if (typeof global.toast === 'function') global.toast('ئاگاداری', 'کاڵایەک بنووسە — تەنانەت ئەگەر لە سیستەم نییە', 'warning');
      return;
    }
    var defaultQty = currentOrderQty();
    var defaultUnit = currentOrderUnit();
    var rows = typed.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    var added = 0;
    rows.forEach(function (line) {
      var parsed = parseFreeItemLine(line, defaultQty, defaultUnit);
      if (!parsed) return;
      pushOrderLine('', parsed.name, parsed.qty, parsed.unit, true);
      added += 1;
    });
    if (!added) {
      if (typeof global.toast === 'function') global.toast('ئاگاداری', 'کاڵایەک بنووسە', 'warning');
      return;
    }
    if (inp) inp.value = '';
    if (typeof global.toast === 'function') global.toast('زیادکرا', added + ' کاڵا بۆ لیست زیادکرا', 'success');
  }

  function pushOrderLine(prodId, name, qty, unit, isText) {
    var existing = orderLines.find(function (l) {
      return l.prodId === prodId && l.unit === unit && String(l.name) === String(name);
    });
    if (existing) existing.qty = (parseFloat(existing.qty) || 0) + qty;
    else orderLines.push({ prodId: prodId || '', name: name, qty: qty, unit: unit, isText: !!isText });
    renderOrderLines();
    refreshOrderPreview();
    renderOrderProducts();
  }

  function quickAddProduct(prodId) {
    var prod = findProductByQuery(prodId);
    if (!prod) return;
    pushOrderLine(prod.id, prod.name, currentOrderQty() || 1, currentOrderUnit(), false);
  }

  function changeOrderQty(idx, delta) {
    if (!orderLines[idx]) return;
    orderLines[idx].qty = Math.max(1, (parseFloat(orderLines[idx].qty) || 1) + delta);
    renderOrderLines();
    refreshOrderPreview();
    renderOrderProducts();
  }

  function setOrderQty(idx, val) {
    if (!orderLines[idx]) return;
    orderLines[idx].qty = Math.max(1, parseFloat(val) || 1);
    renderOrderLines();
    refreshOrderPreview();
    renderOrderProducts();
  }

  function removeOrderLine(idx) {
    orderLines.splice(idx, 1);
    renderOrderLines();
    refreshOrderPreview();
    renderOrderProducts();
  }

  function renderOrderLines() {
    var tbody = el('waOrderLinesBody');
    if (!tbody) return;
    if (!orderLines.length) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:18px;color:var(--text-muted);">کاڵا لە پۆل هەڵبژێرە یان بنووسە</td></tr>';
      return;
    }
    tbody.innerHTML = orderLines.map(function (l, i) {
      var unitKu = l.unit === 'carton' ? 'کارتۆن' : 'دانە';
      var tag = l.isText ? ' <span class="wa-text-tag">دەق</span>' : '';
      return '<tr>' +
        '<td><strong>' + escapeHtml(l.name) + '</strong>' + tag + '</td>' +
        '<td>' +
          '<div class="wa-qty">' +
            '<button type="button" onclick="SuppliersManager.changeOrderQty(' + i + ',-1)">−</button>' +
            '<input type="number" min="1" value="' + l.qty + '" onchange="SuppliersManager.setOrderQty(' + i + ', this.value)">' +
            '<button type="button" onclick="SuppliersManager.changeOrderQty(' + i + ',1)">+</button>' +
            '<span>' + unitKu + '</span>' +
          '</div>' +
        '</td>' +
        '<td><button type="button" class="btn btn-xs btn-outline" onclick="SuppliersManager.removeOrderLine(' + i + ')"><i class="fas fa-times"></i></button></td>' +
      '</tr>';
    }).join('');
  }

  function selectedOrderSupplier() {
    var sel = el('waOrderSupplierSelect');
    var id = sel ? sel.value : '';
    return getSuppliers().find(function (s) { return s.id === id; }) || null;
  }

  function matchSupplierCategory(s) {
    if (!s || !s.category) return;
    var cats = getOrderCategories();
    var hit = cats.find(function (c) {
      return String(c.name || '').toLowerCase() === String(s.category).toLowerCase() || c.id === s.category;
    });
    if (hit) orderCatFilter = hit.id;
  }

  function onOrderSupplierChange() {
    var s = selectedOrderSupplier();
    var hint = el('waOrderSupplierHint');
    var phoneEl = el('waOrderPhone');
    if (hint) {
      if (!s) hint.textContent = 'کۆمپانیایەک هەڵبژێرە.';
      else {
        var phone = s.whatsapp || s.phone || 'بێ ژمارە';
        hint.innerHTML = (s.repName ? ('مەندوب: <strong>' + escapeHtml(s.repName) + '</strong> · ') : '') +
          'واتسئاپ: <span dir="ltr">' + escapeHtml(phone) + '</span>' +
          (s.visitDay ? (' · ڕۆژی سەردان: ' + escapeHtml(s.visitDay)) : '');
      }
    }
    if (phoneEl) phoneEl.value = s ? (s.whatsapp || s.phone || '') : '';
    matchSupplierCategory(s);
    renderOrderCatalog();
    refreshOrderPreview();
  }

  function buildOrderMessage() {
    var s = selectedOrderSupplier();
    var brand = storeBrand();
    var greeting = (s && s.repName) ? ('سڵاو کاک ' + s.repName) : 'سڵاو';
    var lines = [
      greeting + '،',
      'لە ' + brand.name + (brand.address ? (' — ' + brand.address) : '') + '.',
      'تکایە ئەم کاڵایانە بۆمان بهێنە:',
      ''
    ];
    if (!orderLines.length) lines.push('(لیستی کاڵا بەتاڵە)');
    orderLines.forEach(function (l, i) {
      var mark = l.isText ? ' (نوێ / لە کۆگا نییە)' : '';
      lines.push((i + 1) + '. ' + l.name + ' — ' + l.qty + ' ' + (l.unit === 'carton' ? 'کارتۆن' : 'دانە') + mark);
    });
    var extra = val('waOrderExtraNote').trim();
    if (extra) {
      lines.push('');
      lines.push('تێبینی: ' + extra);
    }
    lines.push('');
    lines.push('کاتێک گەیشتن پەیوەندیمان پێوە بکەن.');
    lines.push('سوپاس');
    return lines.join('\n');
  }

  function refreshOrderPreview() {
    var ta = el('waOrderPreview');
    if (ta) ta.value = buildOrderMessage();
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(renderOrderWaslPreview, 60);
  }

  function copyOrderWaslImage() {
    if (LAST_ORDER_WASL_BLOB && typeof global.copyImageBlobToClipboard === 'function') {
      global.copyImageBlobToClipboard(LAST_ORDER_WASL_BLOB, function () {
        if (typeof global.toast === 'function') global.toast('کۆپی', 'وێنەی وەسڵ کۆپی کرا — لە واتسئاپ Ctrl+V بکە', 'success');
      });
      return;
    }
    if (LAST_ORDER_WASL_BLOB && navigator.clipboard && window.ClipboardItem) {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': LAST_ORDER_WASL_BLOB })]).then(function () {
        if (typeof global.toast === 'function') global.toast('کۆپی', 'وێنەی وەسڵ کۆپی کرا — لە واتسئاپ Ctrl+V بکە', 'success');
      }).catch(function () {});
      return;
    }
    renderOrderWaslPreview();
    if (typeof global.toast === 'function') global.toast('کۆپی', 'وێنە ئامادە دەکرێت', 'info');
  }

  function copyOrderText() {
    copyOrderWaslImage();
  }

  function downloadOrderWasl() {
    if (!LAST_ORDER_WASL_URL) {
      renderOrderWaslPreview();
      return;
    }
    var a = document.createElement('a');
    a.href = LAST_ORDER_WASL_URL;
    a.download = 'wasl-order-' + new Date().toISOString().slice(0, 10) + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function openWhatsAppForOrderWasl() {
    copyOrderWaslImage();
    var url = LAST_ORDER_WASL_PHONE
      ? ('https://wa.me/' + LAST_ORDER_WASL_PHONE)
      : 'https://web.whatsapp.com/';
    openWhatsAppLink(url);
    if (typeof global.toast === 'function') {
      global.toast('واتسئاپ', 'واتسئاپ کرایەوە — Ctrl+V بۆ ناردنی وێنەی وەسڵ', 'success');
    }
  }

  function rememberOrderPhone(s, typed) {
    if (!s || !typed) return;
    if (typed === (s.whatsapp || '') || typed === (s.phone || '')) return;
    s.whatsapp = typed;
    if (typeof global.DataStore !== 'undefined' && global.DataStore.saveSuppliers) {
      global.DataStore.saveSuppliers();
    }
  }

  function startOrder(supplierId) {
    orderLines = [];
    selectBuyTab('order');
    fillOrderSupplierSelect(supplierId);
  }

  function sendWhatsAppOrder() {
    var s = selectedOrderSupplier();
    if (!s) {
      if (typeof global.toast === 'function') global.toast('هەڵە', 'کۆمپانیا هەڵبژێرە', 'error');
      return;
    }
    var pendingText = val('waOrderFreeText').trim();
    if (pendingText) addFreeTextLine();
    var extra = val('waOrderExtraNote').trim();
    if (!orderLines.length && !extra) {
      if (typeof global.toast === 'function') global.toast('هەڵە', 'کاڵا بنووسە یان لە لیست هەڵبژێرە', 'error');
      return;
    }
    var typedPhone = val('waOrderPhone').trim();
    rememberOrderPhone(s, typedPhone);
    var phone = sanitizePhoneForWhatsApp(typedPhone || s.whatsapp || s.phone);
    LAST_ORDER_WASL_PHONE = phone;
    var rec = {
      id: 'so_' + Date.now(),
      supplierId: s.id,
      supplierName: s.name,
      repName: s.repName || '',
      items: orderLines.slice(),
      text: buildOrderMessage(),
      status: 'sent',
      sentAt: new Date().toISOString()
    };
    var all = loadSavedOrders();
    all.unshift(rec);
    persistSavedOrders(all);
    if (typeof global.toast === 'function') global.toast('چاوەڕوان بە', 'وێنەی وەسڵی داواکاری ئامادە دەکرێت...', 'info');
    withStoreLogo(function (logo) {
      var canvas = drawSupplierOrderWasl(logo);
      setWaslPreviewFromCanvas(canvas);
      canvasToWaslBlob(canvas, function (blob, dataUrl) {
        rememberWaslBlob(blob, dataUrl, true);
        var modalImg = el('waOrderWaslModalImg');
        if (modalImg) modalImg.src = LAST_ORDER_WASL_URL || dataUrl;
        if (typeof global.showModal === 'function') global.showModal('waOrderWaslModal');
        copyOrderWaslImage();
        openWhatsAppLink(phone ? ('https://wa.me/' + phone) : 'https://web.whatsapp.com/');
        if (!phone && typeof global.toast === 'function') {
          global.toast('واتسئاپ', 'ژمارە نەبوو — چات هەڵبژێرە و Ctrl+V بکە', 'warning');
        } else if (typeof global.toast === 'function') {
          global.toast('ئامادەیە', 'وێنەی وەسڵ کۆپی کرا. لە واتسئاپ Ctrl+V بکە', 'success');
        }
      });
    });
    renderOrderHistory();
  }

  function renderOrderHistory() {
    var tbody = el('waOrderHistoryBody');
    if (!tbody) return;
    var all = loadSavedOrders();
    if (!all.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;color:var(--text-muted);">هێشتا داواکارییەک نەنێردراوە</td></tr>';
      return;
    }
    tbody.innerHTML = all.slice(0, 30).map(function (o) {
      var when = o.sentAt ? ((typeof formatSaleDateTime === 'function') ? formatSaleDateTime(o.sentAt, true) : '') : '';
      var count = (o.items || []).length;
      var st = o.status === 'received' ? 'گەیشت' : 'نێردرا';
      return '<tr>' +
        '<td>' + when + '</td>' +
        '<td><strong>' + (o.supplierName || '') + '</strong></td>' +
        '<td>' + count + ' کاڵا</td>' +
        '<td>' + st + '</td>' +
        '<td><button type="button" class="btn btn-xs btn-primary" onclick="SuppliersManager.receiveOrder(\'' + o.id + '\')">کاڵا گەیشت — وەسڵ</button></td>' +
      '</tr>';
    }).join('');
  }

  function receiveOrder(id) {
    var all = loadSavedOrders();
    var rec = all.find(function (o) { return o.id === id; });
    if (!rec) return;
    rec.status = 'received';
    persistSavedOrders(all);
    selectBuyTab('invoices');
    if (typeof global.openPurchaseModal === 'function') {
      global.openPurchaseModal(rec.supplierId, rec.items || []);
    }
  }

  /**
   * Open Supplier Debt Payment Modal
   */
  function openPayModal(id) {
    var supp = getSuppliers().find(function (s) { return s.id === id; });
    if (!supp) return;

    var debt = parseFloat(supp.credit !== undefined ? supp.credit : (supp.balance || 0)) || 0;

    setVal('suppPaySupplierId', supp.id);
    var nameEl = el('suppPayCompanyName');
    if (nameEl) nameEl.textContent = supp.name + (supp.repName ? (' (مەندوب: ' + supp.repName + ')') : '');

    var debtEl = el('suppPayCurrentDebt');
    if (debtEl) debtEl.textContent = fmtIqd(debt);

    setVal('suppPayAmount', debt > 0 ? debt : '');
    setVal('suppPayMethod', 'cash');
    setVal('suppPayReceiptNo', 'PAY-' + Date.now().toString().slice(-6));
    setVal('suppPayNotes', '');

    if (typeof global.showModal === 'function') global.showModal('supplierPayModal');
    setTimeout(function () { var a = el('suppPayAmount'); if (a) a.focus(); }, 100);
  }

  /**
   * Quick presets for debt payment amount
   */
  function setPayPreset(type) {
    var id = val('suppPaySupplierId');
    var supp = getSuppliers().find(function (s) { return s.id === id; });
    if (!supp) return;
    var debt = parseFloat(supp.credit !== undefined ? supp.credit : (supp.balance || 0)) || 0;

    if (type === 'full') setVal('suppPayAmount', debt);
    else if (type === 'half') setVal('suppPayAmount', Math.round(debt / 2));
    else if (typeof type === 'number') setVal('suppPayAmount', type);
  }

  /**
   * Submit Debt Payment to Supplier
   */
  function submitPayment() {
    var id = val('suppPaySupplierId');
    var supp = getSuppliers().find(function (s) { return s.id === id; });
    if (!supp) return;

    var amount = parseFloat(val('suppPayAmount')) || 0;
    if (amount <= 0) {
      if (typeof global.toast === 'function') global.toast('هەڵە', 'تکایە بڕی پارەی دراوە بنووسە', 'error');
      var a = el('suppPayAmount'); if (a) a.focus();
      return;
    }

    var method = val('suppPayMethod') || 'cash';
    var receiptNo = val('suppPayReceiptNo') || ('PAY-' + Date.now().toString().slice(-6));
    var notes = val('suppPayNotes').trim();
    var dateStr = new Date().toISOString();

    var currentDebt = parseFloat(supp.credit !== undefined ? supp.credit : (supp.balance || 0)) || 0;
    var newDebt = Math.max(0, currentDebt - amount);
    supp.credit = newDebt;
    supp.balance = newDebt;

    // Record payment entry in local DB
    var payRecord = {
      id: 'spay_' + Date.now(),
      supplierId: supp.id,
      supplierName: supp.name,
      amount: amount,
      date: dateStr,
      paymentMethod: method,
      receiptNo: receiptNo,
      notes: notes,
      cashier: (global.CURRENT_USER && global.CURRENT_USER.fullName) || 'ئەدمین'
    };
    getSupplierPayments().unshift(payRecord);

    // Optionally connect to Expenses if paid from Cash Drawer
    if (method === 'cash' && global.DB && global.DB.expenses) {
      var expRecord = {
        id: 'exp_sup_' + Date.now(),
        title: 'دانەوەی قەرزی کۆمپانیا: ' + supp.name,
        amount: amount,
        category: 'قەرزی کۆمپانیا',
        date: dateStr,
        notes: 'وەسڵی دانەوەی ژمارە ' + receiptNo
      };
      global.DB.expenses.unshift(expRecord);
      if (typeof global.DataStore !== 'undefined' && global.DataStore.saveExpenses) {
        global.DataStore.saveExpenses();
      }
    }

    // Persist suppliers
    if (typeof global.DataStore !== 'undefined' && global.DataStore.saveSuppliers) {
      global.DataStore.saveSuppliers();
    }

    // Sync to API
    if (typeof global.ApiClient !== 'undefined' && global.ApiClient.isOnline) {
      fetch('/api/suppliers/' + supp.id + '/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payRecord)
      }).catch(function (e) { console.warn('API supplier pay sync failed', e); });
    }

    if (typeof global.hideModal === 'function') global.hideModal('supplierPayModal');
    render();

    if (typeof global.toast === 'function') {
      global.toast('سەرکەوتوو', 'بڕی ' + fmtIqd(amount) + ' درایە کۆمپانیای (' + supp.name + ') و قەرزەکەی کەمکرایەوە.', 'success');
    }
  }

  /**
   * Open Account Statement Modal (کەشف حیساب)
   */
  function openStatement(id) {
    var supp = getSuppliers().find(function (s) { return s.id === id; });
    if (!supp) return;

    activeStatementSupplierId = id;
    var purchases = getPurchases().filter(function (p) { return p.supplierId === id; });
    var payments = getSupplierPayments().filter(function (pay) { return pay.supplierId === id; });

    // Set header info
    var nameEl = el('suppStatementCompanyName');
    if (nameEl) nameEl.textContent = supp.name;
    var repEl = el('suppStatementRepName');
    if (repEl) repEl.textContent = supp.repName || 'مەندوب دیاری نەکراوە';
    var phoneEl = el('suppStatementPhone');
    if (phoneEl) phoneEl.textContent = supp.phone || '-';

    var curDebt = parseFloat(supp.credit !== undefined ? supp.credit : (supp.balance || 0)) || 0;
    var debtBadgeEl = el('suppStatementDebtBadge');
    if (debtBadgeEl) debtBadgeEl.textContent = fmtIqd(curDebt);

    // Build ledger entries
    var ledger = [];
    purchases.forEach(function (p) {
      ledger.push({
        date: p.date || '',
        title: 'وەسڵی کڕین',
        ref: p.invoiceNumber || p.id,
        increase: parseFloat(p.total) || 0,
        decrease: 0,
        notes: p.notes || ''
      });
    });

    payments.forEach(function (pay) {
      ledger.push({
        date: pay.date || '',
        title: 'دانەوەی پارە (پارەدان)',
        ref: pay.receiptNo || pay.id,
        increase: 0,
        decrease: parseFloat(pay.amount) || 0,
        notes: (pay.paymentMethod ? ('[' + pay.paymentMethod + '] ') : '') + (pay.notes || '')
      });
    });

    ledger.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });

    var running = 0;
    var rowsHtml = '';
    var totalInc = 0;
    var totalDec = 0;

    if (ledger.length === 0) {
      rowsHtml = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">هیچ جوڵەیەکی کڕین یان پارەدان بۆ ئەم کۆمپانیایە تۆمار نەکراوە.</td></tr>';
    } else {
      rowsHtml = ledger.map(function (item, idx) {
        running += (item.increase - item.decrease);
        totalInc += item.increase;
        totalDec += item.decrease;
        var dateFormatted = item.date ? item.date.replace('T', ' ').slice(0, 16) : '-';

        return '<tr>' +
          '<td>' + (idx + 1) + '</td>' +
          '<td>' + dateFormatted + '</td>' +
          '<td><strong style="color:' + (item.increase > 0 ? '#60a5fa' : '#34d399') + ';">' + item.title + '</strong></td>' +
          '<td>' + (item.ref || '-') + '</td>' +
          '<td style="color:#60a5fa;">' + (item.increase > 0 ? fmtIqd(item.increase) : '-') + '</td>' +
          '<td style="color:#10b981;">' + (item.decrease > 0 ? fmtIqd(item.decrease) : '-') + '</td>' +
          '<td><strong style="color:' + (running > 0 ? '#ef4444' : '#10b981') + ';">' + fmtIqd(running) + '</strong></td>' +
        '</tr>';
      }).join('');
    }

    var tbody = el('suppStatementTableBody');
    if (tbody) tbody.innerHTML = rowsHtml;

    var sumPurchasesEl = el('suppStatementTotalPurchases');
    if (sumPurchasesEl) sumPurchasesEl.textContent = fmtIqd(totalInc);
    var sumPaymentsEl = el('suppStatementTotalPayments');
    if (sumPaymentsEl) sumPaymentsEl.textContent = fmtIqd(totalDec);

    if (typeof global.showModal === 'function') global.showModal('supplierStatementModal');
  }

  /**
   * Print Statement (چاپی کەشف حیساب)
   */
  function printStatement() {
    var content = el('supplierStatementPrintArea');
    if (!content) return;
    var orig = document.body.innerHTML;
    var printWindow = window.open('', '', 'width=900,height=700');
    var marketName = (global.DB && global.DB.settings && global.DB.settings.name) ? global.DB.settings.name : 'مارکێت';
    printWindow.document.write(
      '<!DOCTYPE html><html dir="rtl" lang="ckb"><head><meta charset="utf-8"><title>کەشف حیسابی کۆمپانیا</title>' +
      '<style>' +
        'body{font-family:system-ui,-apple-system,sans-serif;margin:24px;direction:rtl;color:#1e293b;}' +
        'h1,h2,h3{margin:4px 0;}' +
        '.header{display:flex;justify-content:space-between;border-bottom:2px solid #334155;padding-bottom:12px;margin-bottom:16px;}' +
        'table{width:100%;border-collapse:collapse;margin-top:14px;font-size:14px;}' +
        'th,td{border:1px solid #cbd5e1;padding:8px;text-align:right;}' +
        'th{background:#f1f5f9;}' +
        '.summary{margin-top:18px;display:flex;justify-content:space-between;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-weight:bold;}' +
      '</style></head><body>' +
      content.innerHTML +
      '</body></html>'
    );
    printWindow.document.close();
    printWindow.focus();
    setTimeout(function () {
      printWindow.print();
      printWindow.close();
    }, 400);
  }

  // Export module globally
  global.SuppliersManager = {
    render: render,
    onSearchInput: onSearchInput,
    onDayFilterChange: onDayFilterChange,
    onDebtFilterToggle: onDebtFilterToggle,
    openModal: openModal,
    save: save,
    edit: openModal,
    remove: remove,
    quickPurchase: quickPurchase,
    openPayModal: openPayModal,
    setPayPreset: setPayPreset,
    submitPayment: submitPayment,
    openStatement: openStatement,
    printStatement: printStatement,
    openWhatsApp: openWhatsApp,
    selectBuyTab: selectBuyTab,
    startOrder: startOrder,
    onOrderSupplierChange: onOrderSupplierChange,
    addOrderLine: addOrderLine,
    addFreeTextLine: addFreeTextLine,
    filterOrderCat: filterOrderCat,
    renderOrderProducts: renderOrderProducts,
    changeOrderQty: changeOrderQty,
    setOrderQty: setOrderQty,
    copyOrderText: copyOrderText,
    copyOrderWaslImage: copyOrderWaslImage,
    downloadOrderWasl: downloadOrderWasl,
    openWhatsAppForOrderWasl: openWhatsAppForOrderWasl,
    refreshOrderPreview: refreshOrderPreview,
    quickAddProduct: quickAddProduct,
    removeOrderLine: removeOrderLine,
    sendWhatsAppOrder: sendWhatsAppOrder,
    receiveOrder: receiveOrder
  };

})(typeof window !== 'undefined' ? window : this);

