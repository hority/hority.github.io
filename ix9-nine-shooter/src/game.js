import * as THREE from 'three';
import { PositionFollowCameraRig } from '../gameblocks/modules/camera/PositionFollowCameraRig.js';
import { DEFAULT_WORLD_BASIS } from '../gameblocks/modules/math/WorldBasis.js';
import { RandomGenerator } from '../gameblocks/modules/math/RandomUtils.js';
import { clamp, lerp, smoothToward } from '../gameblocks/modules/math/ScalarUtils.js';
import { UiStateModel } from '../gameblocks/modules/user-interface/UiStateModel.js';
import { DomHudRenderer } from '../gameblocks/modules/user-interface/DomHudRenderer.js';
import { disposeObject3D } from '../gameblocks/modules/world/Object3DUtils.js';

const canvas = document.querySelector('#gameCanvas');
const app = document.querySelector('#app');
const startOverlay = document.querySelector('#startOverlay');
const gameOverOverlay = document.querySelector('#gameOverOverlay');
const startButton = document.querySelector('#startButton');
const restartButton = document.querySelector('#restartButton');

const LANES = [-2.5, 0, 2.5];
const STORAGE_KEY = 'ix9-nine-shooter-best';
const WORLD_SEED = (Date.now() ^ 0x19d9) >>> 0;

function readBestScore() {
  const value = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(value) ? value : 0;
}

function writeBestScore(score) {
  localStorage.setItem(STORAGE_KEY, String(score));
}

const ui = new UiStateModel({
  score: 0,
  best: readBestScore(),
  hp: 9,
  combo: 0,
  comboMax: 9,
  message: '照準を動かして自動連射',
  messageVisible: false,
  finalScore: 0,
  finalBest: readBestScore(),
}, true);

new DomHudRenderer(ui)
  .bindText('[data-ui="score"]', 'score')
  .bindText('[data-ui="best"]', 'best')
  .bindText('[data-ui="hp"]', 'hp')
  .bindText('[data-ui="combo"]', 'combo')
  .bindStyleWidth('[data-ui="comboFill"]', 'combo', 'comboMax')
  .bindText('[data-ui="message"]', 'message')
  .bindClassToggle('.toast', 'messageVisible', 'is-visible')
  .bindText('[data-ui="finalScore"]', 'finalScore')
  .bindText('[data-ui="finalBest"]', 'finalBest')
  .attach();

function showToast(text, duration = 900) {
  ui.patch({ message: text, messageVisible: true });
  clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    ui.patch({ messageVisible: false });
  }, duration);
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function makeCanvasTexture(draw, width = 512, height = width) {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = width;
  textureCanvas.height = height;
  const ctx = textureCanvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeTargetTexture(symbol = '9', accent = '#cf3c32') {
  return makeCanvasTexture((ctx, size) => {
    const center = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#f8f1df';
    ctx.beginPath();
    ctx.arc(center, center, size * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#1f66a7';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(center, center, size * 0.39, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(center - size * 0.28, center);
    ctx.lineTo(center + size * 0.28, center);
    ctx.moveTo(center, center - size * 0.28);
    ctx.lineTo(center, center + size * 0.28);
    ctx.stroke();

    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2;
      const x = center + Math.cos(angle) * size * 0.28;
      const y = center + Math.sin(angle) * size * 0.28;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? '#e2b34a' : '#1f66a7';
      ctx.fill();
    }

    ctx.fillStyle = '#102f68';
    ctx.font = `900 ${Math.round(size * 0.34)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, center, center + size * 0.02);
  });
}

function makeLabelTexture(text, options = {}) {
  const {
    width = 640,
    height = 180,
    fill = '#fff8e3',
    textColor = '#10272f',
    borderColor = '#e2b34a',
    fontSize = 60,
  } = options;
  return makeCanvasTexture((ctx) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = fill;
    roundRect(ctx, 16, 18, width - 32, height - 36, 28);
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.font = `900 ${fontSize}px "Hiragino Sans", Meiryo, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2 + 4);
  }, width, height);
}

function makeTextSprite(text, options = {}) {
  const texture = makeLabelTexture(text, options);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(options.scaleX ?? 1.8, options.scaleY ?? 0.48, 1);
  return sprite;
}

