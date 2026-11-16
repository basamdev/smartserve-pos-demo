/* POS sounds — checkout stays silent; unknown-scan is one soft beep + red flash */
var PosAudio = (function () {
  var isMuted = true;
  var ctx = null;
  var unknownWarnUntil = 0;

  function getCtx() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === "suspended") {
      try { ctx.resume(); } catch (e2) {}
    }
    return ctx;
  }

  function unlock() {
    getCtx();
  }

  function playUnknownWarn() {
    var now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    if (now < unknownWarnUntil) return;
    unknownWarnUntil = now + 700;
    var c = getCtx();
    if (!c) return;
    try {
      if (c.state === "suspended") c.resume();
      var master = c.createGain();
      master.gain.setValueAtTime(0.07, c.currentTime);
      master.connect(c.destination);

      function tone(freq, start, dur) {
        var t0 = c.currentTime + start;
        var osc = c.createOscillator();
        var g = c.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.018);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g);
        g.connect(master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      }

      tone(620, 0.00, 0.12);
      tone(480, 0.14, 0.16);
    } catch (e) {}
  }

  function noop() {}

  if (typeof document !== "undefined") {
    ["click", "keydown", "pointerdown", "touchstart"].forEach(function (ev) {
      document.addEventListener(ev, unlock, { passive: true });
    });
  }

  return {
    playScanBeep: noop,
    playBeep: noop,
    playErrorBuzz: noop,
    playUnknownWarn: playUnknownWarn,
    playCashChime: noop,
    playDrawerKick: noop,
    playCashSuccess: noop,
    toggleMute: function () { isMuted = !isMuted; return isMuted; },
    isMuted: function () { return isMuted; }
  };
})();
