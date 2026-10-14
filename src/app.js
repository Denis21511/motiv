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

// 3D создаём не при загрузке, а когда оно нужно: создание сцены и сборка шейдеров
// на мгновение блокируют страницу, и при открытии сайта это выглядело как зависание
let hero = null;
let viewer = null;

function wire(v) {
  if (v.failed) document.documentElement.classList.add('no-webgl');
  else v.el.addEventListener('w3d:interact', () => v.el.classList.add('was-touched'), { once: true });
}

// окно на главном экране — сразу после первой отрисовки: текст и облака видны без задержки
if (heroEl) {
  requestAnimationFrame(() =>
    setTimeout(() => {
      hero = new WindowViewer(heroEl, {
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
      wire(hero);
    }),
  );
}

// окно калькулятора — когда до него остаётся примерно экран прокрутки
if (calcEl) {
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((en) => en.isIntersecting)) return;
      io.disconnect();
      viewer = new WindowViewer(calcEl, {
        width: state.width,
        height: state.height,
        sashes: state.sashes,
        pad: { top: 64, right: 24, bottom: 40, left: 24 },
        topBar: calcEl.querySelector('.stage-bar'),
        theme: { hl: '#3FA2F5', air: '#CFEAFF', dim: '#8FB6E3', shadow: '2,12,35' },
      });
      wire(viewer);
      update();
    },
    { rootMargin: '800px 0px' },
  );
  io.observe(calcEl);
}

// устройство окна: при прокрутке окно разбирается и подсвечивает деталь из текущего шага
const anatomyEl = $('#anatomy-viewer');
const anatomySteps = $$('.anatomy-step');
let anatomy = null;
let anatomyStep = 0;

function showAnatomyStep(i) {
  if (i < 0) return;
  anatomyStep = i;
  anatomySteps.forEach((el, k) => el.classList.toggle('is-active', k === i));
  if (!anatomy || anatomy.failed) return;
  const step = anatomySteps[i];
  const explode = step.dataset.explode === '1';
  if (anatomy.exploded !== explode) anatomy.setExploded(explode);
  anatomy.setMode(step.dataset.mode);
}

if (anatomyEl && anatomySteps.length) {
  const lazy = new IntersectionObserver(
    (entries) => {
      if (!entries.some((en) => en.isIntersecting)) return;
      lazy.disconnect();
      anatomy = new WindowViewer(anatomyEl, {
        width: 1300,
        height: 1400,
        sashes: 2,
        dims: false,
        parts: true,
        yaw: -0.5,
        pitch: 0.1,
        pad: { top: 40, right: 32, bottom: 56, left: 32 },
        theme: { hl: '#3FA2F5', air: '#CFEAFF', dim: '#8FB6E3', shadow: '2,12,35' },
      });
      wire(anatomy);
      showAnatomyStep(anatomyStep);
    },
    { rootMargin: '800px 0px' },
  );
  lazy.observe(anatomyEl);

  // активный шаг — тот, что пересекает линию чуть ниже середины экрана
  // (на телефоне верх экрана занят 3D-окном, поэтому линия ниже)
  const line = matchMedia('(max-width: 900px)').matches ? '-72% 0px -27% 0px' : '-48% 0px -51% 0px';
  const io = new IntersectionObserver(
    (entries) => entries.forEach((en) => en.isIntersecting && showAnatomyStep(anatomySteps.indexOf(en.target))),
    { rootMargin: line },
  );
  anatomySteps.forEach((el) => io.observe(el));
  showAnatomyStep(0);
}

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

// выставить параметры калькулятора целиком (из квиза)
function applyCalc({ width, height, sashes, problem }) {
  Object.assign(state, { width, height, sashes, problem });
  if (widthInput) widthInput.value = String(width);
  if (heightInput) heightInput.value = String(height);
  const sr = $(`input[name="sashes"][value="${sashes}"]`);
  if (sr) sr.checked = true;
  const pr = $(`input[name="problem"][value="${problem}"]`);
  if (pr) pr.checked = true;
  update();
}
/* ---------- квиз «Что с окном?»: подбирает вид ремонта и считает цену тем же калькулятором ---------- */