class NineShooterGame {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#071316');
    this.scene.fog = new THREE.Fog('#071316', 22, 78);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 95);
    this.basis = DEFAULT_WORLD_BASIS;
    this.cameraRig = new PositionFollowCameraRig({
      azimuth: 0,
      distance: 9.4,
      height: 5.75,
      lookHeight: 0.9,
      positionLag: 0.05,
      lookLag: 0.08,
      basis: this.basis,
    });

    this.rng = new RandomGenerator(WORLD_SEED);
    this.enemies = [];
    this.bullets = [];
    this.effects = [];
    this.roadTiles = [];
    this.sideProps = [];

    this.makeMaterials();
    this.makeScene();
    this.addEvents();
    this.resize();
    this.reset();
  }

  makeMaterials() {
    this.materials = {
      porcelain: new THREE.MeshStandardMaterial({ color: '#f8f1df', roughness: 0.58, metalness: 0.04 }),
      porcelainWarm: new THREE.MeshStandardMaterial({ color: '#ead9b7', roughness: 0.7 }),
      cobalt: new THREE.MeshStandardMaterial({ color: '#1f66a7', roughness: 0.55 }),
      red: new THREE.MeshStandardMaterial({ color: '#cf3c32', roughness: 0.55 }),
      gold: new THREE.MeshStandardMaterial({ color: '#e2b34a', roughness: 0.34, metalness: 0.4 }),
      cyan: new THREE.MeshStandardMaterial({ color: '#57c2c6', roughness: 0.35, metalness: 0.22, emissive: '#10363a' }),
      ink: new THREE.MeshStandardMaterial({ color: '#10272f', roughness: 0.62 }),
      skin: new THREE.MeshStandardMaterial({ color: '#f3c7a6', roughness: 0.72 }),
      hair: new THREE.MeshStandardMaterial({ color: '#2a1a16', roughness: 0.78 }),
      enemy: new THREE.MeshStandardMaterial({ color: '#23363b', roughness: 0.7, metalness: 0.06 }),
      shadow: new THREE.MeshBasicMaterial({ color: '#001112', transparent: true, opacity: 0.28, depthWrite: false }),
      beam: new THREE.MeshBasicMaterial({ color: '#74ffff' }),
    };

    this.textures = {
      target9: makeTargetTexture('9', '#cf3c32'),
      targetIx: makeTargetTexture('IX', '#e2b34a'),
    };
  }

  makeScene() {
    const hemi = new THREE.HemisphereLight('#f9f5e8', '#16313a', 2.15);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight('#fff3d2', 2.75);
    key.position.set(-4, 8, 6);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight('#57c2c6', 1.6);
    rim.position.set(4, 4, -8);
    this.scene.add(rim);

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.makeRoad();
    this.makeSideProps();
    this.makeBackdrop();

    this.playerGroup = this.makeMarieTurret();
    this.scene.add(this.playerGroup);

    this.crosshair = this.makeCrosshair();
    this.crosshair.position.set(0, 0.08, -8.5);
    this.scene.add(this.crosshair);

    this.playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.58, 36),
      this.materials.shadow
    );
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.y = 0.018;
    this.scene.add(this.playerShadow);
  }

  makeRoad() {
    this.tileLength = 5.4;
    for (let i = 0; i < 20; i += 1) {
      const tile = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.PlaneGeometry(6.2, this.tileLength),
        i % 2 === 0 ? this.materials.porcelain : this.materials.porcelainWarm
      );
      base.rotation.x = -Math.PI / 2;
      tile.add(base);

      [-3.1, 3.1].forEach((x) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, this.tileLength * 0.94), this.materials.cobalt);
        rail.position.set(x, 0.04, 0);
        tile.add(rail);
      });

      [-1.25, 1.25].forEach((x) => {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.032, this.tileLength * 0.52), this.materials.red);
        line.position.set(x, 0.045, 0);
        tile.add(line);
      });

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.025, 8, 48),
        i % 4 === 0 ? this.materials.gold : this.materials.cobalt
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0.07, 0);
      tile.add(ring);

      tile.position.z = 5 - i * this.tileLength;
      this.world.add(tile);
      this.roadTiles.push(tile);
    }
  }

  makeSideProps() {
    for (let i = 0; i < 20; i += 1) {
      const pair = new THREE.Group();
      [-1, 1].forEach((side) => {
        const x = side * 4.35;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 1.25, 8), this.materials.ink);
        pole.position.set(x, 0.62, 0);
        pair.add(pole);

        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), this.materials.gold);
        orb.position.set(x, 1.3, 0);
        pair.add(orb);

        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.0, 8), this.materials.cyan);
        antenna.rotation.z = side * 0.35;
        antenna.position.set(x - side * 0.32, 1.68, 0);
        pair.add(antenna);
      });
      pair.position.z = 3 - i * 6.1;
      this.world.add(pair);
      this.sideProps.push(pair);
    }
  }

  makeBackdrop() {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#173c45', roughness: 0.9 });
    for (let i = 0; i < 9; i += 1) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.0 + (i % 3) * 0.36, 1.0 + (i % 2) * 0.55, 1.0), mat);
      block.position.set((i - 4) * 1.2, 0.55, -54 - (i % 3) * 3);
      block.rotation.y = i % 2 ? 0.16 : -0.16;
      group.add(block);
    }
    this.scene.add(group);
  }

  makeMarieTurret() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.96, 24), this.materials.porcelain);
    body.position.y = 0.72;
    group.add(body);

    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.14, 0.1), this.materials.red);
    sash.position.set(0, 0.69, 0.43);
    group.add(sash);

    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.25),
      new THREE.MeshBasicMaterial({
        map: makeLabelTexture('IX', {
          width: 260,
          height: 150,
          fontSize: 86,
          fill: '#f8f1df',
          textColor: '#193f79',
          borderColor: '#cf3c32',
        }),
        transparent: true,
      })
    );
    badge.position.set(0, 0.86, 0.49);
    group.add(badge);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 24, 18), this.materials.skin);
    head.position.y = 1.36;
    group.add(head);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 14), this.materials.hair);
    hair.scale.set(1.05, 0.82, 0.92);
    hair.position.set(0, 1.46, -0.04);
    group.add(hair);

    [-0.11, 0.11].forEach((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 8), this.materials.ink);
      eye.position.set(x, 1.39, 0.325);
      group.add(eye);
    });

    const cannon = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.05, 18), this.materials.cyan);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.98, -0.5);
    cannon.add(barrel);
    const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 32), this.materials.gold);
    muzzle.position.set(0, 0.98, -1.04);
    cannon.add(muzzle);
    group.add(cannon);
    this.cannon = cannon;

    const label = makeTextSprite('九伊万里絵', {
      width: 620,
      height: 170,
      fontSize: 64,
      scaleX: 1.85,
      scaleY: 0.52,
      fill: '#fff8e3',
      textColor: '#10272f',
      borderColor: '#57c2c6',
    });
    label.position.set(0, 1.98, 0.05);
    group.add(label);

    return group;
  }

  makeCrosshair() {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 8, 64), this.materials.cyan);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const h = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.025, 0.025), this.materials.gold);
    h.position.y = 0.02;
    group.add(h);
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 1.45), this.materials.gold);
    v.position.y = 0.02;
    group.add(v);
    return group;
  }

  addEvents() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => window.setTimeout(() => this.resize(), 80));

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.running = false;
      showToast('WebGL再接続中', 1600);
    });
    canvas.addEventListener('webglcontextrestored', () => window.location.reload());

    app.addEventListener('pointerdown', (event) => {
      if (event.target instanceof HTMLButtonElement) return;
      this.onPointerDown(event);
    }, { passive: false });
    app.addEventListener('pointermove', (event) => this.onPointerMove(event), { passive: false });
    app.addEventListener('pointerup', (event) => this.onPointerUp(event), { passive: false });
    app.addEventListener('pointercancel', (event) => this.onPointerUp(event), { passive: false });

    window.addEventListener('keydown', (event) => {
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.keyAxis = -1;
      if (event.code === 'ArrowRight' || event.code === 'KeyD') this.keyAxis = 1;
      if ((event.code === 'Space' || event.code === 'Enter') && !this.running && !this.dead) {
        event.preventDefault();
        startGame();
      }
    });
    window.addEventListener('keyup', (event) => {
      if ((event.code === 'ArrowLeft' || event.code === 'KeyA') && this.keyAxis < 0) this.keyAxis = 0;
      if ((event.code === 'ArrowRight' || event.code === 'KeyD') && this.keyAxis > 0) this.keyAxis = 0;
    });

    document.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  }

  resize() {
    const width = Math.max(1, app.clientWidth);
    const height = Math.max(1, app.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  reset() {
    this.enemies.forEach((enemy) => disposeObject3D(enemy.group));
    this.bullets.forEach((bullet) => disposeObject3D(bullet.group));
    this.effects.forEach((effect) => disposeObject3D(effect.group));
    this.enemies = [];
    this.bullets = [];
    this.effects = [];

    this.running = false;
    this.dead = false;
    this.score = 0;
    this.combo = 0;
    this.hp = 9;
    this.level = 1;
    this.enemySpeed = 4.6;
    this.spawnClock = 1.0;
    this.fireClock = 0.3;
    this.waveIndex = 0;
    this.playerX = 0;
    this.playerTargetX = 0;
    this.keyAxis = 0;
    this.pointerId = null;
    this.clockSeconds = 0;
    this.shake = 0;

    this.roadTiles.forEach((tile, i) => {
      tile.position.z = 5 - i * this.tileLength;
    });
    this.sideProps.forEach((prop, i) => {
      prop.position.z = 3 - i * 6.1;
    });
    this.updatePlayerPose(1 / 60);
    this.patchUi();
  }

  start() {
    if (this.dead) this.reset();
    this.running = true;
    this.dead = false;
    showToast('IXビーム起動', 850);
  }

  patchUi() {
    ui.patch({
      score: this.score,
      best: Math.max(readBestScore(), this.score),
      hp: this.hp,
      combo: this.combo,
    });
  }

  onPointerDown(event) {
    event.preventDefault();
    if (this.dead) return;
    if (!this.running && startOverlay.hidden) this.start();
    this.pointerId = event.pointerId;
    app.setPointerCapture?.(event.pointerId);
    this.setTargetFromClientX(event.clientX);
  }

  onPointerMove(event) {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    this.setTargetFromClientX(event.clientX);
  }

  onPointerUp(event) {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    this.pointerId = null;
    app.releasePointerCapture?.(event.pointerId);
  }

  setTargetFromClientX(clientX) {
    const rect = app.getBoundingClientRect();
    const normalized = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    this.playerTargetX = lerp(-3, 3, normalized);
  }

  update(deltaSeconds) {
    const dt = clamp(deltaSeconds, 0, 1 / 30);
    this.clockSeconds += dt;
    this.shake = Math.max(0, this.shake - dt * 2.7);

    if (this.running) {
      if (this.keyAxis !== 0) {
        this.playerTargetX = clamp(this.playerTargetX + this.keyAxis * dt * 5.8, -3, 3);
      }
      this.playerX = smoothToward(this.playerX, this.playerTargetX, 0.075, dt);
      this.updateWorldMotion(dt);
      this.updateSpawning(dt);
      this.updateFiring(dt);
      this.updateBullets(dt);
      this.updateEnemies(dt);
    } else {
      this.playerTargetX = smoothToward(this.playerTargetX, 0, 0.8, dt);
      this.playerX = smoothToward(this.playerX, this.playerTargetX, 0.18, dt);
    }

    this.updatePlayerPose(dt);
    this.updateEffects(dt);
    this.updateCamera(dt);
  }

  updateWorldMotion(dt) {
    const travel = (3.2 + this.level * 0.22) * dt;
    const tileLoop = this.tileLength * this.roadTiles.length;
    this.roadTiles.forEach((tile) => {
      tile.position.z += travel;
      if (tile.position.z > 8) tile.position.z -= tileLoop;
    });

    const propLoop = 6.1 * this.sideProps.length;
    this.sideProps.forEach((prop, index) => {
      prop.position.z += travel;
      if (prop.position.z > 8) prop.position.z -= propLoop;
      prop.children.forEach((child, childIndex) => {
        if (childIndex % 3 === 1) child.scale.y = 1.02 + Math.sin(this.clockSeconds * 5 + index) * 0.08;
      });
    });
  }

  updateSpawning(dt) {
    this.spawnClock -= dt;
    if (this.spawnClock > 0) return;

    this.waveIndex += 1;
    if (this.waveIndex % 9 === 0) {
      this.spawnBossWave();
    } else {
      this.spawnEnemyWave();
    }

    const pressure = clamp(this.level - 1, 0, 8);
    this.spawnClock = clamp(1.14 - pressure * 0.055 - this.rng.uniform(0, 0.14), 0.58, 1.14);
  }

  spawnEnemyWave() {
    const count = this.level >= 4 && this.rng.random() < 0.38 ? 2 : 1;
    const used = new Set();
    for (let i = 0; i < count; i += 1) {
      let lane = this.rng.choice(LANES);
      if (used.has(lane)) lane = LANES.find((item) => !used.has(item)) ?? lane;
      used.add(lane);
      this.spawnEnemy({
        x: lane,
        z: -43 - i * 1.4,
        hp: this.rng.random() < 0.18 + this.level * 0.015 ? 2 : 1,
        kind: 'target',
      });
    }
  }

  spawnBossWave() {
    showToast('9ターゲット接近', 800);
    this.spawnEnemy({ x: 0, z: -45, hp: 4 + Math.floor(this.level / 3), kind: 'boss' });
    this.spawnEnemy({ x: -2.5, z: -47.5, hp: 1, kind: 'target' });
    this.spawnEnemy({ x: 2.5, z: -47.5, hp: 1, kind: 'target' });
  }

  spawnEnemy({ x, z, hp, kind }) {
    const group = this.makeEnemy(kind, hp);
    group.position.set(x, kind === 'boss' ? 1.25 : 0.92, z);
    this.scene.add(group);
    this.enemies.push({
      group,
      hp,
      maxHp: hp,
      kind,
      radius: kind === 'boss' ? 1.28 : 0.76,
      scoreValue: kind === 'boss' ? 9 : hp === 2 ? 3 : 1,
      wobble: this.rng.uniform(0, Math.PI * 2),
    });
  }

  makeEnemy(kind, hp) {
    const group = new THREE.Group();
    const scale = kind === 'boss' ? 1.42 : 1;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.9 * scale, 0.58 * scale, 0.52 * scale),
      this.materials.enemy.clone()
    );
    body.position.y = -0.16 * scale;
    group.add(body);

    const plateMaterial = new THREE.MeshStandardMaterial({
      map: kind === 'boss' ? this.textures.targetIx : this.textures.target9,
      roughness: 0.48,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    const plate = new THREE.Mesh(new THREE.CircleGeometry(0.58 * scale, 64), plateMaterial);
    plate.position.z = 0.29 * scale;
    group.add(plate);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.6 * scale, 0.035 * scale, 10, 64),
      kind === 'boss' ? this.materials.gold.clone() : this.materials.cobalt.clone()
    );
    ring.position.z = 0.3 * scale;
    group.add(ring);

    const hpLabel = makeTextSprite(String(hp), {
      width: 220,
      height: 140,
      fontSize: 84,
      scaleX: 0.58 * scale,
      scaleY: 0.36 * scale,
      fill: '#fff8e3',
      textColor: hp > 1 ? '#cf3c32' : '#10272f',
      borderColor: '#e2b34a',
    });
    hpLabel.position.set(0, 0.74 * scale, 0.1);
    group.add(hpLabel);
    group.userData.hpLabel = hpLabel;
    return group;
  }

  updateFiring(dt) {
    this.fireClock -= dt;
    const interval = clamp(0.28 - Math.min(this.level, 9) * 0.012, 0.16, 0.28);
    if (this.fireClock > 0) return;
    this.fireClock = interval;
    this.spawnBullet();
  }

  spawnBullet() {
    const group = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.82, 16), this.materials.beam.clone());
    beam.rotation.x = Math.PI / 2;
    group.add(beam);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 10), this.materials.gold.clone());
    core.position.z = -0.42;
    group.add(core);
    group.position.set(this.playerX, 1.0, -1.12);
    this.scene.add(group);
    this.bullets.push({
      group,
      speed: 25 + this.level * 0.7,
      radius: 0.34,
    });
    this.cannon.rotation.z = Math.sin(this.clockSeconds * 30) * 0.035;
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = this.bullets[i];
      bullet.group.position.z -= bullet.speed * dt;
      bullet.group.rotation.z += dt * 9;
      if (bullet.group.position.z < -52) {
        this.removeBullet(i);
        continue;
      }

      const hitIndex = this.findHitEnemy(bullet);
      if (hitIndex !== -1) {
        this.hitEnemy(hitIndex, bullet.group.position.clone());
        this.removeBullet(i);
      }
    }
  }

  findHitEnemy(bullet) {
    for (let i = 0; i < this.enemies.length; i += 1) {
      const enemy = this.enemies[i];
      const dx = enemy.group.position.x - bullet.group.position.x;
      const dz = enemy.group.position.z - bullet.group.position.z;
      if (Math.abs(dx) < enemy.radius && Math.abs(dz) < enemy.radius * 0.78) return i;
    }
    return -1;
  }

  hitEnemy(index, position) {
    const enemy = this.enemies[index];
    enemy.hp -= 1;
    this.spawnSpark(position, enemy.hp <= 0 ? 'Hit' : '-1');
    this.shake = Math.max(this.shake, 0.22);

    if (enemy.hp > 0) {
      this.updateEnemyHpLabel(enemy);
      enemy.group.scale.setScalar(1.08);
      return;
    }

    this.score += enemy.scoreValue;
    this.combo = Math.min(9, this.combo + 1);
    this.spawnSpark(enemy.group.position.clone().add(new THREE.Vector3(0, 0.6, 0)), enemy.kind === 'boss' ? '+9' : '+1');
    this.removeEnemy(index);

    if (this.combo >= 9) {
      this.combo = 0;
      this.level += 1;
      this.hp = Math.min(9, this.hp + 1);
      this.enemySpeed = Math.min(11.2, this.enemySpeed + 0.42);
      this.score += 9 * this.level;
      showToast('IX SHOOT RUSH!', 1000);
      navigator.vibrate?.(36);
    }

    this.patchUi();
  }

  updateEnemyHpLabel(enemy) {
    const oldLabel = enemy.group.userData.hpLabel;
    if (oldLabel) disposeObject3D(oldLabel);
    const scale = enemy.kind === 'boss' ? 1.42 : 1;
    const nextLabel = makeTextSprite(String(enemy.hp), {
      width: 220,
      height: 140,
      fontSize: 84,
      scaleX: 0.58 * scale,
      scaleY: 0.36 * scale,
      fill: '#fff8e3',
      textColor: enemy.hp > 1 ? '#cf3c32' : '#10272f',
      borderColor: '#e2b34a',
    });
    nextLabel.position.set(0, 0.74 * scale, 0.1);
    enemy.group.add(nextLabel);
    enemy.group.userData.hpLabel = nextLabel;
  }

  updateEnemies(dt) {
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      enemy.group.position.z += this.enemySpeed * dt;
      enemy.group.position.x += Math.sin(this.clockSeconds * 2.3 + enemy.wobble) * dt * 0.36;
      enemy.group.rotation.y = Math.sin(this.clockSeconds * 2.8 + enemy.wobble) * 0.14;
      enemy.group.rotation.z += dt * (enemy.kind === 'boss' ? 0.28 : 0.55);
      enemy.group.scale.lerp(new THREE.Vector3(1, 1, 1), clamp(dt * 8, 0, 1));

      if (enemy.group.position.z > 2.15) {
        this.enemyPassed(i, enemy.group.position.clone());
      }
    }
  }

  enemyPassed(index, position) {
    const enemy = this.enemies[index];
    this.hp = Math.max(0, this.hp - (enemy.kind === 'boss' ? 2 : 1));
    this.combo = 0;
    this.shake = 0.6;
    this.spawnSpark(position.add(new THREE.Vector3(0, 0.6, 0)), '-HP');
    this.removeEnemy(index);
    navigator.vibrate?.(enemy.kind === 'boss' ? [70, 40, 70] : 45);

    if (this.hp <= 0) {
      this.finish();
    } else {
      showToast(`HP ${this.hp}`, 700);
      this.patchUi();
    }
  }

  finish() {
    if (this.dead) return;
    this.dead = true;
    this.running = false;
    const best = Math.max(readBestScore(), this.score);
    if (best > readBestScore()) writeBestScore(best);
    ui.patch({
      best,
      hp: 0,
      finalScore: this.score,
      finalBest: best,
      messageVisible: false,
    });
    window.setTimeout(() => {
      gameOverOverlay.hidden = false;
    }, 380);
  }

  removeEnemy(index) {
    const [enemy] = this.enemies.splice(index, 1);
    disposeObject3D(enemy.group);
  }

  removeBullet(index) {
    const [bullet] = this.bullets.splice(index, 1);
    disposeObject3D(bullet.group);
  }

  spawnSpark(position, text) {
    const group = new THREE.Group();
    const label = makeTextSprite(text, {
      width: 420,
      height: 150,
      fontSize: 70,
      scaleX: 1.08,
      scaleY: 0.38,
      fill: '#fff8e3',
      textColor: text.includes('HP') ? '#cf3c32' : '#10272f',
      borderColor: text.includes('HP') ? '#cf3c32' : '#57c2c6',
    });
    label.position.copy(position);
    group.add(label);

    const particles = [];
    for (let i = 0; i < 12; i += 1) {
      const mat = (i % 3 === 0 ? this.materials.red : i % 3 === 1 ? this.materials.cyan : this.materials.gold).clone();
      mat.transparent = true;
      mat.opacity = 0.96;
      const particle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.075), mat);
      particle.position.copy(position);
      const velocity = new THREE.Vector3(
        this.rng.uniform(-1.2, 1.2),
        this.rng.uniform(0.36, 1.8),
        this.rng.uniform(-0.8, 1.0)
      );
      particles.push({ particle, velocity });
      group.add(particle);
    }

    this.scene.add(group);
    this.effects.push({ group, particles, life: 0.78, maxLife: 0.78 });
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      effect.life -= dt;
      const alpha = clamp(effect.life / effect.maxLife, 0, 1);
      effect.group.children.forEach((child) => {
        if (child.isSprite) {
          child.position.y += dt * 1.15;
          child.material.opacity = alpha;
        }
      });
      effect.particles.forEach(({ particle, velocity }) => {
        velocity.y -= dt * 2.3;
        particle.position.addScaledVector(velocity, dt);
        particle.rotation.x += dt * 6;
        particle.rotation.y += dt * 5;
        particle.material.opacity = alpha;
      });
      if (effect.life <= 0) {
        disposeObject3D(effect.group);
        this.effects.splice(i, 1);
      }
    }
  }

  updatePlayerPose(dt) {
    const bob = Math.sin(this.clockSeconds * (this.running ? 9 : 3)) * (this.running ? 0.045 : 0.022);
    this.playerGroup.position.set(this.playerX, bob, 0);
    this.playerGroup.rotation.z = smoothToward(this.playerGroup.rotation.z, -(this.playerTargetX - this.playerX) * 0.22, 0.1, dt);
    this.playerGroup.rotation.y = smoothToward(this.playerGroup.rotation.y, (this.playerTargetX - this.playerX) * 0.12, 0.12, dt);
    this.crosshair.position.x = smoothToward(this.crosshair.position.x, this.playerX, 0.08, dt);
    this.crosshair.rotation.y += dt * 0.9;
    this.crosshair.rotation.z += dt * 1.4;
    this.playerShadow.position.set(this.playerX, 0.018, 0.02);
  }

  updateCamera(dt) {
    const shakeX = this.shake > 0 ? Math.sin(this.clockSeconds * 42) * this.shake * 0.1 : 0;
    const cameraTarget = this.basis.fromBasisComponents(this.playerX * 0.12 + shakeX, 0.5, -2.2);
    this.cameraRig.step({
      targetPosition: cameraTarget,
      snapToTarget: this.clockSeconds < 0.1,
      deltaSeconds: dt || 1 / 60,
      camera: this.camera,
    });
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

const game = new NineShooterGame();

function startGame() {
  startOverlay.hidden = true;
  gameOverOverlay.hidden = true;
  game.start();
}

function restartGame() {
  game.reset();
  gameOverOverlay.hidden = true;
  startOverlay.hidden = true;
  game.start();
}

startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', restartGame);

let previousTime = performance.now();
function tick(now) {
  const dt = (now - previousTime) / 1000;
  previousTime = now;
  game.update(dt);
  game.render();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.__IX9_NINE_SHOOTER__ = {
  start: startGame,
  restart: restartGame,
  state: () => ui.getState(),
};
