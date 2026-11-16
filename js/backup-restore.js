/**
 * سام مارکێت - سیستەمی یەک-کلیک بۆ داگرتن و گەڕاندنەوەی داتابەیس
 * 1-Click Database Backup & Restore to File (SQLite .db & JSON)
 */

(function (window) {
  'use strict';

  function getApiBase() {
    if (window.isPosDemoMode && window.isPosDemoMode()) return '';
    if (typeof ApiClient !== 'undefined' && typeof ApiClient.getBaseUrl === 'function') {
      return ApiClient.getBaseUrl();
    }
    if (window.location && window.location.protocol === 'file:') return 'http://localhost:3005';
    if (window.location && window.location.origin && window.location.origin.indexOf('http') === 0) {
      return window.location.origin;
    }
    return 'http://localhost:3005';
  }

  function screenShopCounts() {
    return {
      products: (typeof DB !== 'undefined' && DB.products) ? DB.products.length : 0,
      orders: (typeof DB !== 'undefined' && DB.orders) ? DB.orders.length : 0
    };
  }

  function paintStats(products, orders, users, sizeMb) {
    var prodEl = document.getElementById('dbProdCountText');
    var orderEl = document.getElementById('dbOrderCountText');
    var userEl = document.getElementById('dbUserCountText');
    var sizeEl = document.getElementById('dbSizeText');
    if (prodEl) prodEl.textContent = String(products == null ? '—' : products);
    if (orderEl) orderEl.textContent = String(orders == null ? '—' : orders);
    if (userEl && users != null) userEl.textContent = String(users);
    if (sizeEl && sizeMb) sizeEl.textContent = sizeMb;
  }

  function fileToBase64(bytes) {
    var binary = '';
    var len = bytes.byteLength;
    var chunkSize = 32768;
    for (var i = 0; i < len; i += chunkSize) {
      var end = Math.min(i + chunkSize, len);
      binary += String.fromCharCode.apply(null, bytes.subarray(i, end));
    }
    return btoa(binary);
  }

  var BackupRestore = {
    _pendingFile: null,
    _pendingBytes: null,
    _inspect: null,

    init: function () {
      var self = this;
      // Auto-refresh stats when Settings page is visited
      var settingsNavBtn = document.querySelector('[data-page="settings"]');
      if (settingsNavBtn) {
        settingsNavBtn.addEventListener('click', function () {
          setTimeout(function () { self.refreshDbStats(); }, 200);
        });
      }
      // Initial stats fetch after app boots
      setTimeout(function () {
        self.refreshDbStats();
      }, 1000);
    },

    // ─── 1. DOWNLOAD BACKUP FILE (.db) ─────────────────────────
    downloadBackupFile: function () {
      try {
        var screen = screenShopCounts();
        if (typeof toast === 'function') {
          toast('داگرتنی باکئەپ', 'ئامادەکردنی فایلی داتابەیسی مارکێت...', 'info');
        }

        var now = new Date();
        var dateStr = now.toISOString().slice(0, 10);
        var timeStr = String(now.getHours()).padStart(2, '0') + '-' + String(now.getMinutes()).padStart(2, '0');

        function triggerApiDownload(count) {
          var defaultFilename = 'market_backup_' + dateStr + '_' + timeStr + '_' + count + 'p.db';
          var a = document.createElement('a');
          a.href = getApiBase() + '/api/backup/download?t=' + Date.now();
          a.download = defaultFilename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          if (typeof logActivity === 'function') {
            logActivity('backup', 'Database backup downloaded: ' + defaultFilename);
          }
          setTimeout(function () {
            if (typeof toast === 'function') {
              toast('سەرکەوتوو', 'باکئەپی مارکێت پاشەکەوت کرا: ' + count + ' کاڵا', 'success');
            }
            BackupRestore.refreshDbStats();
          }, 800);
        }

        function triggerScreenDownload(count) {
          if (typeof DataStore !== 'undefined' && typeof DataStore.exportSqliteBackup === 'function') {
            DataStore.exportSqliteBackup();
          } else if (typeof DataStore !== 'undefined' && typeof DataStore.exportJsonBackup === 'function') {
            var data = DataStore.exportJsonBackup({});
            var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'market_backup_' + dateStr + '_' + timeStr + '_' + count + 'p.json';
            a.click();
          }
          if (typeof toast === 'function') {
            toast('سەرکەوتوو', 'باکئەپ لە شاشەی مارکێت پاشەکەوت کرا: ' + count + ' کاڵا', 'success');
          }
        }

        fetch(getApiBase() + '/api/backup/info')
          .then(function (r) { return r.json(); })
          .then(function (info) {
            var apiCount = info && info.counts ? (info.counts.products || 0) : 0;
            var count = Math.max(apiCount, screen.products);
            if (count <= 0) {
              if (typeof toast === 'function') {
                toast('باکئەپ پاشەکەوت نەکرا', 'هیچ کاڵایەک لە مارکێت نییە بۆ پاشەکەوتکردن', 'warning');
              }
              return;
            }
            if (apiCount > 0) triggerApiDownload(apiCount);
            else triggerScreenDownload(screen.products);
          })
          .catch(function () {
            if (screen.products > 0) triggerScreenDownload(screen.products);
            else if (typeof toast === 'function') {
              toast('هەڵە', 'نەتوانرا باکئەپ پاشەکەوت بکرێت', 'error');
            }
          });
      } catch (err) {
        console.error('Backup download error:', err);
        if (typeof toast === 'function') {
          toast('هەڵە', 'کێشەیەک ڕوویدا لە داگرتنی باکئەپ: ' + err.message, 'error');
        }
      }
    },

    // ─── 2. CREATE SERVER-SIDE SNAPSHOT ────────────────────────
    createSnapshot: function () {
      if (typeof toast === 'function') {
        toast('پاراستن', 'دروستکردنی کۆپییەکی پارێزراوی داتابەیس لەسەر سێرڤەر...', 'info');
      }

      fetch(getApiBase() + '/api/backup/snapshot', { method: 'POST' })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.success) {
            if (typeof toast === 'function') {
              toast('سەرکەوتوو', 'کۆپی پارێزراو دروستکرا: ' + (data.filename || ''), 'success');
            }
            BackupRestore.refreshDbStats();
          } else {
            throw new Error((data && data.error) || 'شکست لە دروستکردنی کۆپی پارێزراو');
          }
        })
        .catch(function (err) {
          if (typeof toast === 'function') {
            toast('هەڵە', err.message, 'error');
          }
        });
    },

    // ─── 3. TRIGGER RESTORE FILE SELECTOR ──────────────────────
    triggerRestore: function () {
      var input = document.getElementById('dbRestoreFileInput');
      if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'dbRestoreFileInput';
        input.accept = '.db,.sqlite,.json,.xlsx,.xls,.csv';
        input.style.display = 'none';
        input.addEventListener('change', function (e) {
          BackupRestore.handleFileSelect(e);
        });
        document.body.appendChild(input);
      }
      input.value = '';
      input.click();
    },

    // ─── 4. HANDLE FILE SELECTION & SHOW CONFIRM MODAL ─────────
    handleFileSelect: function (e) {
      var self = this;
      var file = e.target && e.target.files && e.target.files[0];
      if (!file) return;

      var name = file.name || '';
      var ext = name.split('.').pop().toLowerCase();
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        if (typeof toast === 'function') {
          toast('ئێکسل تەنها کاڵایە', 'ئێکسل داهات و فرۆشتن ناهێنێت. بۆ هەموو شت لە لاپ‌تۆپی مارکێت دوگمەی «کۆپی هەموو مارکێت بۆ فلاش» لێدە.', 'warning');
        }
        if (typeof ExcelImporter !== 'undefined') {
          if (typeof ExcelImporter.openModal === 'function') ExcelImporter.openModal();
          if (typeof ExcelImporter.handleFile === 'function') ExcelImporter.handleFile(file);
        } else if (typeof openExcelImportModal === 'function') {
          openExcelImportModal();
        }
        return;
      }
      if (['db', 'sqlite', 'json'].indexOf(ext) === -1) {
        if (typeof toast === 'function') {
          toast('فایلی نادروست', 'بۆ هەموو مارکێت (داهات+فرۆشتن+کاڵا) فایلێکی .db هەڵبژێرە. ئێکسل تەنها کاڵایە.', 'warning');
        }
        return;
      }

      this._pendingFile = file;
      this._pendingBytes = null;
      this._inspect = null;

      // Format size
      var sizeKb = (file.size / 1024).toFixed(1);
      var sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      var displaySize = file.size > (1024 * 1024) ? (sizeMb + ' MB') : (sizeKb + ' KB');

      // Populate Modal Fields
      var nameEl = document.getElementById('restoreModalFileName');
      if (nameEl) nameEl.textContent = file.name;

      var sizeEl = document.getElementById('restoreModalFileSize');
      if (sizeEl) sizeEl.textContent = displaySize;

      var dateEl = document.getElementById('restoreModalFileDate');
      if (dateEl) {
        var dt = file.lastModified ? new Date(file.lastModified) : new Date();
        dateEl.textContent = (typeof formatSaleDateTime === 'function') ? formatSaleDateTime(dt) : (dt.toLocaleDateString('en-GB') + ' ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
      }

      var badgeEl = document.getElementById('restoreModalFormatBadge');
      if (badgeEl) {
        if (ext === 'db' || ext === 'sqlite') {
          badgeEl.textContent = 'SQLite Database (.db)';
          badgeEl.style.background = 'rgba(16,185,129,0.2)';
          badgeEl.style.color = '#10b981';
          badgeEl.style.borderColor = '#10b981';
        } else {
          badgeEl.textContent = 'JSON Export (.json)';
          badgeEl.style.background = 'rgba(59,130,246,0.2)';
          badgeEl.style.color = '#3b82f6';
          badgeEl.style.borderColor = '#3b82f6';
        }
      }

      // Reset modal state
      var statusBox = document.getElementById('restoreModalStatusBox');
      if (statusBox) statusBox.style.display = 'none';

      var confirmBtn = document.getElementById('restoreModalConfirmBtn');
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fas fa-history"></i> دڵنیام، ئێستا داتابەیس بگەڕێنەوە (Restore Now)';
      }

      var countsEl = document.getElementById('restoreModalFileCounts');
      if (countsEl) countsEl.textContent = 'پشکنینی فایل...';

      var modal = document.getElementById('dbRestoreModal');
      if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
      }

      if (ext === 'db' || ext === 'sqlite') {
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            var bytes = new Uint8Array(ev.target.result);
            self._pendingBytes = bytes;
            fetch(getApiBase() + '/api/backup/inspect', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ base64Data: fileToBase64(bytes) })
            })
              .then(function (r) { return r.json(); })
              .then(function (info) {
                self._inspect = info || {};
                var c = (info && info.counts) || {};
                var live = (info && info.liveCounts) || {};
                if (countsEl) {
                  countsEl.innerHTML = 'لەم فایلە: <strong>' + (c.products || 0) + '</strong> کاڵا، <strong>' + (c.orders || 0) + '</strong> پسوڵە' +
                    (live.products ? ' — ئێستا لە دوکان: <strong>' + live.products + '</strong> کاڵا' : '');
                }
                if (info && info.wouldWipeShop) {
                  if (countsEl) {
                    countsEl.innerHTML = '<span style="color:#fca5a5;font-weight:800;">ئەم فایلە بەتاڵە (٠ کاڵا). گەڕاندنەوەی داتای مارکێت دەسڕێتەوە — مەیکە.</span>';
                  }
                  if (confirmBtn) {
                    confirmBtn.disabled = true;
                    confirmBtn.innerHTML = '<i class="fas fa-ban"></i> باکئەپی بەتاڵ — ناتوانرێت بگەڕێنرێتەوە';
                  }
                  if (typeof toast === 'function') {
                    toast('باکئەپی بەتاڵ', 'ئەم فایلە کاڵای تێدا نییە. داتای ئێستا مەسڕەوە.', 'warning');
                  }
                }
              })
              .catch(function () {
                if (countsEl) countsEl.textContent = 'نەتوانرا فایلەکە بپشکنرێت';
              });
          } catch (err) {
            if (countsEl) countsEl.textContent = '';
          }
        };
        reader.readAsArrayBuffer(file);
      }
    },

    closeModal: function () {
      this._pendingFile = null;
      this._pendingBytes = null;
      this._inspect = null;
      var modal = document.getElementById('dbRestoreModal');
      if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
      }
    },

    // ─── 5. EXECUTE 1-CLICK RESTORE ────────────────────────────
    executeRestore: function () {
      var self = this;
      var file = this._pendingFile;
      if (!file) {
        self.closeModal();
        return;
      }

      var confirmBtn = document.getElementById('restoreModalConfirmBtn');
      var cancelBtn = document.getElementById('restoreModalCancelBtn');
      var statusBox = document.getElementById('restoreModalStatusBox');
      var statusText = document.getElementById('restoreModalStatusText');

      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> داتابەیس دەگەڕێنرێتەوە... (٥ چرکە)';
      }
      if (cancelBtn) cancelBtn.disabled = true;

      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.background = 'rgba(245,158,11,0.15)';
        statusBox.style.border = '1px solid rgba(245,158,11,0.3)';
        statusBox.style.color = '#f59e0b';
      }
      if (statusText) {
        statusText.innerHTML = '<i class="fas fa-sync fa-spin"></i> تکایە چاوەڕوان بە: سێرڤەر کۆپی پارێزراو هەڵدەگرێت و داتاکان نوێ دەکاتەوە...';
      }

      if (self._inspect && self._inspect.wouldWipeShop) {
        self._onRestoreError('ئەم باکئەپە بەتاڵە. گەڕاندنەوەی داتای مارکێت دەسڕێتەوە.');
        return;
      }

      var name = (file.name || '').toLowerCase();
      var isDb = name.endsWith('.db') || name.endsWith('.sqlite');

      function sendDbRestore(bytes) {
        fetch(getApiBase() + '/api/backup/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Data: fileToBase64(bytes) })
        })
          .then(function (res) { return res.json(); })
          .then(function (result) {
            if (result && result.success) {
              if (typeof SqliteDB !== 'undefined' && typeof SqliteDB.importBinary === 'function') {
                try { SqliteDB.importBinary(bytes); } catch (e) {}
              }
              self._onRestoreSuccess(result.stats || {});
            } else {
              throw new Error((result && result.error) || 'شکست لە گێڕانەوەی داتابەیس');
            }
          })
          .catch(function (err) {
            self._onRestoreError(err.message);
          });
      }

      if (isDb) {
        if (self._pendingBytes && self._pendingBytes.byteLength) {
          sendDbRestore(self._pendingBytes);
          return;
        }
        var reader = new FileReader();
        reader.onerror = function () {
          self._onRestoreError('شکست لە خوێندنەوەی فایلی داتابەیس لە کۆمپیوتەرەکەت');
        };
        reader.onload = function (ev) {
          try {
            sendDbRestore(new Uint8Array(ev.target.result));
          } catch (e) {
            self._onRestoreError(e.message);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        // JSON format fallback
        var jsonReader = new FileReader();
        jsonReader.onerror = function () {
          self._onRestoreError('شکست لە خوێندنەوەی فایلی JSON');
        };
        jsonReader.onload = function (ev) {
          try {
            var data = JSON.parse(ev.target.result);
            if (typeof DataStore !== 'undefined' && typeof DataStore.importJsonBackup === 'function') {
              DataStore.importJsonBackup(data, {
                returnSales: data.returnSales,
                stockTransactions: data.stockTransactions,
                permissions: data.permissions
              });
            }
            self._onRestoreSuccess({
              products: (data.products && data.products.length) || 0,
              orders: (data.orders && data.orders.length) || 0
            });
          } catch (err) {
            self._onRestoreError('فایلی JSON نادروستە: ' + err.message);
          }
        };
        jsonReader.readAsText(file);
      }
    },

    _onRestoreSuccess: function (stats) {
      var prodCount = stats.products || 0;
      var orderCount = stats.orders || 0;

      var statusBox = document.getElementById('restoreModalStatusBox');
      var statusText = document.getElementById('restoreModalStatusText');
      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.background = 'rgba(16,185,129,0.18)';
        statusBox.style.border = '1px solid rgba(16,185,129,0.4)';
        statusBox.style.color = '#10b981';
      }
      if (statusText) {
        statusText.innerHTML = '<strong><i class="fas fa-check-circle"></i> سەرکەوتوو!</strong> داتابەیس بە تەواوی گەڕێنرایەوە (' +
          prodCount + ' کاڵا، ' + orderCount + ' پسوڵە). پاش کەمێکی تر سیستەم نوێ دەبێتەوە...';
      }

      var confirmBtn = document.getElementById('restoreModalConfirmBtn');
      if (confirmBtn) {
        confirmBtn.innerHTML = '<i class="fas fa-check"></i> گەڕێنرایەوە!';
        confirmBtn.style.background = '#10b981';
      }

      if (typeof logActivity === 'function') {
        logActivity('restore', 'System restored successfully from backup file (' + prodCount + ' products, ' + orderCount + ' orders)');
      }

      if (typeof toast === 'function') {
        toast('سەرکەوتوو', 'داتابەیس گەڕێنرایەوە! سیستەم دەستبەجێ نوێ دەکرێتەوە...', 'success');
      }

      setTimeout(function () {
        window.location.reload();
      }, 1500);
    },

    _onRestoreError: function (errMsg) {
      var confirmBtn = document.getElementById('restoreModalConfirmBtn');
      var cancelBtn = document.getElementById('restoreModalCancelBtn');
      var statusBox = document.getElementById('restoreModalStatusBox');
      var statusText = document.getElementById('restoreModalStatusText');

      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fas fa-history"></i> دووبارە هەوڵبدەرەوە';
      }
      if (cancelBtn) cancelBtn.disabled = false;

      if (statusBox) {
        statusBox.style.display = 'block';
        statusBox.style.background = 'rgba(239,68,68,0.18)';
        statusBox.style.border = '1px solid rgba(239,68,68,0.4)';
        statusBox.style.color = '#ef4444';
      }
      if (statusText) {
        statusText.innerHTML = '<strong><i class="fas fa-exclamation-triangle"></i> هەڵە:</strong> ' + (errMsg || 'هەڵەیەکی نەزانراو ڕوویدا');
      }

      if (typeof toast === 'function') {
        toast('شکست لە گێڕانەوە', errMsg, 'error');
      }
    },

    // ─── 6. REFRESH DB STATS BOX ──────────────────────────────
    refreshDbStats: function () {
      var screen = screenShopCounts();
      if (screen.products > 0) paintStats(screen.products, screen.orders, null, null);
      fetch(getApiBase() + '/api/backup/info')
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data || !data.success) {
            paintStats(screen.products, screen.orders, null, null);
            return;
          }
          var apiP = data.counts ? (data.counts.products || 0) : 0;
          var apiO = data.counts ? (data.counts.orders || 0) : 0;
          paintStats(
            Math.max(apiP, screen.products),
            Math.max(apiO, screen.orders),
            data.counts ? data.counts.users : null,
            data.sizeMb
          );

          var lastEl = document.getElementById('dbLastBackupText');
          if (lastEl) {
            if (data.lastModified) {
              var dt = new Date(data.lastModified);
              lastEl.textContent = 'دواین نوێبوونەوە: ' + ((typeof formatSaleTime === 'function') ? formatSaleTime(dt, true) : dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
            } else {
              lastEl.textContent = 'دواین پشکنین: ئێستا';
            }
          }
        })
        .catch(function () {
          paintStats(screen.products, screen.orders, null, null);
        });
    },

    // ─── 7. USB FLASH DRIVE DETECTION & TEST BACKUP ────────────
    checkUsbStatus: function (callback) {
      fetch(getApiBase() + '/api/backup/usb-status')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (typeof callback === 'function') callback(data);
        })
        .catch(function (e) {
          if (typeof callback === 'function') callback({ success: false, error: e.message });
        });
    },

    copyFullShopToUsb: function () {
      if (typeof toast === 'function') {
        toast('فلاش', 'کۆپی هەموو مارکێت دەخرێتە سەر فلاش...', 'info');
      }
      fetch(getApiBase() + '/api/backup/copy-to-usb', { method: 'POST' })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (pack) {
          var res = pack.j || {};
          if (!pack.ok || !res.success) {
            throw new Error(res.error || res.message || 'نەتوانرا بخرێتە سەر فلاش');
          }
          var drives = (res.usbBackups || []).filter(function (u) { return u.saved; }).map(function (u) { return u.drive; }).join(', ');
          if (typeof toast === 'function') {
            toast('سەرکەوتوو', (res.products || 0) + ' کاڵا و ' + (res.orders || 0) + ' پسوڵە خرایە سەر فلاش ' + drives + ' — ' + (res.filename || ''), 'success');
          }
          BackupRestore.refreshDbStats();
        })
        .catch(function (err) {
          if (typeof toast === 'function') toast('هەڵە', err.message, 'error');
        });
    },

    testUsbBackup: function () {
      if (typeof toast === 'function') {
        toast('تاقیکردنەوەی باکئەپ', 'پشکنینی فلاش میمۆری و ناردنی کۆپی داتابەیس...', 'info');
      }
      fetch(getApiBase() + '/api/backup/test-usb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashier: (typeof DB !== 'undefined' && DB.currentUser ? DB.currentUser.name : 'ئەدمین') })
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.success) {
            if (res.usbSavedCount > 0) {
              var drives = res.usbBackups.filter(function (u) { return u.saved; }).map(function (u) { return u.drive; }).join(', ');
              if (typeof toast === 'function') {
                toast('سەرکەوتوو', 'کۆپی خرایە سەر فلاش میمۆری (' + drives + ') بە سەرکەوتوویی ✅', 'success');
              }
            } else {
              if (typeof toast === 'function') {
                toast('تەواو بوو', 'کۆپی خرایە ناو فۆڵدەری باکئەپ (تێبینی: فلاش میمۆری بەستراو نەدۆزرایەوە)', 'info');
              }
            }
            BackupRestore.refreshDbStats();
          } else {
            throw new Error(res.error || 'هەڵە لە دروستکردنی باکئەپ');
          }
        })
        .catch(function (err) {
          if (typeof toast === 'function') toast('هەڵە', err.message, 'error');
        });
    }
  };

  function renderUsbSettingsStatus(info) {
    var disp = document.getElementById('settingsUsbStatusDisplay');
    var targetDir = document.getElementById('settingsUsbTargetDir');
    if (!disp) return;

    if (info && info.hasUsb && info.removableTargets && info.removableTargets.length > 0) {
      var first = info.removableTargets[0];
      disp.innerHTML = '<i class="fas fa-check-circle" style="color:#10b981;"></i> فلاش میمۆری بەستراوەتەوە: <strong>' + first.drive + '</strong> (' + (first.volumeName || 'USB') + ') ✅';
      disp.style.color = '#10b981';
      if (targetDir) targetDir.textContent = first.targetDir;
    } else {
      disp.innerHTML = '<i class="fas fa-hdd" style="color:#38bdf8;"></i> کۆپی لە فۆڵدەری باکئەپی ناوخۆیی سیستەم پاشەکەوت دەکرێت';
      disp.style.color = '#38bdf8';
      if (targetDir) targetDir.textContent = 'backups/shift_close/ (کۆپی ناوخۆیی)';
    }
  }

  window.renderUsbSettingsStatus = renderUsbSettingsStatus;

  // Expose globally
  window.BackupRestore = BackupRestore;

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      BackupRestore.init();
      BackupRestore.checkUsbStatus(renderUsbSettingsStatus);
    });
  } else {
    BackupRestore.init();
    BackupRestore.checkUsbStatus(renderUsbSettingsStatus);
  }

})(window);
