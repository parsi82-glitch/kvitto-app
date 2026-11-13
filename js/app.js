// Gränssnitt och navigering. Varje vy är en funktion som ritar upp <main>.
// Navigering sker via adressens #-del: #/ (lista), #/ny, #/kvitto/<id>, #/summering.

import * as store from './store.js';
import { CLASSES, THRESHOLD, REPAIR_YEARS_BACK, summarize } from './tax.js';
import { compressImage } from './image.js';
import { exportCsv } from './csv.js';

const CATEGORIES = ['Bygg & material', 'Hantverkare', 'VVS', 'El', 'Verktyg', 'Trädgård', 'Övrigt'];

const view = document.getElementById('view');
const titleEl = document.getElementById('title');

const kr = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 2 });
const krRound = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 });
const plain = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatDate = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
};

/** Tolkar "1 234,50", "1234.5" och liknande. Returnerar NaN om ogiltigt. */
const parseAmount = (s) => Number(String(s).replace(/[\s kr]/gi, '').replace(',', '.'));

// Object-URL:er för foton måste släppas när vyn byts, annars läcker minne.
let objectUrls = [];
const trackUrl = (blob) => {
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  return url;
};
const releaseUrls = () => {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls = [];
};

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 2500);
}

function showPhoto(url) {
  const dialog = document.getElementById('photo-dialog');
  document.getElementById('photo-full').src = url;
  dialog.showModal();
}

