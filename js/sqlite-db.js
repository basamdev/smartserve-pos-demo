/* Sam Market POS — SQLite engine (sql.js) */
var SqliteDB = (function () {
  var db = null;
  var SQL = null;
  function storageKey() {
    if (window.isPosDemoMode && window.isPosDemoMode()) return "sm_sqlite_db_demo";
    return "sm_sqlite_db_v2";
  }
  var readyPromise = null;
  var persistTimer = null;

  function bytesToBase64(bytes) {
    var chunk = 8192;
    var parts = [];
    for (var i = 0; i < bytes.length; i += chunk) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
    }
    return btoa(parts.join(""));
  }

  function base64ToBytes(str) {
    var binary = atob(str);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function persistNow() {
    if (window.__POS_DEMO_RESETTING) return false;
    if (!db) return false;
    try {
      var data = db.export();
      localStorage.setItem(storageKey(), bytesToBase64(data));
      return true;
    } catch (e) {
      try {
        console.warn("sqlite persist quota", e && e.message);
      } catch (e2) {}
      return false;
    }
  }

  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistNow, 120);
  }

  function loadSavedDb() {
    var saved = localStorage.getItem(storageKey());
    if (!saved) return null;
    try {
      return base64ToBytes(saved);
    } catch (e) {
      return null;
    }
  }

  function run(sql, params) {
    params = params || [];
    db.run(sql, params);
    schedulePersist();
  }

  function queryAll(sql, params) {
    params = params || [];
    var stmt = db.prepare(sql);
    stmt.bind(params);
    var rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  function queryOne(sql, params) {
    var rows = queryAll(sql, params);
    return rows.length ? rows[0] : null;
  }

  function exec(sql) {
    db.exec(sql);
    schedulePersist();
  }

  function createSchema() {
    exec(
      "CREATE TABLE IF NOT EXISTS Users (" +
      "id TEXT PRIMARY KEY NOT NULL," +
      "fullName TEXT NOT NULL," +
      "username TEXT NOT NULL UNIQUE COLLATE NOCASE," +
      "passwordHash TEXT NOT NULL," +
      "role TEXT NOT NULL," +
      "phone TEXT," +
      "isActive INTEGER NOT NULL DEFAULT 1," +
      "createdAt TEXT NOT NULL," +
      "lastLogin TEXT" +
      ");" +
      "CREATE TABLE IF NOT EXISTS Products (" +
      "id TEXT PRIMARY KEY NOT NULL," +
      "name TEXT NOT NULL," +
      "cat TEXT," +
      "price REAL DEFAULT 0," +
      "cost REAL DEFAULT 0," +
      "stock REAL DEFAULT 0," +
      "minAlert REAL DEFAULT 5," +
      "barcode TEXT," +
      "image TEXT," +
      "unit TEXT DEFAULT 'piece'," +
      "expiryDate TEXT," +
      "batchNumber TEXT" +
      ");" +
      "CREATE INDEX IF NOT EXISTS idx_products_cat ON Products(cat);" +
      "CREATE INDEX IF NOT EXISTS idx_products_barcode ON Products(barcode);" +
      "CREATE INDEX IF NOT EXISTS idx_products_name ON Products(name COLLATE NOCASE);" +
      "CREATE TABLE IF NOT EXISTS Categories (" +
      "id TEXT PRIMARY KEY NOT NULL," +
      "name TEXT NOT NULL," +
      "icon TEXT," +
      "color TEXT," +
      "image TEXT," +
      "sortOrder INTEGER DEFAULT 0" +
      ");" +
      "CREATE TABLE IF NOT EXISTS Orders (" +
      "id TEXT PRIMARY KEY NOT NULL," +
      "orderDate TEXT NOT NULL," +
      "total REAL DEFAULT 0," +
      "cashier TEXT," +
      "shiftId TEXT," +
      "paymentMethod TEXT," +
      "customerName TEXT," +
      "payload TEXT NOT NULL" +
      ");" +
      "CREATE INDEX IF NOT EXISTS idx_orders_date ON Orders(orderDate);" +
      "CREATE INDEX IF NOT EXISTS idx_orders_shift ON Orders(shiftId);" +
      "CREATE TABLE IF NOT EXISTS JsonStore (" +
      "collection TEXT NOT NULL," +
      "recordId TEXT NOT NULL," +
      "payload TEXT NOT NULL," +
      "PRIMARY KEY (collection, recordId)" +
      ");" +
      "CREATE INDEX IF NOT EXISTS idx_json_collection ON JsonStore(collection);" +
      "CREATE TABLE IF NOT EXISTS Settings (" +
      "key TEXT PRIMARY KEY NOT NULL," +
      "value TEXT NOT NULL" +
      ");" +
      "CREATE TABLE IF NOT EXISTS Sessions (" +
      "id TEXT PRIMARY KEY NOT NULL," +
      "userId TEXT NOT NULL," +
      "payload TEXT NOT NULL," +
      "createdAt TEXT NOT NULL" +
      ");"
    );
  }

  // Extra product columns (carton/wholesale/clearance/offers). Added with guarded ALTERs so existing
  // browser databases upgrade in place; every column is optional.
  var EXTRA_PRODUCT_COLUMNS = [
    ["wholesalePrice", "REAL DEFAULT 0"],
    ["packQty", "REAL DEFAULT 1"],
    ["packPrice", "REAL DEFAULT 0"],
    ["packBarcode", "TEXT"],
    ["packCost", "REAL DEFAULT 0"],
    ["isScaleItem", "INTEGER DEFAULT 0"],
    ["scaleCode", "TEXT"],
    ["clearanceDiscount", "REAL DEFAULT 0"],
    ["clearancePrice", "REAL DEFAULT 0"],
    ["offerPrice", "REAL DEFAULT 0"],
    ["offerStart", "TEXT"],
    ["offerEnd", "TEXT"],
    ["productionDate", "TEXT"],
    ["trackStock", "INTEGER DEFAULT 1"],
    ["trackExpiry", "INTEGER DEFAULT 1"],
    ["trackPack", "INTEGER DEFAULT 1"],
    ["quickFavorite", "INTEGER DEFAULT 0"],
    ["quickFavoriteAt", "REAL DEFAULT 0"],
    ["favCatId", "TEXT"],
    ["sortOrder", "INTEGER DEFAULT 0"]
  ];

  function ensureProductColumns() {
    EXTRA_PRODUCT_COLUMNS.forEach(function (col) {
      try { db.run("ALTER TABLE Products ADD COLUMN " + col[0] + " " + col[1]); } catch (e) { /* already exists */ }
    });
  }

  function ensureUserColumns() {
    try { db.run("ALTER TABLE Users ADD COLUMN permissions TEXT;"); } catch (e) { /* already exists */ }
    try { db.run("ALTER TABLE Users ADD COLUMN pin TEXT;"); } catch (e) { /* already exists */ }
    try { db.run("ALTER TABLE Users ADD COLUMN shiftStart TEXT;"); } catch (e) { /* already exists */ }
    try { db.run("ALTER TABLE Users ADD COLUMN shiftEnd TEXT;"); } catch (e) { /* already exists */ }
    try { db.run("ALTER TABLE Users ADD COLUMN shiftNotifyMinutes INTEGER;"); } catch (e) { /* already exists */ }
    try { db.run("ALTER TABLE Users ADD COLUMN employeeId TEXT;"); } catch (e) { /* already exists */ }
    try { db.run("ALTER TABLE Users ADD COLUMN salary REAL;"); } catch (e) { /* already exists */ }
    rebuildUsersRoleConstraint();
  }

  function rebuildUsersRoleConstraint() {
    try {
      var row = queryOne("SELECT sql FROM sqlite_master WHERE type='table' AND name='Users'");
      var ddl = (row && row.sql) || "";
      if (!ddl) return;
      var hasCheck = /CHECK\s*\(\s*role/i.test(ddl);
      if (!hasCheck) return;
      var cols = queryAll("PRAGMA table_info(Users)");
      var names = cols.map(function (c) { return c.name; });
      var wanted = ["id", "fullName", "username", "passwordHash", "role", "phone", "isActive", "createdAt", "lastLogin", "permissions", "pin", "shiftStart", "shiftEnd", "shiftNotifyMinutes", "employeeId", "salary"];
      var copy = wanted.filter(function (n) { return names.indexOf(n) !== -1; });
      if (copy.indexOf("id") < 0) return;
      exec("PRAGMA foreign_keys=OFF;");
      exec("BEGIN;");
      exec(
        "CREATE TABLE Users_new (" +
        "id TEXT PRIMARY KEY NOT NULL," +
        "fullName TEXT NOT NULL," +
        "username TEXT NOT NULL UNIQUE COLLATE NOCASE," +
        "passwordHash TEXT NOT NULL," +
        "role TEXT NOT NULL," +
        "phone TEXT," +
        "isActive INTEGER NOT NULL DEFAULT 1," +
        "createdAt TEXT NOT NULL," +
        "lastLogin TEXT," +
        "permissions TEXT," +
        "pin TEXT," +
        "shiftStart TEXT," +
        "shiftEnd TEXT," +
        "shiftNotifyMinutes INTEGER," +
        "employeeId TEXT," +
        "salary REAL" +
        ");"
      );
      exec("INSERT INTO Users_new (" + copy.join(",") + ") SELECT " + copy.join(",") + " FROM Users;");
      exec("DROP TABLE Users;");
      exec("ALTER TABLE Users_new RENAME TO Users;");
      exec("COMMIT;");
      exec("PRAGMA foreign_keys=ON;");
    } catch (e) {
      try { exec("ROLLBACK;"); } catch (e2) {}
      try { exec("PRAGMA foreign_keys=ON;"); } catch (e3) {}
    }
  }

  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = initSqlJs({
      locateFile: function (file) { return "js/" + file; }
    }).then(function (sql) {
      SQL = sql;
      var saved = loadSavedDb();
      db = saved ? new SQL.Database(saved) : new SQL.Database();
      createSchema();
      ensureProductColumns();
      ensureUserColumns();
      persistNow();
      return db;
    });
    return readyPromise;
  }

  function replaceCollection(collection, records, idField) {
    idField = idField || "id";
    db.run("BEGIN");
    try {
      db.run("DELETE FROM JsonStore WHERE collection = ?", [collection]);
      if (records && records.length) {
        var stmt = db.prepare("INSERT INTO JsonStore (collection, recordId, payload) VALUES (?, ?, ?)");
        records.forEach(function (item) {
          var id = String(item[idField] || item.id || ("rec_" + Date.now() + Math.random().toString(36).slice(2, 6)));
          stmt.run([collection, id, JSON.stringify(item)]);
        });
        stmt.free();
      }
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      throw e;
    }
    schedulePersist();
  }

  function getCollection(collection) {
    return queryAll("SELECT payload FROM JsonStore WHERE collection = ? ORDER BY rowid", [collection]).map(function (row) {
      return JSON.parse(row.payload);
    });
  }

  function replaceProducts(products) {
    db.run("BEGIN");
    try {
      db.run("DELETE FROM Products");
      if (products && products.length) {
        var stmt = db.prepare(
          "INSERT INTO Products (id, name, cat, price, cost, stock, minAlert, barcode, image, unit, expiryDate, batchNumber, " +
          "wholesalePrice, packQty, packPrice, packBarcode, packCost, isScaleItem, scaleCode, clearanceDiscount, clearancePrice, " +
          "offerPrice, offerStart, offerEnd, productionDate, trackStock, trackExpiry, trackPack, quickFavorite, quickFavoriteAt, favCatId, sortOrder) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        products.forEach(function (p) {
          var img = p.image || "";
          if (img.indexOf("data:") === 0) img = "";
          var bc = p.barcode ? String(p.barcode) : "";
          bc = bc.replace(/[\u0660-\u0669]/g, function (ch) {
            return String.fromCharCode(48 + (ch.charCodeAt(0) - 0x0660));
          }).replace(/[\u06F0-\u06F9]/g, function (ch) {
            return String.fromCharCode(48 + (ch.charCodeAt(0) - 0x06F0));
          }).replace(/\s+/g, "").trim();
          var pbc = p.packBarcode ? String(p.packBarcode) : "";
          pbc = pbc.replace(/[\u0660-\u0669]/g, function (ch) {
            return String.fromCharCode(48 + (ch.charCodeAt(0) - 0x0660));
          }).replace(/[\u06F0-\u06F9]/g, function (ch) {
            return String.fromCharCode(48 + (ch.charCodeAt(0) - 0x06F0));
          }).replace(/\s+/g, "").trim();
          stmt.run([
            p.id,
            p.name || "",
            p.cat || null,
            parseFloat(p.price) || 0,
            parseFloat(p.cost) || 0,
            parseFloat(p.stock) || 0,
            parseFloat(p.minAlert) || 5,
            bc || null,
            img,
            p.unit || "piece",
            p.expiryDate || null,
            p.batchNumber || null,
            parseFloat(p.wholesalePrice) || 0,
            parseFloat(p.packQty) || 1,
            parseFloat(p.packPrice) || 0,
            pbc || null,
            parseFloat(p.packCost) || 0,
            p.isScaleItem ? 1 : 0,
            p.scaleCode || null,
            parseFloat(p.clearanceDiscount) || 0,
            parseFloat(p.clearancePrice) || 0,
            parseFloat(p.offerPrice) || 0,
            p.offerStart || null,
            p.offerEnd || null,
            p.productionDate || null,
            (p.trackStock === false || p.trackStock === 0 || p.trackStock === "0") ? 0 : 1,
            (p.trackExpiry === false || p.trackExpiry === 0 || p.trackExpiry === "0") ? 0 : 1,
            (p.trackPack === false || p.trackPack === 0 || p.trackPack === "0") ? 0 : 1,
            (p.quickFavorite === true || p.quickFavorite === 1 || p.quickFavorite === "1") ? 1 : 0,
            parseFloat(p.quickFavoriteAt) || 0,
            p.favCatId ? String(p.favCatId) : "",
            (p.sortOrder != null && isFinite(Number(p.sortOrder))) ? Number(p.sortOrder) : 0
          ]);
        });
        stmt.free();
      }
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      throw e;
    }
    schedulePersist();
  }

  function getProducts() {
    return queryAll("SELECT * FROM Products ORDER BY sortOrder ASC, name COLLATE NOCASE").map(function (row) {
      return {
        id: row.id,
        name: row.name,
        cat: row.cat,
        price: row.price,
        cost: row.cost,
        stock: row.stock,
        minAlert: row.minAlert,
        barcode: row.barcode,
        image: row.image || "",
        unit: row.unit || "piece",
        expiryDate: row.expiryDate,
        batchNumber: row.batchNumber,
        wholesalePrice: row.wholesalePrice || 0,
        packQty: row.packQty || 1,
        packPrice: row.packPrice || 0,
        packBarcode: row.packBarcode || "",
        packCost: row.packCost || 0,
        isScaleItem: row.isScaleItem ? 1 : 0,
        scaleCode: row.scaleCode || null,
        clearanceDiscount: row.clearanceDiscount || 0,
        clearancePrice: row.clearancePrice || 0,
        offerPrice: row.offerPrice || 0,
        offerStart: row.offerStart || "",
        offerEnd: row.offerEnd || "",
        productionDate: row.productionDate || "",
        trackStock: row.trackStock === 0 ? 0 : 1,
        trackExpiry: row.trackExpiry === 0 ? 0 : 1,
        trackPack: row.trackPack === 0 ? 0 : 1,
        quickFavorite: row.quickFavorite ? 1 : 0,
        quickFavoriteAt: parseFloat(row.quickFavoriteAt) || 0,
        favCatId: row.favCatId || "",
        sortOrder: parseInt(row.sortOrder, 10) || 0
      };
    });
  }

  function replaceCategories(categories) {
    db.run("BEGIN");
    try {
      db.run("DELETE FROM Categories");
      if (categories && categories.length) {
        var stmt = db.prepare("INSERT INTO Categories (id, name, icon, color, image, sortOrder) VALUES (?, ?, ?, ?, ?, ?)");
        categories.forEach(function (c, idx) {
          stmt.run([c.id, c.name || "", c.icon || "", c.color || "", c.image || "", c.sortOrder != null ? c.sortOrder : idx]);
        });
        stmt.free();
      }
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      throw e;
    }
    schedulePersist();
  }

  function getCategories() {
    return queryAll("SELECT * FROM Categories ORDER BY sortOrder, name COLLATE NOCASE").map(function (row) {
      return { id: row.id, name: row.name, icon: row.icon, color: row.color, image: row.image, sortOrder: row.sortOrder };
    });
  }

  function replaceOrders(orders) {
    db.run("BEGIN");
    try {
      db.run("DELETE FROM Orders");
      if (orders && orders.length) {
        var stmt = db.prepare(
          "INSERT INTO Orders (id, orderDate, total, cashier, shiftId, paymentMethod, customerName, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        );
        orders.forEach(function (o) {
          stmt.run([
            o.id,
            o.date || new Date().toISOString(),
            parseFloat(o.total) || 0,
            o.cashier || "",
            o.shiftId || null,
            o.paymentMethod || "cash",
            o.customerName || "",
            JSON.stringify(o)
          ]);
        });
        stmt.free();
      }
      db.run("COMMIT");
    } catch (e) {
      db.run("ROLLBACK");
      throw e;
    }
    schedulePersist();
  }

  function getOrders() {
    return queryAll("SELECT id, orderDate, total, cashier, shiftId, paymentMethod, customerName, payload FROM Orders ORDER BY orderDate DESC").map(function (row) {
      var o = {};
      try { o = JSON.parse(row.payload); } catch (e) { o = {}; }
      if (Array.isArray(o)) o = { items: o };
      if (!o || typeof o !== "object") o = {};
      if (!o.id) o.id = row.id;
      if (!o.date) o.date = row.orderDate || o.orderDate;
      if (o.total == null) o.total = row.total;
      if (!o.cashier) o.cashier = row.cashier;
      if (!o.paymentMethod) o.paymentMethod = row.paymentMethod || "cash";
      if (!o.customerName) o.customerName = row.customerName;
      if (!o.items) o.items = [];
      return o;
    });
  }

  function setSetting(key, value) {
    run("INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)", [key, typeof value === "string" ? value : JSON.stringify(value)]);
  }

  function getSetting(key, fallback) {
    var row = queryOne("SELECT value FROM Settings WHERE key = ?", [key]);
    if (!row) return fallback;
    try { return JSON.parse(row.value); } catch (e) { return row.value; }
  }

  function getAllUsers() {
    return queryAll("SELECT * FROM Users ORDER BY fullName COLLATE NOCASE");
  }

  function getUserById(id) {
    return queryOne("SELECT * FROM Users WHERE id = ?", [id]);
  }

  function getUserByUsername(username) {
    return queryOne("SELECT * FROM Users WHERE lower(username) = lower(?)", [String(username || "").trim()]);
  }

  function insertUser(user) {
    var permVal = user.permissions;
    if (permVal && typeof permVal === "object") {
      try { permVal = JSON.stringify(permVal); } catch (e) { permVal = null; }
    }
    var sStart = user.shiftStart || "08:00";
    var sEnd = user.shiftEnd || "16:00";
    var sNotify = user.shiftNotifyMinutes != null ? user.shiftNotifyMinutes : 10;
    var empId = user.employeeId || null;
    var salary = user.salary != null ? user.salary : 0;
    var pinVal = user.pin || user.passcode || null;
    try {
      run(
        "INSERT INTO Users (id, fullName, username, passwordHash, role, phone, isActive, createdAt, lastLogin, permissions, shiftStart, shiftEnd, shiftNotifyMinutes, employeeId, salary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [user.id, user.fullName, user.username, user.passwordHash, user.role, user.phone || null, user.isActive ? 1 : 0, user.createdAt, user.lastLogin || null, permVal || null, sStart, sEnd, sNotify, empId, salary]
      );
    } catch (e) {
      try {
        run(
          "INSERT INTO Users (id, fullName, username, passwordHash, role, phone, isActive, createdAt, lastLogin, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [user.id, user.fullName, user.username, user.passwordHash, user.role, user.phone || null, user.isActive ? 1 : 0, user.createdAt, user.lastLogin || null, permVal || null]
        );
      } catch (e2) {
        run(
          "INSERT INTO Users (id, fullName, username, passwordHash, role, phone, isActive, createdAt, lastLogin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [user.id, user.fullName, user.username, user.passwordHash, user.role, user.phone || null, user.isActive ? 1 : 0, user.createdAt, user.lastLogin || null]
        );
      }
    }
    if (pinVal) {
      try { updateUser(user.id, { pin: String(pinVal) }); } catch (e3) {}
    }
  }

  function updateUser(id, fields) {
    var sets = [];
    var params = [];
    Object.keys(fields).forEach(function (key) {
      sets.push(key + " = ?");
      var val = fields[key];
      if (key === "permissions" && val && typeof val === "object") {
        try { val = JSON.stringify(val); } catch (e) {}
      }
      params.push(val);
    });
    params.push(id);
    run("UPDATE Users SET " + sets.join(", ") + " WHERE id = ?", params);
  }

  function deleteUser(id) {
    run("DELETE FROM Users WHERE id = ?", [id]);
  }

  function countUsers() {
    var row = queryOne("SELECT COUNT(*) AS c FROM Users");
    return row ? row.c : 0;
  }

  function saveSession(session) {
    run("DELETE FROM Sessions");
    if (session) {
      run("INSERT INTO Sessions (id, userId, payload, createdAt) VALUES (?, ?, ?, ?)", [
        "active",
        session.id || session.username || "active",
        JSON.stringify(session),
        session.loggedInAt || new Date().toISOString()
      ]);
    }
    persistNow();
  }

  function getSession() {
    if (!db) return null;
    var row = queryOne("SELECT payload FROM Sessions WHERE id = 'active'");
    if (!row) return null;
    try { return JSON.parse(row.payload); } catch (e) { return null; }
  }

  function clearSession() {
    run("DELETE FROM Sessions");
  }

  function exportBinary() {
    persistNow();
    return db.export();
  }

  function importBinary(bytes) {
    db = new SQL.Database(bytes);
    createSchema();
    persistNow();
  }

  function isEmpty() {
    var products = queryOne("SELECT COUNT(*) AS c FROM Products");
    var users = queryOne("SELECT COUNT(*) AS c FROM Users");
    var jsonCount = queryOne("SELECT COUNT(*) AS c FROM JsonStore");
    var orders = queryOne("SELECT COUNT(*) AS c FROM Orders");
    return (products ? products.c : 0) === 0 &&
      (users ? users.c : 0) === 0 &&
      (jsonCount ? jsonCount.c : 0) === 0 &&
      (orders ? orders.c : 0) === 0;
  }

function resetDatabase() {
  db = new SQL.Database();
  createSchema();
  persistNow();
}

  return {
    init: init,
    persistNow: persistNow,
    isEmpty: isEmpty,
    resetDatabase: resetDatabase,
    replaceProducts: replaceProducts,
    getProducts: getProducts,
    replaceCategories: replaceCategories,
    getCategories: getCategories,
    replaceOrders: replaceOrders,
    getOrders: getOrders,
    replaceCollection: replaceCollection,
    getCollection: getCollection,
    setSetting: setSetting,
    getSetting: getSetting,
    getAllUsers: getAllUsers,
    getUserById: getUserById,
    getUserByUsername: getUserByUsername,
    insertUser: insertUser,
    updateUser: updateUser,
    deleteUser: deleteUser,
    countUsers: countUsers,
    saveSession: saveSession,
    getSession: getSession,
    clearSession: clearSession,
    exportBinary: exportBinary,
    importBinary: importBinary
  };
})();
