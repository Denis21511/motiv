// Лёгкий скрипт оформления: запускается сразу, не дожидаясь 3D и калькулятора (app.js).
import { initReveal, splitWords, initCounters, initPixelEdges, initHeader } from './effects.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

window.__motivFx = true;

/* ---------- главный экран ---------- */

splitWords($('.hero h1'));
requestAnimationFrame(() => $('.hero')?.classList.add('is-in'));

/* облака: на главном экране и в финальном блоке. Проявляются, когда видео пошло; вне экрана — на паузе */
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
$$('.sky').forEach((sky) => {
  const video = $('.sky-video', sky);
  if (!video) return;
  const ready = () => sky.classList.add('is-ready');
  if (still) {
    // без движения: остаётся кадр-заставка
    video.removeAttribute('autoplay');
    video.pause();
    ready();
    return;
  }
  if (video.readyState >= 3) ready();
  video.addEventListener('playing', ready, { once: true });
  // если автозапуск запрещён (режим энергосбережения) — показываем заставку
  if (video.autoplay) video.play()?.catch(ready);
  new IntersectionObserver(([en]) => {
    if (en.isIntersecting) video.play()?.catch(ready);
    else video.pause();
  }).observe(sky);
});

/* ---------- было / стало: ползунок ---------- */

$$('.compare').forEach((box) => {
  const range = $('.compare-range', box);
  let pos = 50;
  let hint = 0;
  const set = (v) => {
    pos = Math.max(0, Math.min(100, v));
    box.style.setProperty('--pos', `${pos}%`);
    if (range) range.value = String(Math.round(pos));
  };
  const fromEvent = (e) => {
    const r = box.getBoundingClientRect();
    set(((e.clientX - r.left) / r.width) * 100);
  };
  const stopHint = () => cancelAnimationFrame(hint);
  range?.addEventListener('input', () => {
    stopHint();
    set(Number(range.value));
  });
  let drag = null;
  box.addEventListener('pointerdown', (e) => {
    stopHint();
    drag = e.pointerId;
    box.setPointerCapture(e.pointerId);
    box.classList.add('is-dragging');
    // мышью — сразу к курсору; пальцем — только при движении, чтобы не дёргать при прокрутке
    if (e.pointerType === 'mouse') fromEvent(e);
  });
  box.addEventListener('pointermove', (e) => {
    if (drag === e.pointerId) fromEvent(e);
  });
  const end = () => {
    drag = null;
    box.classList.remove('is-dragging');
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);

  // подсказка: при первом появлении ползунок сам качнётся туда-обратно
  if (!still) {
    const io = new IntersectionObserver(
      ([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now() + 400;
        const keys = [50, 28, 72, 50];
        const dur = 2200;
        const step = (now) => {
          const k = Math.max(0, Math.min(1, (now - t0) / dur));
          const seg = Math.min(keys.length - 2, Math.floor(k * (keys.length - 1)));
          const local = k * (keys.length - 1) - seg;
          const ease = local < 0.5 ? 2 * local * local : 1 - Math.pow(-2 * local + 2, 2) / 2;
          set(keys[seg] + (keys[seg + 1] - keys[seg]) * ease);
          if (k < 1) hint = requestAnimationFrame(step);
        };
        hint = requestAnimationFrame(step);
      },
      { threshold: 0.6 },
    );
    io.observe(box);
  }
});

/* ---------- цифры досчитывают при появлении ---------- */

const nums = $$('[data-num]');
if (nums.length && !still) {
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        const el = en.target;
        const to = Number(el.dataset.num);
        const t0 = performance.now();
        const dur = 1100;
        const step = (now) => {
          const k = Math.min(1, (now - t0) / dur);
          el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 4))));
          if (k < 1) requestAnimationFrame(step);
        };
        el.textContent = '0';
        requestAnimationFrame(step);
        // в фоновой вкладке rAF не идёт — итог ставим в любом случае
        setTimeout(() => (el.textContent = String(to)), dur + 120);
      }),
    { threshold: 0.6 },
  );
  nums.forEach((el) => io.observe(el));
}

/* «Цена по фото»: сразу открываем выбор фото и переходим к заявке */
$$('[data-photo-quote]').forEach((a) =>
  a.addEventListener('click', () => {
    const input = $('#order-photo');
    if (!input) return;
    const comment = $('#order-comment');
    if (comment && !comment.value) comment.value = 'Оцените ремонт по фото: ';
    input.click();
  }),
);

/* ---------- прокрутка ---------- */

initHeader();
initPixelEdges();
initReveal();
initCounters();

/* ---------- мобильное меню ---------- */

const navToggle = $('.nav-toggle');
const header = $('.site-header');
navToggle?.addEventListener('click', () => {
  const open = navToggle.getAttribute('aria-expanded') !== 'true';
  navToggle.setAttribute('aria-expanded', String(open));
  header.classList.toggle('menu-open', open);
  document.body.classList.toggle('no-scroll', open);
});
$$('.mobile-menu a').forEach((a) =>
  a.addEventListener('click', () => {
    navToggle?.setAttribute('aria-expanded', 'false');
    header.classList.remove('menu-open');
    document.body.classList.remove('no-scroll');
  }),
);

/* ---------- плавающая плашка на мобильном ---------- */

const bar = $('.mobile-bar');
if (bar) {
  const seen = new Map();
  const watch = ['#top', '#order', '.site-footer'].map((s) => $(s)).filter(Boolean);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => seen.set(en.target, en.isIntersecting));
    bar.classList.toggle('is-visible', !watch.some((el) => seen.get(el)));
  });
  watch.forEach((el) => io.observe(el));
}

const year = $('#year');
if (year) year.textContent = String(new Date().getFullYear());
