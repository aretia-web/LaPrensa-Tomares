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
  const navEl = $('#cat-nav');
  const countEl = $('#catalog-count');
  const searchEl = $('#catalog-search');

  /* Iconos por categoría (se eligen por palabras clave del nombre). */
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = [
    [/destacad/, svg('<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>')],
    [/basic|aliment|despensa|pan|lacte/, svg('<path d="M4 10h16l-1.6 9.2a1.5 1.5 0 0 1-1.5 1.3H7.1a1.5 1.5 0 0 1-1.5-1.3Z"/><path d="m8 10 3-6M16 10l-3-6M9 14v3M12 14v3M15 14v3"/>')],
    [/alcohol|vino|cervez|licor/, svg('<path d="M8 3h8l-.6 6.2a3.4 3.4 0 0 1-6.8 0Z"/><path d="M12 13v7M8.5 20.5h7M8.4 7h7.2"/>')],
    [/bebid|refresc|agua|zumo/, svg('<path d="M10 2.5h4M10.5 2.5v3.2L8.4 9a3 3 0 0 0-.4 1.5V20a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 16 20v-9.5a3 3 0 0 0-.4-1.5l-2.1-3.3V2.5"/><path d="M8 13h8"/>')],
    [/drogu|limpi|perfum|higien|hogar/, svg('<path d="M9 8h5v2.5l2 2.6V20a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 7 20v-6.9l2-2.6Z"/><path d="M9 8V5h4l3 1.5M13 5V3.5H9.5"/><path d="M7 15h9"/>')],
    [/mascot|perro|gato|animal/, svg('<circle cx="6.5" cy="10" r="1.8"/><circle cx="17.5" cy="10" r="1.8"/><circle cx="9.5" cy="5.8" r="1.8"/><circle cx="14.5" cy="5.8" r="1.8"/><path d="M12 12c-3 0-5.5 3.6-5.5 5.8 0 1.6 1.3 2.4 2.8 2.1 1-.2 1.8-.6 2.7-.6s1.7.4 2.7.6c1.5.3 2.8-.5 2.8-2.1C17.5 15.6 15 12 12 12Z"/>')],
    [/electr|tecno|movil|pila/, svg('<path d="M9 2.5v4M15 2.5v4M6.5 6.5h11v4a5.5 5.5 0 0 1-11 0Z"/><path d="M12 16v5.5"/>')],
    [/libro|prensa|revista|papel/, svg('<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z"/>')],
    [/golosin|dulce|helad|snack/, svg('<circle cx="12" cy="12" r="4.5"/><path d="m7.8 10.4-4.3-2v7.2l4.3-2M16.2 10.4l4.3-2v7.2l-4.3-2"/>')],
    [/regal|bazar/, svg('<rect x="4" y="9" width="16" height="4" rx="1"/><path d="M5.5 13v6.5A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V13M12 9v12M12 9C10.5 5 7 5 7 7s5 2 5 2Zm0 0c1.5-4 5-4 5-2s-5 2-5 2Z"/>')]
  ];
  const DEFAULT_ICON = svg('<path d="M5 8h14l-1.3 11.5a1.5 1.5 0 0 1-1.5 1.3H7.8a1.5 1.5 0 0 1-1.5-1.3Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>');
  const iconFor = (cat) => (ICONS.find(([re]) => re.test(fold(cat))) || [, DEFAULT_ICON])[1];

  /* Cada categoría recibe un tono suave para su miniatura. */
  const TINTS = ['cobalt', 'turquoise', 'amber', 'coral', 'green', 'violet'];
  const tintMap = new Map();
  const tintFor = (cat) => {
    if (!tintMap.has(cat)) tintMap.set(cat, TINTS[tintMap.size % TINTS.length]);
    return tintMap.get(cat);
  };

  const plusIcon = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

  function actionHtml(p) {
    if (!p.available) return '<span class="item-out">Agotado</span>';
    const qty = cart[p.id]?.qty || 0;
    if (!qty) {
      return `<button type="button" class="add-btn" data-add="${p.id}" aria-label="Añadir ${escapeHtml(p.name)} a la reserva">${plusIcon}<span>Añadir</span></button>`;
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
    if (cart[p.id]) cls.push('in-cart');
    const thumb = p.image
      ? `<img src="${escapeHtml(p.image)}" alt="" loading="lazy">`
      : iconFor(p.category);
    const price = p.price || (p.section === 'encargo' ? 'Precio a consultar' : '');
    return `
      <article class="${cls.join(' ')}" data-id="${p.id}">
        <div class="item-thumb tint-${tintFor(p.category)}${p.image ? ' has-img' : ''}">
          ${thumb}
          ${p.featured ? '<span class="item-flag">Destacado</span>' : ''}
          ${!p.available ? '<span class="item-flag item-flag--out">Agotado</span>' : ''}
        </div>
        <div class="item-body">
          <h4 class="item-name">${escapeHtml(p.name)}</h4>
          <p class="item-meta">${escapeHtml(p.format || p.category)}</p>
          ${price ? `<p class="item-price">${escapeHtml(price)}</p>` : ''}
        </div>
        <div class="item-action">${actionHtml(p)}</div>
      </article>`;
  }

  function refreshCardAction(id) {
    const p = byId.get(id);
    if (!p) return;
    $$(`.item[data-id="${id}"]`).forEach((card) => card.classList.toggle('in-cart', !!cart[id]));
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

  /* Grupos que se muestran: «Destacados» (si los hay) y una sección por categoría.
     Las categorías no filtran: llevan a su sección, así se puede seguir bajando. */
  function groupsFor(list, withFeatured) {
    const groups = [];
    const featured = list.filter((p) => p.featured && p.available);
    if (withFeatured && featured.length) groups.push({ key: 'destacados', title: 'Destacados de la semana', items: featured });
    const byCat = new Map();
    list.forEach((p) => {
      if (!byCat.has(p.category)) byCat.set(p.category, []);
      byCat.get(p.category).push(p);
    });
    byCat.forEach((items, cat) => groups.push({ key: `cat-${slug(cat)}`, title: cat, items }));
    return groups;
  }

  const storeProducts = () => products.filter((p) => p.section === 'tienda');

  function renderChips() {
    const groups = groupsFor(storeProducts(), true);
    navEl.innerHTML = '<span class="cat-indicator" aria-hidden="true"></span>' + groups.map((g, i) => `
      <a href="#${g.key}" class="cat-link" data-target="${g.key}" style="--i:${i}">
        <span class="cat-ico tint-${g.key === 'destacados' ? 'coral' : tintFor(g.title)}">${iconFor(g.key === 'destacados' ? 'destacados' : g.title)}</span>
        <span class="cat-name">${escapeHtml(g.key === 'destacados' ? 'Destacados' : g.title)}</span>
        <span class="cat-count">${g.items.length}</span>
      </a>`).join('');
    chipsEl.innerHTML = groups.map((g) =>
      `<a href="#${g.key}" class="chip" data-target="${g.key}">${escapeHtml(g.key === 'destacados' ? 'Destacados' : g.title)}</a>`
    ).join('');
  }

  function renderCatalog() {
    const q = fold(query);
    const all = storeProducts();
    const list = q ? all.filter((p) => fold(`${p.name} ${p.category} ${p.format}`).includes(q)) : all;
    document.body.classList.toggle('is-searching', !!q);

    if (!list.length) {
      grid.innerHTML = `
        <div class="shelf-empty">
          <span class="shelf-empty-ico">${DEFAULT_ICON}</span>
          <p><strong>No encontramos «${escapeHtml(query)}» en el catálogo de esta semana.</strong></p>
          <p>Podemos pedírtelo a nuestro proveedor: añádelo como encargo y te llamamos con el precio.</p>
          <button type="button" class="btn btn-primary" data-encargo="${escapeHtml(query)}">Encargar «${escapeHtml(query)}»</button>
        </div>`;
    } else {
      grid.innerHTML = groupsFor(list, !q).map((g) => `
        <section class="shelf-group" id="${g.key}" aria-labelledby="${g.key}-t">
          <h3 class="shelf-title" id="${g.key}-t">${escapeHtml(g.title)} <span>${g.items.length}</span></h3>
          <div class="shelf-items">${g.items.map(cardHtml).join('')}</div>
        </section>`).join('');
    }
    countEl.textContent = q
      ? `${list.length} ${list.length === 1 ? 'resultado' : 'resultados'} para «${query}»`
      : `${all.length} productos en ${new Set(all.map((p) => p.category)).size} categorías`;
    activeKey = '';
    watchGroups();
  }

  function renderOrders() {
    const list = products.filter((p) => p.section === 'encargo');
    ordersGrid.innerHTML = list.map(cardHtml).join('');
    $('.orders-sub').hidden = !list.length;
  }

  /* Marca la categoría que se está viendo al hacer scroll. */
  let activeKey = '';
  function setActiveGroup(key) {
    if (key === activeKey) return;
    activeKey = key;
    $$('[data-target]').forEach((a) => {
      const on = a.dataset.target === key;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    const chip = $(`.chip[data-target="${key}"]`, chipsEl);
    if (chip) chipsEl.scrollTo({ left: chip.offsetLeft - 16, behavior: 'smooth' });
    moveIndicator();
  }
  function moveIndicator() {
    const ind = $('.cat-indicator', navEl);
    const link = $(`.cat-link[data-target="${activeKey}"]`, navEl);
    if (!ind || !link || !link.offsetHeight) return;
    ind.style.transform = `translateY(${link.offsetTop}px)`;
    ind.style.height = `${link.offsetHeight}px`;
    requestAnimationFrame(() => ind.classList.add('is-ready'));
  }
  window.addEventListener('resize', moveIndicator);
  // La categoría activa es la última cuyo título ya ha pasado bajo el buscador fijo.
  function watchGroups() {
    const groups = $$('.shelf-group', grid);
    if (!groups.length) return;
    const line = parseFloat(getComputedStyle(groups[0]).scrollMarginTop) + 24;
    let current = groups[0];
    for (const g of groups) {
      if (g.getBoundingClientRect().top <= line) current = g; else break;
    }
    setActiveGroup(current.id);

    // Barra de progreso: cuánto del catálogo has recorrido
    const bar = $('#cat-progress');
    if (bar) {
      const r = grid.getBoundingClientRect();
      const done = (line - r.top) / Math.max(1, r.height - innerHeight + line);
      bar.style.transform = `scaleX(${Math.min(1, Math.max(0, done))})`;
    }
  }
  let spyFrame;
  window.addEventListener('scroll', () => {
    cancelAnimationFrame(spyFrame);
    spyFrame = requestAnimationFrame(watchGroups);
  }, { passive: true });

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
      $$('.cart-badge').forEach((b) => { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); });
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
    const jump = e.target.closest('[data-target]');
    if (jump) {
      e.preventDefault();
      if (query) setQuery('');
      const target = document.getElementById(jump.dataset.target);
      if (target) {
        target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        setActiveGroup(jump.dataset.target);
      }
      return;
    }
    const enc = e.target.closest('[data-encargo]');
    if (enc) {
      addCustom(enc.dataset.encargo);
      setQuery('');
    }
  });

  function setQuery(value) {
    searchEl.value = value;
    query = value.trim();
    $('#search-clear').hidden = !query;
    renderCatalog();
  }

  let searchTimer;
  searchEl.addEventListener('input', () => {
    $('#search-clear').hidden = !searchEl.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const wasEmpty = !query;
      query = searchEl.value.trim();
      renderCatalog();
      // Al empezar a buscar, sube al principio de los resultados
      const tools = $('.catalog-tools');
      if (query && wasEmpty && tools.getBoundingClientRect().top > 160) {
        $('#catalogo .catalog-main').scrollIntoView({ behavior: 'smooth' });
      }
    }, 150);
  });
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && searchEl.value) { e.preventDefault(); setQuery(''); }
    if (e.key === 'Enter') searchEl.blur();
  });
  $('#search-clear').addEventListener('click', () => { setQuery(''); searchEl.focus(); });

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
    $$('[data-cart-label]').forEach((el) => { el.textContent = units === 1 ? '1 producto' : `${units} productos`; });
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
