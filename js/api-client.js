/* Sam Market POS — Universal API & Sync Client */
var ApiClient = (function () {
  var isServerOnline = false;
  var checkTimer = null;
  var offlineQueue = [];

  function isDemo() {
    return !!(window.isPosDemoMode && window.isPosDemoMode());
  }

  function getBaseUrl() {
    if (isDemo()) return "";
    // If running from file:// or localhost port 80/8080, point to port 3005 (Market POS)
    if (window.location.protocol === 'file:') return 'http://localhost:3005';
    if (window.location.port !== '3005' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      return 'http://localhost:3005';
    }
    return window.location.origin;
  }

  function jsonHeaders() {
    var h = { 'Content-Type': 'application/json' };
    try {
      if (typeof BranchManager !== "undefined" && BranchManager.currentId) {
        h['X-Branch-Id'] = BranchManager.currentId();
      }
    } catch (e) {}
    return h;
  }

  function withBranch(url) {
    try {
      if (typeof BranchManager !== "undefined" && BranchManager.currentId) {
        var id = BranchManager.currentId();
        if (id) return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'branchId=' + encodeURIComponent(id);
      }
    } catch (e) {}
    return url;
  }

  function checkStatus() {
    if (isDemo()) {
      isServerOnline = false;
      var badge = document.getElementById('serverStatusBadge');
      if (!badge) {
        createStatusBadge();
        badge = document.getElementById('serverStatusBadge');
      }
      if (badge) {
        badge.className = 'server-badge offline';
        badge.innerHTML = '<span class="status-dot"></span> <span>دیمۆی براوسەر (بێ Node)</span>';
        badge.title = 'دیمۆ — پەیوەندی بە سێرڤەری فرۆشگا ناکات';
      }
      return Promise.resolve(false);
    }
    return fetch(getBaseUrl() + '/api/status', { method: 'GET', signal: AbortSignal.timeout(2500) })
      .then(function (res) {
        if (!res.ok) throw new Error('Status not ok');
        return res.json();
      })
      .then(function (data) {
        setOnlineStatus(true, data);
        flushOfflineQueue();
        return true;
      })
      .catch(function () {
        setOnlineStatus(false);
        return false;
      });
  }

  function setOnlineStatus(online, info) {
    var changed = isServerOnline !== online;
    isServerOnline = online;

    var badge = document.getElementById('serverStatusBadge');
    if (!badge) {
      createStatusBadge();
      badge = document.getElementById('serverStatusBadge');
    }
    if (badge) {
      if (online) {
        badge.className = 'server-badge online';
        badge.innerHTML = '<span class="status-dot"></span> <span>سێرڤەری سەرەکی چالاکە (SQLite Node)</span>';
        badge.title = 'پەیوەستە بە سێرڤەری سەرەکی market.db';
      } else {
        badge.className = 'server-badge offline';
        badge.innerHTML = '<span class="status-dot"></span> <span>ئۆفلاین (SQLite WASM)</span>';
        badge.title = 'تەنها لەسەر ئەم براوسەرە پاشکەوت دەبێت تا هێڵ دەگەڕێتەوە';
      }
    }
  }

  function createStatusBadge() {
    var topbarRight = document.querySelector('.topbar-right');
    if (!topbarRight) return;
    var badge = document.createElement('div');
    badge.id = 'serverStatusBadge';
    badge.className = 'server-badge offline';
    badge.innerHTML = '<span class="status-dot"></span> <span>ئۆفلاین</span>';
    topbarRight.insertBefore(badge, topbarRight.firstChild);
  }

  function fetchProducts() {
    if (isDemo()) return Promise.reject(new Error('Offline'));
    return fetch(withBranch(getBaseUrl() + '/api/products')).then(function (r) {
      if (r && r.ok) {
        try { setOnlineStatus(true); } catch (eOn) {}
      }
      return r.json();
    });
  }

  function saveProduct(product) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    var method = product.id && DB.products.some(function(p){ return p.id === product.id; }) ? 'PUT' : 'POST';
    var url = getBaseUrl() + '/api/products' + (method === 'PUT' ? '/' + product.id : '');
    return fetch(url, {
      method: method,
      headers: jsonHeaders(),
      body: JSON.stringify(product)
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok || (data && data.error)) throw new Error((data && data.error) || ("HTTP " + r.status));
        return data;
      });
    });
  }

  function deleteProduct(productId) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/products/' + productId, { method: 'DELETE' }).then(function(r){ return r.json(); });
  }

  function reorderProducts(ids) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/products/reorder', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ ids: ids || [] })
    }).then(function (r) { return r.json(); });
  }

  function reorderCategories(ids) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/categories/reorder', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ ids: ids || [] })
    }).then(function (r) { return r.json(); });
  }

  function fetchCategories() {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/categories').then(function (r) { return r.json(); });
  }

  function saveCategory(category) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    // Always POST: server upserts by id. PUT used to UPDATE 0 rows for brand-new
    // categories because the client already pushed them into DB.categories.
    return fetch(getBaseUrl() + '/api/categories', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(category)
    }).then(function (r) { return r.json(); });
  }

  function deleteCategory(categoryId) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/categories/' + categoryId, { method: 'DELETE' }).then(function(r){ return r.json(); });
  }

  function clearCatalog() {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/catalog/clear', { method: 'POST', headers: jsonHeaders(), body: '{}' }).then(function (r) { return r.json(); });
  }

  function resetSales(parts) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/sales/reset', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(parts || {})
    }).then(function (r) {
      if (!r.ok) throw new Error('reset failed');
      return r.json();
    });
  }

  function deleteSalesRecord(kind, id) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/sales/delete-record', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ kind: kind, id: id })
    }).then(function (r) {
      if (!r.ok) throw new Error('delete failed');
      return r.json();
    });
  }

  function lookupBarcode(code) {
    if (isDemo()) return Promise.reject(new Error('Offline'));
    return fetch(withBranch(getBaseUrl() + '/api/products/lookup/' + encodeURIComponent(code)))
      .then(function (r) {
        if (!r.ok) throw new Error('Not found');
        try { setOnlineStatus(true); } catch (eOn) {}
        return r.json();
      });
  }

  function submitOrder(orderData) {
    if (isDemo()) {
      return Promise.resolve({ offline: true, demo: true, orderId: orderData.id });
    }
    if (!isServerOnline) {
      queueOfflineOrder(orderData);
      return Promise.resolve({ offline: true, orderId: orderData.id });
    }
    return fetch(getBaseUrl() + '/api/orders', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(orderData)
    }).then(function (r) { return r.json(); })
    .catch(function (err) {
      queueOfflineOrder(orderData);
      return { offline: true, orderId: orderData.id };
    });
  }

  function queueOfflineOrder(order) {
    if (isDemo()) return;
    offlineQueue.push(order);
    try {
      localStorage.setItem('sm_offline_orders', JSON.stringify(offlineQueue));
    } catch (e) {}
  }

  function flushOfflineQueue() {
    if (isDemo()) return;
    try {
      var saved = JSON.parse(localStorage.getItem('sm_offline_orders') || '[]');
      if (saved.length > 0 && isServerOnline) {
        var queue = saved.slice();
        localStorage.removeItem('sm_offline_orders');
        offlineQueue = [];
        queue.forEach(function (order) {
          submitOrder(order);
        });
        if (typeof toast === 'function') {
          toast('هاوسەنگکردن', saved.length + ' فرۆشتنی ئۆفلاین بۆ سێرڤەری سەرەکی نێردران', 'success');
        }
      }
    } catch (e) {}
  }

  function openShift(data) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/shifts/open', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(data)
    }).then(function(r){ return r.json(); });
  }

  function closeShift(data) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/shifts/close', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(data)
    }).then(function(r){ return r.json(); });
  }

  function recordCashMovement(data) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/shifts/cash-movement', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(data)
    }).then(function(r){ return r.json(); });
  }

  function fetchDashboardStats() {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(withBranch(getBaseUrl() + '/api/dashboard')).then(function(r){ return r.json(); });
  }

  function fetchCustomers() {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/customers').then(function(r){ return r.json(); });
  }

  function saveCustomer(customer) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    var method = customer.id && (DB.customers || []).some(function(c){ return c.id === customer.id; }) ? 'PUT' : 'POST';
    var url = getBaseUrl() + '/api/customers' + (method === 'PUT' ? '/' + customer.id : '');
    return fetch(url, {
      method: method,
      headers: jsonHeaders(),
      body: JSON.stringify(customer)
    }).then(function(r){ return r.json(); });
  }

  function deleteCustomer(customerId) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/customers/' + customerId, { method: 'DELETE' }).then(function(r){ return r.json(); });
  }

  function fetchSuppliers() {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/suppliers').then(function(r){ return r.json(); });
  }

  function saveSupplier(supplier) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    var method = supplier.id && (DB.suppliers || []).some(function(s){ return s.id === supplier.id; }) ? 'PUT' : 'POST';
    var url = getBaseUrl() + '/api/suppliers' + (method === 'PUT' ? '/' + supplier.id : '');
    return fetch(url, {
      method: method,
      headers: jsonHeaders(),
      body: JSON.stringify(supplier)
    }).then(function(r){ return r.json(); });
  }

  function deleteSupplier(supplierId) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/suppliers/' + supplierId, { method: 'DELETE' }).then(function(r){ return r.json(); });
  }

  function fetchExpenses() {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/expenses').then(function(r){ return r.json(); });
  }

  function saveExpense(expense) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/expenses', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(expense)
    }).then(function(r){ return r.json(); });
  }

  function deleteExpense(expenseId) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/expenses/' + expenseId, { method: 'DELETE' }).then(function(r){ return r.json(); });
  }

  function fetchPurchases() {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/purchases').then(function(r){ return r.json(); });
  }

  function savePurchase(purchase) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/purchases', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(purchase)
    }).then(function(r){ return r.json(); });
  }

  function fetchOrders(limit) {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    var lim = limit || 500;
    return fetch(withBranch(getBaseUrl() + '/api/orders?limit=' + lim)).then(function(r){ return r.json(); });
  }

  function fetchDebts() {
    if (!isServerOnline) return Promise.reject(new Error('Offline'));
    return fetch(getBaseUrl() + '/api/debts').then(function(r){ return r.json(); });
  }

  function init() {
    if (isDemo()) {
      if (checkTimer) clearInterval(checkTimer);
      return checkStatus();
    }
    if (checkTimer) clearInterval(checkTimer);
    checkTimer = setInterval(checkStatus, 10000);
    return checkStatus();
  }

  return {
    init: init,
    checkStatus: checkStatus,
    isOnline: function () { return isServerOnline; },
    getBaseUrl: getBaseUrl,
    fetchProducts: fetchProducts,
    saveProduct: saveProduct,
    deleteProduct: deleteProduct,
    reorderProducts: reorderProducts,
    fetchCategories: fetchCategories,
    saveCategory: saveCategory,
    reorderCategories: reorderCategories,
    deleteCategory: deleteCategory,
    clearCatalog: clearCatalog,
    resetSales: resetSales,
    deleteSalesRecord: deleteSalesRecord,
    lookupBarcode: lookupBarcode,
    submitOrder: submitOrder,
    fetchOrders: fetchOrders,
    fetchDebts: fetchDebts,
    openShift: openShift,
    closeShift: closeShift,
    recordCashMovement: recordCashMovement,
    fetchDashboardStats: fetchDashboardStats,
    fetchCustomers: fetchCustomers,
    saveCustomer: saveCustomer,
    deleteCustomer: deleteCustomer,
    fetchSuppliers: fetchSuppliers,
    saveSupplier: saveSupplier,
    deleteSupplier: deleteSupplier,
    fetchExpenses: fetchExpenses,
    saveExpense: saveExpense,
    deleteExpense: deleteExpense,
    fetchPurchases: fetchPurchases,
    savePurchase: savePurchase
  };
})();
