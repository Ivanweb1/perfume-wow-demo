// Тайминги режима записи — все значения в миллисекундах.
const DEMO_TIMINGS = {
  intro: 5100,
  heroPause: 1000,
  notesScroll: 3000,
  notesPause: 650,
  purchaseScroll: 2500,
};

const FRAME_COUNT = 121;
const FPS = 24;
const isDemo = new URLSearchParams(location.search).get('demo') === '1';
const body = document.body;
const canvas = document.querySelector('#perfume-canvas');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const loader = document.querySelector('.loader');
const loaderBar = document.querySelector('.loader__track i');
const loaderValue = document.querySelector('.loader__value');
const heroSection = document.querySelector('.scene--hero');
const notesSection = document.querySelector('.scene--notes');
const purchaseSection = document.querySelector('.scene--purchase');
const heroUi = [...document.querySelectorAll('.hero-ui')];
const notesUi = [...document.querySelectorAll('.notes-ui')];
const purchaseUi = document.querySelector('.purchase-ui');
const purchaseIndex = document.querySelector('.purchase-index');

const sequences = { 1: [], 2: [], 3: [] };
const posters = {};
let displayedImage = null;
let introComplete = false;
let rafPending = false;
let lenis = null;

if (isDemo) body.classList.add('demo');
body.classList.add('is-intro-pending');

function framePath(sequence, index) {
  return `assets/seq/${sequence}/${String(index + 1).padStart(4, '0')}.webp`;
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function preload() {
  let loaded = 0;
  const total = FRAME_COUNT * 3 + 4;
  const update = () => {
    const progress = Math.round((loaded / total) * 100);
    loaderBar.style.transform = `scaleX(${progress / 100})`;
    loaderValue.textContent = `${progress}%`;
  };

  const posterPromises = [0, 1, 2, 3].map(async (i) => {
    posters[i] = await loadImage(`assets/poster-${i}.webp`);
    loaded += 1; update();
  });
  await Promise.all(posterPromises);
  displayedImage = posters[0];
  resizeCanvas();

  const tasks = [];
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    for (let i = 0; i < FRAME_COUNT; i += 1) {
      tasks.push((async () => {
        sequences[sequence][i] = await loadImage(framePath(sequence, i));
        loaded += 1; update();
      })());
    }
  }
  await Promise.all(tasks);
  loader.classList.add('is-hidden');
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawImageCover(displayedImage || posters[0]);
}

function drawImageCover(img) {
  if (!img) return;
  const scale = Math.max(innerWidth / img.naturalWidth, innerHeight / img.naturalHeight);
  const width = img.naturalWidth * scale;
  const height = img.naturalHeight * scale;
  const x = (innerWidth - width) / 2;
  const y = (innerHeight - height) / 2;
  ctx.fillStyle = '#efe6da';
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.drawImage(img, x, y, width, height);
}

function showFrame(sequence, frame) {
  const i = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(frame)));
  displayedImage = sequences[sequence][i] || posters[sequence];
  drawImageCover(displayedImage);
}

function clamp(value, min = 0, max = 1) { return Math.min(max, Math.max(min, value)); }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function mapRange(value, inMin, inMax, outMin = 0, outMax = 1) {
  return outMin + (outMax - outMin) * clamp((value - inMin) / (inMax - inMin));
}

