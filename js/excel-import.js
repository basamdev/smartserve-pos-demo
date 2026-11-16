/* ═══════════════════════════════════════════════════════════════════
   SAM MARKET POS — ENTERPRISE EXCEL & CSV BULK PRODUCT IMPORTER/EXPORTER
   Allows importing 1,000s of products in seconds with auto-column mapping
   ═══════════════════════════════════════════════════════════════════ */

var ExcelImporter = (function () {
  var parsedProducts = [];
  var rawFileName = "";

  // Safe parser for Excel numbers that handles thousands commas, currency symbols, and Arabic/Kurdish numerals
  function parseCleanNumber(val, defaultVal) {
    if (val === undefined || val === null || val === "") return (defaultVal !== undefined ? defaultVal : 0);
    if (typeof val === "number") return isNaN(val) ? (defaultVal || 0) : val;
    // Replace Eastern Arabic/Persian digits (٠-٩ / ۰-۹) with Latin digits (0-9)
    var str = String(val).trim()
      .replace(/[٠۰]/g, '0').replace(/[١۱]/g, '1').replace(/[٢۲]/g, '2').replace(/[٣۳]/g, '3')
      .replace(/[٤۴]/g, '4').replace(/[٥۵]/g, '5').replace(/[٦۶]/g, '6').replace(/[٧۷]/g, '7')
      .replace(/[٨۸]/g, '8').replace(/[٩۹]/g, '9')
      .replace(/,/g, "")
      .replace(/[^\d.-]/g, "");
    var n = parseFloat(str);
    return isNaN(n) ? (defaultVal !== undefined ? defaultVal : 0) : n;
  }

  // Helper to normalize column names across Kurdish, English, Arabic
  function normalizeKey(key) {
    if (!key) return "";
    var k = String(key).trim().toLowerCase().replace(/[\s\-_.:/\\()\[\]{}'"]+/g, "");
    
    // Barcode mappings (Kurdish, Arabic, English)
    if (k.indexOf("barcode") !== -1 || k.indexOf("bar_code") !== -1 || k.indexOf("بارکۆد") !== -1 || 
        k.indexOf("باركود") !== -1 || k.indexOf("کۆد") !== -1 || k.indexOf("كود") !== -1 || 
        k.indexOf("الرمز") !== -1 || k.indexOf("رمز") !== -1 || k === "code" || k === "id" || 
        k.indexOf("upc") !== -1 || k.indexOf("ean") !== -1 || k.indexOf("sku") !== -1) {
      if (k.indexOf("pack") === -1 && k.indexOf("carton") === -1 && k.indexOf("کارتۆن") === -1 && k.indexOf("كرتون") === -1) {
        return "barcode";
      }
    }

    // Carton / Pack Barcode
    if (k.indexOf("packbarcode") !== -1 || k.indexOf("cartonbarcode") !== -1 || 
        (k.indexOf("کارتۆن") !== -1 || k.indexOf("كرتون") !== -1) && (k.indexOf("بارکۆد") !== -1 || k.indexOf("باركود") !== -1 || k.indexOf("كود") !== -1 || k.indexOf("کۆد") !== -1)) {
      return "packBarcode";
    }

    // Pack Qty (کارتۆن چەند دانەیە / عدد في الكرتون)
    if (k.indexOf("packqty") !== -1 || k.indexOf("cartonqty") !== -1 || 
        (k.indexOf("کارتۆن") !== -1 || k.indexOf("كرتون") !== -1) && (k.indexOf("دانە") !== -1 || k.indexOf("qty") !== -1 || k.indexOf("عدد") !== -1 || k.indexOf("بڕ") !== -1 || k.indexOf("حبة") !== -1)) {
      return "packQty";
    }

    // Name mappings (Kurdish, Arabic, English)
    if (k.indexOf("name") !== -1 || k.indexOf("ناو") !== -1 || k.indexOf("اسم") !== -1 || 
        k.indexOf("title") !== -1 || k.indexOf("item") !== -1 || k.indexOf("ماد") !== -1 || 
        k.indexOf("کاڵا") !== -1 || k.indexOf("کالا") !== -1 || k.indexOf("بەرهەم") !== -1 || 
        k.indexOf("منتج") !== -1 || k.indexOf("سلع") !== -1 || k.indexOf("وصف") !== -1 || 
        k.indexOf("desc") !== -1 || k.indexOf("تفاصيل") !== -1) {
      if (k.indexOf("cat") === -1 && k.indexOf("پۆل") === -1 && k.indexOf("تصنيف") === -1 && k.indexOf("قسم") === -1) {
        return "name";
      }
    }

    // Cost mappings (Must be checked before general price!)
    if (k.indexOf("cost") !== -1 || k.indexOf("buy") !== -1 || k.indexOf("شراء") !== -1 || 
        k.indexOf("کڕین") !== -1 || k.indexOf("کرین") !== -1 || k.indexOf("سەرمایە") !== -1 || 
        k.indexOf("سرمایه") !== -1 || k.indexOf("تکلف") !== -1 || k.indexOf("تكلف") !== -1 || 
        k.indexOf("جملة") !== -1 || k.indexOf("جملە") !== -1) {
      return "cost";
    }

    // Sale Price mappings
    if (k.indexOf("price") !== -1 || k.indexOf("sell") !== -1 || k.indexOf("sale") !== -1 || 
        k.indexOf("نرخ") !== -1 || k.indexOf("سعر") !== -1 || k.indexOf("بيع") !== -1 || 
        k.indexOf("فرۆشتن") !== -1 || k.indexOf("فروشتن") !== -1 || k.indexOf("مفرد") !== -1 || 
        k.indexOf("تجزئ") !== -1) {
      return "price";
    }

    // Stock / Quantity mappings
    if (k.indexOf("stock") !== -1 || k.indexOf("qty") !== -1 || k.indexOf("quantity") !== -1 || 
        k.indexOf("count") !== -1 || k.indexOf("کۆگا") !== -1 || k.indexOf("کوگا") !== -1 || 
        k.indexOf("عەمار") !== -1 || k.indexOf("مخزن") !== -1 || k.indexOf("مخزون") !== -1 || 
        k.indexOf("رصيد") !== -1 || k.indexOf("بڕ") !== -1 || k.indexOf("بر") !== -1 || 
        k.indexOf("کمیت") !== -1 || k.indexOf("كمية") !== -1 || k.indexOf("عدد") !== -1 || 
        k.indexOf("موجود") !== -1 || k.indexOf("balance") !== -1) {
      return "stock";
    }

    // Category mappings
    if (k.indexOf("cat") !== -1 || k.indexOf("category") !== -1 || k.indexOf("پۆل") !== -1 || 
        k.indexOf("بەش") !== -1 || k.indexOf("تصنيف") !== -1 || k.indexOf("قسم") !== -1 || 
        k.indexOf("مجموع") !== -1 || k.indexOf("گروپ") !== -1 || k.indexOf("group") !== -1 || 
        k.indexOf("صنف") !== -1 || k.indexOf("جنس") !== -1) {
      return "cat";
    }

    // Unit mappings
    if (k.indexOf("unit") !== -1 || k.indexOf("یەکە") !== -1 || k.indexOf("یکە") !== -1 || 
        k.indexOf("وحدة") !== -1 || k.indexOf("وحد") !== -1 || k.indexOf("نوع") !== -1) {
      return "unit";
    }

    // Min alert mappings
    if (k.indexOf("minalert") !== -1 || k.indexOf("minstock") !== -1 || k.indexOf("کەمی") !== -1 || 
        k.indexOf("حدالطلب") !== -1 || k.indexOf("حدادنى") !== -1 || k.indexOf("حدالأدنى") !== -1) {
      return "minAlert";
    }

    return k;
  }

  // Format barcode string safely (avoid scientific notation)
  function cleanBarcode(val) {
    if (val === undefined || val === null) return "";
    var str = String(val).trim();
    if (str.indexOf("e+") !== -1 || str.indexOf("E+") !== -1) {
      try {
        var num = Number(str);
        if (!isNaN(num)) str = BigInt(Math.floor(num)).toString();
      } catch (e) {}
    }
    // Remove trailing .0 from Excel number floats
    str = str.replace(/\.0+$/, "");
    return str;
  }

  function bindDropZone() {
    var zone = document.getElementById("excelDropZone");
    if (!zone || zone.getAttribute("data-drop-bound") === "1") return;
    zone.setAttribute("data-drop-bound", "1");

    function highlight(on) {
      zone.style.borderColor = on ? "#10b981" : "";
      zone.style.background = on ? "rgba(16,185,129,0.12)" : "";
    }

    ["dragenter", "dragover"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        highlight(true);
      });
    });
    zone.addEventListener("dragleave", function (e) {
      e.preventDefault();
      highlight(false);
    });
    zone.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      highlight(false);
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
    zone.addEventListener("click", function (e) {
      if (e.target.closest("label, button, a, input")) return;
      var inp = document.getElementById("excelFileInput");
      if (inp) {
        inp.value = "";
        inp.click();
      }
    });

    if (!document.body.getAttribute("data-excel-drop-guard")) {
      document.body.setAttribute("data-excel-drop-guard", "1");
      document.addEventListener("dragover", function (e) {
        var modal = document.getElementById("excelImportModal");
        if (modal && modal.classList.contains("active")) e.preventDefault();
      });
      document.addEventListener("drop", function (e) {
        var modal = document.getElementById("excelImportModal");
        if (modal && modal.classList.contains("active")) e.preventDefault();
      });
    }
  }

  // Open Excel Import Modal
  function openModal() {
    parsedProducts = [];
    rawFileName = "";
    var modal = document.getElementById("excelImportModal");
    if (!modal) {
      if (typeof toast === "function") toast("هەڵە", "پەنجەرەی داغڵکردنی Excel نەدۆزرایەوە", "error");
      return;
    }
    if (typeof XLSX === "undefined") {
      if (typeof toast === "function") toast("هەڵە", "کتێبخانەی ئێکسڵ بارنەکراوە. POS نوێ بکەرەوە", "error");
      return;
    }

    var fileIn = document.getElementById("excelFileInput");
    if (fileIn) fileIn.value = "";

    var previewWrap = document.getElementById("excelPreviewWrap");
    if (previewWrap) previewWrap.style.display = "none";

    var dropZone = document.getElementById("excelDropZone");
    if (dropZone) dropZone.style.display = "block";

    var importBtn = document.getElementById("executeExcelImportBtn");
    if (importBtn) {
      importBtn.disabled = true;
      importBtn.innerHTML = '<i class="fas fa-file-import"></i> <span>داغڵکردنی بەرهەمەکان</span>';
    }

    bindDropZone();
    if (typeof fillFavGroupSelect === "function") fillFavGroupSelect(document.getElementById("excelFavCategory"), "");
    if (typeof showModal === "function") showModal("excelImportModal");
    else modal.classList.add("active");
  }

  function closeModal() {
    hideModal("excelImportModal");
  }

  // Handle file input / drag drop
  function handleFile(file) {
    if (!file) return;
    rawFileName = file.name;

    if (typeof XLSX === "undefined") {
      toast("هەڵە", "کتێبخانەی ئێکسڵ ئامادە نییە، تکایە پەڕەکە نوێ بکەرەوە", "error");
      return;
    }

    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        var workbook = XLSX.read(data, { type: "array" });
        var firstSheetName = workbook.SheetNames[0];
        var worksheet = workbook.Sheets[firstSheetName];
        var rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (!rawRows || rawRows.length === 0) {
          toast("ئاگاداری", "فایلی ئێکسڵەکە هیچ زانیارییەکی تێدا نەدۆزرایەوە", "warning");
          return;
        }

        processRawRows(rawRows);
      } catch (err) {
        console.error("Excel parse error:", err);
        toast("هەڵە لە خوێندنەوەی فایل", "تکایە دڵنیابەرەوە لە دروستی فایلی ئێکسڵ یان CSV", "error");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // Process rows and map columns
  function processRawRows(rows) {
    parsedProducts = [];
    var existingBarcodes = new Set();
    (DB.products || []).forEach(function (p) {
      if (p.barcode) existingBarcodes.add(String(p.barcode).trim());
    });

    var newCount = 0;
    var existCount = 0;

    rows.forEach(function (row, idx) {
      var item = {};
      Object.keys(row).forEach(function (col) {
        var mapped = normalizeKey(col);
        if (mapped) item[mapped] = row[col];
      });

      var barcode = cleanBarcode(item.barcode);
      var name = String(item.name || "").trim();
      var price = parseCleanNumber(item.price, 0);
      var cost = parseCleanNumber(item.cost, 0);
      var stock = parseCleanNumber(item.stock, 100);
      var cat = String(item.cat || "").trim();
      if (typeof resolveProductCategoryId === "function") cat = resolveProductCategoryId(cat);
      var unit = String(item.unit || "piece").trim();
      var packBarcode = cleanBarcode(item.packBarcode);
      var packQty = parseCleanNumber(item.packQty, 1);
      var minAlert = parseCleanNumber(item.minAlert, 5);

      // If no name but has barcode or vice versa
      if (!name && barcode) name = "کاڵا " + barcode;
      if (!name && !barcode) return; // skip blank rows

      var isExisting = barcode && existingBarcodes.has(barcode);
      if (isExisting) existCount++;
      else newCount++;

      parsedProducts.push({
        id: item.id || ("p_ex_" + Date.now() + "_" + idx),
        barcode: barcode,
        name: name,
        price: price,
        cost: cost,
        stock: stock,
        cat: cat,
        unit: unit,
        packBarcode: packBarcode,
        packQty: packQty,
        minAlert: minAlert,
        isExisting: isExisting
      });
    });

    if (parsedProducts.length === 0) {
      toast("ئاگاداری", "هیچ بەرهەمێکی دروست نەدۆزرایەوە لەناو فایلەکە", "warning");
      return;
    }

    renderPreview(newCount, existCount);
  }

  // Render stats and preview table
  function renderPreview(newCount, existCount) {
    var previewWrap = document.getElementById("excelPreviewWrap");
    var dropZone = document.getElementById("excelDropZone");
    var fileNameEl = document.getElementById("excelFileName");
    var totalBadge = document.getElementById("excelTotalFoundBadge");
    var newBadge = document.getElementById("excelNewBadge");
    var existBadge = document.getElementById("excelExistBadge");
    var previewBody = document.getElementById("excelPreviewTableBody");
    var importBtn = document.getElementById("executeExcelImportBtn");

    if (fileNameEl) fileNameEl.textContent = rawFileName + " (" + parsedProducts.length + " کاڵا)";
    if (totalBadge) totalBadge.textContent = fmt(parsedProducts.length);
    if (newBadge) newBadge.textContent = fmt(newCount);
    if (existBadge) existBadge.textContent = fmt(existCount);

    if (previewBody) {
      var html = "";
      var slice = parsedProducts.slice(0, 6);
      slice.forEach(function (p, i) {
        var statusBadge = p.isExisting
          ? '<span style="background:rgba(245,158,11,0.2);color:#f59e0b;padding:2px 6px;border-radius:4px;font-size:0.75rem;">نوێکردنەوە</span>'
          : '<span style="background:rgba(16,185,129,0.2);color:#10b981;padding:2px 6px;border-radius:4px;font-size:0.75rem;">نوێ</span>';
        html += '<tr>' +
          '<td>' + (i + 1) + '</td>' +
          '<td><code style="color:#38bdf8;font-weight:700;">' + (p.barcode || "—") + '</code></td>' +
          '<td style="font-weight:700;color:#fff;">' + p.name + '</td>' +
          '<td style="color:#10b981;font-weight:800;">' + fmt(p.price) + ' د.ع</td>' +
          '<td style="color:#94a3b8;">' + fmt(p.cost) + ' د.ع</td>' +
          '<td>' + p.stock + ' ' + (p.unit === "carton" ? "کارتۆن" : "دانە") + '</td>' +
          '<td>' + p.cat + '</td>' +
          '<td>' + statusBadge + '</td>' +
          '</tr>';
      });
      previewBody.innerHTML = html;
    }

    if (dropZone) dropZone.style.display = "none";
    if (previewWrap) previewWrap.style.display = "block";

    if (importBtn) {
      importBtn.disabled = false;
      importBtn.innerHTML = '<i class="fas fa-check-circle"></i> <span>داغڵکردنی (' + fmt(parsedProducts.length) + ') بەرهەم</span>';
    }
  }

  // Execute Bulk Import
  function executeImport() {
    if (!parsedProducts || parsedProducts.length === 0) return;

    var updateExistingCheck = document.getElementById("excelUpdateExistingCheck");
    var updateExisting = updateExistingCheck ? updateExistingCheck.checked : true;

    var importBtn = document.getElementById("executeExcelImportBtn");
    if (importBtn) {
      importBtn.disabled = true;
      importBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>تکایە چاوەڕێبە، داغڵ دەکرێت...</span>';
    }

    // Prepare payload
    var payloadProducts = parsedProducts.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        price: p.price,
        cost: p.cost,
        stock: p.stock,
        cat: p.cat,
        unit: p.unit,
        packBarcode: p.packBarcode,
        packQty: p.packQty,
        minAlert: p.minAlert
      };
    });

    // 1. Sync to backend SQLite server (supports multi-laptop & LAN setups)
    var bulkUrl = (typeof ApiClient !== "undefined" && ApiClient.getBaseUrl)
      ? (ApiClient.getBaseUrl() + "/api/products/bulk")
      : "/api/products/bulk";

    fetch(bulkUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        products: payloadProducts,
        updateExisting: updateExisting
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        applyImportToMemory(updateExisting);
        closeModal();
        var msg = "داغڵکردن سەرکەوتوو بوو! (" + fmt(res.inserted || 0) + " کاڵای نوێ، " + fmt(res.updated || 0) + " کاڵا نوێکرایەوە)";
        toast("سەرکەوتوو", msg, "success");
      })
      .catch(function (err) {
        console.warn("Backend bulk import fallback to local storage:", err);
        applyImportToMemory(updateExisting);
        closeModal();
        toast("سەرکەوتوو", "داغڵکردن بە سەرکەوتوویی لە داتابەیسی لۆکاڵ پاشەکەوت کرا", "success");
      });
  }

  // Update in-memory DB and save to DataStore
  function applyImportToMemory(updateExisting) {
    if (!DB.products) DB.products = [];
    var favEl = document.getElementById("excelFavCategory");
    var favId = favEl ? String(favEl.value || "").trim() : "";
    if (favId === "__new__" && typeof addNamedFavCategory === "function") {
      favId = addNamedFavCategory(true) || "";
    }
    if (favId === "__new__") favId = "";
    var pinNew = !!favId;
    var pinStamp = Date.now();

    parsedProducts.forEach(function (p, idx) {
      var existing = null;
      if (p.barcode) {
        existing = DB.products.find(function (item) { return String(item.barcode).trim() === p.barcode; });
      }
      if (!existing && p.id) {
        existing = DB.products.find(function (item) { return item.id === p.id; });
      }

      if (existing) {
        if (updateExisting) {
          existing.name = p.name || existing.name;
          existing.price = p.price;
          if (p.cost > 0) existing.cost = p.cost;
          existing.stock = p.stock;
          if (p.cat) existing.cat = p.cat;
          if (p.unit) existing.unit = p.unit;
          if (p.packBarcode) existing.packBarcode = p.packBarcode;
          if (p.packQty > 1) existing.packQty = p.packQty;
        }
      } else {
        DB.products.push({
          id: p.id || gid(),
          name: p.name,
          barcode: p.barcode,
          price: p.price,
          cost: p.cost,
          stock: p.stock,
          cat: (typeof resolveProductCategoryId === "function") ? resolveProductCategoryId(p.cat) : (p.cat || ""),
          unit: p.unit || "piece",
          packBarcode: p.packBarcode || "",
          packQty: p.packQty || 1,
          minAlert: p.minAlert || 5,
          image: "",
          quickFavorite: pinNew ? 1 : 0,
          quickFavoriteAt: pinNew ? (pinStamp + idx) : 0,
          favCatId: pinNew ? favId : ""
        });
      }
    });

    if (typeof DataStore !== "undefined" && DataStore.saveProducts) {
      DataStore.saveProducts();
    }

    if (typeof renderProducts === "function") renderProducts();
    if (typeof renderProductGrid === "function") renderProductGrid(typeof POS_GRID_CATEGORY !== "undefined" ? POS_GRID_CATEGORY : "all");
    if (typeof renderPosQuickRow === "function") renderPosQuickRow();
    if (typeof renderInventoryTable === "function") renderInventoryTable();
  }

  // Download official sample Excel template
  function downloadTemplate() {
    if (typeof XLSX === "undefined") {
      toast("هەڵە", "کتێبخانەی ئێکسڵ بارنەکراوە", "error");
      return;
    }

    var sampleData = [
      {
        "بارکۆد (Barcode)": "8690504011234",
        "ناوی کاڵا (Name)": "کێک لۆتوس ١٢ دانەیی",
        "نرخی فرۆشتن (Price)": 3500,
        "نرخی کڕین (Cost)": 2750,
        "بڕی کۆگا (Stock)": 50,
        "پۆل (Category)": "شیرینی",
        "یەکە (Unit)": "piece",
        "بارکۆدی کارتۆن (Pack Barcode)": "8690504011234-C",
        "دانە لە کارتۆن (Pack Qty)": 12,
        "سنوری کەمی کۆگا (Min Alert)": 5
      },
      {
        "بارکۆد (Barcode)": "5000112630429",
        "ناوی کاڵا (Name)": "چپس لێیز پەتاتە گەورە",
        "نرخی فرۆشتن (Price)": 1000,
        "نرخی کڕین (Cost)": 750,
        "بڕی کۆگا (Stock)": 120,
        "پۆل (Category)": "چپس و سووکەژەم",
        "یەکە (Unit)": "piece",
        "بارکۆدی کارتۆن (Pack Barcode)": "5000112630429-C",
        "دانە لە کارتۆن (Pack Qty)": 24,
        "سنوری کەمی کۆگا (Min Alert)": 10
      },
      {
        "بارکۆد (Barcode)": "6291102830114",
        "ناوی کاڵا (Name)": "ئاو گۆڵدن ٥٠٠ مل",
        "نرخی فرۆشتن (Price)": 250,
        "نرخی کڕین (Cost)": 150,
        "بڕی کۆگا (Stock)": 300,
        "پۆل (Category)": "خواردنەوەکان",
        "یەکە (Unit)": "piece",
        "بارکۆدی کارتۆن (Pack Barcode)": "6291102830114-C",
        "دانە لە کارتۆن (Pack Qty)": 24,
        "سنوری کەمی کۆگا (Min Alert)": 20
      },
      {
        "بارکۆد (Barcode)": "8691062002345",
        "ناوی کاڵا (Name)": "زەیتی زەیتوون زێر ١ لیتر",
        "نرخی فرۆشتن (Price)": 6000,
        "نرخی کڕین (Cost)": 4800,
        "بڕی کۆگا (Stock)": 40,
        "پۆل (Category)": "زەیت و خواردەمەنی",
        "یەکە (Unit)": "piece",
        "بارکۆدی کارتۆن (Pack Barcode)": "8691062002345-C",
        "دانە لە کارتۆن (Pack Qty)": 12,
        "سنوری کەمی کۆگا (Min Alert)": 5
      }
    ];

    var ws = XLSX.utils.json_to_sheet(sampleData);
    // Set column widths
    ws["!cols"] = [
      { wch: 20 }, // Barcode
      { wch: 32 }, // Name
      { wch: 18 }, // Price
      { wch: 18 }, // Cost
      { wch: 14 }, // Stock
      { wch: 20 }, // Category
      { wch: 12 }, // Unit
      { wch: 22 }, // Pack Barcode
      { wch: 18 }, // Pack Qty
      { wch: 18 }  // Min Alert
    ];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "نموونەی بەرهەمەکان");
    XLSX.writeFile(wb, "نموونەی_فایلی_ئێکسڵ_بۆ_داغڵکردنی_بەرهەمەکان.xlsx");
    toast("سەرکەوتوو", "فایلی نموونەی ئێکسڵ دابەزی، دەتوانیت بەرهەمەکانت تێدا بنووسیت", "success");
  }

  // Export current products to Excel
  function exportProducts() {
    if (typeof XLSX === "undefined") {
      toast("هەڵە", "کتێبخانەی ئێکسڵ بارنەکراوە", "error");
      return;
    }

    var list = DB.products || [];
    if (list.length === 0) {
      toast("ئاگاداری", "هیچ بەرهەمێک لە سیستەمدا نییە بۆ هەناردەکردن", "warning");
      return;
    }

    var exportRows = list.map(function (p) {
      return {
        "بارکۆد": p.barcode || "",
        "ناوی کاڵا": p.name || "",
        "نرخی فرۆشتن": p.price || 0,
        "نرخی کڕین (سەرمایە)": p.cost || 0,
        "بڕی کۆگا": p.stock || 0,
        "پۆل": p.cat || "گشتی",
        "یەکە": p.unit || "piece",
        "بارکۆدی کارتۆن": p.packBarcode || "",
        "دانە لە کارتۆن": p.packQty || 1,
        "سنوری کەمی": p.minAlert || 5,
        "بەرواری بەسەرچوون": p.expiryDate || ""
      };
    });

    var ws = XLSX.utils.json_to_sheet(exportRows);
    ws["!cols"] = [
      { wch: 20 }, { wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 12 },
      { wch: 18 }, { wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 18 }
    ];

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "بەرهەمەکان");
    var todayStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, "هەموو_بەرهەمەکانی_مارکێت_" + todayStr + ".xlsx");
    toast("سەرکەوتوو", "فایلی ئێکسڵی " + list.length + " کاڵا بە سەرکەوتوویی هەناردە کرا", "success");
  }

  return {
    openModal: openModal,
    closeModal: closeModal,
    handleFile: handleFile,
    downloadTemplate: downloadTemplate,
    exportProducts: exportProducts,
    executeImport: executeImport
  };
})();

// Global shortcuts
window.openExcelImportModal = ExcelImporter.openModal;
window.closeExcelImportModal = ExcelImporter.closeModal;
window.downloadExcelTemplate = ExcelImporter.downloadTemplate;
window.exportProductsToExcel = ExcelImporter.exportProducts;
window.executeExcelImport = ExcelImporter.executeImport;
