// Анимации сайта «Мотив»: пиксельная планета, проявление при прокрутке,
// пиксельные границы секций, счётчики цен, шапка при прокрутке.
// Анимируются только transform/opacity и canvas; при prefers-reduced-motion всё статично.

export const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

// детерминированный «шум», чтобы узор не менялся между перерисовками
function hash(i, j, seed = 0) {
  const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ---------- пиксельная планета (знак «Мотив» в большом размере) ---------- */

export class PixelPlanet {
  constructor(canvas, options = {}) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.o = {
      cells: 21,
      size: 0.92, // диаметр в долях меньшей стороны
      center: [0.5, 0.5],
      tones: ['#1C5FC6', '#2A71D5', '#3B87E1', '#5AA5EC', '#8CCBF5'],
      orbit: '#DDEEFC',
      interactive: true,
      assemble: true,
      ...options,
    };
    this.host = this.o.host || canvas.parentElement;
    this.pointer = { x: 0, y: 0, active: false };
    this.par = { x: 0, y: 0 };
    this.start = 0;
    this.visible = false;
    this.raf = 0;
    this.tick = this.tick.bind(this);

    new ResizeObserver(() => this.layout()).observe(this.host);
    new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.play();
    }).observe(this.host);

    if (this.o.interactive) {
      this.host.addEventListener('pointermove', (e) => {
        const r = this.c.getBoundingClientRect();
        this.pointer.x = e.clientX - r.left;
        this.pointer.y = e.clientY - r.top;
        this.pointer.active = e.pointerType === 'mouse';
        this.play();
      });
      this.host.addEventListener('pointerleave', () => {
        this.pointer.active = false;
      });
    }
    document.addEventListener('visibilitychange', () => this.play());
    this.layout();
  }

  layout() {
    const r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = r.width;
    this.h = r.height;
    this.c.width = Math.round(r.width * dpr);
    this.c.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const n = this.o.cells;
    const D = Math.min(this.w, this.h) * this.o.size;
    const R = D / 2;
    const cell = D / n;
    this.R = R;
    this.cx = this.w * this.o.center[0];
    this.cy = this.h * this.o.center[1];

    // свет сверху справа, спереди
    const L = [0.5, 0.62, 0.6];
    const ll = Math.hypot(...L);
    const T = this.o.tones.length;
    this.px = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5 - n / 2) * cell;
        const y = (j + 0.5 - n / 2) * cell;
        if (x * x + y * y > R * R) continue;
        const nx = x / R, ny = -y / R;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const lam = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / ll);
        const tone = clamp(Math.floor(lam * T + (hash(i, j) - 0.5) * 0.6), 0, T - 1);
        const a = hash(i, j, 1) * Math.PI * 2;
        const d = R * (0.6 + hash(i, j, 2) * 0.9);
        this.px.push({
          x, y, nz, tone,
          size: cell * (0.5 + 0.34 * nz),
          sx: x + Math.cos(a) * d,
          sy: y + Math.sin(a) * d,
          delay: 0.1 + (1 - nz) * 0.45 + hash(i, j, 3) * 0.35,
          diag: (x - y) / (2 * R * Math.SQRT2) + 0.5,
          ox: 0,
          oy: 0,
        });
      }
    }
    this.cell = cell;
    if (!this.start) this.start = performance.now();
    this.play(true);
  }

  play(force = false) {
    if (this.raf) return;
    if (!force && (!this.visible || document.hidden)) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  tick(now) {
    this.raf = 0;
    if (!this.px) return;
    const ctx = this.ctx;
    const t = (now - this.start) / 1000;
    ctx.clearRect(0, 0, this.w, this.h);

    const tp = this.pointer.active
      ? { x: ((this.pointer.x - this.cx) / this.w) * -18, y: ((this.pointer.y - this.cy) / this.h) * -18 }
      : { x: 0, y: 0 };
    this.par.x = lerp(this.par.x, tp.x, 0.06);
    this.par.y = lerp(this.par.y, tp.y, 0.06);

    this.drawOrbit(t, false);

    const T = this.o.tones.length;
    const band = ((t * 0.11) % 1.5) - 0.25; // световая волна по диагонали
    const repelR = this.R * 0.42;
    let moving = false;
    for (const p of this.px) {
      const k = REDUCED || !this.o.assemble ? 1 : clamp((t - p.delay) / 1.2, 0, 1);
      const e = easeOutQuart(k);
      if (k < 1) moving = true;
      let bx = lerp(p.sx, p.x, e);
      let by = lerp(p.sy, p.y, e);

      // пиксели мягко расступаются вокруг курсора
      let tx = 0, ty = 0;
      if (this.pointer.active && !REDUCED) {
        const dx = this.cx + bx - this.pointer.x;
        const dy = this.cy + by - this.pointer.y;
        const dist = Math.hypot(dx, dy);
        if (dist < repelR && dist > 0.1) {
          const f = Math.pow(1 - dist / repelR, 2) * this.cell * 0.9;
          tx = (dx / dist) * f;
          ty = (dy / dist) * f;
        }
      }
      p.ox = lerp(p.ox, tx, 0.12);
      p.oy = lerp(p.oy, ty, 0.12);
      if (Math.abs(p.ox - tx) > 0.05 || Math.abs(p.oy - ty) > 0.05) moving = true;

      const glow = REDUCED ? 0 : Math.max(0, 1 - Math.abs(p.diag - band) / 0.07);
      const tone = Math.min(T - 1, p.tone + (glow > 0.35 ? 1 : 0));
      const s = p.size * (0.25 + 0.75 * e) * (1 + glow * 0.14);
      const depth = 0.5 + 0.5 * p.nz;
      ctx.globalAlpha = e;
      ctx.fillStyle = this.o.tones[tone];
      ctx.fillRect(
        this.cx + bx + p.ox + this.par.x * depth - s / 2,
        this.cy + by + p.oy + this.par.y * depth - s / 2,
        s,
        s,
      );
    }
    ctx.globalAlpha = 1;
    this.drawOrbit(t, true);

    // непрерывно: волна и орбита; при REDUCED — только пока идёт сборка
    const keep = !REDUCED || moving;
    if (keep && this.visible && !document.hidden) this.raf = requestAnimationFrame(this.tick);
  }

  // три пикселя на наклонной орбите — «движение» из логотипа
  drawOrbit(t, front) {
    if (!this.o.orbit) return;
    const ctx = this.ctx;
    const rx = this.R * 1.14, ry = this.R * 0.3, tilt = -0.38;
    const appear = REDUCED ? 1 : clamp((t - 1.2) / 0.8, 0, 1);
    if (appear <= 0) return;
    for (let k = 0; k < 3; k++) {
      const a = (REDUCED ? 0.6 : t * 0.42) - k * 0.1;
      const isFront = Math.sin(a) > 0;
      if (isFront !== front) continue;
      const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
      const x = this.cx + ex * Math.cos(tilt) - ey * Math.sin(tilt) + this.par.x * 1.3;
      const y = this.cy + ex * Math.sin(tilt) + ey * Math.cos(tilt) + this.par.y * 1.3;
      const s = this.cell * (0.55 - k * 0.14);
      ctx.globalAlpha = appear * (1 - k * 0.22);
      ctx.fillStyle = this.o.orbit;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
}

/* ---------- проявление при прокрутке ---------- */

export function initReveal() {
  document.querySelectorAll('[data-reveal-group]').forEach((g) => {
    [...g.children].forEach((el, i) => {
      el.setAttribute('data-reveal', '');
      el.style.setProperty('--i', String(i));
    });
  });
  const els = document.querySelectorAll('[data-reveal], [data-animate]');
  if (REDUCED || !('IntersectionObserver' in window)) {
    els.forEach((el) => {
      el.classList.add('is-in');
      el.dispatchEvent(new CustomEvent('reveal'));
    });
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        en.target.dispatchEvent(new CustomEvent('reveal'));
        io.unobserve(en.target);
      });
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
  );
  els.forEach((el) => io.observe(el));
}

