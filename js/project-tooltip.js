(function() {
  function init() {
    document.querySelectorAll('.project-card').forEach(function(card) {
      if (card._tooltipBound) return;
      card._tooltipBound = true;
      card.addEventListener('mousemove', function(e) {
        card.style.setProperty('--mx', e.clientX);
        card.style.setProperty('--my', e.clientY);
      });
    });
  }
  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('pjax:success', init);
})();