function setOpacityTransform(el, opacity, y = 0, x = 0) {
  el.style.opacity = opacity;
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function renderScrollState() {
  rafPending = false;
  if (!introComplete) return;
  const y = window.scrollY;
  const notesStart = notesSection.offsetTop;
  const notesRange = notesSection.offsetHeight - innerHeight;
  const purchaseStart = purchaseSection.offsetTop;
  const purchaseRange = purchaseSection.offsetHeight - innerHeight;

  const notesProgress = clamp((y - notesStart) / notesRange);
  const purchaseProgress = clamp((y - purchaseStart) / purchaseRange);
  const inNotes = y >= notesStart && y < purchaseStart;
  const inPurchase = y >= purchaseStart;

  if (y < notesStart) {
    displayedImage = posters[1];
    drawImageCover(displayedImage);
  } else if (inNotes) {
    showFrame(2, notesProgress * (FRAME_COUNT - 1));
  } else {
    const remapped = purchaseProgress < .25
      ? mapRange(purchaseProgress, 0, .25, 0, .60)
      : mapRange(purchaseProgress, .25, 1, .60, 1);
    showFrame(3, remapped * (FRAME_COUNT - 1));
  }

  const heroExit = mapRange(notesProgress, 0, .20, 0, 1);
  heroUi.forEach((el, index) => {
    const direction = el.getBoundingClientRect().left < innerWidth / 2 ? -1 : 1;
    const distance = el.classList.contains('site-header') ? 0 : 55 + (index % 3) * 16;
    setOpacityTransform(el, 1 - heroExit, -heroExit * 12, direction * heroExit * distance);
    el.style.pointerEvents = heroExit > .6 ? 'none' : '';
  });

  const notesReveal = inNotes ? easeOutCubic(mapRange(notesProgress, .46, .72)) : 0;
  notesUi.forEach((el, index) => {
    const delay = index * .035;
    const local = clamp(mapRange(notesReveal, delay, Math.min(1, delay + .55)));
    setOpacityTransform(el, local, (1 - local) * 26);
  });

  const purchaseReveal = inPurchase ? easeOutCubic(mapRange(purchaseProgress, .60, .86)) : 0;
  purchaseUi.style.opacity = purchaseReveal;
  purchaseUi.style.transform = `translate(-50%, ${(1 - purchaseReveal) * 24}px)`;
  purchaseIndex.style.opacity = purchaseReveal;
}

function requestRender() {
  if (!rafPending) { rafPending = true; requestAnimationFrame(renderScrollState); }
}

function countUp(el, target, duration = 850) {
  const start = performance.now();
  const decimals = target % 1 ? 1 : 0;
  function tick(now) {
    const p = easeOutCubic(clamp((now - start) / duration));
    el.textContent = (target * p).toFixed(decimals);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function revealHeroFallback() {
  body.classList.remove('is-intro-pending');
  const items = [
    document.querySelector('.site-header'),
    ...document.querySelectorAll('.title-line'),
    document.querySelector('.hero-lede'),
    document.querySelector('.catalog-cta'),
    ...document.querySelectorAll('.callout'),
    document.querySelector('.gift-card'),
    document.querySelector('.reviews-card'),
    document.querySelector('.new-card'),
    document.querySelector('.scroll-hint'),
  ];
  items.forEach((el, i) => el?.animate([
    { opacity: 0, transform: 'translateY(24px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ], { duration: 800, delay: i * 90, fill: 'both', easing: 'cubic-bezier(.22,1,.36,1)' }));
  document.querySelectorAll('[data-count]').forEach((el) => countUp(el, Number(el.dataset.count)));
}

function revealHero() {
  if (!window.gsap) { revealHeroFallback(); return; }
  body.classList.remove('is-intro-pending');
  const tl = gsap.timeline();
  tl.fromTo('.site-header', { autoAlpha: 0, y: -16 }, { autoAlpha: 1, y: 0, duration: .7, ease: 'power3.out' })
    .fromTo('.title-line', { autoAlpha: 0, yPercent: 110 }, { autoAlpha: 1, yPercent: 0, duration: .72, stagger: .1, ease: 'power4.out' }, '-=.42')
    .fromTo('.hero-lede, .catalog-cta', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: .55, stagger: .08, ease: 'power3.out' }, '-=.35')
    .fromTo('.callout', { autoAlpha: 0 }, { autoAlpha: 1, duration: .35, stagger: .12 }, '-=.18')
    .fromTo('.callout__line', { scaleX: 0 }, { scaleX: 1, duration: .6, stagger: .12, ease: 'power2.out' }, '<')
    .fromTo('.gift-card, .reviews-card, .new-card, .scroll-hint', { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: .68, stagger: .12, ease: 'power3.out' }, '-=.32');
  document.querySelectorAll('[data-count]').forEach((el) => countUp(el, Number(el.dataset.count), 900));
}

async function playIntro() {
  window.scrollTo(0, 0);
  const start = performance.now();
  let revealed = false;
  return new Promise((resolve) => {
    function tick(now) {
      const elapsed = now - start;
      const frame = Math.min(FRAME_COUNT - 1, Math.floor((elapsed / 1000) * FPS));
      showFrame(1, frame);
      if (!revealed && elapsed > 2450) { revealed = true; revealHero(); }
      if (elapsed < DEMO_TIMINGS.intro) requestAnimationFrame(tick);
      else {
        displayedImage = posters[1]; drawImageCover(displayedImage);
        introComplete = true; resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}

function setupSmoothScroll() {
  if (window.Lenis) {
    lenis = new Lenis({ lerp: .09, smoothWheel: true, wheelMultiplier: .8 });
    const loop = (time) => { lenis.raf(time); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.create({ trigger: notesSection, start: 'top top', end: 'bottom bottom', onUpdate: requestRender });
    ScrollTrigger.create({ trigger: purchaseSection, start: 'top top', end: 'bottom bottom', onUpdate: requestRender });
    ScrollTrigger.refresh();
  }
}

function animateWindowScroll(target, duration) {
  return new Promise((resolve) => {
    const startY = window.scrollY;
    const delta = target - startY;
    const start = performance.now();
    function tick(now) {
      const p = clamp((now - start) / duration);
      const eased = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      window.scrollTo(0, startY + delta * eased);
      requestRender();
      if (p < 1) requestAnimationFrame(tick); else resolve();
    }
    requestAnimationFrame(tick);
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runDemo() {
  await wait(DEMO_TIMINGS.heroPause);
  const notesTarget = notesSection.offsetTop + notesSection.offsetHeight - innerHeight;
  await animateWindowScroll(notesTarget, DEMO_TIMINGS.notesScroll);
  await wait(DEMO_TIMINGS.notesPause);
  const purchaseTarget = purchaseSection.offsetTop + purchaseSection.offsetHeight - innerHeight;
  await animateWindowScroll(purchaseTarget, DEMO_TIMINGS.purchaseScroll);
}

document.querySelectorAll('.volume-switch button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.volume-switch button').forEach((b) => b.classList.remove('is-active'));
    button.classList.add('is-active');
    const prices = { 30: '8 900 ₽', 50: '12 900 ₽', 100: '19 900 ₽' };
    document.querySelector('.price').textContent = prices[button.dataset.volume];
  });
});

document.addEventListener('pointermove', (event) => {
  if (isDemo || scrollY > innerHeight) return;
  const x = (event.clientX / innerWidth - .5) * 2;
  const y = (event.clientY / innerHeight - .5) * 2;
  document.querySelectorAll('[data-parallax]').forEach((el) => {
    const amount = Number(el.dataset.parallax) * 8;
    el.style.translate = `${x * amount}px ${y * amount}px`;
  });
});

window.addEventListener('scroll', requestRender, { passive: true });
window.addEventListener('resize', () => { resizeCanvas(); requestRender(); });

(async function init() {
  await preload();
  setupSmoothScroll();
  await playIntro();
  requestRender();
  if (isDemo) await runDemo();
})();
