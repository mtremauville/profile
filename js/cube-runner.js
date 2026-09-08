// ── Pixel Perfect — 3D cube path-following speedrun (Three.js) ──
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const TILE = 2;
const THICK = 0.4;
const CUBE_SIZE = TILE * 0.55;
const TURN_WINDOW = 1.0; // tiles before a corner where a keypress instantly commits the turn

function gameLang() { return localStorage.getItem('lang') || 'fr'; }
function isDarkTheme() { return document.documentElement.getAttribute('data-theme') !== 'light'; }

const STR = {
  fr: {
    ready: 'Prêt ?',
    readyHint: 'Utilise ← / → (ou Q / D, ou les boutons tactiles) pour tourner aux virages.',
    startBtn: 'Démarrer',
    fallTitle: 'Raté !',
    fallText: (t) => `Tu es tombé après ${t.toFixed(2)}s.`,
    retryBtn: 'Réessayer',
    winTitle: 'Terminé !',
    winText: (t) => `Temps : ${t.toFixed(2)}s`,
    newRecord: 'Nouveau record !',
    replayBtn: 'Rejouer',
    bestPrefix: 'Record : ',
  },
  en: {
    ready: 'Ready?',
    readyHint: 'Use ← / → (or A / D, or the touch buttons) to turn at the corners.',
    startBtn: 'Start',
    fallTitle: 'Missed!',
    fallText: (t) => `You fell after ${t.toFixed(2)}s.`,
    retryBtn: 'Retry',
    winTitle: 'Finished!',
    winText: (t) => `Time: ${t.toFixed(2)}s`,
    newRecord: 'New record!',
    replayBtn: 'Play again',
    bestPrefix: 'Best: ',
  },
};
function t() { return STR[gameLang() === 'en' ? 'en' : 'fr']; }

// ── Levels ──
function buildLevelPath(steps) {
  const D = { N: { x: 0, z: 1 }, S: { x: 0, z: -1 }, E: { x: 1, z: 0 }, W: { x: -1, z: 0 } };
  let cur = { x: 0, z: 0 };
  const path = [{ ...cur }];
  steps.forEach(({ dir, count }) => {
    for (let i = 0; i < count; i++) {
      cur = { x: cur.x + D[dir].x, z: cur.z + D[dir].z };
      path.push({ ...cur });
    }
  });
  return path;
}

const LEVELS = [
  { name: 'easy', speed: 2.0, steps: [{ dir: 'N', count: 5 }, { dir: 'E', count: 4 }, { dir: 'N', count: 5 }] },
  { name: 'medium', speed: 3.6, steps: [{ dir: 'N', count: 3 }, { dir: 'E', count: 3 }, { dir: 'N', count: 3 }, { dir: 'W', count: 2 }, { dir: 'N', count: 4 }, { dir: 'E', count: 5 }] },
  { name: 'hard', speed: 4.4, steps: [{ dir: 'N', count: 2 }, { dir: 'E', count: 2 }, { dir: 'N', count: 2 }, { dir: 'W', count: 2 }, { dir: 'N', count: 2 }, { dir: 'E', count: 2 }, { dir: 'N', count: 2 }, { dir: 'W', count: 2 }, { dir: 'N', count: 3 }, { dir: 'E', count: 4 }] },
];
LEVELS.forEach(lvl => { lvl.path = buildLevelPath(lvl.steps); });

function dirBetween(a, b) { return { x: b.x - a.x, z: b.z - a.z }; }
// Camera looks along currentDir with world +Y up; for THREE's lookAt basis,
// the on-screen "right" direction works out to cross(forwardDir, worldUp),
// i.e. (-d.z, d.x) here — matched empirically against the rendered view.
function turnRight(d) { return { x: -d.z, z: d.x }; }
function turnLeft(d) { return { x: d.z, z: -d.x }; }
function sameDir(a, b) { return a.x === b.x && a.z === b.z; }

