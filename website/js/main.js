// Mobile nav toggle
document.querySelector('.mobile-toggle')?.addEventListener('click', () => {
  document.querySelector('.nav-links')?.classList.toggle('open');
});

// Close nav on link click
document.querySelectorAll('.nav-links a').forEach(a => {
  a.addEventListener('click', () => {
    document.querySelector('.nav-links')?.classList.remove('open');
  });
});

// Copy IP
function setupCopy(btnId, codeId) {
  const btn = document.getElementById(btnId);
  const code = document.getElementById(codeId);
  if (!btn || !code) return;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      btn.textContent = btn.dataset.copied;
      setTimeout(() => { btn.textContent = 'Copy IP'; }, 2000);
    } catch {}
  });
}
setupCopy('copy-ip', 'server-ip');
setupCopy('copy-ip-2', 'server-ip-2');

// Animated counters
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    const target = parseInt(el.dataset.target);
    if (isNaN(target)) {
      if (el.dataset.target === '1.7') el.textContent = '1.7';
      return;
    }
    let current = 0;
    const step = Math.ceil(target / 40);
    const timer = setInterval(() => {
      current += step;
      if (current >= target) {
        el.textContent = target;
        clearInterval(timer);
      } else {
        el.textContent = current;
      }
    }, 30);
    observer.unobserve(el);
  });
}, { threshold: 0.5 });

document.querySelectorAll('.stat-number[data-target]').forEach(el => observer.observe(el));
