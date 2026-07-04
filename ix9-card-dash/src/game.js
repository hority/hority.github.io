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

const STORAGE_KEY = 'ix9-card-dash-best';
const LANES = [-2.5, 0, 2.5];
const PLAYER_Z = 0;
const WORLD_SEED = (Date.now() ^ 0x91cafe) >>> 0;

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
  cards: 9,
  combo: 0,
  comboMax: 9,
  message: '名刺を配ろう',
  messageVisible: false,
  finalScore: 0,
  finalBest: readBestScore(),
}, true);

new DomHudRenderer(ui)
  .bindText('[data-ui="score"]', 'score')
  .bindText('[data-ui="best"]', 'best')
  .bindText('[data-ui="cards"]', 'cards')
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

function makeBusinessCardTexture(name = '九伊万里絵') {
  return makeCanvasTexture((ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fff8e3';
    roundRect(ctx, 10, 10, width - 20, height - 20, 22);
    ctx.fill();
    ctx.strokeStyle = '#1f66a7';
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.fillStyle = '#10272f';
    ctx.font = '900 46px "Hiragino Sans", Meiryo, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('IX-Party', 44, 62);
    ctx.font = '900 60px "Hiragino Sans", Meiryo, sans-serif';
    ctx.fillText(name, 44, 138);
    ctx.fillStyle = '#cf3c32';
    ctx.fillRect(42, 182, width - 84, 10);
    ctx.fillStyle = '#e2b34a';
    ctx.font = '900 76px serif';
    ctx.textAlign = 'right';
    ctx.fillText('9', width - 46, height - 48);
  }, 512, 300);
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

class CardDashGame {
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
      distance: 9.2,
      height: 5.5,
      lookHeight: 0.85,
      positionLag: 0.05,
      lookLag: 0.08,
      basis: this.basis,
    });

    this.rng = new RandomGenerator(WORLD_SEED);
    this.items = [];
    this.effects = [];
    this.roadTiles = [];
    this.sideProps = [];
    this.clockSeconds = 0;

    this.makeMaterials();
    this.makeScene();
    this.addEvents();
    this.resize();
    this.reset();
  }

  makeMaterials() {
    this.materials = {
      floorA: new THREE.MeshStandardMaterial({ color: '#f8f1df', roughness: 0.58, metalness: 0.04 }),
      floorB: new THREE.MeshStandardMaterial({ color: '#ead9b7', roughness: 0.7 }),
      cobalt: new THREE.MeshStandardMaterial({ color: '#1f66a7', roughness: 0.55 }),
      red: new THREE.MeshStandardMaterial({ color: '#cf3c32', roughness: 0.55 }),
      gold: new THREE.MeshStandardMaterial({ color: '#e2b34a', roughness: 0.34, metalness: 0.4 }),
      green: new THREE.MeshStandardMaterial({ color: '#3ba57a', roughness: 0.48, metalness: 0.08 }),
      ink: new THREE.MeshStandardMaterial({ color: '#10272f', roughness: 0.62 }),
      skin: new THREE.MeshStandardMaterial({ color: '#f3c7a6', roughness: 0.72 }),
      hair: new THREE.MeshStandardMaterial({ color: '#2a1a16', roughness: 0.78 }),
      suit: new THREE.MeshStandardMaterial({ color: '#26373b', roughness: 0.68 }),
      shadow: new THREE.MeshBasicMaterial({ color: '#001112', transparent: true, opacity: 0.28, depthWrite: false }),
    };
    this.cardTexture = makeBusinessCardTexture();
  }

  makeScene() {
    const hemi = new THREE.HemisphereLight('#f9f5e8', '#16313a', 2.2);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight('#fff3d2', 2.8);
    key.position.set(-4, 8, 6);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight('#57c2c6', 1.4);
    rim.position.set(4, 4, -8);
    this.scene.add(rim);

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.makeRoad();
    this.makeSideProps();
    this.makeBackdrop();

    this.playerGroup = this.makeMarie();
    this.scene.add(this.playerGroup);

    this.playerShadow = new THREE.Mesh(new THREE.CircleGeometry(0.58, 36), this.materials.shadow);
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.y = 0.018;
    this.scene.add(this.playerShadow);
  }

  makeRoad() {
    this.tileLength = 5.2;
    for (let i = 0; i < 20; i += 1) {
      const tile = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.PlaneGeometry(6.2, this.tileLength),
        i % 2 === 0 ? this.materials.floorA : this.materials.floorB
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
      const tableMark = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.023, 8, 48), i % 4 === 0 ? this.materials.gold : this.materials.cobalt);
      tableMark.rotation.x = Math.PI / 2;
      tableMark.position.set(0, 0.07, 0);
      tile.add(tableMark);

      tile.position.z = 5 - i * this.tileLength;
      this.world.add(tile);
      this.roadTiles.push(tile);
    }
  }

  makeSideProps() {
    for (let i = 0; i < 18; i += 1) {
      const group = new THREE.Group();
      [-1, 1].forEach((side) => {
        const x = side * 4.25;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 1.15, 8), this.materials.ink);
        pole.position.set(x, 0.58, 0);
        group.add(pole);
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), i % 2 === 0 ? this.materials.gold : this.materials.cobalt);
        orb.position.set(x, 1.25, 0);
        group.add(orb);
        const cardStand = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.05), this.materials.floorA);
        cardStand.position.set(x - side * 0.26, 0.25, 0);
        cardStand.rotation.y = side * 0.35;
        group.add(cardStand);
      });
      group.position.z = 3 - i * 6.0;
      this.world.add(group);
      this.sideProps.push(group);
    }
  }

  makeBackdrop() {
    const skyline = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#173c45', roughness: 0.9 });
    for (let i = 0; i < 9; i += 1) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.9 + (i % 3) * 0.28, 0.9 + (i % 2) * 0.45, 0.8), mat);
      block.position.set((i - 4) * 0.95, 0.5, -54 - (i % 3) * 2.6);
      block.rotation.y = i % 2 ? 0.16 : -0.16;
      skyline.add(block);
    }
    this.scene.add(skyline);
  }

  makeMarie() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.96, 24), this.materials.floorA);
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

    const fan = new THREE.Group();
    for (let i = 0; i < 4; i += 1) {
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(0.42, 0.25),
        new THREE.MeshBasicMaterial({ map: this.cardTexture, transparent: true, side: THREE.DoubleSide })
      );
      card.position.set((i - 1.5) * 0.13, 1.02 + i * 0.012, 0.55);
      card.rotation.z = (i - 1.5) * 0.14;
      fan.add(card);
    }
    group.add(fan);
    this.cardFan = fan;

    const label = makeTextSprite('九伊万里絵', {
      width: 620,
      height: 170,
      fontSize: 64,
      scaleX: 1.85,
      scaleY: 0.52,
      fill: '#fff8e3',
      textColor: '#10272f',
      borderColor: '#3ba57a',
    });
    label.position.set(0, 1.98, 0.05);
    group.add(label);
    return group;
  }

  makeAttendee(kind = 'normal') {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.42, kind === 'vip' ? 1.18 : 0.98, 20),
      kind === 'vip' ? this.materials.green.clone() : this.materials.suit.clone()
    );
    body.position.y = 0.72;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 20, 14), this.materials.skin.clone());
    head.position.y = kind === 'vip' ? 1.43 : 1.3;
    group.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10), this.materials.hair.clone());
    hair.scale.set(1.05, 0.58, 0.96);
    hair.position.set(0, kind === 'vip' ? 1.57 : 1.43, -0.03);
    group.add(hair);

    const label = makeTextSprite(kind === 'vip' ? 'DX' : 'MEET', {
      width: 360,
      height: 140,
      fontSize: 62,
      scaleX: kind === 'vip' ? 0.92 : 1.08,
      scaleY: 0.34,
      fill: '#fff8e3',
      textColor: '#10272f',
      borderColor: kind === 'vip' ? '#e2b34a' : '#1f66a7',
    });
    label.position.set(0, kind === 'vip' ? 1.95 : 1.75, 0);
    group.add(label);
    return group;
  }

  makeObstacle(kind = 'cable') {
    const group = new THREE.Group();
    if (kind === 'cable') {
      const cable = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.04, 10, 64), this.materials.red.clone());
      cable.rotation.x = Math.PI / 2;
      cable.position.y = 0.13;
      group.add(cable);
      const plug = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.18), this.materials.ink.clone());
      plug.position.set(0.4, 0.16, 0.16);
      group.add(plug);
    } else {
      for (let i = 0; i < 3; i += 1) {
        const pile = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.18, 0.62), i % 2 ? this.materials.floorB.clone() : this.materials.floorA.clone());
        pile.position.y = 0.12 + i * 0.17;
        pile.rotation.y = (i - 1) * 0.12;
        group.add(pile);
      }
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.05, 0.08), this.materials.cobalt.clone());
      band.position.y = 0.66;
      group.add(band);
    }
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
    this.cards = 9;
    this.level = 1;
    this.speed = 7.2;
    this.spawnClock = 0.7;
    this.rowIndex = 0;
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
      prop.position.z = 3 - i * 6.0;
    });
    this.updatePlayerPose(1 / 60);
    this.patchUi();
  }

  start() {
    if (this.dead) this.reset();
    this.running = true;
    this.dead = false;
    showToast('参加者に近づこう', 900);
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

  patchUi() {
    ui.patch({
      score: this.score,
      best: Math.max(readBestScore(), this.score),
      cards: this.cards,
      combo: this.combo,
    });
  }

  update(deltaSeconds) {
    const dt = clamp(deltaSeconds, 0, 1 / 30);
    this.clockSeconds += dt;
    this.shake = Math.max(0, this.shake - dt * 2.8);

    if (this.running) {
      if (this.keyAxis !== 0) {
        this.playerTargetX = clamp(this.playerTargetX + this.keyAxis * dt * 5.8, -3, 3);
      }
      this.playerX = smoothToward(this.playerX, this.playerTargetX, 0.085, dt);
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

    const propLoop = 6.0 * this.sideProps.length;
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
    this.spawnRow();
    const pressure = clamp(this.level - 1, 0, 9);
    this.spawnClock = clamp(0.94 - pressure * 0.045 - this.rng.uniform(0, 0.12), 0.5, 0.96);
  }

  spawnRow() {
    this.rowIndex += 1;
    const z = -42;

    if (this.rowIndex === 1) {
      this.spawnAttendee(0, z, 'normal');
      return;
    }

    if (this.rowIndex % 9 === 0) {
      LANES.forEach((lane, index) => this.spawnAttendee(lane, z - index * 1.2, index === 1 ? 'vip' : 'normal'));
      return;
    }

    const attendeeLane = LANES[this.rng.randint(0, LANES.length - 1)];
    const obstacleLane = this.pickDifferentLane(attendeeLane);
    this.spawnAttendee(attendeeLane, z, this.rng.random() < 0.17 ? 'vip' : 'normal');
    this.spawnObstacle(obstacleLane, z - 0.5, this.rng.random() < 0.55 ? 'cable' : 'papers');

    if (this.level >= 4 && this.rng.random() < 0.28) {
      const extraLane = LANES.find((lane) => lane !== attendeeLane && lane !== obstacleLane);
      if (extraLane != null) this.spawnObstacle(extraLane, z - 1.4, this.rng.random() < 0.5 ? 'cable' : 'papers');
    }
  }

  pickDifferentLane(blocked) {
    const choices = LANES.filter((lane) => lane !== blocked);
    return choices[this.rng.randint(0, choices.length - 1)];
  }

  spawnAttendee(x, z, kind) {
    const group = this.makeAttendee(kind);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.items.push({
      type: 'attendee',
      kind,
      group,
      radiusX: kind === 'vip' ? 1.06 : 0.96,
      radiusZ: kind === 'vip' ? 1.24 : 1.12,
      scoreValue: kind === 'vip' ? 3 : 1,
      wobble: this.rng.uniform(0, Math.PI * 2),
    });
  }

  spawnObstacle(x, z, kind) {
    const group = this.makeObstacle(kind);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.items.push({
      type: 'obstacle',
      kind,
      group,
      radiusX: kind === 'cable' ? 0.74 : 0.68,
      radiusZ: kind === 'cable' ? 0.68 : 0.74,
      wobble: this.rng.uniform(0, Math.PI * 2),
    });
  }

  updateItems(dt) {
    const travel = this.speed * dt;
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i];
      item.group.position.z += travel;
      item.group.rotation.y = Math.sin(this.clockSeconds * 2.5 + item.wobble) * 0.12;
      if (item.type === 'attendee') {
        item.group.position.y = Math.sin(this.clockSeconds * 4 + item.wobble) * 0.04;
      }

      if (item.group.position.z > 7.8) {
        if (item.type === 'attendee') {
          this.combo = 0;
          this.patchUi();
        }
        this.removeItem(i);
        continue;
      }

      const dx = item.group.position.x - this.playerX;
      const dz = item.group.position.z - PLAYER_Z;
      if (Math.abs(dx) < item.radiusX && Math.abs(dz) < item.radiusZ) {
        if (item.type === 'attendee') {
          this.deliverCard(item);
          this.removeItem(i);
        } else {
          this.hitObstacle(item);
          this.removeItem(i);
          if (this.dead) break;
        }
      }
    }
  }

  deliverCard(item) {
    this.score += item.scoreValue;
    this.combo = Math.min(9, this.combo + 1);
    this.spawnCardEffect(new THREE.Vector3(item.group.position.x, 1.1, item.group.position.z), item.kind === 'vip' ? '+DX' : '+CARD');
    navigator.vibrate?.(18);

    if (this.combo >= 9) {
      this.combo = 0;
      this.level += 1;
      this.cards = Math.min(9, this.cards + 9);
      this.speed = Math.min(15.2, this.speed + 0.62);
      this.score += 9 * this.level;
      this.spawnCardEffect(new THREE.Vector3(this.playerX, 1.9, -1), 'IX RUSH');
      showToast('IX PARTY RUSH!', 1000);
      navigator.vibrate?.(38);
    }

    this.patchUi();
  }

  hitObstacle(item) {
    this.cards = Math.max(0, this.cards - (item.kind === 'papers' ? 2 : 1));
    this.combo = 0;
    this.shake = 0.5;
    this.spawnCardEffect(new THREE.Vector3(item.group.position.x, 0.9, item.group.position.z), item.kind === 'papers' ? '-2' : '-1');
    showToast('よけて！', 620);
    navigator.vibrate?.(item.kind === 'papers' ? [60, 35, 60] : 45);
    if (this.cards <= 0) this.finish();
    else this.patchUi();
  }

  finish() {
    if (this.dead) return;
    this.dead = true;
    this.running = false;
    const best = Math.max(readBestScore(), this.score);
    if (best > readBestScore()) writeBestScore(best);
    ui.patch({
      best,
      cards: Math.max(0, this.cards),
      finalScore: this.score,
      finalBest: best,
      messageVisible: false,
    });
    window.setTimeout(() => {
      gameOverOverlay.hidden = false;
    }, 380);
  }

  removeItem(index) {
    const [item] = this.items.splice(index, 1);
    disposeObject3D(item.group);
  }

  spawnCardEffect(position, text) {
    const group = new THREE.Group();
    const label = makeTextSprite(text, {
      width: 520,
      height: 150,
      fontSize: text.length > 6 ? 58 : 70,
      scaleX: text.length > 6 ? 1.42 : 1.16,
      scaleY: 0.38,
      fill: '#fff8e3',
      textColor: '#10272f',
      borderColor: text.includes('-') ? '#cf3c32' : '#3ba57a',
    });
    label.position.copy(position);
    group.add(label);

    const particles = [];
    for (let i = 0; i < 12; i += 1) {
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(0.32, 0.19),
        new THREE.MeshBasicMaterial({ map: this.cardTexture, side: THREE.DoubleSide, transparent: true })
      );
      card.position.copy(position);
      card.rotation.set(this.rng.uniform(-0.4, 0.4), this.rng.uniform(-0.8, 0.8), this.rng.uniform(-0.8, 0.8));
      const velocity = new THREE.Vector3(
        this.rng.uniform(-1.3, 1.3),
        this.rng.uniform(0.42, 1.9),
        this.rng.uniform(-0.9, 1.1)
      );
      particles.push({ card, velocity });
      group.add(card);
    }

    this.scene.add(group);
    this.effects.push({ group, particles, life: 0.84, maxLife: 0.84 });
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
      effect.particles.forEach(({ card, velocity }) => {
        velocity.y -= dt * 2.4;
        card.position.addScaledVector(velocity, dt);
        card.rotation.x += dt * 5;
        card.rotation.y += dt * 4;
        card.material.opacity = alpha;
      });
      if (effect.life <= 0) {
        disposeObject3D(effect.group);
        this.effects.splice(i, 1);
      }
    }
  }

  updatePlayerPose(dt) {
    const bob = Math.sin(this.clockSeconds * (this.running ? 9 : 3)) * (this.running ? 0.045 : 0.022);
    this.playerGroup.position.set(this.playerX, bob, PLAYER_Z);
    this.playerGroup.rotation.z = smoothToward(this.playerGroup.rotation.z, -(this.playerTargetX - this.playerX) * 0.25, 0.1, dt);
    this.playerGroup.rotation.y = smoothToward(this.playerGroup.rotation.y, (this.playerTargetX - this.playerX) * 0.14, 0.12, dt);
    if (this.cardFan) {
      this.cardFan.rotation.z = Math.sin(this.clockSeconds * 7) * 0.07;
      this.cardFan.visible = this.cards > 0;
    }
    this.playerShadow.position.set(this.playerX, 0.018, PLAYER_Z + 0.02);
  }

  updateCamera(dt) {
    const shakeX = this.shake > 0 ? Math.sin(this.clockSeconds * 42) * this.shake * 0.1 : 0;
    const cameraTarget = this.basis.fromBasisComponents(this.playerX * 0.14 + shakeX, 0.46, -2.0);
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

const game = new CardDashGame();

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

window.__IX9_CARD_DASH__ = {
  start: startGame,
  restart: restartGame,
  state: () => ui.getState(),
};
