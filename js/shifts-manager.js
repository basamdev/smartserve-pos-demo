/* ═══════════════════════════════════════════════════════════════
   SAM MARKET POS — 24/7 Enterprise Shifts & Cash Drawer System
   Features:
   - 3-Shift 24-Hour Cycle (Morning, Evening, Night)
   - Real-time Cash-In / Cash-Out with Instant 80mm Drawer Slips
   - Mid-Shift X-Report (Audit Snapshot without closing)
   - End-of-Shift Z-Report with Iraqi Denomination Counter & Variance
   - 24-Hour Daily Master Z-Report with WhatsApp / Telegram 1-Click Sharing
   - 80mm Xprinter Thermal Print Engine
   ═══════════════════════════════════════════════════════════════ */

var ShiftsManager = (function () {
  var ACTIVE_SHIFT_DATA = null;
  function t12(raw, sec) {
    return (typeof formatSaleTime === "function") ? formatSaleTime(raw, sec) : "";
  }
  function t12dt(raw, sec) {
    return (typeof formatSaleDateTime === "function") ? formatSaleDateTime(raw, sec) : "";
  }

  function storeBrand() {
    if (typeof getStoreName === "function") return getStoreName();
    var n = (typeof DB !== "undefined" && DB.settings && DB.settings.marketName) ? String(DB.settings.marketName).trim() : "";
    if (!n || /سام\s*مارکێت/i.test(n) || /sam\s*market/i.test(n)) return "مارکێت";
    return n;
  }

  function ht(ku) {
    try {
      if (typeof I18n !== "undefined" && typeof I18n.t === "function") return I18n.t(ku);
    } catch (e) {}
    return ku;
  }

  function printHtmlViaIframe(html) {
    if (typeof ImmediatePrinter !== "undefined" && typeof ImmediatePrinter.print === "function") {
      ImmediatePrinter.print(html, { pageSize: "80mm" });
      return;
    }
    var iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    var doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(function () {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) {}
      setTimeout(function () { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 1500);
    }, 250);
  }
  var CURRENT_MOV_TYPE = "out";
  var CACHED_DAILY_REPORT = null;
  var CACHED_X_REPORT = null;

  function getShiftApiBase() {
    if (window.isPosDemoMode && window.isPosDemoMode()) return "";
    if (typeof ApiClient !== "undefined" && typeof ApiClient.getBaseUrl === "function") {
      return ApiClient.getBaseUrl();
    }
    if (window.location && window.location.origin && window.location.origin.indexOf("http") === 0) {
      return window.location.origin;
    }
    return "http://localhost:3005";
  }

  /* ═══ OFFLINE-FIRST LOCAL HANDOVER STORE (SQLite via SqliteDB) ═══
     The Node backend (port 3005) is optional. On XAMPP/offline we persist
     cash handovers locally in the SQLite database so the feature always works. */
  var HANDOVER_COLLECTION = "cash_handovers";

  function getLocalHandovers() {
    try {
      if (typeof SqliteDB !== "undefined" && SqliteDB.getCollection) {
        return SqliteDB.getCollection(HANDOVER_COLLECTION) || [];
      }
    } catch (e) {}
    try {
      return JSON.parse(localStorage.getItem("sm_cash_handovers") || "[]");
    } catch (e) { return []; }
  }

  function persistLocalHandovers(list) {
    try {
      if (typeof SqliteDB !== "undefined" && SqliteDB.replaceCollection) {
        SqliteDB.replaceCollection(HANDOVER_COLLECTION, list, "id");
        return true;
      }
    } catch (e) {}
    try {
      localStorage.setItem("sm_cash_handovers", JSON.stringify(list));
      return true;
    } catch (e) { return false; }
  }

  function saveLocalHandover(record) {
    var list = getLocalHandovers();
    if (!record.id) record.id = "ho_" + Date.now() + Math.random().toString(36).slice(2, 6);
    if (!record.createdAt) record.createdAt = new Date().toISOString();
    list.push(record);
    persistLocalHandovers(list);
    return record;
  }

  var REASON_CHIPS_OUT = [
    "☕ چا و قاوە و ئاو بۆ ستاف",
    "🍞 نان و خواردنی کاشیرەکان",
    "🧼 پاککەرەوە و کیسەی نایلۆن",
    "🚚 کرێی گواستنەوە و تاکسی",
    "💰 تەسلیمکردن بە خاوەن مارکێت (Safe Drop)",
    "📦 دانەوەی قەرزی دابینکەر",
    "🔧 چاککردنەوە و کارەبا",
    "📝 خەرجی تر"
  ];

  var REASON_CHIPS_IN = [
    "🪙 هێنانی وردە پارە بۆ سندوق",
    "💵 زیادکردنی سەرمایەی سندوق",
    "↩️ گەڕانەوەی خەرجی زیادە",
    "➕ سەرمایەی دەرەکی تر"
  ];

  /* ─── INITIALIZATION ─── */
  function init() {
    setupEventListeners();
    refreshCurrentShift();
    startShiftScheduleMonitor();
  }

  function setupEventListeners() {
    // POS Header Buttons
    var drawerBtn = $("#headerDrawerBtn");
    if (drawerBtn) drawerBtn.addEventListener("click", function () { openCashMovementModal("out"); });

    var xReportHeaderBtn = $("#headerXReportBtn");
    if (xReportHeaderBtn) xReportHeaderBtn.addEventListener("click", openXReportModal);

    var closeShiftHeaderBtn = $("#headerCloseShiftBtn");
    if (closeShiftHeaderBtn) closeShiftHeaderBtn.addEventListener("click", openCloseShiftModal);

    var headerCloseShiftTabBtn = $("#headerCloseShiftTabBtn");
    if (headerCloseShiftTabBtn) headerCloseShiftTabBtn.addEventListener("click", openCloseShiftModal);

    var headerHandoverTabBtn = $("#headerHandoverTabBtn");
    if (headerHandoverTabBtn) headerHandoverTabBtn.addEventListener("click", function () { openCashHandoverModal(); });

    var posShiftBadge = $("#posShiftBadge");
    if (posShiftBadge) {
      posShiftBadge.addEventListener("click", function (e) {
        e.stopPropagation();
        if (CURRENT_SHIFT) {
          openCloseShiftModal();
        } else {
          openOpenShiftModal();
        }
      });
    }

    // Shifts Page Buttons
    var openBtn = $("#openShiftBtn");
    if (openBtn) openBtn.addEventListener("click", openOpenShiftModal);

    var closeBtn = $("#closeShiftBtn");
    if (closeBtn) closeBtn.addEventListener("click", openCloseShiftModal);

    var xBtn = $("#xReportBtn");
    if (xBtn) xBtn.addEventListener("click", openXReportModal);

    var movBtn = $("#cashMovementBtn");
    if (movBtn) movBtn.addEventListener("click", function () { openCashMovementModal("out"); });

    var dailyBtn = $("#dailyZReportBtn");
    if (dailyBtn) dailyBtn.addEventListener("click", function () { openDailyZReportModal(); });

    // Modals Confirm/Cancel
    var confirmOpenBtn = $("#confirmOpenShiftBtn");
    if (confirmOpenBtn) confirmOpenBtn.addEventListener("click", confirmOpenShift);

    var cancelOpenBtn = $("#cancelOpenShiftBtn");
    if (cancelOpenBtn) cancelOpenBtn.addEventListener("click", function () { hideModal("openShiftModal"); });

    var closeOpenModalBtn = $("#closeOpenShiftBtn");
    if (closeOpenModalBtn) closeOpenModalBtn.addEventListener("click", function () { hideModal("openShiftModal"); });

    var confirmCloseBtn = $("#confirmCloseShiftBtn");
    if (confirmCloseBtn) confirmCloseBtn.addEventListener("click", confirmCloseShift);

    var cancelCloseBtn = $("#cancelCloseShiftBtn");
    if (cancelCloseBtn) cancelCloseBtn.addEventListener("click", function () { hideModal("closeShiftModal"); });

    var closeCloseModalBtn = $("#closeCloseShiftBtn");
    if (closeCloseModalBtn) closeCloseModalBtn.addEventListener("click", function () { hideModal("closeShiftModal"); });

    var confirmMovBtn = $("#confirmCashMovementBtn");
    if (confirmMovBtn) confirmMovBtn.addEventListener("click", confirmCashMovement);

    var cancelMovBtn = $("#cancelCashMovementBtn");
    if (cancelMovBtn) cancelMovBtn.addEventListener("click", function () { hideModal("cashMovementModal"); });

    var closeMovModalBtn = $("#closeCashMovementBtn");
    if (closeMovModalBtn) closeMovModalBtn.addEventListener("click", function () { hideModal("cashMovementModal"); });

    // X-Report Modal
    var printXBtn = $("#printXReportBtn");
    if (printXBtn) printXBtn.addEventListener("click", printXReport);

    var copyXBtn = $("#copyXReportBtn");
    if (copyXBtn) copyXBtn.addEventListener("click", copyXReportText);

    var cancelXBtn = $("#cancelXReportBtn");
    if (cancelXBtn) cancelXBtn.addEventListener("click", function () { hideModal("xReportModal"); });

    var closeXModalBtn = $("#closeXReportBtn");
    if (closeXModalBtn) closeXModalBtn.addEventListener("click", function () { hideModal("xReportModal"); });

    // Daily Z-Report Modal
    var shareWaBtn = $("#shareDailyReportWaBtn");
    if (shareWaBtn) shareWaBtn.addEventListener("click", shareDailyReportWhatsApp);

    var copyDailyBtn = $("#copyDailyReportBtn");
    if (copyDailyBtn) copyDailyBtn.addEventListener("click", copyDailyReportText);

    var printDailyBtn = $("#printDailyReportBtn");
    if (printDailyBtn) printDailyBtn.addEventListener("click", printDailyMasterZReport);

    var cancelDailyBtn = $("#cancelDailyZReportBtn");
    if (cancelDailyBtn) cancelDailyBtn.addEventListener("click", function () { hideModal("dailyZReportModal"); });

    var closeDailyModalBtn = $("#closeDailyZReportBtn");
    if (closeDailyModalBtn) closeDailyModalBtn.addEventListener("click", function () { hideModal("dailyZReportModal"); });

    var dateInput = $("#dailyReportDateInput");
    if (dateInput) {
      dateInput.addEventListener("change", function () {
        loadDailyReportForDate(this.value);
      });
    }

    var handoverHeaderBtn = $("#headerHandoverBtn");
    if (handoverHeaderBtn) handoverHeaderBtn.addEventListener("click", function () { openCashHandoverModal(); });

    var closeHoModalBtn = $("#closeCashHandoverModalBtn");
    if (closeHoModalBtn) closeHoModalBtn.addEventListener("click", function () { closeCashHandoverModal(); });

    var cancelPastHoBtn = $("#cancelPastHandoversBtn");
    if (cancelPastHoBtn) cancelPastHoBtn.addEventListener("click", function () { hideModal("pastHandoversModal"); });
    var closePastHoBtn = $("#closePastHandoversBtn");
    if (closePastHoBtn) closePastHoBtn.addEventListener("click", function () { hideModal("pastHandoversModal"); });

    var cancelAgrBtn = $("#cancelHandoverAgreementBtn");
    if (cancelAgrBtn) cancelAgrBtn.addEventListener("click", function () { hideModal("handoverAgreementModal"); });
    var closeAgrBtn = $("#closeHandoverAgreementBtn");
    if (closeAgrBtn) closeAgrBtn.addEventListener("click", function () { hideModal("handoverAgreementModal"); });

    var cancelBalBtn = $("#cancelCashierBalanceBtn");
    if (cancelBalBtn) cancelBalBtn.addEventListener("click", function () { hideModal("cashierBalanceModal"); });
    var closeBalBtn = $("#closeCashierBalanceBtn");
    if (closeBalBtn) closeBalBtn.addEventListener("click", function () { hideModal("cashierBalanceModal"); });

    var closeImgModalBtn = $("#closeHandoverImageBtn");
    if (closeImgModalBtn) closeImgModalBtn.addEventListener("click", function () { hideModal("handoverImageModal"); });
    var cancelImgModalBtn = $("#cancelHandoverImageBtn");
    if (cancelImgModalBtn) cancelImgModalBtn.addEventListener("click", function () { hideModal("handoverImageModal"); });

    var closeTrModalBtn = $("#closeTransferShiftBtn");
    if (closeTrModalBtn) closeTrModalBtn.addEventListener("click", function () { hideModal("transferShiftModal"); });
    var cancelTrModalBtn = $("#cancelTransferShiftBtn");
    if (cancelTrModalBtn) cancelTrModalBtn.addEventListener("click", function () { hideModal("transferShiftModal"); });

    // Live Handover Inputs Calculation
    $$(".ho-bind-calc").forEach(function (inp) {
      inp.addEventListener("input", recalcHandover);
      inp.addEventListener("change", recalcHandover);
      if (inp.classList.contains("ho-main-val-input")) {
        inp.addEventListener("focus", function () {
          var wrap = this.closest(".ho-main-input-wrap");
          if (wrap) wrap.classList.add("editing");
          try { this.select(); } catch (e) {}
        });
        inp.addEventListener("blur", function () {
          var wrap = this.closest(".ho-main-input-wrap");
          if (wrap) wrap.classList.remove("editing");
          recalcHandover();
        });
      }
    });

    // Shifts Navigation Tabs
    $$(".shift-nav-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        var target = this.getAttribute("data-shift-tab");
        selectShiftTab(target);
      });
    });

    // Global Key Shortcuts for POS
    document.addEventListener("keydown", function (e) {
      // Only trigger if not typing in an input
      var tag = e.target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "F7") {
        e.preventDefault();
        openCashMovementModal("out");
      } else if (e.key === "F11") {
        e.preventDefault();
        openXReportModal();
      } else if (e.key === "F8" && e.shiftKey) {
        e.preventDefault();
        openCashHandoverModal();
      }
    });
  }

  /* ─── LIVE SHIFT STATUS REFRESH ─── */
  function refreshCurrentShift(cb) {
    var baseUrl = (typeof ApiClient !== "undefined" && ApiClient.getBaseUrl) ? ApiClient.getBaseUrl() : "http://localhost:3005";
    var shiftUrl = baseUrl + "/api/shifts/current";
    if (typeof BranchManager !== "undefined" && BranchManager.currentId) {
      shiftUrl += "?branchId=" + encodeURIComponent(BranchManager.currentId());
    }
    fetch(shiftUrl, {
      headers: (typeof BranchManager !== "undefined" && BranchManager.currentId)
        ? { "X-Branch-Id": BranchManager.currentId() }
        : {}
    })
      .then(function (res) { return res.json(); })
      .then(function (shift) {
        CURRENT_SHIFT = shift || null;
        ACTIVE_SHIFT_DATA = shift || null;
        updateUI();
        if (cb) cb(shift);
      })
      .catch(function () {
        // Fallback to client DB
        var shifts = branchRecords((typeof DB !== "undefined" && DB && DB.shifts) ? DB.shifts : []);
        var openShifts = shifts.filter(function (s) { return !s.closedAt && s.status !== "closed"; });
        CURRENT_SHIFT = openShifts.length > 0 ? openShifts[0] : null;
        ACTIVE_SHIFT_DATA = CURRENT_SHIFT;
        updateUI();
        if (cb) cb(CURRENT_SHIFT);
      });
  }

  function updateUI() {
    var isOpen = !!CURRENT_SHIFT;

    // POS Header Badge
    var badge = $("#posShiftBadge");
    var badgeText = $("#posShiftText");
    if (badge && badgeText) {
      if (isOpen) {
        badge.className = "pos-shift-indicator";
        var typeIcon = getShiftTypeIcon(CURRENT_SHIFT.shiftType);
        badgeText.innerHTML = typeIcon + " شێفت: چالاک";
      } else {
        badge.className = "pos-shift-indicator closed";
        badgeText.textContent = "شێفت: داخراوە";
      }
    }

    // Top action buttons visibility
    var openBtn = $("#openShiftBtn");
    var closeBtn = $("#closeShiftBtn");
    var xBtn = $("#xReportBtn");
    var movBtn = $("#cashMovementBtn");
    if (openBtn) openBtn.style.display = isOpen ? "none" : "inline-flex";
    if (closeBtn) closeBtn.style.display = isOpen ? "inline-flex" : "none";
    if (xBtn) xBtn.style.display = isOpen ? "inline-flex" : "none";
    if (movBtn) movBtn.style.display = isOpen ? "inline-flex" : "none";

    renderHeroShiftCard();
    renderShiftsTable();
  }

  function selectShiftTab(target) {
    if (!target) target = "movements";
    if (target === "daily") target = "history";
    $$(".shift-nav-tab").forEach(function (t) {
      if (t.getAttribute("data-shift-tab") === target) {
        t.classList.add("active");
      } else {
        t.classList.remove("active");
      }
    });
    $$(".shift-tab-content").forEach(function (p) { p.style.display = "none"; });
    var targetPane = $("#shiftsTab" + target.charAt(0).toUpperCase() + target.slice(1));
    if (targetPane) targetPane.style.display = "block";

    if (target === "movements") {
      renderCashMovementsTable();
    } else if (target === "handover") {
      var board = $("#pageHandoverWrapper");
      var tabPane = $("#shiftsTabHandover");
      if (board && tabPane && board.parentElement !== tabPane) {
        tabPane.appendChild(board);
      }
      openCashHandoverBoard(false);
    } else {
      renderShiftsTable();
      renderDailyReportsArchive();
    }
  }

  function getShiftTypeIcon(type) {
    if (type === "morning") return "☀️ بەیانی";
    if (type === "evening") return "🌆 ئێوارە";
    if (type === "night") return "🌙 شەو";
    return "🔄 بەردەوام";
  }

  function getShiftTypeClass(type) {
    if (type === "morning") return "shift-type-morning";
    if (type === "evening") return "shift-type-evening";
    if (type === "night") return "shift-type-night";
    return "shift-type-general";
  }

  /* ─── HERO SHIFT CARD ─── */
  function renderHeroShiftCard() {
    var hero = $("#activeShiftHero");
    if (!hero) return;

    if (!CURRENT_SHIFT) {
      hero.className = "active-shift-hero no-shift shifts-easy-status";
      hero.innerHTML = [
        '<div class="shifts-easy-status-row">',
        '  <div>',
        '    <div class="shifts-easy-status-kicker">سندوق داخراوە</div>',
        '    <h2>شێفتێک بکەرەوە بۆ دەستپێکردنی فرۆشتن</h2>',
        '    <p>پارەی ناو سندوق بنووسە، پاشان دەتوانیت پسوڵە بدەیت.</p>',
        '  </div>',
        '  <button class="btn btn-primary shifts-easy-main-btn" onclick="ShiftsManager.openOpenShiftModal()"><i class="fas fa-play"></i> کردنەوەی شێفت</button>',
        '</div>'
      ].join("");
      return;
    }

    var s = CURRENT_SHIFT;
    var openDate = new Date(s.openedAt);
    var startTimeStr = t12(openDate);
    var typeLabel = getShiftTypeIcon(s.shiftType);

    // Duration calculation
    var elapsedMs = Math.max(0, Date.now() - openDate.getTime());
    var elapsedHrs = Math.floor(elapsedMs / (1000 * 60 * 60));
    var elapsedMins = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
    var durationStr = (elapsedHrs > 0 ? elapsedHrs + " کاتژمێر و " : "") + elapsedMins + " خولەک پێش ئێستا";

    var expectedCash = Number(s.expectedCash || (s.openingCash + (s.cashSales || 0) + (s.cashIn || 0) - (s.cashOut || 0)));

    hero.className = "active-shift-hero shifts-easy-status is-open";
    hero.innerHTML = [
      '<div class="shifts-easy-status-row">',
      '  <div>',
      '    <div class="shifts-easy-status-kicker">شێفت کراوەیە</div>',
      '    <h2>' + (s.cashier || "کاشیر") + ' · ' + typeLabel + '</h2>',
      '    <p>دەستپێکردن ' + startTimeStr + ' — ' + durationStr + '</p>',
      '  </div>',
      '</div>',
      '<div class="shifts-easy-kpis">',
      '  <div class="shifts-easy-kpi highlight"><span>دەبێت لە سندوق بێت</span><strong>' + fmt(expectedCash) + '</strong></div>',
      '  <div class="shifts-easy-kpi"><span>فرۆشتنی نەقد</span><strong>' + fmt(s.cashSales || 0) + '</strong></div>',
      '  <div class="shifts-easy-kpi"><span>کارت / قەرز</span><strong>' + fmt((s.cardSales || 0) + (s.debtSales || 0)) + '</strong></div>',
      '  <div class="shifts-easy-kpi"><span>پسوڵە</span><strong>' + (s.ordersCount || 0) + '</strong></div>',
      '</div>',
      '<div class="shifts-easy-actions">',
      '  <button class="btn btn-secondary" onclick="ShiftsManager.openCashMovementModal(\'out\')"><i class="fas fa-coins"></i> پارە بخە / دەربێنە</button>',
      '  <button class="btn btn-info" onclick="ShiftsManager.openXReportModal()"><i class="fas fa-search-dollar"></i> پشکنین (بەبێ داخستن)</button>',
      '  <button class="btn btn-warning" onclick="ShiftsManager.openCloseShiftModal()"><i class="fas fa-stop-circle"></i> داخستنی شێفت</button>',
      '</div>'
    ].join("");
  }

  /* ─── OPEN SHIFT FLOW ─── */
  function openOpenShiftModal() {
    var select = $("#openShiftCashierSelect");
    if (select) {
      select.innerHTML = "";
      var users = (typeof SqliteDB !== "undefined" && SqliteDB.getAllUsers) ? SqliteDB.getAllUsers() : (DB.users || []);
      if (users.length === 0) {
        var selfName = (typeof getActiveOperatorName === "function") ? getActiveOperatorName() : "";
        users = selfName ? [{ fullName: selfName, username: "", role: "کاشیر" }] : [];
      }
      users.forEach(function (u) {
        var opt = document.createElement("option");
        opt.value = u.fullName || u.username;
        opt.textContent = (u.fullName || u.username) + " (" + (u.role || "کاشیر") + ")";
        if (DB.currentUser && (u.username === DB.currentUser.username || u.fullName === DB.currentUser.name)) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });
    }

    $("#openingCash").value = "0";
    $("#shiftNote").value = "";
    showModal("openShiftModal");
  }

  function setOpeningCashPreset(amt) {
    var input = $("#openingCash");
    if (input) input.value = String(amt);
  }

  function confirmOpenShift() {
    var cashier = $("#openShiftCashierSelect") ? $("#openShiftCashierSelect").value : (DB.currentUser ? DB.currentUser.name : "کاشیر");
    var shiftType = $("#openShiftTypeSelect") ? $("#openShiftTypeSelect").value : "general";
    var openingCash = parseFloat($("#openingCash").value) || 0;
    var note = ($("#shiftNote").value || "").trim();

    fetch(getShiftApiBase() + "/api/shifts/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cashier: cashier, openingCash: openingCash, shiftType: shiftType, note: note })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.error) {
          toast("هەڵە", res.error, "error");
          return;
        }
        hideModal("openShiftModal");
        toast("سەرکەوتوو", "شێفتی نوێ کرایەوە بۆ: " + cashier, "success");
        if (typeof PosAudio !== "undefined") PosAudio.playCashSuccess();
        refreshCurrentShift();
      })
      .catch(function (err) {
        // Local offline fallback
        var shift = {
          id: gid(),
          cashier: cashier,
          shiftType: shiftType,
          openedAt: new Date().toISOString(),
          openingCash: openingCash,
          expectedCash: openingCash,
          cashSales: 0,
          cardSales: 0,
          debtSales: 0,
          totalSales: 0,
          cashIn: 0,
          cashOut: 0,
          status: "open",
          note: note
        };
        if (typeof BranchManager !== "undefined" && BranchManager.stamp) BranchManager.stamp(shift);
        DB.shifts = DB.shifts || [];
        DB.shifts.unshift(shift);
        if (typeof DataStore !== "undefined" && DataStore.saveShifts) DataStore.saveShifts();
        CURRENT_SHIFT = shift;
        hideModal("openShiftModal");
        toast("سەرکەوتوو", "شێفتی ئۆفلاین کرایەوە", "success");
        updateUI();
      });
  }

  /* ─── CASH MOVEMENTS (CASH-IN / CASH-OUT) ─── */
  function openCashMovementModal(defaultType) {
    CURRENT_MOV_TYPE = defaultType || "out";
    selectMovType(CURRENT_MOV_TYPE);
    $("#movAmountInput").value = "";
    $("#movReasonInput").value = "";
    showModal("cashMovementModal");
    setTimeout(function () {
      var amtInput = $("#movAmountInput");
      if (amtInput) amtInput.focus();
    }, 150);
  }

  function selectMovType(type) {
    CURRENT_MOV_TYPE = type;
    var outBtn = $("#movTypeOutBtn");
    var inBtn = $("#movTypeInBtn");
    var label = $("#movReasonLabel");
    var chipsContainer = $("#movReasonChips");

    if (outBtn) outBtn.className = "mov-toggle-btn btn-out" + (type === "out" ? " active" : "");
    if (inBtn) inBtn.className = "mov-toggle-btn btn-in" + (type === "in" ? " active" : "");

    if (label) label.textContent = type === "out" ? "هۆکاری بردنە دەرەوە / خەرجی دەستبەجێ" : "هۆکاری پارەدانە ژوورەوە / وردە پارە";

    if (chipsContainer) {
      chipsContainer.innerHTML = "";
      var chips = type === "out" ? REASON_CHIPS_OUT : REASON_CHIPS_IN;
      chips.forEach(function (reason) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "reason-chip";
        btn.textContent = reason;
        btn.addEventListener("click", function () {
          $$(".reason-chip").forEach(function (c) { c.classList.remove("active"); });
          this.classList.add("active");
          $("#movReasonInput").value = reason;
        });
        chipsContainer.appendChild(btn);
      });
    }
  }

  function addMovAmount(amt) {
    var input = $("#movAmountInput");
    if (!input) return;
    var cur = parseFloat(input.value) || 0;
    input.value = String(cur + amt);
  }

  function confirmCashMovement() {
    var amt = parseFloat($("#movAmountInput").value) || 0;
    var reason = ($("#movReasonInput").value || "").trim();
    var shouldPrint = $("#movPrintReceiptCheckbox") ? $("#movPrintReceiptCheckbox").checked : true;

    if (amt <= 0) {
      toast("هەڵە", "تکایە بڕی پارە بنووسە (زیاتر لە ٠ د.ع)", "error");
      return;
    }
    if (!reason) {
      toast("ئاگاداری", "تکایە هۆکاری جوڵەی پارەکە دیاری بکە", "warning");
      return;
    }

    var cashierName = CURRENT_SHIFT ? CURRENT_SHIFT.cashier : (DB.currentUser ? DB.currentUser.name : "کاشیر");

    fetch(getShiftApiBase() + "/api/shifts/cash-movement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: CURRENT_MOV_TYPE,
        amount: amt,
        reason: reason,
        cashier: cashierName
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.error) {
          toast("هەڵە", res.error, "error");
          return;
        }
        hideModal("cashMovementModal");
        var typeWord = CURRENT_MOV_TYPE === "out" ? "خەرجی سندوق" : "وردە پارەی هاتوو";
        toast("سەرکەوتوو", typeWord + " تۆمارکرا: " + fmt(amt), "success");
        if (typeof PosAudio !== "undefined") PosAudio.playCashSuccess();

        if (shouldPrint) {
          printCashMovementReceipt({
            id: res.id,
            type: CURRENT_MOV_TYPE,
            amount: amt,
            reason: reason,
            cashier: cashierName,
            timestamp: res.timestamp || new Date().toISOString()
          });
        }

        refreshCurrentShift(function () {
          renderCashMovementsTable();
        });
      })
      .catch(function (err) {
        toast("ئاگاداری", "سێرڤەر وەڵامی نەدایەوە، جوڵەکە لە سیستەمی لۆکاڵ تۆمارکرا", "warning");
        hideModal("cashMovementModal");
      });
  }

  /* ─── X-REPORT (MID-SHIFT AUDIT) ─── */
  function openXReportModal() {
    fetch(getShiftApiBase() + "/api/shifts/x-report")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.error) {
          toast("ئاگاداری", data.error, "warning");
          return;
        }
        CACHED_X_REPORT = data;
        renderXReportModalContent(data);
        showModal("xReportModal");
      })
      .catch(function () {
        if (!CURRENT_SHIFT) {
          toast("ئاگاداری", "هیچ شێفتێکی کراوە نییە بۆ دەرهێنانی ڕاپۆرتی X", "warning");
          return;
        }
        // Client-side fallback calculation
        var localData = buildLocalXReportData();
        CACHED_X_REPORT = localData;
        renderXReportModalContent(localData);
        showModal("xReportModal");
      });
  }

  function buildLocalXReportData() {
    var s = CURRENT_SHIFT;
    var shiftOrders = (DB.orders || []).filter(function (o) { return o.shiftId === s.id; });
    var cashSales = shiftOrders.filter(function (o) { return o.paymentMethod === "cash"; }).reduce(function (a, o) { return a + (o.total || 0); }, 0);
    var cardSales = shiftOrders.filter(function (o) { return o.paymentMethod === "card"; }).reduce(function (a, o) { return a + (o.total || 0); }, 0);
    var debtSales = shiftOrders.filter(function (o) { return o.paymentMethod === "debt"; }).reduce(function (a, o) { return a + (o.total || 0); }, 0);
    var totalSales = cashSales + cardSales + debtSales;
    var profit = shiftOrders.reduce(function (a, o) { return a + (o.profit || 0); }, 0);
    var expected = (s.openingCash || 0) + cashSales + (s.cashIn || 0) - (s.cashOut || 0);

    return {
      success: true,
      reportType: "X-REPORT",
      generatedAt: new Date().toISOString(),
      shift: s,
      metrics: {
        ordersCount: shiftOrders.length,
        totalSales: totalSales,
        cashSales: cashSales,
        cardSales: cardSales,
        debtSales: debtSales,
        totalProfit: profit,
        cashIn: s.cashIn || 0,
        cashOut: s.cashOut || 0,
        expectedCash: expected
      },
      movements: []
    };
  }

  function renderXReportModalContent(d) {
    var container = $("#xReportContent");
    if (!container) return;

    var s = d.shift;
    var m = d.metrics;
    var openDate = new Date(s.openedAt);
    var genDate = new Date(d.generatedAt);

    var html = [
      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin-bottom:14px;">',
      '  <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:10px;margin-bottom:10px;">',
      '    <div><strong>کاشیر:</strong> ' + s.cashier + '</div>',
      '    <div><strong>شێفت:</strong> ' + getShiftTypeIcon(s.shiftType) + '</div>',
      '    <div><strong>دەستپێکردن:</strong> ' + t12(openDate) + '</div>',
      '  </div>',
      '  <div class="shift-hero-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:12px;">',
      '    <div class="shift-hero-kpi highlight-drawer">',
      '      <div class="kpi-label"><i class="fas fa-cash-register"></i> پارەی چاوەڕوانکراوی سندوق (ئێستا)</div>',
      '      <div class="kpi-val">' + fmt(m.expectedCash) + '</div>',
      '    </div>',
      '    <div class="shift-hero-kpi">',
      '      <div class="kpi-label"><i class="fas fa-chart-line"></i> کۆی گشتی فرۆشتن</div>',
      '      <div class="kpi-val" style="color:#60a5fa;">' + fmt(m.totalSales) + '</div>',
      '    </div>',
      '  </div>',
      '  <table class="receipt-table" style="width:100%;font-size:0.9rem;border-collapse:collapse;">',
      '    <tr><td style="padding:6px 0;color:var(--text-muted);">سەرمایەی سەرەتایی:</td><td style="text-align:left;font-weight:700;">' + fmt(s.openingCash) + '</td></tr>',
      '    <tr><td style="padding:6px 0;color:var(--text-muted);">فرۆشتنی نەقد (کاش):</td><td style="text-align:left;font-weight:700;color:#34d399;">+' + fmt(m.cashSales) + '</td></tr>',
      '    <tr><td style="padding:6px 0;color:var(--text-muted);">فرۆشتنی کارت/دیجیتاڵ:</td><td style="text-align:left;font-weight:700;color:#60a5fa;">' + fmt(m.cardSales) + '</td></tr>',
      '    <tr><td style="padding:6px 0;color:var(--text-muted);">فرۆشتنی قەرز:</td><td style="text-align:left;font-weight:700;color:#fbbf24;">' + fmt(m.debtSales) + '</td></tr>',
      '    <tr><td style="padding:6px 0;color:var(--text-muted);">پارەدانە ژوورەوە (+):</td><td style="text-align:left;font-weight:700;color:#10b981;">+' + fmt(m.cashIn) + '</td></tr>',
      '    <tr><td style="padding:6px 0;color:var(--text-muted);">خەرجی سندوق (-):</td><td style="text-align:left;font-weight:700;color:#ef4444;">-' + fmt(m.cashOut) + '</td></tr>',
      '    <tr><td style="padding:6px 0;color:var(--text-muted);">ژمارەی پسوڵە/کڕیاران:</td><td style="text-align:left;font-weight:700;">' + (m.ordersCount || 0) + ' پسوڵە</td></tr>',
      '  </table>',
      '</div>'
    ];

    container.innerHTML = html.join("");
  }

  function printXReport() {
    if (!CACHED_X_REPORT) return;
    var d = CACHED_X_REPORT;
    var s = d.shift;
    var m = d.metrics;
    var now = new Date();

    var html = [
      '<div style="font-family: Tahoma, Arial, sans-serif; width: 100%; margin: 0 auto; direction: rtl; text-align: right; font-size: 22px; line-height: 1.4; color: #000;">',
      '  <div style="text-align: center; margin-bottom: 4px;">',
      '    <div style="font-size: 32px; font-weight: 900;">' + storeBrand() + '</div>',
      '    <div style="font-size: 24px; font-weight: 800;">*** ڕاپۆرتی پشکنین (X-REPORT) ***</div>',
      '    <div style="font-size: 20px;">شێفت بەردەوامە (دانەخراوە)</div>',
      '  </div>',
      '  <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>کاشیر:</span><strong>' + s.cashier + '</strong></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>جۆری شێفت:</span><strong>' + getShiftTypeIcon(s.shiftType) + '</strong></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>دەستپێکردن:</span><span>' + t12(s.openedAt) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>کاتی ڕاپۆرت:</span><span>' + t12(now) + '</span></div>',
      '  <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>سەرمایەی سەرەتایی:</span><span>' + fmt(s.openingCash) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>فرۆشتنی نەقد:</span><span>+' + fmt(m.cashSales) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>فرۆشتنی کارت:</span><span>' + fmt(m.cardSales) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>فرۆشتنی قەرز:</span><span>' + fmt(m.debtSales) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between; font-weight:bold;"><span>کۆی گشتی فرۆشتن:</span><span>' + fmt(m.totalSales) + '</span></div>',
      '  <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>پارەدانە ژوورەوە (+):</span><span>+' + fmt(m.cashIn) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>خەرجی سندوق (-):</span><span>-' + fmt(m.cashOut) + '</span></div>',
      '  <div style="border-top: 2px solid #000; margin: 6px 0;"></div>',
      '  <div style="text-align:center; font-size:22px; font-weight:bold;">پارەی دەبێت لە سندوق بێت:</div>',
      '  <div style="text-align:center; font-size:36px; font-weight:900; margin:6px 0;">' + fmt(m.expectedCash) + '</div>',
      '  <div style="border-top: 2px solid #000; margin: 4px 0;"></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>ژمارەی پسوڵەکان:</span><span>' + (m.ordersCount || 0) + ' پسوڵە</span></div>',
      '  <div style="text-align:center; font-size:18px; margin-top:8px; color:#444;">',
      '    تێبینی: ئەمە تەنها ڕاپۆرتی پشکنینە و شێفت دانەخراوە.<br>',
      '    چاپکرا بە چاپکەری Xprinter 80mm',
      '  </div>',
      '</div>'
    ].join("");

    print80mmReceiptHtml(html);
  }

  function copyXReportText() {
    if (!CACHED_X_REPORT) return;
    var d = CACHED_X_REPORT;
    var text = [
      "🧾 ڕاپۆرتی X (ناوەڕاستی شێفت) - " + storeBrand(),
      "کاشیر: " + d.shift.cashier,
      "جۆری شێفت: " + getShiftTypeIcon(d.shift.shiftType),
      "سەرمایەی سەرەتایی: " + fmt(d.shift.openingCash),
      "فرۆشتنی نەقد: " + fmt(d.metrics.cashSales),
      "فرۆشتنی کارت: " + fmt(d.metrics.cardSales),
      "فرۆشتنی قەرز: " + fmt(d.metrics.debtSales),
      "کۆی فرۆشتن: " + fmt(d.metrics.totalSales),
      "پارەی هاتوو (+): " + fmt(d.metrics.cashIn),
      "خەرجی سندوق (-): " + fmt(d.metrics.cashOut),
      "👉 پارەی ئێستای ناو سندوق: " + fmt(d.metrics.expectedCash),
      "ژمارەی کڕیاران: " + d.metrics.ordersCount + " پسوڵە",
      "کاتی دەرکردن: " + t12(new Date(), true)
    ].join("\n");

    navigator.clipboard.writeText(text).then(function () {
      toast("سەرکەوتوو", "ڕاپۆرتی X کۆپیکرا بۆ کلیپبۆرد", "success");
    });
  }

  /* ─── CLOSE SHIFT & Z-REPORT FLOW ─── */
  function openCloseShiftModal() {
    refreshCurrentShift(function (shift) {
      if (!shift) {
        var proceed = confirm("ئاگاداری: هیچ شێفتێکی کراوە نییە لە ئێستادا.\n\nئایا دەتەوێت شێفتی نوێ بکەیتەوە بۆ دەستپێکردنی کار؟");
        if (proceed) {
          openOpenShiftModal();
        } else {
          toast("ئاگاداری", "هیچ شێفتێکی کراوە نییە بۆ داخستن", "info");
        }
        return;
      }

      var expectedCash = Number(shift.expectedCash || (shift.openingCash + (shift.cashSales || 0) + (shift.cashIn || 0) - (shift.cashOut || 0)));

      // Render summary header
      var summaryEl = $("#closeShiftMetricsSummary");
      if (summaryEl) {
        summaryEl.innerHTML = [
          '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">',
          '  <div><span style="color:#94a3b8;font-size:0.75rem;">کاشیر</span><div style="font-weight:800;">' + (shift.cashier || "کاشیر") + '</div></div>',
          '  <div><span style="color:#94a3b8;font-size:0.75rem;">سەرەتایی</span><div style="font-weight:800;">' + fmt(shift.openingCash) + '</div></div>',
          '  <div><span style="color:#94a3b8;font-size:0.75rem;">فرۆشتنی کاش</span><div style="font-weight:800;color:#34d399;">' + fmt(shift.cashSales || 0) + '</div></div>',
          '  <div><span style="color:#94a3b8;font-size:0.75rem;">خەرجی سندوق</span><div style="font-weight:800;color:#ef4444;">-' + fmt(shift.cashOut || 0) + '</div></div>',
          '  <div style="grid-column:1/-1;border-top:1px solid rgba(255,255,255,0.08);padding-top:8px;display:flex;justify-content:space-between;align-items:center;">',
          '    <span style="font-weight:700;color:#cbd5e1;">پارەی پێشبینیکراوی سیستەم:</span>',
          '    <strong style="font-size:1.25rem;color:#10b981;">' + fmt(expectedCash) + '</strong>',
          '  </div>',
          '</div>'
        ].join("");
      }

      resetDenominations();
      var closingCashEl = $("#closingCash");
      if (closingCashEl) closingCashEl.value = String(expectedCash);
      var closeNoteEl = $("#closeShiftNote");
      if (closeNoteEl) closeNoteEl.value = "";
      updateShiftDifferenceDisplay();

      // Check USB flash drive status for auto-backup
      var usbBadge = $("#closeShiftUsbStatusText");
      if (usbBadge) {
        usbBadge.innerHTML = '<i class="fas fa-spinner fa-spin"></i> پشکنینی فلاش...';
        var baseUrl = (typeof ApiClient !== "undefined" && ApiClient.getBaseUrl) ? ApiClient.getBaseUrl() : "http://localhost:3005";
        fetch(baseUrl + '/api/backup/usb-status')
          .then(function (r) { return r.json(); })
          .then(function (info) {
            if (info && info.hasUsb && info.removableTargets && info.removableTargets.length > 0) {
              var target = info.removableTargets[0];
              usbBadge.innerHTML = '<span style="color:#10b981;"><i class="fas fa-usb"></i> بەستراوەتەوە: <strong>' + target.drive + '</strong> (' + target.volumeName + ') ✅</span>';
            } else {
              usbBadge.innerHTML = '<span style="color:#38bdf8;"><i class="fas fa-hdd"></i> کۆپی لە فۆڵدەری باکئەپ پاشەکەوت دەکرێت</span>';
            }
          })
          .catch(function () {
            usbBadge.innerHTML = '<span style="color:#94a3b8;"><i class="fas fa-folder-open"></i> باکئەپی ناوخۆیی ئامادەیە</span>';
          });
      }

      showModal("closeShiftModal");
    });
  }

  function resetDenominations() {
    ["50k", "25k", "10k", "5k", "1k", "500", "250", "usd"].forEach(function (key) {
      var el = $("#denom_" + key);
      if (el) el.value = "0";
      var sub = $("#denom_sub_" + key);
      if (sub) sub.textContent = "0 د.ع";
    });
  }

  function updateDenominationTotals() {
    var d50 = (parseInt($("#denom_50k") ? $("#denom_50k").value : 0) || 0) * 50000;
    var d25 = (parseInt($("#denom_25k") ? $("#denom_25k").value : 0) || 0) * 25000;
    var d10 = (parseInt($("#denom_10k") ? $("#denom_10k").value : 0) || 0) * 10000;
    var d5 = (parseInt($("#denom_5k") ? $("#denom_5k").value : 0) || 0) * 5000;
    var d1 = (parseInt($("#denom_1k") ? $("#denom_1k").value : 0) || 0) * 1000;
    var d500 = (parseInt($("#denom_500") ? $("#denom_500").value : 0) || 0) * 500;
    var d250 = (parseInt($("#denom_250") ? $("#denom_250").value : 0) || 0) * 250;

    // USD converted (default 1500 IQD per 1 USD)
    var usdCount = parseInt($("#denom_usd") ? $("#denom_usd").value : 0) || 0;
    var usdRate = (DB.settings && DB.settings.usdRate) ? parseFloat(DB.settings.usdRate) : 1500;
    var dUsd = usdCount * usdRate;

    if ($("#denom_sub_50k")) $("#denom_sub_50k").textContent = fmt(d50);
    if ($("#denom_sub_25k")) $("#denom_sub_25k").textContent = fmt(d25);
    if ($("#denom_sub_10k")) $("#denom_sub_10k").textContent = fmt(d10);
    if ($("#denom_sub_5k")) $("#denom_sub_5k").textContent = fmt(d5);
    if ($("#denom_sub_1k")) $("#denom_sub_1k").textContent = fmt(d1);
    if ($("#denom_sub_500")) $("#denom_sub_500").textContent = fmt(d500);
    if ($("#denom_sub_250")) $("#denom_sub_250").textContent = fmt(d250);
    if ($("#denom_sub_usd")) $("#denom_sub_usd").textContent = fmt(dUsd);

    var totalCounted = d50 + d25 + d10 + d5 + d1 + d500 + d250 + dUsd;
    if (totalCounted > 0) {
      $("#closingCash").value = String(totalCounted);
    }
    updateShiftDifferenceDisplay();
  }

  function updateShiftDifferenceDisplay() {
    if (!CURRENT_SHIFT) return;
    var expected = Number(CURRENT_SHIFT.expectedCash || (CURRENT_SHIFT.openingCash + (CURRENT_SHIFT.cashSales || 0) + (CURRENT_SHIFT.cashIn || 0) - (CURRENT_SHIFT.cashOut || 0)));
    var closingCash = parseFloat($("#closingCash").value) || 0;
    var diff = closingCash - expected;

    var box = $("#shiftVarianceBox");
    var title = $("#varianceTitle");
    var sub = $("#varianceSubtitle");
    var amt = $("#varianceAmount");

    if (!box || !title || !sub || !amt) return;

    if (diff === 0) {
      box.className = "shift-variance-box match";
      title.textContent = "✅ سندوق تەواوە و بەڕێکە (Match)";
      sub.textContent = "هیچ کورتهێنان و زیادەیەک نییە، پارەی ژمێردراو ڕێکە لەگەڵ سیستەم.";
      amt.textContent = "0 د.ع";
      amt.style.color = "#10b981";
    } else if (diff < 0) {
      box.className = "shift-variance-box shortage";
      title.textContent = "⚠️ کورتهێنان لە سندوق (Cash Shortage)";
      sub.textContent = "پارەی ژمێردراو کەمترە لە پارەی پێویستی سیستەم! تکایە هۆکار لە تێبینی بنووسە.";
      amt.textContent = fmt(diff);
      amt.style.color = "#ef4444";
    } else {
      box.className = "shift-variance-box overage";
      title.textContent = "ℹ️ زیادە لە سندوق (Cash Overage)";
      sub.textContent = "پارەی ناو سندوق زیاترە لە فرۆشتنی تۆمارکراوی سیستەم.";
      amt.textContent = "+" + fmt(diff);
      amt.style.color = "#3b82f6";
    }
  }

  function confirmCloseShift() {
    if (!CURRENT_SHIFT) return;
    var closingCash = parseFloat($("#closingCash").value) || 0;
    var note = ($("#closeShiftNote").value || "").trim();

    var denominations = {
      d50k: parseInt($("#denom_50k") ? $("#denom_50k").value : 0) || 0,
      d25k: parseInt($("#denom_25k") ? $("#denom_25k").value : 0) || 0,
      d10k: parseInt($("#denom_10k") ? $("#denom_10k").value : 0) || 0,
      d5k: parseInt($("#denom_5k") ? $("#denom_5k").value : 0) || 0,
      d1k: parseInt($("#denom_1k") ? $("#denom_1k").value : 0) || 0,
      d500: parseInt($("#denom_500") ? $("#denom_500").value : 0) || 0,
      d250: parseInt($("#denom_250") ? $("#denom_250").value : 0) || 0,
      usd: parseInt($("#denom_usd") ? $("#denom_usd").value : 0) || 0
    };

    fetch(getShiftApiBase() + "/api/shifts/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closingCash: closingCash,
        denominations: denominations,
        note: note
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.error) {
          toast("هەڵە", res.error, "error");
          return;
        }
        hideModal("closeShiftModal");
        CURRENT_SHIFT = null;
        updateUI();

        var diffMsg = res.difference === 0 ? "سندوق ڕێکە (0)" : (res.difference > 0 ? "زیادە: +" + fmt(res.difference) : "کورتهێنان: " + fmt(res.difference));
        toast("سەرکەوتوو", "شێفت داخرا بە سەرکەوتوویی (" + diffMsg + ")", res.difference === 0 ? "success" : "warning");
        if (typeof PosAudio !== "undefined") PosAudio.playCashSuccess();

        // ─── USB AUTO-BACKUP CONFIRMATION ───
        if (res.backup) {
          if (res.backup.usbSavedCount > 0) {
            var drives = res.backup.usbBackups.filter(function (u) { return u.saved; }).map(function (u) { return u.drive; }).join(', ');
            setTimeout(function () {
              toast("💾 باکئەپی خودکار (USB)", "کۆپی داتابەیس بە سەرکەوتوویی خرایە ناو فلاش میمۆری (" + drives + ") و فۆڵدەری باکئەپ ✅", "success");
            }, 600);
          } else if (res.backup.localBackup && res.backup.localBackup.saved) {
            setTimeout(function () {
              toast("💾 باکئەپی خودکار", "کۆپی داتابەیس لە فۆڵدەری باکئەپی سیستەم پاشەکەوت کرا (فلاش نەبەستراوە)", "info");
            }, 600);
          }
        }

        // Print official 80mm Z-Report
        printZReportReceipt(res);
      })
      .catch(function (err) {
        toast("ئاگاداری", "شێفت بە ئۆفلاین داخرا", "warning");
        hideModal("closeShiftModal");
        CURRENT_SHIFT = null;
        updateUI();
      });
  }

  /* ─── MASTER 24-HOUR DAILY Z-REPORT ─── */
  function openDailyZReportModal(dateStr) {
    var today = dateStr || new Date().toISOString().slice(0, 10);
    var dateInput = $("#dailyReportDateInput");
    if (dateInput) dateInput.value = today;

    loadDailyReportForDate(today);
  }

  function loadDailyReportForDate(dateParam) {
    var targetDate;
    if (dateParam === "today") {
      targetDate = new Date().toISOString().slice(0, 10);
    } else if (dateParam === "yesterday") {
      var y = new Date();
      y.setDate(y.getDate() - 1);
      targetDate = y.toISOString().slice(0, 10);
    } else {
      targetDate = dateParam || new Date().toISOString().slice(0, 10);
    }

    var dateInput = $("#dailyReportDateInput");
    if (dateInput) dateInput.value = targetDate;

    fetch(getShiftApiBase() + "/api/shifts/daily-z-report?date=" + encodeURIComponent(targetDate))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        CACHED_DAILY_REPORT = data;
        renderDailyReportModalContent(data);
        showModal("dailyZReportModal");
      })
      .catch(function () {
        // Offline fallback - compute directly from DB state
        var offlineData = buildOfflineDailyReport(targetDate);
        CACHED_DAILY_REPORT = offlineData;
        renderDailyReportModalContent(offlineData);
        showModal("dailyZReportModal");
        toast("ڕاپۆرتی ناوخۆیی", "ڕاپۆرتی ڕۆژانە بە سەرکەوتوویی لە داتابەیسی لۆکاڵ حیساب کرا", "info");
      });
  }

  function buildOfflineDailyReport(targetDate) {
    var allOrders = (typeof DB !== "undefined" && DB.orders) ? DB.orders : [];
    var allShifts = (typeof DB !== "undefined" && DB.shifts) ? DB.shifts : [];
    var allMovements = (typeof DB !== "undefined" && DB.cashMovements) ? DB.cashMovements : [];

    var orders = allOrders.filter(function (o) {
      return (o.date || o.orderDate || "").slice(0, 10) === targetDate;
    });

    var shifts = allShifts.filter(function (s) {
      var op = (s.openedAt || s.startTime || "").slice(0, 10);
      var cl = (s.closedAt || s.endTime || "").slice(0, 10);
      return op === targetDate || cl === targetDate;
    });

    var movements = allMovements.filter(function (m) {
      return (m.timestamp || m.date || "").slice(0, 10) === targetDate;
    });

    var totalOrders = orders.length;
    var totalSales = orders.reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0);
    var iqdCashSales = orders.filter(function (o) { return o.paymentMethod === 'cash' && o.paidCurrency !== 'USD'; }).reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0);
    var usdOrders = orders.filter(function (o) { return o.paymentMethod === 'usd_cash' || o.paidCurrency === 'USD'; });
    var usdSalesIqd = usdOrders.reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0);
    var totalUsdReceived = usdOrders.reduce(function (s, o) { return s + (Number(o.usdReceived) || 0); }, 0);
    var cashSales = iqdCashSales + usdSalesIqd;
    var cardSales = orders.filter(function (o) { return o.paymentMethod === 'card'; }).reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0);
    var debtSales = orders.filter(function (o) { return o.paymentMethod === 'debt'; }).reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0);
    var totalProfit = orders.reduce(function (s, o) { return s + (Number(o.profit) || 0); }, 0);
    var totalDiscount = orders.reduce(function (s, o) { return s + (Number(o.discount) || 0); }, 0);

    var totalCashIn = movements.filter(function (m) { return m.type === 'in'; }).reduce(function (s, m) { return s + (Number(m.amount) || 0); }, 0);
    var totalCashOut = movements.filter(function (m) { return m.type === 'out'; }).reduce(function (s, m) { return s + (Number(m.amount) || 0); }, 0);

    var cashierMap = {};
    orders.forEach(function (o) {
      var c = o.cashier || 'نادیار';
      if (!cashierMap[c]) {
        cashierMap[c] = { cashier: c, ordersCount: 0, totalSales: 0, cashSales: 0, cardSales: 0, debtSales: 0, profit: 0, shiftsCount: 0, difference: 0 };
      }
      cashierMap[c].ordersCount++;
      cashierMap[c].totalSales += (Number(o.total) || 0);
      if (o.paymentMethod === 'cash' || o.paymentMethod === 'usd_cash') cashierMap[c].cashSales += (Number(o.total) || 0);
      else if (o.paymentMethod === 'card') cashierMap[c].cardSales += (Number(o.total) || 0);
      else if (o.paymentMethod === 'debt') cashierMap[c].debtSales += (Number(o.total) || 0);
      cashierMap[c].profit += (Number(o.profit) || 0);
    });

    shifts.forEach(function (s) {
      var c = s.cashier || 'نادیار';
      if (!cashierMap[c]) {
        cashierMap[c] = { cashier: c, ordersCount: 0, totalSales: 0, cashSales: 0, cardSales: 0, debtSales: 0, profit: 0, shiftsCount: 0, difference: 0 };
      }
      cashierMap[c].shiftsCount++;
      cashierMap[c].difference += (Number(s.difference) || 0);
    });

    var cashiersBreakdown = Object.values(cashierMap);
    var totalDifference = shifts.reduce(function (s, sh) { return s + (Number(sh.difference) || 0); }, 0);
    var netCashForOwner = cashSales + totalCashIn - totalCashOut;

    var waLines = [
      "📊 *ڕاپۆرتی گشتی ٢٤ کاتژمێری (Master Daily Z-Report)*",
      "🏢 *" + storeBrand() + " - هەولێر*",
      "📅 بەروار: *" + targetDate + "*",
      "⏰ کاتی دەرکردن: " + t12(new Date()),
      "═════════════════════",
      "💰 *کۆی فرۆشتنی ٢٤ کاتژمێر:*",
      "💵 فرۆشتنی گشتی: *" + totalSales.toLocaleString() + " د.ع*",
      "  ├ 💵 نەقد بە دینار: " + iqdCashSales.toLocaleString() + " د.ع",
      "  ├ 💵 نەقد بە دۆلار: $" + totalUsdReceived.toLocaleString() + " (" + usdSalesIqd.toLocaleString() + " د.ع)",
      "  ├ 💳 کارت/فست پەی: " + cardSales.toLocaleString() + " د.ع",
      "  └ 📝 قەرز: " + debtSales.toLocaleString() + " د.ع",
      "📈 قازانجی ڕاستەقینە: *" + totalProfit.toLocaleString() + " د.ع*",
      "🧾 ژمارەی کڕیار/پسوڵە: *" + totalOrders + " پسوڵە*",
      "─────────────────────",
      "📥 پارەدانە ژوورەوە (+): " + totalCashIn.toLocaleString() + " د.ع",
      "📤 خەرجی سندوق (-): " + totalCashOut.toLocaleString() + " د.ع",
      "🎯 *کاشی تەسلیمکراو بە خاوەن مارکێت:*",
      "👉 *" + netCashForOwner.toLocaleString() + " د.ع*",
      "─────────────────────",
      "👥 *بەشداربووانی شێفت (کاشیرەکان):*"
    ];

    cashiersBreakdown.forEach(function (c) {
      var diffText = c.difference === 0 ? "ڕێک (0)" : (c.difference > 0 ? ("+" + c.difference.toLocaleString() + " زیادە") : (c.difference.toLocaleString() + " کورتهێنان"));
      waLines.push("• 🧑‍💼 *" + c.cashier + "*: " + c.totalSales.toLocaleString() + " د.ع (" + c.ordersCount + " پسوڵە) | " + diffText);
    });

    waLines.push("═════════════════════");
    waLines.push("سیستەمی " + storeBrand() + " POS 🛒");

    return {
      success: true,
      date: targetDate,
      generatedAt: new Date().toISOString(),
      shifts: shifts,
      ordersSummary: {
        totalOrders: totalOrders,
        totalSales: totalSales,
        cashSales: cashSales,
        iqdCashSales: iqdCashSales,
        usdSalesIqd: usdSalesIqd,
        totalUsdReceived: totalUsdReceived,
        cardSales: cardSales,
        debtSales: debtSales,
        totalProfit: totalProfit,
        totalDiscount: totalDiscount
      },
      cashSummary: {
        totalCashIn: totalCashIn,
        totalCashOut: totalCashOut,
        totalDifference: totalDifference,
        netCashForOwner: netCashForOwner
      },
      cashiersBreakdown: cashiersBreakdown,
      movements: movements,
      whatsappText: waLines.join("\n")
    };
  }

  function renderDailyReportModalContent(d) {
    var container = $("#dailyReportContent");
    var waPreview = $("#dailyReportWaPreview");
    var timeEl = $("#dailyReportGenTime");
    if (!container) return;

    if (timeEl) timeEl.textContent = "کاتی دەرکردن: " + t12(new Date(), true);
    if (waPreview) waPreview.textContent = d.whatsappText || "";

    var o = d.ordersSummary;
    var c = d.cashSummary;

    var html = [
      '<div class="daily-report-kpi-grid">',
      '  <div class="daily-kpi-card owner-net">',
      '    <div class="kpi-label"><i class="fas fa-hand-holding-usd"></i> کاشی پوختە بۆ خاوەن مارکێت</div>',
      '    <div class="kpi-num">' + fmt(c.netCashForOwner) + '</div>',
      '  </div>',
      '  <div class="daily-kpi-card">',
      '    <div class="kpi-label"><i class="fas fa-shopping-cart"></i> کۆی فرۆشتنی ٢٤ کاتژمێر</div>',
      '    <div class="kpi-num" style="color:#60a5fa;">' + fmt(o.totalSales) + '</div>',
      '  </div>',
      '  <div class="daily-kpi-card">',
      '    <div class="kpi-label"><i class="fas fa-chart-line"></i> کۆی قازانجی بازرگانی</div>',
      '    <div class="kpi-num" style="color:#10b981;">' + fmt(o.totalProfit) + '</div>',
      '  </div>',
      '  <div class="daily-kpi-card">',
      '    <div class="kpi-label"><i class="fas fa-users"></i> کۆی کڕیار / پسوڵەکان</div>',
      '    <div class="kpi-num">' + o.totalOrders + ' پسوڵە</div>',
      '  </div>',
      '</div>',

      '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;margin-bottom:16px;">',
      '  <h4 style="margin:0 0 10px 0;font-size:0.95rem;color:#cbd5e1;"><i class="fas fa-coins"></i> دابەشبوونی جۆری پارەدان لەم ڕۆژەدا:</h4>',
      '  <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:0.9rem;">',
      '    <div>💵 نەقد: <strong>' + fmt(o.cashSales) + '</strong></div>',
      '    <div>💳 کارت/دیجیتاڵ: <strong>' + fmt(o.cardSales) + '</strong></div>',
      '    <div>📝 قەرز: <strong>' + fmt(o.debtSales) + '</strong></div>',
      '    <div>📥 پارەی هاتوو (+): <strong style="color:#10b981;">+' + fmt(c.totalCashIn) + '</strong></div>',
      '    <div>📤 خەرجی سندوق (-): <strong style="color:#ef4444;">-' + fmt(c.totalCashOut) + '</strong></div>',
      '  </div>',
      '</div>',

      '<h4 style="margin:16px 0 10px 0;font-size:1rem;color:#f8fafc;"><i class="fas fa-user-friends"></i> بەراوردی شێفت و ئەدای کاشیرەکان (Cashier Breakdown):</h4>'
    ];

    if (d.cashiersBreakdown && d.cashiersBreakdown.length > 0) {
      d.cashiersBreakdown.forEach(function (cb) {
        var diffBadge = cb.difference === 0 ? '<span class="badge badge-success">سندوق ڕێکە</span>' : (cb.difference > 0 ? '<span class="badge badge-info">+' + fmt(cb.difference) + ' زیادە</span>' : '<span class="badge badge-danger">' + fmt(cb.difference) + ' کورتهێنان</span>');
        html.push([
          '<div class="cashier-summary-card">',
          '  <div class="cashier-info-block">',
          '    <div class="cashier-avatar-badge">' + (cb.cashier.charAt(0)) + '</div>',
          '    <div>',
          '      <div style="font-weight:800;font-size:1rem;color:#f1f5f9;">' + cb.cashier + '</div>',
          '      <div style="font-size:0.78rem;color:#94a3b8;">' + (cb.ordersCount || 0) + ' کڕیاری بەڕێکردووە | ' + (cb.shiftsCount || 1) + ' شێفت</div>',
          '    </div>',
          '  </div>',
          '  <div style="display:flex;align-items:center;gap:14px;">',
          '    <div style="text-align:left;">',
          '      <div style="font-weight:800;color:#60a5fa;font-size:1.1rem;">' + fmt(cb.totalSales) + '</div>',
          '      <div style="font-size:0.75rem;color:#94a3b8;">فرۆشتنی گشتی</div>',
          '    </div>',
          '    <div>' + diffBadge + '</div>',
          '  </div>',
          '</div>'
        ].join(""));
      });
    } else {
      html.push('<div style="text-align:center;padding:16px;color:#94a3b8;">هیچ فرۆشتنێک تۆمار نەکراوە لەم بەروارەدا</div>');
    }

    container.innerHTML = html.join("");
  }

  function shareDailyReportWhatsApp() {
    if (!CACHED_DAILY_REPORT) return;
    var text = CACHED_DAILY_REPORT.whatsappText || "";
    var phone = (typeof DB !== "undefined" && DB.settings && (DB.settings.ownerPhone || DB.settings.marketPhone)) || "";
    var cleanPhone = String(phone).replace(/\D/g, "");
    if (cleanPhone.startsWith("07")) cleanPhone = "964" + cleanPhone.slice(1);
    var url = cleanPhone ? ("https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(text)) : ("https://wa.me/?text=" + encodeURIComponent(text));
    window.open(url, "_blank");
  }

  function copyDailyReportText() {
    if (!CACHED_DAILY_REPORT) return;
    var text = CACHED_DAILY_REPORT.whatsappText || "";
    navigator.clipboard.writeText(text).then(function () {
      toast("سەرکەوتوو", "دەقی ڕاپۆرتی ڕۆژانە کۆپیکرا بۆ تێلیگرام / واتسئاپ", "success");
    });
  }

  function printDailyMasterZReport() {
    if (!CACHED_DAILY_REPORT) return;
    var d = CACHED_DAILY_REPORT;
    var o = d.ordersSummary;
    var c = d.cashSummary;

    var html = [
      '<div style="font-family: Tahoma, Arial, sans-serif; width: 100%; margin: 0 auto; direction: rtl; text-align: right; font-size: 22px; line-height: 1.4; color: #000;">',
      '  <div style="text-align: center; margin-bottom: 4px;">',
      '    <div style="font-size: 32px; font-weight: 900;">' + storeBrand() + '</div>',
      '    <div style="font-size: 24px; font-weight: 800;">*** ڕاپۆرتی گشتی ٢٤ کاتژمێری ***</div>',
      '    <div style="font-size: 20px;">MASTER DAILY Z-REPORT</div>',
      '    <div style="font-size: 20px; margin-top:2px;">بەروار: ' + d.date + '</div>',
      '  </div>',
      '  <div style="border-top: 2px solid #000; margin: 6px 0;"></div>',
      '  <div style="display:flex; justify-content:space-between; font-weight:bold;"><span>کۆی فرۆشتنی ٢٤ کاتژمێر:</span><span>' + fmt(o.totalSales) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>├ فرۆشتنی نەقد:</span><span>' + fmt(o.cashSales) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>├ فرۆشتنی کارت:</span><span>' + fmt(o.cardSales) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>└ فرۆشتنی قەرز:</span><span>' + fmt(o.debtSales) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>کۆی قازانجی ڕۆژ:</span><strong>' + fmt(o.totalProfit) + '</strong></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>ژمارەی پسوڵەکان:</span><span>' + o.totalOrders + ' پسوڵە</span></div>',
      '  <div style="border-top: 1px dashed #000; margin: 6px 0;"></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>پارەی هاتوو (+):</span><span>+' + fmt(c.totalCashIn) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>خەرجی سندوق (-):</span><span>-' + fmt(c.totalCashOut) + '</span></div>',
      '  <div style="border-top: 2px solid #000; margin: 6px 0;"></div>',
      '  <div style="text-align:center; font-size:22px; font-weight:bold;">کاشی تەسلیمکراو بە خاوەن مارکێت:</div>',
      '  <div style="text-align:center; font-size:36px; font-weight:900; margin:6px 0;">' + fmt(c.netCashForOwner) + '</div>',
      '  <div style="border-top: 2px solid #000; margin: 6px 0;"></div>',
      '  <div style="font-weight:bold; margin:6px 0 4px 0;">کاشیرە بەشداربووەکان:</div>'
    ];

    if (d.cashiersBreakdown) {
      d.cashiersBreakdown.forEach(function (cb) {
        var diff = cb.difference === 0 ? "ڕێک (0)" : (cb.difference > 0 ? "+" + fmt(cb.difference) : fmt(cb.difference));
        html.push('  <div style="display:flex; justify-content:space-between; margin:2px 0;"><span>🧑‍💼 ' + cb.cashier + ' (' + cb.ordersCount + ' کڕیار):</span><strong>' + fmt(cb.totalSales) + '</strong></div>');
        html.push('  <div style="font-size:20px; color:#111; text-align:left; margin-bottom:4px;">جیاوازی سندوق: ' + diff + '</div>');
      });
    }

    html.push([
      '  <div style="border-top: 1px dashed #000; margin: 10px 0;"></div>',
      '  <div style="display:flex; justify-content:space-between; margin-top:16px;">',
      '    <div style="text-align:center;">واژۆی بەڕێوەبەر<br><br>_____________</div>',
      '    <div style="text-align:center;">تەسلیمکەر (سەرپەرشتیار)<br><br>_____________</div>',
      '  </div>',
      '  <div style="text-align:center; font-size:18px; margin-top:14px; color:#111;">',
      '    ئەرشیفی فەرمی ' + storeBrand() + ' - 24 کاتژمێر<br>',
      '    چاپکرا بە چاپکەری Xprinter 80mm',
      '  </div>',
      '</div>'
    ].join(""));

    print80mmReceiptHtml(html.join(""));
  }

  /* ─── OFFICIAL 80mm Z-REPORT PRINT (FOR SHIFT CLOSING) ─── */
  function printZReportReceipt(shift) {
    var now = new Date();
    var openTimeStr = t12(shift.openedAt);
    var closeTimeStr = t12(shift.closedAt || now);

    var diffText = shift.difference === 0 ? "سندوق تەواوە و بەڕێکە (0 د.ع)" : (shift.difference > 0 ? "زیادە هەیە: +" + fmt(shift.difference) : "⚠️ کورتهێنان هەیە: " + fmt(shift.difference));

    var html = [
      '<div style="font-family: Tahoma, Arial, sans-serif; width: 100%; margin: 0 auto; direction: rtl; text-align: right; font-size: 22px; line-height: 1.4; color: #000;">',
      '  <div style="text-align: center; margin-bottom: 4px;">',
      '    <div style="font-size: 32px; font-weight: 900;">' + storeBrand() + '</div>',
      '    <div style="font-size: 24px; font-weight: 800;">*** ڕاپۆرتی داخستنی شێفت (Z-REPORT) ***</div>',
      '    <div style="font-size: 20px;">پسوڵەی فەرمی سندوق - داخراو</div>',
      '  </div>',
      '  <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>ژمارەی شێفت:</span><strong>#' + (shift.id || "").slice(-6) + '</strong></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>کاشیر:</span><strong>' + shift.cashier + '</strong></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>دەستپێکردن:</span><span>' + openTimeStr + '</span></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>داخستن:</span><span>' + closeTimeStr + '</span></div>',
      '  <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>سەرمایەی سەرەتایی:</span><span>' + fmt(shift.openingCash) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>فرۆشتنی نەقد:</span><span>+' + fmt(shift.cashSales || 0) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>فرۆشتنی کارت:</span><span>' + fmt(shift.cardSales || 0) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>فرۆشتنی قەرز:</span><span>' + fmt(shift.debtSales || 0) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between; font-weight:bold;"><span>کۆی گشتی فرۆشتن:</span><span>' + fmt(shift.totalSales || 0) + '</span></div>',
      '  <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>پارەی هاتوو (+):</span><span>+' + fmt(shift.cashIn || 0) + '</span></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>خەرجی دەستبەجێ (-):</span><span>-' + fmt(shift.cashOut || 0) + '</span></div>',
      '  <div style="border-top: 2px solid #000; margin: 6px 0;"></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>پارەی چاوەڕوانکراو:</span><strong>' + fmt(shift.expectedCash) + '</strong></div>',
      '  <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:26px;"><span>پارەی ئەژمارکراو:</span><strong>' + fmt(shift.closingCash) + '</strong></div>',
      '  <div style="border-top: 1px dashed #000; margin: 3px 0;"></div>',
      '  <div style="text-align:center; font-weight:900; font-size:26px; margin:4px 0;">' + diffText + '</div>',
      '  <div style="border-top: 2px solid #000; margin: 6px 0;"></div>'
    ];

    if (shift.note) {
      html.push('  <div style="margin:4px 0;"><strong>تێبینی:</strong> ' + shift.note + '</div>');
    }

    if (shift.backup) {
      var bkLabel = (shift.backup.usbSavedCount > 0)
        ? ('فلاش میمۆری (' + shift.backup.usbBackups[0].drive + ') و فۆڵدەر')
        : 'فۆڵدەری باکئەپی ناوخۆ';
      html.push('  <div style="display:flex; justify-content:space-between; font-size:20px; margin:4px 0; color:#333;"><span>کۆپی یەدەگ (Backup):</span><strong>' + bkLabel + ' ✅</strong></div>');
    }

    html.push([
      '  <div style="display:flex; justify-content:space-between; margin-top:20px;">',
      '    <div style="text-align:center;">واژۆی کاشیر<br><br>_____________</div>',
      '    <div style="text-align:center;">واژۆی بەڕێوەبەر<br><br>_____________</div>',
      '  </div>',
      '  <div style="text-align:center; font-size:18px; margin-top:14px; color:#111;">',
      '    شێفت بە فەرمی داخرا و کۆتایی هات.<br>',
      '    چاپکرا بە چاپکەری Xprinter 80mm',
      '  </div>',
      '</div>'
    ].join(""));

    print80mmReceiptHtml(html.join(""));
  }

  /* ─── MINI 80mm CASH MOVEMENT VOUCHER ─── */
  function printCashMovementReceipt(mov) {
    var isOut = mov.type === "out";
    var title = isOut ? "پسوڵەی دەرچوونی پارە (خەرجی سندوق)" : "پسوڵەی هاتنی پارە (وردە پارە)";
    var dateStr = t12(mov.timestamp || Date.now());

    var html = [
      '<div style="font-family: Tahoma, Arial, sans-serif; width: 100%; margin: 0 auto; direction: rtl; text-align: right; font-size: 22px; line-height: 1.4; color: #000;">',
      '  <div style="text-align: center; margin-bottom: 4px;">',
      '    <div style="font-size: 32px; font-weight: 900;">' + storeBrand() + '</div>',
      '    <div style="font-size: 24px; font-weight: 800;">' + title + '</div>',
      '    <div style="font-size: 20px;">ژمارە: #' + (mov.id || "").slice(-6) + ' | ' + dateStr + '</div>',
      '  </div>',
      '  <div style="border-top: 1px dashed #000; margin: 4px 0;"></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>کاشیر:</span><strong>' + (mov.cashier || "کاشیر") + '</strong></div>',
      '  <div style="display:flex; justify-content:space-between;"><span>هۆکار:</span><strong>' + (mov.reason || "-") + '</strong></div>',
      '  <div style="border-top: 2px solid #000; margin: 6px 0;"></div>',
      '  <div style="text-align:center; font-size:22px; font-weight:bold;">بڕی پارەی جوڵێنراو:</div>',
      '  <div style="text-align:center; font-size:36px; font-weight:900; margin:6px 0;">' + fmt(mov.amount) + '</div>',
      '  <div style="border-top: 2px solid #000; margin: 6px 0;"></div>',
      '  <div style="display:flex; justify-content:space-between; margin-top:16px;">',
      '    <div style="text-align:center;">واژۆی کاشیر<br><br>_________</div>',
      '    <div style="text-align:center;">وەرگر / بەڕێوەبەر<br><br>_________</div>',
      '  </div>',
      '  <div style="text-align:center; font-size:18px; margin-top:10px; color:#111;">',
      '    تکایە ئەم پسوڵەیە لە ناو سندوق بپارێزە بۆ ئەرشیف.',
      '  </div>',
      '</div>'
    ].join("");

    print80mmReceiptHtml(html);
  }

  /* ─── 80mm THERMAL PRINT ENGINE (XPRINTER OPTIMIZED) ─── */
  function print80mmReceiptHtml(htmlContent) {
    var fullDoc = [
      '<!DOCTYPE html>',
      '<html lang="ku" dir="rtl">',
      '<head>',
      '<meta charset="UTF-8">',
      '<title>چاپکردنی پسوڵە - ' + storeBrand() + '</title>',
      '<style>',
      '@page { size: 80mm auto; margin: 0; }',
      'html, body { margin: 0; padding: 2.5mm 3mm; background: #fff; color: #000; font-family: Tahoma, Arial, sans-serif; font-size: 15px; line-height: 1.38; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
      'body * { max-width: 100%; box-sizing: border-box; }',
      '</style>',
      '</head>',
      '<body>',
      htmlContent,
      '</body>',
      '</html>'
    ].join("");

    if (typeof ImmediatePrinter !== "undefined") {
      ImmediatePrinter.print(fullDoc, { pageSize: '80mm' });
    } else {
      try { window.print(); } catch (e) {}
    }
  }

  /* ─── TABLES RENDERING ─── */
  function renderShiftsTable() {
    fetch(getShiftApiBase() + "/api/shifts?limit=50")
      .then(function (r) { return r.json(); })
      .then(function (shifts) {
        renderShiftsTableData(shifts);
      })
      .catch(function () {
        renderShiftsTableData(DB.shifts || []);
      });
  }

  function renderShiftsTableData(shifts) {
    var tbody = $("#shiftsTable tbody");
    if (!tbody) return;

    if (!shifts || shifts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);">هیچ تۆمارێکی شێفت نییە</td></tr>';
      return;
    }

    tbody.innerHTML = shifts.map(function (s) {
      var isOpen = s.status === "open" || !s.closedAt;
      var statusBadge = isOpen ? '<span class="badge badge-success">کراوە</span>' : '<span class="badge badge-info">داخراو</span>';
      var openTime = t12(s.openedAt);
      var openDate = new Date(s.openedAt).toISOString().slice(0, 10);

      var diffBadge = "—";
      if (!isOpen && s.difference !== null && typeof s.difference !== "undefined") {
        var d = Number(s.difference);
        diffBadge = d === 0 ? '<span style="color:#10b981;font-weight:700;">ڕێک</span>' : (d > 0 ? '<span style="color:#60a5fa;font-weight:700;">+' + fmt(d) + '</span>' : '<span style="color:#ef4444;font-weight:700;">' + fmt(d) + '</span>');
      }

      var actionBtns = isOpen
        ? '<button class="btn btn-sm btn-warning" onclick="ShiftsManager.openCloseShiftModal()"><i class="fas fa-stop"></i> داخستن</button>'
        : '<button class="btn btn-sm btn-outline" onclick="ShiftsManager.printPastShiftZReport(\'' + s.id + '\')"><i class="fas fa-print"></i> چاپ</button>';

      return [
        '<tr>',
        '  <td><strong>' + (s.cashier || "کاشیر") + '</strong><div style="font-size:0.75rem;color:var(--text-muted);">' + getShiftTypeIcon(s.shiftType) + '</div></td>',
        '  <td>' + openDate + '<br>' + openTime + '</td>',
        '  <td><strong>' + fmt(s.totalSales || 0) + '</strong></td>',
        '  <td>' + diffBadge + '</td>',
        '  <td>' + statusBadge + '</td>',
        '  <td>' + actionBtns + '</td>',
        '</tr>'
      ].join("");
    }).join("");
  }

  function renderCashMovementsTable() {
    fetch(getShiftApiBase() + "/api/shifts/movements?limit=100")
      .then(function (r) { return r.json(); })
      .then(function (list) {
        renderCashMovementsTableData(list);
      })
      .catch(function () {
        renderCashMovementsTableData([]);
      });
  }

  function renderCashMovementsTableData(list) {
    var tbody = $("#cashMovementsTable tbody");
    if (!tbody) return;

    if (!list || list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-muted);">هیچ پارەیەک نەخراوەتە سندوق و نەهێنراوەتە دەرەوە</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(function (m, idx) {
      var isOut = m.type === "out";
      var typeBadge = isOut ? '<span class="badge badge-danger">دەرچوو</span>' : '<span class="badge badge-success">هاتە ژوورەوە</span>';
      var timeStr = t12(m.timestamp);
      var printBtn = '<button class="btn btn-sm btn-outline" onclick="ShiftsManager.printCashMovementReceipt(' + JSON.stringify(m).replace(/"/g, '&quot;') + ')" title="چاپ"><i class="fas fa-print"></i></button>';

      return [
        '<tr>',
        '  <td>' + (idx + 1) + '</td>',
        '  <td>' + typeBadge + '</td>',
        '  <td><strong style="color:' + (isOut ? '#ef4444' : '#10b981') + ';">' + (isOut ? '-' : '+') + fmt(m.amount) + '</strong></td>',
        '  <td>' + (m.reason || "—") + '</td>',
        '  <td>' + (m.cashier || "—") + '</td>',
        '  <td>' + timeStr + ' ' + printBtn + '</td>',
        '</tr>'
      ].join("");
    }).join("");
  }

  function renderDailyReportsArchive() {
    var container = $("#dailyReportsArchiveList");
    if (!container) return;

    // Create 7 previous days quick list
    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }

    var html = [
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">'
    ];

    days.forEach(function (dateStr, i) {
      var label = i === 0 ? "ئەمڕۆ (" + dateStr + ")" : (i === 1 ? "دوێنێ (" + dateStr + ")" : dateStr);
      html.push([
        '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center;">',
        '  <div>',
        '    <div style="font-weight:800;font-size:1.05rem;color:#f8fafc;">' + label + '</div>',
        '    <div style="font-size:0.8rem;color:#94a3b8;margin-top:2px;">کۆی فرۆشتن و سندوقی ئەو ڕۆژە</div>',
        '  </div>',
        '  <button class="btn btn-sm btn-primary" onclick="ShiftsManager.openDailyZReportModal(\'' + dateStr + '\')">',
        '    <i class="fas fa-eye"></i> بینین و ناردن',
        '  </button>',
        '</div>'
      ].join(""));
    });

    html.push('</div>');
    container.innerHTML = html.join("");
  }

  function printPastShiftZReport(shiftId) {
    fetch(getShiftApiBase() + "/api/shifts/" + encodeURIComponent(shiftId) + "/z-report")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.shift) {
          printZReportReceipt(data.shift);
        }
      })
      .catch(function () {
        toast("هەڵە", "نەتوانرا زانیاری شێفت بهێنرێت بۆ چاپ", "error");
      });
  }

  /* ═══════════════════════════════════════════════════════════════
     COMMERCIAL 5-COLUMN CASH HANDOVER ENGINE (Matching User Photo)
     ═══════════════════════════════════════════════════════════════ */

  function fmtCommercial(num) {
    if (num === null || num === undefined || isNaN(num)) return "0";
    var sign = num < 0 ? "-" : "";
    var abs = Math.abs(Math.round(num));
    var str = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return sign + str;
  }

  function applyHandoverLiveData(data, activeCashier) {
    if (!data) { recalcHandover(); return; }
    var expEl = $("#hoInputExpenses"); if (expEl) expEl.value = data.expenses || 0;
    var givEl = $("#hoInputGivenSafe"); if (givEl) givEl.value = data.givenToSafe || 0;
    var refEl = $("#hoInputRefunds"); if (refEl) refEl.value = data.totalRefunds || 0;
    var recEl = $("#hoInputReceived"); if (recEl) recEl.value = data.received || 0;
    var takEl = $("#hoInputTakenSafe"); if (takEl) takEl.value = data.takenFromSafe || 0;
    var salEl = $("#hoInputSales"); if (salEl) salEl.value = data.reportsCashSales || 0;
    var dateEl = $("#hoFooterDate"); if (dateEl) dateEl.textContent = data.date || new Date().toISOString().split("T")[0];

    var cashierName = activeCashier || data.cashier || "کاشیر";
    var cashEl = $("#hoFooterCashierName"); if (cashEl) cashEl.textContent = String(cashierName).toUpperCase();
    var agrCash = $("#agrCashierName"); if (agrCash) agrCash.textContent = String(cashierName).toUpperCase();
    var agrTime = $("#agrCurrentTime"); if (agrTime) agrTime.textContent = t12dt(new Date(), true);
    recalcHandover();
  }

  function fillHandoverFromLocal(activeCashier) {
    var now = new Date();
    var isoDate = now.toISOString().slice(0, 10);
    var formattedDate = String(now.getDate()).padStart(2, "0") + "." + String(now.getMonth() + 1).padStart(2, "0") + "." + now.getFullYear();
    var sales = 0, refunds = 0, expenses = 0, givenSafe = 0, received = 0, takenSafe = 0;
    var cashierLow = activeCashier ? String(activeCashier).toLowerCase() : "";

    function sameDay(d) { return String(d || "").slice(0, 10) === isoDate; }
    function sameCashier(name) {
      if (!cashierLow) return true;
      return String(name || "").toLowerCase().indexOf(cashierLow) !== -1;
    }

    var orders = (typeof DB !== "undefined" && DB.orders) ? DB.orders : [];
    orders.forEach(function (o) {
      if (!sameDay(o.date || o.orderDate)) return;
      if (!sameCashier(o.cashier)) return;
      var method = String(o.paymentMethod || o.payType || "cash").toLowerCase();
      if (method === "cash" || method === "cash_usd" || method === "") {
        sales += parseFloat(o.total) || 0;
      }
    });

    var rets = (typeof RETURN_SALES !== "undefined" && RETURN_SALES) ? RETURN_SALES : [];
    rets.forEach(function (r) {
      if (!sameDay(r.date)) return;
      if (!sameCashier(r.cashier)) return;
      refunds += parseFloat(r.refundAmount || r.totalRefund) || 0;
    });

    var exps = (typeof DB !== "undefined" && DB.expenses) ? DB.expenses : [];
    exps.forEach(function (e) {
      if (!sameDay(e.date)) return;
      var amt = parseFloat(e.amount) || 0;
      var desc = String(e.description || e.reason || e.category || "");
      if (/قاسە|safe drop|تەسلیمکردن بە خاوەن/i.test(desc)) givenSafe += amt;
      else expenses += amt;
    });

    var movs = (typeof DB !== "undefined" && DB.cashMovements) ? DB.cashMovements : [];
    movs.forEach(function (m) {
      if (!sameDay(m.date || m.createdAt)) return;
      var amt = parseFloat(m.amount) || 0;
      var reason = String(m.reason || "");
      if (m.type === "out") {
        if (/قاسە|Safe Drop|تەسلیمکردن بە خاوەن/i.test(reason)) givenSafe += amt;
        else expenses += amt;
      } else if (m.type === "in") {
        if (/قاسە|Safe/i.test(reason)) takenSafe += amt;
        else received += amt;
      }
    });

    applyHandoverLiveData({
      expenses: expenses,
      givenToSafe: givenSafe,
      totalRefunds: refunds,
      received: received,
      takenFromSafe: takenSafe,
      reportsCashSales: sales,
      date: formattedDate,
      cashier: activeCashier || "کاشیر"
    }, activeCashier);
  }

  function openCashHandoverBoard(isModal) {
    var activeCashier = "";
    if (typeof DB !== "undefined" && DB.currentUser && DB.currentUser.name) {
      activeCashier = DB.currentUser.name;
    } else if (typeof AuthService !== "undefined" && AuthService.getSession() && AuthService.getSession().fullName) {
      activeCashier = AuthService.getSession().fullName;
    }

    var nameEl = $("#hoBoardStoreName");
    if (nameEl) nameEl.textContent = storeBrand();
    if (typeof I18n !== "undefined" && I18n.apply) {
      try { I18n.apply($("#pageHandoverWrapper") || document.body); } catch (eApply) {}
    }

    // Always fill from local data first so the board is never empty
    fillHandoverFromLocal(activeCashier);

    var baseUrl = (typeof ApiClient !== "undefined" && ApiClient.getBaseUrl) ? ApiClient.getBaseUrl() : "http://localhost:3005";
    var url = baseUrl + "/api/shifts/handover-live" + (activeCashier ? ("?cashier=" + encodeURIComponent(activeCashier)) : "");

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.success) return;
        applyHandoverLiveData(data, activeCashier);
      })
      .catch(function () { /* local numbers already shown */ });
  }

  function openCashHandoverModal() {
    var board = $("#pageHandoverWrapper");
    var slot = $("#modalHandoverBoardSlot");
    if (board && slot && board.parentElement !== slot) {
      slot.appendChild(board);
    }
    if (board) {
      board.style.display = "block";
      board.style.visibility = "visible";
    }
    showModal("cashHandoverModal");
    openCashHandoverBoard(true);
  }

  function closeCashHandoverModal() {
    hideModal("cashHandoverModal");
    var board = $("#pageHandoverWrapper");
    var tabPane = $("#shiftsTabHandover");
    if (board && tabPane && board.parentElement !== tabPane) {
      tabPane.appendChild(board);
    }
  }

  function recalcHandover() {
    var expenses = parseFloat($("#hoInputExpenses") ? $("#hoInputExpenses").value : 0) || 0;
    var givenSafe = parseFloat($("#hoInputGivenSafe") ? $("#hoInputGivenSafe").value : 0) || 0;
    var refunds = parseFloat($("#hoInputRefunds") ? $("#hoInputRefunds").value : 0) || 0;
    var subtotalExpenses = expenses + givenSafe + refunds;

    var received = parseFloat($("#hoInputReceived") ? $("#hoInputReceived").value : 0) || 0;
    var takenSafe = parseFloat($("#hoInputTakenSafe") ? $("#hoInputTakenSafe").value : 0) || 0;
    var subtotalReceived = received + takenSafe;

    var cashOnHand = parseFloat($("#hoInputCashOnHand") ? $("#hoInputCashOnHand").value : 0) || 0;
    var sales = parseFloat($("#hoInputSales") ? $("#hoInputSales").value : 0) || 0;

    var expectedCash = (sales + subtotalReceived) - subtotalExpenses;
    var difference = cashOnHand - expectedCash;

    // Bottom Strips (Red background strip on columns)
    if ($("#hoStripExpenses")) $("#hoStripExpenses").textContent = fmtCommercial(refunds > 0 && expenses === 0 && givenSafe === 0 ? refunds : subtotalExpenses);
    if ($("#hoStripReceived")) $("#hoStripReceived").textContent = fmtCommercial(subtotalReceived);
    if ($("#hoStripCashOnHand")) $("#hoStripCashOnHand").textContent = fmtCommercial(cashOnHand);
    if ($("#hoStripSales")) $("#hoStripSales").textContent = fmtCommercial(sales);
    if ($("#hoDispExpenses")) $("#hoDispExpenses").textContent = fmtCommercial(expenses);
    if ($("#hoDispReceived")) $("#hoDispReceived").textContent = fmtCommercial(received);
    if ($("#hoDispCashOnHand")) $("#hoDispCashOnHand").textContent = fmtCommercial(cashOnHand);
    if ($("#hoDispSales")) $("#hoDispSales").textContent = fmtCommercial(sales);

    // Verdict Panel
    var verdictPanel = $("#hoVerdictPanel");
    var verdictAmount = $("#hoVerdictAmount");
    var verdictTitle = $("#hoVerdictStatusTitle");
    var verdictDesc = $("#hoVerdictDesc");

    var cashHint = $("#hoCashCountHint");
    if (cashHint) cashHint.textContent = fmtCommercial(cashOnHand) + " د.ع";

    if (verdictPanel && verdictAmount) {
      if (difference < 0) {
        verdictPanel.className = "ho-column ho-col-verdict verdict-shortage";
        if (verdictTitle) verdictTitle.textContent = ht("کورتهێنان");
        verdictAmount.textContent = fmtCommercial(difference);
        if (verdictDesc) verdictDesc.textContent = ht("کورتهێنان") + ": " + fmtCommercial(Math.abs(difference)) + " د.ع " + ht("دیناری عێراقی");
      } else if (difference === 0) {
        verdictPanel.className = "ho-column ho-col-verdict verdict-match";
        if (verdictTitle) verdictTitle.textContent = ht("ڕێکە");
        verdictAmount.textContent = "0";
        if (verdictDesc) verdictDesc.textContent = ht("سندوق و سیستەم یەکسانن");
      } else {
        verdictPanel.className = "ho-column ho-col-verdict verdict-overage";
        if (verdictTitle) verdictTitle.textContent = ht("زیادە");
        verdictAmount.textContent = "+" + fmtCommercial(difference);
        if (verdictDesc) verdictDesc.textContent = ht("زیادە") + ": " + fmtCommercial(difference) + " د.ع " + ht("دیناری عێراقی");
      }
    }
  }

  function clearHandoverField(fieldName) {
    if (fieldName === "expenses") {
      if ($("#hoInputExpenses")) $("#hoInputExpenses").value = "0";
    } else if (fieldName === "received") {
      if ($("#hoInputReceived")) $("#hoInputReceived").value = "0";
    } else if (fieldName === "cashOnHand") {
      if ($("#hoInputCashOnHand")) $("#hoInputCashOnHand").value = "0";
    } else if (fieldName === "sales") {
      if ($("#hoInputSales")) $("#hoInputSales").value = "0";
    }
    recalcHandover();
  }

  function clearHandoverInputs() {
    if ($("#hoInputExpenses")) $("#hoInputExpenses").value = "0";
    if ($("#hoInputGivenSafe")) $("#hoInputGivenSafe").value = "0";
    if ($("#hoInputRefunds")) $("#hoInputRefunds").value = "0";
    if ($("#hoInputReceived")) $("#hoInputReceived").value = "0";
    if ($("#hoInputTakenSafe")) $("#hoInputTakenSafe").value = "0";
    if ($("#hoInputCashOnHand")) $("#hoInputCashOnHand").value = "0";
    if ($("#hoInputNote")) $("#hoInputNote").value = "";
    recalcHandover();
    toast("سڕینەوە", "خانەکان پاککرانەوە", "info");
  }

  function saveCashHandover() {
    var cashier = ($("#hoFooterCashierName") ? $("#hoFooterCashierName").textContent : "کاشیر").trim();
    var dateStr = ($("#hoFooterDate") ? $("#hoFooterDate").textContent : "25.10.2026").trim();
    var sales = parseFloat($("#hoInputSales") ? $("#hoInputSales").value : 0) || 0;
    var refunds = parseFloat($("#hoInputRefunds") ? $("#hoInputRefunds").value : 0) || 0;
    var expenses = parseFloat($("#hoInputExpenses") ? $("#hoInputExpenses").value : 0) || 0;
    var givenSafe = parseFloat($("#hoInputGivenSafe") ? $("#hoInputGivenSafe").value : 0) || 0;
    var received = parseFloat($("#hoInputReceived") ? $("#hoInputReceived").value : 0) || 0;
    var takenSafe = parseFloat($("#hoInputTakenSafe") ? $("#hoInputTakenSafe").value : 0) || 0;
    var cashOnHand = parseFloat($("#hoInputCashOnHand") ? $("#hoInputCashOnHand").value : 0) || 0;
    var expectedCash = (sales + received + takenSafe) - (refunds + expenses + givenSafe);
    var difference = cashOnHand - expectedCash;
    var note = ($("#hoInputNote") ? $("#hoInputNote").value : "").trim();

    var doCloseShift = false;
    if (ACTIVE_SHIFT_DATA && ACTIVE_SHIFT_DATA.status === "open") {
      doCloseShift = confirm("ئایا دەتەوێت شێفتی ئێستاش (#" + ACTIVE_SHIFT_DATA.id.slice(-5) + ") بە فەرمی دابخرێت لەگەڵ ئەم تەسلیمکردنە؟\n\nئەگەر 'OK' دابگریت، شێفتەکە دادەخرێت و پسوڵەی کۆتایی چاپ دەبێت.");
    }

    var payload = {
      shiftId: ACTIVE_SHIFT_DATA ? ACTIVE_SHIFT_DATA.id : null,
      cashier: cashier,
      date: dateStr,
      reportsCashSales: sales,
      totalRefunds: refunds,
      expenses: expenses,
      givenToSafe: givenSafe,
      received: received,
      takenFromSafe: takenSafe,
      cashOnHand: cashOnHand,
      expectedCash: expectedCash,
      difference: difference,
      closeShift: doCloseShift,
      note: note
    };

    // 1) OFFLINE-FIRST: always persist locally in SQLite so the handover is never lost
    var savedLocal = saveLocalHandover(payload);

    // 2) Close shift locally if requested (works without backend)
    if (doCloseShift && ACTIVE_SHIFT_DATA) {
      ACTIVE_SHIFT_DATA.status = "closed";
      ACTIVE_SHIFT_DATA.closedAt = new Date().toISOString();
    }

    // 3) Success UX immediately (print + refresh), independent of backend
    toast("سەرکەوتوو", "تەسلیمکردنی سندوق بە فەرمی تۆمارکرا", "success");
    try { printHandoverVoucher(); } catch (e) { console.warn("handover print:", e); }
    refreshCurrentShift();
    if (typeof loadPastHandovers === "function") loadPastHandovers();

    // 4) Best-effort background sync to optional Node backend (ignored if offline)
    try {
      fetch(getShiftApiBase() + "/api/shifts/handovers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.success) {
            savedLocal.synced = true;
            persistLocalHandovers(getLocalHandovers());
          }
        })
        .catch(function () { /* offline — already saved locally */ });
    } catch (e) { /* offline — already saved locally */ }
  }

  function printHandoverVoucher(customData) {
    var cashier = customData ? (customData.cashier || "کاشیر") : ($("#hoFooterCashierName") ? $("#hoFooterCashierName").textContent : "کاشیر").trim();
    var dateStr = customData ? (customData.date || "25.10.2026") : ($("#hoFooterDate") ? $("#hoFooterDate").textContent : "25.10.2026").trim();
    var sales = customData ? customData.reportsCashSales : (parseFloat($("#hoInputSales") ? $("#hoInputSales").value : 0) || 0);
    var refunds = customData ? customData.totalRefunds : (parseFloat($("#hoInputRefunds") ? $("#hoInputRefunds").value : 0) || 0);
    var expenses = customData ? customData.expenses : (parseFloat($("#hoInputExpenses") ? $("#hoInputExpenses").value : 0) || 0);
    var givenSafe = customData ? customData.givenToSafe : (parseFloat($("#hoInputGivenSafe") ? $("#hoInputGivenSafe").value : 0) || 0);
    var received = customData ? customData.received : (parseFloat($("#hoInputReceived") ? $("#hoInputReceived").value : 0) || 0);
    var takenSafe = customData ? customData.takenFromSafe : (parseFloat($("#hoInputTakenSafe") ? $("#hoInputTakenSafe").value : 0) || 0);
    var cashOnHand = customData ? customData.cashOnHand : (parseFloat($("#hoInputCashOnHand") ? $("#hoInputCashOnHand").value : 0) || 0);
    var expectedCash = customData ? customData.expectedCash : ((sales + received + takenSafe) - (refunds + expenses + givenSafe));
    var difference = customData ? customData.difference : (cashOnHand - expectedCash);
    var note = customData ? (customData.note || "") : ($("#hoInputNote") ? $("#hoInputNote").value : "").trim();

    var diffLabel = difference < 0 ? "کورتھێنان (SHORTAGE)" : (difference === 0 ? "ڕێکخراو و تەواو (BALANCED)" : "زیادە (OVERAGE)");

    var receiptHtml = [
      '<!DOCTYPE html>',
      '<html lang="ku" dir="rtl">',
      '<head>',
      '<meta charset="UTF-8">',
      '<title>پسوڵەی تەسلیمکردنی سندوق</title>',
      '<style>',
      '@page { size: 80mm auto; margin: 0; }',
      'body { width: 100%; margin: 0 auto; padding: 8px 10px; font-family: Tahoma, Arial, sans-serif; font-size: 22px; line-height: 1.4; color: #000; }',
      '.center { text-align: center; }',
      '.bold { font-weight: bold; }',
      '.big { font-size: 26px; }',
      '.huge { font-size: 32px; font-weight: 800; }',
      '.divider { border-top: 1px dashed #000; margin: 4px 0; }',
      '.row { display: flex; justify-content: space-between; gap: 6px; margin: 2px 0; }',
      '.row span:last-child { text-align: left; word-break: break-word; }',
      '.badge { display: inline-block; padding: 2px 6px; font-weight: bold; font-size: 13px; border: 1px solid #000; margin: 3px 0; }',
      '.sign-box { margin-top: 10px; display: flex; justify-content: space-between; padding-top: 10px; border-top: 1px solid #000; font-size: 13px; }',
      '</style>',
      '</head>',
      '<body>',
      '<div class="center">',
      '  <div class="bold big">' + storeBrand() + '</div>',
      '  <div>پسوڵەی فەرمی تەسلیمکردنی سندوق</div>',
      '  <div class="bold">CASH HANDOVER VOUCHER</div>',
      '  <div class="badge">' + diffLabel + '</div>',
      '</div>',
      '<div class="divider"></div>',
      '<div class="row"><span>کاشیر:</span><span class="bold">' + cashier + '</span></div>',
      '<div class="row"><span>بەروار:</span><span class="bold">' + dateStr + '</span></div>',
      '<div class="row"><span>کاتی چاپ:</span><span>' + t12(new Date(), true) + '</span></div>',
      '<div class="divider"></div>',
      '<div class="bold" style="margin-bottom:3px;">📊 ژمێریاری سیستەم:</div>',
      '<div class="row"><span>فرۆشتنی نەقد (Sales):</span><span class="bold">' + fmt(sales) + ' د.ع</span></div>',
      '<div class="row"><span>گەڕانەوە (Total Refunds):</span><span>' + fmt(refunds) + ' د.ع</span></div>',
      '<div class="row"><span>خەرجی سندوق (Expenses):</span><span>' + fmt(expenses) + ' د.ع</span></div>',
      '<div class="row"><span>دراوە بە قاسە (Safe Drop):</span><span>' + fmt(givenSafe) + ' د.ع</span></div>',
      '<div class="row"><span>پارەی وەرگیراو (Received):</span><span>' + fmt(received) + ' د.ع</span></div>',
      '<div class="row"><span>هێنراو لە قاسە (From Safe):</span><span>' + fmt(takenSafe) + ' د.ع</span></div>',
      '<div class="divider"></div>',
      '<div class="row bold"><span>پارەی چاوەڕێکراو (Expected):</span><span>' + fmt(expectedCash) + ' د.ع</span></div>',
      '<div class="row bold big"><span>پارەی بەدەست (Cash on Hand):</span><span>' + fmt(cashOnHand) + ' د.ع</span></div>',
      '<div class="divider"></div>',
      '<div class="row bold huge"><span>جیاوازی سندوق:</span><span>' + fmtCommercial(difference) + ' د.ع</span></div>',
      note ? ('<div style="margin-top:6px;font-style:italic;">تێبینی: ' + note + '</div>') : '',
      '<div class="sign-box">',
      '  <div>واژۆی کاشیر<br><br>__________</div>',
      '  <div>واژۆی سەرپەرشتیار<br><br>__________</div>',
      '</div>',
      '<div class="center" style="margin-top:10px;font-size:18px;">سیستەمی وەرگرتنی پارە • چاپکراوە بە Xprinter 80mm</div>',
      '</body></html>'
    ].join('\n');

    printHtmlViaIframe(receiptHtml);
  }

  function sendHandoverWhatsApp() {
    var cashier = ($("#hoFooterCashierName") ? $("#hoFooterCashierName").textContent : "کاشیر").trim();
    var dateStr = ($("#hoFooterDate") ? $("#hoFooterDate").textContent : "25.10.2026").trim();
    var sales = parseFloat($("#hoInputSales") ? $("#hoInputSales").value : 0) || 0;
    var refunds = parseFloat($("#hoInputRefunds") ? $("#hoInputRefunds").value : 0) || 0;
    var expenses = parseFloat($("#hoInputExpenses") ? $("#hoInputExpenses").value : 0) || 0;
    var givenSafe = parseFloat($("#hoInputGivenSafe") ? $("#hoInputGivenSafe").value : 0) || 0;
    var received = parseFloat($("#hoInputReceived") ? $("#hoInputReceived").value : 0) || 0;
    var takenSafe = parseFloat($("#hoInputTakenSafe") ? $("#hoInputTakenSafe").value : 0) || 0;
    var cashOnHand = parseFloat($("#hoInputCashOnHand") ? $("#hoInputCashOnHand").value : 0) || 0;
    var expectedCash = (sales + received + takenSafe) - (refunds + expenses + givenSafe);
    var difference = cashOnHand - expectedCash;
    var note = ($("#hoInputNote") ? $("#hoInputNote").value : "").trim();

    var statusEmoji = difference < 0 ? "🔴 کورتھێنان" : (difference === 0 ? "🟢 ڕێکخراو و تەواو" : "🔵 زیادە");

    var text = [
      '🏪 *' + storeBrand() + ' - پسوڵەی تەسلیمکردنی سندوق*',
      '👤 *کاشیر:* ' + cashier,
      '📅 *بەروار:* ' + dateStr,
      '⏰ *کات:* ' + t12(new Date()),
      '━━━━━━━━━━━━━━━━━━━',
      '📊 *فرۆشتنی نەقد (Sales):* ' + fmt(sales) + ' د.ع',
      '↩️ *گەڕانەوە (Refunds):* ' + fmt(refunds) + ' د.ع',
      '💸 *خەرجی (Expenses):* ' + fmt(expenses) + ' د.ع',
      '🔒 *دراوە بە قاسە (Safe Drop):* ' + fmt(givenSafe) + ' د.ع',
      '📥 *وەرگیراو (Received):* ' + fmt(received) + ' د.ع',
      '━━━━━━━━━━━━━━━━━━━',
      '💵 *پارەی چاوەڕێکراو:* ' + fmt(expectedCash) + ' د.ع',
      '✋ *پارەی بەدەست (Cash on Hand):* ' + fmt(cashOnHand) + ' د.ع',
      '🚨 *دۆخی سندوق:* ' + statusEmoji,
      '⚖️ *جیاوازی:* ' + fmtCommercial(difference) + ' د.ع',
      '━━━━━━━━━━━━━━━━━━━'
    ];
    if (note) text.push('📝 *تێبینی:* ' + note);
    text.push('📌 *سیستەمی بەڕێوەبردنی سندوق - ' + storeBrand() + '*');

    var fullMsg = text.join('\n');
    window.open('https://wa.me/?text=' + encodeURIComponent(fullMsg), '_blank');
  }

  function takeHandoverScreenshot() {
    toast("وێنەگرتن", "ئامادەکاری بۆ چاپ یان وێنەی شاشەی تەسلیمکردن", "info");
    printHandoverVoucher();
  }

  function openPastHandoversModal() {
    showModal("pastHandoversModal");
    loadPastHandovers();
  }

  function renderPastHandovers(handovers) {
    var tbody = $("#pastHandoversTable tbody");
    if (!tbody) return;
    if (!handovers || handovers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--text-muted);">هیچ تەسلیمکردنێکی پێشوو تۆمار نەکراوە</td></tr>';
      return;
    }
    // newest first
    handovers = handovers.slice().reverse();
    tbody.innerHTML = handovers.map(function (h, idx) {
          var isShort = h.difference < 0;
          var isMatch = h.difference === 0;
          var badgeClass = isMatch ? 'balanced' : (isShort ? 'shortage' : 'overage');
          var badgeText = isMatch ? 'ڕێکخراو' : (isShort ? 'کورتھێنان' : 'زیادە');
          var diffColor = isMatch ? '#10b981' : (isShort ? '#ef4444' : '#3b82f6');

          return [
            '<tr>',
            '  <td>#' + (handovers.length - idx) + '</td>',
            '  <td><strong>' + (h.cashier || "-") + '</strong></td>',
            '  <td>' + (h.date || "-") + '</td>',
            '  <td>' + fmt(h.reportsCashSales) + '</td>',
            '  <td>' + fmt(h.expectedCash) + '</td>',
            '  <td><strong style="color:#60a5fa;">' + fmt(h.cashOnHand) + '</strong></td>',
            '  <td><strong style="color:' + diffColor + ';">' + fmtCommercial(h.difference) + '</strong></td>',
            '  <td><span class="ho-status-badge ' + badgeClass + '">' + badgeText + '</span></td>',
            '  <td>',
            '    <button class="btn btn-sm btn-outline" onclick=\'ShiftsManager.reprintHandover(' + JSON.stringify(h).replace(/'/g, "&#39;") + ')\'>',
            '      <i class="fas fa-print"></i> چاپ',
            '    </button>',
            '  </td>',
            '</tr>'
          ].join('');
        }).join('');
  }

  function loadPastHandovers() {
    // OFFLINE-FIRST: render from local SQLite store immediately
    var local = getLocalHandovers();
    renderPastHandovers(local);
    // Best-effort: if backend is reachable, merge/replace with its data
    try {
      fetch(getShiftApiBase() + "/api/shifts/handovers")
        .then(function (r) { return r.json(); })
        .then(function (handovers) {
          if (handovers && handovers.length) renderPastHandovers(handovers);
        })
        .catch(function () { /* offline — local already rendered */ });
    } catch (e) { /* offline — local already rendered */ }
  }

  function reprintHandover(h) {
    if (!h) return;
    printHandoverVoucher(h);
  }

  function openHandoverAgreementModal() {
    var cashier = ($("#hoFooterCashierName") ? $("#hoFooterCashierName").textContent : "کاشیر").trim();
    if ($("#agrCashierName")) $("#agrCashierName").textContent = cashier;
    if ($("#agrCurrentTime")) $("#agrCurrentTime").textContent = t12dt(new Date(), true);
    showModal("handoverAgreementModal");
  }

  function confirmAgreement() {
    hideModal("handoverAgreementModal");
    toast("ڕێککەوتننامە", "ڕێککەوتننامەی تەسلیمکردن بە فەرمی پەسەندکرا ✅", "success");
  }

  function renderCashierBalance(handovers) {
        var container = $("#cashierBalanceCardsList");
        if (!container) return;
        if (!handovers || handovers.length === 0) {
          container.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:20px;">هیچ تۆمارێک نییە</div>';
          return;
        }

        var cashierStats = {};
        handovers.forEach(function (h) {
          var c = (h.cashier || "نەزانراو").toUpperCase();
          if (!cashierStats[c]) {
            cashierStats[c] = { cashier: c, count: 0, totalSales: 0, totalDifference: 0, shortages: 0, overages: 0 };
          }
          cashierStats[c].count++;
          cashierStats[c].totalSales += (h.reportsCashSales || 0);
          cashierStats[c].totalDifference += (h.difference || 0);
          if (h.difference < 0) cashierStats[c].shortages += h.difference;
          else if (h.difference > 0) cashierStats[c].overages += h.difference;
        });

        var html = Object.keys(cashierStats).map(function (k) {
          var s = cashierStats[k];
          var isNetNegative = s.totalDifference < 0;
          return [
            '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;">',
            '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">',
            '    <div style="font-size:1.3rem;font-weight:900;color:#fff;">👤 ' + s.cashier + '</div>',
            '    <div style="font-size:0.85rem;color:#94a3b8;">' + s.count + ' تەسلیمکردن</div>',
            '  </div>',
            '  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">',
            '    <div style="background:rgba(0,0,0,0.3);padding:10px;border-radius:8px;">',
            '      <div style="font-size:0.75rem;color:#94a3b8;">کۆی فرۆشتنی نەقد:</div>',
            '      <div style="font-size:1.1rem;font-weight:800;color:#10b981;">' + fmt(s.totalSales) + ' د.ع</div>',
            '    </div>',
            '    <div style="background:rgba(0,0,0,0.3);padding:10px;border-radius:8px;">',
            '      <div style="font-size:0.75rem;color:#94a3b8;">کۆی کورتھێنان:</div>',
            '      <div style="font-size:1.1rem;font-weight:800;color:#ef4444;">' + fmtCommercial(s.shortages) + ' د.ع</div>',
            '    </div>',
            '    <div style="background:rgba(0,0,0,0.3);padding:10px;border-radius:8px;">',
            '      <div style="font-size:0.75rem;color:#94a3b8;">کۆی جیاوازی باڵانس:</div>',
            '      <div style="font-size:1.15rem;font-weight:900;color:' + (isNetNegative ? '#ef4444' : '#10b981') + ';">' + fmtCommercial(s.totalDifference) + ' د.ع</div>',
            '    </div>',
            '  </div>',
            '</div>'
          ].join('');
        }).join('');

        container.innerHTML = html;
  }

  function openCashierBalanceModal() {
    showModal("cashierBalanceModal");
    // OFFLINE-FIRST: render from local SQLite store
    renderCashierBalance(getLocalHandovers());
    // Best-effort backend merge
    try {
      fetch(getShiftApiBase() + "/api/shifts/handovers")
        .then(function (r) { return r.json(); })
        .then(function (handovers) {
          if (handovers && handovers.length) renderCashierBalance(handovers);
        })
        .catch(function () { /* offline — local already rendered */ });
    } catch (e) { /* offline — local already rendered */ }
  }

  /* ═══════════════════════════════════════════════════════════════
     CANVAS SCREENSHOT & DIRECT WHATSAPP IMAGE SENDER
     ═══════════════════════════════════════════════════════════════ */

  var CURRENT_HANDOVER_IMAGE_BLOB = null;
  var CURRENT_HANDOVER_IMAGE_URL = null;

  function captureAndSendHandoverScreen(isScreenshotOnly) {
    var cashier = ($("#hoFooterCashierName") ? $("#hoFooterCashierName").textContent : "کاشیر").trim();
    var dateStr = ($("#hoFooterDate") ? $("#hoFooterDate").textContent : "25.10.2026").trim();
    var sales = parseFloat($("#hoInputSales") ? $("#hoInputSales").value : 0) || 0;
    var refunds = parseFloat($("#hoInputRefunds") ? $("#hoInputRefunds").value : 0) || 0;
    var expenses = parseFloat($("#hoInputExpenses") ? $("#hoInputExpenses").value : 0) || 0;
    var givenSafe = parseFloat($("#hoInputGivenSafe") ? $("#hoInputGivenSafe").value : 0) || 0;
    var received = parseFloat($("#hoInputReceived") ? $("#hoInputReceived").value : 0) || 0;
    var takenSafe = parseFloat($("#hoInputTakenSafe") ? $("#hoInputTakenSafe").value : 0) || 0;
    var cashOnHand = parseFloat($("#hoInputCashOnHand") ? $("#hoInputCashOnHand").value : 0) || 0;
    var note = ($("#hoInputNote") ? $("#hoInputNote").value : "").trim();

    var subtotalExpenses = expenses + givenSafe + refunds;
    var subtotalReceived = received + takenSafe;
    var expectedCash = (sales + subtotalReceived) - subtotalExpenses;
    var difference = cashOnHand - expectedCash;

    var canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    var ctx = canvas.getContext("2d");

    // 1. Dark Main Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, 1280, 720);

    // 2. Top Header Bar (Like MARKET POS - PRO v7.01)
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, 1280, 56);
    
    // Pro Badge
    ctx.fillStyle = "#dc2626";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(20, 12, 190, 32, 6);
    else ctx.rect(20, 12, 190, 32);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px 'Segoe UI', Tahoma, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("MARKET POS - PRO v7.01", 115, 33);

    // Active Tab: CASH HANDOVER
    ctx.fillStyle = "#059669";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(225, 12, 160, 32, 6);
    else ctx.rect(225, 12, 160, 32);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(ht("تەسلیمکردنی سندوق"), 305, 33);

    // Market Name on Right
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "bold 15px 'Segoe UI', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(storeBrand() + "  •  " + ht("تەسلیمکردنی فەرمی سندوق"), 1260, 35);

    // 3. Grid Coordinates for the 5 Columns
    var x1 = 20, w1 = 175;
    var x2 = 205, w2 = 175;
    var x3 = 390, w3 = 195;
    var x4 = 595, w4 = 200;
    var x5 = 805, w5 = 455;
    var topY = 70, colH = 630;

    function drawColHeader(x, w, title, bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(x, topY, w, 42);
      ctx.fillStyle = "#000000";
      ctx.font = "bold 15px 'Segoe UI', Tahoma, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(title, x + 12, topY + 27);
    }

    function drawBottomStrip(x, w, val) {
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(x, topY + colH - 46, w, 46);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px 'Segoe UI', Tahoma, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(fmtCommercial(val), x + (w / 2), topY + colH - 16);
    }

    // ──── COLUMN 1: Expenses (Amber) ────
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(x1, topY, w1, colH);
    drawColHeader(x1, w1, ht("خەرجی سندوق"), "#f59e0b");
    ctx.fillStyle = "#000000";
    ctx.font = "bold 34px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(fmtCommercial(expenses), x1 + 14, topY + 85);

    // Sub-box 1: Given to Safe (Yellow)
    ctx.fillStyle = "#eab308";
    ctx.fillRect(x1, topY + 115, w1, 80);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 12px 'Segoe UI', sans-serif";
    ctx.fillText(ht("درا بە قاسە"), x1 + 10, topY + 135);
    ctx.font = "bold 24px 'Segoe UI', sans-serif";
    ctx.fillText(fmtCommercial(givenSafe), x1 + 10, topY + 170);

    // Sub-box 2: Total Refunds (Green)
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(x1, topY + 205, w1, 80);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 12px 'Segoe UI', sans-serif";
    ctx.fillText(ht("کۆی گەڕانەوەکان"), x1 + 10, topY + 225);
    ctx.font = "bold 24px 'Segoe UI', sans-serif";
    ctx.fillText(fmtCommercial(refunds), x1 + 10, topY + 260);

    drawBottomStrip(x1, w1, refunds > 0 && expenses === 0 && givenSafe === 0 ? refunds : subtotalExpenses);

    // ──── COLUMN 2: Received (Blue) ────
    ctx.fillStyle = "#0ea5e9";
    ctx.fillRect(x2, topY, w2, colH);
    drawColHeader(x2, w2, ht("وەرگیراو"), "#0ea5e9");
    ctx.fillStyle = "#000000";
    ctx.font = "bold 34px 'Segoe UI', sans-serif";
    ctx.fillText(fmtCommercial(received), x2 + 14, topY + 85);

    // Sub-box: Taken from Safe (Purple)
    ctx.fillStyle = "#a855f7";
    ctx.fillRect(x2, topY + 115, w2, 80);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 12px 'Segoe UI', sans-serif";
    ctx.fillText(ht("لە قاسە هێنرا"), x2 + 10, topY + 135);
    ctx.font = "bold 24px 'Segoe UI', sans-serif";
    ctx.fillText(fmtCommercial(takenSafe), x2 + 10, topY + 170);

    drawBottomStrip(x2, w2, subtotalReceived);

    // ──── COLUMN 3: Cash on Hand (Peach/Salmon) ────
    ctx.fillStyle = "#f87171";
    ctx.fillRect(x3, topY, w3, colH);
    drawColHeader(x3, w3, ht("پارەی بەدەست"), "#f87171");
    ctx.fillStyle = "#000000";
    ctx.font = "bold 38px 'Segoe UI', sans-serif";
    ctx.fillText(fmtCommercial(cashOnHand), x3 + 14, topY + 90);

    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(x3 + 10, topY + 120, w3 - 20, 60);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 13px 'Segoe UI', sans-serif";
    ctx.fillText(ht("ژمێرەری کاشێر"), x3 + 18, topY + 143);
    ctx.font = "bold 15px 'Segoe UI', sans-serif";
    ctx.fillText(fmt(cashOnHand) + " د.ع", x3 + 18, topY + 167);

    drawBottomStrip(x3, w3, cashOnHand);

    // ──── COLUMN 4: Reports Cash Sales (Lime Green) ────
    ctx.fillStyle = "#84cc16";
    ctx.fillRect(x4, topY, w4, colH);
    drawColHeader(x4, w4, ht("فرۆشتنی نەقدی ڕاپۆرت"), "#84cc16");
    ctx.fillStyle = "#000000";
    ctx.font = "bold 36px 'Segoe UI', sans-serif";
    ctx.fillText(fmtCommercial(sales), x4 + 14, topY + 90);

    if (note) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(x4 + 10, topY + colH - 120, w4 - 20, 60);
      ctx.fillStyle = "#000000";
      ctx.font = "bold 11px 'Segoe UI', sans-serif";
      ctx.fillText(ht("تێبینی") + ":", x4 + 16, topY + colH - 100);
      ctx.font = "normal 12px 'Segoe UI', sans-serif";
      ctx.fillText(note.slice(0, 26), x4 + 16, topY + colH - 80);
    }

    drawBottomStrip(x4, w4, sales);

    // ──── COLUMN 5: Giant Verdict Panel (Dynamic) ────
    var verdictBg = difference < 0 ? "#dc2626" : (difference === 0 ? "#16a34a" : "#2563eb");
    ctx.fillStyle = verdictBg;
    ctx.fillRect(x5, topY, w5, colH - 130);

    // Status Title
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "bold 16px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    var statusLabel = difference < 0 ? ht("کورتهێنان") : (difference === 0 ? ht("ڕێکە") : ht("زیادە"));
    ctx.fillText(statusLabel, x5 + (w5 / 2), topY + 95);

    // MASSIVE BOLD WHITE DIFFERENCE NUMBER
    ctx.fillStyle = "#ffffff";
    ctx.font = "950 82px 'Segoe UI', Tahoma, sans-serif";
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 15;
    var diffText = difference > 0 ? ("+" + fmtCommercial(difference)) : fmtCommercial(difference);
    ctx.fillText(diffText, x5 + (w5 / 2), topY + 235);
    ctx.shadowBlur = 0;

    ctx.font = "bold 17px 'Segoe UI', sans-serif";
    var descText = difference < 0
      ? (ht("کورتهێنان") + ": " + fmt(Math.abs(difference)) + " " + ht("دیناری عێراقی"))
      : (difference === 0
        ? ht("سندوق و سیستەم یەکسانن")
        : (ht("زیادە") + ": +" + fmt(difference) + " " + ht("دیناری عێراقی")));
    ctx.fillText(descText, x5 + (w5 / 2), topY + 295);

    // Bottom Black Box (Date & Cashier Name)
    ctx.fillStyle = "#000000";
    ctx.fillRect(x5, topY + colH - 130, w5, 130);

    ctx.fillStyle = "#f1f5f9";
    ctx.font = "bold 23px 'Segoe UI', sans-serif";
    ctx.fillText("📅 " + dateStr, x5 + (w5 / 2), topY + colH - 85);

    ctx.fillStyle = "#ffffff";
    ctx.font = "950 44px 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(cashier.toUpperCase(), x5 + (w5 / 2), topY + colH - 35);

    // Convert to Blob and show modal
    canvas.toBlob(function (blob) {
      if (!blob) return;
      CURRENT_HANDOVER_IMAGE_BLOB = blob;
      if (CURRENT_HANDOVER_IMAGE_URL) URL.revokeObjectURL(CURRENT_HANDOVER_IMAGE_URL);
      CURRENT_HANDOVER_IMAGE_URL = URL.createObjectURL(blob);

      var previewImg = $("#hoGeneratedPreviewImg");
      if (previewImg) previewImg.src = CURRENT_HANDOVER_IMAGE_URL;

      // Copy automatically to system clipboard so user can just press Ctrl+V in WhatsApp!
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
            .then(function () {
              toast("کۆپیکرا", "وێنەی شاشەکە ڕاستەوخۆ کۆپیکرا بۆ Clipboard! ئامادەیە بۆ Paste", "success");
            })
            .catch(function () {});
        } catch(e) {}
      }

      showModal("handoverImageModal");
    }, "image/png");
  }

  function openWhatsAppForImagePaste() {
    window.open("https://web.whatsapp.com", "_blank");
    toast("واتسئاپ", "واتسئاپ کرایەوە! تەنها کلیلی Ctrl+V دابگرە بۆ ناردنی وێنەکە", "info");
  }

  function copyCurrentImageToClipboard() {
    if (!CURRENT_HANDOVER_IMAGE_BLOB) {
      toast("ئاگاداری", "تکایە سەرەتا وێنەکە دروست بکە", "warning");
      return;
    }
    if (navigator.clipboard && window.ClipboardItem) {
      navigator.clipboard.write([new ClipboardItem({ "image/png": CURRENT_HANDOVER_IMAGE_BLOB })])
        .then(function () {
          toast("کۆپیکرا", "وێنەکە دووبارە کۆپیکرا بۆ ناو Clipboard!", "success");
        })
        .catch(function () {
          toast("هەڵە", "ڕێگەپێدانی کۆپیکردن نەدراوە", "error");
        });
    }
  }

  function downloadGeneratedImage() {
    if (!CURRENT_HANDOVER_IMAGE_URL) return;
    var cashier = ($("#hoFooterCashierName") ? $("#hoFooterCashierName").textContent : "کاشیر").trim();
    var a = document.createElement("a");
    a.href = CURRENT_HANDOVER_IMAGE_URL;
    a.download = "Cash_Handover_" + cashier + "_" + new Date().toISOString().slice(0, 10) + ".png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /* ═══════════════════════════════════════════════════════════════
     3-CASHIER 24-HOUR CYCLE & SHIFT TRANSFER (HANDOVER CHAIN)
     ═══════════════════════════════════════════════════════════════ */

  function selectCycleShift(shiftType) {
    $$(".ho-cycle-pill").forEach(function (p) { p.classList.remove("active"); });
    if (shiftType === "morning" && $("#hoPillMorning")) $("#hoPillMorning").classList.add("active");
    if (shiftType === "evening" && $("#hoPillEvening")) $("#hoPillEvening").classList.add("active");
    if (shiftType === "night" && $("#hoPillNight")) $("#hoPillNight").classList.add("active");

    fetch(getShiftApiBase() + "/api/shifts/today-cycle")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.cycle) return;
        var s = data.cycle[shiftType];
        if (s) {
          if ($("#hoInputSales")) $("#hoInputSales").value = s.cashSales || 0;
          if ($("#hoInputCashOnHand")) $("#hoInputCashOnHand").value = s.closingCash || s.openingCash || 0;
          if ($("#hoFooterCashierName")) $("#hoFooterCashierName").textContent = (s.cashier || "کاشیر").toUpperCase();
          if ($("#hoFooterDate")) $("#hoFooterDate").textContent = data.date ? data.date.split("-").reverse().join(".") : "25.10.2026";
          recalcHandover();
          toast("شێفت", "شێفتی [" + s.cashier + "] چالاککرا", "info");
        } else {
          toast("ئاگاداری", "ئەم شێفتە هێشتا نەکراوەتەوە لە ئەمڕۆدا", "warning");
        }
      });
  }

  function updateCashierCyclePills() {
    fetch(getShiftApiBase() + "/api/shifts/today-cycle")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.cycle) return;
        if (data.cycle.morning && $("#hoPillNameMorning")) $("#hoPillNameMorning").textContent = "(" + data.cycle.morning.cashier + ")";
        if (data.cycle.evening && $("#hoPillNameEvening")) $("#hoPillNameEvening").textContent = "(" + data.cycle.evening.cashier + ")";
        if (data.cycle.night && $("#hoPillNameNight")) $("#hoPillNameNight").textContent = "(" + data.cycle.night.cashier + ")";
      });
  }

  function openTransferShiftModal() {
    var curCashier = ($("#hoFooterCashierName") ? $("#hoFooterCashierName").textContent : "کاشیر").trim();
    var cashOnHand = parseFloat($("#hoInputCashOnHand") ? $("#hoInputCashOnHand").value : 0) || 0;

    if ($("#trCurCashier")) $("#trCurCashier").textContent = curCashier;
    if ($("#trCurCashOnHand")) $("#trCurCashOnHand").textContent = fmt(cashOnHand) + " د.ع";
    if ($("#trSafeDrop")) $("#trSafeDrop").value = "0";

    var nextCashierInput = $("#trNextCashier");
    var nextShiftSelect = $("#trNextShiftType");
    if (nextCashierInput) nextCashierInput.value = "";
    if (nextShiftSelect) nextShiftSelect.value = "morning";

    recalcTransferFloats();
    showModal("transferShiftModal");
  }

  function recalcTransferFloats() {
    var cashOnHand = parseFloat($("#hoInputCashOnHand") ? $("#hoInputCashOnHand").value : 0) || 0;
    var safeDrop = parseFloat($("#trSafeDrop") ? $("#trSafeDrop").value : 0) || 0;
    var floatForNext = Math.max(0, cashOnHand - safeDrop);
    if ($("#trFloatForNext")) $("#trFloatForNext").value = floatForNext;
  }

  function confirmTransferShift() {
    var curCashier = ($("#hoFooterCashierName") ? $("#hoFooterCashierName").textContent : "کاشیر").trim();
    var cashOnHand = parseFloat($("#hoInputCashOnHand") ? $("#hoInputCashOnHand").value : 0) || 0;
    var safeDrop = parseFloat($("#trSafeDrop") ? $("#trSafeDrop").value : 0) || 0;
    var floatForNext = parseFloat($("#trFloatForNext") ? $("#trFloatForNext").value : 0) || 0;
    var nextCashier = ($("#trNextCashier") ? $("#trNextCashier").value : "کاشیری نوێ").trim();
    var nextShiftType = ($("#trNextShiftType") ? $("#trNextShiftType").value : "morning");
    var note = ($("#trNote") ? $("#trNote").value : "").trim();

    var payload = {
      currentShiftId: ACTIVE_SHIFT_DATA ? ACTIVE_SHIFT_DATA.id : null,
      currentCashier: curCashier,
      nextCashier: nextCashier,
      nextShiftType: nextShiftType,
      cashOnHand: cashOnHand,
      safeDrop: safeDrop,
      floatForNext: floatForNext,
      note: note
    };

    fetch(getShiftApiBase() + "/api/shifts/transfer-handover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.success) {
          hideModal("transferShiftModal");
          toast("دەستەودەست", res.message || "شێفت بە سەرکەوتوویی تەسلیمکرا", "success");
          captureAndSendHandoverScreen(false);
          printHandoverVoucher();
          refreshCurrentShift();
          updateCashierCyclePills();
        } else {
          toast("هەڵە", res.error || "نەتوانرا شێفت تەسلیم بکرێت", "error");
        }
      })
      .catch(function () {
        toast("هەڵە", "پەیوەندی لەگەڵ سێرڤەر نییە", "error");
      });
  }

  /* ═══════════════════════════════════════════════════════════════
     AUTOMATED SHIFT SCHEDULE & 10-MINUTE DRAWER ("سندوق") REMINDER
     - Default cycles:
       12:00 AM (00:00) to 08:00 AM (Night Shift) -> Alert at 07:50 AM
       08:00 AM to 04:00 PM (16:00) (Morning Shift) -> Alert at 15:50 PM
       04:00 PM (16:00) to 12:00 AM (00:00) (Evening Shift) -> Alert at 23:50 PM
     ═══════════════════════════════════════════════════════════════ */
  var SHIFT_TRANSITIONS = [
    { hour: 8, minute: 0, shiftName: "بەیانیان", label: "08:00 AM", prevShift: "شەوان" },
    { hour: 16, minute: 0, shiftName: "ئێواران", label: "04:00 PM", prevShift: "بەیانیان" },
    { hour: 0, minute: 0, shiftName: "شەوان", label: "12:00 AM", prevShift: "ئێواران" }
  ];

  function formatTime12H(hhmm) {
    if (!hhmm) return "";
    var parts = String(hhmm).trim().split(":");
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1] || "0", 10);
    if (isNaN(h)) return hhmm;
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return (h12 < 10 ? "0" + h12 : h12) + ":" + (m < 10 ? "0" + m : m) + " " + ampm;
  }

  function playShiftAlertBeep() {
    try {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      var ctx = new AudioContext();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {}
  }

  function showShiftTenMinuteWarning(targetTimeLabel, nextShiftName, prevShiftName, minutesBefore) {
    playShiftAlertBeep();
    var mins = minutesBefore || 10;
    var existing = document.getElementById("shiftDrawerWarningBanner");
    if (existing) existing.remove();

    var detailText = (prevShiftName && nextShiftName)
      ? ('شێفتی (' + prevShiftName + ') لە کاتژمێر <strong>' + targetTimeLabel + '</strong> تەواو دەبێت. تکایە سندوق بپشکنە و پارەی کاش ئامادە بکە بۆ تەسلیمکردن بە شێفتی (' + nextShiftName + ').')
      : ('شێفت لە کاتژمێر <strong>' + targetTimeLabel + '</strong> تەواو دەبێت. تکایە سندوق بپشکنە و پارەی کاش ئامادە بکە بۆ تەسلیمکردن.');

    var banner = document.createElement("div");
    banner.id = "shiftDrawerWarningBanner";
    banner.style.cssText = "position:fixed;bottom:24px;right:24px;max-width:440px;background:#0f172a;border:2px solid #f59e0b;border-radius:16px;box-shadow:0 20px 45px rgba(0,0,0,0.7);padding:18px;z-index:999999;color:#fff;animation:slideInUp 0.3s ease;";
    banner.innerHTML = 
      '<div style="display:flex;align-items:flex-start;gap:12px;">' +
      '  <div style="width:44px;height:44px;border-radius:12px;background:rgba(245,158,11,0.2);color:#f59e0b;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">' +
      '    <i class="fas fa-cash-register"></i>' +
      '  </div>' +
      '  <div style="flex:1;">' +
      '    <div style="display:flex;align-items:center;justify-content:space-between;">' +
      '      <h4 style="margin:0;font-size:0.92rem;font-weight:900;color:#fbbf24;">⚠️ ئاگاداری: تەنها ' + mins + ' خولەک ماوە بۆ کۆتایی شێفت</h4>' +
      '      <button onclick="document.getElementById(\'shiftDrawerWarningBanner\').remove()" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:1.2rem;line-height:1;">&times;</button>' +
      '    </div>' +
      '    <p style="margin:6px 0 10px 0;font-size:0.82rem;color:#e2e8f0;line-height:1.5;">' +
      '      ' + detailText +
      '    </p>' +
      '    <div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '      <button onclick="ShiftsManager.openXReportModal();document.getElementById(\'shiftDrawerWarningBanner\').remove();" class="btn btn-sm btn-info" style="font-size:0.78rem;font-weight:800;padding:6px 12px;border:none;border-radius:8px;cursor:pointer;">' +
      '        <i class="fas fa-search-dollar"></i> پشکنینی سندوق (X-Report)' +
      '      </button>' +
      '      <button onclick="ShiftsManager.openCashHandoverModal();document.getElementById(\'shiftDrawerWarningBanner\').remove();" class="btn btn-sm btn-primary" style="font-size:0.78rem;font-weight:800;padding:6px 12px;background:#10b981;border:none;border-radius:8px;cursor:pointer;">' +
      '        <i class="fas fa-hand-holding-usd"></i> تەسلیمکردنی سندوق' +
      '      </button>' +
      '    </div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(banner);

    if (typeof toast === "function") {
      toast("⚠️ ئاگاداریی سندوق", "تەنها " + mins + " خولەک ماوە بۆ کۆتایی شێفت (" + targetTimeLabel + ") - تکایە سندوق بپشکنە", "warning");
    }
  }

  function showShiftChangePrompt(targetTimeLabel, nextShiftName) {
    playShiftAlertBeep();
    var existing = document.getElementById("shiftDrawerWarningBanner");
    if (existing) existing.remove();

    var nextText = nextShiftName ? (' (' + nextShiftName + ')') : '';

    var banner = document.createElement("div");
    banner.id = "shiftDrawerWarningBanner";
    banner.style.cssText = "position:fixed;bottom:24px;right:24px;max-width:440px;background:#0f172a;border:2px solid #10b981;border-radius:16px;box-shadow:0 20px 45px rgba(0,0,0,0.7);padding:18px;z-index:999999;color:#fff;animation:slideInUp 0.3s ease;";
    banner.innerHTML = 
      '<div style="display:flex;align-items:flex-start;gap:12px;">' +
      '  <div style="width:44px;height:44px;border-radius:12px;background:rgba(16,185,129,0.2);color:#10b981;display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0;">' +
      '    <i class="fas fa-exchange-alt"></i>' +
      '  </div>' +
      '  <div style="flex:1;">' +
      '    <div style="display:flex;align-items:center;justify-content:space-between;">' +
      '      <h4 style="margin:0;font-size:0.92rem;font-weight:900;color:#34d399;">⏰ کاتی گۆڕینی سندوق و شێفت گەیشت</h4>' +
      '      <button onclick="document.getElementById(\'shiftDrawerWarningBanner\').remove()" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:1.2rem;line-height:1;">&times;</button>' +
      '    </div>' +
      '    <p style="margin:6px 0 10px 0;font-size:0.82rem;color:#e2e8f0;line-height:1.5;">' +
      '      کاتژمێر <strong>' + targetTimeLabel + '</strong> یە. دەستپێکی کاتی نوێیە' + nextText + '. تکایە سندوقەکە پشکنین و ڕادەست بکە.' +
      '    </p>' +
      '    <div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '      <button onclick="ShiftsManager.openCashHandoverModal();document.getElementById(\'shiftDrawerWarningBanner\').remove();" class="btn btn-sm btn-primary" style="font-size:0.78rem;font-weight:800;padding:6px 12px;background:#10b981;border:none;border-radius:8px;cursor:pointer;">' +
      '        <i class="fas fa-hand-holding-usd"></i> تەسلیمکردنی سندوق ئێستا' +
      '      </button>' +
      '      <button onclick="if(typeof SwitchCashier!==\'undefined\') SwitchCashier.open(false);document.getElementById(\'shiftDrawerWarningBanner\').remove();" class="btn btn-sm btn-outline" style="font-size:0.78rem;font-weight:800;padding:6px 12px;border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:8px;cursor:pointer;">' +
      '        <i class="fas fa-user-switch"></i> گۆڕینی کاشیر' +
      '      </button>' +
      '    </div>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(banner);
  }

  function checkShiftScheduleAlerts() {
    var now = new Date();
    var curH = now.getHours();
    var curM = now.getMinutes();
    var curTotal = curH * 60 + curM;
    var todayKey = now.toISOString().slice(0, 10);

    // 1) Check active cashier's personalized shift schedule
    var currentUser = null;
    try {
      if (typeof AuthService !== "undefined" && typeof AuthService.getCurrentUser === "function") {
        currentUser = AuthService.getCurrentUser();
      } else if (typeof DB !== "undefined" && DB.currentUser) {
        currentUser = DB.currentUser;
      }
    } catch (e) {}

    if (currentUser && currentUser.shiftEnd) {
      var parts = String(currentUser.shiftEnd).trim().split(":");
      var endH = parseInt(parts[0], 10);
      var endM = parseInt(parts[1] || "0", 10);
      if (!isNaN(endH) && !isNaN(endM)) {
        var endTotal = endH * 60 + endM;
        var diffM = endTotal - curTotal;
        while (diffM < -720) diffM += 1440;
        while (diffM > 720) diffM -= 1440;

        var notifyMins = parseInt(currentUser.shiftNotifyMinutes, 10);
        if (isNaN(notifyMins) || notifyMins < 1) notifyMins = 10;

        var timeLabel = formatTime12H(currentUser.shiftEnd);

        // Warning alert before shift end
        if (diffM >= (notifyMins - 1) && diffM <= (notifyMins + 1)) {
          var warnKey = "shift_warn_" + todayKey + "_" + (currentUser.id || "u") + "_" + endH + "_" + endM;
          if (!localStorage.getItem(warnKey)) {
            localStorage.setItem(warnKey, "1");
            showShiftTenMinuteWarning(timeLabel, "", "", notifyMins);
          }
        }

        // Exact Shift Handover time: within 0 to 2 minutes of shift end
        if (diffM >= 0 && diffM <= 2) {
          var exactKey = "shift_exact_" + todayKey + "_" + (currentUser.id || "u") + "_" + endH + "_" + endM;
          if (!localStorage.getItem(exactKey)) {
            localStorage.setItem(exactKey, "1");
            showShiftChangePrompt(timeLabel, "");
          }
        }
        return; // Handled active cashier's personalized schedule
      }
    }

    // 2) Fallback to default cycles (08:00, 16:00, 00:00)
    SHIFT_TRANSITIONS.forEach(function (tr) {
      var transMinutes = tr.hour * 60 + tr.minute;
      if (tr.hour === 0 && curH >= 23) {
        transMinutes = 24 * 60;
      }
      var diff = transMinutes - curTotal;

      // 10-Minute Warning: between 8 and 11 minutes prior
      if (diff >= 8 && diff <= 11) {
        var warnKey = "shift_warn_" + todayKey + "_" + tr.hour;
        if (!localStorage.getItem(warnKey)) {
          localStorage.setItem(warnKey, "1");
          showShiftTenMinuteWarning(tr.label, tr.shiftName, tr.prevShift, 10);
        }
      }

      // Exact Shift Handover time: within 0 to 2 minutes of transition
      if (diff >= 0 && diff <= 2) {
        var exactKey = "shift_exact_" + todayKey + "_" + tr.hour;
        if (!localStorage.getItem(exactKey)) {
          localStorage.setItem(exactKey, "1");
          showShiftChangePrompt(tr.label, tr.shiftName);
        }
      }
    });
  }

  function startShiftScheduleMonitor() {
    setTimeout(checkShiftScheduleAlerts, 4000);
    setInterval(checkShiftScheduleAlerts, 25000);
  }

  /* ─── PUBLIC API ─── */
  return {
    init: init,
    startShiftScheduleMonitor: startShiftScheduleMonitor,
    checkShiftScheduleAlerts: checkShiftScheduleAlerts,
    showShiftTenMinuteWarning: showShiftTenMinuteWarning,
    showShiftChangePrompt: showShiftChangePrompt,
    refreshCurrentShift: refreshCurrentShift,
    openOpenShiftModal: openOpenShiftModal,
    confirmOpenShift: confirmOpenShift,
    openCashMovementModal: openCashMovementModal,
    selectMovType: selectMovType,
    addMovAmount: addMovAmount,
    confirmCashMovement: confirmCashMovement,
    openXReportModal: openXReportModal,
    printXReport: printXReport,
    copyXReportText: copyXReportText,
    openCloseShiftModal: openCloseShiftModal,
    updateDenominationTotals: updateDenominationTotals,
    updateShiftDifferenceDisplay: updateShiftDifferenceDisplay,
    resetDenominations: resetDenominations,
    confirmCloseShift: confirmCloseShift,
    openDailyZReportModal: openDailyZReportModal,
    loadDailyReportForDate: loadDailyReportForDate,
    shareDailyReportWhatsApp: shareDailyReportWhatsApp,
    copyDailyReportText: copyDailyReportText,
    printDailyMasterZReport: printDailyMasterZReport,
    printZReportReceipt: printZReportReceipt,
    printCashMovementReceipt: printCashMovementReceipt,
    printPastShiftZReport: printPastShiftZReport,
    renderShiftsTable: renderShiftsTable,
    renderCashMovementsTable: renderCashMovementsTable,
    // Handover Engine Exports
    openCashHandoverBoard: openCashHandoverBoard,
    openCashHandoverModal: openCashHandoverModal,
    closeCashHandoverModal: closeCashHandoverModal,
    recalcHandover: recalcHandover,
    saveCashHandover: saveCashHandover,
    clearHandoverInputs: clearHandoverInputs,
    clearHandoverField: clearHandoverField,
    takeHandoverScreenshot: takeHandoverScreenshot,
    sendHandoverWhatsApp: sendHandoverWhatsApp,
    printHandoverVoucher: printHandoverVoucher,
    openPastHandoversModal: openPastHandoversModal,
    loadPastHandovers: loadPastHandovers,
    reprintHandover: reprintHandover,
    openHandoverAgreementModal: openHandoverAgreementModal,
    confirmAgreement: confirmAgreement,
    openCashierBalanceModal: openCashierBalanceModal,
    // Direct WhatsApp Image & 3-Cashier Exports
    captureAndSendHandoverScreen: captureAndSendHandoverScreen,
    openWhatsAppForImagePaste: openWhatsAppForImagePaste,
    copyCurrentImageToClipboard: copyCurrentImageToClipboard,
    downloadGeneratedImage: downloadGeneratedImage,
    selectCycleShift: selectCycleShift,
    updateCashierCyclePills: updateCashierCyclePills,
    openTransferShiftModal: openTransferShiftModal,
    recalcTransferFloats: recalcTransferFloats,
    openOpenShiftModal: openOpenShiftModal,
    openCloseShiftModal: openCloseShiftModal,
    openXReportModal: openXReportModal,
    selectShiftTab: selectShiftTab,
    confirmTransferShift: confirmTransferShift
  };
})();

