// Agent tour: the page is blanked and a swarm of cursors builds it back while it scrolls itself.
// Boxes are dragged out with a crosshair, text is typed with an I-beam (big headings start small and
// step up), repeated components are duplicated from one already built and then retyped, and when
// the page is done the swarm circles the Replay button at the end. Any wheel, touch, key or click
// during the build skips to the finished page.
(() => {
  if (!window.gsap) return;

  const narrow = () => window.matchMedia('(max-width: 760px)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const inOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const out3 = (t) => 1 - (1 - t) ** 3;
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // Neutral crew: ink, chalk, sand, stone. Light cursors get a dark outline and vice versa.
  const PALETTE = [
    ['#141414', '#f3eee5'], ['#f6f2ea', '#1b1b1b'], ['#d6c6a8', '#1b1b1b'], ['#8d8880', '#f3eee5'],
    ['#3a3734', '#f3eee5'], ['#e7dfcf', '#262626'], ['#b4ac9e', '#1b1b1b'], ['#605b55', '#f3eee5'],
  ];
  const ARROW = 'M1 1v15.5l4-3.6 2.7 6 2.6-1.1-2.6-5.9H13z';
  const CURSOR = `
    <svg class="cur cur--arrow" viewBox="0 0 14 20"><path d="${ARROW}"/></svg>
    <svg class="cur cur--cross" viewBox="0 0 21 21"><path class="o" d="M10.5 1.5v18M1.5 10.5h18"/><path d="M10.5 1.5v18M1.5 10.5h18"/></svg>
    <svg class="cur cur--ibeam" viewBox="0 0 11 21"><path class="o" d="M2 1.5h7M5.5 1.5v18M2 19.5h7"/><path d="M2 1.5h7M5.5 1.5v18M2 19.5h7"/></svg>
    <svg class="cur cur--dup" viewBox="0 0 22 22"><path d="${ARROW}"/><path class="o" d="M17 12.5v8M13 16.5h8"/><path class="p" d="M17 12.5v8M13 16.5h8"/></svg>`;

  /* ---------- Overlay ---------- */
  const ui = document.createElement('div');
  ui.className = 'tour';
  ui.setAttribute('aria-hidden', 'true');
  ui.innerHTML = '<div class="tour__ruler tour__ruler--x"></div><div class="tour__ruler tour__ruler--y"></div><div class="tour__marks"></div><div class="tour__crew"></div>';
  document.body.appendChild(ui);
  const marks = ui.querySelector('.tour__marks');
  const crewEl = ui.querySelector('.tour__crew');

  /* ---------- Which elements are components ---------- */
  // Text blocks are typed in one go; painted containers (cards, tiles) are drawn as an empty frame
  // and then filled piece by piece.
  const TEXT_TAG = /^(P|H1|H2|H3|H4|H5|H6|BUTTON|LABEL|DT|DD|SPAN|EM|STRONG|SMALL|B|I|CODE|TIME|svg|INPUT|TEXTAREA|SELECT)$/;
  const MEDIA_SEL = 'img, picture, canvas, video, iframe, .hero__stage';
  const isMedia = (el) => el.matches(MEDIA_SEL)
    || (el.children.length === 1 && el.children[0].matches('img, picture, canvas, video') && !norm(el.textContent));
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
        if (c.matches('script, template, dialog, style, noscript, .tour, .sr-only, .skip')) continue;
        const cs = getComputedStyle(c);
        if (cs.display === 'none' || (cs.display === 'contents' && !c.children.length)) continue;
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

  const subtree = (L) => {
    const out = [];
    const rec = (x) => x.kids.forEach((k) => { out.push(k); rec(k); });
    rec(L);
    return out;
  };
  const mediaKey = (el) => {
    const m = el.matches('img') ? el : el.querySelector('img');
    return m ? m.currentSrc || m.src : el.tagName;
  };

  // Siblings that look alike (project cards, certificates, nav links) become one master plus copies
  const findGroups = (layers) => {
    const byParent = new Map();
    layers.forEach((L) => {
      if (L.kind === 'custom') return;
      const p = L.el.parentElement;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(L);
    });
    const inCopy = new Set();
    byParent.forEach((sibs) => {
      const buckets = new Map();
      sibs.forEach((L) => {
        if (inCopy.has(L)) return;
        const sig = [L, ...subtree(L)].map((x) => x.kind[0]).join('');
        const key = `${L.el.tagName}.${L.el.classList[0] || ''}|${sig}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(L);
      });
      buckets.forEach((list) => {
        if (list.length < 2) return;
        const m = list[0];
        const single = !m.kids.length && m.kind === 'text';
        if (single && norm(m.el.textContent).length > 40) return;        // long paragraphs read better typed
        const a = m.el.getBoundingClientRect();
        const copies = list.slice(1).filter((k) => {
          const b = k.el.getBoundingClientRect();
          return a.height / b.height < 1.8 && b.height / a.height < 1.8 && (single || (a.width / b.width < 1.6 && b.width / a.width < 1.6));
        });
        if (!copies.length) return;
        const group = { master: m, members: [m, ...copies] };
        const masterAll = [m, ...subtree(m)];
        copies.forEach((k) => {
          k.dup = group;
          k.deps = masterAll;
          subtree(k).forEach((x) => inCopy.add(x));
        });
      });
    });
  };

  /* ---------- Text: typed into the real element without moving the layout ---------- */
  const setShown = (T, k) => {
    if (T.shown === k) return;
    T.shown = k;
    const last = k > 0 ? T.units[k - 1] : null;
    const li = last ? last[0] : -1;
    T.nodes.forEach((o, i) => {
      const v = i < li ? o.s : i === li ? o.s.slice(0, last[1]) : '';
      if (o.n.data !== v) o.n.data = v;
    });
    if (T.caret) {
      const at = Math.max(0, li);
      if (T.at !== at && T.nodes[at]) { T.nodes[at].n.after(T.caret); T.at = at; }
    }
  };
  const prepText = (el) => {
    const nodes = [];
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) nodes.push({ n: tw.currentNode, s: tw.currentNode.data });
    const units = [];
    nodes.forEach((o, i) => {
      const re = /\s+|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S]/g;
      let m;
      while ((m = re.exec(o.s))) units.push([i, m.index + m[0].length, /\s/.test(m[0])]);
    });
    const cs = getComputedStyle(el);
    const lock = cs.display !== 'inline' ? { w: el.style.width, h: el.style.height } : null;
    if (lock) { el.style.width = cs.width; el.style.height = cs.height; }
    const T = { el, nodes, units, shown: -1, lock, caret: null, at: -1 };
    setShown(T, 0);
    return T;
  };
  const fillWith = (T, text) => {             // a duplicate still carries its master's words
    T.nodes.forEach((o, i) => { o.n.data = i === 0 ? text : ''; });
    T.shown = -1;
  };
  const restoreText = (T) => {
    if (!T || T.restored) return;
    T.restored = true;
    T.nodes.forEach((o) => { if (o.n.data !== o.s) o.n.data = o.s; });
    if (T.caret) T.caret.remove();
    if (T.lock) { T.el.style.width = T.lock.w; T.el.style.height = T.lock.h; }
  };

  // Inline transforms we borrow (scale for growing headings, translate for drags) are given back
  const borrowed = new Map();
  const borrow = (el) => {
    if (!borrowed.has(el)) borrowed.set(el, { translate: el.style.translate, scale: el.style.scale, origin: el.style.transformOrigin });
  };
  const giveBack = (el) => {
    const o = borrowed.get(el);
    if (!o) return;
    el.style.translate = o.translate; el.style.scale = o.scale; el.style.transformOrigin = o.origin;
    borrowed.delete(el);
  };

  /* ---------- State ---------- */
  let S = null;
  let config = null;
  let crew = [];
  let mouse = null;
  let replayBtn = null;
  let frameRects = new Map();
  const R = (el) => {
    let r = frameRects.get(el);
    if (!r) { r = el.getBoundingClientRect(); frameRects.set(el, r); }
    return r;
  };
  const Rf = (el) => el.getBoundingClientRect();
  const box = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  const building = () => S && (S.phase === 'intro' || S.phase === 'build');
  const counts = () => (narrow() ? { min: 6, max: 14, intro: 8, flock: 12 } : { min: 11, max: 28, intro: 14, flock: 22 });

  /* ---------- Crew ---------- */
  let nextId = 0;
  const makeCursor = (x, y) => {
    const el = document.createElement('div');
    el.className = 'tour__agent';
    const [fill, edge] = PALETTE[nextId++ % PALETTE.length];
    el.style.setProperty('--c', fill);
    el.style.setProperty('--e', edge);
    el.innerHTML = CURSOR;
    el.dataset.shape = 'arrow';
    crewEl.appendChild(el);
    const fast = Math.random() < 0.25;
    return {
      el, x, y, vx: 0, vy: 0, angle: 0, press: 0, shape: 'arrow', task: null, gen: null, ov: null,
      idleFor: 0, leaving: false,
      speed: fast ? rand(900, 1300) : rand(320, 700), force: fast ? rand(3200, 5200) : rand(800, 1700),
      spin: fast ? rand(2, 3) : rand(0.8, 1.7), ring: rand(-45, 45),
    };
  };
  const fromEdge = () => {
    const left = Math.random() < 0.5;
    return makeCursor(left ? -30 : innerWidth + 30, innerHeight * rand(0.15, 0.85));
  };

  /* ---------- Motion primitives (generators fed with tempo-scaled seconds) ---------- */
  function* wait(t) { let n = 0; while (n < t) n += yield; }

  // Travel along a slight arc; `target` may be a function so it can follow a moving element
  function* moveTo(c, target, o = {}) {
    const get = typeof target === 'function' ? target : () => target;
    const x0 = c.x, y0 = c.y;
    let p = get();
    const dist = Math.hypot(p.x - x0, p.y - y0);
    if (dist > 0.5) {
      const dur = clamp(0.1 + Math.sqrt(dist) * 0.02, 0.12, 0.85) / (o.speed || 1);
      const bend = (o.bend ?? (Math.random() < 0.5 ? -1 : 1) * rand(0.05, 0.15)) * Math.min(dist, 500);
      let t = 0;
      while (t < dur) {
        t += yield;
        const k = Math.min(1, t / dur);
        const e = o.drag ? inOut(k) : out3(k);
        p = get();
        const dx = p.x - x0, dy = p.y - y0, len = Math.hypot(dx, dy) || 1, off = Math.sin(Math.PI * e) * bend;
        c.x = x0 + dx * e - (dy / len) * off;
        c.y = y0 + dy * e + (dx / len) * off;
        if (o.step) o.step();
      }
      p = get();
    }
    c.x = p.x; c.y = p.y;
    if (o.step) o.step();
  }

  function* click(c) { c.press = 1; yield* wait(0.07); }

  const show = (L, cls) => {
    L.el.classList.remove('tour-hidden');
    if (L.kind === 'custom' && L.reveal) { L.reveal(); return; }
    if (cls) {
      L.el.classList.add(cls);
      setTimeout(() => L.el.classList.remove(cls), 700);
    }
  };
  const finish = (L) => {
    if (L.T) { restoreText(L.T); L.T = null; }
    giveBack(L.el);
    L.el.classList.remove('tour-hidden', 'tour-sel');
    L.state = 'done';
  };

  /* ---------- Scripts ---------- */
  // A box: crosshair drag from the top-left corner, then the real thing fades or sweeps in
  function* buildBox(c, L) {
    const el = L.el;
    const ph = L.kind === 'media' || L.kind === 'custom';
    const draw = { w: 0, h: 0, full: false };
    c.shape = 'cross';
    yield* moveTo(c, () => { const r = R(el); return { x: r.left, y: r.top }; });
    c.press = 1;
    c.ov = () => {
      const r = R(el);
      return [{ b: draw.full ? box(r) : { x: r.left, y: r.top, w: draw.w, h: draw.h }, handles: true, badge: true, guides: true, fill: ph ? 'ph' : 'ghost' }];
    };
    // drag; a box bigger than the screen is dragged to the edge and then grows the rest of the way
    const end = () => {
      const r = R(el);
      return {
        x: Math.max(r.left + Math.min(r.width, 40), Math.min(r.right, innerWidth - 24)),
        y: Math.max(r.top + Math.min(r.height, 30), Math.min(r.bottom, innerHeight - 30)),
      };
    };
    yield* moveTo(c, end, {
      speed: 0.8, drag: true, bend: 0,
      step: () => { const r = R(el); draw.w = Math.max(0, c.x - r.left); draw.h = Math.max(0, c.y - r.top); },
    });
    const r1 = R(el);
    if (draw.w < r1.width - 0.5 || draw.h < r1.height - 0.5) {
      const w0 = draw.w, h0 = draw.h;
      let k = 0;
      while (k < 1) {
        k = Math.min(1, k + (yield) / 0.35);
        const r = R(el);
        draw.w = w0 + (r.width - w0) * out3(k);
        draw.h = h0 + (r.height - h0) * out3(k);
      }
    }
    draw.full = true;
    c.shape = 'arrow';
    yield* wait(rand(0.12, 0.22));
    show(L, ph ? 'tour-fill' : 'tour-frame');
    yield* wait(ph ? 0.4 : 0.25);
    c.ov = null;
    finish(L);
  }

  // Text: drag a text box (or just click for a short label), then type it in
  function* buildText(c, L, edit) {
    const el = L.el;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize) || 16;
    const lh = parseFloat(cs.lineHeight) || fs * 1.2;
    const grow = !edit && fs >= 34 && cs.display !== 'inline';
    const align = cs.textAlign;
    if (!L.T) L.T = prepText(el);
    const T = L.T;
    borrow(el);
    if (grow) {
      el.style.transformOrigin = align === 'center' ? 'top center' : align === 'right' || align === 'end' ? 'top right' : 'top left';
      el.style.scale = String(18 / fs);
    }
    const r00 = R(el);
    const nudge = !edit && !grow && cs.display !== 'inline' && Math.random() < 0.3 && r00.width > 160 && r00.height < lh * 2.6;
    const nd = nudge ? { x: rand(26, 56) * (Math.random() < 0.8 ? 1 : -1), y: rand(-6, 6) } : null;
    if (nd) el.style.translate = `${nd.x}px ${nd.y}px`;

    if (!edit) {
      c.shape = 'cross';
      yield* moveTo(c, () => { const r = R(el); return { x: r.left, y: r.top }; });
      const r0 = R(el);
      const lineH = Math.min(r0.height, lh * (grow ? 18 / fs : 1));
      if (r0.width < 140 && r0.height < lh * 1.6) yield* click(c);
      else {
        c.press = 1;
        const ghost = { w: 0, h: 0 };
        c.ov = () => { const r = R(el); return [{ b: { x: r.left, y: r.top, w: ghost.w, h: ghost.h }, handles: true, badge: true, guides: true }]; };
        yield* moveTo(c, () => { const r = R(el); return { x: Math.min(r.right, innerWidth - 20), y: r.top + lineH }; }, {
          speed: 0.9, drag: true, bend: 0,
          step: () => { const r = R(el); ghost.w = Math.max(0, c.x - r.left); ghost.h = Math.max(0, c.y - r.top); },
        });
      }
    } else {
      // a duplicated label: click twice to select the master's words, then retype them
      c.shape = 'arrow';
      yield* moveTo(c, () => { const r = R(el); return { x: r.left + Math.min(r.width * 0.5, 50), y: r.top + Math.min(r.height, lh) * 0.55 }; });
      yield* click(c);
      yield* wait(0.07);
      yield* click(c);
      el.classList.add('tour-sel');
      c.ov = () => [{ b: box(R(el)) }];
      yield* wait(rand(0.16, 0.28));
      el.classList.remove('tour-sel');
    }

    // type
    el.classList.remove('tour-hidden');
    T.caret = document.createElement('i');
    T.caret.className = 'tour-caret';
    T.at = -1;
    T.shown = -1;
    setShown(T, 0);
    c.shape = 'ibeam';
    c.ov = () => [{ b: box(R(el)) }];
    const caretPt = () => { const r = T.caret.getBoundingClientRect(); return { x: r.left + 2, y: r.top + r.height * 0.55 }; };
    yield* moveTo(c, caretPt, { speed: 1.6 });
    const N = T.units.length;
    const k = clamp(42 / Math.max(1, N), 0.04, 1);
    let i = 0, budget = 0;
    while (i < N) {
      budget += yield;
      while (i < N && budget > 0) {
        let d = rand(0.012, 0.038);
        if (T.units[i][2]) d += rand(0, 0.025);
        if (Math.random() < 0.02) d += rand(0.06, 0.16);
        budget -= d * k;
        i++;
      }
      setShown(T, i);
      const p = caretPt();
      c.x += (p.x + 3 - c.x) * 0.5;
      c.y += (p.y + 4 - c.y) * 0.5;
    }
    T.caret.remove();
    T.caret = null;
    c.shape = 'arrow';
    c.ov = () => [{ b: box(R(el)), handles: true, badge: true }];

    if (grow) {
      // heading typed at 18px, then stepped up to its real size
      const steps = [24, 32, 40, 48, 56, 64, 72, 88, 104].filter((s) => s > 18 && s < fs);
      for (const s of [...steps, fs]) {
        yield* wait(0.05);
        el.style.scale = String(s / fs);
      }
      yield* wait(0.12);
    }
    if (nd) {
      // drag it onto the guide; it snaps the last few pixels
      const grab = () => { const r = R(el); return { x: r.left + Math.min(r.width * 0.4, 60), y: r.top + Math.min(r.height * 0.5, 20) }; };
      yield* moveTo(c, grab);
      c.press = 1;
      const a = { x: c.x, y: c.y };
      let h = nd.x, v = nd.y;
      c.ov = () => [{ b: box(R(el)), handles: true }, { t: 'guide', x: R(el).left - h }];
      yield* moveTo(c, { x: a.x - nd.x, y: a.y - nd.y }, {
        speed: 0.7, drag: true,
        step: () => {
          h = nd.x - (c.x - a.x); v = nd.y - (c.y - a.y);
          if (Math.abs(h) < 9) h = 0;
          if (Math.abs(v) < 6) v = 0;
          el.style.translate = `${h}px ${v}px`;
        },
      });
      el.style.translate = '';
      yield* wait(0.18);
    } else yield* wait(0.16);
    c.ov = null;
    finish(L);
  }

  // A swapped image inside a duplicate: click it, the new picture sweeps in
  function* swapMedia(c, L) {
    const el = L.el;
    yield* moveTo(c, () => { const r = R(el); return { x: r.left + Math.min(r.width * 0.5, 60), y: r.top + Math.min(r.height * 0.5, 30) }; });
    yield* click(c);
    c.ov = () => [{ b: box(R(el)), handles: true, badge: true, fill: 'ph' }];
    yield* wait(rand(0.14, 0.24));
    show(L, 'tour-fill');
    yield* wait(0.4);
    c.ov = null;
    finish(L);
  }

  // Duplicate: select a finished sibling, alt-drag a copy into place, then retype what differs
  function* duplicate(c, L) {
    const el = L.el;
    const vis = (x) => { const r = Rf(x.el); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
    const done = (x) => x.state === 'done' && subtree(x).every((k) => k.state === 'done');
    const cands = L.dup.members.filter((x) => x !== L && done(x) && vis(x));
    if (!cands.length) {
      // nothing on screen to copy from: build it like any other component
      L.dup = null;
      yield* (L.kind === 'text' ? buildText(c, L, false) : buildBox(c, L));
      return;
    }
    const me = Rf(el);
    const src = cands.sort((a, b) => {
      const ra = Rf(a.el), rb = Rf(b.el);
      return Math.hypot(ra.left - me.left, ra.top - me.top) - Math.hypot(rb.left - me.left, rb.top - me.top);
    })[0];
    const off = { x: rand(-8, 8), y: rand(-4, 4) };
    const grab = () => { const r = Rf(src.el); return { x: r.left + Math.min(r.width * 0.45, 70) + off.x, y: r.top + Math.min(r.height * 0.45, 26) + off.y }; };
    c.shape = 'arrow';
    yield* moveTo(c, grab);
    yield* click(c);
    c.ov = () => [{ b: box(R(src.el)), handles: true, badge: true }];
    yield* wait(rand(0.12, 0.22));
    c.shape = 'dup';
    yield* wait(0.1);
    c.press = 1;

    // the copy appears on top of the source, still carrying the source's words
    const mine = [L, ...subtree(L)];
    const theirs = [src, ...subtree(src)];
    mine.forEach((x, i) => {
      const y = theirs[i];
      x.edit = null;
      if (x.kind === 'text') {
        const want = norm(y.el.textContent);
        if (norm(x.el.textContent) !== want) {
          x.T = prepText(x.el);
          fillWith(x.T, want);
          x.edit = 'text';
        }
      } else if (x.kind === 'media' && mediaKey(x.el) !== mediaKey(y.el)) x.edit = 'swap';
      if (x.edit !== 'swap') x.el.classList.remove('tour-hidden');
    });
    borrow(el);
    const s0 = Rf(src.el), g0 = grab();
    const rel = { x: g0.x - s0.left, y: g0.y - s0.top };
    let tx = 0, ty = 0;
    const base = () => { const r = Rf(el); return { x: r.left - tx, y: r.top - ty }; };
    const place = (x, y) => {
      const b = base();
      tx = x - rel.x - b.x; ty = y - rel.y - b.y;
      el.style.translate = `${tx}px ${ty}px`;
    };
    place(c.x, c.y);
    c.ov = () => {
      const a = Rf(src.el), b = Rf(el);
      return [{ b: box(a), color: 'red' }, { b: box(b), color: 'red' }, { t: 'measure', a, b }];
    };
    yield* moveTo(c, () => { const b = base(); return { x: b.x + rel.x, y: b.y + rel.y }; }, {
      speed: 0.65, drag: true, step: () => place(c.x, c.y),
    });
    giveBack(el);
    // dropped: everything that matches is done, the rest waits to be retyped or swapped
    mine.forEach((x) => { if (x !== L && !x.edit) x.state = 'done'; });
    c.shape = 'arrow';
    c.ov = () => [{ b: box(R(el)), handles: true, badge: true }];
    yield* wait(0.22);
    if (L.edit === 'text') { yield* buildText(c, L, true); return; }
    c.ov = null;
    finish(L);
  }

  const script = (c, L) => {
    if (L.dup) return duplicate(c, L);
    if (L.edit === 'text') return buildText(c, L, true);
    if (L.edit === 'swap') return swapMedia(c, L);
    return L.kind === 'text' ? buildText(c, L, false) : buildBox(c, L);
  };

  function* idle(c) {
    for (;;) {
      yield* moveTo(c, { x: rand(innerWidth * 0.18, innerWidth * 0.82), y: rand(innerHeight * 0.25, innerHeight * 0.75) }, { speed: 0.35 });
      yield* wait(rand(0.4, 1.2));
    }
  }
  function* leave(c) {
    const right = c.x > innerWidth / 2;
    yield* moveTo(c, () => ({ x: right ? innerWidth + 50 : -50, y: c.y }), { speed: 0.8 });
  }

  /* ---------- Swarm orbit (intro and finale) ---------- */
  const orbit = (dt, list, o, scale = 1) => {
    const t = S ? S.time : 0;
    const R0 = 118 * scale * (1 + 0.15 * Math.sin(t * 0.6));
    const swirl = Math.tanh(Math.cos(t * 0.12) * 3);
    const want = list.map((c) => {
      const dx = c.x - o.x, dy = c.y - o.y, d = Math.hypot(dx, dy) || 0.01, nx = dx / d, ny = dy / d;
      const rr = R0 * (1 + 0.25 * Math.sin(3 * Math.atan2(dy, dx) + t * 0.8)) + c.ring * scale;
      const tan = 270 * (0.7 + c.spin * 0.25) * swirl;
      const rad = clamp((rr - d) * 3.6, -2400, 1300);
      return [-ny * tan + nx * rad, nx * tan + ny * rad];
    });
    list.forEach((c, i) => {
      let ax = 0, ay = 0, w = 0;
      list.forEach((q, j) => {
        if (j === i) return;
        const d = Math.hypot(q.x - c.x, q.y - c.y);
        if (d > 90) return;
        const k = 1 - d / 90;
        ax += q.vx * k; ay += q.vy * k; w += k;
      });
      let [fx, fy] = want[i];
      if (w) { fx = fx * 0.7 + (ax / w) * 0.3; fy = fy * 0.7 + (ay / w) * 0.3; }
      const far = Math.max(0, Math.hypot(c.x - o.x, c.y - o.y) - 190 * scale);
      const maxV = c.speed * (1.25 + Math.min(3, far / 90));
      const len = Math.hypot(fx, fy);
      if (len > maxV) { fx *= maxV / len; fy *= maxV / len; }
      let gx = (fx - c.vx) * 6, gy = (fy - c.vy) * 6;
      const maxF = c.force * (1.4 + Math.min(5, far / 50));
      const G = Math.hypot(gx, gy);
      if (G > maxF) { gx *= maxF / G; gy *= maxF / G; }
      c.vx += gx * dt; c.vy += gy * dt;
      c.x += c.vx * dt; c.y += c.vy * dt;
    });
    // keep clear of the visitor's own pointer
    if (mouse) list.forEach((c) => {
      const dx = c.x - mouse.x, dy = c.y - mouse.y, d = Math.hypot(dx, dy) || 0.01;
      if (d >= 46) return;
      c.x = mouse.x + (dx / d) * 46; c.y = mouse.y + (dy / d) * 46;
      c.vx += (dx / d) * 240; c.vy += (dy / d) * 240;
    });
    list.forEach((c) => {
      if (Math.hypot(c.vx, c.vy) < 30) return;
      const a = ((((Math.atan2(c.vy, c.vx) * 180) / Math.PI + 125 - c.angle + 540) % 360) + 360) % 360 - 180;
      c.angle += a * Math.min(1, dt * 8);
    });
  };

  /* ---------- Rendering ---------- */
  const pools = { tb: [], tg: [], tm: [] };
  const used = { tb: 0, tg: 0, tm: 0 };
  const take = (kind) => {
    let e = pools[kind][used[kind]];
    if (!e) {
      e = document.createElement('div');
      if (kind === 'tb') e.innerHTML = '<i></i><i></i><i></i><i></i><em></em>';
      if (kind === 'tm') e.innerHTML = '<em></em>';
      marks.appendChild(e);
      pools[kind].push(e);
    }
    used[kind]++;
    e.hidden = false;
    return e;
  };
  const line = (axis, pos, red) => {
    const e = take('tg');
    e.className = `tg tg--${axis}${red ? ' tg--red' : ''}`;
    e.style.transform = axis === 'h' ? `translateY(${pos}px)` : `translateX(${pos}px)`;
  };
  const measure = (a, b) => {
    const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    if (oy > 0) {
      const [l, r] = a.left < b.left ? [a, b] : [b, a];
      return { horiz: true, x: l.right, y: Math.max(a.top, b.top) + oy / 2, len: r.left - l.right };
    }
    if (ox > 0) {
      const [t, u] = a.top < b.top ? [a, b] : [b, a];
      return { horiz: false, x: Math.max(a.left, b.left) + ox / 2, y: t.bottom, len: u.top - t.bottom };
    }
    return null;
  };
  const drawMarks = () => {
    used.tb = used.tg = used.tm = 0;
    crew.forEach((c) => {
      if (!c.ov) return;
      c.ov().forEach((d) => {
        if (d.t === 'guide') { line('v', d.x, true); return; }
        if (d.t === 'measure') {
          const m = measure(d.a, d.b);
          if (!m || !(m.len > 0)) return;
          const e = take('tm');
          e.className = `tm${m.horiz ? '' : ' tm--v'}`;
          Object.assign(e.style, m.horiz
            ? { left: `${m.x}px`, top: `${m.y}px`, width: `${m.len}px`, height: '1px' }
            : { left: `${m.x}px`, top: `${m.y}px`, width: '1px', height: `${m.len}px` });
          e.firstChild.textContent = Math.round(m.len);
          return;
        }
        const b = d.b;
        const e = take('tb');
        e.className = `tb${d.color === 'red' ? ' tb--red' : ''}${d.handles ? ' tb--h' : ''}${d.fill ? ` tb--${d.fill}` : ''}`;
        Object.assign(e.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${Math.max(0, b.w)}px`, height: `${Math.max(0, b.h)}px` });
        const em = e.lastChild;
        em.hidden = !d.badge;
        if (d.badge) em.textContent = `${Math.round(b.w)} × ${Math.round(b.h)}`;
        if (d.guides) { line('h', b.y); line('h', b.y + b.h); line('v', b.x); line('v', b.x + b.w); }
      });
    });
    Object.keys(pools).forEach((k) => { for (let i = used[k]; i < pools[k].length; i++) pools[k][i].hidden = true; });
  };
  const drawCrew = (dt) => {
    crew.forEach((c) => {
      c.press = Math.max(0, c.press - dt * 6);
      if (c.el.dataset.shape !== c.shape) c.el.dataset.shape = c.shape;
      const rot = c.shape === 'arrow' ? c.angle : 0;
      c.el.style.transform = `translate3d(${c.x}px, ${c.y}px, 0) rotate(${rot}deg) scale(${1 - c.press * 0.18})`;
    });
  };

  /* ---------- Build loop ---------- */
  const hScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.scrollWidth > p.clientWidth + 2 && getComputedStyle(p).overflowX === 'auto') return p;
    }
    return null;
  };
  const ready = (L) => L.state === 'wait' && (!L.parent || L.parent.state === 'done') && L.deps.every((d) => d.state === 'done');

  const buildStep = (dt) => {
    const vw = innerWidth, vh = innerHeight;
    const C = counts();
    const avail = [];
    let backlog = 0, hold = false, minTop = vh;
    const slideTo = new Map();      // horizontal scroller -> first unbuilt piece waiting off to the right
    const scBusy = new Set();       // scrollers that still have unbuilt pieces on screen
    for (const L of S.layers) {
      if (L.state === 'done') continue;
      const r = R(L.el);
      // a horizontal scroller (mobile project cards) is busy while any card showing in it is unbuilt,
      // even the part still below the fold
      if (L.sc && r.left < vw * 0.97 && r.right > 0 && r.bottom > 0) scBusy.add(L.sc);
      if (r.top >= vh * 0.98 || r.bottom <= 0) continue;
      if (r.left >= vw * 0.97) {
        // off to the right: once the row is well on screen and its visible cards are built, slide it in
        if (L.sc && r.top < vh * 0.7) {
          backlog++;
          if (!slideTo.has(L.sc)) slideTo.set(L.sc, r);
        }
        continue;
      }
      if (r.right <= 0) continue;
      backlog++;
      // the highest unfinished piece sets the scroll speed; a card leaving on the left stops it
      if (r.top < minTop) minTop = Math.max(0, r.top);
      if (r.right < vw * 0.3 && L.el.closest('.work__viewport')) hold = true;
      if (L.state !== 'wait') continue;
      if (!ready(L)) {
        L.blocked = (L.blocked || 0) + dt;
        if (L.blocked > 5) L.deps = [];                // never wait forever on a master
        continue;
      }
      avail.push({ L, r });
    }
    slideTo.forEach((r, sc) => {
      if (scBusy.has(sc)) return;                      // let the page scroll on until those cards are built
      hold = true;
      if (S.time - (S.lastSlide || 0) < 0.5) return;
      sc.scrollTo({ left: sc.scrollLeft + r.left - sc.getBoundingClientRect().left - 16, behavior: 'smooth' });
      S.lastSlide = S.time;
    });

    // crew size follows the work on screen
    const alive = crew.filter((c) => !c.leaving);
    const free = alive.filter((c) => !c.task);
    const want = clamp(C.min + avail.length, C.min, C.max);
    S.spawnCd -= dt;
    if (alive.length < want && avail.length > free.length && S.spawnCd <= 0) {
      const c = fromEdge();
      crew.push(c); alive.push(c); free.push(c);
      S.spawnCd = 0.03;
    }
    S.tempo = clamp(3.4 + (backlog / Math.max(1, alive.length)) * 0.5, 3.4, 5);

    // hand out work: top of the screen first, then whatever is close
    for (const c of free) {
      if (!avail.length) break;
      let best = 0, bestS = Infinity;
      avail.forEach((a, i) => {
        const s = a.r.top * 0.6 + Math.abs(a.r.top - c.y) * 0.4 + Math.max(0, a.r.left) * 0.15;
        if (s < bestS) { bestS = s; best = i; }
      });
      const { L } = avail.splice(best, 1)[0];
      L.state = 'active';
      c.task = L;
      c.idleFor = 0;
      c.angle = 0;
      c.gen = script(c, L);
    }

    const sdt = dt * S.tempo;
    for (const c of [...crew]) {
      if (!c.task) {
        c.idleFor += dt;
        if (!c.leaving && c.idleFor > 2.2 && crew.filter((m) => !m.leaving).length > C.min) { c.leaving = true; c.gen = leave(c); }
        if (!c.gen) c.gen = idle(c);
      }
      if (c.angle) c.angle *= 1 - Math.min(1, dt * 10);
      if (c.gen.next(c.task ? sdt : dt).done) {
        c.gen = null; c.task = null; c.ov = null; c.shape = 'arrow';
        if (c.leaving) { c.el.remove(); crew.splice(crew.indexOf(c), 1); }
      }
      if (S.phase !== 'build') return;                 // a skip happened inside a script
    }

    // scroll at the pace the crew can keep up with
    const max = document.documentElement.scrollHeight - vh;
    const y = window.scrollY;
    // full speed while the unfinished work is low on the screen, easing to a stop as it nears the top
    let target = 760 * clamp((minTop / vh - 0.1) / 0.5, 0, 1);
    if (hold) { target = 0; S.v = 0; }
    S.v += (target - S.v) * Math.min(1, dt * (target < S.v ? 8 : 3));
    if (y < max - 1) {
      if (S.v > 2) config.scroll(Math.min(max, y + S.v * dt));
    } else if (backlog === 0) finishAll();
    if (S.time > 150) finishAll();                       // safety net
  };

  const finishAll = () => {
    if (!S || S.phase === 'flock') return;
    crew.forEach((c) => { c.gen = null; c.task = null; c.ov = null; c.shape = 'arrow'; c.leaving = false; });
    S.layers.forEach((L) => {
      if (L.state === 'done') return;
      if (L.kind === 'custom' && L.reveal) L.reveal();
      finish(L);
    });
    borrowed.forEach((_, el) => giveBack(el));
    S.phase = 'flock';
    ui.classList.remove('is-building');
  };

  /* ---------- Frame ---------- */
  const tick = (time, dtMs) => {
    if (!S) return;
    const dt = Math.min(dtMs, 50) / 1000;
    S.time += dt;
    frameRects = new Map();
    const C = counts();
    if (S.phase === 'intro') {
      orbit(dt, crew, { x: innerWidth / 2, y: innerHeight * 0.48 }, 0.8);
      if (S.time > 1.5) { S.phase = 'build'; crew.forEach((c) => { c.vx = 0; c.vy = 0; }); }
    } else if (S.phase === 'build') {
      buildStep(dt);
    } else if (S.phase === 'flock') {
      S.spawnCd -= dt;
      if (crew.length < C.flock && S.spawnCd <= 0) { crew.push(fromEdge()); S.spawnCd = 0.06; }
      const r = replayBtn && replayBtn.getBoundingClientRect();
      const o = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
      orbit(dt, crew, o, 0.9);
    }
    drawCrew(dt);
    drawMarks();
  };
  gsap.ticker.add(tick);

  /* ---------- Input ---------- */
  window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') mouse = { x: e.clientX, y: e.clientY }; }, { passive: true });
  document.addEventListener('pointerleave', () => { mouse = null; });
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((t) => window.addEventListener(t, (e) => {
    if (!building()) return;
    if (e.target && e.target.closest && e.target.closest('.replay')) return;
    finishAll();
  }, { passive: true }));

  const ensureReplay = (host) => {
    if (replayBtn || !host) return;
    const wrap = document.createElement('div');
    wrap.className = 'replay-wrap';
    wrap.innerHTML = '<button type="button" class="replay"><span aria-hidden="true">↻</span> Replay the build</button>';
    host.insertBefore(wrap, host.querySelector('.footer__word'));
    replayBtn = wrap.firstChild;
    replayBtn.addEventListener('click', () => { if (!building()) tour(config); });
  };

  /* ---------- Entry point ---------- */
  const tour = (cfg) => {
    config = cfg;
    if (S) finishAll();
    ensureReplay(document.querySelector(cfg.replayHost || '.footer'));
    if (cfg.prepare) cfg.prepare();
    cfg.scroll(0);
    document.querySelectorAll('.work__viewport').forEach((v) => { v.scrollLeft = 0; });
    const custom = cfg.custom || new Map();
    const found = collect(cfg.roots.map((q) => document.querySelector(q)), custom);
    const byItem = new Map();
    const layers = found.map((it) => {
      const el = it.el;
      const kind = custom.has(el) ? 'custom' : it.frame ? 'frame' : isMedia(el) ? 'media' : norm(el.textContent) ? 'text' : 'box';
      const L = { el, kind, parent: it.parent ? byItem.get(it.parent) : null, kids: [], deps: [], state: 'wait', reveal: custom.get(el), sc: hScroller(el) };
      if (L.parent) L.parent.kids.push(L);
      byItem.set(it, L);
      return L;
    });
    findGroups(layers);
    layers.forEach((L) => L.el.classList.add('tour-hidden'));
    S = { layers, phase: 'intro', time: 0, v: 0, tempo: 2, spawnCd: 0 };
    // the intro swarm flies in from both sides and circles the middle of the screen
    const C = counts();
    while (crew.length < C.intro) crew.push(fromEdge());
    crew.forEach((c) => { c.gen = null; c.task = null; c.ov = null; c.leaving = false; c.shape = 'arrow'; });
    ui.classList.add('is-on', 'is-building');
  };

  window.Agents = {
    tour, skip: finishAll, collect,
    state: () => S && {
      phase: S.phase, total: S.layers.length, done: S.layers.filter((L) => L.state === 'done').length,
      active: S.layers.filter((L) => L.state === 'active').length, crew: crew.length, y: Math.round(scrollY),
      dups: S.layers.filter((L) => L.dup).length, t: +S.time.toFixed(1),
    },
  };
})();
