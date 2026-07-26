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

/* ===== SISTEMA DE RESERVA (reutilizable por zona) =====
   Cada zona (tienda / pedido especial) tiene su propio carrito,
   su propio formulario y su propio botón flotante, totalmente
   independientes entre sí: no se pueden mezclar productos de
   una zona con los de la otra en el mismo pedido. */
function initReservationZone(sectionId, prefix) {
  const section = document.getElementById(sectionId);
  if (!section) return;

  const cart = {}; // { "Nombre producto": { qty, unit } }
  const rowsByProduct = {};

  const summaryList = document.getElementById(`${prefix}-summary-list`);
  const emptyMsg     = document.getElementById(`${prefix}-empty-msg`);
  const cartCount    = document.getElementById(`${prefix}-cart-count`);
  const orderField   = document.getElementById(`${prefix}-r-order`);
  const cartAnchor   = document.getElementById(`${prefix}-cart-anchor`);
  const reserveForm  = document.getElementById(`${prefix}-reserve-form`);
  const reserveError = document.getElementById(`${prefix}-reserve-error`);
  const floatingBtn  = document.getElementById(`${prefix}-floating-btn`);
  const floatingCount = document.getElementById(`${prefix}-floating-count`);

  function resetRow(name) {
    const row = rowsByProduct[name];
    if (!row) return;
    row.addBtn.textContent = 'Añadir';
    row.addBtn.classList.remove('is-added');
    row.qty = 1;
    row.valueEl.textContent = 1;
    row.minusBtn.disabled = true;
  }

  function updateFloatingButton() {
    const totalItems = Object.keys(cart).length;
    if (totalItems > 0) {
      floatingBtn.hidden = false;
      floatingCount.textContent = totalItems;
    } else {
      floatingBtn.hidden = true;
    }
  }

  function renderSummary() {
    const entries = Object.entries(cart);

    cartCount.textContent = entries.length === 1 ? '1 producto' : `${entries.length} productos`;

    if (entries.length === 0) {
      summaryList.innerHTML = '';
      emptyMsg.hidden = false;
      orderField.value = '';
      updateFloatingButton();
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
    updateFloatingButton();
  }

  section.querySelectorAll('.reserve-row').forEach(row => {
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

  floatingBtn.addEventListener('click', () => {
    cartAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  reserveForm.addEventListener('submit', (event) => {
    const cartIsEmpty = Object.keys(cart).length === 0;

    if (cartIsEmpty || !reserveForm.checkValidity()) {
      event.preventDefault();
      reserveError.hidden = false;
    } else {
      reserveError.hidden = true;
    }
  });

  reserveForm.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => {
      reserveError.hidden = true;
    });
  });

  renderSummary();
}

initReservationZone('reserva', 'store');
initReservationZone('amazon', 'amazon');

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
