import { WindowViewer } from './window3d.js';
import { LIMITS, PROBLEMS, problemById, estimate, rub, plural } from './pricing.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- состояние калькулятора: единый источник для 3D, цены и заявки ---------- */

const state = { width: 1400, height: 1400, sashes: 2, problem: 'draft' };

const LEGEND = {
  close: 'Створка не прижимается к раме — нужна регулировка',
  draft: 'Воздух проходит через неплотный притвор',
  handle: 'Подсвечена ручка',
  seal: 'Подсвечен контур уплотнителя',
  hardware: 'Подсвечены петли и запорный механизм',
  glass: 'Подсвечен стеклопакет',
  complex: 'Подсвечены ручка, уплотнитель и петли',
};

/* ---------- 3D ---------- */

const heroEl = $('#hero-viewer');
const calcEl = $('#calc-viewer');

const hero =
  heroEl &&
  new WindowViewer(heroEl, {
    width: 1300,
    height: 1500,
    sashes: 2,
    dims: false,
    parts: false,
    tilt: true,
    yaw: -0.42,
    pitch: 0.05,
    pad: { top: 40, right: 40, bottom: 48, left: 40 },
    theme: { shadow: '4,20,60' },
  });

const viewer =
  calcEl &&
  new WindowViewer(calcEl, {
    width: state.width,
    height: state.height,
    sashes: state.sashes,
    pad: { top: 64, right: 24, bottom: 40, left: 24 },
    topBar: calcEl.querySelector('.stage-bar'),
    theme: { hl: '#3FA2F5', air: '#CFEAFF', dim: '#8FB6E3', shadow: '2,12,35' },
  });

[hero, viewer].forEach((v) => {
  if (!v || v.failed) return;
  v.el.addEventListener('w3d:interact', () => v.el.classList.add('was-touched'), { once: true });
});

if (viewer?.failed || hero?.failed) document.documentElement.classList.add('no-webgl');

/* ---------- калькулятор ---------- */

const widthInput = $('#calc-width');
const heightInput = $('#calc-height');
const widthRange = $('#calc-width-range');
const heightRange = $('#calc-height-range');

function minWidth() {
  return Math.max(LIMITS.width.min, state.sashes * LIMITS.minSashWidth);
}

function syncRange(range, value) {
  if (!range) return;
  range.value = String(value);
  const p = ((value - range.min) / (range.max - range.min)) * 100;
  range.style.setProperty('--p', `${p}%`);
}

function setDimension(key, raw, { final = false } = {}) {
  const lim = LIMITS[key];
  const min = key === 'width' ? minWidth() : lim.min;
  let v = Math.round(Number(String(raw).replace(/\s/g, '').replace(',', '.')));
  const input = key === 'width' ? widthInput : heightInput;
  const field = input.closest('.field');
  if (!Number.isFinite(v) || v <= 0) {
    if (final) v = state[key];
    else return;
  }
  const out = v < min || v > lim.max;
  const err = field.querySelector('.field-error');
  if (err) err.textContent = key === 'width' && state.sashes > 1
    ? `Для ${state.sashes} створок — от ${min} до ${lim.max} мм`
    : `От ${min} до ${lim.max} мм`;
  field.classList.toggle('is-invalid', out && !final);
  if (out && !final) return; // пока вводят — не дёргаем модель
  v = Math.min(lim.max, Math.max(min, v));
  state[key] = v;
  if (final || Number(input.value) !== v) input.value = String(v);
  field.classList.remove('is-invalid');
  update();
}

function bindDimension(key, input, range) {
  input.addEventListener('input', () => setDimension(key, input.value));
  input.addEventListener('change', () => setDimension(key, input.value, { final: true }));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 100 : 10;
      setDimension(key, state[key] + (e.key === 'ArrowUp' ? step : -step), { final: true });
    }
  });
  range?.addEventListener('input', () => setDimension(key, range.value, { final: true }));
}