function initCubeRunner() {
  const wrap = document.getElementById('cube-canvas-wrap');
  const canvas = document.getElementById('cube-canvas');
  if (!canvas) return;

  const overlayEl = document.getElementById('cube-overlay');
  const overlayTitleEl = overlayEl.querySelector('.cube-overlay-title');
  const overlayTextEl = overlayEl.querySelector('.cube-overlay-text');
  const startBtn = document.getElementById('cube-start-btn');
  const hudTimeEl = document.getElementById('cube-hud-time');
  const hudBestEl = document.getElementById('cube-hud-best');
  const levelBtns = Array.from(document.querySelectorAll('.cube-level-btn'));
  const touchLeftBtn = document.getElementById('cube-touch-left');
  const touchRightBtn = document.getElementById('cube-touch-right');

  // ── Three.js setup ──
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

  function refreshThemeColors() {
    scene.background = new THREE.Color(isDarkTheme() ? 0x0a0f1e : 0xf3f0ff);
    scene.fog = new THREE.Fog(scene.background.getHex(), 14, 36);
  }
  refreshThemeColors();

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(5, 10, 6);
  scene.add(dirLight);

  const cubeGeo = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const cubeMat = new THREE.MeshStandardMaterial({ color: 0x64ffda });
  const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
  scene.add(cubeMesh);

  let tileGroup = new THREE.Group();
  scene.add(tileGroup);

  function buildTiles(path) {
    scene.remove(tileGroup);
    tileGroup = new THREE.Group();
    const tileGeo = new THREE.BoxGeometry(TILE * 0.92, THICK, TILE * 0.92);
    path.forEach((p, i) => {
      let color = 0x2b3a55;
      if (i === 0) color = 0x4ade80;
      else if (i === path.length - 1) color = 0xa78bfa;
      else {
        const prev = path[i - 1], next = path[i + 1];
        const dPrev = dirBetween(prev, p);
        const dNext = dirBetween(p, next);
        if (!sameDir(dPrev, dNext)) color = 0xfbbf24;
      }
      const mesh = new THREE.Mesh(tileGeo, new THREE.MeshStandardMaterial({ color }));
      mesh.position.set(p.x * TILE, 0, p.z * TILE);
      tileGroup.add(mesh);
    });
    scene.add(tileGroup);
  }

  // ── Input ──
  const LEFT_KEYS = ['ArrowLeft', 'a', 'A', 'q', 'Q']; // q = AZERTY equivalent of the QWERTY "a" position
  const RIGHT_KEYS = ['ArrowRight', 'd', 'D'];
  let heldTurn = null;
  window.addEventListener('keydown', (e) => {
    if (LEFT_KEYS.includes(e.key)) { e.preventDefault(); heldTurn = 'left'; }
    else if (RIGHT_KEYS.includes(e.key)) { e.preventDefault(); heldTurn = 'right'; }
  });
  window.addEventListener('keyup', (e) => {
    if (LEFT_KEYS.includes(e.key) && heldTurn === 'left') heldTurn = null;
    if (RIGHT_KEYS.includes(e.key) && heldTurn === 'right') heldTurn = null;
  });
  function bindTouch(btn, dir) {
    const set = (e) => { e.preventDefault(); heldTurn = dir; };
    const clear = () => { if (heldTurn === dir) heldTurn = null; };
    btn.addEventListener('pointerdown', set);
    btn.addEventListener('pointerup', clear);
    btn.addEventListener('pointerleave', clear);
    btn.addEventListener('pointercancel', clear);
  }
  bindTouch(touchLeftBtn, 'left');
  bindTouch(touchRightBtn, 'right');

  // ── Game state ──
  let currentLevelIdx = 0;
  let idx = 0;
  let pos = { x: 0, z: 0 };
  let currentDir = { x: 0, z: 1 };
  let derailed = false;
  let derailedFrom = null;
  let state = 'ready'; // ready | playing | fallen | won
  let fallVelocity = 0;
  let startTimeMs = 0;
  let finalTimeSec = 0;

  function updateHudBest() {
    const key = 'cube-runner-best-' + LEVELS[currentLevelIdx].name;
    const best = parseFloat(localStorage.getItem(key));
    hudBestEl.textContent = isNaN(best) ? '' : t().bestPrefix + best.toFixed(2) + 's';
  }

  function showOverlay(kind, isRecord) {
    overlayEl.classList.remove('hidden');
    overlayTitleEl.classList.remove('success', 'fail');
    if (kind === 'ready') {
      overlayTitleEl.textContent = t().ready;
      overlayTextEl.textContent = t().readyHint;
      startBtn.textContent = t().startBtn;
    } else if (kind === 'fallen') {
      overlayTitleEl.textContent = t().fallTitle;
      overlayTitleEl.classList.add('fail');
      overlayTextEl.textContent = t().fallText(finalTimeSec);
      startBtn.textContent = t().retryBtn;
    } else if (kind === 'won') {
      overlayTitleEl.textContent = t().winTitle;
      overlayTitleEl.classList.add('success');
      overlayTextEl.textContent = t().winText(finalTimeSec) + (isRecord ? ' — ' + t().newRecord : '');
      startBtn.textContent = t().replayBtn;
    }
  }
  function hideOverlay() { overlayEl.classList.add('hidden'); }

  function loadLevel(i) {
    currentLevelIdx = i;
    const lvl = LEVELS[i];
    buildTiles(lvl.path);
    idx = 0;
    pos = { x: lvl.path[0].x, z: lvl.path[0].z };
    currentDir = dirBetween(lvl.path[0], lvl.path[1]);
    derailed = false;
    derailedFrom = null;
    fallVelocity = 0;
    state = 'ready';
    cubeMesh.position.set(pos.x * TILE, CUBE_SIZE / 2 + THICK / 2, pos.z * TILE);
    cubeMesh.rotation.set(0, 0, 0);
    updateHudBest();
    hudTimeEl.textContent = '0.00s';
    showOverlay('ready');
  }

  function startRun() {
    state = 'playing';
    startTimeMs = performance.now();
    hideOverlay();
  }

  function triggerFall() {
    state = 'fallen';
    finalTimeSec = (performance.now() - startTimeMs) / 1000;
    showOverlay('fallen');
  }

  function triggerWin() {
    const lvl = LEVELS[currentLevelIdx];
    const last = lvl.path[lvl.path.length - 1];
    pos = { x: last.x, z: last.z };
    state = 'won';
    finalTimeSec = (performance.now() - startTimeMs) / 1000;
    const key = 'cube-runner-best-' + lvl.name;
    const prevBest = parseFloat(localStorage.getItem(key));
    let isRecord = false;
    if (isNaN(prevBest) || finalTimeSec < prevBest) {
      localStorage.setItem(key, String(finalTimeSec));
      isRecord = true;
    }
    updateHudBest();
    showOverlay('won', isRecord);
  }

  function handleOverlayButtonClick() {
    if (state === 'ready') startRun();
    else { loadLevel(currentLevelIdx); startRun(); }
  }
  startBtn.addEventListener('click', handleOverlayButtonClick);

  levelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      levelBtns.forEach(b => b.classList.toggle('active', b === btn));
      loadLevel(parseInt(btn.dataset.level, 10));
    });
  });

  // ── Camera ──
  const CAM_DIST = 5, CAM_HEIGHT = 3.2, LOOK_AHEAD = 3;
  function updateCamera(dirVec3) {
    const behind = dirVec3.clone().multiplyScalar(-CAM_DIST);
    const desired = cubeMesh.position.clone().add(behind).add(new THREE.Vector3(0, CAM_HEIGHT, 0));
    camera.position.lerp(desired, 0.12);
    const lookTarget = cubeMesh.position.clone().add(dirVec3.clone().multiplyScalar(LOOK_AHEAD));
    camera.lookAt(lookTarget);
  }

  // ── Resize ──
  function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(wrap);
  resize();

  // ── Main loop ──
  let lastT = performance.now();
  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    if (state === 'playing') {
      const lvl = LEVELS[currentLevelIdx];
      const speed = lvl.speed;

      if (!derailed) {
        pos.x += currentDir.x * speed * dt;
        pos.z += currentDir.z * speed * dt;

        let target = lvl.path[idx + 1];
        let remaining = (target.x - pos.x) * currentDir.x + (target.z - pos.z) * currentDir.z;

        // Respond to a turn key the instant it's pressed, as soon as we're within
        // reach of the corner — instead of only checking once at the exact pivot
        // frame, which made the controls feel laggy/unforgiving.
        if (idx + 1 < lvl.path.length - 1 && remaining <= TURN_WINDOW) {
          const nextTarget = lvl.path[idx + 2];
          const nextDir = dirBetween(target, nextTarget);
          if (!sameDir(nextDir, currentDir)) {
            const r = turnRight(currentDir), l = turnLeft(currentDir);
            if ((heldTurn === 'right' && sameDir(r, nextDir)) || (heldTurn === 'left' && sameDir(l, nextDir))) {
              pos = { x: target.x, z: target.z };
              currentDir = nextDir;
              idx++;
              target = lvl.path[idx + 1];
              remaining = (target.x - pos.x) * currentDir.x + (target.z - pos.z) * currentDir.z;
            }
          }
        }

        if (remaining <= 0) {
          pos = { x: target.x, z: target.z };
          if (idx + 1 === lvl.path.length - 1) {
            triggerWin();
          } else {
            const nextTarget = lvl.path[idx + 2];
            const nextDir = dirBetween(target, nextTarget);
            if (sameDir(nextDir, currentDir)) {
              idx++;
            } else {
              const r = turnRight(currentDir), l = turnLeft(currentDir);
              if (heldTurn === 'right' && sameDir(r, nextDir)) { currentDir = nextDir; idx++; }
              else if (heldTurn === 'left' && sameDir(l, nextDir)) { currentDir = nextDir; idx++; }
              else { derailed = true; derailedFrom = { x: target.x, z: target.z }; }
            }
          }
        }
      } else {
        pos.x += currentDir.x * speed * dt;
        pos.z += currentDir.z * speed * dt;
        const traveled = (pos.x - derailedFrom.x) * currentDir.x + (pos.z - derailedFrom.z) * currentDir.z;
        if (traveled >= 1.0) triggerFall();
      }

      cubeMesh.position.x = pos.x * TILE;
      cubeMesh.position.z = pos.z * TILE;
      hudTimeEl.textContent = ((now - startTimeMs) / 1000).toFixed(2) + 's';
    }

    if (state === 'fallen') {
      fallVelocity += 9.8 * dt;
      cubeMesh.position.y -= fallVelocity * dt;
      cubeMesh.rotation.x += dt * 2.2;
      cubeMesh.rotation.z += dt * 1.3;
    }

    const dirVec3 = new THREE.Vector3(currentDir.x, 0, currentDir.z).normalize();
    updateCamera(dirVec3);

    renderer.render(scene, camera);
  }

  // ── Theme / language reactivity ──
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    setTimeout(refreshThemeColors, 0);
  });
  document.getElementById('lang-toggle')?.addEventListener('click', () => {
    updateHudBest();
    if (!overlayEl.classList.contains('hidden')) {
      showOverlay(state === 'fallen' ? 'fallen' : state === 'won' ? 'won' : 'ready');
    }
  });

  loadLevel(0);
  requestAnimationFrame(animate);
}

initCubeRunner();