const QUIZ_ICONS = {
  wind: '<path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h5"/>',
  sash: '<rect x="3.5" y="3.5" width="17" height="17"/><path d="M3.5 3.5L11 7v16.5"/>',
  handle: '<rect x="8.5" y="2.5" width="7" height="9"/><rect x="10.5" y="8" width="3" height="13.5"/>',
  glass: '<path d="M3.5 6.5l5-2v15l-5 2zM9.5 6.5l5-2v15l-5 2zM15.5 6.5l5-2v15l-5 2z"/>',
  all: '<rect x="3.5" y="3.5" width="7" height="7"/><rect x="13.5" y="3.5" width="7" height="7"/><rect x="3.5" y="13.5" width="7" height="7"/><rect x="13.5" y="13.5" width="7" height="7"/>',
  ok: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>',
  crack: '<path d="M4 4h16v16H4z"/><path d="M11 4l-2 5 4 3-3 4 2 4"/>',
  ask: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.7M12 17v.01"/>',
  sag: '<rect x="4" y="3.5" width="16" height="17"/><path d="M7 7l10 2v9H7z"/>',
  force: '<path d="M4 12h12M12 7l5 5-5 5"/><path d="M20 5v14"/>',
  stuck: '<rect x="5" y="10" width="14" height="10" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  loose: '<rect x="9" y="3" width="6" height="8"/><path d="M12 11v10M8.5 15.5l-2 1M15.5 15.5l2 1"/>',
  // схемы окон: рама, створки и треугольник открывания
  s1: '<rect x="18" y="6" width="28" height="52" rx="1"/><rect x="22" y="10" width="20" height="44"/><path d="M42 10L22 32l20 22" stroke-dasharray="3 3"/>',
  s2: '<rect x="6" y="6" width="52" height="52" rx="1"/><path d="M32 6v52"/><rect x="10" y="10" width="18" height="44"/><rect x="36" y="10" width="18" height="44"/><path d="M28 10L10 32l18 22" stroke-dasharray="3 3"/>',
  s3: '<rect x="2" y="10" width="60" height="44" rx="1"/><path d="M22 10v44M42 10v44"/><rect x="5" y="13" width="14" height="38"/><rect x="45" y="13" width="14" height="38"/><path d="M19 13L5 32l14 19" stroke-dasharray="3 3"/>',
};

const QUIZ = {
  start: {
    q: 'Что беспокоит больше всего?',
    options: [
      { t: 'Дует, холодно у окна', img: 'produvanie', next: 'draft' },
      { t: 'Створка плохо закрывается или открывается', img: 'stvorki', next: 'sash' },
      { t: 'Ручка болтается или не поворачивается', img: 'ruchka', next: 'handle' },
      { t: 'Треснуло стекло или запотело между стёклами', img: 'steklopaket', result: 'glass' },
      { t: 'Всё понемногу', img: 'furnitura', result: 'complex' },
    ],
  },
  draft: {
    q: 'Потрогайте уплотнитель — резинку по краю створки. Какой он?',
    options: [
      { t: 'Мягкий и целый', icon: 'ok', result: 'close' },
      { t: 'Твёрдый, потрескался или порван', icon: 'crack', result: 'draft' },
      { t: 'Не знаю', icon: 'ask', result: 'draft' },
    ],
  },
  sash: {
    q: 'Что происходит со створкой?',
    options: [
      { t: 'Задевает раму или провисла', icon: 'sag', result: 'close' },
      { t: 'Закрывается с большим усилием', icon: 'force', result: 'close' },
      { t: 'Не закрывается до конца или заклинило', icon: 'stuck', result: 'hardware' },
    ],
  },
  handle: {
    q: 'Что с ручкой?',
    options: [
      { t: 'Болтается, прокручивается или сломана', icon: 'loose', result: 'handle' },
      { t: 'Поворачивается очень туго', icon: 'force', result: 'close' },
      { t: 'Не поворачивается совсем', icon: 'stuck', result: 'hardware' },
    ],
  },
  sashes: {
    q: 'Сколько створок в окне?',
    options: [
      { t: 'Одна створка', win: 's1', sashes: 1 },
      { t: 'Две створки', win: 's2', sashes: 2 },
      { t: 'Три створки', win: 's3', sashes: 3 },
    ],
  },
};

// типовые размеры окна по числу створок, мм
const QUIZ_SIZE = { 1: [800, 1400], 2: [1400, 1400], 3: [2000, 1400] };

const QUIZ_IMG = { close: 'regulirovka', draft: 'produvanie', handle: 'ruchka', hardware: 'furnitura', glass: 'steklopaket', complex: 'uplotnitel' };
const QUIZ_STEPS = ['Что случилось', 'Подробности', 'Окно'];

const QUIZ_RESULT = {
  close: { title: 'Регулировка створок', why: 'Створка сместилась или прижимается неплотно. Обычно хватает регулировки петель и прижима.' },
  draft: { title: 'Регулировка и замена уплотнителя', why: 'Уплотнитель износился, и воздух проходит через притвор. Меняем контур и регулируем прижим.' },
  handle: { title: 'Замена ручки', why: 'Ручка разболталась или сломалась — ставим новую.' },
  hardware: { title: 'Ремонт или замена фурнитуры', why: 'Похоже, износились петли или запорный механизм. Мастер проверит, можно ли обойтись ремонтом.' },
  glass: { title: 'Замена стеклопакета', why: 'Трещину или конденсат внутри стеклопакета не исправить — его меняют целиком, по размеру створки.' },
  complex: { title: 'Комплексный ремонт', why: 'Регулировка, смазка и проверка всей фурнитуры, замена уплотнителя.' },
};