function setActiveTab(tab) {
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

// ---------------------------------------------------------------- Lista

const filters = { year: 'all', classification: 'all', query: '' };

async function renderList() {
  titleEl.textContent = 'Kvitton';
  setActiveTab('list');
  const receipts = await store.listReceipts();

  if (receipts.length === 0) {
    view.innerHTML = `
      <div class="stack">
        <div class="card empty">
          <div class="icon" aria-hidden="true">🧾</div>
          <h2>Inga kvitton ännu</h2>
          <p class="muted">Fota ditt första kvitto för fritidshuset.</p>
          <a class="btn primary" href="#/ny">Lägg till kvitto</a>
        </div>
      </div>`;
    return;
  }

  const years = [...new Set(receipts.map((r) => r.date.slice(0, 4)))].sort().reverse();
  if (filters.year !== 'all' && !years.includes(filters.year)) filters.year = 'all';

  view.innerHTML = `
    <div class="stack">
      <div class="filters">
        <select id="f-year" aria-label="År">
          <option value="all">Alla år</option>
          ${years.map((y) => `<option value="${y}" ${filters.year === y ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
        <select id="f-class" aria-label="Klassning">
          <option value="all">Alla klasser</option>
          ${Object.entries(CLASSES)
            .map(([k, c]) => `<option value="${k}" ${filters.classification === k ? 'selected' : ''}>${c.short}</option>`)
            .join('')}
        </select>
        <input id="f-query" type="search" placeholder="Sök butik, kategori, kommentar…" value="${esc(filters.query)}" aria-label="Sök">
      </div>
      <div class="total-bar">
        <span class="muted" id="count"></span>
        <span class="num" id="sum"></span>
      </div>
      <ul class="receipt-list" id="list"></ul>
      <button class="btn block" id="export">Exportera till Excel (CSV)</button>
    </div>`;

  const listEl = view.querySelector('#list');

  const apply = () => {
    const q = filters.query.trim().toLowerCase();
    const shown = receipts.filter(
      (r) =>
        (filters.year === 'all' || r.date.startsWith(filters.year)) &&
        (filters.classification === 'all' || r.classification === filters.classification) &&
        (!q || [r.store, r.category, r.comment].some((v) => (v || '').toLowerCase().includes(q))),
    );
    view.querySelector('#count').textContent = `${shown.length} kvitto${shown.length === 1 ? '' : 'n'}`;
    view.querySelector('#sum').textContent = kr.format(shown.reduce((s, r) => s + (Number(r.amount) || 0), 0));
    listEl.innerHTML = shown.length
      ? shown.map(itemHtml).join('')
      : `<li class="muted small" style="text-align:center;padding:16px">Inga kvitton matchar filtret.</li>`;
    loadThumbnails(listEl);
    return shown;
  };

  view.querySelector('#f-year').addEventListener('change', (e) => ((filters.year = e.target.value), apply()));
  view.querySelector('#f-class').addEventListener('change', (e) => ((filters.classification = e.target.value), apply()));
  view.querySelector('#f-query').addEventListener('input', (e) => ((filters.query = e.target.value), apply()));
  view.querySelector('#export').addEventListener('click', () => exportCsv(apply()));
  apply();
}

function itemHtml(r) {
  const c = CLASSES[r.classification];
  return `
    <li class="receipt-item">
      <a href="#/kvitto/${encodeURIComponent(r.id)}">
        ${r.hasPhoto ? `<img class="thumb" data-photo="${esc(r.photoPath)}" alt="">` : `<span class="thumb" aria-hidden="true">🧾</span>`}
        <span class="receipt-main">
          <span class="receipt-store" style="display:block">${esc(r.store)}</span>
          <span class="receipt-meta" style="display:block">${esc(formatDate(r.date))} · ${esc(r.category)}</span>
        </span>
        <span class="receipt-right">
          <span class="receipt-amount num">${kr.format(r.amount)}</span>
          ${c ? `<span class="badge ${r.classification}">${c.short}</span>` : ''}
        </span>
      </a>
    </li>`;
}

// Tillfälliga fotolänkar sparas en stund så att listan inte hämtar nya vid varje filtrering.
const photoUrlCache = new Map();

async function loadThumbnails(container) {
  const imgs = [...container.querySelectorAll('img[data-photo]')];
  const missing = imgs.map((img) => img.dataset.photo).filter((p) => !photoUrlCache.has(p));
  if (missing.length) {
    try {
      const urls = await store.getPhotoUrls(missing);
      for (const [path, url] of Object.entries(urls)) photoUrlCache.set(path, url);
      setTimeout(() => missing.forEach((p) => photoUrlCache.delete(p)), 50 * 60 * 1000);
    } catch (err) {
      console.warn('Kunde inte hämta foton', err);
    }
  }
  for (const img of imgs) {
    const url = photoUrlCache.get(img.dataset.photo);
    if (url && img.isConnected) img.src = url;
  }
}


// ---------------------------------------------------------------- Formulär

async function renderForm(id) {
  const existing = id ? await store.getReceipt(id) : null;
  if (id && !existing) {
    toast('Kvittot hittades inte');
    location.hash = '#/';
    return;
  }
  titleEl.textContent = existing ? 'Kvitto' : 'Nytt kvitto';
  setActiveTab(existing ? 'list' : 'new');

  const r = existing || { date: today(), store: '', amount: '', category: '', classification: '', comment: '' };
  const knownStores = [...new Set((await store.listReceipts()).map((x) => x.store).filter(Boolean))].sort();

  // undefined = oförändrat foto, Blob = nytt foto, null = foto borttaget
  let pendingPhoto;

  view.innerHTML = `
    <form id="form" class="stack" novalidate>
      ${existing ? `<p class="muted small" style="margin:0">Senast ändrad ${esc(formatDate(existing.updatedAt?.slice(0, 10) || existing.date))}</p>` : ''}
      <div class="photo-box" id="photo-box">
        <span class="muted small" id="photo-empty">Inget foto</span>
      </div>
      <div class="photo-actions">
        <label class="btn primary">📷 Ta foto
          <input type="file" accept="image/*" capture="environment" class="visually-hidden" data-photo-input>
        </label>
        <label class="btn">🖼️ Välj bild
          <input type="file" accept="image/*" class="visually-hidden" data-photo-input>
        </label>
      </div>
      <p class="muted small" style="margin-top:4px">AI-avläsning av kvittot kommer i fas 3. Tills dess fyller du i fälten själv.</p>

      <div class="card stack">
        <div class="two-col">
          <div class="field">
            <label for="date">Datum</label>
            <input class="field-input" id="date" name="date" type="date" required value="${esc(r.date)}">
          </div>
          <div class="field">
            <label for="amount">Belopp (kr)</label>
            <input class="field-input" id="amount" name="amount" inputmode="decimal" required placeholder="0,00"
              value="${r.amount === '' ? '' : esc(String(r.amount).replace('.', ','))}">
          </div>
        </div>
        <div class="field">
          <label for="store">Butik / leverantör</label>
          <input class="field-input" id="store" name="store" required list="stores" autocomplete="off" value="${esc(r.store)}">
          <datalist id="stores">${knownStores.map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
        </div>
        <div class="field">
          <label for="category">Kategori</label>
          <select class="field-input" id="category" name="category" required>
            <option value="">Välj kategori…</option>
            ${CATEGORIES.map((c) => `<option ${r.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="comment">Kommentar</label>
          <textarea class="field-input" id="comment" name="comment" placeholder="T.ex. vad som gjordes och var i huset">${esc(r.comment)}</textarea>
          <p class="hint">Har ni fått ROT-avdrag? Ange beloppet ni faktiskt betalat.</p>
        </div>
      </div>

      <fieldset class="card field">
        <legend>Klassning</legend>
        <div class="class-options">
          ${Object.entries(CLASSES)
            .map(
              ([k, c]) => `
            <label class="class-option">
              <input type="radio" name="classification" value="${k}" ${r.classification === k ? 'checked' : ''} required>
              <span class="title">${c.label}</span>
              <span class="desc">${c.help}</span>
            </label>`,
            )
            .join('')}
        </div>
        <p class="hint">Byte till bättre material (t.ex. parkett i stället för plastmatta): prisskillnaden är grundförbättring, resten reparation. Dela då upp på två kvitton.</p>
      </fieldset>

      <div class="form-actions">
        <button class="btn primary block" type="submit">${existing ? 'Spara ändringar' : 'Spara kvitto'}</button>
        ${existing ? '<button class="btn danger block" type="button" id="delete">Ta bort kvitto</button>' : ''}
        <a class="btn block" href="#/">Avbryt</a>
      </div>
    </form>`;

  const form = view.querySelector('#form');
  const photoBox = view.querySelector('#photo-box');

  const showPreview = (source) => {
    releaseUrls();
    if (!source) {
      photoBox.innerHTML = '<span class="muted small">Inget foto</span>';
      return;
    }
    const url = typeof source === 'string' ? source : trackUrl(source);
    photoBox.innerHTML = `<img src="${url}" alt="Kvittofoto – tryck för att förstora">`;
    photoBox.querySelector('img').addEventListener('click', () => showPhoto(url));
  };

  if (existing?.photoPath) {
    photoBox.innerHTML = '<span class="muted small">Hämtar foto…</span>';
    store
      .getPhotoUrl(existing.photoPath)
      .then((url) => pendingPhoto === undefined && showPreview(url))
      .catch(() => pendingPhoto === undefined && showPreview(null));
  }

  view.querySelectorAll('[data-photo-input]').forEach((input) =>
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      photoBox.innerHTML = '<span class="muted small">Bearbetar foto…</span>';
      try {
        pendingPhoto = await compressImage(file);
        showPreview(pendingPhoto);
      } catch (err) {
        console.error(err);
        showPreview(null);
        toast('Kunde inte läsa bilden');
      }
    }),
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const amount = parseAmount(data.get('amount'));
    const errors = [];
    if (!data.get('date')) errors.push('datum');
    if (!String(data.get('store')).trim()) errors.push('butik');
    if (!Number.isFinite(amount) || amount <= 0) errors.push('belopp');
    if (!data.get('category')) errors.push('kategori');
    if (!data.get('classification')) errors.push('klassning');
    if (errors.length) {
      toast(`Fyll i ${errors.join(', ')}`);
      return;
    }

    const record = {
      ...(existing || {}),
      date: data.get('date'),
      store: String(data.get('store')).trim(),
      amount: Math.round(amount * 100) / 100,
      category: data.get('category'),
      classification: data.get('classification'),
      comment: String(data.get('comment')).trim(),
    };
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sparar…';
    try {
      await store.saveReceipt(record, existing ? pendingPhoto : pendingPhoto ?? null);
      toast(existing ? 'Ändringar sparade' : 'Kvitto sparat');
      location.hash = '#/';
    } catch (err) {
      console.error(err);
      toast(navigator.onLine ? 'Kunde inte spara – försök igen' : 'Ingen uppkoppling – försök igen när du har nät');
      submitBtn.disabled = false;
      submitBtn.textContent = existing ? 'Spara ändringar' : 'Spara kvitto';
    }
  });

  view.querySelector('#delete')?.addEventListener('click', async () => {
    if (!confirm(`Ta bort kvittot från ${existing.store}? Det går inte att ångra.`)) return;
    try {
      await store.deleteReceipt(existing.id);
      toast('Kvitto borttaget');
      location.hash = '#/';
    } catch (err) {
      console.error(err);
      toast('Kunde inte ta bort – försök igen');
    }
  });
}

// ---------------------------------------------------------------- Summering

let saleYear = new Date().getFullYear();

async function renderSummary() {
  titleEl.textContent = 'Summering';
  setActiveTab('summary');
  const receipts = await store.listReceipts();

  view.innerHTML = `
    <div class="stack">
      <div class="card field">
        <label for="sale-year">Om huset säljs år</label>
        <input class="field-input" id="sale-year" type="number" inputmode="numeric" min="1990" max="2100" value="${saleYear}">
        <p class="hint">Avgör vilka reparationer som ligger inom femårsfönstret.</p>
      </div>
      <div id="summary"></div>
      <details class="card rules">
        <summary>Så räknar appen</summary>
        <ul class="small">
          <li><strong>Grundförbättring</strong> räknas oavsett hur länge sedan.</li>
          <li><strong>Reparation & underhåll</strong> räknas bara för försäljningsåret och de ${REPAIR_YEARS_BACK} föregående åren.</li>
          <li>Ett år räknas bara om förbättringsutgifterna det året är <strong>minst ${krRound.format(THRESHOLD)}</strong>. Då räknas hela beloppet.</li>
          <li><strong>Driftskostnader</strong> ger aldrig avdrag.</li>
          <li>Eget arbete är inte avdragsgillt. Vid ROT-avdrag räknas bara det ni betalat.</li>
        </ul>
        <p class="small muted">Detta är en uppskattning, inte skatterådgivning. Kontrollera mot
          <a href="https://skatteverket.se/f%C3%B6rb%C3%A4ttringsutgifter" target="_blank" rel="noopener">Skatteverket</a>.</p>
      </details>
      <button class="btn block" id="export">Exportera alla kvitton (CSV)</button>
      <div class="card row">
        <span class="small muted">Inloggad som <strong>${esc(currentUser?.email)}</strong></span>
        <span class="spacer"></span>
        <button class="btn" id="logout">Logga ut</button>
      </div>
    </div>`;

  view.querySelector('#logout').addEventListener('click', () => store.signOut());
  const out = view.querySelector('#summary');
  const draw = () => {
    const { rows, totals } = summarize(receipts, saleYear);
    out.innerHTML = `
      <div class="stack">
        <div class="kpis">
          <div class="card kpi hero">
            <div class="label">Uppskattat avdrag vid försäljning ${saleYear}</div>
            <div class="value num">${krRound.format(totals.deductible)}</div>
          </div>
          <div class="card kpi"><div class="label">Grundförbättring</div><div class="value num">${krRound.format(totals.grund)}</div></div>
          <div class="card kpi"><div class="label">Reparation & underhåll</div><div class="value num">${krRound.format(totals.reparation)}</div></div>
          <div class="card kpi"><div class="label">Driftskostnader</div><div class="value num">${krRound.format(totals.drift)}</div></div>
          <div class="card kpi"><div class="label">Totalt utlagt</div><div class="value num">${krRound.format(totals.grund + totals.reparation + totals.drift)}</div></div>
        </div>
        ${
          rows.length
            ? `<div class="card table-scroll">
          <table class="year-table">
            <thead><tr><th>År</th><th>Grundf.</th><th>Rep.</th><th>Drift</th><th>Avdrag</th></tr></thead>
            <tbody>${rows.map(yearRowHtml).join('')}</tbody>
          </table>
          <p class="hint small muted" style="margin:8px 0 0">Belopp i kronor.</p>
        </div>`
            : '<p class="muted" style="text-align:center">Inga kvitton ännu.</p>'
        }
      </div>`;
  };

  view.querySelector('#sale-year').addEventListener('input', (e) => {
    const y = Number(e.target.value);
    if (Number.isInteger(y) && y >= 1990 && y <= 2100) {
      saleYear = y;
      draw();
    }
  });
  view.querySelector('#export').addEventListener('click', () => exportCsv(receipts));
  draw();
}

function yearRowHtml(r) {
  let note = '';
  if (r.afterSale) note = 'efter försäljning';
  else if (!r.meetsThreshold && r.basis > 0) note = `under ${krRound.format(THRESHOLD)}`;
  else if (!r.repairInWindow && r.reparation > 0) note = 'rep. för gammal';
  return `
    <tr>
      <td>${r.year}</td>
      <td class="num">${plain.format(r.grund)}</td>
      <td class="num">${plain.format(r.reparation)}</td>
      <td class="num">${plain.format(r.drift)}</td>
      <td class="num ${r.deductible ? 'ok' : ''}">${plain.format(r.deductible)}${note ? `<span class="note">${note}</span>` : ''}</td>
    </tr>`;
}

// ---------------------------------------------------------------- Inloggning

let currentUser = null;
let memberChecked = false;

function renderLogin() {
  titleEl.textContent = 'Logga in';
  document.body.classList.add('logged-out');
  view.innerHTML = `
    <form id="login" class="card stack" novalidate>
      <p class="muted" style="margin:0">Logga in med kontot du fått för kvitto-appen.</p>
      <div class="field">
        <label for="email">E-post</label>
        <input class="field-input" id="email" name="email" type="email" autocomplete="username" required>
      </div>
      <div class="field">
        <label for="password">Lösenord</label>
        <input class="field-input" id="password" name="password" type="password" autocomplete="current-password" required>
      </div>
      <button class="btn primary block" type="submit">Logga in</button>
    </form>`;

  const form = view.querySelector('#login');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    const data = new FormData(form);
    btn.disabled = true;
    btn.textContent = 'Loggar in…';
    try {
      await store.signIn(String(data.get('email')).trim(), String(data.get('password')));
      // onAuthChange ritar om sidan
    } catch (err) {
      console.error(err);
      toast(err?.status === 400 ? 'Fel e-post eller lösenord' : 'Kunde inte logga in – kontrollera uppkopplingen');
      btn.disabled = false;
      btn.textContent = 'Logga in';
    }
  });
}

