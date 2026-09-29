// Лёгкий скрипт оформления: запускается сразу, не дожидаясь 3D и калькулятора (app.js).
import { PixelPlanet, initReveal, splitWords, initCounters, initPixelEdges, initHeader } from './effects.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

window.__motivFx = true;

/* ---------- главный экран ---------- */

splitWords($('.hero h1'));
requestAnimationFrame(() => $('.hero')?.classList.add('is-in'));

const heroPlanet = $('#hero-viewer .planet');
if (heroPlanet) new PixelPlanet(heroPlanet, { host: $('#hero-viewer') });

const ctaPlanet = $('.cta-band .planet');
if (ctaPlanet) {
  new PixelPlanet(ctaPlanet, {
    host: ctaPlanet.parentElement,
    cells: 25,
    size: 1.5,
    center: [0.86, 0.62],
    tones: ['#0F3466', '#133D75', '#184886', '#1E5498', '#2862AB'],
    orbit: '#5AAEEA',
    assemble: false,
  });
}

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