const quizEl = $('#quiz-app');
if (quizEl) {
  const q = { node: 'start', history: [], problem: null, sashes: 2 };
  const icon = (name) => (name ? `<svg viewBox="0 0 24 24" aria-hidden="true">${QUIZ_ICONS[name]}</svg>` : '');

  const render = (focus = false) => {
    // шаги сверху: текущий, пройденные (и пропущенный, если причина ясна сразу)
    const cur = q.node === 'start' ? 0 : q.node === 'sashes' ? 2 : q.node === 'result' ? 3 : 1;
    const steps = `<ol class="quiz-steps">${QUIZ_STEPS.map(
      (t, i) => `<li class="${i < cur ? 'is-done' : i === cur ? 'is-current' : ''}"><span>${t}</span></li>`,
    ).join('')}</ol>`;
    let html;
    if (q.node === 'result') {
      const [width, height] = QUIZ_SIZE[q.sashes];
      const est = estimate({ width, height, sashes: q.sashes, problem: q.problem });
      const r = QUIZ_RESULT[q.problem];
      const sashWord = plural(q.sashes, 'створка', 'створки', 'створок');
      html = `${steps}<div class="quiz-body quiz-result">
        <div class="quiz-result-media"><img src="assets/img/services/${QUIZ_IMG[q.problem]}.webp" width="1200" height="900" alt=""></div>
        <div class="quiz-result-info">
          <p class="quiz-label">Скорее всего, нужно</p>
          <h3 tabindex="-1">${r.title}</h3>
          <p class="quiz-why">${r.why}</p>
          <div class="quiz-price"><span>Ориентировочно</span><b>${rub(est.total)}</b><small>для типового окна ${width} × ${height} мм, ${q.sashes} ${sashWord}</small></div>
          <ul class="quiz-lines">${est.lines.map((l) => `<li><span>${l.label}</span><span>${rub(l.sum)}</span></li>`).join('')}</ul>
          <div class="quiz-actions">
            <a class="btn btn-accent btn-lg" href="#order" data-quiz-go="order">Вызвать мастера</a>
            <a class="btn btn-outline btn-lg" href="#calc" data-quiz-go="calc">Уточнить размеры</a>
          </div>
          <button class="quiz-restart" type="button">↺ Пройти заново</button>
          <p class="quiz-note">Это предварительная оценка по&nbsp;ответам. Точную причину мастер определит на&nbsp;месте.</p>
        </div>
      </div>`;
    } else {
      const node = QUIZ[q.node];
      const kind = node.options[0].img ? 'is-tiles' : node.options[0].win ? 'is-windows' : 'is-text';
      const option = (o, i) => {
        if (o.img) {
          return `<button class="quiz-opt quiz-tile" type="button" data-i="${i}"><span class="quiz-tile-media"><img src="assets/img/services/${o.img}.webp" width="1200" height="900" alt="" loading="lazy" decoding="async"></span><span class="quiz-tile-label">${o.t}</span></button>`;
        }
        if (o.win) {
          return `<button class="quiz-opt quiz-win" type="button" data-i="${i}"><svg viewBox="0 0 64 64" aria-hidden="true">${QUIZ_ICONS[o.win]}</svg><span>${o.t}</span></button>`;
        }
        return `<button class="quiz-opt" type="button" data-i="${i}">${icon(o.icon)}<span>${o.t}</span></button>`;
      };
      html = `${steps}<div class="quiz-body">
        <h3 class="quiz-q" tabindex="-1">${node.q}</h3>
        <div class="quiz-options ${kind}">${node.options.map(option).join('')}</div>
        ${q.history.length ? '<button class="quiz-back" type="button">← Назад</button>' : ''}
      </div>`;
    }
    quizEl.innerHTML = html;
    const body = $('.quiz-body', quizEl);
    if (!REDUCED) body.classList.add('is-enter');
    if (focus) $('[tabindex="-1"]', quizEl)?.focus({ preventScroll: true });
  };

  quizEl.addEventListener('click', (e) => {
    const opt = e.target.closest('.quiz-opt');
    if (opt) {
      const o = QUIZ[q.node].options[Number(opt.dataset.i)];
      q.history.push({ node: q.node, problem: q.problem });
      if (o.sashes) {
        q.sashes = o.sashes;
        q.node = 'result';
      } else {
        if (o.result) q.problem = o.result;
        q.node = o.next || 'sashes';
      }
      render(true);
      return;
    }
    if (e.target.closest('.quiz-back')) {
      const prev = q.history.pop();
      if (prev) Object.assign(q, prev);
      render(true);
      return;
    }
    if (e.target.closest('.quiz-restart')) {
      Object.assign(q, { node: 'start', history: [], problem: null, sashes: 2 });
      render(true);
      return;
    }
    const go = e.target.closest('[data-quiz-go]');
    if (go) {
      // переносим ответ в калькулятор и заявку
      const [width, height] = QUIZ_SIZE[q.sashes];
      applyCalc({ width, height, sashes: q.sashes, problem: q.problem });
      if (go.dataset.quizGo === 'order' && commentField && !commentField.value.trim()) {
        commentField.value = `По квизу: ${QUIZ_RESULT[q.problem].title.toLowerCase()}. `;
      }
    }
  });

  render();
}

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

