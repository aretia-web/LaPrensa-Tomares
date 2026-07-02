/* ===== HAMBURGER MENU ===== */
const hamburger = document.querySelector('.nav-hamburger');
const navLinks  = document.querySelector('nav .links');

hamburger.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  hamburger.setAttribute('aria-expanded', isOpen);
  hamburger.textContent = isOpen ? '✕' : '☰';
});

// Cerrar el menú al hacer click en cualquier enlace
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    hamburger.setAttribute('aria-expanded', false);
    hamburger.textContent = '☰';
  });
});