function renderNotMember() {
  titleEl.textContent = 'Ingen åtkomst';
  document.body.classList.add('logged-out');
  view.innerHTML = `
    <div class="card stack">
      <h2 style="margin:0">Kontot saknar åtkomst</h2>
      <p class="muted">Du är inloggad som <strong>${esc(currentUser?.email)}</strong>, men kontot är inte tillagt i hushållets medlemslista.</p>
      <button class="btn block" id="logout">Logga ut</button>
    </div>`;
  view.querySelector('#logout').addEventListener('click', () => store.signOut());
}

// ---------------------------------------------------------------- Router

async function route() {
  releaseUrls();
  const hash = location.hash.replace(/^#/, '') || '/';
  try {
    currentUser = await store.getUser();
    if (!currentUser) {
      memberChecked = false;
      renderLogin();
      return;
    }
    if (!memberChecked) {
      if (!(await store.isMember())) {
        renderNotMember();
        return;
      }
      memberChecked = true;
    }
    document.body.classList.remove('logged-out');
    if (hash === '/ny') await renderForm(null);
    else if (hash.startsWith('/kvitto/')) await renderForm(decodeURIComponent(hash.slice('/kvitto/'.length)));
    else if (hash === '/summering') await renderSummary();
    else await renderList();
  } catch (err) {
    console.error(err);
    view.innerHTML = `
      <div class="card stack">
        <h2 style="margin:0">Något gick fel</h2>
        <p class="muted">${navigator.onLine ? esc(err.message || 'Okänt fel') : 'Ingen uppkoppling. Kvittona hämtas från internet.'}</p>
        <button class="btn primary block" id="retry">Försök igen</button>
      </div>`;
    view.querySelector('#retry').addEventListener('click', route);
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
store.onAuthChange((event) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
    memberChecked = false;
    route();
  }
});
route();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker:', err));
}
