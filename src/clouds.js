// Облака на небе: рисуем сами на canvas (без видео и стоков) и медленно гоним слева направо.
// Облако — купол из «клубов»: каждый клуб освещён солнцем справа сверху, с голубой тенью снизу слева,
// низ у облака плоский и чуть темнее — как у летних кучевых.

const LIGHT = ['#ffffff', '#fcfdff', '#eef4fb', '#dde8f6'];
const SHADE = '#c0d4ec';

// повторяемый случайный ряд: одно и то же облако при каждой загрузке
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r, a, b) => a + (b - a) * r();

// клубы облака в долях высоты H; ширина W = aspect * H
function puffs(r, aspect) {
  const W = aspect;
  const base = 0.8;
  // главный купол и 1–2 пониже по бокам
  const main = between(r, 0.4, 0.6) * W;
  const domes = [{ x: main, h: between(r, 0.64, 0.74), w: between(r, 0.3, 0.38) * W }];
  for (const side of [-1, 1]) {
    if (r() < 0.75) domes.push({ x: main + side * between(r, 0.2, 0.3) * W, h: between(r, 0.36, 0.5), w: between(r, 0.22, 0.3) * W });
  }
  const top = (x) => {
    let h = 0.18;
    for (const d of domes) {
      const k = 1 - ((x - d.x) / d.w) ** 2;
      if (k > 0) h = Math.max(h, d.h * Math.sqrt(k));
    }
    return h;
  };

  const list = [];
  // нижний ряд держит плоское дно; рисуется первым, верхние клубы ложатся поверх
  const m = Math.max(3, Math.round(W * 2));
  const bottom = [];
  for (let i = 0; i < m; i++) {
    const x = (0.1 + 0.8 * (i + 0.5 + (r() - 0.5) * 0.4) / m) * W;
    const rad = between(r, 0.17, 0.23);
    bottom.push({ x, y: base - rad * 0.55, r: rad });
  }
  // крупные клубы по контуру купола
  const n = Math.max(4, Math.round(W * 3.6));
  for (let i = 0; i < n; i++) {
    const x = (0.12 + 0.76 * (i + 0.5 + (r() - 0.5) * 0.6) / n) * W;
    const h = top(x);
    const rad = Math.min(h * 0.7, Math.max(0.17, h * between(r, 0.46, 0.58)));
    list.push({ x, y: base - h + rad, r: rad });
  }
  // контур сверху вниз: нижние клубы ложатся поверх верхних, и между ними видны мягкие тени
  return { list: [...bottom, ...list.sort((a, b) => a.y - b.y)], top, base };
}

function drawCloud(w, seed, scale) {
  const r = rng(seed);
  const aspect = between(r, 1.6, 2.2);
  const H = w / aspect;
  const pad = Math.ceil(H * 0.06);
  const cw = Math.round((w + pad * 2) * scale);
  const ch = Math.round((H + pad * 2) * scale);

  const work = document.createElement('canvas');
  work.width = cw;
  work.height = ch;
  const g = work.getContext('2d');
  g.setTransform(H * scale, 0, 0, H * scale, pad * scale, pad * scale);

  const { list, top, base } = puffs(r, aspect);
  // тело облака под клубами, чтобы между ними не было просветов
  g.fillStyle = LIGHT[2];
  g.beginPath();
  g.moveTo(0.14 * aspect, base);
  for (let x = 0.14; x <= 0.86; x += 0.02) g.lineTo(x * aspect, base - top(x * aspect) * 0.8);
  g.lineTo(0.86 * aspect, base);
  g.fill();

  for (const p of list) {
    // тень клуба — чуть ниже и левее, видна мягким полумесяцем на стыке с соседями
    g.fillStyle = SHADE;
    g.beginPath();
    g.arc(p.x - p.r * 0.04, p.y + p.r * 0.07, p.r, 0, Math.PI * 2);
    g.fill();
    const lit = g.createRadialGradient(p.x + p.r * 0.3, p.y - p.r * 0.42, 0, p.x, p.y, p.r);
    lit.addColorStop(0, LIGHT[0]);
    lit.addColorStop(0.6, LIGHT[1]);
    lit.addColorStop(0.88, LIGHT[2]);
    lit.addColorStop(1, LIGHT[3]);
    g.fillStyle = lit;
    g.beginPath();
    g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    g.fill();
  }

  // низ облака в тени, сам низ плоский и мягко растворяется
  g.globalCompositeOperation = 'source-atop';
  const belly = g.createLinearGradient(0, 0.45, 0, 0.82);
  belly.addColorStop(0, 'rgba(120, 155, 205, 0)');
  belly.addColorStop(1, 'rgba(120, 155, 205, 0.32)');
  g.fillStyle = belly;
  g.fillRect(-1, 0, aspect + 2, 1.2);
  g.globalCompositeOperation = 'destination-out';
  const cut = g.createLinearGradient(0, 0.78, 0, 0.9);
  cut.addColorStop(0, 'rgba(0, 0, 0, 0)');
  cut.addColorStop(1, 'rgba(0, 0, 0, 1)');
  g.fillStyle = cut;
  g.fillRect(-1, 0.78, aspect + 2, 1);

  // края — пушистые, без резкого контура
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  const o = out.getContext('2d');
  o.filter = `blur(${(H * 0.009 * scale).toFixed(1)}px)`;
  o.drawImage(work, 0, 0);
  out.style.width = `${(w + pad * 2).toFixed(1)}px`;
  out.style.marginLeft = out.style.marginTop = `${-pad}px`;
  return out;
}