if (widthInput && heightInput) {
  bindDimension('width', widthInput, widthRange);
  bindDimension('height', heightInput, heightRange);

  $$('[data-stepper]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.stepper;
      setDimension(key, state[key] + Number(btn.dataset.step), { final: true });
    });
  });

  $$('input[name="sashes"]').forEach((r) =>
    r.addEventListener('change', () => {
      state.sashes = Number(r.value);
      if (state.width < minWidth()) {
        state.width = minWidth();
        widthInput.value = String(state.width);
      }
      update();
    }),
  );

  $$('input[name="problem"]').forEach((r) =>
    r.addEventListener('change', () => {
      state.problem = r.value;
      update();
    }),
  );
}

const explodeBtn = $('#explode-btn');
explodeBtn?.addEventListener('click', () => {
  if (!viewer || viewer.failed) return;
  const on = viewer.toggleExploded();
  explodeBtn.setAttribute('aria-pressed', String(on));
  explodeBtn.querySelector('span').textContent = on ? 'Собрать окно' : 'Показать устройство окна';
  calcEl.closest('.calc-stage')?.classList.toggle('is-exploded', on);
});

/* ---------- цена ---------- */

const priceEl = $('#price-value');
let shownPrice = 0;
let priceRaf = 0;
let priceTimer = 0;

function animatePrice(to) {
  if (!priceEl) return;
  cancelAnimationFrame(priceRaf);
  clearTimeout(priceTimer);
  const from = shownPrice;
  if (REDUCED || !from) {
    shownPrice = to;
    priceEl.textContent = rub(to);
    return;
  }
  const t0 = performance.now();
  const dur = 420;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    shownPrice = from + (to - from) * (1 - Math.pow(1 - k, 3));
    priceEl.textContent = rub(k < 1 ? Math.round(shownPrice / 10) * 10 : to);
    if (k < 1) priceRaf = requestAnimationFrame(step);
    else shownPrice = to;
  };
  priceRaf = requestAnimationFrame(step);
  // в фоновой вкладке rAF не вызывается — итоговое значение ставим в любом случае
  priceTimer = setTimeout(() => {
    cancelAnimationFrame(priceRaf);
    shownPrice = to;
    priceEl.textContent = rub(to);
  }, dur + 80);
}

function renderEstimate() {
  const est = estimate(state);
  animatePrice(est.total);
  const live = $('#price-live');
  if (live) live.textContent = `Ориентировочная стоимость: ${rub(est.total)}`;
  const list = $('#price-lines');
  if (list) {
    list.innerHTML = est.lines
      .map(
        (l) =>
          `<li><span class="pl-label">${l.label}</span><span class="pl-detail">${l.detail}</span><span class="pl-sum">${rub(l.sum)}</span></li>`,
      )
      .join('');
  }
  PROBLEMS.forEach((p) => {
    const el = $(`[data-problem-price="${p.id}"]`);
    if (el) el.textContent = rub(estimate({ ...state, problem: p.id }).total);
  });
  return est;
}

/* ---------- схема окна (для заявки и как запасной вариант без WebGL) ---------- */

function schemeSVG({ width, height, sashes }, { maxW = 120, maxH = 120 } = {}) {
  const k = Math.min(maxW / width, maxH / height);
  const W = Math.round(width * k);
  const H = Math.round(height * k);
  const f = 5;
  const pad = 2;
  let s = `<svg viewBox="0 0 ${W + pad * 2} ${H + pad * 2}" width="${W + pad * 2}" height="${H + pad * 2}" aria-hidden="true">`;
  s += `<rect x="${pad}" y="${pad}" width="${W}" height="${H}" class="sc-frame"/>`;
  for (let i = 0; i < sashes; i++) {
    const x0 = pad + (W * i) / sashes + (i === 0 ? f : 2);
    const x1 = pad + (W * (i + 1)) / sashes - (i === sashes - 1 ? f : 2);
    const y0 = pad + f;
    const y1 = pad + H - f;
    s += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" class="sc-sash"/>`;
    const hingeLeft = i < Math.ceil(sashes / 2);
    const hx = hingeLeft ? x0 : x1;
    const fx = hingeLeft ? x1 : x0;
    const my = (y0 + y1) / 2;
    // обозначение открывания: поворот (к стороне петель) и откидывание (вниз)
    s += `<path d="M${fx} ${y0} L${hx} ${my} L${fx} ${y1}" class="sc-open"/>`;
    s += `<path d="M${x0} ${y0} L${(x0 + x1) / 2} ${y1} L${x1} ${y0}" class="sc-open"/>`;
    if (i < sashes - 1) {
      const xi = pad + (W * (i + 1)) / sashes;
      s += `<line x1="${xi}" y1="${pad}" x2="${xi}" y2="${pad + H}" class="sc-frame"/>`;
    }
  }
  return `${s}</svg>`;
}

