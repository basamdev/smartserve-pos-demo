/**
 * سام مارکێت - حاسیبەی خێرای دۆلار و گەڕاندنەوەی دینار
 * USD Floating Exchange & Smart Change Engine
 */

(function (window) {
  'use strict';

  var UsdExchangeEngine = {
    _mode: 'iqd', // 'iqd' or 'usd'
    _lastCurrency: 'IQD',
    _lastUsdAmount: 0,

    init: function () {
      var self = this;
      this.refreshRateUI();

      // Keyboard shortcut: Alt+D to open USD Exchange Rate modal
      window.addEventListener('keydown', function (e) {
        if (e.altKey && (e.key === 'd' || e.key === 'D' || e.key === 'ی')) {
          e.preventDefault();
          self.openRateModal();
        }
      });
    },

    // ─── 1. SMART EXCHANGE RATE PARSER & ACCESSORS ──────────
    westernDigits: function (s) {
      return String(s || "")
        .replace(/[٠-٩]/g, function (d) { return "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(d)]; })
        .replace(/[۰-۹]/g, function (d) { return "0123456789"["۰۱۲۳۴۵۶۷۸۹".indexOf(d)]; });
    },

    // Iraqi shop style for 100$: 168.000 / 168.500 / 167.750 / 168.250
    formatIraqi100: function (rate100) {
      var n = Math.round(Number(rate100) || 0);
      if (n <= 0) return "";
      var whole = Math.floor(n / 1000);
      var frac = String(n % 1000);
      while (frac.length < 3) frac = "0" + frac;
      return whole + "." + frac;
    },

    normalizeRateInput: function (input) {
      if (input === null || input === undefined) return null;
      var raw = this.westernDigits(String(input)).trim()
        .replace(/[٫]/g, ".")
        .replace(/[٬،]/g, ",");
      if (!raw) return null;

      // 168.500 / 167.750 / 168.250 / 168,500 → 168500 / 167750 / 168250
      var iraqi = raw.match(/^(\d{2,3})[.,](\d{1,3})$/);
      if (iraqi) {
        var frac = iraqi[2];
        while (frac.length < 3) frac += "0";
        var dotted = parseInt(iraqi[1], 10) * 1000 + parseInt(frac, 10);
        if (dotted >= 50000 && dotted <= 500000) return dotted;
      }

      var cleaned = raw.replace(/[,\s]/g, "");
      var val = parseFloat(cleaned);
      if (isNaN(val) || val <= 0) return null;

      // 168 or 168.5 → 168,000 / 168,500 IQD per 100$
      if (val >= 50 && val < 1000) {
        return Math.round(val * 1000);
      }
      // 1685 → 1$ = 1685 (100$ = 168,500)
      if (val >= 1000 && val < 10000) {
        return Math.round(val * 100);
      }
      // 168000 / 168500 / 167750
      if (val >= 50000 && val <= 500000) {
        return Math.round(val);
      }
      return null;
    },

    readStoredPerDollar: function () {
      try {
        var localVal = localStorage.getItem("pos_usd_rate");
        if (localVal) {
          var lr = parseFloat(localVal);
          if (!isNaN(lr) && lr > 100) return lr > 10000 ? (lr / 100) : lr;
        }
      } catch (e) {}
      if (typeof DB !== "undefined" && DB.settings && DB.settings.usdRate) {
        var r = parseFloat(DB.settings.usdRate);
        if (!isNaN(r) && r > 100) return r > 10000 ? (r / 100) : r;
      }
      return 1530;
    },

    get100Rate: function () {
      try {
        var stored100 = localStorage.getItem("pos_usd_rate_100");
        if (stored100) {
          var n100 = parseFloat(stored100);
          if (!isNaN(n100) && n100 >= 50000) return Math.round(n100);
        }
      } catch (e0) {}
      if (typeof DB !== "undefined" && DB.settings && DB.settings.usdRate100) {
        var d100 = parseFloat(DB.settings.usdRate100);
        if (!isNaN(d100) && d100 >= 50000) return Math.round(d100);
      }
      return Math.round(this.readStoredPerDollar() * 100);
    },

    getRate: function () {
      return this.get100Rate() / 100;
    },

    persistRate: function (rate100) {
      var ratePerDollar = rate100 / 100;
      try {
        localStorage.setItem("pos_usd_rate", String(ratePerDollar));
        localStorage.setItem("pos_usd_rate_100", String(rate100));
      } catch (err) {}
      if (typeof DB !== "undefined") {
        if (!DB.settings) DB.settings = {};
        DB.settings.usdRate = String(ratePerDollar);
        DB.settings.usdRate100 = String(rate100);
        if (typeof DataStore !== "undefined" && typeof DataStore.saveSettings === "function") {
          DataStore.saveSettings();
        }
      }
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdRate: String(ratePerDollar), usdRate100: String(rate100) })
      }).catch(function () {});
    },

    refreshRateUI: function () {
      var rate100 = this.get100Rate();
      var formatted100 = rate100.toLocaleString("en-US");
      var iraqi = this.formatIraqi100(rate100);

      var liveEl = document.getElementById("posLiveUsdRateDisplay");
      if (liveEl) liveEl.textContent = formatted100;

      var headerEl = document.getElementById("headerUsdRateText");
      if (headerEl) headerEl.textContent = formatted100;

      var modalInput = document.getElementById("usdRateModalInput");
      if (modalInput && document.activeElement !== modalInput) modalInput.value = iraqi;

      var previewEl = document.getElementById("usdRateModalPreview");
      if (previewEl) previewEl.textContent = "100$ = " + formatted100 + " د.ع";

      // Update USD buttons subtext if present
      var note100Sub = document.getElementById('usdNote100Sub');
      if (note100Sub) note100Sub.textContent = (rate100).toLocaleString('en-US') + ' د.ع';

      var note50Sub = document.getElementById('usdNote50Sub');
      if (note50Sub) note50Sub.textContent = Math.round(rate100 / 2).toLocaleString('en-US') + ' د.ع';

      var note25Sub = document.getElementById('usdNote25Sub');
      if (note25Sub) note25Sub.textContent = Math.round(rate100 / 4).toLocaleString('en-US') + ' د.ع';

      var note10Sub = document.getElementById('usdNote10Sub');
      if (note10Sub) note10Sub.textContent = Math.round(rate100 / 10).toLocaleString('en-US') + ' د.ع';

      var note5Sub = document.getElementById('usdNote5Sub');
      if (note5Sub) note5Sub.textContent = Math.round(rate100 / 20).toLocaleString('en-US') + ' د.ع';
    },

    // ─── 2. SAVE RATE LIVE (PERMANENTLY KEEPS WHATEVER RATE USER PUTS) ─
    saveRate: function (rawInput) {
      var self = this;
      var rate100 = self.normalizeRateInput(rawInput);
      if (!rate100) {
        if (typeof toast === "function") {
          toast("هەڵە لە نرخ", "بنووسە: 168 یان 168.500 یان 167.750 یان 168.250", "error");
        } else {
          alert("تکایە نرخێکی دروست بنووسە (بۆ نموونە: 168.500)");
        }
        return false;
      }

      var ratePerDollar = rate100 / 100;
      self.persistRate(rate100);

      self.refreshRateUI();
      self.closeRateModal();

      // Recalculate return change on current cart if cash received was USD
      if (self._lastCurrency === 'USD' && self._lastUsdAmount > 0) {
        self.applyUsd(self._lastUsdAmount, true);
      } else if (typeof updateCashReturnDisplay === 'function') {
        updateCashReturnDisplay();
      }

      // Update cart USD total preview
      if (typeof updateCartSummary === 'function') {
        try { updateCartSummary(); } catch (err) {}
      }

      if (typeof toast === 'function') {
        toast('نرخی دۆلار نوێکرایەوە', '100$ = ' + rate100.toLocaleString('en-US') + ' دینار (1$ = ' + ratePerDollar.toLocaleString('en-US') + ' د.ع)', 'success');
      }
      return true;
    },

    previewRateInput: function (raw) {
      var previewEl = document.getElementById("usdRateModalPreview");
      if (!previewEl) return;
      var rate100 = this.normalizeRateInput(raw);
      if (!rate100) {
        previewEl.textContent = "نموونە: 168.000  ·  168.500  ·  167.750  ·  168.250";
        previewEl.style.color = "";
        return;
      }
      previewEl.textContent = "100$ = " + rate100.toLocaleString("en-US") + " د.ع";
      previewEl.style.color = "#10b981";
    },

    // ─── 2.1 QUICK 1-TAP INLINE PROMPT (INSTANT 1-SECOND RATE EDIT) ─
    quickPromptRate: function () {
      var self = this;
      var currentShorthand = self.formatIraqi100(self.get100Rate());
      var input = prompt(
        "نرخی نوێی ١٠٠ دۆلار بنووسە:\n(بۆ نموونە: 168.000  |  168.500  |  167.750  |  168.250)",
        currentShorthand
      );
      if (input !== null && input.trim() !== '') {
        self.saveRate(input.trim());
      }
    },

    // ─── 3. SWITCH BETWEEN IQD & USD MODES ────────────────────
    switchMode: function (mode) {
      this._mode = mode;
      var self = this;

      var tabIqd = document.getElementById('btnCurModeIqd');
      var tabUsd = document.getElementById('btnCurModeUsd');
      var gridIqd = document.getElementById('posBanknotesGridIqd');
      var gridUsd = document.getElementById('posBanknotesGridUsd');

      if (mode === 'usd') {
        if (tabIqd) tabIqd.classList.remove('active');
        if (tabUsd) tabUsd.classList.add('active');
        if (gridIqd) gridIqd.style.display = 'none';
        if (gridUsd) gridUsd.style.display = 'grid';
      } else {
        if (tabIqd) tabIqd.classList.add('active');
        if (tabUsd) tabUsd.classList.remove('active');
        if (gridIqd) gridIqd.style.display = 'grid';
        if (gridUsd) gridUsd.style.display = 'none';
      }
    },

    // ─── 4. APPLY USD BANKNOTE ($100, $50, $25, $10, $5) ──────
    applyUsd: function (dollars, isSilent) {
      var self = this;
      var d = parseFloat(dollars) || 0;
      if (d <= 0) return;

      var rate = this.getRate();
      var iqdEquivalent = Math.round(d * rate);

      this._lastCurrency = 'USD';
      this._lastUsdAmount = (this._lastUsdAmount || 0) + d;

      // Accumulate into existing POS cash received (e.g. 50K IQD + $100 USD = 203,000 IQD)
      var currentReceived = 0;
      try {
        if (typeof POS_CASH_RECEIVED !== 'undefined') currentReceived = Number(POS_CASH_RECEIVED) || 0;
        else if (window.POS_CASH_RECEIVED) currentReceived = Number(window.POS_CASH_RECEIVED) || 0;
      } catch (e) {}

      var newTotalReceived = currentReceived + iqdEquivalent;

      // Update global POS received state
      try {
        window.POS_CASH_RECEIVED = newTotalReceived;
        window.LAST_CASH_NOTE = iqdEquivalent;
      } catch (e) {}
      try {
        if (typeof POS_CASH_RECEIVED !== 'undefined') {
          POS_CASH_RECEIVED = newTotalReceived;
        }
        if (typeof LAST_CASH_NOTE !== 'undefined') {
          LAST_CASH_NOTE = iqdEquivalent;
        }
      } catch (e) {}

      if (!isSilent && typeof PosAudio !== 'undefined' && typeof PosAudio.playCashChime === 'function') {
        PosAudio.playCashChime();
      }

      // Calculate change
      var totals = (typeof getCartTotals === 'function') ? getCartTotals() : { grandTotal: 0 };
      var grandTotal = totals.grandTotal || 0;
      var diff = newTotalReceived - grandTotal;

      // Update Received Display
      var receivedEl = document.getElementById('posCashReceivedDisplay');
      if (receivedEl) {
        if (this._lastUsdAmount > 0 && newTotalReceived > iqdEquivalent) {
          receivedEl.innerHTML = '<span style="color:#10b981;font-weight:900;">$' + this._lastUsdAmount + ' USD</span> (' + (typeof fmt === 'function' ? fmt(newTotalReceived) : (newTotalReceived.toLocaleString('en-US') + ' د.ع')) + ')';
        } else {
          receivedEl.innerHTML = '<span style="color:#10b981;font-weight:900;">$' + d + ' USD</span> (' + (typeof fmt === 'function' ? fmt(iqdEquivalent) : (iqdEquivalent.toLocaleString('en-US') + ' د.ع')) + ')';
        }
      }

      // Update Change Display
      var changeEl = document.getElementById('posCashChangeDisplay');
      var changeCard = document.getElementById('posCashChangeCard');
      var statusPill = document.getElementById('posChangeStatusPill');
      var changeLabel = document.getElementById('posCashChangeLabel');
      var breakdownEl = document.getElementById('posChangeBreakdownText');

      if (changeEl) {
        if (diff > 0) {
          changeEl.textContent = (typeof fmt === 'function') ? fmt(diff) : (diff.toLocaleString('en-US') + ' د.ع');
          if (changeLabel) changeLabel.innerHTML = '<i class="fas fa-hand-holding-dollar" style="color:#10b981;"></i> پارەی گەڕاوە بە دینار (بدەرەوە):';
          if (statusPill) {
            statusPill.textContent = 'گەڕاوە بە دینار';
            statusPill.style.background = '#10b981';
          }
          if (changeCard) {
            changeCard.classList.remove('is-underpaid');
            changeCard.classList.add('is-positive-change');
          }

          // Suggest breakdown of banknotes
          var breakdown = self.calculateChangeBreakdown(diff);
          if (breakdownEl) {
            breakdownEl.style.display = 'block';
            breakdownEl.innerHTML = '<i class="fas fa-lightbulb" style="color:#f59e0b;"></i> ' + breakdown;
          }
        } else if (diff === 0) {
          changeEl.textContent = '0 د.ع (تەواوە)';
          if (changeLabel) changeLabel.innerHTML = '<i class="fas fa-check-double"></i> پارەی تەواو';
          if (statusPill) statusPill.textContent = 'تەواوە';
          if (breakdownEl) breakdownEl.style.display = 'none';
        } else {
          var needed = Math.abs(diff);
          changeEl.textContent = '-' + ((typeof fmt === 'function') ? fmt(needed) : (needed.toLocaleString('en-US') + ' د.ع'));
          if (changeLabel) changeLabel.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:#ef4444;"></i> هێشتا ماویەتی:';
          if (statusPill) {
            statusPill.textContent = 'کەمە: ' + ((typeof fmt === 'function') ? fmt(needed) : needed);
            statusPill.style.background = '#ef4444';
          }
          if (breakdownEl) breakdownEl.style.display = 'none';
        }
      }

      // Sync customer display
      if (typeof SupermarketEngine !== 'undefined' && typeof SupermarketEngine.syncCashDisplay === 'function') {
        SupermarketEngine.syncCashDisplay(iqdEquivalent, Math.max(0, diff));
      }

      if (!isSilent && typeof toast === 'function') {
        var diffText = diff >= 0
          ? ('گەڕاوە بۆ کڕیار: ' + (typeof fmt === 'function' ? fmt(diff) : (diff.toLocaleString('en-US') + ' د.ع')))
          : ('هێشتا ماویەتی: ' + (typeof fmt === 'function' ? fmt(Math.abs(diff)) : Math.abs(diff)));
        toast('وەرگیراو: $' + d + ' (' + (typeof fmt === 'function' ? fmt(iqdEquivalent) : iqdEquivalent) + ')', diffText, diff >= 0 ? 'success' : 'warning');
      }
    },

    // ─── 5. PROMPT CUSTOM USD AMOUNT ──────────────────────────
    promptCustomUsd: function () {
      var self = this;
      var inputVal = prompt('بڕی دۆلاری وەرگیراو بنووسە ($):', '20');
      if (inputVal === null) return;
      var d = parseFloat(inputVal);
      if (isNaN(d) || d <= 0) {
        if (typeof toast === 'function') toast('هەڵە', 'ژمارەی نادروست', 'error');
        return;
      }
      self.applyUsd(d);
    },

    // ─── 6. SMART CASH DENOMINATION BREAKDOWN ──────────────────
    getChangeBreakdownDetails: function (changeAmount) {
      var rem = Math.max(0, Math.round(Number(changeAmount) || 0));
      var original = rem;
      var parts = [];
      var denoms = [
        { name: '٥٠ هەزاری', short: '٥٠,٠٠٠', val: 50000 },
        { name: '٢٥ هەزاری', short: '٢٥,٠٠٠', val: 25000 },
        { name: '١٠ هەزاری', short: '١٠,٠٠٠', val: 10000 },
        { name: '٥ هەزاری', short: '٥,٠٠٠', val: 5000 },
        { name: 'هەزاری', short: '١,٠٠٠', val: 1000 },
        { name: '٥٠٠ دینار', short: '٥٠٠', val: 500 },
        { name: '٢٥٠ دینار', short: '٢٥٠', val: 250 }
      ];
      for (var i = 0; i < denoms.length; i++) {
        var d = denoms[i];
        if (rem >= d.val) {
          var count = Math.floor(rem / d.val);
          rem = rem % d.val;
          parts.push({ name: d.name, short: d.short, val: d.val, count: count });
        }
      }
      var labels = parts.map(function (p) { return p.count + ' دانە ' + p.name; });
      if (rem > 0) labels.push(rem + ' د.ع');
      var text = labels.length ? ('پارەی گەڕاوە لە سندوق: ' + labels.join(' + ')) : 'پارەی تەواو';
      return { change: original, remainder: rem, parts: parts, text: text };
    },

    calculateChangeBreakdown: function (changeAmount) {
      return this.getChangeBreakdownDetails(changeAmount).text;
    },

    // ─── 7. MODAL CONTROLS ────────────────────────────────────
    openRateModal: function () {
      this.refreshRateUI();
      var modal = document.getElementById('usdRateModal');
      if (modal) {
        if (modal.classList) modal.classList.add('active');
        modal.style.display = 'flex';
        var inp = document.getElementById('usdRateModalInput');
        if (inp) {
          setTimeout(function () {
            try {
              inp.focus();
              inp.select();
            } catch (err) {}
          }, 80);
        }
      }
    },

    closeRateModal: function () {
      var modal = document.getElementById('usdRateModal');
      if (modal) {
        if (modal.classList) modal.classList.remove('active');
        modal.style.display = 'none';
      }
    },

    getLastPaidCurrency: function () {
      return this._lastCurrency;
    },

    getLastPaidUsd: function () {
      return this._lastUsdAmount;
    },

    resetPaymentState: function () {
      this._lastCurrency = 'IQD';
      this._lastUsdAmount = 0;
      var breakdownEl = document.getElementById('posChangeBreakdownText');
      if (breakdownEl) breakdownEl.style.display = 'none';
    }
  };

  // Expose globally
  window.UsdExchangeEngine = UsdExchangeEngine;

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { UsdExchangeEngine.init(); });
  } else {
    UsdExchangeEngine.init();
  }

})(window);
