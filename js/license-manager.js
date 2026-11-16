/**
 * سام مارکێت - بەڕێوەبەری مۆڵەت و کلیلی چالاککردن (License & Activation Client)
 * Hardware-locked POS Protection & Expiry Tracker
 */

(function (window) {
  'use strict';

  var currentLicense = null;

  var LicenseManager = {
    _status: null,

    init: function () {
      var self = this;
      this.checkStatus(function (status) {
        self.applyStatus(status);
      });

      // Hook Settings navigation to refresh license card
      var settingsNavBtn = document.querySelector('[data-page="settings"]');
      if (settingsNavBtn) {
        settingsNavBtn.addEventListener('click', function () {
          self.checkStatus(function (status) {
            self.renderSettingsCard(status);
          });
        });
      }
    },

    // ─── 1. FETCH STATUS FROM SERVER ──────────────────────────
    checkStatus: function (callback) {
      var self = this;
      if (window.isPosDemoMode && window.isPosDemoMode()) {
        var demoStatus = { active: true, status: 'demo', isLifetime: true, daysLeft: 9999 };
        self._status = demoStatus;
        currentLicense = demoStatus;
        if (typeof callback === 'function') callback(demoStatus);
        return;
      }
      fetch('/api/license/status?t=' + Date.now())
        .then(function (res) { return res.json(); })
        .then(function (data) {
          self._status = data;
          currentLicense = data;
          if (typeof callback === 'function') callback(data);
        })
        .catch(function (err) {
          console.warn('License check error:', err);
          // If network failed, fallback gracefully
          if (typeof callback === 'function') callback(self._status || { active: true, status: 'offline_grace' });
        });
    },

    // ─── 2. APPLY STATUS & SHOW LOCK IF NEEDED ─────────────────
    applyStatus: function (status) {
      if (!status) return;

      var lockModal = document.getElementById('activationLockModal');
      var warningBanner = document.getElementById('licenseWarningBanner');

      if (!status.active) {
        // LOCK THE POS
        if (lockModal) {
          lockModal.classList.add('active');
          lockModal.style.display = 'flex';
        }

        var mIdEl = document.getElementById('lockMachineIdDisplay');
        if (mIdEl) mIdEl.textContent = status.machineId || 'SAM-UNKNOWN';

        var reasonEl = document.getElementById('lockReasonText');
        if (reasonEl) {
          if (status.status === 'machine_mismatch') {
            reasonEl.textContent = 'ئەم بەرنامەیە لەسەر کۆمپیوتەرێکی تر ڕێگەپێدراوە یان کۆپی کراوە. پێویستت بە کلیلی چالاککردنە تایبەت بەم کۆمپیوتەرە.';
          } else if (status.status === 'expired') {
            reasonEl.textContent = 'مۆڵەتی بەکارهێنانی ساڵانەی بەرنامەکە بەسەرچووە (' + (status.expiryDate || '') + '). تکایە پەیوەندی بە گەشەپێدەرەوە بکە بۆ نوێکردنەوە.';
          } else {
            reasonEl.textContent = 'بەرنامەکە لەسەر ئەم کۆمپیوتەرە پێویستی بە کلیلی چالاککردنە بەر لە دەستپێکردنی فرۆشتن.';
          }
        }
      } else {
        // UNLOCKED - License is valid
        if (lockModal) {
          lockModal.classList.remove('active');
          lockModal.style.display = 'none';
        }

        // Show expiring warning if <= 15 days left and not lifetime
        if (!status.isLifetime && status.daysLeft !== undefined && status.daysLeft <= 15 && status.daysLeft > 0) {
          if (warningBanner) {
            warningBanner.style.display = 'flex';
            var daysEl = document.getElementById('licenseWarningDaysText');
            if (daysEl) daysEl.textContent = status.daysLeft;
          }
        } else if (warningBanner) {
          warningBanner.style.display = 'none';
        }
      }

      this.renderSettingsCard(status);
    },

    // ─── 3. RENDER LICENSE STUDIO CARD IN SETTINGS ────────────
    renderSettingsCard: function (status) {
      if (!status) return;

      var mIdEl = document.getElementById('settingsMachineIdText');
      if (mIdEl) mIdEl.textContent = status.machineId || 'SAM-UNKNOWN';

      var badgeEl = document.getElementById('settingsLicenseBadge');
      if (badgeEl) {
        if (status.active) {
          if (status.isLifetime) {
            badgeEl.textContent = 'چالاکە (هەتاهەتایی - Lifetime)';
            badgeEl.style.background = 'rgba(16,185,129,0.2)';
            badgeEl.style.color = '#10b981';
            badgeEl.style.borderColor = '#10b981';
          } else {
            badgeEl.textContent = 'چالاکە (' + status.daysLeft + ' ڕۆژ ماوە)';
            badgeEl.style.background = 'rgba(59,130,246,0.2)';
            badgeEl.style.color = '#38bdf8';
            badgeEl.style.borderColor = '#38bdf8';
          }
        } else if (status.status === 'expired') {
          badgeEl.textContent = 'بەسەرچووە (Expired)';
          badgeEl.style.background = 'rgba(239,68,68,0.2)';
          badgeEl.style.color = '#ef4444';
          badgeEl.style.borderColor = '#ef4444';
        } else {
          badgeEl.textContent = 'مۆڵەتی پێویستە (Unlicensed)';
          badgeEl.style.background = 'rgba(245,158,11,0.2)';
          badgeEl.style.color = '#f59e0b';
          badgeEl.style.borderColor = '#f59e0b';
        }
      }

      var expEl = document.getElementById('settingsLicenseExpiryText');
      if (expEl) {
        expEl.textContent = status.isLifetime ? 'بێ بەسەرچوون (هەتاهەتایی)' : (status.expiryDate || 'دیارینەکراو');
      }

      var ownerEl = document.getElementById('settingsLicenseOwnerText');
      if (ownerEl) {
        var ownerName = status.licensedTo || '';
        if (!ownerName || /سام\s*مارکێت|sam\s*market/i.test(ownerName)) {
          ownerName = (typeof getStoreName === 'function') ? getStoreName('—') : '—';
        }
        ownerEl.textContent = ownerName;
      }
    },

    // ─── 4. COPY MACHINE ID TO CLIPBOARD ───────────────────────
    copyMachineId: function (elementId) {
      var self = this;
      var text = (this._status && this._status.machineId) || '';
      if (!text) {
        var el = document.getElementById(elementId || 'lockMachineIdDisplay');
        if (el) text = el.textContent.trim();
      }

      if (!text) return;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          self._showCopySuccess();
        }).catch(function () {
          self._fallbackCopy(text);
        });
      } else {
        self._fallbackCopy(text);
      }
    },

    _fallbackCopy: function (text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        this._showCopySuccess();
      } catch (e) {
        alert('کۆدی کۆمپیوتەرەکە: ' + text);
      }
      document.body.removeChild(ta);
    },

    _showCopySuccess: function () {
      if (typeof toast === 'function') {
        toast('کۆپی کرا', 'ناسێنەری کۆمپیوتەر کۆپی کرا بۆ کلیپبۆرد!', 'success');
      } else {
        alert('ناسێنەری کۆمپیوتەر کۆپی کرا: ' + (this._status && this._status.machineId));
      }
    },

    // ─── 5. SEND TO WHATSAPP ──────────────────────────────────
    sendToWhatsApp: function () {
      var mId = (this._status && this._status.machineId) || '';
      var msg = 'سڵاو کاکە، داوای کلیلی چالاککردنی بەرنامەی Smart-Serve POS دەکەم بۆ کۆمپیوتەرەکەم:\nناسێنەری کۆمپیوتەر (Machine ID):\n' + mId;
      var url = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(msg);
      window.open(url, '_blank');
    },

    // ─── 6. ACTIVATE LICENSE KEY ──────────────────────────────
    submitActivation: function (inputId, statusBoxId, confirmBtnId) {
      var self = this;
      var input = document.getElementById(inputId || 'lockActivationKeyInput');
      var key = input ? input.value.trim().toUpperCase() : '';

      var statusBox = document.getElementById(statusBoxId || 'lockStatusBox');
      var confirmBtn = document.getElementById(confirmBtnId || 'lockActivateBtn');

      if (!key) {
        if (statusBox) {
          statusBox.style.display = 'block';
          statusBox.style.background = 'rgba(239,68,68,0.2)';
          statusBox.style.color = '#ef4444';
          statusBox.innerHTML = '<i class="fas fa-exclamation-circle"></i> تکایە کلیلی چالاککردن بنووسە یان پێستی بکە';
        }
        return;
      }

      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> پشکنین دەکرێت...';
      }

      fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key })
      })
        .then(function (res) { return res.json(); })
        .then(function (result) {
          if (result && result.success) {
            if (statusBox) {
              statusBox.style.display = 'block';
              statusBox.style.background = 'rgba(16,185,129,0.2)';
              statusBox.style.color = '#10b981';
              statusBox.innerHTML = '<strong><i class="fas fa-check-circle"></i> پیرۆزە!</strong> ' + result.message + ' سیستەم دەستبەجێ دەکرێتەوە...';
            }
            if (confirmBtn) {
              confirmBtn.innerHTML = '<i class="fas fa-check"></i> چالاک کرا!';
              confirmBtn.style.background = '#10b981';
            }
            if (typeof toast === 'function') {
              toast('سەرکەوتوو', 'بەرنامەکە بە سەرکەوتوویی چالاک کرا!', 'success');
            }
            setTimeout(function () {
              window.location.reload();
            }, 1400);
          } else {
            throw new Error((result && result.error) || 'کلیلەکە نادروستە');
          }
        })
        .catch(function (err) {
          if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.style.background = 'rgba(239,68,68,0.2)';
            statusBox.style.color = '#ef4444';
            statusBox.innerHTML = '<i class="fas fa-times-circle"></i> ' + err.message;
          }
          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-key"></i> چالاککردنی بەرنامە';
          }
          if (typeof toast === 'function') {
            toast('هەڵە لە چالاککردن', err.message, 'error');
          }
        });
    },

    // ─── 6b. OWNER / DEVELOPER UNLOCK (open without an activation key) ───
    ownerUnlock: function () {
      var self = this;
      var emailEl = document.getElementById('ownerUnlockEmail');
      var passEl = document.getElementById('ownerUnlockPass');
      var btn = document.getElementById('ownerUnlockBtn');
      var statusBox = document.getElementById('lockStatusBox');

      var email = emailEl ? emailEl.value.trim() : '';
      var password = passEl ? passEl.value.trim() : '';

      if (!email || !password) {
        if (statusBox) {
          statusBox.style.display = 'block';
          statusBox.style.background = 'rgba(239,68,68,0.2)';
          statusBox.style.color = '#ef4444';
          statusBox.innerHTML = '<i class="fas fa-exclamation-circle"></i> تکایە ئیمەیڵ و وشەی نهێنی بنووسە';
        }
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> پشکنین دەکرێت...';
      }

      fetch('/api/license/developer-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password, durationMonths: 'LIFETIME', marketName: (typeof getStoreName === 'function' ? getStoreName('') : '') })
      })
        .then(function (res) { return res.json(); })
        .then(function (result) {
          if (result && (result.success || result.ok)) {
            if (statusBox) {
              statusBox.style.display = 'block';
              statusBox.style.background = 'rgba(16,185,129,0.2)';
              statusBox.style.color = '#10b981';
              statusBox.innerHTML = '<strong><i class="fas fa-check-circle"></i> بەخێربێیت!</strong> بەرنامەکە کرایەوە. دەستبەجێ نوێ دەبێتەوە...';
            }
            if (btn) {
              btn.innerHTML = '<i class="fas fa-check"></i> کرایەوە!';
              btn.style.background = '#10b981';
            }
            if (typeof toast === 'function') toast('سەرکەوتوو', 'بەرنامەکە بۆ ئەم کۆمپیوتەرە کرایەوە!', 'success');
            setTimeout(function () { window.location.reload(); }, 1300);
          } else {
            throw new Error((result && result.error) || 'ئیمەیڵ یان وشەی نهێنی نادروستە');
          }
        })
        .catch(function (err) {
          if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.style.background = 'rgba(239,68,68,0.2)';
            statusBox.style.color = '#ef4444';
            statusBox.innerHTML = '<i class="fas fa-times-circle"></i> ' + (err && err.message ? err.message : 'هەڵە لە چوونەژوورەوە');
          }
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-unlock" style="margin-left:6px;"></i> کردنەوەی بەرنامە (Open System)';
          }
          if (typeof toast === 'function') toast('هەڵە', (err && err.message) || 'چوونەژوورەوە سەرکەوتوو نەبوو', 'error');
        });
    },

    // ─── 7. OPEN RENEWAL MODAL IN SETTINGS ─────────────────────
    openRenewModal: function () {
      var modal = document.getElementById('activationRenewModal');
      if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
      }
      var mIdEl = document.getElementById('renewMachineIdDisplay');
      if (mIdEl) mIdEl.textContent = (this._status && this._status.machineId) || '';
    },

    closeRenewModal: function () {
      var modal = document.getElementById('activationRenewModal');
      if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
      }
    }
  };

  // Expose globally
  window.LicenseManager = LicenseManager;

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { LicenseManager.init(); });
  } else {
    LicenseManager.init();
  }

})(window);
