(() => {
  const root = document.documentElement;
  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  if (!hasGSAP) root.classList.remove('motion');
  const motion = root.classList.contains('motion');
  window.__motionReady = true;

  /* ---------- Theme: follows the system until the visitor picks one ---------- */
  const themeBtn = document.getElementById('theme-toggle');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const currentTheme = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');
  const syncThemeLabel = () => { themeBtn.textContent = currentTheme() === 'dark' ? 'Light mode' : 'Dark mode'; };
  syncThemeLabel();
  systemDark.addEventListener('change', syncThemeLabel);
  themeBtn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    syncThemeLabel();
  });

  /* ---------- Mobile menu ---------- */
  const nav = document.getElementById('nav');
  const menuBtn = document.getElementById('menu-toggle');
  const setMenu = (open) => {
    nav.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  /* ---------- Copy email ---------- */
  const copyBtn = document.getElementById('copy-email');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(copyBtn.dataset.email);
      copyBtn.textContent = 'Copied';
    } catch (e) {
      copyBtn.textContent = 'Press Ctrl+C';
    }
    setTimeout(() => { copyBtn.textContent = 'Copy email'; }, 1800);
  });
  document.getElementById('year').textContent = new Date().getFullYear();

  let lenis = null;

  /* ---------- Project detail panel ---------- */
  const panel = document.getElementById('panel');
  const panelTitle = document.getElementById('panel-title');
  const panelClient = document.getElementById('panel-client');
  const panelBody = document.getElementById('panel-body');
  let lastTrigger = null;
  const openPanel = (card, trigger) => {
    panelTitle.textContent = card.querySelector('.pcard__title').textContent;
    panelClient.textContent = card.querySelector('.pcard__top span:last-child').textContent;
    panelBody.replaceChildren(card.querySelector('.pcard__full').content.cloneNode(true));
    lastTrigger = trigger;
    panel.classList.remove('is-closing');
    panel.showModal();
    panel.querySelector('.panel__inner').scrollTop = 0;
    if (lenis) lenis.stop();
  };
  const closePanel = () => {
    if (!panel.open || panel.classList.contains('is-closing')) return;
    const done = () => {
      panel.classList.remove('is-closing');
      panel.close();
    };
    if (motion) {
      panel.classList.add('is-closing');
      panel.addEventListener('animationend', done, { once: true });
    } else {
      done();
    }
  };
  panel.addEventListener('close', () => {
    if (lenis) lenis.start();
    if (lastTrigger) lastTrigger.focus({ preventScroll: true });
  });
  panel.addEventListener('cancel', (e) => { e.preventDefault(); closePanel(); });
  panel.addEventListener('click', (e) => { if (e.target === panel) closePanel(); });
  document.getElementById('panel-close').addEventListener('click', closePanel);

  const cards = [...document.querySelectorAll('.pcard')];
  cards.forEach((card) => {
    const more = card.querySelector('.pcard__more');
    card.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      openPanel(card, more);
    });
    // Spotlight border follows the pointer
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  /* ---------- Certificate lightbox: one gallery per honour ---------- */
  const lightbox = document.getElementById('lightbox');
  const lbImg = document.getElementById('lightbox-img');
  const lbCap = document.getElementById('lightbox-cap');
  const lbCount = document.getElementById('lightbox-count');
  const lbPrev = document.getElementById('lightbox-prev');
  const lbNext = document.getElementById('lightbox-next');
  let lbItems = [], lbIndex = 0, lbTrigger = null;
  const lbShow = (i) => {
    lbIndex = (i + lbItems.length) % lbItems.length;
    const item = lbItems[lbIndex];
    lbImg.classList.remove('is-swapping');
    void lbImg.offsetWidth;
    lbImg.src = item.dataset.src;
    lbImg.alt = item.dataset.caption;
    lbImg.classList.add('is-swapping');
    lbCap.textContent = item.dataset.caption;
    lbCount.textContent = lbItems.length > 1 ? `${lbIndex + 1} / ${lbItems.length}` : '';
    lbPrev.hidden = lbNext.hidden = lbItems.length < 2;
  };
  document.querySelectorAll('[data-gallery]').forEach((btn) => {
    btn.addEventListener('click', () => {
      lbItems = [...document.querySelectorAll(`[data-gallery="${btn.dataset.gallery}"]`)];
      lbTrigger = btn;
      lbShow(lbItems.indexOf(btn));
      lightbox.showModal();
      if (lenis) lenis.stop();
    });
  });
  lbPrev.addEventListener('click', () => lbShow(lbIndex - 1));
  lbNext.addEventListener('click', () => lbShow(lbIndex + 1));
  document.getElementById('lightbox-close').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox || e.target.classList.contains('lightbox__fig')) lightbox.close(); });
  lightbox.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') lbShow(lbIndex - 1);
    if (e.key === 'ArrowRight') lbShow(lbIndex + 1);
  });
  lightbox.addEventListener('close', () => {
    if (lenis) lenis.start();
    if (lbTrigger) lbTrigger.focus({ preventScroll: true });
  });

  /* ---------- Project filters ---------- */
  const chips = [...document.querySelectorAll('.filters .chip')];
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const f = chip.dataset.filter;
      chips.forEach((c) => {
        const on = c === chip;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-pressed', String(on));
      });
      cards.forEach((card) => { card.hidden = f !== 'all' && !card.dataset.cat.split(' ').includes(f); });
      if (motion) ScrollTrigger.refresh();
    });
  });

  const links = [...nav.querySelectorAll('a')];
  const setCurrent = (id) => links.forEach((a) => a.classList.toggle('is-current', a.getAttribute('href') === '#' + id));
  const topbar = document.querySelector('.topbar');

  /* ---------- Hero backdrop: a drifting node network that reaches for the cursor ---------- */
  const heroNet = (() => {
    const canvas = document.getElementById('hero-net');
    if (!canvas || !canvas.getContext) return null;
    const ctx = canvas.getContext('2d');
    const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const LINK = 160, REACH = 200;
    let w = 0, h = 0, dpr = 1, nodes = [], ink = '17,17,19', accent = '39,71,208', running = false, raf = 0;
    const pointer = { x: -9999, y: -9999, active: false };

    const rgb = (name) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${name})`;
      document.body.appendChild(probe);
      const m = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g);
      probe.remove();
      return m ? m.slice(0, 3).join(',') : null;
    };
    const readColors = () => { ink = rgb('--ink') || ink; accent = rgb('--accent') || accent; };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(210, Math.round((w * h) / 7000));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.4 + 0.8,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const n of nodes) {
        if (animate) {
          if (pointer.active) {
            const dx = pointer.x - n.x, dy = pointer.y - n.y, d = Math.hypot(dx, dy);
            if (d < REACH && d > 1) { n.vx += (dx / d) * 0.012; n.vy += (dy / d) * 0.012; }
          }
          n.vx *= 0.995; n.vy *= 0.995;
          const sp = Math.hypot(n.vx, n.vy);
          if (sp < 0.12) { n.vx += (Math.random() - 0.5) * 0.04; n.vy += (Math.random() - 0.5) * 0.04; }
          if (sp > 0.9) { n.vx *= 0.9; n.vy *= 0.9; }
          n.x += n.vx; n.y += n.vy;
          if (n.x < 0 || n.x > w) n.vx *= -1;
          if (n.y < 0 || n.y > h) n.vy *= -1;
        }
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          if (Math.abs(dx) > LINK || Math.abs(dy) > LINK) continue;
          const d = Math.hypot(dx, dy);
          if (d < LINK) {
            ctx.strokeStyle = `rgba(${ink},${(1 - d / LINK) * 0.26})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        if (pointer.active) {
          const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
          if (d < REACH) {
            ctx.strokeStyle = `rgba(${accent},${(1 - d / REACH) * 0.75})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
          }
        }
        ctx.fillStyle = `rgba(${ink},0.5)`;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
      }
    };

    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    const start = () => { if (!animate) { draw(); return; } if (running) return; running = true; raf = requestAnimationFrame(loop); };
    const stop = () => { running = false; cancelAnimationFrame(raf); };

    readColors(); resize(); start();
    new ResizeObserver(() => { resize(); if (!animate) draw(); }).observe(canvas);
    new MutationObserver(() => { readColors(); if (!animate) draw(); }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); if (!animate) draw(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())).observe(canvas);
    }
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    const hero = canvas.parentElement;
    hero.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.active = true;
    });
    hero.addEventListener('pointerleave', () => { pointer.active = false; });
    return canvas;
  })();

  /* ---------- Static path: reduced motion or no GSAP ---------- */
  if (!motion) {
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => topbar.classList.toggle('is-scrolled', !entry.isIntersecting))
        .observe(document.querySelector('.top-sentinel'));
      const spy = new IntersectionObserver((entries) => {
        entries.forEach((entry) => { if (entry.isIntersecting) setCurrent(entry.target.id); });
      }, { rootMargin: '-45% 0px -50% 0px' });
      links.forEach((a) => { const s = document.querySelector(a.getAttribute('href')); if (s) spy.observe(s); });
    }
    return;
  }

  /* ================= Motion path ================= */
  gsap.registerPlugin(ScrollTrigger);
  const mm = gsap.matchMedia();
  const desktop = '(min-width: 901px)';

  // Smooth scroll with inertia, driven by GSAP's ticker so ScrollTrigger stays in sync
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    document.querySelectorAll('a[href^="#"]:not(.skip)').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        const target = id === '#top' ? 0 : document.querySelector(id);
        if (target === null) return;
        e.preventDefault();
        lenis.scrollTo(target, { offset: id === '#top' ? 0 : -64, duration: 1.4 });
      });
    });
  }

  // Helpers to split text into animatable spans
  const splitChars = (el) => {
    const text = el.textContent.trim();
    const mask = document.createElement('span');
    mask.className = 'mask';
    [...text].forEach((c) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = c === ' ' ? ' ' : c;
      mask.appendChild(s);
    });
    el.replaceChildren(mask);
    return mask.querySelectorAll('.ch');
  };
  const splitWordsDeep = (el) => {
    const words = [];
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span');
            w.className = 'w';
            w.textContent = part;
            words.push(w);
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    };
    walk(el);
    return words;
  };

  /* Hero intro: headline words rise out of masks, the sculpture fades up, supporting copy follows */
  const hero = document.querySelector('.hero');
  const title = hero.querySelector('[data-split-words]');
  const stage = hero.querySelector('.hero__stage');
  const maskWord = (content) => {
    const m = document.createElement('span'); m.className = 'wm';
    const i = document.createElement('span'); i.className = 'wi';
    i.append(content); m.appendChild(i);
    return m;
  };
  const titleWords = [];
  [...title.childNodes].forEach((node) => {
    if (node.nodeType === 3) {
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
        const m = maskWord(part); titleWords.push(m.firstChild); frag.appendChild(m);
      });
      node.replaceWith(frag);
    } else {
      const m = maskWord(node.cloneNode(true)); titleWords.push(m.firstChild); node.replaceWith(m);
    }
  });
  gsap.set([title, stage], { visibility: 'visible' });
  gsap.timeline({ defaults: { ease: 'expo.out' } })
    .from(titleWords, { yPercent: 120, duration: 1.3, stagger: 0.08 }, 0.15)
    .fromTo(stage, { autoAlpha: 0, scale: 0.96 }, { autoAlpha: 1, scale: 1, duration: 1.8 }, 0.1)
    .fromTo('[data-intro]', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.09 }, 0.55);

  // Leaving the hero: copy lifts away and the sculpture turns (sculpture.js reads __heroProgress)
  ScrollTrigger.create({
    trigger: hero, start: 'top top', end: 'bottom top',
    onUpdate: (self) => { window.__heroProgress = self.progress; },
  });
  mm.add(desktop, () => {
    gsap.to(hero.querySelector('.hero__copy'), {
      yPercent: -18, opacity: 0.2, ease: 'none',
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
    });
  });

  /* Marquee: constant drift, reverses with scroll direction and surges with scroll speed */
  const marquee = document.querySelector('.marquee__track');
  let mx = 0, mDir = 1, mBoost = 0;
  const wrapX = gsap.utils.wrap(-50, 0);
  gsap.ticker.add((time, dt) => {
    mx = wrapX(mx - 0.0011 * dt * (1 + mBoost) * mDir);
    gsap.set(marquee, { xPercent: mx });
    mBoost *= 0.93;
  });
  ScrollTrigger.create({
    onUpdate: (self) => {
      mDir = self.direction;
      mBoost = Math.min(Math.abs(self.getVelocity()) / 350, 7);
    },
  });

  /* Work: pin the section and pan the track. Created before anything below it so later triggers account for the pin. */
  const work = document.getElementById('work');
  const workPin = work.querySelector('.work__pin');
  const viewport = work.querySelector('.work__viewport');
  const track = work.querySelector('.work__track');
  mm.add(desktop, () => {
    work.classList.add('is-pinned');
    const distance = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
    gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: workPin,
        start: 'top top',
        end: () => `+=${distance()}`,
        pin: true,
        scrub: 1,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      },
    });
    return () => work.classList.remove('is-pinned');
  });

  /* About: the statement lights up word by word as it's read */
  const leadWords = splitWordsDeep(document.querySelector('[data-words]'));
  gsap.fromTo(leadWords, { opacity: 0.14 }, {
    opacity: 1, ease: 'none', stagger: 0.1,
    scrollTrigger: { trigger: '.about__lead', start: 'top 78%', end: 'bottom 42%', scrub: true },
  });

  /* Background detail: contour fields drift slower than content */
  document.querySelectorAll('.topo').forEach((el) => {
    gsap.fromTo(el, { yPercent: -6 }, {
      yPercent: 6, ease: 'none',
      scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

  /* Experience: the rail fills as you move through the roles */
  gsap.fromTo('.timeline__fill', { scaleY: 0 }, {
    scaleY: 1, ease: 'none',
    scrollTrigger: { trigger: '.timeline', start: 'top 70%', end: 'bottom 55%', scrub: true },
  });

  /* Research: photos drift inside their frames */
  document.querySelectorAll('[data-parallax]').forEach((img) => {
    gsap.fromTo(img, { yPercent: -7 }, {
      yPercent: 7, ease: 'none',
      scrollTrigger: { trigger: img.closest('.tile'), start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

  /* Contact: headline words rise out of their masks */
  const contactTitle = document.querySelector('.contact__title');
  const contactWords = contactTitle.textContent.trim().split(/\s+/).map((w) => {
    const m = document.createElement('span'); m.className = 'wm';
    const i = document.createElement('span'); i.className = 'wi'; i.textContent = w;
    m.appendChild(i);
    return m;
  });
  contactTitle.setAttribute('aria-label', contactTitle.textContent.trim());
  contactTitle.replaceChildren(...contactWords.flatMap((m, idx) => (idx ? [document.createTextNode(' '), m] : [m])));
  gsap.from(contactTitle.querySelectorAll('.wi'), {
    yPercent: 115, duration: 1.2, ease: 'expo.out', stagger: 0.07,
    scrollTrigger: { trigger: contactTitle, start: 'top 82%' },
  });

  /* Footer: the wordmark rises like a curtain as the page ends */
  gsap.from('.footer__word span', {
    yPercent: 100, ease: 'none',
    scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true },
  });

  /* Generic reveals, batched so groups cascade in */
  ScrollTrigger.batch('.reveal', {
    start: 'top 88%',
    once: true,
    onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08, overwrite: true }),
  });

  /* Magnetic copy button (pointer devices only) */
  mm.add('(hover: hover) and (pointer: fine)', () => {
    document.querySelectorAll('[data-magnetic]').forEach((el) => {
      const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.35);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.35);
      });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  });

  /* Top bar hairline and current-section highlight */
  ScrollTrigger.create({ start: 4, end: 'max', toggleClass: { targets: topbar, className: 'is-scrolled' } });
  links.forEach((a) => {
    const section = document.querySelector(a.getAttribute('href'));
    if (!section) return;
    ScrollTrigger.create({
      trigger: section, start: 'top 50%', end: 'bottom 50%',
      onToggle: (self) => { if (self.isActive) setCurrent(section.id); },
    });
  });

  // Fonts change line lengths and therefore pin distances
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh());
})();
