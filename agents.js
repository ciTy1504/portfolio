// Agent tour, after the "built by agents" reel. The page starts empty; a flock of cursors scans it,
// then the page scrolls itself and every visible component is built by an agent: it flies to the
// top-left corner, drags the box out (overshooting a little), nudges it to fit, the box locks with
// guides and a size chip, and only then is the text typed in or the image dropped into its placeholder.
// Nothing appears without an agent. Any wheel, touch, key or click skips to the finished page.
(() => {
  if (!window.gsap) return;

  // Neutral crew: ink, chalk, sand, stone. Light cursors get a dark outline and vice versa.
  const PALETTE = [
    ['#141414', '#f3eee5'], ['#f6f2ea', '#1b1b1b'], ['#d6c6a8', '#1b1b1b'], ['#8d8880', '#f3eee5'],
    ['#3a3734', '#f3eee5'], ['#e7dfcf', '#262626'], ['#b4ac9e', '#1b1b1b'], ['#605b55', '#f3eee5'],
  ];
  const narrow = () => window.matchMedia('(max-width: 760px)').matches;
  const ARROW = '<svg viewBox="0 0 14 20"><path d="M1 1v15.5l4-3.6 2.7 6 2.6-1.1-2.6-5.9H13z"/></svg>';

  /* ---------- Overlay ---------- */
  const ui = document.createElement('div');
  ui.className = 'tour';
  ui.setAttribute('aria-hidden', 'true');
  ui.innerHTML = '<div class="tour__ruler tour__ruler--x"></div><div class="tour__ruler tour__ruler--y"></div><div class="tour__marks"></div><div class="tour__crew"></div>';
  document.body.appendChild(ui);
  const marks = ui.querySelector('.tour__marks');
  const crewEl = ui.querySelector('.tour__crew');

  const bar = document.createElement('div');
  bar.className = 'tour-bar';
  bar.innerHTML = `
    <span class="tour-bar__avatars">${PALETTE.slice(0, 5).map(([c]) => `<i style="--c:${c}"></i>`).join('')}</span>
    <span class="tour-bar__text"></span>
    <span class="tour-bar__progress"><b></b></span>
    <span class="tour-bar__state"></span>
    <button type="button" class="tour-bar__btn"></button>`;
  document.body.appendChild(bar);
  const barText = bar.querySelector('.tour-bar__text');
  const barFill = bar.querySelector('.tour-bar__progress b');
  const barState = bar.querySelector('.tour-bar__state');
  const barBtn = bar.querySelector('.tour-bar__btn');

  /* ---------- Which elements are components ---------- */
  // Text blocks are built in one go; painted containers (cards, chips rows, tiles) are built as an
  // empty frame first and then filled piece by piece, so a project card is ~7 separate jobs.
  const TEXT_TAG = /^(P|H1|H2|H3|H4|H5|H6|BUTTON|LABEL|DT|DD|SPAN|EM|STRONG|SMALL|B|I|CODE|TIME|svg|INPUT|TEXTAREA|SELECT)$/;
  const MEDIA_SEL = 'img, picture, canvas, video, iframe, .hero__stage';
  const isMedia = (el) => el.matches(MEDIA_SEL)
    || (el.children.length === 1 && el.children[0].matches('img, picture, canvas, video') && !(el.textContent || '').trim());
  const painted = (cs) =>
    (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent')
    || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none'
    || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0
    || parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderRightWidth) > 0;
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const allInline = (el) => [...el.children].every((k) => {
    const d = getComputedStyle(k).display;
    return d === 'inline' || d === 'none' || k.tagName === 'BR';
  });

  // Walk down from each root. Returns [{ el, frame, parent }] in document order (parents first).
  const collect = (roots, custom = new Map()) => {
    const out = [];
    const walk = (el, parent) => {
      for (const c of el.children) {
        if (c.matches('script, template, dialog, style, noscript, .tour, .tour-bar, .sr-only, .skip')) continue;
        const cs = getComputedStyle(c);
        if (cs.display === 'none' || cs.display === 'contents' && !c.children.length) continue;
        if (c.getAttribute('aria-hidden') === 'true' && (cs.position === 'absolute' || cs.position === 'fixed')) continue; // background art
        const r = c.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const leaf = custom.has(c) || isMedia(c) || TEXT_TAG.test(c.tagName) || ownText(c)
          || c.children.length === 0 || allInline(c);
        if (leaf) { out.push({ el: c, frame: false, parent }); continue; }
        if (painted(cs)) {
          const me = { el: c, frame: true, parent };
          out.push(me);
          walk(c, me);
        } else walk(c, parent);
      }
    };
    roots.forEach((r) => r && walk(r, null));
    return out;
  };

  /* ---------- Crew ---------- */
  let crew = [];
  const makeCrew = () => {
    crewEl.replaceChildren();
    const n = narrow() ? 12 : 24;
    crew = Array.from({ length: n }, (_, i) => {
      const el = document.createElement('div');
      el.className = 'tour__agent';
      const [fill, edge] = PALETTE[i % PALETTE.length];
      el.style.setProperty('--c', fill);
      el.style.setProperty('--e', edge);
      el.innerHTML = ARROW;
      crewEl.appendChild(el);
      // Agents travel in small clusters around the flock centre
      const g = i % 4;
      return {
        el, x: innerWidth * (0.3 + 0.4 * Math.random()), y: innerHeight + 30,
        group: { dx: [-150, 120, -40, 190][g] + gsap.utils.random(-28, 28), dy: [-60, -90, 70, 40][g] + gsap.utils.random(-24, 24) },
        wob: Math.random() * 6.28, k: gsap.utils.random(0.05, 0.09), task: null,
      };
    });
  };

  /* ---------- State ---------- */
  let S = null;
  let config = null;
  let runs = 0;
  const flock = { x: innerWidth / 2, y: innerHeight / 2 };
  const busyPhase = () => S && ['scanning', 'touring', 'finale'].includes(S.phase);

  const setBar = () => {
    if (!S) return;
    const total = S.layers.length;
    barFill.style.transform = `scaleX(${total ? S.built / total : 1})`;
    const working = S.phase === 'scanning' || S.phase === 'touring';
    if (S.phase === 'scanning') barText.textContent = 'Scanning page…';
    else barText.textContent = `${crew.length} agents · ${S.built} / ${total} layers`;
    barText.hidden = !working;
    barFill.parentElement.hidden = !working;
    barState.textContent = S.phase === 'scanning' ? 'Scanning' : 'Touring';
    barState.hidden = !working;
    barBtn.textContent = working ? 'Skip' : 'Replay';
    bar.classList.toggle('is-done', !working);
  };

  /* ---------- One component: fly, drag, adjust, lock, fill ---------- */
  const startJob = (L) => {
    L.active = true;
    S.active++;
    const media = !L.frame && isMedia(L.el);
    const box = document.createElement('div');
    box.className = `tb${media ? ' tb--media' : ''}${L.frame ? ' tb--frame' : ''}`;
    box.innerHTML = '<i></i><i></i><i></i><i></i><em></em>' + (media ? '<s></s>' : L.frame ? '' : '<u>I</u>');
    box.style.opacity = '0';
    const lines = ['h', 'h', 'v', 'v'].map((d) => {
      const l = document.createElement('div');
      l.className = `tg tg--${d}`;
      l.style.opacity = '0';
      marks.appendChild(l);
      return l;
    });
    marks.appendChild(box);

    const r0 = L.el.getBoundingClientRect();
    const free = crew.filter((a) => !a.task).sort((a, b) => Math.hypot(a.x - r0.left, a.y - r0.top) - Math.hypot(b.x - r0.left, b.y - r0.top));
    const lead = free[0];
    const area = r0.width * r0.height;
    const helper = area > 60000 ? free[1] : null;
    // small pieces (a chip, a label, a line of text) go up faster than cards and photos
    const k = area < 6000 ? 0.55 : area < 25000 ? 0.72 : 0.9;
    const T = (t) => t * k;
    const job = { L, box, lines, chip: box.querySelector('em'), lead, helper, mode: 'approach', media };
    S.jobs.add(job);
    const run = S.run;
    const live = () => S && S.run === run && S.jobs.has(job);

    // 1. Fly to the top-left corner
    lead.task = { el: L.el, fx: 0, fy: 0, ox: 0, oy: 0, fast: true };
    if (helper) helper.task = { el: L.el, fx: gsap.utils.random(0.3, 0.8), fy: gsap.utils.random(0.3, 0.8), ox: 0, oy: 0 };
    // 2. Press and drag out, overshooting the far corner
    gsap.delayedCall(T(0.3), () => {
      if (!live()) return;
      job.mode = 'drag';
      box.style.opacity = '1';
      const over = () => gsap.utils.random(-18, 34);
      lead.task = { el: L.el, fx: 1, fy: 1, ox: over(), oy: over(), fast: true };
    });
    // 3. Nudge back to fit
    gsap.delayedCall(T(0.64), () => {
      if (!live()) return;
      lead.task = { el: L.el, fx: 1, fy: 1, ox: 0, oy: 0, fast: true };
    });
    // 4. Lock: guides and handles snap to the real bounds
    gsap.delayedCall(T(0.86), () => {
      if (!live()) return;
      job.mode = 'lock';
      box.classList.add('is-locked');
      gsap.to(lines, { opacity: 1, duration: 0.15 });
      // the agent moves to where the content goes in: the caret for text, the middle for media
      lead.task = media || L.frame ? { el: L.el, fx: 0.5, fy: 0.5, ox: 0, oy: 0, fast: true } : { el: L.el, fx: 0, fy: 0.5, ox: 4, oy: 0, fast: true };
    });
    // 5. Fill: type the text, or drop the image into its placeholder
    gsap.delayedCall(T(0.95), () => { if (live()) reveal(L); });
    gsap.delayedCall(T(1.4), () => endJob(job));
  };

  const endJob = (job) => {
    if (!S || !S.jobs.has(job)) return;
    S.jobs.delete(job);
    [job.lead, job.helper].forEach((a) => { if (a) a.task = null; });
    job.L.active = false;
    S.active--;
    gsap.to([job.box, ...job.lines], { opacity: 0, duration: 0.3, onComplete: () => { job.box.remove(); job.lines.forEach((l) => l.remove()); } });
  };

  const reveal = (L, instant) => {
    if (L.done) return;
    L.done = true;
    S.built++;
    L.el.classList.remove('tour-hidden');
    if (!instant) {
      const cls = L.frame ? 'tour-frame' : isMedia(L.el) ? 'tour-fill' : 'tour-type';
      L.el.classList.add(cls);
      setTimeout(() => L.el.classList.remove(cls), 650);
    }
    if (L.reveal) L.reveal();
    setBar();
  };

  /* ---------- Per-frame ---------- */
  const placeJob = (job) => {
    const r = job.L.el.getBoundingClientRect();
    const p = 4;
    let w = r.width + p * 2, h = r.height + p * 2;
    if (job.mode === 'drag') {
      // the box is whatever the lead agent has dragged out so far
      w = Math.max(0, job.lead.x - (r.left - p));
      h = Math.max(0, job.lead.y - (r.top - p));
    }
    Object.assign(job.box.style, { left: `${r.left - p}px`, top: `${r.top - p}px`, width: `${w}px`, height: `${h}px` });
    job.chip.textContent = `${Math.round(Math.max(0, w - p * 2))} × ${Math.round(Math.max(0, h - p * 2))}`;
    const [t, b, l, rt] = job.lines;
    t.style.transform = `translateY(${r.top - p}px)`;
    b.style.transform = `translateY(${r.bottom + p}px)`;
    l.style.transform = `translateX(${r.left - p}px)`;
    rt.style.transform = `translateX(${r.right + p}px)`;
  };

  const moveCrew = (time, dt) => {
    let fx = innerWidth * 0.55, fy = innerHeight * 0.5;
    if (S && S.jobs.size) {
      let sx = 0, sy = 0;
      S.jobs.forEach((j) => { const r = j.L.el.getBoundingClientRect(); sx += r.left + r.width / 2; sy += r.top + r.height / 2; });
      fx = sx / S.jobs.size; fy = sy / S.jobs.size;
    }
    if (S && S.phase === 'scanning') { fx = innerWidth / 2; fy = innerHeight * 0.45; }
    flock.x += (fx - flock.x) * 0.04 * dt * 60;
    flock.y += (fy - flock.y) * 0.04 * dt * 60;

    const ring = S && S.phase === 'finale' && S.finaleEl ? S.finaleEl.getBoundingClientRect() : null;
    crew.forEach((a, i) => {
      let tx, ty, k = a.k;
      if (ring) {
        const ang = (i / crew.length) * Math.PI * 2 + time * 0.9;
        tx = ring.left + ring.width / 2 + Math.cos(ang) * (ring.width / 2 + 46);
        ty = ring.top + ring.height / 2 + Math.sin(ang) * (ring.height / 2 + 34);
      } else if (a.task) {
        const r = a.task.el.getBoundingClientRect();
        tx = r.left + r.width * a.task.fx + a.task.ox;
        ty = r.top + r.height * a.task.fy + a.task.oy;
        k = a.task.fast ? 0.2 : a.k * 2;
      } else if (S && (S.phase === 'leaving' || S.phase === 'done')) {
        tx = a.x + (a.x < innerWidth / 2 ? -30 : 30); ty = innerHeight + 90;
      } else {
        tx = flock.x + a.group.dx + Math.cos(time * 1.3 + a.wob) * 16;
        ty = flock.y + a.group.dy + Math.sin(time * 1.7 + a.wob) * 12;
      }
      const f = Math.min(1, k * dt * 60);
      a.x += (tx - a.x) * f;
      a.y += (ty - a.y) * f;
      a.el.style.transform = `translate3d(${a.x}px, ${a.y}px, 0)`;
    });
  };

  const hScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.scrollWidth > p.clientWidth + 2 && getComputedStyle(p).overflowX === 'auto') return p;
    }
    return null;
  };

  const tick = (time, dtMs) => {
    if (!S || S.phase === 'done') return;
    const dt = Math.min(dtMs, 100) / 1000;
    moveCrew(time, dt);
    S.jobs.forEach(placeJob);
    if (S.phase !== 'touring') return;

    const vh = innerHeight, vw = innerWidth;
    const maxC = narrow() ? 7 : 16;
    let pending = 0, blocking = false;
    for (const L of S.layers) {
      if (L.done || L.active) continue;
      const r = L.el.getBoundingClientRect();
      if (r.top >= vh * 0.9 || r.bottom <= 0) continue;
      if (r.left >= vw * 0.97) {
        // off to the right in a horizontal scroller (mobile project cards): bring it in
        // jump the scroller so the card lands at its snap point (small steps would snap back)
        const sc = hScroller(L.el);
        if (sc) {
          pending++;
          blocking = true;
          if (!S.active && time - (S.lastSlide || 0) > 0.4) {
            sc.scrollTo({ left: sc.scrollLeft + r.left - sc.getBoundingClientRect().left - 16, behavior: 'smooth' });
            S.lastSlide = time;
          }
        }
        continue;
      }
      if (r.right <= 0) continue;
      pending++;
      if (r.top < vh * 0.42) blocking = true;
      if (L.parent && !L.parent.done) continue;     // a card's contents wait for its frame
      const freeAgents = crew.some((a) => !a.task);
      if (S.active < maxC && freeAgents && time - S.lastStart > 0.045) { startJob(L); S.lastStart = time; }
    }

    S.pend = pending;
    // Keep scrolling while the lower part of the screen is still being built, but stop before anything
    // unbuilt reaches the upper part, and never carry a job off the top
    let hold = blocking;
    S.jobs.forEach((j) => { if (j.L.el.getBoundingClientRect().top < vh * 0.1) hold = true; });
    const max = document.documentElement.scrollHeight - vh;
    const y = window.scrollY;
    if (y < max - 2) {
      if (!hold) config.scroll(Math.min(max, y + (S.active ? 420 : 950) * dt));
    } else if (!pending && S.active === 0) {
      // anything left (only components that never come into view) goes in instantly
      S.layers.forEach((L) => reveal(L, true));
      finale();
    }
    if (performance.now() - S.t0 > 120000) skip();      // safety net
  };
  gsap.ticker.add(tick);

  /* ---------- Phases ---------- */
  const finale = () => {
    if (!S || S.phase !== 'touring') return;
    S.phase = 'finale';
    setBar();
    const run = S.run;
    gsap.delayedCall(3.4, () => {
      if (!S || S.run !== run || S.phase !== 'finale') return;
      S.phase = 'leaving';
      setBar();
      gsap.delayedCall(1.2, () => { if (S && S.run === run) done(); });
    });
  };

  const done = () => {
    if (!S) return;
    S.phase = 'done';
    ui.classList.remove('is-on');
    setBar();
  };

  const clearJobs = () => {
    S.jobs.forEach((j) => { j.box.remove(); j.lines.forEach((l) => l.remove()); });
    S.jobs.clear();
    crew.forEach((a) => { a.task = null; });
    S.active = 0;
  };

  const skip = () => {
    if (!busyPhase()) return;
    clearJobs();
    S.layers.forEach((L) => { L.active = false; reveal(L, true); });
    S.phase = 'leaving';
    setBar();
    const run = S.run;
    gsap.delayedCall(0.9, () => { if (S && S.run === run) done(); });
  };

  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((t) => window.addEventListener(t, (e) => {
    if (!busyPhase()) return;
    if (e.target && e.target.closest && e.target.closest('.tour-bar')) return;
    skip();
  }, { passive: true }));

  barBtn.addEventListener('click', () => {
    if (!S) return;
    if (busyPhase()) skip(); else tour(config);
  });

  /* ---------- Entry point ---------- */
  const tour = (cfg) => {
    config = cfg;
    if (S) clearJobs();
    if (S) S.layers.forEach((L) => L.el.classList.remove('tour-hidden'));
    cfg.prepare && cfg.prepare();
    cfg.scroll(0);
    document.querySelectorAll('.work__viewport').forEach((v) => { v.scrollLeft = 0; });
    makeCrew();
    const custom = cfg.custom || new Map();
    const found = collect(cfg.roots.map((q) => document.querySelector(q)), custom);
    const byItem = new Map();
    const layers = found.map((it) => {
      const L = { el: it.el, frame: it.frame, parent: it.parent ? byItem.get(it.parent) : null, reveal: custom.get(it.el) };
      byItem.set(it, L);
      return L;
    });
    layers.forEach((L) => { L.done = false; L.active = false; L.el.classList.add('tour-hidden'); });
    S = { run: ++runs, layers, jobs: new Set(), active: 0, built: 0, lastStart: 0, phase: 'scanning', t0: performance.now(), finaleEl: cfg.finale };
    flock.x = innerWidth / 2; flock.y = innerHeight / 2;
    ui.classList.add('is-on');
    bar.classList.add('is-on');
    setBar();
    const run = S.run;
    gsap.delayedCall(1.5, () => { if (S && S.run === run && S.phase === 'scanning') { S.phase = 'touring'; setBar(); } });
  };

  window.Agents = { tour, skip, collect, state: () => S && { phase: S.phase, active: S.active, built: S.built, total: S.layers.length, y: Math.round(scrollY), pend: S.pend } };
})();
