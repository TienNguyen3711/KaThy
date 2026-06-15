
/**
 * Shooting stars generator
 * - Tạo nhiều sao băng với vị trí/độ dài/tốc độ/delay ngẫu nhiên
 * - Responsive: resize sẽ regen để phù hợp màn hình
 */

const sky = document.getElementById('sky');

const CONFIG = {
  count: 12,               // số sao băng đồng thời
  angleDeg: 45,            // góc nghiêng bay
  minLen: 60,              // shorter tails for the look in the reference
  maxLen: 180,
  // thời gian bay (giây) — increased for slower, gentler motion
  minDur: 20.0,
  maxDur: 30.0,
  maxDelay: 15.0,

  // Start area: widen so stars appear across the top area of the page
  xRange: [0.02, 0.60],
  yRange: [0.02, 0.35],

  // End area: allow destinations across lower-right half (still in-frame)
  destXRange: [0.40, 0.98],
  destYRange: [0.40, 0.98]
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function clearStars(){
  sky.querySelectorAll('.shooting-star').forEach(el => el.remove());
}

function createStar(){
  const star = document.createElement('div');
  star.className = 'shooting-star';

  const w = window.innerWidth;
  const h = window.innerHeight;

  // start position near top-left
  const x = rand(CONFIG.xRange[0] * w, CONFIG.xRange[1] * w);
  const y = rand(CONFIG.yRange[0] * h, CONFIG.yRange[1] * h);

  const len = randInt(CONFIG.minLen, CONFIG.maxLen);
  const dur = rand(CONFIG.minDur, CONFIG.maxDur).toFixed(2);
  const delay = rand(0, CONFIG.maxDelay).toFixed(2);

  // compute a destination inside bottom-right so it ends in-frame
  const destX = rand(CONFIG.destXRange[0] * w, CONFIG.destXRange[1] * w);
  const destY = rand(CONFIG.destYRange[0] * h, CONFIG.destYRange[1] * h);
  const dx = destX - x;
  const dy = destY - y;
  const dist = Math.round(Math.hypot(dx, dy)) + 'px';
  // angle aligned to motion vector (degrees)
  const angleDeg = (Math.atan2(dy, dx) * 180 / Math.PI);

  star.style.setProperty('--x', `${x}px`);
  star.style.setProperty('--y', `${y}px`);
  star.style.setProperty('--len', `${len}px`);
  star.style.setProperty('--dur', `${dur}s`);
  star.style.setProperty('--delay', `${delay}s`);

  // use a fixed diagonal direction (CONFIG.angleDeg) with tiny jitter
  const angleVar = CONFIG.angleDeg + rand(-2, 2);
  star.style.setProperty('--angle', `${angleVar}deg`);
  // thickness and tail opacity vary
  const thickness = randInt(1, 4) + 'px';
  const tailOpacity = (rand(0.45, 0.95)).toFixed(2);
  star.style.setProperty('--thickness', thickness);
  star.style.setProperty('--tail-opacity', tailOpacity);

  star.style.setProperty('--dist', dist);

  // add spark/head element (represents the bright cross-shaped head)
  const spark = document.createElement('span');
  spark.className = 'spark';
  star.appendChild(spark);

  return star;
}

function render(){
  clearStars();
  const frag = document.createDocumentFragment();
  const stars = [];
  for(let i = 0; i < CONFIG.count; i++){
    const star = createStar();
    frag.appendChild(star);
    stars.push(star);
  }
  // append first so elements exist before timeouts trigger
  sky.appendChild(frag);

  // schedule start using the per-star delay
  stars.forEach(star => {
    const delayMs = parseFloat(star.style.getPropertyValue('--delay')) * 1000 || 0;
    setTimeout(() => startStar(star), delayMs);
  });
}

// start animation for a star element and schedule its recreation when done
function startStar(star){
  if(!star.parentElement) sky.appendChild(star);
  star.classList.remove('animate');
  void star.offsetWidth;
  star.classList.add('animate');

  star.addEventListener('animationend', () => {
    star.remove();
    const nextDelay = rand(0, CONFIG.maxDelay) * 1000;
    setTimeout(() => {
      const newStar = createStar();
      sky.appendChild(newStar);
      startStar(newStar);
    }, nextDelay);
  }, { once: true });
}

// Regen khi resize để không bị lệch
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 150);
});

