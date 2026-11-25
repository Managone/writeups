function fixClipboardButtons() {
  var selectors = [
    '.highlight > button',
    '.highlight button',
    '.md-clipboard',
    '[data-clipboard-target]',
    'button[title*="opy"]',
    'button[title*="opier"]'
  ];
  selectors.forEach(function(sel) {
    document.querySelectorAll(sel).forEach(function(btn) {
      btn.style.setProperty('width', '0.85rem', 'important');
      btn.style.setProperty('height', '0.85rem', 'important');
      btn.style.setProperty('min-width', '0', 'important');
      btn.style.setProperty('min-height', '0', 'important');
      btn.style.setProperty('padding', '0.05rem', 'important');
      btn.style.setProperty('top', '0.25rem', 'important');
      btn.style.setProperty('right', '0.3rem', 'important');
      var svg = btn.querySelector('svg');
      if (svg) {
        svg.style.setProperty('width', '0.55rem', 'important');
        svg.style.setProperty('height', '0.55rem', 'important');
      }
    });
  });
}

window.addEventListener('load', fixClipboardButtons);
setTimeout(fixClipboardButtons, 500);
setTimeout(fixClipboardButtons, 1500);
window.addEventListener('DOMContentLoaded', function() {
  fixClipboardButtons();
  if (typeof document$ !== 'undefined') {
    document$.subscribe(fixClipboardButtons);
  }
});
