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
