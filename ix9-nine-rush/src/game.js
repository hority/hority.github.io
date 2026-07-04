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

const STORAGE_KEY = 'ix9-nine-rush-best';
const LANES = [-2.45, 0, 2.45];
const PLAYER_Z = 0;
const WORLD_SEED = (Date.now() ^ 0x999999) >>> 0;

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
  level: 1,
  combo: 0,
  comboMax: 9,
  message: 'IX Partyへ',
  messageVisible: false,
  finalScore: 0,
  finalBest: readBestScore(),
}, true);

new DomHudRenderer(ui)
  .bindText('[data-ui="score"]', 'score')
  .bindText('[data-ui="best"]', 'best')
  .bindText('[data-ui="level"]', 'level')
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

function makeCanvasTexture(draw, size = 512) {
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = size;
  textureCanvas.height = size;
  const context = textureCanvas.getContext('2d');
  draw(context, size);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makePlateTexture(symbol = '9', accent = '#cf3c32') {
  return makeCanvasTexture((ctx, size) => {
    const center = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#f8f1df';
    ctx.beginPath();
    ctx.arc(center, center, size * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f66a7';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(center, center, size * 0.38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 9;
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2;
      const x = center + Math.cos(angle) * size * 0.27;
      const y = center + Math.sin(angle) * size * 0.27;
      ctx.beginPath();
      ctx.ellipse(x, y, 24, 10, angle, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#193f79';
    ctx.font = `900 ${Math.round(size * 0.38)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, center, center + size * 0.02);
    ctx.strokeStyle = '#e2b34a';
    ctx.lineWidth = 6;
    ctx.strokeText(symbol, center, center + size * 0.02);
  });
}

function makeLabelTexture(text, options = {}) {
  const {
    width = 640,
    height = 180,
    fill = '#fff8e3',
    textColor = '#0f2830',
    borderColor = '#e2b34a',
    fontSize = 60,
  } = options;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = width;
  textureCanvas.height = height;
  const ctx = textureCanvas.getContext('2d');
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

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

function makeTextSprite(text, options = {}) {
  const texture = makeLabelTexture(text, options);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(options.scaleX ?? 2.2, options.scaleY ?? 0.62, 1);
  return sprite;
}

function pickDifferentLane(rng, blockedLane) {
  const choices = LANES.filter((lane) => lane !== blockedLane);
  return choices[rng.randint(0, choices.length - 1)];
}

class NineRushGame {
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
    this.scene.fog = new THREE.Fog('#071316', 20, 72);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 90);
    this.basis = DEFAULT_WORLD_BASIS;
    this.cameraRig = new PositionFollowCameraRig({
      azimuth: 0,
      distance: 8.9,
      height: 5.35,
      lookHeight: 0.85,
      positionLag: 0.05,
      lookLag: 0.08,
      basis: this.basis,
    });

    this.rng = new RandomGenerator(WORLD_SEED);
    this.clockSeconds = 0;
    this.pointerId = null;
    this.keyAxis = 0;
    this.items = [];
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
      porcelain: new THREE.MeshStandardMaterial({ color: '#f8f1df', roughness: 0.62, metalness: 0.04 }),
      porcelainWarm: new THREE.MeshStandardMaterial({ color: '#ead9b7', roughness: 0.72 }),
      cobalt: new THREE.MeshStandardMaterial({ color: '#1f66a7', roughness: 0.58 }),
      red: new THREE.MeshStandardMaterial({ color: '#cf3c32', roughness: 0.56 }),
      gold: new THREE.MeshStandardMaterial({ color: '#e2b34a', roughness: 0.36, metalness: 0.38 }),
      skin: new THREE.MeshStandardMaterial({ color: '#f3c7a6', roughness: 0.72 }),
      hair: new THREE.MeshStandardMaterial({ color: '#2a1a16', roughness: 0.78 }),
      ink: new THREE.MeshStandardMaterial({ color: '#10272f', roughness: 0.6 }),
      safeGreen: new THREE.MeshStandardMaterial({ color: '#3ba57a', roughness: 0.56 }),
      shadow: new THREE.MeshBasicMaterial({ color: '#001112', transparent: true, opacity: 0.26, depthWrite: false }),
    };

    this.plateTextures = {
      normal: makePlateTexture('9', '#cf3c32'),
      gold: makePlateTexture('IX', '#e2b34a'),
    };
  }

  makeScene() {
    const hemi = new THREE.HemisphereLight('#f9f5e8', '#16313a', 2.2);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight('#fff3d2', 2.8);
    key.position.set(-4, 8, 6);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight('#4eb7d4', 1.4);
    rim.position.set(4, 4, -8);
    this.scene.add(rim);

    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.makeRoad();
    this.makeSideProps();
    this.makeSkyline();

    this.playerGroup = this.makeMarie();
    this.scene.add(this.playerGroup);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.58, 36),
      this.materials.shadow
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.018;
    this.playerShadow = shadow;
    this.scene.add(shadow);
  }

  makeRoad() {
    const tileLength = 5.2;
    const tileCount = 20;
    this.tileLength = tileLength;
    for (let i = 0; i < tileCount; i += 1) {
      const tile = new THREE.Group();
      const baseMaterial = (i % 2 === 0 ? this.materials.porcelain : this.materials.porcelainWarm).clone();
      const base = new THREE.Mesh(new THREE.PlaneGeometry(6.1, tileLength), baseMaterial);
      base.rotation.x = -Math.PI / 2;
      base.position.y = 0;
      tile.add(base);

      [-3.05, 3.05].forEach((x) => {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, tileLength * 0.94), this.materials.cobalt);
        line.position.set(x, 0.04, 0);
        tile.add(line);
      });

      [-1.23, 1.23].forEach((x) => {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.032, tileLength * 0.52), this.materials.red);
        line.position.set(x, 0.045, 0);
        tile.add(line);
      });

      const motif = new THREE.Mesh(
        new THREE.TorusGeometry(0.44, 0.025, 8, 48),
        i % 3 === 0 ? this.materials.gold : this.materials.cobalt
      );
      motif.rotation.x = Math.PI / 2;
      motif.position.set(0, 0.07, 0);
      tile.add(motif);

      tile.position.z = 5 - i * tileLength;
      this.world.add(tile);
      this.roadTiles.push(tile);
    }
  }

  makeSideProps() {
    for (let i = 0; i < 18; i += 1) {
      const pair = new THREE.Group();
      [-1, 1].forEach((side) => {
        const x = side * 4.25;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.35, 8), this.materials.ink);
        pole.position.set(x, 0.68, 0);
        pair.add(pole);

        const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), this.materials.gold);
        lantern.scale.set(1, 1.16, 1);
        lantern.position.set(x, 1.42, 0);
        pair.add(lantern);

        const dish = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 8, 40), this.materials.cobalt);
        dish.rotation.x = Math.PI / 2;
        dish.position.set(x * 0.96, 0.1, 0);
        pair.add(dish);
      });
      pair.position.z = 2 - i * 6.2;
      this.world.add(pair);
      this.sideProps.push(pair);
    }
  }

  makeSkyline() {
    const skyline = new THREE.Group();
    const roofMat = new THREE.MeshStandardMaterial({ color: '#173c45', roughness: 0.9 });
    for (let i = 0; i < 9; i += 1) {
      const kiln = new THREE.Mesh(new THREE.BoxGeometry(1.1 + (i % 3) * 0.35, 1.1 + (i % 2) * 0.55, 1.1), roofMat);
      kiln.position.set((i - 4) * 1.15, 0.56, -52 - (i % 3) * 3.5);
      kiln.rotation.y = (i % 2 ? 0.18 : -0.18);
      skyline.add(kiln);
    }
    this.scene.add(skyline);
  }

  makeMarie() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.98, 24), this.materials.porcelain);
    body.position.y = 0.76;
    group.add(body);

    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.14, 0.1), this.materials.red);
    sash.position.set(0, 0.72, 0.43);
    group.add(sash);

    const badgeTexture = makeLabelTexture('IX', {
      width: 260,
      height: 150,
      fontSize: 86,
      fill: '#f8f1df',
      textColor: '#193f79',
      borderColor: '#cf3c32',
    });
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.44, 0.26),
      new THREE.MeshBasicMaterial({ map: badgeTexture, transparent: true })
    );
    badge.position.set(0, 0.9, 0.49);
    group.add(badge);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 18), this.materials.skin);
    head.position.y = 1.42;
    group.add(head);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 14), this.materials.hair);
    hair.scale.set(1.05, 0.84, 0.92);
    hair.position.set(0, 1.52, -0.04);
    group.add(hair);

    const fringe = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.34, 16), this.materials.hair);
    fringe.rotation.x = Math.PI / 2;
    fringe.position.set(0, 1.47, 0.3);
    group.add(fringe);

    [-0.11, 0.11].forEach((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), this.materials.ink);
      eye.position.set(x, 1.45, 0.325);
      group.add(eye);
    });

    const fan = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.045, 12, 64), this.materials.cobalt);
    fan.rotation.x = Math.PI / 2;
    fan.position.set(0, 0.92, -0.16);
    group.add(fan);

    const label = makeTextSprite('九伊万里絵', {
      width: 620,
      height: 170,
      fontSize: 64,
      scaleX: 1.85,
      scaleY: 0.52,
      fill: '#fff8e3',
      textColor: '#0f2830',
      borderColor: '#e2b34a',
    });
    label.position.set(0, 2.06, 0.04);
    group.add(label);

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
    this.items.forEach((item) => disposeObject3D(item.group));
    this.effects.forEach((effect) => disposeObject3D(effect.group));
    this.items = [];
    this.effects = [];

    this.running = false;
    this.dead = false;
    this.score = 0;
    this.combo = 0;
    this.level = 1;
    this.speed = 7.6;
    this.spawnClock = 0.82;
    this.rowIndex = 0;
    this.playerX = 0;
    this.playerTargetX = 0;
    this.playerVelocityX = 0;
    this.clockSeconds = 0;
    this.pointerId = null;
    this.keyAxis = 0;

    this.roadTiles.forEach((tile, i) => {
      tile.position.z = 5 - i * this.tileLength;
    });
    this.sideProps.forEach((prop, i) => {
      prop.position.z = 2 - i * 6.2;
    });
    this.updatePlayerPose(0);
    this.patchUi();
  }

  start() {
    if (this.dead) this.reset();
    this.running = true;
    this.dead = false;
    showToast('9皿をつなげよう', 850);
  }

  onPointerDown(event) {
    event.preventDefault();
    if (this.dead) return;
    if (!this.running && startOverlay.hidden) {
      this.start();
    }
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

  patchUi() {
    ui.patch({
      score: this.score,
      best: Math.max(readBestScore(), this.score),
      level: this.level,
      combo: this.combo,
    });
  }

  update(deltaSeconds) {
    const dt = clamp(deltaSeconds, 0, 1 / 30);
    this.clockSeconds += dt;

    if (this.running) {
      if (this.keyAxis !== 0) {
        this.playerTargetX = clamp(this.playerTargetX + this.keyAxis * dt * 5.8, -3, 3);
      }
      this.playerX = smoothToward(this.playerX, this.playerTargetX, 0.09, dt);
      this.playerVelocityX = smoothToward(this.playerVelocityX, this.playerTargetX - this.playerX, 0.07, dt);
      this.updateWorldMotion(dt);
      this.updateSpawning(dt);
      this.updateItems(dt);
    } else {
      this.playerTargetX = smoothToward(this.playerTargetX, 0, 0.8, dt);
      this.playerX = smoothToward(this.playerX, this.playerTargetX, 0.18, dt);
    }

    this.updatePlayerPose(dt);
    this.updateEffects(dt);
    this.updateCamera(dt);
  }

  updateWorldMotion(dt) {
    const travel = this.speed * dt;
    const tileLoop = this.tileLength * this.roadTiles.length;
    this.roadTiles.forEach((tile) => {
      tile.position.z += travel;
      if (tile.position.z > 8) tile.position.z -= tileLoop;
    });

    const propLoop = 6.2 * this.sideProps.length;
    this.sideProps.forEach((prop, index) => {
      prop.position.z += travel;
      if (prop.position.z > 8) prop.position.z -= propLoop;
      prop.children.forEach((child, childIndex) => {
        if (childIndex % 3 === 1) child.scale.y = 1.05 + Math.sin(this.clockSeconds * 5 + index) * 0.08;
      });
    });
  }

  updateSpawning(dt) {
    this.spawnClock -= dt;
    if (this.spawnClock > 0) return;
    this.spawnRow();
    const pressure = clamp(this.level - 1, 0, 9);
    this.spawnClock = clamp(0.96 - pressure * 0.055 - this.rng.uniform(0, 0.14), 0.46, 0.98);
  }

  spawnRow() {
    this.rowIndex += 1;
    const z = -42;
    if (this.rowIndex === 1) {
      this.spawnPickup(0, z, 'normal');
      return;
    }

    if (this.rowIndex % 9 === 0) {
      LANES.forEach((lane, index) => this.spawnPickup(lane, z - index * 1.25, 'gold'));
      this.spawnGate(z - 3.7);
      return;
    }

    const safeLane = this.rowIndex === 2 ? 0 : LANES[this.rng.randint(0, LANES.length - 1)];
    const obstacleLane = pickDifferentLane(this.rng, safeLane);
    this.spawnObstacle(obstacleLane, z);

    if (this.level >= 4 && this.rng.random() < 0.28) {
      const secondLane = LANES.find((lane) => lane !== safeLane && lane !== obstacleLane);
      if (secondLane != null) this.spawnObstacle(secondLane, z - 1.0);
    }

    this.spawnPickup(safeLane, z - 0.25, 'normal');
    if (this.rng.random() < 0.42) {
      const bonusLane = this.rng.choice(LANES);
      this.spawnPickup(bonusLane, z - 2.2, this.rng.random() < 0.18 ? 'gold' : 'normal');
    }
  }

  spawnPickup(x, z, variant) {
    const group = this.makePickup(variant);
    group.position.set(x, 0.9, z);
    this.scene.add(group);
    this.items.push({
      type: 'pickup',
      variant,
      group,
      radius: 0.72,
      spin: this.rng.uniform(-1.7, 1.7),
    });
  }

  spawnObstacle(x, z) {
    const group = this.makeObstacle();
    group.position.set(x, 0.52, z);
    this.scene.add(group);
    this.items.push({
      type: 'obstacle',
      group,
      radius: 0.82,
      spin: this.rng.uniform(-0.18, 0.18),
    });
  }

  spawnGate(z) {
    const group = new THREE.Group();
    const mat = this.materials.gold.clone();
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.4, 0.18), mat);
    left.position.set(-3.18, 1.25, 0);
    const right = left.clone();
    right.position.x = 3.18;
    const top = new THREE.Mesh(new THREE.BoxGeometry(6.52, 0.18, 0.18), mat.clone());
    top.position.set(0, 2.42, 0);
    const label = makeTextSprite('IX PARTY', {
      width: 640,
      height: 170,
      fontSize: 64,
      scaleX: 2.25,
      scaleY: 0.58,
      fill: '#fff8e3',
      textColor: '#10272f',
      borderColor: '#cf3c32',
    });
    label.position.set(0, 2.82, 0);
    group.add(left, right, top, label);
    group.position.z = z;
    this.scene.add(group);
    this.items.push({
      type: 'gate',
      group,
      radius: 0,
      spin: 0,
    });
  }

  makePickup(variant) {
    const group = new THREE.Group();
    const plateMaterial = new THREE.MeshStandardMaterial({
      map: this.plateTextures[variant],
      color: '#ffffff',
      roughness: 0.48,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    const disk = new THREE.Mesh(new THREE.CircleGeometry(0.52, 64), plateMaterial);
    disk.rotation.x = -Math.PI / 2;
    group.add(disk);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.54, 0.035, 10, 64),
      (variant === 'gold' ? this.materials.gold : this.materials.cobalt).clone()
    );
    rim.rotation.x = Math.PI / 2;
    group.add(rim);

    const shine = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 8),
      this.materials.gold.clone()
    );
    shine.position.set(0.25, 0.07, -0.18);
    group.add(shine);
    return group;
  }

  makeObstacle() {
    const group = new THREE.Group();
    const blockMat = new THREE.MeshStandardMaterial({ color: '#26373b', roughness: 0.72, metalness: 0.02 });
    const alertMat = this.materials.red.clone();

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.74, 0.82), blockMat);
    base.position.y = 0.08;
    group.add(base);

    const slash = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.08), alertMat);
    slash.position.set(0, 0.54, 0.43);
    slash.rotation.z = 0.42;
    group.add(slash);

    const dish = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 36), this.materials.cobalt.clone());
    dish.rotation.x = Math.PI / 2;
    dish.position.set(0, 0.53, -0.04);
    group.add(dish);
    return group;
  }

  updateItems(dt) {
    const travel = this.speed * dt;
    const playerPos = new THREE.Vector3(this.playerX, 0.82, PLAYER_Z);

    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i];
      item.group.position.z += travel;
      item.group.rotation.y += (item.spin || 0.8) * dt;

      if (item.type === 'pickup') {
        item.group.position.y = 0.9 + Math.sin(this.clockSeconds * 5 + item.group.position.x) * 0.12;
        item.group.rotation.z += 2.4 * dt;
      }

      if (item.type === 'gate') {
        item.group.children.forEach((child) => {
          if (child.isSprite) child.material.opacity = 0.72 + Math.sin(this.clockSeconds * 6) * 0.18;
        });
      }

      if (item.group.position.z > 7.5) {
        this.removeItem(i);
        continue;
      }

      if (item.type === 'gate') continue;

      const dx = item.group.position.x - playerPos.x;
      const dz = item.group.position.z - playerPos.z;
      const closeX = Math.abs(dx);
      const closeZ = Math.abs(dz);
      if (item.type === 'pickup') {
        if (closeX < 1.16 && closeZ < 1.34) {
          this.collectPickup(item);
          this.removeItem(i);
        }
      } else if (closeX < 0.68 && closeZ < 0.72) {
          this.hitObstacle(item.group.position.clone());
          break;
      }
    }
  }

  collectPickup(item) {
    const value = item.variant === 'gold' ? 2 : 1;
    this.score += value;
    this.combo = Math.min(9, this.combo + value);
    this.spawnSpark(item.group.position.clone(), item.variant === 'gold' ? 'IX +2' : '+1');

    if (this.combo >= 9) {
      this.score += 9 * this.level;
      this.level += 1;
      this.combo = 0;
      this.speed = Math.min(16.5, this.speed + 0.72);
      showToast('IX PARTY RUSH!', 1000);
      this.spawnSpark(new THREE.Vector3(this.playerX, 2.2, PLAYER_Z - 1.2), '9 RUSH');
      navigator.vibrate?.(38);
    } else if (this.combo === 8) {
      showToast('あと1皿', 620);
    }

    this.patchUi();
  }

  hitObstacle(position) {
    if (this.dead) return;
    this.dead = true;
    this.running = false;
    this.spawnSpark(position.add(new THREE.Vector3(0, 0.7, 0)), 'Retry');
    const best = Math.max(readBestScore(), this.score);
    if (best > readBestScore()) writeBestScore(best);
    ui.patch({
      best,
      finalScore: this.score,
      finalBest: best,
      messageVisible: false,
    });
    navigator.vibrate?.([60, 50, 80]);
    window.setTimeout(() => {
      gameOverOverlay.hidden = false;
    }, 380);
  }

  removeItem(index) {
    const [item] = this.items.splice(index, 1);
    disposeObject3D(item.group);
  }

  spawnSpark(position, text) {
    const group = new THREE.Group();
    const label = makeTextSprite(text, {
      width: 520,
      height: 160,
      fontSize: 70,
      scaleX: 1.4,
      scaleY: 0.44,
      fill: '#fff8e3',
      textColor: '#10272f',
      borderColor: text.includes('Retry') ? '#cf3c32' : '#e2b34a',
    });
    label.position.copy(position);
    group.add(label);

    const particles = [];
    for (let i = 0; i < 14; i += 1) {
      const mat = (i % 3 === 0 ? this.materials.red : i % 3 === 1 ? this.materials.cobalt : this.materials.gold).clone();
      mat.transparent = true;
      mat.opacity = 0.95;
      const particle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), mat);
      particle.position.copy(position);
      const velocity = new THREE.Vector3(
        this.rng.uniform(-1.4, 1.4),
        this.rng.uniform(0.4, 2.0),
        this.rng.uniform(-0.8, 1.2)
      );
      particles.push({ particle, velocity });
      group.add(particle);
    }

    this.scene.add(group);
    this.effects.push({ group, particles, life: 0.92, maxLife: 0.92 });
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
        velocity.y -= dt * 2.4;
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
    const bob = Math.sin(this.clockSeconds * (this.running ? 10 : 3)) * (this.running ? 0.055 : 0.025);
    this.playerGroup.position.set(this.playerX, bob, PLAYER_Z);
    this.playerGroup.rotation.z = smoothToward(this.playerGroup.rotation.z, -this.playerVelocityX * 0.34, 0.1, dt || 1 / 60);
    this.playerGroup.rotation.y = smoothToward(this.playerGroup.rotation.y, this.playerVelocityX * 0.18, 0.12, dt || 1 / 60);

    this.playerShadow.position.x = this.playerX;
    this.playerShadow.position.z = PLAYER_Z + 0.02;
    const shadowScale = 1 + Math.abs(this.playerVelocityX) * 0.24;
    this.playerShadow.scale.set(shadowScale, 0.82, 1);
  }

  updateCamera(dt) {
    const cameraTarget = this.basis.fromBasisComponents(this.playerX * 0.18, 0.42, -1.95);
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

const game = new NineRushGame();

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

window.__IX9_NINE_RUSH__ = {
  start: startGame,
  restart: restartGame,
  state: () => ui.getState(),
};
