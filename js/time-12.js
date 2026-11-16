(function (g) {
  function pad2(n) {
    n = Number(n) || 0;
    return (n < 10 ? "0" : "") + n;
  }
  function parseClockDate(raw) {
    if (raw == null || raw === "") return null;
    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
    var d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  function formatSaleTime(raw, withSeconds) {
    var d = parseClockDate(raw);
    if (!d) return "-";
    var hours = d.getHours();
    var ampm = hours >= 12 ? "PM" : "AM";
    var h = hours % 12;
    if (h === 0) h = 12;
    var out = pad2(h) + ":" + pad2(d.getMinutes());
    if (withSeconds) out += ":" + pad2(d.getSeconds());
    return out + " " + ampm;
  }
  function formatSaleDateTime(raw, withSeconds) {
    var d = parseClockDate(raw);
    if (!d) return "-";
    return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear() + "  " + formatSaleTime(d, withSeconds);
  }
  g.formatSaleTime = formatSaleTime;
  g.formatSaleDateTime = formatSaleDateTime;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { formatSaleTime: formatSaleTime, formatSaleDateTime: formatSaleDateTime };
  }
})(typeof window !== "undefined" ? window : globalThis);
