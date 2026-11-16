/**
 * BarcodeGen - High Precision Client-Side Barcode & Shelf Label Generator
 * Native vector SVG barcode generator for Code-128 and EAN-13
 * Zero external dependencies, 100% scannable by physical barcode scanners
 */
(function (global) {
  'use strict';

  // Standard Code-128 run-length patterns for values 0-106
  // Patterns represent alternating bar and space widths (sum = 11 modules, stop = 13)
  var C128_PATTERNS = [
    '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
    '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
    '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
    '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
    '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
    '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
    '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
    '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
    '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
    '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
    '114131','311141','411131','211412','211214','211232','2331112'
  ];

  // Standard EAN-13 digit patterns
  // L-code, G-code, R-code (7 modules each)
  var EAN_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
  var EAN_G = ['0100111','0110011','0011011','0100001','0011101','0111101','0000101','0010001','0001001','0010111'];
  var EAN_R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];

  // Parity selection table based on 1st digit of EAN-13
  var EAN_STRUCTURE = [
    'LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG',
    'LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'
  ];

  /**
   * Generates Code-128 SVG string
   * @param {string} text - text to encode
   * @param {object} options - height, barWidth, quietZone, showText
   */
  function code128Svg(text, options) {
    options = options || {};
    var height = options.height || 50;
    var barWidth = options.barWidth || 2;
    var quietZone = options.quietZone !== undefined ? options.quietZone : 10;
    var showText = options.showText !== undefined ? options.showText : true;
    var fontSize = options.fontSize || 12;
    var barColor = options.barColor || options.color || "#000000";
    var bgColor = options.bgColor || "#ffffff";

    var cleanText = String(text || '').trim();
    if (!cleanText) cleanText = '0';

    // Start with Code 128 Set B (covers all ASCII 32-126)
    var codes = [104]; // Start B
    for (var i = 0; i < cleanText.length; i++) {
      var charCode = cleanText.charCodeAt(i);
      if (charCode >= 32 && charCode <= 126) {
        codes.push(charCode - 32);
      } else {
        codes.push(0); // fallback space
      }
    }

    // Checksum: (start + sum(i * code[i])) % 103
    var checksum = codes[0];
    for (var k = 1; k < codes.length; k++) {
      checksum += codes[k] * k;
    }
    codes.push(checksum % 103);
    codes.push(106); // Stop pattern

    // Build binary module string
    var moduleString = '';
    for (var q = 0; q < quietZone; q++) moduleString += '0';

    for (var c = 0; c < codes.length; c++) {
      var pat = C128_PATTERNS[codes[c]];
      if (!pat) continue;
      for (var p = 0; p < pat.length; p++) {
        var run = parseInt(pat[p], 10);
        var isBar = (p % 2 === 0);
        for (var r = 0; r < run; r++) {
          moduleString += isBar ? '1' : '0';
        }
      }
    }

    for (var q2 = 0; q2 < quietZone; q2++) moduleString += '0';

    // Build SVG rectangles
    var totalModules = moduleString.length;
    var svgWidth = totalModules * barWidth;
    var totalHeight = showText ? (height + fontSize + 4) : height;

    var rects = '';
    var inBar = false;
    var barStart = 0;

    for (var m = 0; m < totalModules; m++) {
      var is1 = (moduleString[m] === '1');
      if (is1 && !inBar) {
        inBar = true;
        barStart = m;
      } else if (!is1 && inBar) {
        inBar = false;
        var barLen = m - barStart;
        rects += '<rect x="' + (barStart * barWidth) + '" y="0" width="' + (barLen * barWidth) + '" height="' + height + '" fill="' + barColor + '"/>';
      }
    }
    if (inBar) {
      var barLenFinal = totalModules - barStart;
      rects += '<rect x="' + (barStart * barWidth) + '" y="0" width="' + (barLenFinal * barWidth) + '" height="' + height + '" fill="' + barColor + '"/>';
    }

    var textElement = '';
    if (showText) {
      var label = options.text != null ? String(options.text) : cleanText;
      textElement = '<text x="' + (svgWidth / 2) + '" y="' + (height + fontSize + 1) + '" text-anchor="middle" font-family="monospace,Courier,sans-serif" font-size="' + fontSize + 'px" font-weight="600" fill="' + barColor + '" letter-spacing="2px" direction="ltr" unicode-bidi="isolate">' + escapeHtml(label) + '</text>';
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + svgWidth + ' ' + totalHeight + '" direction="ltr" style="max-width:100%;height:auto;display:block;margin:0 auto;background:' + bgColor + ';direction:ltr;unicode-bidi:isolate;">' +
           '<rect width="100%" height="100%" fill="' + bgColor + '"/>' +
           rects +
           textElement +
           '</svg>';
  }

  /**
   * Generates EAN-13 SVG string
   * @param {string} digits12or13 - 12 or 13 numeric digits
   * @param {object} options - height, barWidth, showText
   */
  function ean13Svg(digits12or13, options) {
    options = options || {};
    var height = options.height || 50;
    var barWidth = options.barWidth || 2;
    var showText = options.showText !== undefined ? options.showText : true;
    var fontSize = options.fontSize || 12;
    var barColor = options.barColor || options.color || "#000000";
    var bgColor = options.bgColor || "#ffffff";

    var raw = String(digits12or13 || '').replace(/\D/g, '');
    if (raw.length < 12) {
      // Fallback to Code 128 if not enough digits
      return code128Svg(digits12or13, options);
    }
    var digits = raw.slice(0, 12);
    // Calculate check digit
    var sum = 0;
    for (var i = 0; i < 12; i++) {
      var val = parseInt(digits[i], 10);
      sum += (i % 2 === 0) ? val : (val * 3);
    }
    var checkDigit = (10 - (sum % 10)) % 10;
    var full13 = digits + checkDigit;

    var first = parseInt(full13[0], 10);
    var parity = EAN_STRUCTURE[first];
    var leftDigits = full13.slice(1, 7);
    var rightDigits = full13.slice(7, 13);

    // Build binary string
    var moduleString = '0000000'; // 7 quiet zone
    moduleString += '101'; // Left guard

    // Left 6 digits
    for (var l = 0; l < 6; l++) {
      var d = parseInt(leftDigits[l], 10);
      var pType = parity[l];
      moduleString += (pType === 'L') ? EAN_L[d] : EAN_G[d];
    }

    moduleString += '01010'; // Center guard

    // Right 6 digits
    for (var r = 0; r < 6; r++) {
      var rd = parseInt(rightDigits[r], 10);
      moduleString += EAN_R[rd];
    }

    moduleString += '101'; // Right guard
    moduleString += '0000000'; // 7 quiet zone

    var totalModules = moduleString.length;
    var svgWidth = totalModules * barWidth;
    var totalHeight = showText ? (height + fontSize + 4) : height;

    var rects = '';
    var inBar = false;
    var barStart = 0;

    for (var m = 0; m < totalModules; m++) {
      var is1 = (moduleString[m] === '1');
      if (is1 && !inBar) {
        inBar = true;
        barStart = m;
      } else if (!is1 && inBar) {
        inBar = false;
        var barLen = m - barStart;
        rects += '<rect x="' + (barStart * barWidth) + '" y="0" width="' + (barLen * barWidth) + '" height="' + height + '" fill="' + barColor + '"/>';
      }
    }
    if (inBar) {
      var barLenFinal = totalModules - barStart;
      rects += '<rect x="' + (barStart * barWidth) + '" y="0" width="' + (barLenFinal * barWidth) + '" height="' + height + '" fill="' + barColor + '"/>';
    }

    var textElement = '';
    if (showText) {
      var formatted = full13[0] + ' ' + full13.slice(1, 7) + ' ' + full13.slice(7, 13);
      textElement = '<text x="' + (svgWidth / 2) + '" y="' + (height + fontSize + 1) + '" text-anchor="middle" font-family="monospace,Courier,sans-serif" font-size="' + fontSize + 'px" font-weight="600" fill="' + barColor + '" letter-spacing="2px" direction="ltr" unicode-bidi="isolate">' + formatted + '</text>';
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + svgWidth + ' ' + totalHeight + '" direction="ltr" style="max-width:100%;height:auto;display:block;margin:0 auto;background:' + bgColor + ';direction:ltr;unicode-bidi:isolate;">' +
           '<rect width="100%" height="100%" fill="' + bgColor + '"/>' +
           rects +
           textElement +
           '</svg>';
  }

  /**
   * Auto pick format (EAN-13 if 12-13 digits, else Code-128)
   */
  function autoBarcodeSvg(text, options) {
    var clean = String(text || '').trim();
    if (/^\d{12,13}$/.test(clean)) {
      return ean13Svg(clean, options);
    }
    return code128Svg(clean, options);
  }

  /**
   * Helper: Escape HTML
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Format currency
   */
  function formatMoney(amount) {
    return Number(amount || 0).toLocaleString('en-US');
  }

  function hexColorOk(v) {
    return /^#[0-9a-fA-F]{6}$/.test(String(v || "").trim());
  }

  function paperLuma(hex) {
    var h = String(hex || "#ffffff").replace("#", "");
    var r = parseInt(h.slice(0, 2), 16) || 0;
    var g = parseInt(h.slice(2, 4), 16) || 0;
    var b = parseInt(h.slice(4, 6), 16) || 0;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function getLabelPaperColors() {
    var paper = "#ffffff";
    var ink = "#000000";
    try {
      var s = (typeof DB !== "undefined" && DB.settings) ? DB.settings : null;
      if (s && s.labelColors) {
        if (hexColorOk(s.labelColors.paper)) paper = String(s.labelColors.paper).toLowerCase();
        if (hexColorOk(s.labelColors.ink)) ink = String(s.labelColors.ink).toLowerCase();
      } else if (s && s.barcodeDesign && s.barcodeDesign.canvas && hexColorOk(s.barcodeDesign.canvas.bg)) {
        paper = String(s.barcodeDesign.canvas.bg).toLowerCase();
      }
    } catch (eC) {}
    return {
      paper: paper,
      ink: ink,
      bar: paperLuma(paper) < 150 ? "#ffffff" : "#000000"
    };
  }

  function barcodeDrawOpts(options) {
    var t = getLabelPaperColors();
    options = options || {};
    if (!options.bgColor) options.bgColor = t.paper;
    if (!options.barColor && !options.color) options.barColor = t.bar;
    return options;
  }

  function nameBlock(cls, text, style) {
    return '<div class="' + cls + '" dir="auto" style="unicode-bidi:plaintext;text-align:center;' + (style || '') + '">' + escapeHtml(text || '') + '</div>';
  }

  function ltrSpan(cls, text, style) {
    return '<span class="' + cls + '" dir="ltr" style="unicode-bidi:isolate;direction:ltr;' + (style || '') + '">' + text + '</span>';
  }

  /**
   * Render single Thermal Product Sticker (40x25mm / 50x30mm)
   */
  function renderThermalStickerHtml(product, settings, opts) {
    opts = opts || {};
    var marketName = (typeof getStoreName === 'function')
      ? getStoreName()
      : ((settings && settings.marketName && !/سام\s*مارکێت|sam\s*market/i.test(String(settings.marketName))) ? settings.marketName : 'مارکێت');
    var code = product.barcode || product.id || '0000';
    var priceIQD = formatMoney(product.price) + ' د.ع';
    var showStoreName = opts.showStoreName !== false;
    var showProductName = opts.showProductName !== false;
    var showPrice = opts.showPrice !== false;
    var showUSD = opts.showUSD === true;
    var showExpiry = opts.showExpiry === true && product.expiryDate;
    var showBarcodeDigits = opts.showBarcodeDigits !== false;

    var exchangeRate = (settings && settings.exchangeRate) || 1500;
    var priceUSD = '$' + (product.price / exchangeRate).toFixed(2);

    var rollW = opts.rollWidth || 40;
    var rollH = opts.rollHeight || 25;
    var namePt = (rollW >= 60) ? 16 : (rollW >= 50) ? 14 : 12;
    var pricePt = (rollW >= 60) ? 20 : (rollW >= 50) ? 18 : 15;
    var bcHeight = (rollH >= 40) ? 28 : (rollH >= 30) ? 24 : 20;

    var theme = getLabelPaperColors();
    var barcodeSvg = autoBarcodeSvg(code, barcodeDrawOpts({
      height: bcHeight,
      barWidth: (rollW >= 50) ? 1.7 : 1.4,
      quietZone: 6,
      showText: showBarcodeDigits,
      fontSize: 9
    }));

    return '<div class="label-item label-thermal" dir="ltr" style="' +
      'width:' + rollW + 'mm;min-height:' + rollH + 'mm;max-width:' + rollW + 'mm;box-sizing:border-box;' +
      'padding:1.4mm 1.4mm;background:' + theme.paper + ';color:' + theme.ink + ';' +
      'font-family:Tahoma,Arial,sans-serif;text-align:center;' +
      'display:flex;flex-direction:column;justify-content:flex-start;' +
      'border:1px dashed ' + theme.bar + ';position:relative;page-break-inside:avoid;overflow:hidden;' +
      '">' +
      (showStoreName ? nameBlock('thermal-store', marketName, 'font-size:6pt;font-weight:700;line-height:1.1;color:' + theme.ink + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;') : '') +
      (showProductName ? nameBlock('thermal-name', product.name || '', 'font-size:' + namePt + 'pt;font-weight:900;line-height:1.08;margin:0.3mm 0 0.5mm;color:' + theme.ink + ';word-break:break-word;') : '') +
      '<div class="thermal-price-row" dir="ltr" style="display:flex;justify-content:center;align-items:baseline;flex-wrap:wrap;gap:4px;margin:0 0 1mm;padding-bottom:0.7mm;border-bottom:1.5px solid ' + theme.ink + ';direction:ltr;unicode-bidi:isolate;">' +
        (showPrice ? ltrSpan('thermal-price', priceIQD, 'font-size:' + pricePt + 'pt;font-weight:900;color:' + theme.ink + ';line-height:1;letter-spacing:-0.3px;') : '') +
        (showUSD ? ltrSpan('thermal-usd', priceUSD, 'font-size:8pt;font-weight:800;color:' + theme.ink + ';') : '') +
      '</div>' +
      '<div class="thermal-bc" dir="ltr" style="width:100%;margin:0.4mm 0 0;display:flex;justify-content:center;direction:ltr;unicode-bidi:isolate;">' + barcodeSvg + '</div>' +
      (showExpiry ? '<div style="font-size:6pt;font-weight:700;color:' + theme.ink + ';margin-top:0.3mm;">Exp: ' + escapeHtml(product.expiryDate) + '</div>' : '') +
    '</div>';
  }

  /**
   * Render single Shelf Edge Price Tag (60x40mm)
   * Bold, clear, highly legible for supermarket shelves
   */
  function renderShelfTagHtml(product, settings, opts) {
    opts = opts || {};
    var marketName = (typeof getStoreName === 'function')
      ? getStoreName()
      : ((settings && settings.marketName && !/سام\s*مارکێت|sam\s*market/i.test(String(settings.marketName))) ? settings.marketName : 'مارکێت');
    var code = product.barcode || product.id || '0000';
    var priceNum = formatMoney(product.price);
    var showStoreName = opts.showStoreName !== false;
    var showProductName = opts.showProductName !== false;
    var showUSD = opts.showUSD !== false;
    var showExpiry = opts.showExpiry === true && product.expiryDate;
    var showBarcodeDigits = opts.showBarcodeDigits !== false;

    var exchangeRate = (settings && settings.exchangeRate) || 1500;
    var priceUSD = '$' + (product.price / exchangeRate).toFixed(2);
    var unitStr = product.unit === 'kg' ? 'کگم' : (product.unit || 'دانە');
    var catStr = product.cat || '';

    var theme = getLabelPaperColors();
    var barcodeSvg = autoBarcodeSvg(code, barcodeDrawOpts({
      height: 22,
      barWidth: 1.4,
      quietZone: 5,
      showText: showBarcodeDigits,
      fontSize: 8
    }));

    var todayStr = new Date().toISOString().split('T')[0];

    return '<div class="label-item label-shelf" dir="ltr" style="' +
      'width:60mm;min-height:40mm;max-width:60mm;box-sizing:border-box;' +
      'padding:1.6mm 2mm;background:' + theme.paper + ';color:' + theme.ink + ';' +
      'font-family:Tahoma,Arial,sans-serif;text-align:center;' +
      'display:flex;flex-direction:column;justify-content:flex-start;' +
      'border:2px solid ' + theme.ink + ';position:relative;page-break-inside:avoid;overflow:hidden;' +
      '">' +
      (showStoreName ? nameBlock('shelf-store', marketName + (catStr ? ' · ' + catStr : ''), 'font-size:6.5pt;font-weight:700;color:' + theme.ink + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;') : '') +
      (showProductName ? nameBlock('shelf-name', product.name || '', 'font-size:14pt;font-weight:900;line-height:1.08;color:' + theme.ink + ';word-break:break-word;margin:0.3mm 0 0.5mm;') : '') +
      '<div class="shelf-price-row" dir="ltr" style="display:flex;justify-content:center;align-items:baseline;flex-wrap:wrap;gap:5px;margin:0 0 1mm;padding-bottom:0.8mm;border-bottom:2px solid ' + theme.ink + ';direction:ltr;unicode-bidi:isolate;">' +
        ltrSpan('shelf-price', priceNum + ' <span style="font-size:11pt;">د.ع</span>', 'font-size:20pt;font-weight:900;color:' + theme.ink + ';line-height:1;') +
        (showUSD ? ltrSpan('shelf-usd', priceUSD, 'font-size:10pt;font-weight:800;color:' + theme.ink + ';') : '') +
      '</div>' +
      '<div class="shelf-bc" dir="ltr" style="width:100%;display:flex;justify-content:center;direction:ltr;unicode-bidi:isolate;">' + barcodeSvg + '</div>' +
      '<div style="font-size:6pt;color:' + theme.ink + ';line-height:1.2;margin-top:0.4mm;">' +
        escapeHtml(unitStr) +
        (showExpiry ? ' · Exp: ' + escapeHtml(product.expiryDate) : '') +
        ' · ' + todayStr +
      '</div>' +
    '</div>';
  }

  /**
   * Render Weighing Scale Product Label (Scale Barcode 20xxxxx)
   */
  function renderScaleLabelHtml(product, settings, opts) {
    opts = opts || {};
    var marketName = (typeof getStoreName === 'function')
      ? getStoreName()
      : ((settings && settings.marketName && !/سام\s*مارکێت|sam\s*market/i.test(String(settings.marketName))) ? settings.marketName : 'مارکێت');
    var weightKg = opts.scaleWeight || 1.000;
    var unitPrice = product.price || 0;
    var totalPrice = Math.round(unitPrice * weightKg);
    var itemCode = String(product.scaleCode || product.barcode || product.id || '1').replace(/\D/g, '').slice(-5).padStart(5, '0');
    var weightGramStr = String(Math.round(weightKg * 1000)).padStart(5, '0');
    var scaleBarcode = '20' + itemCode + weightGramStr; // 12 digits -> autoBarcodeSvg(ean13Svg) appends 13th check digit

    var theme = getLabelPaperColors();
    var barcodeSvg = autoBarcodeSvg(scaleBarcode, barcodeDrawOpts({
      height: 24,
      barWidth: 1.4,
      quietZone: 5,
      showText: true,
      fontSize: 8
    }));

    return '<div class="label-item label-scale" dir="ltr" style="' +
      'width:50mm;min-height:35mm;max-width:50mm;box-sizing:border-box;' +
      'padding:1.6mm;background:' + theme.paper + ';color:' + theme.ink + ';' +
      'font-family:Tahoma,Arial,sans-serif;text-align:center;' +
      'display:flex;flex-direction:column;justify-content:flex-start;' +
      'border:1px solid ' + theme.ink + ';position:relative;page-break-inside:avoid;overflow:hidden;' +
      '">' +
      nameBlock('scale-store', marketName + ' · تەرازوو', 'font-size:6.5pt;font-weight:700;color:' + theme.ink + ';') +
      ((opts.showProductName !== false) ? nameBlock('scale-name', product.name || '', 'font-size:13pt;font-weight:900;line-height:1.08;margin:0.4mm 0 0.5mm;color:' + theme.ink + ';word-break:break-word;') : '') +
      '<div class="scale-price-row" dir="ltr" style="margin:0 0 1mm;padding-bottom:0.7mm;border-bottom:2px solid ' + theme.ink + ';direction:ltr;unicode-bidi:isolate;">' +
        '<div class="scale-price" dir="ltr" style="font-size:18pt;font-weight:900;line-height:1;color:' + theme.ink + ';direction:ltr;unicode-bidi:isolate;">' + formatMoney(totalPrice) + ' د.ع</div>' +
      '</div>' +
      '<div style="font-size:7pt;font-weight:700;color:' + theme.ink + ';margin-bottom:0.6mm;">' +
        'کێش ' + weightKg.toFixed(3) + ' کگم · نرخی کگم ' + formatMoney(unitPrice) +
      '</div>' +
      '<div class="scale-bc" style="width:100%;">' + barcodeSvg + '</div>' +
    '</div>';
  }

  /**
   * QR ticket for 80mm thermal labels: compact QR, large name + price.
   */
  function renderQrStickerHtml(product, settings, opts) {
    opts = opts || {};
    var marketName = (typeof getStoreName === 'function')
      ? getStoreName()
      : ((settings && settings.marketName && !/سام\s*مارکێت|sam\s*market/i.test(String(settings.marketName))) ? settings.marketName : 'مارکێت');
    var code = String(product.barcode || product.id || '0000');
    var priceIQD = formatMoney(product.price) + ' د.ع';
    var showStoreName = opts.showStoreName !== false;
    var showProductName = opts.showProductName !== false;
    var showPrice = opts.showPrice !== false;
    var showUSD = opts.showUSD === true;
    var showExpiry = opts.showExpiry === true && product.expiryDate;
    var showDigits = opts.showBarcodeDigits !== false;

    var exchangeRate = (settings && settings.exchangeRate) || 1500;
    var priceUSD = '$' + ((Number(product.price) || 0) / exchangeRate).toFixed(2);

    var qrMm = Number(opts.qrMm) || 18;
    if (qrMm < 14) qrMm = 14;
    if (qrMm > 22) qrMm = 22;
    var qrRenderPx = 160;

    var qrElementHtml = '';
    var qrLib = (typeof QRCode !== 'undefined' ? QRCode : (typeof window !== 'undefined' ? window.QRCode : null));
    var theme = getLabelPaperColors();
    if (qrLib && typeof qrLib.toString === 'function') {
      try {
        var rawSvg = '';
        qrLib.toString(code, {
          type: 'svg',
          margin: 1,
          width: qrRenderPx,
          errorCorrectionLevel: 'M',
          color: { dark: theme.bar, light: theme.paper }
        }, function (err, svg) {
          if (!err && svg) rawSvg = svg;
        });
        if (rawSvg) {
          qrElementHtml = rawSvg.replace('<svg ', '<svg class="qr-svg" style="width:' + qrMm + 'mm;height:' + qrMm + 'mm;display:block;margin:0 auto;" ');
        }
      } catch (e) {}
    }

    if (!qrElementHtml) {
      var qrSrc = '/api/qrcode?text=' + encodeURIComponent(code) + '&type=svg';
      qrElementHtml = '<img class="qr-svg" src="' + qrSrc + '" alt="QR" style="width:' + qrMm + 'mm;height:' + qrMm + 'mm;display:block;margin:0 auto;" onerror="this.onerror=null;this.src=\'https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=1&data=' + encodeURIComponent(code) + '\'">';
    }

    return '<div class="label-item label-qr" dir="ltr" style="' +
      'width:80mm;max-width:80mm;box-sizing:border-box;overflow:visible;' +
      'padding:2mm 2mm 2.5mm;background:' + theme.paper + ';color:' + theme.ink + ';' +
      'font-family:Tahoma,Arial,sans-serif;text-align:center;' +
      'break-inside:avoid;page-break-inside:avoid;' +
      '">' +
      (showStoreName ? nameBlock('qr-store', marketName, 'font-size:8pt;font-weight:700;line-height:1.15;color:' + theme.ink + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;') : '') +
      (showProductName ? nameBlock('qr-name', product.name || '', 'font-size:26pt;font-weight:900;line-height:1.08;margin:1mm 0 0.8mm;color:' + theme.ink + ';word-break:break-word;') : '') +
      '<div class="qr-price-row" dir="ltr" style="display:flex;justify-content:center;align-items:baseline;flex-wrap:wrap;gap:6px;margin:0 0 2mm;padding-bottom:1.2mm;border-bottom:2px solid ' + theme.ink + ';direction:ltr;unicode-bidi:isolate;">' +
        (showPrice ? ltrSpan('qr-price', priceIQD, 'font-size:32pt;font-weight:900;color:' + theme.ink + ';line-height:1;') : '') +
        (showUSD ? ltrSpan('qr-usd', priceUSD, 'font-size:14pt;font-weight:800;color:' + theme.ink + ';') : '') +
      '</div>' +
      '<div class="qr-box" style="width:100%;margin:1mm 0 0.8mm;display:flex;justify-content:center;align-items:center;">' +
        qrElementHtml +
      '</div>' +
      (showDigits ? '<div class="qr-digits" style="font-size:8pt;font-weight:700;letter-spacing:0.3px;font-family:Consolas,monospace;direction:ltr;color:' + theme.ink + ';">' + escapeHtml(code) + '</div>' : '') +
      (showExpiry ? '<div style="font-size:7pt;font-weight:700;color:' + theme.ink + ';margin-top:0.4mm;">Exp: ' + escapeHtml(product.expiryDate) + '</div>' : '') +
    '</div>';
  }

  /**
   * Full-width 80mm bill barcode — tall bars so scanners can read it on XP-80C.
   */
  function renderBillBarcodeHtml(product, settings, opts) {
    opts = opts || {};
    var marketName = (typeof getStoreName === 'function')
      ? getStoreName()
      : ((settings && settings.marketName && !/سام\s*مارکێت|sam\s*market/i.test(String(settings.marketName))) ? settings.marketName : 'مارکێت');
    var code = String(product.barcode || product.id || '0000');
    var priceIQD = formatMoney(product.price) + ' د.ع';
    var showStoreName = opts.showStoreName !== false;
    var showProductName = opts.showProductName !== false;
    var showPrice = opts.showPrice !== false;
    var showUSD = opts.showUSD === true;
    var showExpiry = opts.showExpiry === true && product.expiryDate;
    var showDigits = opts.showBarcodeDigits !== false;
    var exchangeRate = (settings && settings.exchangeRate) || 1500;
    var priceUSD = '$' + ((Number(product.price) || 0) / exchangeRate).toFixed(2);

    var theme = getLabelPaperColors();
    var barcodeSvg = autoBarcodeSvg(code, barcodeDrawOpts({
      height: 52,
      barWidth: 2.2,
      quietZone: 8,
      showText: showDigits,
      fontSize: 11
    }));

    return '<div class="label-item label-barcode" dir="ltr" style="' +
      'width:80mm;max-width:80mm;box-sizing:border-box;overflow:visible;' +
      'padding:2mm 2mm 2.5mm;background:' + theme.paper + ';color:' + theme.ink + ';' +
      'font-family:Tahoma,Arial,sans-serif;text-align:center;' +
      'break-inside:avoid;page-break-inside:avoid;' +
      '">' +
      (showStoreName ? nameBlock('bc-store', marketName, 'font-size:8pt;font-weight:700;line-height:1.15;color:' + theme.ink + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;') : '') +
      (showProductName ? nameBlock('bc-name', product.name || '', 'font-size:26pt;font-weight:900;line-height:1.08;margin:1mm 0 0.8mm;color:' + theme.ink + ';word-break:break-word;') : '') +
      '<div class="bc-price-row" dir="ltr" style="display:flex;justify-content:center;align-items:baseline;flex-wrap:wrap;gap:6px;margin:0 0 2mm;padding-bottom:1.2mm;border-bottom:2px solid ' + theme.ink + ';direction:ltr;unicode-bidi:isolate;">' +
        (showPrice ? ltrSpan('bc-price', priceIQD, 'font-size:32pt;font-weight:900;color:' + theme.ink + ';line-height:1;') : '') +
        (showUSD ? ltrSpan('bc-usd', priceUSD, 'font-size:14pt;font-weight:800;color:' + theme.ink + ';') : '') +
      '</div>' +
      '<div class="bc-box" dir="ltr" style="width:100%;margin:1mm 0 0.8mm;display:flex;justify-content:center;align-items:center;background:' + theme.paper + ';direction:ltr;unicode-bidi:isolate;">' +
        barcodeSvg +
      '</div>' +
      (showExpiry ? '<div style="font-size:7pt;font-weight:700;color:' + theme.ink + ';margin-top:0.4mm;">Exp: ' + escapeHtml(product.expiryDate) + '</div>' : '') +
    '</div>';
  }

  // Export module
  var BarcodeGen = {
    code128Svg: code128Svg,
    ean13Svg: ean13Svg,
    autoBarcodeSvg: autoBarcodeSvg,
    renderThermalStickerHtml: renderThermalStickerHtml,
    renderBillBarcodeHtml: renderBillBarcodeHtml,
    renderShelfTagHtml: renderShelfTagHtml,
    renderScaleLabelHtml: renderScaleLabelHtml,
    renderQrStickerHtml: renderQrStickerHtml,
    getLabelPaperColors: getLabelPaperColors
  };

  if (typeof global !== 'undefined') global.BarcodeGen = BarcodeGen;
  if (typeof window !== 'undefined') window.BarcodeGen = BarcodeGen;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BarcodeGen;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
