// Hero sculpture: a bronze arch, a dark monolith, a glass lens over a few words, all on a stone plinth.
// Idles gently, leans toward the pointer, and turns as the hero scrolls away (window.__heroProgress, set by main.js).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const stage = document.getElementById('hero-stage');
const canvas = document.getElementById('sculpture');
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;

const fallback = () => {
  stage.classList.add('is-fallback');
  canvas.remove();
};

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  fallback();
}

function cssColor(name, fallbackHex) {
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  const m = c.match(/\d+(\.\d+)?/g);
  return m ? new THREE.Color(`rgb(${m[0]},${m[1]},${m[2]})`) : new THREE.Color(fallbackHex);
}
const isDark = () => root.dataset.theme === 'dark' ||
  (!root.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);

// Dark granite with pale veins, drawn once into a canvas
function stoneTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#262628';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 26000; i++) {
    const v = Math.random();
    g.fillStyle = `rgba(${v > 0.5 ? '235,232,226' : '10,10,12'},${Math.random() * 0.12})`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 1.5, 1.5);
  }
  for (let i = 0; i < 9; i++) {
    g.strokeStyle = `rgba(230,226,218,${0.05 + Math.random() * 0.12})`;
    g.lineWidth = 0.6 + Math.random() * 1.6;
    g.beginPath();
    let x = Math.random() * c.width, y = Math.random() * c.height;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (Math.random() - 0.3) * 220; y += (Math.random() - 0.5) * 140;
      g.quadraticCurveTo(x - 60, y + (Math.random() - 0.5) * 80, x, y);
    }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// The name etched on the lens face
