// Пиксельная карта районов: canvas, наведение и выбор в списке подсвечивают район.
import { MAP } from './map-data.js';

// тона подобраны так, чтобы соседние районы контрастировали
// (порядок: Металлургический, Курчатовский, Калининский, Тракторозаводский, Центральный, Ленинский, Советский)
const COLORS = ['#1E5FC0', '#9AD2F7', '#3D8BE6', '#C4E3F9', '#1A4590', '#5AAEEA', '#2E74D4'];
const ACCENT = '#FFB627';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hash = (a, b) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function initDistrictMap() {
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;
  const box = canvas.parentElement;
  const tip = document.getElementById('map-tip');
  const buttons = [...document.querySelectorAll('#map-list [data-d]')];
  const { cols, rows, grid, names, centers } = MAP;
  const ctx = canvas.getContext('2d');
  let active = -1;
  let progress = REDUCED ? 1 : 0;
  let cell = 0;

  buttons.forEach((b) => b.style.setProperty('--c', COLORS[Number(b.dataset.d)]));

  function draw() {
    const dpr = canvas.width / (cell * cols) || 1;
    const c = cell * dpr;
    const gap = Math.max(1, c * 0.16);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rows; r++) {
      const row = grid[r];
      for (let x = 0; x < cols; x++) {
        const ch = row[x];
        if (ch === '.') {
          // фон — редкая сетка точек, как на чертеже
          if ((x + r) % 2 === 0) {
            ctx.globalAlpha = 0.09;
            ctx.fillStyle = '#8CCBF5';
            ctx.fillRect(x * c + c * 0.4, r * c + c * 0.4, c * 0.2, c * 0.2);
          }
          continue;
        }
        // появление: пиксели «собираются» сверху вниз с разбросом
        if (progress < 1 && progress * (rows + 14) - r - hash(r, x) * 14 < 0) continue;
        const d = ch.charCodeAt(0) - 48;
        ctx.globalAlpha = active < 0 || active === d ? 1 : 0.32;
        ctx.fillStyle = active === d ? ACCENT : COLORS[d];
        ctx.fillRect(x * c + gap / 2, r * c + gap / 2, c - gap, c - gap);
      }
    }
    ctx.globalAlpha = 1;
  }

  function resize() {
    const w = box.clientWidth;
    if (!w) return;
    cell = w / cols;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(cell * rows * dpr);
    canvas.style.height = `${cell * rows}px`;
    draw();
  }

  function setActive(d) {
    if (d === active) return;
    active = d;
    buttons.forEach((b) => b.classList.toggle('is-active', Number(b.dataset.d) === d));
    if (tip) {
      if (d < 0) tip.classList.remove('is-on');
      else {
        const [cx, cy] = centers[d];
        tip.textContent = `${names[d]} район — выезжаем`;
        tip.style.left = `${((cx + 0.5) / cols) * 100}%`;
        tip.style.top = `${((cy + 0.5) / rows) * 100}%`;
        tip.classList.add('is-on');
      }
    }
    draw();
  }

  const districtAt = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * cols);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * rows);
    const ch = grid[y]?.[x];
    return ch && ch !== '.' ? ch.charCodeAt(0) - 48 : -1;
  };
  canvas.addEventListener('pointermove', (e) => e.pointerType === 'mouse' && setActive(districtAt(e)));
  canvas.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && setActive(-1));
  // на телефоне — по касанию
  canvas.addEventListener('pointerdown', (e) => e.pointerType !== 'mouse' && setActive(districtAt(e)));

  buttons.forEach((b) => {
    const d = Number(b.dataset.d);
    b.addEventListener('mouseenter', () => setActive(d));
    b.addEventListener('mouseleave', () => setActive(-1));
    b.addEventListener('focus', () => setActive(d));
    b.addEventListener('blur', () => setActive(-1));
    b.addEventListener('click', () => setActive(d));
  });

  new ResizeObserver(resize).observe(box);
  resize();

  if (!REDUCED) {
    const io = new IntersectionObserver(
      ([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const dur = 1600;
        const step = (now) => {
          progress = Math.min(1, (now - t0) / dur);
          draw();
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        // в фоновой вкладке rAF не идёт — карту показываем целиком в любом случае
        setTimeout(() => {
          progress = 1;
          draw();
        }, dur + 200);
      },
      { threshold: 0.3 },
    );
    io.observe(box);
  }
}
