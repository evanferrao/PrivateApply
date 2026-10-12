// FAQ Accordion Toggle & Keyboard Accessibility
document.querySelectorAll('.faq-q').forEach(function(q) {
  q.setAttribute('tabindex', '0');
  q.setAttribute('role', 'button');
  
  function toggle() {
    var parent = q.parentElement;
    var isOpen = parent.classList.toggle('open');
    q.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  q.addEventListener('click', toggle);
  q.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });
});

// Smooth scrolling for quick jump pills
document.querySelectorAll('.jump-pill').forEach(function(anchor) {
  anchor.addEventListener('click', function(e) {
    var targetId = this.getAttribute('href');
    if (targetId && targetId.startsWith('#')) {
      var targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });
});
