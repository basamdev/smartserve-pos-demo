/**
 * Period close / Z-style supermarket report.
 * Today, yesterday, month-to-date, full month, custom range.
 * Includes printed, no-print, cash, card, debt, USD.
 */
(function (global) {
  "use strict";

  var STATE = {
    key: "mtd",
    from: "",
    to: ""
  };

  function money(n) {
    if (typeof fmt === "function") return fmt(n);
    return Number(n || 0).toLocaleString("en-US") + " د.ع";
  }

  function ymd(d) {
    if (typeof localYmd === "function") return localYmd(d);
    var dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return "";
    var m = dt.getMonth() + 1;
    var day = dt.getDate();
    return dt.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  function addDays(base, n) {
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    d.setDate(d.getDate() + n);
    return d;
  }

  function parseYmd(s) {
    var p = String(s || "").split("-");
    if (p.length < 3) return new Date();
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function kuDate(s) {
    var d = parseYmd(s);
    return (d.getDate() < 10 ? "0" : "") + d.getDate() + "/" +
      ((d.getMonth() + 1) < 10 ? "0" : "") + (d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function store() {
    if (typeof getStoreName === "function") return getStoreName() || "مارکێت";
    return "مارکێت";
  }

  function rangeFor(key, fromEl, toEl) {
    var now = new Date();
    var today = ymd(now);
    var from = today;
    var to = today;
    var label = "ئەمڕۆ";
    if (key === "yesterday") {
      var y = addDays(now, -1);
      from = to = ymd(y);
      label = "دوێنێ";
    } else if (key === "mtd" || key === "monthStart") {
      from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
      to = today;
      label = "١ تا ئەمڕۆ";
    } else if (key === "month") {
      from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
      to = today;
      label = "ئەم مانگە";
    } else if (key === "lastMonth") {
      var first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      var last = new Date(now.getFullYear(), now.getMonth(), 0);
      from = ymd(first);
      to = ymd(last);
      label = "مانگی پێشوو";
    } else if (key === "week") {
      from = ymd(addDays(now, -6));
      to = today;
      label = "٧ ڕۆژ";
    } else if (key === "custom") {
      from = (fromEl && fromEl.value) || today;
      to = (toEl && toEl.value) || today;
      if (from > to) { var t = from; from = to; to = t; }
      label = "لە " + kuDate(from) + " تا " + kuDate(to);
    } else {
      label = "ئەمڕۆ — کۆتایی ڕۆژ";
    }
    return { from: from, to: to, label: label, key: key };
  }

  function inRange(raw, from, to) {
    var day = ymd(raw);
    if (!day) return false;
    return day >= from && day <= to;
  }

  function isCancel(o) {
    return !!(o && (o.status === "cancelled" || o.status === "refunded"));
  }

  function payKind(o) {
    if (typeof orderPayKind === "function") return orderPayKind(o);
    if (!o) return "cash";
    if (o.paidCurrency === "USD" || o.paymentMethod === "usd_cash") return "usd";
    if (o.paymentMethod === "card") return "card";
    if (o.paymentMethod === "debt") return "debt";
    return "cash";
  }

  function printed(o) {
    if (typeof isOrderPrinted === "function") return isOrderPrinted(o);
    if (!o) return false;
    if (o.printed === false || o.noPrint === true) return false;
    return true;
  }

  function billNo(o) {
    if (typeof orderBillNo === "function") return orderBillNo(o);
    return o && o.billNo ? String(o.billNo) : "";
  }

  function emptyPay() {
    return { cash: { n: 0, m: 0 }, card: { n: 0, m: 0 }, debt: { n: 0, m: 0 }, usd: { n: 0, m: 0 } };
  }

  function build(from, to, label) {
    var ordersAll = [];
    try {
      ordersAll = (typeof incomeOrders === "function")
        ? incomeOrders(typeof branchRecords === "function" ? branchRecords(DB.orders || []) : (DB.orders || []))
        : (DB.orders || []);
    } catch (e1) { ordersAll = DB.orders || []; }

    var live = [];
    var cancelled = [];
    ordersAll.forEach(function (o) {
      if (!inRange(o.date || o.orderDate, from, to)) return;
      if (isCancel(o)) cancelled.push(o);
      else live.push(o);
    });

    var pay = emptyPay();
    var printedN = 0, printedM = 0, noPrintN = 0, noPrintM = 0;
    var sales = 0, cost = 0, profit = 0, discount = 0, qty = 0, types = 0;
    var usdCash = 0;
    var cashiers = {};
    var days = {};
    var products = {};
    var bills = [];
    var firstAt = "";
    var lastAt = "";
    var hours = {};

    live.forEach(function (o) {
      var tot = Number(o.total) || 0;
      var cst = Number(o.totalCost) || 0;
      var pr = (typeof orderProfitOf === "function") ? orderProfitOf(o) : (tot - cst);
      var q = (typeof orderItemQty === "function") ? orderItemQty(o) : ((o.items || []).length);
      var k = payKind(o);
      sales += tot;
      cost += cst;
      profit += pr;
      discount += Number(o.discount) || 0;
      qty += q;
      types += (o.items || []).length;
      pay[k] = pay[k] || { n: 0, m: 0 };
      pay[k].n += 1;
      pay[k].m += tot;
      if (k === "usd") usdCash += Number(o.usdReceived) || 0;
      if (printed(o)) { printedN += 1; printedM += tot; }
      else { noPrintN += 1; noPrintM += tot; }

      var cname = o.cashier || "کاشیر";
      if (!cashiers[cname]) cashiers[cname] = { name: cname, n: 0, m: 0, qty: 0, pay: emptyPay() };
      cashiers[cname].n += 1;
      cashiers[cname].m += tot;
      cashiers[cname].qty += q;
      cashiers[cname].pay[k].n += 1;
      cashiers[cname].pay[k].m += tot;

      var day = ymd(o.date || o.orderDate);
      if (!days[day]) days[day] = { day: day, n: 0, m: 0, qty: 0, printed: 0, noprint: 0, pay: emptyPay() };
      days[day].n += 1;
      days[day].m += tot;
      days[day].qty += q;
      if (printed(o)) days[day].printed += 1;
      else days[day].noprint += 1;
      days[day].pay[k].n += 1;
      days[day].pay[k].m += tot;

      (o.items || []).forEach(function (it) {
        var nm = it.name || "کاڵا";
        if (!products[nm]) products[nm] = { name: nm, qty: 0, m: 0 };
        products[nm].qty += Number(it.qty) || 1;
        products[nm].m += (Number(it.price) || 0) * (Number(it.qty) || 1);
      });

      var bn = billNo(o);
      if (bn) bills.push(bn);

      var ts = o.date || o.orderDate || "";
      if (ts) {
        if (!firstAt || String(ts) < String(firstAt)) firstAt = ts;
        if (!lastAt || String(ts) > String(lastAt)) lastAt = ts;
        try {
          var hd = new Date(ts);
          if (!isNaN(hd.getTime())) {
            var h = hd.getHours();
            if (!hours[h]) hours[h] = { h: h, n: 0, m: 0 };
            hours[h].n += 1;
            hours[h].m += tot;
          }
        } catch (eH) {}
      }
    });

    bills.sort();
    var cashierList = Object.keys(cashiers).map(function (k) { return cashiers[k]; })
      .sort(function (a, b) { return b.m - a.m; });
    var dayList = Object.keys(days).sort().map(function (k) { return days[k]; });
    var topProducts = Object.keys(products).map(function (k) { return products[k]; })
      .sort(function (a, b) { return b.m - a.m; }).slice(0, 15);
    var hourList = Object.keys(hours).map(function (k) { return hours[k]; })
      .sort(function (a, b) { return b.m - a.m; }).slice(0, 6);

    var expenses = [];
    try {
      expenses = (typeof branchRecords === "function") ? branchRecords(DB.expenses || []) : (DB.expenses || []);
    } catch (e2) { expenses = DB.expenses || []; }
    var expList = expenses.filter(function (e) { return inRange(e.date, from, to); });
    var expTotal = 0;
    var expCats = {};
    expList.forEach(function (e) {
      var amt = Number(e.amount) || 0;
      expTotal += amt;
      var ck = e.category || e.type || "other";
      var info = (typeof getExpenseCategoryInfo === "function") ? getExpenseCategoryInfo(ck) : { name: ck };
      var nm = info.name || ck;
      expCats[nm] = (expCats[nm] || 0) + amt;
    });

    var returns = (typeof RETURN_SALES !== "undefined" && RETURN_SALES) ? RETURN_SALES : [];
    var retList = returns.filter(function (r) { return inRange(r.date || r.createdAt, from, to); });
    var retMoney = retList.reduce(function (s, r) { return s + (Number(r.refundAmount || r.total) || 0); }, 0);

    var cancelMoney = cancelled.reduce(function (s, o) { return s + (Number(o.total) || 0); }, 0);
    var net = profit - expTotal - retMoney;
    var cashInHand = pay.cash.m + pay.usd.m - expTotal - retMoney;

    return {
      from: from,
      to: to,
      label: label,
      store: store(),
      generated: (typeof formatSaleDateTime === "function") ? formatSaleDateTime(new Date(), true) : new Date().toLocaleString(),
      n: live.length,
      sales: sales,
      cost: cost,
      profit: profit,
      discount: discount,
      qty: qty,
      types: types,
      pay: pay,
      usdCash: usdCash,
      printedN: printedN,
      printedM: printedM,
      noPrintN: noPrintN,
      noPrintM: noPrintM,
      cashiers: cashierList,
      days: dayList,
      products: topProducts,
      expenses: expTotal,
      expCats: expCats,
      expCount: expList.length,
      returns: retMoney,
      retCount: retList.length,
      cancelledN: cancelled.length,
      cancelledM: cancelMoney,
      net: net,
      cashInHand: cashInHand,
      firstBill: bills[0] || "",
      lastBill: bills.length ? bills[bills.length - 1] : "",
      firstAt: firstAt,
      lastAt: lastAt,
      avgTicket: live.length ? Math.round(sales / live.length) : 0,
      hours: hourList,
      skuCount: Object.keys(products).length
    };
  }

  function currentRange() {
    var fromEl = document.getElementById("pcDateFrom");
    var toEl = document.getElementById("pcDateTo");
    var r = rangeFor(STATE.key, fromEl, toEl);
    STATE.from = r.from;
    STATE.to = r.to;
    return r;
  }

  function currentReport() {
    var r = currentRange();
    return build(r.from, r.to, r.label);
  }

  function pct(part, whole) {
    var w = Number(whole) || 0;
    if (!w) return "0%";
    return Math.round((Number(part) || 0) * 100 / w) + "%";
  }

  function clock(iso) {
    if (!iso) return "—";
    if (typeof formatSaleTime === "function") {
      try { return formatSaleTime(iso, true); } catch (eT) {}
    }
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    var hh = d.getHours();
    var mm = d.getMinutes();
    return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
  }

  function hourLabel(h) {
    var n = Number(h) || 0;
    var a = (n < 10 ? "0" : "") + n + ":00";
    var b = ((n + 1) < 10 ? "0" : "") + ((n + 1) % 24) + ":00";
    return a + "–" + b;
  }

  function line(label, value, cls) {
    return '<div class="pc-line' + (cls ? " " + cls : "") + '"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function previewHtml(d) {
    var pay = d.pay;
    var html = "";
    html += '<div class="pc-slip-head">';
    html += "<h3>" + esc(d.store) + "</h3>";
    html += "<p>ڕاپۆرتی کۆتایی سوپەرمارکێت · Z-REPORT</p>";
    html += "<p>" + esc(d.label) + "</p>";
    html += "<p>" + kuDate(d.from) + (d.from === d.to ? "" : " → " + kuDate(d.to)) + "</p>";
    html += "</div>";
    html += line("کۆی فرۆشتن", money(d.sales), "is-total");
    html += line("ژمارەی پسوڵە", String(d.n) + " · ناوەند " + money(d.avgTicket || 0));
    html += line("دانەی کاڵا / جۆر", String(d.qty) + " / " + String(d.skuCount || d.types || 0));
    html += line("یەکەم فرۆشتن", clock(d.firstAt));
    html += line("دوایین فرۆشتن", clock(d.lastAt));
    html += '<div class="pc-sep">جۆری پارەدان — تێکەڵە</div>';
    html += line("نەقد (Cash)", money(pay.cash.m) + " · " + pay.cash.n + " · " + pct(pay.cash.m, d.sales));
    html += line("کارت (Card)", money(pay.card.m) + " · " + pay.card.n + " · " + pct(pay.card.m, d.sales));
    html += line("قەرز (Debt)", money(pay.debt.m) + " · " + pay.debt.n + " · " + pct(pay.debt.m, d.sales));
    html += line("دۆلار (USD)", money(pay.usd.m) + " · " + pay.usd.n + (d.usdCash ? " · $" + Number(d.usdCash).toFixed(2) : ""));
    html += '<div class="pc-sep">پسوڵە — چاپ و بێ چاپ</div>';
    html += line("بە پسوڵە / چاپکراو", money(d.printedM) + " · " + d.printedN + " · " + pct(d.printedM, d.sales));
    html += line("بێ پسوڵە / بێ چاپ", money(d.noPrintM) + " · " + d.noPrintN + " · " + pct(d.noPrintM, d.sales));
    html += '<div class="pc-sep">وردەکاری دارایی</div>';
    html += line("تێچووی کاڵا", money(d.cost));
    html += line("داشکاندن", money(d.discount));
    html += line("گەڕانەوە", money(d.returns) + " · " + d.retCount);
    html += line("مەسرەف", money(d.expenses) + " · " + d.expCount);
    if (d.cancelledN) html += line("هەڵوەشاوە", money(d.cancelledM) + " · " + d.cancelledN);
    html += line("قازانجی کاڵا", money(d.profit));
    html += line("قازانجی سافی", money(d.net), "is-total");
    html += line("نەقدی خاوەن (خەمڵێنراو)", money(d.cashInHand), "is-cash");
    if (d.firstBill) html += line("پسوڵەکان", "#" + d.firstBill + " → #" + d.lastBill);
    if (d.expCats) {
      var cats = Object.keys(d.expCats);
      if (cats.length) {
        html += '<div class="pc-sep">پۆلی مەسرەف</div>';
        cats.forEach(function (nm) { html += line(nm, money(d.expCats[nm])); });
      }
    }
    if (d.cashiers.length) {
      html += '<div class="pc-sep">کاشیرەکان — نەقد / کارت / قەرز</div>';
      d.cashiers.forEach(function (c) {
        html += line(c.name, money(c.m) + " · " + c.n);
        html += line(" نەقد / کارت / قەرز", money(c.pay.cash.m) + " / " + money(c.pay.card.m) + " / " + money(c.pay.debt.m));
      });
    }
    if (d.hours && d.hours.length) {
      html += '<div class="pc-sep">کاتژمێرە گەرمەکان</div>';
      d.hours.forEach(function (x) {
        html += line(hourLabel(x.h), money(x.m) + " · " + x.n);
      });
    }
    if (d.products && d.products.length) {
      html += '<div class="pc-sep">باشترین کاڵا</div>';
      d.products.slice(0, 12).forEach(function (p, i) {
        html += line((i + 1) + ". " + p.name, p.qty + " · " + money(p.m));
      });
    }
    html += '<p class="pc-slip-foot">چاپکرا: ' + esc(d.generated) + "</p>";
    return html;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderKpis(d) {
    var box = document.getElementById("pcKpis");
    if (!box) return;
    function card(cls, icon, lab, val, hint) {
      return '<div class="pc-kpi ' + cls + '"><i class="fas ' + icon + '"></i><div><span>' + lab + "</span><strong>" + val + "</strong>" +
        (hint ? "<small>" + hint + "</small>" : "") + "</div></div>";
    }
    box.innerHTML =
      card("is-sales", "fa-coins", "کۆی فرۆشتن", money(d.sales), d.n + " پسوڵە · ناوەند " + money(d.avgTicket || 0)) +
      card("is-cash", "fa-money-bill-wave", "نەقد", money(d.pay.cash.m), d.pay.cash.n + " وەسڵ · " + pct(d.pay.cash.m, d.sales)) +
      card("is-card", "fa-credit-card", "کارت", money(d.pay.card.m), d.pay.card.n + " وەسڵ · " + pct(d.pay.card.m, d.sales)) +
      card("is-debt", "fa-hand-holding-dollar", "قەرز", money(d.pay.debt.m), d.pay.debt.n + " وەسڵ · " + pct(d.pay.debt.m, d.sales)) +
      card("is-print", "fa-print", "بە چاپ", money(d.printedM), d.printedN + " پسوڵە") +
      card("is-noprint", "fa-ban", "بێ چاپ", money(d.noPrintM), d.noPrintN + " پسوڵە") +
      card("is-profit", "fa-chart-line", "قازانجی سافی", money(d.net), "دوای مەسرەف و گەڕانەوە") +
      card("is-owner", "fa-vault", "نەقدی خاوەن", money(d.cashInHand), "نەقد + دۆلار − مەسرەف − گەڕانەوە");
  }

  function renderTables(d) {
    var dayBody = document.getElementById("pcDayBody");
    if (dayBody) {
      if (!d.days.length) {
        dayBody.innerHTML = '<tr><td colspan="7" class="pc-empty">هیچ فرۆشتنێک لەم ماوەیەدا نییە</td></tr>';
      } else {
        dayBody.innerHTML = d.days.map(function (x) {
          return "<tr><td>" + kuDate(x.day) + "</td><td>" + x.n + "</td><td>" + x.printed + "/" + x.noprint + "</td><td>" +
            money(x.pay.cash.m) + "</td><td>" + money(x.pay.card.m) + "</td><td>" + money(x.pay.debt.m) + "</td><td><strong>" + money(x.m) + "</strong></td></tr>";
        }).join("");
      }
    }
    var cashBody = document.getElementById("pcCashierBody");
    if (cashBody) {
      if (!d.cashiers.length) cashBody.innerHTML = '<tr><td colspan="6" class="pc-empty">—</td></tr>';
      else cashBody.innerHTML = d.cashiers.map(function (c) {
        return "<tr><td>" + esc(c.name) + "</td><td>" + c.n + "</td><td>" + money(c.pay.cash.m) + "</td><td>" +
          money(c.pay.card.m) + "</td><td>" + money(c.pay.debt.m) + "</td><td><strong>" + money(c.m) + "</strong></td></tr>";
      }).join("");
    }
    var prodBody = document.getElementById("pcProdBody");
    if (prodBody) {
      if (!d.products.length) prodBody.innerHTML = '<tr><td colspan="4" class="pc-empty">—</td></tr>';
      else prodBody.innerHTML = d.products.map(function (p, i) {
        return "<tr><td>" + (i + 1) + "</td><td>" + esc(p.name) + "</td><td>" + p.qty + "</td><td>" + money(p.m) + "</td></tr>";
      }).join("");
    }
  }

  function syncChips() {
    var chips = document.querySelectorAll("#pcChips [data-pc]");
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle("is-on", chips[i].getAttribute("data-pc") === STATE.key);
    }
    var custom = document.getElementById("pcCustomDates");
    if (custom) custom.classList.toggle("is-on", STATE.key === "custom");
    var fromEl = document.getElementById("pcDateFrom");
    var toEl = document.getElementById("pcDateTo");
    var r = currentRange();
    if (fromEl && STATE.key !== "custom") fromEl.value = r.from;
    if (toEl && STATE.key !== "custom") toEl.value = r.to;
    var title = document.getElementById("pcRangeTitle");
    if (title) title.textContent = r.label + "  ·  " + kuDate(r.from) + (r.from === r.to ? "" : " → " + kuDate(r.to));
  }

  function refresh() {
    var r = currentRange();
    var d = build(r.from, r.to, r.label);
    syncChips();
    renderKpis(d);
    var slip = document.getElementById("pcSlip");
    if (slip) slip.innerHTML = previewHtml(d);
    renderTables(d);
    return d;
  }

  function setPeriod(key) {
    STATE.key = key || "today";
    refresh();
  }

  function dashOpen(key) {
    setPeriod(key);
    if (typeof switchFinanceHubTab === "function") switchFinanceHubTab("close");
  }

  function printDoc(inner, pageSize) {
    var isA4 = pageSize === "A4";
    var html = "<!DOCTYPE html><html lang=\"ku\" dir=\"rtl\"><head><meta charset=\"UTF-8\"><title>کۆتایی فرۆشتن</title>" +
      "<style>@page{size:" + (isA4 ? "A4" : "80mm auto") + ";margin:" + (isA4 ? "10mm" : "2mm") + ";}" +
      "html,body{margin:0;padding:" + (isA4 ? "10px" : "4mm") + ";background:#fff;color:#000;font-family:Tahoma,'Segoe UI',Arial,sans-serif;" +
      "font-size:" + (isA4 ? "16px" : "17px") + ";line-height:1.45;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact;}" +
      "h1{margin:0 0 6px;font-size:" + (isA4 ? "28px" : "22px") + ";}h2{margin:0 0 6px;font-size:" + (isA4 ? "20px" : "18px") + ";}h3{margin:12px 0 6px;font-size:" + (isA4 ? "17px" : "16px") + ";}" +
      "table{width:100%;border-collapse:collapse;font-size:" + (isA4 ? "14px" : "15px") + ";}th,td{border-bottom:1px solid #111;padding:6px 4px;text-align:right;}" +
      "th{background:#111;color:#fff;}.row{display:flex;justify-content:space-between;gap:8px;margin:4px 0;font-size:" + (isA4 ? "16px" : "17px") + ";}" +
      ".tot{font-weight:900;font-size:" + (isA4 ? "20px" : "20px") + ";border-top:3px solid #000;padding-top:8px;margin-top:8px;}" +
      ".dash{border-top:2px dashed #000;margin:10px 0;padding-top:8px;font-weight:800;font-size:" + (isA4 ? "16px" : "16px") + ";}.c{text-align:center;}" +
      ".big{font-size:" + (isA4 ? "22px" : "21px") + ";font-weight:900;}</style></head><body>" + inner + "</body></html>";
    if (typeof ImmediatePrinter !== "undefined" && ImmediatePrinter.print) {
      ImmediatePrinter.print(html, { pageSize: pageSize === "A4" ? "A4" : "80mm", skipDebounce: true, kickDrawer: false });
    } else {
      var w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
    }
  }

  function thermalInner(d, skipHead) {
    function r(a, b) {
      return '<div class="row"><span>' + a + "</span><strong>" + b + "</strong></div>";
    }
    var h = "";
    if (!skipHead) {
      h += '<div class="c"><h1>' + esc(d.store) + "</h1>";
      h += "<div><strong>ڕاپۆرتی کۆتایی سوپەرمارکێت</strong></div>";
      h += "<div>Z-REPORT / PERIOD CLOSE</div>";
      h += "<div>" + esc(d.label) + "</div><div>" + kuDate(d.from) + (d.from === d.to ? "" : " → " + kuDate(d.to)) + "</div></div>";
      h += '<div class="dash"></div>';
    }
    h += '<div class="big">' + r("کۆی فرۆشتن", money(d.sales)) + "</div>";
    h += r("پسوڵە / ناوەند", d.n + " · " + money(d.avgTicket || 0));
    h += r("دانە / جۆر", d.qty + " / " + (d.skuCount || d.types || 0));
    h += r("یەکەم / دوایین", clock(d.firstAt) + " → " + clock(d.lastAt));
    h += '<div class="dash">جۆری پارەدان</div>';
    h += r("نەقد", money(d.pay.cash.m) + " (" + d.pay.cash.n + ") " + pct(d.pay.cash.m, d.sales));
    h += r("کارت", money(d.pay.card.m) + " (" + d.pay.card.n + ") " + pct(d.pay.card.m, d.sales));
    h += r("قەرز", money(d.pay.debt.m) + " (" + d.pay.debt.n + ") " + pct(d.pay.debt.m, d.sales));
    h += r("دۆلار", money(d.pay.usd.m) + " (" + d.pay.usd.n + ")" + (d.usdCash ? " $" + Number(d.usdCash).toFixed(2) : ""));
    h += '<div class="dash">پسوڵە</div>';
    h += r("بە چاپ", money(d.printedM) + " (" + d.printedN + ") " + pct(d.printedM, d.sales));
    h += r("بێ چاپ", money(d.noPrintM) + " (" + d.noPrintN + ") " + pct(d.noPrintM, d.sales));
    h += '<div class="dash">وردەکاری دارایی</div>';
    h += r("تێچووی کاڵا", money(d.cost));
    h += r("داشکاندن", money(d.discount));
    h += r("گەڕانەوە", money(d.returns) + " (" + d.retCount + ")");
    h += r("مەسرەف", money(d.expenses) + " (" + d.expCount + ")");
    if (d.cancelledN) h += r("هەڵوەشاوە", money(d.cancelledM) + " (" + d.cancelledN + ")");
    h += r("قازانجی کاڵا", money(d.profit));
    h += '<div class="tot">' + r("قازانجی سافی", money(d.net)) + "</div>";
    h += '<div class="tot">' + r("نەقدی خاوەن", money(d.cashInHand)) + "</div>";
    if (d.expCats) {
      var cats = Object.keys(d.expCats);
      if (cats.length) {
        h += '<div class="dash">پۆلی مەسرەف</div>';
        cats.forEach(function (nm) { h += r(nm, money(d.expCats[nm])); });
      }
    }
    if (d.cashiers.length) {
      h += '<div class="dash">کاشیرەکان</div>';
      d.cashiers.forEach(function (c) {
        h += r(c.name, money(c.m) + " · " + c.n);
        h += r("نەقد/کارت/قەرز", money(c.pay.cash.m) + " / " + money(c.pay.card.m) + " / " + money(c.pay.debt.m));
      });
    }
    if (d.hours && d.hours.length) {
      h += '<div class="dash">کاتژمێرە گەرمەکان</div>';
      d.hours.forEach(function (x) { h += r(hourLabel(x.h), money(x.m) + " · " + x.n); });
    }
    if (d.products && d.products.length) {
      h += '<div class="dash">باشترین کاڵا</div>';
      d.products.slice(0, 12).forEach(function (p, i) {
        h += r((i + 1) + ". " + p.name, p.qty + " · " + money(p.m));
      });
    }
    if (d.days && d.days.length > 1 && d.days.length <= 16) {
      h += '<div class="dash">ڕۆژانە</div>';
      d.days.forEach(function (x) {
        h += r(kuDate(x.day), money(x.m) + " · " + x.n);
      });
    }
    if (d.firstBill) h += r("پسوڵە", "#" + d.firstBill + " → #" + d.lastBill);
    h += '<div class="dash c">چاپکرا: ' + esc(d.generated) + "<br>سیستەمی وەرگرتنی پارە</div>";
    return h;
  }

  function a4Inner(d) {
    var h = '<div class="c"><h1>' + esc(d.store) + "</h1><h2>ڕاپۆرتی کۆتایی فرۆشتن — سوپەرمارکێت</h2>";
    h += "<p>" + esc(d.label) + " &nbsp;|&nbsp; " + kuDate(d.from) + (d.from === d.to ? "" : " تا " + kuDate(d.to)) + "</p>";
    h += "<p>یەکەم فرۆشتن: " + clock(d.firstAt) + " &nbsp;|&nbsp; دوایین: " + clock(d.lastAt) + " &nbsp;|&nbsp; ناوەندی پسوڵە: " + money(d.avgTicket || 0) + "</p>";
    h += "<p>چاپکرا: " + esc(d.generated) + "</p></div>";
    h += thermalInner(d, true);
    if (d.cashiers.length) {
      h += "<h3>کاشیرەکان — تێکەڵەی پارەدان</h3><table><thead><tr><th>کاشیر</th><th>پسوڵە</th><th>نەقد</th><th>کارت</th><th>قەرز</th><th>کۆ</th></tr></thead><tbody>";
      d.cashiers.forEach(function (c) {
        h += "<tr><td>" + esc(c.name) + "</td><td>" + c.n + "</td><td>" + money(c.pay.cash.m) + "</td><td>" +
          money(c.pay.card.m) + "</td><td>" + money(c.pay.debt.m) + "</td><td>" + money(c.m) + "</td></tr>";
      });
      h += "</tbody></table>";
    }
    if (d.days.length > 1) {
      h += "<h3>وردەکاری ڕۆژانە</h3><table><thead><tr><th>ڕۆژ</th><th>پسوڵە</th><th>چاپ/بێ چاپ</th><th>نەقد</th><th>کارت</th><th>قەرز</th><th>کۆ</th></tr></thead><tbody>";
      d.days.forEach(function (x) {
        h += "<tr><td>" + kuDate(x.day) + "</td><td>" + x.n + "</td><td>" + x.printed + "/" + x.noprint + "</td><td>" +
          money(x.pay.cash.m) + "</td><td>" + money(x.pay.card.m) + "</td><td>" + money(x.pay.debt.m) + "</td><td>" + money(x.m) + "</td></tr>";
      });
      h += "</tbody></table>";
    }
    if (d.products.length) {
      h += "<h3>باشترین کاڵا</h3><table><thead><tr><th>#</th><th>کاڵا</th><th>دانە</th><th>فرۆشتن</th></tr></thead><tbody>";
      d.products.forEach(function (p, i) {
        h += "<tr><td>" + (i + 1) + "</td><td>" + esc(p.name) + "</td><td>" + p.qty + "</td><td>" + money(p.m) + "</td></tr>";
      });
      h += "</tbody></table>";
    }
    h += '<div style="display:flex;justify-content:space-between;margin-top:40px;gap:16px;font-size:15px;font-weight:700;">' +
      "<div>واژۆی کاشیر<br><br>____________________</div>" +
      "<div>واژۆی ژمێریار<br><br>____________________</div>" +
      "<div>واژۆی خاوەن مارکێت<br><br>____________________</div></div>";
    return h;
  }

  function print80() {
    var d = currentReport();
    printDoc(thermalInner(d), "80mm");
    if (typeof toast === "function") toast("چاپ", "ڕاپۆرتی ٨٠مم نێردرا بۆ چاپکەر", "info", true);
  }

  function printA4() {
    var d = currentReport();
    printDoc(a4Inner(d), "A4");
    if (typeof toast === "function") toast("چاپ", "ڕاپۆرتی A4 نێردرا بۆ چاپکەر", "info", true);
  }

  function copyWa() {
    var d = currentReport();
    var t = [
      "📊 ڕاپۆرتی کۆتایی فرۆشتن — " + d.store,
      "📅 " + d.label,
      kuDate(d.from) + (d.from === d.to ? "" : " → " + kuDate(d.to)),
      "════════════",
      "💰 کۆی فرۆشتن: " + money(d.sales),
      "🧾 پسوڵە: " + d.n + "  |  دانە: " + d.qty,
      "💵 نەقد: " + money(d.pay.cash.m),
      "💳 کارت: " + money(d.pay.card.m),
      "📝 قەرز: " + money(d.pay.debt.m),
      "💲 دۆلار: " + money(d.pay.usd.m),
      "🖨 بە چاپ: " + money(d.printedM) + " (" + d.printedN + ")",
      "🚫 بێ چاپ: " + money(d.noPrintM) + " (" + d.noPrintN + ")",
      "📉 داشکاندن: " + money(d.discount),
      "↩️ گەڕانەوە: " + money(d.returns),
      "📤 مەسرەف: " + money(d.expenses),
      "✅ قازانجی سافی: " + money(d.net),
      "🏦 نەقدی خاوەن: " + money(d.cashInHand)
    ];
    d.cashiers.forEach(function (c) { t.push("👤 " + c.name + ": " + money(c.m) + " (" + c.n + ")"); });
    t.push("════════════");
    t.push(d.generated);
    var text = t.join("\n");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (typeof toast === "function") toast("واتسئاپ", "ڕاپۆرت کۆپی کرا — بلۆکی بکە", "info", true);
      });
    }
  }

  function exportExcel() {
    var d = currentReport();
    var rows = [
      ["مارکێت", d.store],
      ["ماوە", d.label],
      ["لە", d.from],
      ["بۆ", d.to],
      [],
      ["کۆی فرۆشتن", d.sales],
      ["پسوڵە", d.n],
      ["دانە", d.qty],
      ["نەقد", d.pay.cash.m, d.pay.cash.n],
      ["کارت", d.pay.card.m, d.pay.card.n],
      ["قەرز", d.pay.debt.m, d.pay.debt.n],
      ["دۆلار", d.pay.usd.m, d.pay.usd.n],
      ["بە چاپ", d.printedM, d.printedN],
      ["بێ چاپ", d.noPrintM, d.noPrintN],
      ["داشکاندن", d.discount],
      ["گەڕانەوە", d.returns],
      ["مەسرەف", d.expenses],
      ["قازانجی سافی", d.net],
      [],
      ["ڕۆژ", "پسوڵە", "چاپ", "بێ چاپ", "نەقد", "کارت", "قەرز", "کۆ"]
    ];
    d.days.forEach(function (x) {
      rows.push([x.day, x.n, x.printed, x.noprint, x.pay.cash.m, x.pay.card.m, x.pay.debt.m, x.m]);
    });
    var csv = "\uFEFF" + rows.map(function (r) { return r.join(","); }).join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "z-report-" + d.from + "-to-" + d.to + ".csv";
    a.click();
  }

  function bind() {
    if (window.__PC_BOUND) return;
    window.__PC_BOUND = true;
    var chips = document.getElementById("pcChips");
    if (chips) chips.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-pc]") : null;
      if (b) setPeriod(b.getAttribute("data-pc"));
    });
    var apply = document.getElementById("pcApplyDates");
    if (apply) apply.addEventListener("click", function () {
      STATE.key = "custom";
      refresh();
    });
    ["pcDateFrom", "pcDateTo"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", function () {
        STATE.key = "custom";
        refresh();
      });
    });
  }

  function show() {
    bind();
    if (!STATE.from) STATE.key = "mtd";
    refresh();
  }

  global.PeriodClose = {
    show: show,
    refresh: refresh,
    setPeriod: setPeriod,
    dashOpen: dashOpen,
    print80: print80,
    printA4: printA4,
    copyWa: copyWa,
    exportExcel: exportExcel
  };
})(typeof window !== "undefined" ? window : this);
