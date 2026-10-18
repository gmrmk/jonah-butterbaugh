// Printer motion for the resume page. Runs only when <html> has .motion (set in <head> when the
// visitor has not asked for reduced motion). Every effect is one-shot; nothing loops.
(function () {
  var root = document.documentElement;
  if (!root.classList.contains('motion')) return;
  root.classList.add('mjs');

  // Wrap each visible character of `el` in <span class="ch"> with a staggered delay, so a line types
  // itself. The heading keeps its full text as its accessible name. Returns the typing time in ms.
  function typeText(el, budgetMs, hold) {
    var label = el.textContent.replace(/\s+/g, ' ').trim();
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    var total = label.replace(/\s/g, '').length || 1;
    var step = budgetMs / total;
    var i = 0;
    nodes.forEach(function (node) {
      var frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        var word = document.createElement('span');
        word.style.whiteSpace = 'nowrap';
        for (var c = 0; c < part.length; c++) {
          var ch = document.createElement('span');
          ch.className = hold ? 'ch-hold' : 'ch';
          ch.textContent = part[c];
          ch.style.setProperty('--d', Math.round(i++ * step) + 'ms');
          word.appendChild(ch);
        }
        frag.appendChild(word);
      });
      node.parentNode.replaceChild(frag, node);
    });
    el.setAttribute('aria-label', label);
    el.classList.add('typed');
    if (!hold) setTimeout(function () { el.classList.add('swept'); }, budgetMs + 60);
    return budgetMs;
  }

  function start() {
    var head = document.querySelector('.headline[data-type]');
    var dossier = document.querySelector('.dossier');
    var stage = document.querySelector('.stamp-stage');
    var typedMs = head ? typeText(head, 1300) : 0;

    function stamped() { if (dossier) dossier.classList.add('stamped'); }

    // After the headline types, and once the stamp zone is on screen, the 3D stamp presses
    // "Reply requested". Without WebGL, on a data-saving connection, or if anything fails, the
    // impression simply lands (and a safety timer lands it regardless).
    function press() {
      var saveData = navigator.connection && navigator.connection.saveData;
      var gl = null;
      try { gl = document.createElement('canvas').getContext('webgl2'); } catch (e) { gl = null; }
      var lose = gl && gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      if (!stage || !gl || saveData || !stage.offsetWidth) { stamped(); return; }
      setTimeout(stamped, 4000);
      import('./stamp3d.js')
        .then(function (m) { return m.play(stage, stamped); })
        .catch(function () { stamped(); });
    }
    setTimeout(function () {
      var zone = document.querySelector('.stamp-zone');
      if (!zone || !('IntersectionObserver' in window)) { press(); return; }
      var seen = new IntersectionObserver(function (es) {
        if (!es.some(function (e) { return e.isIntersecting; })) return;
        seen.disconnect();
        press();
      }, { threshold: 0.5 });
      seen.observe(zone);
    }, typedMs + 250);

    // Section titles type as they scroll into view; Exhibit A's stamp presses the same way.
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.exhibit-a').forEach(function (a) { a.classList.add('pressed'); });
      return;
    }
    // Titles are wrapped now and held hidden until they scroll in, so a title never shows, blanks, then retypes.
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        if (e.target.matches('h2[data-type]')) {
          e.target.querySelectorAll('.ch-hold').forEach(function (c) { c.className = 'ch'; });
          setTimeout(function () { e.target.classList.add('swept'); }, 480);
        } else e.target.classList.add('pressed');
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.2 });
    document.querySelectorAll('h2[data-type]').forEach(function (h) { typeText(h, 420, true); io.observe(h); });
    document.querySelectorAll('.exhibit-a').forEach(function (el) { io.observe(el); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