// Global window helpers for inline HTML event handlers
function setOpeningCashPreset(amt) { ShiftsManager.openOpenShiftModal(); $("#openingCash").value = String(amt); }
function selectMovType(type) { ShiftsManager.selectMovType(type); }
function addMovAmount(amt) { ShiftsManager.addMovAmount(amt); }
function resetDenominations() { ShiftsManager.resetDenominations(); }
function updateDenominationTotals() { ShiftsManager.updateDenominationTotals(); }
function updateShiftDifferenceDisplay() { ShiftsManager.updateShiftDifferenceDisplay(); }
function openCashMovementModal(t) { ShiftsManager.openCashMovementModal(t); }
function openDailyZReportModal(d) { ShiftsManager.openDailyZReportModal(d); }
function loadDailyReportForDate(d) { ShiftsManager.loadDailyReportForDate(d); }
function openOpenShiftModal() { ShiftsManager.openOpenShiftModal(); }
function openCloseShiftModal() { ShiftsManager.openCloseShiftModal(); }
function openXReportModal() { ShiftsManager.openXReportModal(); }
function openCashHandoverModal() { ShiftsManager.openCashHandoverModal(); }
function closeCashHandoverModal() { ShiftsManager.closeCashHandoverModal(); }
function selectShiftTab(t) { ShiftsManager.selectShiftTab(t); }

window.openOpenShiftModal = openOpenShiftModal;
window.openCloseShiftModal = openCloseShiftModal;
window.openXReportModal = openXReportModal;
window.openCashMovementModal = openCashMovementModal;
window.openDailyZReportModal = openDailyZReportModal;
window.openCashHandoverModal = openCashHandoverModal;
window.closeCashHandoverModal = closeCashHandoverModal;
window.selectShiftTab = selectShiftTab;