function wordsTexture() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 1280;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = '#151518'; // the lens reads bright in both themes, so the text stays dark
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = '500 290px "Playfair Display", "Times New Roman", serif';
  g.fillText('Đinh Công', 1024, 590);
  g.font = 'italic 500 290px "Playfair Display", "Times New Roman", serif';
  g.fillText('Thái', 1024, 900);
  g.font = '400 60px "Geist Mono", ui-monospace, monospace';
  g.globalAlpha = 0.6;
  g.fillText('A I   E N G I N E E R', 1024, 1070);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function init() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const lookAt = new THREE.Vector3(0.15, 0.1, 0);
  let baseZ = 11.5;

  const sculpture = new THREE.Group();
  scene.add(sculpture);

  // Materials
  const bronze = new THREE.MeshPhysicalMaterial({ color: 0x9b8b78, metalness: 1, roughness: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  const darkMetal = new THREE.MeshPhysicalMaterial({ color: 0x232325, metalness: 0.85, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1, thickness: 0.8, ior: 1.52,
    clearcoat: 1, clearcoatRoughness: 0.04, specularIntensity: 1,
    attenuationColor: cssColor('--accent', '#2747d0'), attenuationDistance: 4,
  });
  const stone = new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.58, metalness: 0.05 });

  // Arch: a thick extruded ring segment, open toward the lower left
  const R = 2.3, r = 1.66, a0 = -0.38 * Math.PI, a1 = 1.06 * Math.PI;
  const ring = new THREE.Shape();
  ring.absarc(0, 0, R, a0, a1, false);
  ring.absarc(0, 0, r, a1, a0, true);
  ring.closePath();
  const archGeo = new THREE.ExtrudeGeometry(ring, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: 8, curveSegments: 180 });
  archGeo.center();
  const arch = new THREE.Mesh(archGeo, bronze);
  arch.position.set(-0.2, 0.62, -0.55);
  arch.rotation.y = -0.32;
  arch.castShadow = true; arch.receiveShadow = true;
  sculpture.add(arch);

  // Monolith
  const slab = new THREE.Mesh(new RoundedBoxGeometry(0.9, 4.9, 0.62, 6, 0.08), darkMetal);
  slab.position.set(1.5, 0.62, -1.15);
  slab.rotation.y = -0.28;
  slab.castShadow = true; slab.receiveShadow = true;
  sculpture.add(slab);

  // Plinth
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(3.1, 1.0, 1.9, 6, 0.06), stone);
  plinth.position.set(0.15, -1.7, 0.05);
  plinth.rotation.y = -0.18;
  plinth.castShadow = true; plinth.receiveShadow = true;
  sculpture.add(plinth);

  // Lens with a bronze rim, floating in front of the words
  const lens = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.24, 128, 1), glass);
  disc.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.09, 0.035, 24, 160), bronze);
  lens.add(disc, rim);
  lens.position.set(0.05, 0.28, 0.55);
  sculpture.add(lens);

  const words = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.125),
    new THREE.MeshBasicMaterial({ map: wordsTexture(), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false })
  );
  words.position.set(0.06, 0, 0.125);
  lens.add(words);

  // Ground: soft shadow only
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.22 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2.2;
  ground.receiveShadow = true;
  sculpture.add(ground);

  // Lights: warm key with shadows, cool rim from behind
  const key = new THREE.DirectionalLight(0xffe6c8, 2.6);
  key.position.set(-2.5, 8, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 });
  key.shadow.bias = -0.0004;
  key.shadow.radius = 14;
  key.shadow.blurSamples = 20;
  const rimLight = new THREE.DirectionalLight(0xa8b7ff, 1.4);
  rimLight.position.set(5, 3, -5);
  scene.add(key, rimLight, new THREE.HemisphereLight(0xffffff, 0x444444, 0.25));

  const applyTheme = () => {
    const dark = isDark();
    renderer.toneMappingExposure = dark ? 1.15 : 1.0;
    rimLight.intensity = dark ? 2.6 : 1.4;
    ground.material.opacity = dark ? 0.45 : 0.22;
    glass.attenuationColor = cssColor('--accent', '#2747d0');
    words.material.map = wordsTexture();
    words.material.needsUpdate = true;
    requestRender();
  };

  // Size: keep the whole sculpture in frame on narrow stages
  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // portrait stages need the camera further back to keep the arch in frame
    baseZ = camera.aspect < 0.8 ? 11.5 * (0.99 / camera.aspect) : 11.5;
    camera.updateProjectionMatrix();
    requestRender();
  };

  // Pointer lean (pointer only, no scroll listeners)
  const pointer = { x: 0, y: 0 };
  const lean = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
    pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  const clock = new THREE.Clock();
  let running = false, raf = 0, pending = false;
  const frame = () => {
    const t = clock.getElapsedTime();
    const p = Math.min(1, Math.max(0, window.__heroProgress || 0));
    const intro = reduce ? 1 : Math.min(1, t / 1.8);
    const ease = 1 - Math.pow(1 - intro, 3);

    lean.x += (pointer.x - lean.x) * 0.05;
    lean.y += (pointer.y - lean.y) * 0.05;

    sculpture.rotation.y = -0.12 + lean.x * 0.22 + p * 0.7 + (1 - ease) * -0.5;
    sculpture.rotation.x = lean.y * 0.05;
    sculpture.position.y = (1 - ease) * -0.6;
    sculpture.scale.setScalar(0.92 + ease * 0.08);

    if (!reduce) {
      lens.rotation.y = Math.sin(t * 0.45) * 0.38;
      lens.rotation.x = Math.sin(t * 0.3) * 0.08;
      lens.position.y = 0.28 + Math.sin(t * 0.9) * 0.07;
    }

    camera.position.set(0.35 + lean.x * 0.25, 0.85 - p * 0.5, baseZ + p * 1.6);
    camera.lookAt(lookAt);
    renderer.render(scene, camera);
  };
  const loop = () => { frame(); raf = requestAnimationFrame(loop); };
  const start = () => {
    if (reduce) { requestRender(); return; }
    if (running) return;
    running = true; clock.start(); raf = requestAnimationFrame(loop);
  };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  function requestRender() {
    if (running || pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; frame(); });
  }

  resize();
  applyTheme();
  new ResizeObserver(resize).observe(stage);
  new MutationObserver(applyTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())).observe(stage);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  // Redraw the name once its fonts have loaded
  if (document.fonts) {
    Promise.all([
      document.fonts.load('500 100px "Playfair Display"', 'Đinh Công'),
      document.fonts.load('italic 500 100px "Playfair Display"', 'Thái'),
      document.fonts.load('400 40px "Geist Mono"', 'AI'),
    ]).catch(() => {}).then(() => { words.material.map = wordsTexture(); words.material.needsUpdate = true; requestRender(); });
  }
  start();
}

if (renderer) init();
