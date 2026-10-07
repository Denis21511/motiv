// Генерирует SVG-файлы знака «Вариант» в assets/img.
// Знак: сфера из квадратных пикселей (сетка 11×11) с проёмом двустворчатого окна
// в передней части и двумя «отлетающими» пикселями справа сверху.
import { writeFileSync, mkdirSync } from 'node:fs';

const CELL = 4;
const GAP = 0.8;
const N = 11;
const C = 5;
const R = 5.5;
const OPENING = { x0: 3, y0: 3, x1: 7, y1: 8 }; // ячейки, свободные от пикселей

const THEMES = {
  color: {
    tones: ['#1E6FD0', '#5AAEEA', '#BFE0F8'],
    frame: '#0F2A47',
    glass: '#FFFFFF',
    trail: ['#5AAEEA', '#BFE0F8'],
  },
  inverse: {
    tones: ['#5AAEEA', '#9ED0F5', '#FFFFFF'],
    frame: '#FFFFFF',
    glass: 'none',
    trail: ['#9ED0F5', '#FFFFFF'],
  },
};

const f = (n) => +n.toFixed(2);

function markShapes(theme) {
  const t = THEMES[theme];
  const px = CELL - GAP;
  const out = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if ((x - C) ** 2 + (y - C) ** 2 > R * R) continue;
      if (x >= OPENING.x0 && x <= OPENING.x1 && y >= OPENING.y0 && y <= OPENING.y1) continue;
      const d = x - y; // освещённость по диагонали к правому верхнему краю
      const tone = d > 4.5 ? 2 : d > 1.5 ? 1 : 0;
      out.push(`<rect x="${f(x * CELL + GAP / 2)}" y="${f(y * CELL + GAP / 2)}" width="${px}" height="${px}" fill="${t.tones[tone]}"/>`);
    }
  }
  // окно: рама, импост, две створки
  const ins = 0.5, ft = 2.6, mt = 2.2;
  const X0 = OPENING.x0 * CELL + ins, Y0 = OPENING.y0 * CELL + ins;
  const X1 = (OPENING.x1 + 1) * CELL - ins, Y1 = (OPENING.y1 + 1) * CELL - ins;
  const mx = (X0 + X1) / 2;
  const paneW = mx - mt / 2 - X0 - ft;
  const paneH = Y1 - Y0 - 2 * ft;
  // рама как path с вырезами створок (evenodd), чтобы на тёмном фоне стекло было прозрачным
  const rect = (x, y, w, h) => `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`;
  out.push(
    `<path fill-rule="evenodd" fill="${t.frame}" d="${rect(X0, Y0, X1 - X0, Y1 - Y0)}${rect(X0 + ft, Y0 + ft, paneW, paneH)}${rect(mx + mt / 2, Y0 + ft, paneW, paneH)}"/>`,
  );
  if (t.glass !== 'none') {
    out.push(`<rect x="${f(X0 + ft)}" y="${f(Y0 + ft)}" width="${f(paneW)}" height="${f(paneH)}" fill="${t.glass}"/>`);
    out.push(`<rect x="${f(mx + mt / 2)}" y="${f(Y0 + ft)}" width="${f(paneW)}" height="${f(paneH)}" fill="${t.glass}"/>`);
  }
  // движение: два уменьшающихся пикселя
  out.push(`<rect x="37.4" y="1.6" width="2" height="2" fill="${t.trail[0]}"/>`);
  out.push(`<rect x="41.4" y="0.3" width="1.3" height="1.3" fill="${t.trail[1]}"/>`);
  return out.join('');
}

const svg = (body, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44"${attrs}>${body}</svg>\n`;

mkdirSync('assets/img', { recursive: true });
writeFileSync('assets/img/logo-mark.svg', svg(markShapes('color')));
writeFileSync('assets/img/logo-mark-inverse.svg', svg(markShapes('inverse')));
writeFileSync('assets/img/favicon.svg', svg(markShapes('color')));

// аватар для соцсетей: знак на белом квадрате с полями
writeFileSync(
  'assets/img/avatar.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#FFFFFF"/><g transform="translate(10 10)">${markShapes('color')}</g></svg>\n`,
);
writeFileSync(
  'assets/img/avatar-navy.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#123256"/><g transform="translate(10 10)">${markShapes('inverse')}</g></svg>\n`,
);

// вывод для вставки inline в HTML
if (process.argv.includes('--print')) {
  console.log(markShapes(process.argv.includes('--inverse') ? 'inverse' : 'color'));
}