/* ---------- заявка: параметры из калькулятора ---------- */

function renderSummary(est) {
  const p = problemById(state.problem);
  const set = (key, text) => $$(`[data-sum="${key}"]`).forEach((el) => (el.textContent = text));
  set('size', `${state.width} × ${state.height} мм`);
  set('sashes', String(state.sashes));
  set('problem', p.short);
  set('price', rub(est.total));
  const scheme = $('#order-scheme');
  if (scheme) scheme.innerHTML = schemeSVG(state, { maxW: 96, maxH: 96 });
}

function renderLegend() {
  const el = $('#stage-legend-text');
  if (!el || el.textContent === LEGEND[state.problem]) return;
  el.textContent = LEGEND[state.problem];
  const chip = el.closest('.stage-legend');
  chip.classList.remove('is-changed');
  void chip.offsetWidth; // перезапуск CSS-анимации
  chip.classList.add('is-changed');
}

function renderFallback() {
  if (!viewer?.failed) return;
  calcEl.innerHTML = `<div class="w3d-fallback">${schemeSVG(state, { maxW: 260, maxH: 260 })}<p>Браузер не поддерживает 3D. Схема окна обновляется по вашим параметрам.</p></div>`;
}

function update() {
  syncRange(widthRange, state.width);
  syncRange(heightRange, state.height);
  if (widthRange) widthRange.min = String(minWidth());
  viewer?.setSize(state.width, state.height, state.sashes);
  viewer?.setMode(state.problem);
  const est = renderEstimate();
  renderSummary(est);
  renderLegend();
  renderFallback();
}

update();

/* ---------- переходы из услуг и цен в калькулятор ---------- */

function selectProblem(id) {
  const radio = $(`input[name="problem"][value="${id}"]`);
  if (radio) {
    radio.checked = true;
    state.problem = id;
    update();
  }
}

$$('[data-calc-problem]').forEach((el) =>
  el.addEventListener('click', (e) => {
    e.preventDefault();
    selectProblem(el.dataset.calcProblem);
    $('#calc')?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  }),
);

const commentField = $('#order-comment');
$$('[data-order-comment]').forEach((el) =>
  el.addEventListener('click', () => {
    if (commentField && !commentField.value.trim()) commentField.value = el.dataset.orderComment;
  }),
);

/* ---------- форма заявки ---------- */

const form = $('#order-form');
const phoneInput = $('#order-phone');
const photoInput = $('#order-photo');
const photoList = $('#photo-list');
const photos = [];
const MAX_PHOTOS = 5;
const MAX_SIZE = 10 * 1024 * 1024;

function formatPhone(value) {
  let d = value.replace(/\D/g, '');
  if (!d) return '';
  if (d[0] === '8') d = `7${d.slice(1)}`;
  if (d[0] !== '7') d = `7${d}`;
  d = d.slice(0, 11);
  let out = '+7';
  if (d.length > 1) out += ` (${d.slice(1, 4)}`;
  if (d.length >= 4) out += ')';
  if (d.length > 4) out += ` ${d.slice(4, 7)}`;
  if (d.length > 7) out += `-${d.slice(7, 9)}`;
  if (d.length > 9) out += `-${d.slice(9, 11)}`;
  return out;
}

