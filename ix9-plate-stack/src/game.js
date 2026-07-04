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

const STORAGE_KEY = 'ix9-plate-stack-best';
const BLOCK_HEIGHT = 0.34;
const MAX_SIZE = 2.9;
const MIN_OVERLAP = 0.18;
const PERFECT_TOLERANCE = 0.105;
const WORLD_SEED = (Date.now() ^ 0x579999) >>> 0;

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
  floor: 0,
  combo: 0,
  comboMax: 9,
  message: 'タップで積む',
  messageVisible: false,
  finalScore: 0,
  finalBest: readBestScore(),
}, true);

new DomHudRenderer(ui)
  .bindText('[data-ui="score"]', 'score')
  .bindText('[data-ui="best"]', 'best')
  .bindText('[data-ui="floor"]', 'floor')
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

function makePlateTexture(label = 'IX', accent = '#cf3c32') {
  return makeCanvasTexture((ctx, width, height) => {
    ctx.fillStyle = '#f8f1df';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1f66a7';
    ctx.lineWidth = 18;
    roundRect(ctx, 30, 30, width - 60, height - 60, 38);
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 8;
    for (let i = 0; i < 9; i += 1) {
      const x = 80 + i * ((width - 160) / 8);
      ctx.beginPath();
      ctx.moveTo(x, 78);
      ctx.lineTo(x + 24 * Math.sin(i), height - 78);
      ctx.stroke();
    }

    ctx.fillStyle = '#102f68';
    ctx.font = `900 ${Math.round(height * 0.34)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, width / 2, height / 2 + 4);

    ctx.strokeStyle = '#e2b34a';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, height * 0.28, 0, Math.PI * 2);
    ctx.stroke();
  }, 512, 512);
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

class PlateStackGame {
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
    this.scene.fog = new THREE.Fog('#071316', 18, 72);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 90);
    this.basis = DEFAULT_WORLD_BASIS;
    this.cameraRig = new PositionFollowCameraRig({
      azimuth: Math.PI * 0.16,
      distance: 8.2,
      height: 5.6,
      lookHeight: 1.2,
      positionLag: 0.08,
      lookLag: 0.08,
      basis: this.basis,
    });

    this.rng = new RandomGenerator(WORLD_SEED);
    this.blocks = [];
    this.fragments = [];
    this.effects = [];
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
      porcelain: new THREE.MeshStandardMaterial({ color: '#f8f1df', roughness: 0.58, metalness: 0.04 }),
      porcelainWarm: new THREE.MeshStandardMaterial({ color: '#ead9b7', roughness: 0.7 }),
      cobalt: new THREE.MeshStandardMaterial({ color: '#1f66a7', roughness: 0.55 }),
      red: new THREE.MeshStandardMaterial({ color: '#cf3c32', roughness: 0.55 }),
      gold: new THREE.MeshStandardMaterial({ color: '#e2b34a', roughness: 0.34, metalness: 0.4 }),
      green: new THREE.MeshStandardMaterial({ color: '#3ba57a', roughness: 0.48, metalness: 0.08 }),
      ink: new THREE.MeshStandardMaterial({ color: '#10272f', roughness: 0.62 }),
      shadow: new THREE.MeshBasicMaterial({ color: '#001112', transparent: true, opacity: 0.28, depthWrite: false }),
    };

    this.textures = [
      makePlateTexture('IX', '#cf3c32'),
      makePlateTexture('9', '#e2b34a'),
      makePlateTexture('DX', '#3ba57a'),
    ];
  }

  makeScene() {
    const hemi = new THREE.HemisphereLight('#f9f5e8', '#16313a', 2.1);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight('#fff3d2', 2.8);
    key.position.set(-4, 8, 6);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight('#57c2c6', 1.35);
    rim.position.set(4, 4, -8);
    this.scene.add(rim);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), this.materials.ink);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    this.scene.add(floor);

    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.04, 8, 96), this.materials.gold);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = 0.02;
    this.scene.add(baseRing);

    this.makeSideProps();
    this.makeBackdrop();
  }

  makeSideProps() {
    for (let i = 0; i < 18; i += 1) {
      const prop = new THREE.Group();
      const angle = (i / 18) * Math.PI * 2;
      const radius = 4.2 + (i % 3) * 0.55;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.18, 8), this.materials.ink);
      pole.position.y = 0.58;
      prop.add(pole);

      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), i % 2 === 0 ? this.materials.gold : this.materials.cobalt);
      orb.position.y = 1.25;
      prop.add(orb);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.018, 8, 40), this.materials.cobalt);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.05;
      prop.add(ring);

      prop.position.set(x, 0, z);
      this.scene.add(prop);
      this.sideProps.push(prop);
    }
  }

  makeBackdrop() {
    const kilnMat = new THREE.MeshStandardMaterial({ color: '#173c45', roughness: 0.9 });
    const group = new THREE.Group();
    for (let i = 0; i < 9; i += 1) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.7 + (i % 3) * 0.22, 0.9 + (i % 2) * 0.35, 0.7), kilnMat);
      block.position.set((i - 4) * 0.8, 0.45, -4.7 - (i % 3) * 0.32);
      block.rotation.y = i % 2 ? 0.18 : -0.18;
      group.add(block);
    }
    this.scene.add(group);
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
      event.preventDefault();
      this.tap();
    }, { passive: false });

    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        if (!this.running && !this.dead && startOverlay.hidden) this.start();
        else this.tap();
      }
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
    this.blocks.forEach((block) => disposeObject3D(block.group));
    this.fragments.forEach((fragment) => disposeObject3D(fragment.group));
    this.effects.forEach((effect) => disposeObject3D(effect.group));
    disposeObject3D(this.movingBlock?.group);
    this.blocks = [];
    this.fragments = [];
    this.effects = [];
    this.movingBlock = null;

    this.running = false;
    this.dead = false;
    this.score = 0;
    this.floor = 0;
    this.combo = 0;
    this.perfectStreak = 0;
    this.speed = 2.25;
    this.moveDirection = 1;
    this.moveAxis = 'x';
    this.cameraFocusY = 0.6;
    this.shake = 0;

    const base = this.createBlock({
      x: 0,
      y: BLOCK_HEIGHT / 2,
      z: 0,
      width: MAX_SIZE,
      depth: MAX_SIZE,
      label: 'IX',
      tintIndex: 0,
      settled: true,
    });
    this.scene.add(base.group);
    this.blocks.push(base);
    this.spawnMovingBlock();
    this.patchUi();
  }

  start() {
    if (this.dead) this.reset();
    this.running = true;
    this.dead = false;
    showToast('タイミングよくタップ', 900);
  }

  tap() {
    if (this.dead) return;
    if (!this.running) {
      if (startOverlay.hidden) this.start();
      return;
    }
    this.dropMovingBlock();
  }

  patchUi() {
    ui.patch({
      score: this.score,
      best: Math.max(readBestScore(), this.score),
      floor: this.floor,
      combo: this.combo,
    });
  }

  createBlock({ x, y, z, width, depth, label, tintIndex = 0, settled = false }) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const bodyMaterial = settled && tintIndex % 2 === 1 ? this.materials.porcelainWarm : this.materials.porcelain;
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, BLOCK_HEIGHT, depth), bodyMaterial.clone());
    group.add(body);

    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.94, depth * 0.94),
      new THREE.MeshBasicMaterial({
        map: this.textures[tintIndex % this.textures.length],
        transparent: false,
      })
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = BLOCK_HEIGHT / 2 + 0.003;
    group.add(top);

    const edgeMaterial = tintIndex % 3 === 0 ? this.materials.cobalt : tintIndex % 3 === 1 ? this.materials.red : this.materials.gold;
    const edgeW = 0.04;
    [
      { x: 0, z: depth / 2, w: width, d: edgeW },
      { x: 0, z: -depth / 2, w: width, d: edgeW },
      { x: width / 2, z: 0, w: edgeW, d: depth },
      { x: -width / 2, z: 0, w: edgeW, d: depth },
    ].forEach((edge) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(edge.w, 0.026, edge.d), edgeMaterial.clone());
      strip.position.set(edge.x, BLOCK_HEIGHT / 2 + 0.019, edge.z);
      group.add(strip);
    });

    return { group, x, y, z, width, depth, label, tintIndex };
  }

  spawnMovingBlock() {
    const last = this.blocks[this.blocks.length - 1];
    const axis = this.blocks.length % 2 === 0 ? 'z' : 'x';
    const lane = 3.55;
    const x = axis === 'x' ? -lane : last.x;
    const z = axis === 'z' ? -lane : last.z;
    const y = last.y + BLOCK_HEIGHT;
    const label = (this.floor + 1) % 9 === 0 ? '9' : this.floor % 3 === 0 ? 'IX' : 'DX';
    const tintIndex = this.floor + 1;
    this.moveAxis = axis;
    this.moveDirection = 1;
    this.movingBlock = this.createBlock({
      x,
      y,
      z,
      width: last.width,
      depth: last.depth,
      label,
      tintIndex,
      settled: false,
    });
    this.scene.add(this.movingBlock.group);
  }

  dropMovingBlock() {
    const moving = this.movingBlock;
    const last = this.blocks[this.blocks.length - 1];
    const axis = this.moveAxis;
    const movingSize = axis === 'x' ? moving.width : moving.depth;
    const lastSize = axis === 'x' ? last.width : last.depth;
    const movingCenter = axis === 'x' ? moving.x : moving.z;
    const lastCenter = axis === 'x' ? last.x : last.z;
    const offset = movingCenter - lastCenter;
    const overlap = lastSize - Math.abs(offset);

    if (overlap < MIN_OVERLAP) {
      this.spawnFragmentFromMiss(moving, axis);
      this.movingBlock = null;
      this.finish();
      return;
    }

    const perfect = Math.abs(offset) <= PERFECT_TOLERANCE;
    const nextSize = perfect ? Math.min(MAX_SIZE, lastSize + 0.025) : overlap;
    const nextCenter = perfect
      ? lastCenter
      : lastCenter + offset / 2;

    const settled = {
      x: axis === 'x' ? nextCenter : moving.x,
      z: axis === 'z' ? nextCenter : moving.z,
      y: moving.y,
      width: axis === 'x' ? nextSize : moving.width,
      depth: axis === 'z' ? nextSize : moving.depth,
      label: moving.label,
      tintIndex: moving.tintIndex,
      settled: true,
    };

    if (!perfect) {
      this.spawnTrimFragment(moving, axis, nextCenter, nextSize);
      this.perfectStreak = 0;
    } else {
      this.perfectStreak += 1;
      this.spawnSpark(new THREE.Vector3(moving.x, moving.y + 0.45, moving.z), this.perfectStreak >= 3 ? 'Perfect x3' : 'Perfect');
      navigator.vibrate?.(20);
    }

    disposeObject3D(moving.group);
    this.movingBlock = null;

    const block = this.createBlock(settled);
    this.scene.add(block.group);
    this.blocks.push(block);
    this.floor += 1;
    this.combo = Math.min(9, this.combo + 1);
    this.score += 1 + (perfect ? 1 : 0);

    if (this.combo >= 9) {
      this.combo = 0;
      this.score += 9 + this.perfectStreak;
      this.speed = Math.min(7.6, this.speed + 0.36);
      this.spawnSpark(new THREE.Vector3(block.x, block.y + 0.72, block.z), 'IX RUSH');
      showToast('IX PARTY RUSH!', 1000);
      navigator.vibrate?.(36);
    } else if (perfect) {
      showToast('Perfect', 520);
    }

    this.cameraFocusY = Math.max(this.cameraFocusY, block.y + 1.15);
    this.patchUi();
    this.spawnMovingBlock();
  }

  spawnTrimFragment(moving, axis, keptCenter, keptSize) {
    const movingCenter = axis === 'x' ? moving.x : moving.z;
    const movingSize = axis === 'x' ? moving.width : moving.depth;
    const sign = movingCenter > keptCenter ? 1 : -1;
    const trimSize = Math.max(0.05, movingSize - keptSize);
    const trimCenter = keptCenter + sign * (keptSize / 2 + trimSize / 2);
    const fragment = this.createBlock({
      x: axis === 'x' ? trimCenter : moving.x,
      z: axis === 'z' ? trimCenter : moving.z,
      y: moving.y,
      width: axis === 'x' ? trimSize : moving.width,
      depth: axis === 'z' ? trimSize : moving.depth,
      label: moving.label,
      tintIndex: moving.tintIndex,
      settled: false,
    });
    this.scene.add(fragment.group);
    this.fragments.push({
      group: fragment.group,
      velocity: new THREE.Vector3(axis === 'x' ? sign * 0.9 : 0, -0.18, axis === 'z' ? sign * 0.9 : 0),
      spin: new THREE.Vector3(this.rng.uniform(-1, 1), this.rng.uniform(-1, 1), this.rng.uniform(-1, 1)),
      life: 2.2,
    });
  }

  spawnFragmentFromMiss(moving, axis) {
    this.fragments.push({
      group: moving.group,
      velocity: new THREE.Vector3(axis === 'x' ? Math.sign(moving.x || 1) * 1.4 : 0, -0.18, axis === 'z' ? Math.sign(moving.z || 1) * 1.4 : 0),
      spin: new THREE.Vector3(this.rng.uniform(-1.8, 1.8), this.rng.uniform(-1.8, 1.8), this.rng.uniform(-1.8, 1.8)),
      life: 2.2,
    });
  }

  finish() {
    if (this.dead) return;
    this.dead = true;
    this.running = false;
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
    }, 420);
  }

  spawnSpark(position, text) {
    const group = new THREE.Group();
    const label = makeTextSprite(text, {
      width: 520,
      height: 150,
      fontSize: text.length > 8 ? 54 : 70,
      scaleX: text.length > 8 ? 1.52 : 1.12,
      scaleY: 0.38,
      fill: '#fff8e3',
      textColor: '#10272f',
      borderColor: text.includes('RUSH') ? '#cf3c32' : '#e2b34a',
    });
    label.position.copy(position);
    group.add(label);

    const particles = [];
    for (let i = 0; i < 12; i += 1) {
      const mat = (i % 3 === 0 ? this.materials.red : i % 3 === 1 ? this.materials.cobalt : this.materials.gold).clone();
      mat.transparent = true;
      mat.opacity = 0.96;
      const particle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), mat);
      particle.position.copy(position);
      const velocity = new THREE.Vector3(
        this.rng.uniform(-1.1, 1.1),
        this.rng.uniform(0.36, 1.7),
        this.rng.uniform(-1.1, 1.1)
      );
      particles.push({ particle, velocity });
      group.add(particle);
    }

    this.scene.add(group);
    this.effects.push({ group, particles, life: 0.78, maxLife: 0.78 });
  }

  update(deltaSeconds) {
    const dt = clamp(deltaSeconds, 0, 1 / 30);
    this.clockSeconds += dt;
    this.shake = Math.max(0, this.shake - dt * 2.6);

    if (this.running && this.movingBlock) {
      const block = this.movingBlock;
      const range = 3.55;
      const delta = this.speed * dt * this.moveDirection;
      if (this.moveAxis === 'x') {
        block.x += delta;
        if (block.x > range || block.x < -range) {
          block.x = clamp(block.x, -range, range);
          this.moveDirection *= -1;
        }
        block.group.position.x = block.x;
      } else {
        block.z += delta;
        if (block.z > range || block.z < -range) {
          block.z = clamp(block.z, -range, range);
          this.moveDirection *= -1;
        }
        block.group.position.z = block.z;
      }
      block.group.rotation.y = Math.sin(this.clockSeconds * 4) * 0.035;
    }

    this.updateFragments(dt);
    this.updateEffects(dt);
    this.updateSideProps(dt);
    this.updateCamera(dt);
  }

  updateFragments(dt) {
    for (let i = this.fragments.length - 1; i >= 0; i -= 1) {
      const fragment = this.fragments[i];
      fragment.life -= dt;
      fragment.velocity.y -= dt * 2.8;
      fragment.group.position.addScaledVector(fragment.velocity, dt);
      fragment.group.rotation.x += fragment.spin.x * dt * 3;
      fragment.group.rotation.y += fragment.spin.y * dt * 3;
      fragment.group.rotation.z += fragment.spin.z * dt * 3;
      if (fragment.group.position.y < -5 || fragment.life <= 0) {
        disposeObject3D(fragment.group);
        this.fragments.splice(i, 1);
      }
    }
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

  updateSideProps(dt) {
    this.sideProps.forEach((prop, index) => {
      prop.rotation.y += dt * 0.18;
      const orb = prop.children[1];
      if (orb) orb.scale.setScalar(1 + Math.sin(this.clockSeconds * 4 + index) * 0.08);
    });
  }

  updateCamera(dt) {
    const top = this.blocks[this.blocks.length - 1];
    const targetY = Math.max(0.6, smoothToward(this.cameraFocusY, top.y + 1.1, 0.22, dt));
    this.cameraFocusY = targetY;
    const cameraTarget = this.basis.fromBasisComponents(top.x * 0.16, targetY, top.z * 0.16);
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

const game = new PlateStackGame();

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

window.__IX9_PLATE_STACK__ = {
  start: startGame,
  restart: restartGame,
  state: () => ui.getState(),
};
