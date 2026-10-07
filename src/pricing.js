// Ориентировочные цены «Вариант», ₽
export const PRICES = {
  adjust: 500, // регулировка, за створку
  seal: 200, // уплотнитель, за погонный метр
  handle: 700, // ручка, за шт.
  hardware: 2500, // фурнитура, за створку
  glass: 3000, // стеклопакет, за м²
  complex: 1500, // комплексный ремонт, за окно
};

export const LIMITS = {
  width: { min: 400, max: 3000, step: 10 },
  height: { min: 400, max: 2400, step: 10 },
  sashes: { min: 1, max: 3 },
  minSashWidth: 350,
};

export const PROBLEMS = [
  { id: 'close', label: 'Окно плохо закрывается', short: 'плохо закрывается' },
  { id: 'draft', label: 'Продувает', short: 'продувает' },
  { id: 'handle', label: 'Не работает ручка', short: 'не работает ручка' },
  { id: 'seal', label: 'Повреждён уплотнитель', short: 'повреждён уплотнитель' },
  { id: 'hardware', label: 'Проблема с фурнитурой', short: 'проблема с фурнитурой' },
  { id: 'glass', label: 'Повреждён стеклопакет', short: 'повреждён стеклопакет' },
  { id: 'complex', label: 'Комплексный ремонт', short: 'комплексный ремонт' },
];

export const problemById = (id) => PROBLEMS.find((p) => p.id === id) ?? PROBLEMS[1];

const nf = new Intl.NumberFormat('ru-RU');
export const rub = (v) => `${nf.format(Math.round(v))} ₽`;
export const num = (v, digits = 2) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(v);

export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// Длина уплотнителя: периметр всех створок + 10 % на углы и стыки,
// с округлением вверх до 0,25 м.
export function sealLength(widthMm, heightMm, sashes) {
  const w = widthMm / 1000;
  const h = heightMm / 1000;
  const perimeter = 2 * w + 2 * sashes * h;
  return Math.ceil((perimeter * 1.1) / 0.25 - 1e-9) * 0.25;
}

// Площадь одного стеклопакета (створки), м², до сотых
export function glassArea(widthMm, heightMm, sashes) {
  return Math.round((widthMm / sashes / 1000) * (heightMm / 1000) * 100) / 100;
}

export function estimate({ width, height, sashes, problem }) {
  const n = sashes;
  const sashWord = plural(n, 'створка', 'створки', 'створок');
  const lines = [];

  const adjust = () =>
    lines.push({
      label: 'Регулировка',
      detail: `${n} ${sashWord} × ${rub(PRICES.adjust)}`,
      sum: n * PRICES.adjust,
    });
  const seal = () => {
    const len = sealLength(width, height, n);
    lines.push({
      label: 'Замена уплотнителя',
      detail: `${num(len)} м × ${rub(PRICES.seal)}`,
      sum: len * PRICES.seal,
    });
  };

  switch (problem) {
    case 'close':
      adjust();
      break;
    case 'draft':
      adjust();
      seal();
      break;
    case 'handle':
      lines.push({ label: 'Замена ручки', detail: `1 шт. × ${rub(PRICES.handle)}`, sum: PRICES.handle });
      break;
    case 'seal':
      seal();
      break;
    case 'hardware':
      lines.push({
        label: 'Замена фурнитуры',
        detail: `${n} ${sashWord} × ${rub(PRICES.hardware)}`,
        sum: n * PRICES.hardware,
      });
      break;
    case 'glass': {
      const area = glassArea(width, height, n);
      lines.push({
        label: 'Замена стеклопакета',
        detail: `${num(area)} м² × ${rub(PRICES.glass)}`,
        sum: Math.round(area * PRICES.glass),
      });
      break;
    }
    case 'complex':
      lines.push({
        label: 'Комплексный ремонт',
        detail: 'регулировка, смазка, проверка фурнитуры',
        sum: PRICES.complex,
      });
      seal();
      break;
    default:
      break;
  }

  const total = lines.reduce((s, l) => s + l.sum, 0);
  return { lines, total };
}
