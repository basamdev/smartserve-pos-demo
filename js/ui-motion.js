(function () {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.documentElement.classList.add("ui-motion");

  var SKIP = "input, textarea, select, option, [contenteditable='true'], .pos-fn-legacy";
  var HIT = "button, .nav-item, .header-btn, .pos-fn-pill, .panel-action-btn, .suite-btn, .product-item, .banknote-card, .category-tab, .customer-tab, .customer-tab-add, .customer-tab-close, .shift-nav-tab, .stat-card, .btn, .clear-choice-card, .pos-master-pay-btn";

  function spawnRipple(el, e) {
    if (!el || el.querySelectorAll(".ui-ripple").length > 3) return;
    var box = el.getBoundingClientRect();
    var r = document.createElement("span");
    r.className = "ui-ripple";
    r.style.left = (e.clientX - box.left) + "px";
    r.style.top = (e.clientY - box.top) + "px";
    el.appendChild(r);
    setTimeout(function () { if (r.parentNode) r.parentNode.removeChild(r); }, 620);
  }

  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest(SKIP)) return;
    var el = e.target.closest(HIT);
    if (!el || el.disabled) return;
    el.classList.remove("is-icon-pop");
    void el.offsetWidth;
    el.classList.add("is-icon-pop", "is-press");
    spawnRipple(el, e);
    setTimeout(function () {
      el.classList.remove("is-icon-pop", "is-press");
    }, 480);
  }, true);

  function popCount(el) {
    if (!el) return;
    el.classList.remove("is-count-pop");
    void el.offsetWidth;
    el.classList.add("is-count-pop");
    setTimeout(function () { el.classList.remove("is-count-pop"); }, 450);
  }

  function watchText(id) {
    var el = document.getElementById(id);
    if (!el || typeof MutationObserver === "undefined") return;
    var last = el.textContent;
    var obs = new MutationObserver(function () {
      var now = el.textContent;
      if (now !== last) {
        last = now;
        popCount(el);
      }
    });
    obs.observe(el, { childList: true, characterData: true, subtree: true });
  }

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  ready(function () {
    watchText("cartItemsCount");
    watchText("heldSalesCountBadge");
    watchText("summaryItemCount");
  });
})();
