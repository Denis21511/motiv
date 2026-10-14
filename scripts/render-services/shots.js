// Картинки для карточек услуг: рендер нашей же 3D-модели с подсветкой нужной детали.
// Запуск: npm run render:services → открыть адрес из консоли в браузере (Chrome/Edge).
import { WindowViewer } from '../../src/window3d.js';

// размер картинки на выходе (4:3), рисуем крупнее и вырезаем нужную часть
const OUT_W = 1200;
const OUT_H = 900;

// mode — режим подсветки из калькулятора; focus — деталь, вокруг которой кадрируем; zoom — приближение
const SHOTS = [
  // карточки услуг: разные ракурсы и крупные планы, чтобы картинки не повторяли друг друга
  { name: 'regulirovka', size: [1300, 1400, 2], mode: 'close', phase: 'open', yaw: 0.42, pitch: 0.1, zoom: 1 },
  { name: 'uplotnitel', size: [1300, 1400, 2], mode: 'seal', focus: 'seal', yaw: -0.62, pitch: 0.12, zoom: 2.2 },
  { name: 'ruchka', size: [1300, 1400, 2], mode: 'handle', phase: 'turned', focus: 'handle', yaw: -0.45, pitch: 0.06, zoom: 3.4 },
  { name: 'furnitura', size: [1300, 1400, 2], mode: 'hardware', focus: 'hardware', yaw: -0.7, pitch: 0.14, zoom: 2.2 },
  { name: 'steklopaket', size: [1300, 1400, 2], mode: 'glass', yaw: 0.34, pitch: -0.04, zoom: 1 },
  { name: 'produvanie', size: [1300, 1400, 2], mode: 'draft', yaw: -0.5, pitch: 0.08, zoom: 1 },
  { name: 'stvorki', size: [900, 1400, 1], mode: 'close', phase: 'half', yaw: 0.5, pitch: 0.12, zoom: 1 },
  { name: 'dveri', size: [800, 2150, 1], mode: 'complex', yaw: -0.45, pitch: 0.06, zoom: 1 },
  // «Было / Стало»: одинаковый ракурс, чтобы слои совпали
  { name: 'cold', dir: 'compare', size: [1300, 1400, 2], mode: 'draft', yaw: -0.22, pitch: 0.04, zoom: 1 },
  { name: 'warm', dir: 'compare', size: [1300, 1400, 2], mode: null, yaw: -0.22, pitch: 0.04, zoom: 1 },
];

const host = document.getElementById('stage');
const viewer = new WindowViewer(host, {
  width: 1300,
  height: 1400,
  sashes: 2,
  dims: false,
  parts: false,
  pad: { top: 60, right: 60, bottom: 80, left: 60 },
  theme: { hl: '#3FA2F5', air: '#CFEAFF', dim: '#8FB6E3', shadow: '2,12,35' },
});

window.viewer = viewer; // для отладки из консоли

const out = document.createElement('canvas');
out.width = OUT_W;
out.height = OUT_H;
const octx = out.getContext('2d');
const log = (s) => (document.getElementById('log').textContent += s + '\n');

let clock = performance.now();
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    cancelAnimationFrame(viewer.raf);
    viewer.raf = 0;
    clock += 1000 / 60;
    viewer.tick(clock);
  }
  cancelAnimationFrame(viewer.raf);
  viewer.raf = 0;
}

// кадрирование: прямоугольник 4:3 вокруг детали (или центра), не выходя за холст
function capture(shot) {
  const src = viewer.renderer.domElement;
  const W = src.width;
  const H = src.height;
  const pr = viewer.renderer.getPixelRatio();
  let sw = Math.min(W, (H * 4) / 3) / shot.zoom;
  let sh = (sw * 3) / 4;
  let cx = W / 2;
  let cy = H / 2;
  if (shot.focus) {
    const p = viewer.project(viewer.anchors[shot.focus]);
    cx = p.x * pr;
    cy = p.y * pr;
  }
  const sx = Math.max(0, Math.min(W - sw, cx - sw / 2));
  const sy = Math.max(0, Math.min(H - sh, cy - sh / 2));
  octx.clearRect(0, 0, OUT_W, OUT_H);
  octx.drawImage(src, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);
  return out.toDataURL('image/png');
}

async function run() {
  // шейдеры
  await new Promise((r) => setTimeout(r, 300));
  while (!viewer.ready) await new Promise((r) => setTimeout(r, 50));

  for (const shot of SHOTS) {
    const [w, h, n] = shot.size;
    viewer.setSize(w, h, n);
    viewer.setMode(shot.mode ?? 'none');
    viewer.o.yaw = shot.yaw;
    viewer.o.pitch = shot.pitch;
    viewer.view.dist = 0;
    step(120); // доиграть переходы, камера встаёт на место

    if (shot.phase === 'open') {
      for (let i = 0; i < 400 && viewer.fx.sashOpen < 0.98; i++) step();
    } else if (shot.phase === 'half') {
      for (let i = 0; i < 400 && !(viewer.fx.sashOpen > 0.55 && viewer.fx.sashOpen < 0.62); i++) step();
    } else if (shot.phase === 'turned') {
      for (let i = 0; i < 400 && viewer.fx.handleTurn < 0.99; i++) step();
    }
    // частицы воздуха крупнее, чтобы их было видно на маленькой карточке
    if (shot.mode === 'draft') {
      viewer.airUniforms.uTime.value = 2.4;
      viewer.airUniforms.uPixel.value = 9;
    } else viewer.airUniforms.uPixel.value = 2.8;

    step(1);
    const data = capture(shot);
    const res = await fetch(`/__save?name=${shot.name}&dir=${shot.dir || 'services'}`, { method: 'POST', body: data });
    log(`${shot.name}: ${res.ok ? 'ok' : 'ошибка ' + res.status}`);
    viewer.setMode(null);
  }
  log('готово');
  document.title = 'done';
}

// ?manual — не рендерить автоматически (отладка)
if (!location.search.includes('manual')) run();
window.run = run;
