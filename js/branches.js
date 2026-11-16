/* ═══════════════════════════════════════════════════════════════
   Multi-branch (two or more markets) — optional.
   One shop: nothing extra is shown. Two shops: each has its own
   stock, sales, cash, expenses and receipt name. Catalog is shared.
   ═══════════════════════════════════════════════════════════════ */
var BranchManager = (function () {
  var DEFAULT_ID = "br_main";
  var viewAll = false;
  var ensuring = false;

  function ensureState() {
    if (ensuring) return (typeof DB !== "undefined" && DB.settings) ? DB.settings : null;
    if (typeof DB === "undefined") return null;
    ensuring = true;
    try {
      if (!DB.settings) DB.settings = {};
      if (!Array.isArray(DB.settings.branches) || !DB.settings.branches.length) {
        DB.settings.branches = [{
          id: DEFAULT_ID,
          name: "لقی سەرەکی",
          address: DB.settings.address || "",
          phone: DB.settings.phone || "",
          isDefault: true,
          createdAt: new Date().toISOString()
        }];
      }
      if (!DB.settings.currentBranchId) DB.settings.currentBranchId = DB.settings.branches[0].id;
      if (!DB.settings.productStockByBranch || typeof DB.settings.productStockByBranch !== "object") {
        DB.settings.productStockByBranch = {};
      }
      var cur = DB.settings.currentBranchId;
      var found = false;
      for (var i = 0; i < DB.settings.branches.length; i++) {
        if (DB.settings.branches[i] && DB.settings.branches[i].id === cur) { found = true; break; }
      }
      if (!found) DB.settings.currentBranchId = DB.settings.branches[0].id;
    } catch (e) {
      console.error("BranchManager.ensureState", e);
    }
    ensuring = false;
    return DB.settings;
  }

  function list() {
    ensureState();
    return (DB.settings && DB.settings.branches) ? DB.settings.branches : [];
  }

  function find(id) {
    var arr = (DB.settings && DB.settings.branches) ? DB.settings.branches : [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].id === id) return arr[i];
    }
    return null;
  }

  function currentId() {
    var s = ensureState();
    return (s && s.currentBranchId) || DEFAULT_ID;
  }

  function current() {
    return find(currentId()) || list()[0] || null;
  }

  function hasMultiple() {
    try {
      if (!DB || !DB.settings || !Array.isArray(DB.settings.branches)) return false;
      return DB.settings.branches.length > 1;
    } catch (e) {
      return false;
    }
  }

  function isViewAll() {
    return viewAll && hasMultiple();
  }

  function setViewAll(on) {
    viewAll = !!on;
    renderSwitcher();
    refreshVisiblePages();
  }

  function defaultId() {
    var arr = list();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].isDefault) return arr[i].id;
    }
    return arr.length ? arr[0].id : DEFAULT_ID;
  }

  function matches(record) {
    if (!record || isViewAll()) return true;
    var bid = record.branchId;
    if (!bid) return currentId() === defaultId();
    return bid === currentId();
  }

  function filterRecords(arr) {
    if (!arr || !arr.length) return arr || [];
    try {
      if (!hasMultiple() || isViewAll()) return arr;
      return arr.filter(matches);
    } catch (e) {
      return arr;
    }
  }

  function stamp(record) {
    if (!record) return record;
    if (!record.branchId) record.branchId = currentId();
    return record;
  }

  function receiptName() {
    try {
      if (!hasMultiple()) return "";
      var b = current();
      var n = b && b.name ? String(b.name).trim() : "";
      if (!n || n === "لقی سەرەکی") return "";
      if (typeof isFactoryBrandName === "function" && isFactoryBrandName(n)) return "";
      return n;
    } catch (e) {
      return "";
    }
  }

  function stockMap(branchId) {
    ensureState();
    var maps = DB.settings.productStockByBranch;
    var id = branchId || currentId();
    if (!maps[id] || typeof maps[id] !== "object") maps[id] = {};
    return maps[id];
  }

  function captureStock(branchId) {
    if (typeof DB === "undefined" || !DB.products) return;
    var map = stockMap(branchId || currentId());
    DB.products.forEach(function (p) {
      if (p && p.id) map[p.id] = parseFloat(p.stock) || 0;
    });
  }

  function applyStock(branchId) {
    if (typeof DB === "undefined" || !DB.products) return;
    var id = branchId || currentId();
    var map = stockMap(id);
    var isNewEmpty = Object.keys(map).length === 0 && id !== defaultId();
    DB.products.forEach(function (p) {
      if (!p || !p.id) return;
      if (Object.prototype.hasOwnProperty.call(map, p.id)) {
        p.stock = parseFloat(map[p.id]) || 0;
      } else if (isNewEmpty) {
        p.stock = 0;
        map[p.id] = 0;
      }
    });
  }

  function persist() {
    ensureState();
    if (typeof DataStore !== "undefined" && DataStore.saveSettings) {
      DataStore.saveSettings();
    }
  }

  function hookDataStore() {
    if (typeof DataStore === "undefined" || DataStore._branchHooked) return;
    var orig = DataStore.saveProducts;
    DataStore.saveProducts = function () {
      try {
        if (hasMultiple()) {
          captureStock();
          persist();
        }
      } catch (e) {}
      if (typeof orig === "function") orig();
    };
    DataStore._branchHooked = true;
  }

  function syncToServer(branch, action) {
    if (typeof ApiClient === "undefined" || !ApiClient.isOnline || !ApiClient.isOnline()) return;
    try {
      fetch(ApiClient.getBaseUrl() + "/api/branches" + (action === "delete" && branch && branch.id ? "/" + encodeURIComponent(branch.id) : ""), {
        method: action === "delete" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json", "X-Branch-Id": currentId() },
        body: action === "delete" ? undefined : JSON.stringify(branch || {})
      }).catch(function () {});
    } catch (e) {}
  }

  function addBranch(name, address, phone) {
    ensureState();
    name = String(name || "").trim();
    if (!name) {
      if (typeof toast === "function") toast("ناو پێویستە", "ناوی مارکێتی دووەم بنووسە", "warning");
      return null;
    }
    captureStock();
    var id = "br_" + Date.now();
    var branch = {
      id: id,
      name: name,
      address: String(address || "").trim(),
      phone: String(phone || "").trim(),
      isDefault: false,
      createdAt: new Date().toISOString()
    };
    DB.settings.branches.push(branch);
    var map = stockMap(id);
    (DB.products || []).forEach(function (p) {
      if (p && p.id) map[p.id] = 0;
    });
    persist();
    syncToServer(branch, "save");
    if (typeof toast === "function") {
      toast("لقی نوێ", name + " زیادکرا. کۆگاکەی بە بەتاڵی دەست پێدەکات — نرخ و بارکۆد هەر ئەوانەن.", "success");
    }
    renderSettingsPanel();
    renderSwitcher();
    return branch;
  }

  function updateBranch(id, fields) {
    var b = find(id);
    if (!b) return;
    if (fields.name != null) b.name = String(fields.name).trim() || b.name;
    if (fields.address != null) b.address = String(fields.address).trim();
    if (fields.phone != null) b.phone = String(fields.phone).trim();
    persist();
    syncToServer(b, "save");
    renderSettingsPanel();
    renderSwitcher();
    if (typeof updateMarketBrandUI === "function") updateMarketBrandUI();
  }

  function removeBranch(id) {
    ensureState();
    if (id === defaultId()) {
      if (typeof toast === "function") toast("ناتوانرێت", "لقی سەرەکی ناسرێتەوە", "warning");
      return;
    }
    if (id === currentId()) {
      if (typeof toast === "function") toast("گۆڕین", "سەرەتا بڕۆ بۆ لقێکی تر، پاشان ئەمە بسڕەوە", "warning");
      return;
    }
    DB.settings.branches = DB.settings.branches.filter(function (b) { return b.id !== id; });
    if (DB.settings.productStockByBranch) delete DB.settings.productStockByBranch[id];
    persist();
    syncToServer({ id: id }, "delete");
    renderSettingsPanel();
    renderSwitcher();
    if (typeof toast === "function") toast("سڕایەوە", "لقەکە سڕایەوە", "success");
  }

  function switchTo(id, opts) {
    opts = opts || {};
    ensureState();
    if (!find(id)) return;
    if (id === currentId() && !opts.force) return;
    viewAll = false;
    captureStock();
    DB.settings.currentBranchId = id;
    applyStock(id);
    persist();
    try {
      fetch((typeof ApiClient !== "undefined" ? ApiClient.getBaseUrl() : "http://localhost:3005") + "/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Branch-Id": id },
        body: JSON.stringify({ currentBranchId: id })
      }).catch(function () {});
    } catch (e) {}
    if (typeof ApiClient !== "undefined" && ApiClient.isOnline && ApiClient.isOnline() && ApiClient.fetchProducts) {
      ApiClient.fetchProducts().then(function (products) {
        if (Array.isArray(products) && products.length) {
          products.forEach(function (sp) {
            var local = (DB.products || []).find(function (p) { return p.id === sp.id; });
            if (local && sp.stock != null) local.stock = sp.stock;
          });
          captureStock(id);
        }
      }).catch(function () {});
    }
    if (typeof toast === "function") {
      var b = find(id);
      toast("گۆڕینی لق", "ئێستا کار لەسەر «" + (b && b.name ? b.name : id) + "» دەکەیت", "info");
    }
    renderSwitcher();
    renderSettingsPanel();
    if (typeof updateMarketBrandUI === "function") updateMarketBrandUI();
    if (typeof ShiftsManager !== "undefined" && ShiftsManager.refreshCurrentShift) {
      ShiftsManager.refreshCurrentShift();
    }
    refreshVisiblePages();
  }

  function refreshVisiblePages() {
    try {
      if (typeof renderPosGrid === "function") renderPosGrid();
      if (typeof renderCart === "function") renderCart();
      if (typeof renderOrders === "function" && document.getElementById("ordersSection") && document.getElementById("ordersSection").classList.contains("active")) renderOrders();
      if (typeof renderProducts === "function" && document.getElementById("productsSection") && document.getElementById("productsSection").classList.contains("active")) renderProducts();
      if (typeof renderInventory === "function" && document.getElementById("inventorySection") && document.getElementById("inventorySection").classList.contains("active")) renderInventory();
      if (typeof renderDebtPage === "function" && document.getElementById("customersSection") && document.getElementById("customersSection").classList.contains("active")) renderDebtPage();
      if (typeof switchFinanceHubTab === "function" && document.getElementById("dashboardSection") && document.getElementById("dashboardSection").classList.contains("active")) {
        switchFinanceHubTab(window.CURRENT_FINANCE_TAB || "overview");
      }
      if (typeof renderShiftsPage === "function" && document.getElementById("shiftsSection") && document.getElementById("shiftsSection").classList.contains("active")) renderShiftsPage();
      if (typeof renderReturnSales === "function" && document.getElementById("returnSalesSection") && document.getElementById("returnSalesSection").classList.contains("active")) renderReturnSales();
    } catch (e) {}
  }

  function renderSwitcher() {
    var host = document.getElementById("branchSwitcher");
    if (!host) return;
    var branches = list();
    if (branches.length < 2) {
      host.style.display = "none";
      host.innerHTML = "";
      return;
    }
    host.style.display = "flex";
    var cur = currentId();
    var html = '<i class="fas fa-store" style="opacity:0.85;"></i>';
    html += '<select id="branchSwitcherSelect" title="گۆڕینی مارکێت / لق" onchange="BranchManager.switchTo(this.value)">';
    branches.forEach(function (b) {
      html += '<option value="' + b.id + '"' + (b.id === cur ? " selected" : "") + ">" + escapeHtml(b.name || "لق") + "</option>";
    });
    html += "</select>";
    if (viewAll) {
      html += '<button type="button" class="branch-viewall on" onclick="BranchManager.setViewAll(false)">ئەم لقە</button>';
    } else {
      html += '<button type="button" class="branch-viewall" onclick="BranchManager.setViewAll(true)">هەموو لقەکان</button>';
    }
    host.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function renderSettingsPanel() {
    var box = document.getElementById("branchesSettingsList");
    if (!box) return;
    var branches = list();
    var cur = currentId();
    var html = "";
    branches.forEach(function (b) {
      var active = b.id === cur;
      html += '<div class="branch-card' + (active ? " is-current" : "") + '">';
      html += '  <div class="branch-card-head">';
      html += '    <strong><i class="fas fa-store"></i> ' + escapeHtml(b.name) + "</strong>";
      if (b.isDefault) html += ' <span class="branch-pill">سەرەکی</span>';
      if (active) html += ' <span class="branch-pill on">ئێستا ئەمە</span>';
      html += "  </div>";
      html += '  <div class="branch-card-grid">';
      html += '    <div class="input-group"><label>ناوی ئەم مارکێتە</label><input type="text" value="' + escapeHtml(b.name) + '" onchange="BranchManager.updateBranch(\'' + b.id + '\',{name:this.value})"></div>';
      html += '    <div class="input-group"><label>تەلەفۆن</label><input type="text" value="' + escapeHtml(b.phone || "") + '" onchange="BranchManager.updateBranch(\'' + b.id + '\',{phone:this.value})"></div>';
      html += '    <div class="input-group" style="grid-column:1/-1;"><label>ناونیشان</label><input type="text" value="' + escapeHtml(b.address || "") + '" onchange="BranchManager.updateBranch(\'' + b.id + '\',{address:this.value})"></div>';
      html += "  </div>";
      html += '  <div class="branch-card-actions">';
      if (!active) html += '<button type="button" class="btn btn-primary btn-sm" onclick="BranchManager.switchTo(\'' + b.id + '\')"><i class="fas fa-exchange-alt"></i> کار لەم لقە</button>';
      if (!b.isDefault) html += '<button type="button" class="btn btn-outline btn-sm" style="color:#ef4444;border-color:rgba(239,68,68,0.35);" onclick="BranchManager.removeBranch(\'' + b.id + '\')"><i class="fas fa-trash"></i> سڕینەوە</button>';
      html += "  </div></div>";
    });
    box.innerHTML = html || '<p class="shifts-easy-hint">هێشتا تەنها یەک مارکێت هەیە.</p>';
  }

  function addFromForm() {
    var nameEl = document.getElementById("newBranchName");
    var addrEl = document.getElementById("newBranchAddress");
    var phoneEl = document.getElementById("newBranchPhone");
    var created = addBranch(nameEl ? nameEl.value : "", addrEl ? addrEl.value : "", phoneEl ? phoneEl.value : "");
    if (created) {
      if (nameEl) nameEl.value = "";
      if (addrEl) addrEl.value = "";
      if (phoneEl) phoneEl.value = "";
    }
  }

  function init() {
    try {
      ensureState();
      hookDataStore();
      if (hasMultiple()) applyStock();
      renderSwitcher();
    } catch (e) {
      console.error("BranchManager.init", e);
    }
  }

  return {
    DEFAULT_ID: DEFAULT_ID,
    init: init,
    list: list,
    currentId: currentId,
    current: current,
    hasMultiple: hasMultiple,
    isViewAll: isViewAll,
    setViewAll: setViewAll,
    filterRecords: filterRecords,
    stamp: stamp,
    matches: matches,
    receiptName: receiptName,
    addBranch: addBranch,
    addFromForm: addFromForm,
    updateBranch: updateBranch,
    removeBranch: removeBranch,
    switchTo: switchTo,
    captureStock: captureStock,
    applyStock: applyStock,
    persist: persist,
    renderSwitcher: renderSwitcher,
    renderSettingsPanel: renderSettingsPanel
  };
})();

function branchRecords(list) {
  if (typeof BranchManager !== "undefined" && BranchManager.filterRecords) {
    return BranchManager.filterRecords(list);
  }
  return list || [];
}

window.BranchManager = BranchManager;
window.branchRecords = branchRecords;