// ── Bầu trời sao tĩnh ─────────────────────────────────────────
function createStaticStars() {
  const frag = document.createDocumentFragment();

  // Phân bố 3 loại sao: nhỏ (nhiều), vừa, lớn (ít)
  const layers = [
    { count: 180, sizes: [1, 1, 1, 2],    opLo: [0.15, 0.35], opHi: [0.5, 0.85],  dur: [2, 5],  scale: [1.2, 1.6] },
    { count:  60, sizes: [2, 2, 3],        opLo: [0.25, 0.45], opHi: [0.7, 1.0],   dur: [1.5, 4],scale: [1.3, 1.8] },
    { count:  20, sizes: [3, 4],           opLo: [0.3, 0.5],   opHi: [0.8, 1.0],   dur: [1, 3],  scale: [1.1, 1.4] },
  ];

  // Dải Ngân Hà: cluster sao dày hơn chạy chéo qua màn hình
  const milkyWay = { count: 90, sizes: [1, 1, 2], opLo: [0.1, 0.25], opHi: [0.35, 0.65], dur: [3, 7], scale: [1.1, 1.3] };

  function makeStar(sz, opLo, opHi, dur, tscale, x, y, color) {
    const el = document.createElement('div');
    el.className = 'star-bg';
    el.style.cssText = [
      `left:${x.toFixed(2)}%`,
      `top:${y.toFixed(2)}%`,
      `width:${sz}px`,
      `height:${sz}px`,
      `--op-lo:${opLo.toFixed(2)}`,
      `--op-hi:${opHi.toFixed(2)}`,
      `--tdur:${dur.toFixed(1)}s`,
      `--tdelay:-${(Math.random()*8).toFixed(1)}s`,
      `--tscale:${tscale.toFixed(2)}`,
      `background:${color}`,
    ].join(';');
    return el;
  }

  function rFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function rRange(a) { return a[0] + Math.random() * (a[1] - a[0]); }

  // Màu sao: 70% trắng, 15% xanh lạnh, 10% vàng nhạt, 5% đỏ cam
  function starColor() {
    const r = Math.random();
    if (r < 0.70) return '#ffffff';
    if (r < 0.85) return '#cce8ff';
    if (r < 0.95) return '#fff5cc';
    return '#ffd0aa';
  }

  // Các layer thường
  layers.forEach(l => {
    for (let i = 0; i < l.count; i++) {
      frag.appendChild(makeStar(
        rFrom(l.sizes),
        rRange(l.opLo), rRange(l.opHi),
        rRange(l.dur), rRange(l.scale),
        Math.random() * 100, Math.random() * 100,
        starColor()
      ));
    }
  });

  // Dải Ngân Hà: sao phân bố theo dải chéo (x=20→80%, y=0→70%)
  for (let i = 0; i < milkyWay.count; i++) {
    const t  = Math.random();
    const bx = 18 + t * 62;
    const by = t * 68 + (Math.random() - 0.5) * 22;
    frag.appendChild(makeStar(
      rFrom(milkyWay.sizes),
      rRange(milkyWay.opLo), rRange(milkyWay.opHi),
      rRange(milkyWay.dur), rRange(milkyWay.scale),
      Math.max(0, Math.min(100, bx)), Math.max(0, Math.min(100, by)),
      starColor()
    ));
  }

  sky.appendChild(frag);
}

createStaticStars();
render();

/* ------------------------
   Reveal coordinator
   - After a short star show, reveal descriptive text word-by-word
   - Fade out right image and show words
   - On scroll into next section, fade the hero
   ------------------------ */

function revealDescriptiveText(text, wordDelay = 180){
  const container = document.getElementById('revealText');
  if(!container) return;
  container.innerHTML = '';
  container.classList.add('active');

  // also reveal the right-side hero image in sync
  const heroImg = document.getElementById('heroImage');
  if(heroImg){
    const right = document.getElementById('rightMedia');
    if(right) right.classList.remove('hidden');
    heroImg.classList.add('reveal');
  }

  // Support newline-separated lines. For each line, create word spans;
  // insert a <br> between lines so line breaks are respected.
  const lines = String(text).split(/\n/);
  let wordIndex = 0;
  lines.forEach((line, li) => {
    const words = line.split(/\s+/).filter(Boolean);
    words.forEach((w) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = w;
      container.appendChild(span);

      // schedule reveal for this word using cumulative index
      setTimeout(() => span.classList.add('visible'), wordIndex * wordDelay);
      wordIndex++;
    });
    // after each line (except last) insert a line break element
    if (li < lines.length - 1) {
      const br = document.createElement('br');
      container.appendChild(br);
      // small pause between lines: increment wordIndex slightly so next line starts later
      wordIndex += 1;
    }
  });
}

function replaceRightMedia(){
  const right = document.getElementById('rightMedia');
  if(!right) return;
  right.classList.add('hidden');
}

// trigger reveal after brief shooting-star show
window.addEventListener('load', ()=>{
  setTimeout(()=>{
    revealDescriptiveText(`Ka Thy - Chưa biết nhau nhiều,
  nhưng mình nghĩ bạn xứng đáng có một thứ gì đó đặc biệt.
  And I have a special gift for you 😁`, 200);
  }, 3200);

  // Auto-transition to magic section after intro plays out (~9.4s text + 2s pause)
  setTimeout(() => {
    const introEl = document.getElementById('intro');
    if (introEl) {
      introEl.style.opacity = '0';
      introEl.style.pointerEvents = 'none';
      setTimeout(() => { introEl.style.display = 'none'; }, 900);
    }
    playMagicIntro();
  }, 11500);
});

// ── Magic section: intro text → auto-start animation ──────────
function playMagicIntro() {
    const q1    = document.getElementById('introQ1');
    const q2    = document.getElementById('introQ2');
    const q3    = document.getElementById('introQ3');
    const q4    = document.getElementById('introQ4');
    const intro = document.getElementById('magic-intro');

    if (!q1) { window.dispatchEvent(new Event('magic-start')); return; }

    setTimeout(() => q1.classList.add('show'),  400);
    setTimeout(() => q2?.classList.add('show'), 1600);
    setTimeout(() => window.dispatchEvent(new Event('music-early')), 5000);
    setTimeout(() => q3?.classList.add('show'), 2800);
    setTimeout(() => q4?.classList.add('show'), 4000);
    setTimeout(() => {
        [q1, q2, q3, q4].forEach(q => q?.classList.add('fade-out'));
    }, 6000);
    setTimeout(() => {
        if (intro) intro.style.display = 'none';
        window.dispatchEvent(new Event('magic-start'));
    }, 7000);
}
