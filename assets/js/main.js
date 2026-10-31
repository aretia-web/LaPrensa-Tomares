/* =====================================================================
   Minimarket La Prensa — catálogo y reservas
   El catálogo se lee de un CSV (ver assets/js/config.js y LEEME.md).
   ===================================================================== */
(() => {
  'use strict';

  const CFG = window.LA_PRENSA_CONFIG || {};
  const STORAGE_KEY = 'laprensa-reserva-v2';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- utilidades ---------- */
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);

  const fold = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();

  const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const isYes = (v) => ['si', 's', 'yes', 'y', 'x', '1', 'true', 'verdadero'].includes(fold(v));
  const isNo = (v) => ['no', 'n', '0', 'false', 'falso', 'agotado'].includes(fold(v));

  const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  function formatPrice(raw) {
    const txt = String(raw ?? '').trim();
    if (!txt) return '';
    const n = Number(txt.replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? euro.format(n) : txt;
  }

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const counts = { ';': 0, ',': 0, '\t': 0 };
    for (const ch of firstLine) if (ch in counts) counts[ch]++;
    const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }

    const clean = rows.filter((r) => r.some((v) => v.trim() !== ''));
    if (!clean.length) return [];
    const headers = clean[0].map((h) => fold(h));
    return clean.slice(1).map((r) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
      return obj;
    });
  }

  function toProduct(r) {
    const name = r.producto || r.nombre || r.articulo || '';
    if (!name) return null;
    const section = fold(r.seccion).startsWith('encarg') ? 'encargo' : 'tienda';
    const format = r.formato || r.unidad || '';
    return {
      id: slug(`${section}-${name}-${format}`),
      section,
      category: r.categoria || 'Otros',
      name,
      format,
      price: formatPrice(r.precio),
      available: !isNo(r.disponible),
      featured: isYes(r.destacado),
      image: r.imagen || ''
    };
  }

  /* ---------- estado ---------- */
  let products = [];
  const byId = new Map();
  let cart = loadCart();
  let activeCategory = 'todo';
  let query = '';

  function loadCart() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }
  function saveCart() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch { /* modo privado */ }
  }
  const cartEntries = () => Object.entries(cart);
  const cartUnits = () => cartEntries().reduce((n, [, it]) => n + it.qty, 0);

  function setQty(id, qty, meta) {
    if (qty <= 0) delete cart[id];
    else if (cart[id]) cart[id].qty = Math.min(qty, 99);
    else cart[id] = { ...meta, qty: Math.min(qty, 99) };
    saveCart();
    renderCart();
    refreshCardAction(id);
  }

  /* ---------- catálogo ---------- */
  const grid = $('#catalog-grid');
  const ordersGrid = $('#orders-grid');
  const chipsEl = $('#catalog-chips');
  const countEl = $('#catalog-count');

  function actionHtml(p) {
    if (!p.available) return '<span class="item-out">Agotado esta semana</span>';
    const qty = cart[p.id]?.qty || 0;
    if (!qty) {
      return `<button type="button" class="add-btn" data-add="${p.id}" aria-label="Añadir ${escapeHtml(p.name)} a la reserva">Añadir</button>`;
    }
    return `
      <div class="stepper" role="group" aria-label="Cantidad de ${escapeHtml(p.name)}">
        <button type="button" data-step="-1" data-id="${p.id}" aria-label="Quitar uno">−</button>
        <output aria-live="polite">${qty}</output>
        <button type="button" data-step="1" data-id="${p.id}" aria-label="Añadir uno más">+</button>
      </div>`;
  }

  function cardHtml(p) {
    const cls = ['item'];
    if (p.featured) cls.push('is-featured');
    if (!p.available) cls.push('is-out');
    if (p.image) cls.push('has-img');
    return `
      <article class="${cls.join(' ')}" data-id="${p.id}">
        ${p.image ? `<img class="item-img" src="${escapeHtml(p.image)}" alt="" loading="lazy">` : ''}
        <p class="item-cat">${escapeHtml(p.category)}${p.featured ? '<span class="item-flag">Destacado</span>' : ''}</p>
        <h3 class="item-name">${escapeHtml(p.name)}</h3>
        ${p.format ? `<p class="item-format">${escapeHtml(p.format)}</p>` : ''}
        <div class="item-foot">
          <p class="item-price">${p.price ? escapeHtml(p.price) : (p.section === 'encargo' ? 'Precio a consultar' : '')}</p>
          <div class="item-action">${actionHtml(p)}</div>
        </div>
      </article>`;
  }

  function refreshCardAction(id) {
    const p = byId.get(id);
    if (!p) return;
    $$(`.item[data-id="${id}"] .item-action`).forEach((el) => {
      const hadFocus = el.contains(document.activeElement);
      const focusedStep = document.activeElement?.dataset?.step;
      el.innerHTML = actionHtml(p);
      if (hadFocus) {
        const target = (focusedStep && el.querySelector(`[data-step="${focusedStep}"]`))
          || el.querySelector('[data-step="1"]') || el.querySelector('button');
        target?.focus();
      }
    });
  }

  function renderChips() {
    const cats = [...new Set(products.filter((p) => p.section === 'tienda').map((p) => p.category))];
    const hasFeatured = products.some((p) => p.section === 'tienda' && p.featured);
    const chips = [['todo', 'Todo']];
    if (hasFeatured) chips.push(['destacados', 'Destacados']);
    cats.forEach((c) => chips.push([c, c]));
    chipsEl.innerHTML = chips.map(([val, label]) =>
      `<button type="button" class="chip" data-cat="${escapeHtml(val)}" aria-pressed="${val === activeCategory}">${escapeHtml(label)}</button>`
    ).join('');
  }

  function renderCatalog() {
    const q = fold(query);
    const list = products.filter((p) => {
      if (p.section !== 'tienda') return false;
      if (activeCategory === 'destacados' && !p.featured) return false;
      if (!['todo', 'destacados'].includes(activeCategory) && p.category !== activeCategory) return false;
      if (q && !fold(`${p.name} ${p.category} ${p.format}`).includes(q)) return false;
      return true;
    });

    if (!list.length) {
      grid.innerHTML = `
        <div class="shelf-empty">
          <p><strong>No encontramos «${escapeHtml(query)}» en el catálogo de esta semana.</strong></p>
          <p>Podemos pedírtelo: añádelo como encargo y te llamamos con el precio.</p>
          <button type="button" class="btn btn-primary" data-encargo="${escapeHtml(query)}">Encargar «${escapeHtml(query)}»</button>
        </div>`;
    } else {
      grid.innerHTML = list.map(cardHtml).join('');
    }
    const total = products.filter((p) => p.section === 'tienda').length;
    countEl.textContent = list.length === total
      ? `${total} productos`
      : `${list.length} de ${total} productos`;
  }

  function renderOrders() {
    const list = products.filter((p) => p.section === 'encargo');
    ordersGrid.innerHTML = list.map(cardHtml).join('');
    $('.orders-sub').hidden = !list.length;
  }

  async function loadCatalog() {
    const url = CFG.catalogoUrl || 'data/catalogo.csv';
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      products = parseCSV(text).map(toProduct).filter(Boolean);
      products.forEach((p) => byId.set(p.id, p));

      const lm = res.headers.get('last-modified');
      if (lm) {
        const d = new Date(lm);
        if (!Number.isNaN(d)) {
          const el = $('#catalog-updated');
          el.textContent = `Actualizado el ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`;
          el.hidden = false;
        }
      }

      // Quita de la reserva guardada lo que ya no está en el catálogo
      for (const [id, it] of cartEntries()) {
        if (!it.custom && (!byId.has(id) || !byId.get(id).available)) delete cart[id];
      }
      saveCart();

      renderChips();
      renderCatalog();
      renderOrders();
      renderCart();
    } catch (err) {
      console.error('No se pudo cargar el catálogo', err);
      grid.innerHTML = `
        <div class="shelf-empty">
          <p><strong>No hemos podido cargar el catálogo.</strong></p>
          <p>Recarga la página en unos segundos o llámanos al <a href="tel:+34954152554">${escapeHtml(CFG.telefono || '954 15 25 54')}</a> y te lo apartamos por teléfono.</p>
        </div>`;
      countEl.textContent = '';
    }
  }

  /* ---------- eventos del catálogo ---------- */
  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const p = byId.get(add.dataset.add);
      if (!p) return;
      setQty(p.id, 1, { name: p.name, format: p.format, price: p.price, section: p.section });
      toast(`${p.name} añadido a tu reserva`);
      return;
    }
    const step = e.target.closest('[data-step]');
    if (step) {
      const id = step.dataset.id;
      const cur = cart[id]?.qty || 0;
      setQty(id, cur + Number(step.dataset.step));
      return;
    }
    const remove = e.target.closest('[data-remove]');
    if (remove) {
      setQty(remove.dataset.remove, 0);
      $('#cart').focus();
      return;
    }
    const chip = e.target.closest('.chip');
    if (chip) {
      activeCategory = chip.dataset.cat;
      $$('.chip', chipsEl).forEach((c) => c.setAttribute('aria-pressed', c === chip));
      renderCatalog();
      return;
    }
    const enc = e.target.closest('[data-encargo]');
    if (enc) {
      addCustom(enc.dataset.encargo);
      $('#catalog-search').value = '';
      query = '';
      renderCatalog();
    }
  });

  let searchTimer;
  $('#catalog-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query = e.target.value.trim();
      if (query && activeCategory !== 'todo') {
        activeCategory = 'todo';
        $$('.chip', chipsEl).forEach((c) => c.setAttribute('aria-pressed', c.dataset.cat === 'todo'));
      }
      renderCatalog();
    }, 120);
  });

  function addCustom(text) {
    const name = String(text || '').trim();
    if (!name) return;
    const id = `encargo-libre-${slug(name)}`;
    setQty(id, (cart[id]?.qty || 0) + 1, { name, format: 'Encargo', price: '', section: 'encargo', custom: true });
    toast(`«${name}» añadido como encargo`);
  }

  $('#custom-order').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#custom-order-input');
    if (!input.value.trim()) { input.focus(); return; }
    addCustom(input.value);
    input.value = '';
  });

  /* ---------- panel de reserva ---------- */
  const cartPanel = $('#cart');
  const backdrop = $('.cart-backdrop');
  const mobileBar = $('.mobile-cartbar');
  let lastFocus = null;

  function openCart() {
    lastFocus = document.activeElement;
    backdrop.hidden = false;
    cartPanel.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      document.body.classList.add('cart-open');
      cartPanel.focus();
    });
    $$('[data-open-cart]').forEach((b) => b.setAttribute('aria-expanded', 'true'));
  }
  function closeCart(goto) {
    document.body.classList.remove('cart-open');
    cartPanel.setAttribute('aria-hidden', 'true');
    $$('[data-open-cart]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    setTimeout(() => { backdrop.hidden = true; }, 250);
    if (goto) document.querySelector(goto)?.scrollIntoView({ behavior: 'smooth' });
    else lastFocus?.focus?.();
  }
  $$('[data-open-cart]').forEach((b) => b.addEventListener('click', openCart));
  $$('[data-close-cart]').forEach((b) => b.addEventListener('click', () => closeCart(b.dataset.goto)));
  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('cart-open')) return;
    if (e.key === 'Escape') closeCart();
    if (e.key === 'Tab') {
      const f = $$('button, a[href], input, select, textarea', cartPanel)
        .filter((el) => !el.disabled && el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === cartPanel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  function renderCart() {
    const entries = cartEntries();
    const units = cartUnits();
    $$('[data-cart-count]').forEach((el) => { el.textContent = units; });
    $('.cart-toggle').classList.toggle('has-items', units > 0);
    mobileBar.hidden = units === 0;

    const done = !$('#cart-done').hidden;
    $('#cart-empty').hidden = entries.length > 0 || done;
    $('#cart-filled').hidden = entries.length === 0 || done;

    const groups = [['tienda', 'Para recoger en tienda'], ['encargo', 'Encargos (te llamamos con el precio)']];
    $('#cart-list').innerHTML = groups.map(([sec, title]) => {
      const items = entries.filter(([, it]) => (it.section || 'tienda') === sec);
      if (!items.length) return '';
      return `<li class="cart-group"><p class="cart-group-title">${title}</p><ul>${items.map(([id, it]) => `
        <li class="cart-line">
          <div class="cart-line-info">
            <p class="cart-line-name">${escapeHtml(it.name)}</p>
            <p class="cart-line-meta">${escapeHtml([it.format, it.price].filter(Boolean).join(', '))}</p>
          </div>
          <div class="stepper stepper--sm" role="group" aria-label="Cantidad de ${escapeHtml(it.name)}">
            <button type="button" data-step="-1" data-id="${id}" aria-label="Quitar uno">−</button>
            <output>${it.qty}</output>
            <button type="button" data-step="1" data-id="${id}" aria-label="Añadir uno más">+</button>
          </div>
          <button type="button" class="cart-line-remove" data-remove="${id}" aria-label="Quitar ${escapeHtml(it.name)} de la reserva">Quitar</button>
        </li>`).join('')}</ul></li>`;
    }).join('');
  }

  /* ---------- días de recogida ---------- */
  function fillPickupDays() {
    const sel = $('#r-day');
    const horario = CFG.horario || {};
    const now = new Date();
    const opts = [];
    for (let i = 0; i < 14 && opts.length < (CFG.diasRecogida || 7); i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const slots = horario[d.getDay()] || [];
      if (!slots.length) continue;
      if (i === 0) {
        const lastClose = slots[slots.length - 1][1].split(':').map(Number);
        if (now.getHours() * 60 + now.getMinutes() > lastClose[0] * 60 + lastClose[1] - 30) continue;
      }
      const long = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      const label = i === 0 ? `Hoy, ${long}` : i === 1 ? `Mañana, ${long}` : long[0].toUpperCase() + long.slice(1);
      opts.push(`<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`);
    }
    sel.innerHTML = opts.join('');
  }

  /* ---------- envío ---------- */
  const form = $('#reserve-form');
  const formError = $('#form-error');

  function showError(msg, field) {
    formError.textContent = msg;
    formError.hidden = false;
    field?.focus();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.hidden = true;
    const name = $('#r-name'), phone = $('#r-phone');
    if (!name.value.trim()) return showError('Escribe tu nombre para saber a quién preparar la reserva.', name);
    const digits = phone.value.replace(/\D/g, '');
    if (digits.length < 9) return showError('Escribe un teléfono de 9 cifras para poder avisarte.', phone);
    if (!cartEntries().length) return showError('Tu reserva está vacía.');

    const lines = (sec) => cartEntries()
      .filter(([, it]) => (it.section || 'tienda') === sec)
      .map(([, it]) => `• ${it.qty} × ${it.name}${it.format ? ` (${it.format})` : ''}${it.price ? `, ${it.price}` : ''}`);
    const tienda = lines('tienda'), encargo = lines('encargo');
    const pedido = [
      tienda.length ? `PARA RECOGER EN TIENDA\n${tienda.join('\n')}` : '',
      encargo.length ? `ENCARGOS (confirmar precio y plazo)\n${encargo.join('\n')}` : ''
    ].filter(Boolean).join('\n\n');

    const btn = $('#reserve-submit');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: CFG.web3formsKey,
          subject: `Nueva reserva de ${name.value.trim()}${encargo.length ? ' (con encargos)' : ''}`,
          from_name: 'Web Minimarket La Prensa',
          nombre: name.value.trim(),
          telefono: phone.value.trim(),
          recogida: $('#r-day').value,
          pedido,
          comentarios: $('#r-notes').value.trim() || '—'
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.message || `HTTP ${res.status}`);

      $('#done-text').textContent = `Gracias, ${name.value.trim().split(' ')[0]}. Lo dejamos preparado para ${$('#r-day').value.toLowerCase()}. Si hay algún cambio, te llamamos al ${phone.value.trim()}.`;
      cart = {};
      saveCart();
      form.reset();
      fillPickupDays();
      $('#cart-done').hidden = false;
      renderCart();
      products.forEach((p) => refreshCardAction(p.id));
      $('#cart-done button').focus();
    } catch (err) {
      console.error(err);
      showError(`No se ha podido enviar la reserva. Inténtalo otra vez o llámanos al ${CFG.telefono || '954 15 25 54'}.`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar reserva';
    }
  });

  // Al volver a abrir tras una reserva enviada, empezar de cero
  $$('[data-open-cart]').forEach((b) => b.addEventListener('click', () => {
    if (!$('#cart-done').hidden && cartEntries().length) { $('#cart-done').hidden = true; renderCart(); }
  }));
  $('#cart-done button').addEventListener('click', () => { $('#cart-done').hidden = true; renderCart(); });

  /* ---------- aviso flotante ---------- */
  const toastEl = $('#toast');
  let toastTimer;
  function toast(msg) {
    toastEl.innerHTML = `<span>${escapeHtml(msg)}</span><button type="button" data-open-cart-toast>Ver reserva</button>`;
    toastEl.hidden = false;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('is-visible');
      setTimeout(() => { toastEl.hidden = true; }, 250);
    }, 2800);
  }
  toastEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-cart-toast]')) { toastEl.hidden = true; openCart(); }
  });

  /* ---------- abierto / cerrado ---------- */
  function updateOpenStatus() {
    const el = $('#open-status');
    const horario = CFG.horario;
    if (!el || !horario) return;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const hhmm = (t) => t.replace(/^0/, '');
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const today = horario[now.getDay()] || [];
    const current = today.find(([a, b]) => mins >= toMin(a) && mins < toMin(b));
    let text;
    if (current) {
      text = `Abierto ahora, hasta las ${hhmm(current[1])}`;
      el.classList.add('is-open');
    } else {
      el.classList.remove('is-open');
      const later = today.find(([a]) => toMin(a) > mins);
      if (later) text = `Cerrado ahora, abrimos a las ${hhmm(later[0])}`;
      else {
        for (let i = 1; i <= 7; i++) {
          const d = (now.getDay() + i) % 7;
          if (horario[d]?.length) {
            const day = i === 1 ? 'mañana' : new Date(now.getTime() + i * 864e5).toLocaleDateString('es-ES', { weekday: 'long' });
            text = `Cerrado ahora, abrimos ${day} a las ${hhmm(horario[d][0][0])}`;
            break;
          }
        }
      }
    }
    $('.status-text', el).textContent = text;
    $$('.hours-table tr').forEach((tr) => {
      tr.classList.toggle('is-today', tr.dataset.days.split(',').includes(String(now.getDay())));
    });
  }

  /* ---------- menú móvil ---------- */
  const menuBtn = $('.menu-toggle');
  const nav = $('#mainnav');
  menuBtn.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    menuBtn.setAttribute('aria-expanded', open);
    menuBtn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  });
  $$('a', nav).forEach((a) => a.addEventListener('click', () => {
    nav.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Abrir menú');
  }));

  /* ---------- inicio ---------- */
  $('#year').textContent = new Date().getFullYear();
  updateOpenStatus();
  setInterval(updateOpenStatus, 60_000);
  fillPickupDays();
  renderCart();
  loadCatalog();
})();
