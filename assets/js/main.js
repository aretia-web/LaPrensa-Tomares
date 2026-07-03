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

const summaryList = document.getElementById('reserve-summary-list');
const orderField  = document.getElementById('r-order');
const submitBtn   = document.getElementById('reserve-submit');

function renderSummary() {
  const entries = Object.entries(cart);

  if (entries.length === 0) {
    summaryList.innerHTML = '<li class="reserve-empty" style="list-style:none; background:none; border:none; padding:0;">Todavía no has añadido ningún producto.</li>';
    orderField.value = '';
    submitBtn.disabled = true;
    return;
  }

  summaryList.innerHTML = entries.map(([name, data]) => `
    <li>
      <span>${name}</span>
      <span class="item-qty">${data.qty} ${data.unit}</span>
    </li>
  `).join('');

  orderField.value = entries.map(([name, data]) => `${name} — ${data.qty} ${data.unit}`).join('\n');
  submitBtn.disabled = false;
}

document.querySelectorAll('.reserve-card').forEach(card => {
  const name     = card.dataset.product;
  const unit     = card.dataset.unit;
  const addBtn   = card.querySelector('.qty-add');
  const stepper  = card.querySelector('.qty-stepper');
  const minusBtn = card.querySelector('.qty-minus');
  const plusBtn  = card.querySelector('.qty-plus');
  const valueEl  = card.querySelector('.qty-value');

  function syncValue() {
    valueEl.textContent = cart[name] ? cart[name].qty : 1;
  }

  addBtn.addEventListener('click', () => {
    cart[name] = { qty: 1, unit };
    addBtn.hidden = true;
    stepper.hidden = false;
    syncValue();
    renderSummary();
  });

  plusBtn.addEventListener('click', () => {
    cart[name].qty += 1;
    syncValue();
    renderSummary();
  });

  minusBtn.addEventListener('click', () => {
    cart[name].qty -= 1;
    if (cart[name].qty <= 0) {
      delete cart[name];
      addBtn.hidden = false;
      stepper.hidden = true;
    } else {
      syncValue();
    }
    renderSummary();
  });
});

renderSummary();