/* ---------- заголовок по словам ---------- */

export function splitWords(el) {
  if (!el) return;
  const label = el.textContent.replace(/\s+/g, ' ').trim();
  let i = 0;
  const split = (html) =>
    html
      .trim()
      .split(/\s+/)
      .map((w) => `<span class="w"><span style="--i:${i++}">${w}</span></span>`)
      .join(' ');
  // заголовок из нескольких строк (.line) — делим каждую строку отдельно, сохраняя разметку строк
  const lines = el.querySelectorAll(':scope > .line');
  if (lines.length) lines.forEach((line) => { line.innerHTML = split(line.innerHTML); });
  else el.innerHTML = split(el.innerHTML);
  el.setAttribute('aria-label', label);
}

/* ---------- счётчики цен ---------- */

export function initCounters() {
  const nf = new Intl.NumberFormat('ru-RU');
  document.querySelectorAll('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count);
    const prefix = el.dataset.prefix || '';
    const final = `${prefix}${nf.format(to)} ₽`;
    if (REDUCED) {
      el.textContent = final;
      return;
    }
    const host = el.closest('[data-animate]') || el;
    host.addEventListener(
      'reveal',
      () => {
        const t0 = performance.now();
        const dur = 900 + Math.random() * 300;
        const step = (now) => {
          const k = Math.min(1, (now - t0) / dur);
          const v = Math.round((to * easeOutQuart(k)) / 10) * 10;
          el.textContent = `${prefix}${nf.format(k < 1 ? v : to)} ₽`;
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        setTimeout(() => (el.textContent = final), dur + 100);
      },
      { once: true },
    );
  });
}

/* ---------- пиксельные границы между секциями ---------- */

export function initPixelEdges() {
  const edges = [...document.querySelectorAll('.pixel-edge')];
  if (!edges.length) return;
  const draw = () => {
    edges.forEach((el, n) => {
      const w = el.clientWidth;
      const size = w < 600 ? 12 : 16;
      const cols = Math.ceil(w / size);
      const rows = 3;
      const odds = [0.92, 0.45, 0.16];
      const top = el.dataset.edge === 'top';
      let rects = '';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (hash(c, r, n + 5) > odds[r]) continue;
          const y = top ? r * size : (rows - 1 - r) * size;
          const d = (hash(c, r, n + 9) * 0.6 + r * 0.15).toFixed(2);
          rects += `<rect x="${c * size}" y="${y}" width="${size}" height="${size}" style="--d:${d}s"/>`;
        }
      }
      el.innerHTML = `<svg width="${cols * size}" height="${rows * size}" aria-hidden="true">${rects}</svg>`;
      el.setAttribute('data-animate', '');
      el.style.height = `${rows * size}px`;
    });
  };
  draw();
  let tm = 0;
  window.addEventListener('resize', () => {
    clearTimeout(tm);
    tm = setTimeout(draw, 150);
  });
}

/* ---------- шапка при прокрутке ---------- */

export function initHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const hero = document.querySelector('.hero');
  const update = () => {
    const limit = hero ? hero.offsetHeight - 80 : 40;
    header.classList.toggle('is-scrolled', window.scrollY > 16);
    header.classList.toggle('is-past-hero', window.scrollY > limit);
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
}
