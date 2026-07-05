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

/* ===== RESERVA DE PRODUCTOS ===== */
const cart = {}; // { "Nombre producto": { qty, unit } }

const summaryList  = document.getElementById('reserve-summary-list');
const emptyMsg     = document.getElementById('reserve-empty-msg');
const cartCount    = document.getElementById('reserve-cart-count');
const orderField   = document.getElementById('r-order');
const submitBtn    = document.getElementById('reserve-submit');

// Guardamos una referencia a cada fila de producto por nombre, para poder
// resetearla desde el botón "quitar" del carrito.
const rowsByProduct = {};

function resetRow(name) {
  const row = rowsByProduct[name];
  if (!row) return;
  row.addBtn.textContent = 'Añadir';
  row.addBtn.classList.remove('is-added');
  row.qty = 1;
  row.valueEl.textContent = 1;
  row.minusBtn.disabled = true;
}

function renderSummary() {
  const entries = Object.entries(cart);

  cartCount.textContent = entries.length === 1 ? '1 producto' : `${entries.length} productos`;

  if (entries.length === 0) {
    summaryList.innerHTML = '';
    emptyMsg.hidden = false;
    orderField.value = '';
    return;
  }

  emptyMsg.hidden = true;
  summaryList.innerHTML = entries.map(([name, data]) => `
    <li data-product="${name}">
      <span class="item-name">${name}</span>
      <span class="item-qty">${data.qty} ${data.unit}</span>
      <button type="button" class="item-remove" aria-label="Quitar ${name} de la reserva">×</button>
    </li>
  `).join('');

  summaryList.querySelectorAll('.item-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.closest('li').dataset.product;
      delete cart[name];
      resetRow(name);
      renderSummary();
    });
  });

  orderField.value = entries.map(([name, data]) => `${name} — ${data.qty} ${data.unit}`).join('\n');
}

document.querySelectorAll('.reserve-row').forEach(row => {
  const name     = row.dataset.product;
  const unit     = row.dataset.unit;
  const addBtn   = row.querySelector('.qty-add');
  const minusBtn = row.querySelector('.qty-minus');
  const plusBtn  = row.querySelector('.qty-plus');
  const valueEl  = row.querySelector('.qty-value');

  const state = { qty: 1, addBtn, minusBtn, valueEl };
  rowsByProduct[name] = state;

  function syncCartIfAdded() {
    if (cart[name]) {
      cart[name].qty = state.qty;
      renderSummary();
    }
  }

  plusBtn.addEventListener('click', () => {
    state.qty += 1;
    valueEl.textContent = state.qty;
    minusBtn.disabled = false;
    syncCartIfAdded();
  });

  minusBtn.addEventListener('click', () => {
    if (state.qty <= 1) return;
    state.qty -= 1;
    valueEl.textContent = state.qty;
    minusBtn.disabled = state.qty <= 1;
    syncCartIfAdded();
  });

  addBtn.addEventListener('click', () => {
    if (cart[name]) {
      delete cart[name];
      addBtn.textContent = 'Añadir';
      addBtn.classList.remove('is-added');
    } else {
      cart[name] = { qty: state.qty, unit };
      addBtn.textContent = 'Quitar';
      addBtn.classList.add('is-added');
    }
    renderSummary();
  });
});

renderSummary();

/* ===== FLECHAS DE CADA MINI-PASARELA POR CATEGORÍA ===== */
document.querySelectorAll('.reserve-carousel').forEach(carousel => {
  const track = carousel.querySelector('.reserve-catalog');
  const prevArrow = carousel.querySelector('.carousel-arrow.prev');
  const nextArrow = carousel.querySelector('.carousel-arrow.next');

  function scrollTrack(direction) {
    const cardWidth = track.querySelector('.reserve-row')?.offsetWidth || 220;
    track.scrollBy({ left: direction * (cardWidth + 16) * 2, behavior: 'smooth' });
  }

  function updateArrows() {
    const hasOverflow = track.scrollWidth > track.clientWidth + 1;

    if (!hasOverflow) {
      prevArrow.hidden = true;
      nextArrow.hidden = true;
      return;
    }

    prevArrow.hidden = track.scrollLeft <= 0;
    nextArrow.hidden = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
  }

  prevArrow.addEventListener('click', () => scrollTrack(-1));
  nextArrow.addEventListener('click', () => scrollTrack(1));
  track.addEventListener('scroll', updateArrows);
  window.addEventListener('resize', updateArrows);

  updateArrows();
});

/* ===== BOTÓN FLOTANTE "VER RESERVA" ===== */
const floatingBtn = document.getElementById('reserve-floating-btn');
const floatingCount = document.getElementById('reserve-floating-count');

function updateFloatingButton() {
  const totalItems = Object.keys(cart).length;
  if (totalItems > 0) {
    floatingBtn.hidden = false;
    floatingCount.textContent = totalItems;
  } else {
    floatingBtn.hidden = true;
  }
}

floatingBtn.addEventListener('click', () => {
  document.getElementById('reserve-summary-anchor').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Enganchamos la actualización del botón flotante a cada cambio de renderSummary
const originalRenderSummary = renderSummary;
renderSummary = function () {
  originalRenderSummary();
  updateFloatingButton();
};

/* ===== VALIDACIÓN DEL FORMULARIO DE RESERVA ===== */
const reserveForm  = document.getElementById('reserve-form');
const reserveError = document.getElementById('reserve-error');

reserveForm.addEventListener('submit', (event) => {
  const cartIsEmpty = Object.keys(cart).length === 0;

  if (cartIsEmpty || !reserveForm.checkValidity()) {
    event.preventDefault();
    reserveError.hidden = false;
  } else {
    reserveError.hidden = true;
  }
});

// Ocultamos el aviso en cuanto el cliente empieza a corregir los campos
reserveForm.querySelectorAll('input').forEach(input => {
  input.addEventListener('input', () => {
    reserveError.hidden = true;
  });
});

