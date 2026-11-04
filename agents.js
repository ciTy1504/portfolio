// Agent swarm: coloured cursors that "assemble" the page. Blueprint boxes are drawn around an element
// just before it reveals. Everything lives in document coordinates so it scrolls with the content.
// Exposes window.Agents; main.js drives it on the motion path only.
(() => {
  if (!window.gsap) return;

  const ROSTER = [
    { name: 'planner', c: '#7c9cff' },
    { name: 'nlp', c: '#ff7a90' },
    { name: 'vision', c: '#52d6b0' },
    { name: 'rag', c: '#ffc15e' },
    { name: 'secops', c: '#c792ff' },
    { name: 'data', c: '#5ec8ff' },
    { name: 'eval', c: '#ff9b5e' },
    { name: 'deploy', c: '#a8e05f' },
  ];
  const narrow = () => window.matchMedia('(max-width: 760px)').matches;

  const layer = document.createElement('div');
  layer.className = 'agents-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);

  const ARROW = '<svg viewBox="0 0 14 20"><path d="M1 1v15.5l4-3.6 2.7 6 2.6-1.1-2.6-5.9H13z"/></svg>';
  const agents = ROSTER.map((r) => {
    const el = document.createElement('div');
    el.className = 'agent';
    el.style.setProperty('--c', r.c);
    el.innerHTML = `${ARROW}<span>${r.name}</span>`;
    layer.appendChild(el);
    gsap.set(el, { autoAlpha: 0, x: -100, y: -100 });
    return { el, ...r, busy: false, job: 0 };
  });
  let rr = 0;
  const pick = () => agents[rr++ % (narrow() ? 5 : agents.length)];

  const docRect = (target) => {
    const r = target.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
  };
  const labelFor = (target) => {
    if (target.dataset.agentLabel) return target.dataset.agentLabel;
    const cls = [...target.classList].find((c) => !['reveal', 'is-in', 'tile', 'wrap'].includes(c));
    return `<${target.tagName.toLowerCase()}>${cls ? ' .' + cls.split('__').pop() : ''}`;
  };

  // A dashed box with corner handles and a tag, drawn left to right, then faded out
  const blueprint = (target, agent, { hold = 0.6, draw = 0.35 } = {}) => {
    const r = docRect(target);
    const bp = document.createElement('div');
    bp.className = 'bp';
    bp.style.setProperty('--c', agent.c);
    bp.innerHTML = '<i></i><i></i><i></i><i></i><b></b>';
    bp.querySelector('b').textContent = labelFor(target);
    Object.assign(bp.style, { left: `${r.x - 6}px`, top: `${r.y - 6}px`, width: `${r.w + 12}px`, height: `${r.h + 12}px` });
    layer.appendChild(bp);
    return gsap.timeline({ onComplete: () => bp.remove() })
      .fromTo(bp, { clipPath: 'inset(0 100% 0 0)', autoAlpha: 1 }, { clipPath: 'inset(0 0% 0 0)', duration: draw, ease: 'power2.out' })
      .to(bp, { autoAlpha: 0, duration: 0.5, ease: 'power1.in' }, `+=${hold}`);
  };

  // Each new order bumps the agent's job id; stale exit orders check it and stand down
  const claim = (agent) => { agent.busy = true; return ++agent.job; };
  const fly = (agent, x, y, duration = 0.55) =>
    gsap.to(agent.el, { x, y, autoAlpha: 1, duration, ease: 'power3.inOut', overwrite: true });

  const leave = (agent, delay = 0) => {
    const job = agent.job;
    gsap.delayedCall(delay, () => {
      if (agent.job !== job) return;
      const vx = window.scrollX + (Math.random() < 0.5 ? -60 : window.innerWidth + 60);
      gsap.to(agent.el, {
        x: vx, y: `+=${gsap.utils.random(-120, 120)}`, autoAlpha: 0, duration: 0.9, ease: 'power2.in', overwrite: true,
        onComplete: () => { if (agent.job === job) agent.busy = false; },
      });
    });
  };

  // Points the agent at a spot inside the target so the box reads as "its" work
  const aimAt = (target) => {
    const r = docRect(target);
    return { x: r.x + r.w * gsap.utils.random(0.12, 0.6), y: r.y + Math.min(r.h * 0.55, 60) };
  };

  /* Sequence: agents swarm in, each target gets a blueprint then reveals. Resolves with elapsed seconds. */
  const build = (steps, { gap = 0.32 } = {}) => new Promise((resolve) => {
    const started = performance.now();
    const crew = agents.slice(0, narrow() ? 5 : agents.length);
    const hero = steps[0] && steps[0].el.closest('section');
    const area = hero ? docRect(hero) : { x: 0, y: window.scrollY, w: window.innerWidth, h: window.innerHeight };
    // Arrive from the bottom edge, scattered, like the scouting phase in the reel
    crew.forEach((a, i) => {
      claim(a);
      gsap.set(a.el, { x: area.x + area.w * (0.2 + 0.6 * Math.random()), y: area.y + area.h + 40, autoAlpha: 0 });
      fly(a, area.x + area.w * gsap.utils.random(0.1, 0.9), area.y + area.h * gsap.utils.random(0.25, 0.85), 0.7 + i * 0.05);
    });
    const tl = gsap.timeline({ delay: 0.45 });
    steps.forEach((step, i) => {
      const a = crew[i % crew.length];
      tl.add(() => {
        const p = aimAt(step.el);
        fly(a, p.x, p.y, 0.45);
        gsap.delayedCall(0.3, () => {
          blueprint(step.el, a, { hold: 0.5 });
          gsap.delayedCall(0.22, () => step.reveal());
        });
      }, i * gap);
    });
    // Idle crew keep "working" on the sculpture meanwhile
    const idle = crew.slice(steps.length);
    const stageStep = steps[steps.length - 1];
    if (stageStep) {
      idle.forEach((a, k) => tl.add(() => {
        const r = docRect(stageStep.el);
        fly(a, r.x + r.w * gsap.utils.random(0.2, 0.8), r.y + r.h * gsap.utils.random(0.2, 0.8), 0.6);
      }, 0.2 + k * 0.15));
    }
    tl.add(() => {
      const secs = (performance.now() - started) / 1000;
      crew.forEach((a, i) => leave(a, 0.4 + i * 0.06));
      resolve({ secs, count: crew.length });
    }, steps.length * gap + 0.7);
  });

  /* One agent drops in to build a single element as it scrolls into view */
  const touch = (target) => {
    if (!target || target.getBoundingClientRect().height < 32) return;
    const a = agents.find((x) => !x.busy) || pick();
    claim(a);
    const r = docRect(target);
    const fromLeft = Math.random() < 0.5;
    gsap.set(a.el, { x: fromLeft ? r.x - 80 : r.x + r.w + 40, y: r.y + r.h + 60, autoAlpha: 0 });
    const p = aimAt(target);
    fly(a, p.x, p.y, 0.5);
    gsap.delayedCall(0.35, () => blueprint(target, a, { hold: 0.35, draw: 0.3 }));
    leave(a, 1.1);
  };

  /* Finale: the crew orbits an element, then scatters */
  const ring = (target, seconds = 3.2) => {
    const crew = agents.slice(0, narrow() ? 5 : agents.length);
    const r = docRect(target);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const rx = r.w / 2 + 50, ry = r.h / 2 + 40;
    const state = { a: 0 };
    crew.forEach((ag, i) => {
      claim(ag);
      const t = (i / crew.length) * Math.PI * 2;
      gsap.set(ag.el, { x: cx + Math.cos(t) * rx * 2.2, y: cy + Math.sin(t) * ry * 2.2, autoAlpha: 0 });
      fly(ag, cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, 0.9);
    });
    gsap.to(state, {
      a: Math.PI * 1.25, duration: seconds, delay: 0.9, ease: 'sine.inOut',
      onUpdate: () => crew.forEach((ag, i) => {
        const t = (i / crew.length) * Math.PI * 2 + state.a;
        gsap.set(ag.el, { x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
      }),
      onComplete: () => crew.forEach((ag, i) => leave(ag, i * 0.05)),
    });
  };

  /* Status pill: live while building, then a summary with Replay */
  const pill = document.createElement('div');
  pill.className = 'build-pill';
  pill.innerHTML = '<span class="build-pill__dot"></span><span class="build-pill__text">Assembling…</span><button type="button" class="build-pill__btn" hidden>Replay</button>';
  document.body.appendChild(pill);
  const pillText = pill.querySelector('.build-pill__text');
  const pillBtn = pill.querySelector('.build-pill__btn');
  const status = (text, done) => {
    pillText.textContent = text;
    pill.classList.toggle('is-done', !!done);
    pillBtn.hidden = !done;
  };
  const onReplay = (fn) => pillBtn.addEventListener('click', fn);

  window.Agents = { build, touch, ring, status, onReplay, roster: ROSTER };
})();
