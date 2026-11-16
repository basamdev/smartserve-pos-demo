/* Sam Market POS — data access layer (SQLite only) */
var DataStore = (function () {
  var COLLECTIONS = {
    customers: "customers",
    debts: "debts",
    shifts: "shifts",
    expenses: "expenses",
    suspendedSales: "suspended_sales",
    returnSales: "return_sales",
    stockTransactions: "stock_transactions",
    suppliers: "suppliers",
    supplierPayments: "supplier_payments",
    purchases: "purchases",
    loginLogs: "login_logs",
    activityLogs: "activity_logs",
    changeTracker: "change_tracker",
    deletedRecords: "deleted_records",
    offlineQueue: "offline_queue",
    priceHistory: "price_history",
    permissions: "permissions"
  };

  function parseLegacy(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function migrateLegacyLocalStorage() {
    if (window.isPosDemoMode && window.isPosDemoMode()) return false;
    if (!SqliteDB.isEmpty()) return false;

    var legacyProducts = parseLegacy("sm_products", []);
    var legacyCategories = parseLegacy("sm_categories", []);
    var legacyOrders = parseLegacy("sm_orders", []);
    var legacySettings = parseLegacy("sm_settings", null);
    var legacyDebts = parseLegacy("sm_debts", []);
    var legacyShifts = parseLegacy("sm_shifts", []);
    var legacyExpenses = parseLegacy("sm_expenses", []);
    var legacySuspended = parseLegacy("sm_suspended_sales", []);
    var legacyReturns = parseLegacy("sm_return_sales", []);
    var legacyStock = parseLegacy("sm_stock_transactions", []);
    var legacyPermissions = parseLegacy("sm_permissions", {});
    var legacyLoginLogs = parseLegacy("sm_login_logs", []);
    var legacyActivityLogs = parseLegacy("sm_activity_logs", []);
    var legacyChangeTracker = parseLegacy("sm_change_tracker", []);
    var legacyDeletedRecords = parseLegacy("sm_deleted_records", []);
    var legacyOfflineQueue = parseLegacy("sm_offline_queue", []);
    var legacyPriceHistory = parseLegacy("sm_price_history", []);
    var legacyImageCache = parseLegacy("sm_image_cache", {});

    var hasData = legacyProducts.length || legacyCategories.length || legacyOrders.length ||
      legacyDebts.length || legacyShifts.length || legacyExpenses.length;

    if (!hasData && !parseLegacy("sm_users", []).length) return false;

    if (legacyProducts.length) SqliteDB.replaceProducts(legacyProducts);
    if (legacyCategories.length) SqliteDB.replaceCategories(legacyCategories);
    if (legacyOrders.length) SqliteDB.replaceOrders(legacyOrders);
    if (legacySettings) SqliteDB.setSetting("app_settings", legacySettings);
    if (legacyDebts.length) SqliteDB.replaceCollection(COLLECTIONS.debts, legacyDebts);
    if (legacyShifts.length) SqliteDB.replaceCollection(COLLECTIONS.shifts, legacyShifts);
    if (legacyExpenses.length) SqliteDB.replaceCollection(COLLECTIONS.expenses, legacyExpenses);
    if (legacySuspended.length) SqliteDB.replaceCollection(COLLECTIONS.suspendedSales, legacySuspended);
    if (legacyReturns.length) SqliteDB.replaceCollection(COLLECTIONS.returnSales, legacyReturns);
    if (legacyStock.length) SqliteDB.replaceCollection(COLLECTIONS.stockTransactions, legacyStock);
    if (legacyPermissions && Object.keys(legacyPermissions).length) SqliteDB.setSetting("permissions", legacyPermissions);
    if (legacyLoginLogs.length) SqliteDB.replaceCollection(COLLECTIONS.loginLogs, legacyLoginLogs);
    if (legacyActivityLogs.length) SqliteDB.replaceCollection(COLLECTIONS.activityLogs, legacyActivityLogs);
    if (legacyChangeTracker.length) SqliteDB.replaceCollection(COLLECTIONS.changeTracker, legacyChangeTracker);
    if (legacyDeletedRecords.length) SqliteDB.replaceCollection(COLLECTIONS.deletedRecords, legacyDeletedRecords);
    if (legacyOfflineQueue.length) SqliteDB.replaceCollection(COLLECTIONS.offlineQueue, legacyOfflineQueue);
    if (legacyPriceHistory.length) SqliteDB.replaceCollection(COLLECTIONS.priceHistory, legacyPriceHistory);
    if (legacyImageCache && Object.keys(legacyImageCache).length) SqliteDB.setSetting("image_cache", legacyImageCache);

    AuthService.migrateLegacyUsers(parseLegacy("sm_users", []));
    SqliteDB.persistNow();
    return true;
  }

  function loadIntoApp(state) {
    state.products = SqliteDB.getProducts();
    state.categories = SqliteDB.getCategories();
    state.orders = SqliteDB.getOrders();
    state.settings = SqliteDB.getSetting("app_settings", null);
    state.debts = SqliteDB.getCollection(COLLECTIONS.debts);
    state.shifts = SqliteDB.getCollection(COLLECTIONS.shifts);
    state.expenses = SqliteDB.getCollection(COLLECTIONS.expenses);
    state.suspendedSales = SqliteDB.getCollection(COLLECTIONS.suspendedSales);
    state.suppliers = SqliteDB.getCollection(COLLECTIONS.suppliers);
    state.supplierPayments = SqliteDB.getCollection(COLLECTIONS.supplierPayments);
    state.purchases = SqliteDB.getCollection(COLLECTIONS.purchases);
    state.customers = SqliteDB.getCollection(COLLECTIONS.customers);
    state.users = AuthService.syncUsersCache();

    if (!state.suppliers) state.suppliers = [];
    if (!state.supplierPayments) state.supplierPayments = [];
    if (!state.purchases) state.purchases = [];
    if (!state.customers) state.customers = [];

    return {
      returnSales: SqliteDB.getCollection(COLLECTIONS.returnSales),
      stockTransactions: SqliteDB.getCollection(COLLECTIONS.stockTransactions),
      permissions: SqliteDB.getSetting("permissions", null),
      loginLogs: SqliteDB.getCollection(COLLECTIONS.loginLogs),
      activityLogs: SqliteDB.getCollection(COLLECTIONS.activityLogs),
      changeTracker: SqliteDB.getCollection(COLLECTIONS.changeTracker),
      deletedRecords: SqliteDB.getCollection(COLLECTIONS.deletedRecords),
      offlineQueue: SqliteDB.getCollection(COLLECTIONS.offlineQueue),
      priceHistory: SqliteDB.getCollection(COLLECTIONS.priceHistory),
      imageCache: SqliteDB.getSetting("image_cache", {})
    };
  }

  function saveProducts() {
    SqliteDB.replaceProducts(DB.products);
    if (SqliteDB.persistNow) SqliteDB.persistNow();
  }
  function saveCategories() { SqliteDB.replaceCategories(DB.categories); }
  function saveOrders() { SqliteDB.replaceOrders(DB.orders); }
  function saveSettings() {
    SqliteDB.setSetting("app_settings", DB.settings);
    if (SqliteDB.persistNow) SqliteDB.persistNow();
  }
  function saveDebts() { SqliteDB.replaceCollection(COLLECTIONS.debts, DB.debts || []); }
  function saveShifts() { SqliteDB.replaceCollection(COLLECTIONS.shifts, DB.shifts || []); }
  function saveExpenses() { SqliteDB.replaceCollection(COLLECTIONS.expenses, DB.expenses || []); }
  function saveSuspendedSales() { SqliteDB.replaceCollection(COLLECTIONS.suspendedSales, DB.suspendedSales || []); }
  function saveSuppliers() { SqliteDB.replaceCollection(COLLECTIONS.suppliers, DB.suppliers || []); }
  function saveSupplierPayments() { SqliteDB.replaceCollection(COLLECTIONS.supplierPayments, DB.supplierPayments || []); }
  function savePurchases() { SqliteDB.replaceCollection(COLLECTIONS.purchases, DB.purchases || []); }
  function saveCustomers() { SqliteDB.replaceCollection(COLLECTIONS.customers, DB.customers || []); }

  function saveReturnSales(list) { SqliteDB.replaceCollection(COLLECTIONS.returnSales, list || []); }
  function saveStockTransactions(list) { SqliteDB.replaceCollection(COLLECTIONS.stockTransactions, list || []); }
  function savePermissions(obj) { SqliteDB.setSetting("permissions", obj || {}); }
  function saveLoginLogs(list) { SqliteDB.replaceCollection(COLLECTIONS.loginLogs, list || []); }
  function saveActivityLogs(list) { SqliteDB.replaceCollection(COLLECTIONS.activityLogs, list || []); }
  function saveChangeTracker(list) { SqliteDB.replaceCollection(COLLECTIONS.changeTracker, list || []); }
  function saveDeletedRecords(list) { SqliteDB.replaceCollection(COLLECTIONS.deletedRecords, list || []); }
  function saveOfflineQueue(list) { SqliteDB.replaceCollection(COLLECTIONS.offlineQueue, list || []); }
  function savePriceHistory(list) { SqliteDB.replaceCollection(COLLECTIONS.priceHistory, list || []); }
  function saveImageCache(map) { SqliteDB.setSetting("image_cache", map || {}); }

  function init() {
    return SqliteDB.init().then(function () {
      migrateLegacyLocalStorage();
      return AuthService.init();
    });
  }

  function exportSqliteBackup() {
    SqliteDB.persistNow();
    var bytes = SqliteDB.exportBinary();
    var blob = new Blob([bytes], { type: "application/x-sqlite3" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sam_market_pos_" + new Date().toISOString().slice(0, 10) + ".sqlite";
    a.click();
  }

  function importSqliteBackup(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          SqliteDB.importBinary(new Uint8Array(e.target.result));
          resolve(true);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function exportJsonBackup(extra) {
    SqliteDB.persistNow();
    extra = extra || {};
    return {
      format: "sam_market_pos_v2",
      exportDate: new Date().toISOString(),
      products: DB.products,
      orders: DB.orders,
      categories: DB.categories,
      settings: DB.settings,
      debts: DB.debts,
      shifts: DB.shifts,
      expenses: DB.expenses,
      suspendedSales: DB.suspendedSales,
      suppliers: DB.suppliers,
      purchases: DB.purchases,
      users: SqliteDB.getAllUsers().map(function (u) {
        return { id: u.id, fullName: u.fullName, username: u.username, role: u.role, phone: u.phone, isActive: u.isActive, createdAt: u.createdAt, lastLogin: u.lastLogin };
      }),
      returnSales: extra.returnSales || [],
      stockTransactions: extra.stockTransactions || [],
      permissions: extra.permissions || {},
      loginLogs: extra.loginLogs || [],
      activityLogs: extra.activityLogs || [],
      changeTracker: extra.changeTracker || [],
      deletedRecords: extra.deletedRecords || [],
      offlineQueue: extra.offlineQueue || [],
      priceHistory: extra.priceHistory || [],
      imageCache: extra.imageCache || {}
    };
  }

  function importJsonBackup(data, extras) {
    if (data.products) { DB.products = data.products; saveProducts(); }
    if (data.orders) { DB.orders = data.orders; saveOrders(); }
    if (data.categories) { DB.categories = data.categories; saveCategories(); }
    if (data.settings) { DB.settings = data.settings; saveSettings(); }
    if (data.debts) { DB.debts = data.debts; saveDebts(); }
    if (data.shifts) { DB.shifts = data.shifts; saveShifts(); }
    if (data.expenses) { DB.expenses = data.expenses; saveExpenses(); }
    if (data.suspendedSales) { DB.suspendedSales = data.suspendedSales; saveSuspendedSales(); }
    if (data.suppliers) { DB.suppliers = data.suppliers; saveSuppliers(); }
    if (data.purchases) { DB.purchases = data.purchases; savePurchases(); }
    if (data.returnSales) saveReturnSales(data.returnSales);
    if (data.stockTransactions) saveStockTransactions(data.stockTransactions);
    if (data.permissions) savePermissions(data.permissions);
    if (data.loginLogs) saveLoginLogs(data.loginLogs);
    if (data.activityLogs) saveActivityLogs(data.activityLogs);
    if (data.changeTracker) saveChangeTracker(data.changeTracker);
    if (data.deletedRecords) saveDeletedRecords(data.deletedRecords);
    if (data.offlineQueue) saveOfflineQueue(data.offlineQueue);
    if (data.priceHistory) savePriceHistory(data.priceHistory);
    if (data.imageCache) saveImageCache(data.imageCache);
    if (extras) {
      if (extras.returnSales) saveReturnSales(extras.returnSales);
      if (extras.stockTransactions) saveStockTransactions(extras.stockTransactions);
      if (extras.permissions) savePermissions(extras.permissions);
      if (extras.loginLogs) saveLoginLogs(extras.loginLogs);
      if (extras.activityLogs) saveActivityLogs(extras.activityLogs);
      if (extras.changeTracker) saveChangeTracker(extras.changeTracker);
      if (extras.deletedRecords) saveDeletedRecords(extras.deletedRecords);
      if (extras.offlineQueue) saveOfflineQueue(extras.offlineQueue);
      if (extras.priceHistory) savePriceHistory(extras.priceHistory);
      if (extras.imageCache) saveImageCache(extras.imageCache);
    }
    SqliteDB.persistNow();
  }

  function runAutoBackup(extra) {
    var data = exportJsonBackup(extra);
    SqliteDB.setSetting("auto_backup", data);
    SqliteDB.setSetting("auto_backup_date", new Date().toISOString());
  }

  return {
    init: init,
    loadIntoApp: loadIntoApp,
    saveProducts: saveProducts,
    saveCategories: saveCategories,
    saveOrders: saveOrders,
    saveSettings: saveSettings,
    saveDebts: saveDebts,
    saveShifts: saveShifts,
    saveExpenses: saveExpenses,
    saveSuspendedSales: saveSuspendedSales,
    saveSuppliers: saveSuppliers,
      saveSupplierPayments: saveSupplierPayments,
    savePurchases: savePurchases,
    saveCustomers: saveCustomers,
    saveReturnSales: saveReturnSales,
    saveStockTransactions: saveStockTransactions,
    savePermissions: savePermissions,
    saveLoginLogs: saveLoginLogs,
    saveActivityLogs: saveActivityLogs,
    saveChangeTracker: saveChangeTracker,
    saveDeletedRecords: saveDeletedRecords,
    saveOfflineQueue: saveOfflineQueue,
    savePriceHistory: savePriceHistory,
    saveImageCache: saveImageCache,
    exportSqliteBackup: exportSqliteBackup,
    importSqliteBackup: importSqliteBackup,
    exportJsonBackup: exportJsonBackup,
    importJsonBackup: importJsonBackup,
    runAutoBackup: runAutoBackup
  };
})();