// ряды по глубине: дальние мелкие, бледные и медленные, ближние крупные и быстрее
const PRESETS = {
  hero: [
    { n: 4, w: [130, 210], y: [0.06, 0.5], o: 0.7, v: 7 },
    { n: 3, w: [260, 380], y: [0.12, 0.62], o: 0.9, v: 11 },
    { n: 2, w: [480, 640], y: [0.5, 0.86], o: 1, v: 16 },
  ],
  band: [
    { n: 3, w: [120, 190], y: [0.12, 0.45], o: 0.65, v: 7 },
    { n: 3, w: [260, 380], y: [0.35, 0.85], o: 0.9, v: 12 },
  ],
};

let seq = 1;
function fill(sky) {
  const layers = PRESETS[sky.dataset.clouds] || PRESETS.band;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const box = document.createElement('div');
  box.className = 'clouds';
  const width = () => sky.clientWidth;
  const k = Math.min(1.15, Math.max(0.5, width() / 1440));
  let seed = 7919 * seq++;

  layers.forEach((L, li) => {
    const r = rng(seed + li * 101);
    for (let i = 0; i < L.n; i++) {
      const w = Math.round(between(r, L.w[0], L.w[1]) * k);
      const cloud = drawCloud(w, (seed += 977), scale);
      cloud.className = 'cloud';
      // путь: от левого края (целиком за кадром) до правого; фазы разнесены, чтобы облака не сбивались в кучу
      const dur = (width() + w * 1.2) / (L.v * Math.max(k, 0.7));
      const phase = (i + between(r, 0.1, 0.7)) / L.n;
      cloud.style.cssText += `top:${(between(r, L.y[0], L.y[1]) * 100).toFixed(1)}%;--w:${w}px;--p:${phase.toFixed(3)};--o:${L.o};animation-duration:${dur.toFixed(0)}s;animation-delay:${(-phase * dur).toFixed(1)}s`;
      box.append(cloud);
    }
  });

  const sync = () => sky.style.setProperty('--sky-w', `${width()}px`);
  sync();
  new ResizeObserver(sync).observe(sky);
  sky.append(box);
  requestAnimationFrame(() => sky.classList.add('is-ready'));
  // без движения облака просто стоят на своих местах (см. prefers-reduced-motion в стилях)
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // вне экрана — не двигаем
  new IntersectionObserver(([en]) => sky.classList.toggle('is-paused', !en.isIntersecting)).observe(sky);
}

export function initClouds(root = document) {
  const skies = [...root.querySelectorAll('.sky[data-clouds]')];
  const later = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        later.unobserve(en.target);
        fill(en.target);
      }
    },
    { rootMargin: '600px 0px' },
  );
  skies.forEach((sky) => later.observe(sky));
}