phoneInput?.addEventListener('input', () => {
  phoneInput.value = formatPhone(phoneInput.value);
  phoneInput.closest('.field')?.classList.remove('is-invalid');
});
$('#order-name')?.addEventListener('input', (e) => e.target.closest('.field')?.classList.remove('is-invalid'));

function renderPhotos() {
  if (!photoList) return;
  photoList.innerHTML = '';
  photos.forEach((p, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<img src="${p.url}" alt="">
      <button type="button" class="photo-remove" aria-label="Удалить фото ${i + 1}">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>
      </button>`;
    li.querySelector('button').addEventListener('click', () => {
      URL.revokeObjectURL(p.url);
      photos.splice(i, 1);
      renderPhotos();
    });
    photoList.appendChild(li);
  });
  const note = $('#photo-note');
  if (note) {
    note.textContent = photos.length
      ? `${photos.length} ${plural(photos.length, 'фото', 'фото', 'фото')} из ${MAX_PHOTOS}`
      : 'До 5 фото. Мастер оценит состояние окна заранее.';
  }
}

photoInput?.addEventListener('change', () => {
  let skipped = 0;
  for (const file of photoInput.files) {
    if (!file.type.startsWith('image/') || file.size > MAX_SIZE || photos.length >= MAX_PHOTOS) {
      skipped++;
      continue;
    }
    photos.push({ file, url: URL.createObjectURL(file) });
  }
  photoInput.value = '';
  renderPhotos();
  if (skipped) {
    const note = $('#photo-note');
    if (note) note.textContent = `Добавлено ${photos.length} из ${MAX_PHOTOS}. Файлы больше 10 МБ и не изображения пропущены.`;
  }
});

function invalid(input, message) {
  const field = input.closest('.field');
  field.classList.add('is-invalid');
  const err = field.querySelector('.field-error');
  if (err) err.textContent = message;
  return false;
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = $('#order-name');
  let ok = true;
  clearErrors();
  if (!nameInput.value.trim()) ok = invalid(nameInput, 'Напишите, как к вам обращаться');
  if (phoneInput.value.replace(/\D/g, '').length !== 11) ok = invalid(phoneInput, 'Укажите номер полностью: +7 и 10 цифр');
  if (!ok) {
    form.querySelector('.is-invalid input')?.focus();
    return;
  }

  const est = estimate(state);
  const p = problemById(state.problem);
  const data = new FormData();
  data.append('name', nameInput.value.trim());
  data.append('phone', phoneInput.value);
  data.append('comment', $('#order-comment').value.trim());
  data.append('window', `${state.width} × ${state.height} мм`);
  data.append('sashes', String(state.sashes));
  data.append('problem', p.label);
  data.append('estimate', rub(est.total));
  photos.forEach((ph, i) => data.append('photos[]', ph.file, ph.file.name || `photo-${i + 1}.jpg`));

  const submit = form.querySelector('[type="submit"]');
  const label = submit.textContent;
  submit.disabled = true;
  submit.textContent = 'Отправляем…';
  const status = $('#order-status');
  status.textContent = '';

  try {
    const endpoint = form.dataset.endpoint;
    if (endpoint) {
      const res = await fetch(endpoint, { method: 'POST', body: data });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } else {
      // Обработчик заявок не подключён: см. README, раздел «Приём заявок».
      await new Promise((r) => setTimeout(r, 600));
    }
    $('#order-done-phone').textContent = phoneInput.value;
    clearErrors();
    form.hidden = true;
    const done = $('#order-done');
    done.hidden = false;
    done.focus();
  } catch (err) {
    status.textContent = 'Не удалось отправить заявку. Проверьте интернет и попробуйте ещё раз или позвоните нам.';
  } finally {
    submit.disabled = false;
    submit.textContent = label;
  }
});

function clearErrors() {
  $$('.field.is-invalid', form).forEach((f) => f.classList.remove('is-invalid'));
}

$('#order-again')?.addEventListener('click', () => {
  form.reset();
  clearErrors();
  photos.splice(0).forEach((p) => URL.revokeObjectURL(p.url));
  renderPhotos();
  $('#order-done').hidden = true;
  form.hidden = false;
  $('#order-name').focus();
});

