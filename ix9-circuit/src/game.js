import * as THREE from 'three';
import { DEFAULT_WORLD_BASIS } from '../gameblocks/modules/math/WorldBasis.js';
import { RandomGenerator } from '../gameblocks/modules/math/RandomUtils.js';
import { clamp, lerp, smoothToward } from '../gameblocks/modules/math/ScalarUtils.js';
import { UiStateModel } from '../gameblocks/modules/user-interface/UiStateModel.js';
import { DomHudRenderer } from '../gameblocks/modules/user-interface/DomHudRenderer.js';
import { disposeObject3D } from '../gameblocks/modules/world/Object3DUtils.js';

const canvas = document.querySelector('#gameCanvas');
const app = document.querySelector('#app');
const startOverlay = document.querySelector('#startOverlay');
const finishOverlay = document.querySelector('#finishOverlay');
const startButton = document.querySelector('#startButton');
const restartButton = document.querySelector('#restartButton');

const BEST_LAP_KEY = 'ix9-circuit-best-lap';
const BEST_SCORE_KEY = 'ix9-circuit-best-score';
const WORLD_SEED = (Date.now() ^ 0x9c1c1717) >>> 0;
const TRACK_WIDTH = 4.35;
const HALF_TRACK = TRACK_WIDTH / 2;
const MAX_LAPS = 3;
const CHECKPOINT_COUNT = 9;
const CHECKPOINTS = Array.from({ length: CHECKPOINT_COUNT }, (_, index) => ((index + 1) / CHECKPOINT_COUNT) % 1);

function readStoredNumber(key) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function writeStoredNumber(key, value) {
  localStorage.setItem(key, String(value));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--';
  return `${seconds.toFixed(1)}s`;
}

function formatLiveTime(seconds) {
  return `${Math.max(0, seconds).toFixed(1)}s`;
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

function makeTrackTexture() {
  const texture = makeCanvasTexture((ctx, width, height) => {
    ctx.fillStyle = '#f7f0df';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(31, 102, 167, 0.22)';
    ctx.lineWidth = 7;
    for (let y = 20; y < height; y += 76) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y + 28);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(207, 60, 50, 0.18)';
    ctx.lineWidth = 5;
    for (let i = 0; i < 9; i += 1) {
      const x = 42 + i * 52;
      ctx.beginPath();
      ctx.ellipse(x % width, 92 + (i % 3) * 110, 28, 11, i * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.6, 14);
  return texture;
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
  sprite.scale.set(options.scaleX ?? 2.1, options.scaleY ?? 0.58, 1);
  return sprite;
}

function makePlateTexture(symbol = '9') {
  return makeCanvasTexture((ctx, size) => {
    const center = size / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#f8f1df';
    ctx.beginPath();
    ctx.arc(center, center, size * 0.44, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f66a7';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.arc(center, center, size * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#cf3c32';
    ctx.lineWidth = 8;
    for (let i = 0; i < 9; i += 1) {
      const angle = (i / 9) * Math.PI * 2;
      const x = center + Math.cos(angle) * size * 0.26;
      const y = center + Math.sin(angle) * size * 0.26;
      ctx.beginPath();
      ctx.ellipse(x, y, 22, 9, angle, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#193f79';
    ctx.font = `900 ${Math.round(size * 0.34)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, center, center + 4);
  });
}

function circularDistance(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

function crossedProgress(previous, current, target) {
  if (current >= previous) {
    return previous < target && target <= current;
  }
  return target > previous || target <= current;
}

function createCircuitCurve() {
  const points = [
    new THREE.Vector3(0, 0, 8.8),
    new THREE.Vector3(5.4, 0, 7.2),
    new THREE.Vector3(8.1, 0, 2.2),
    new THREE.Vector3(6.0, 0, -3.2),
    new THREE.Vector3(1.9, 0, -6.2),
    new THREE.Vector3(-2.5, 0, -7.4),
    new THREE.Vector3(-7.4, 0, -4.3),
    new THREE.Vector3(-8.2, 0, 1.4),
    new THREE.Vector3(-4.7, 0, 6.8),
  ];
  return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.62);
}

function normalFromTangent(tangent, target = new THREE.Vector3()) {
  return target.set(tangent.z, 0, -tangent.x).normalize();
}

function createTrackGeometry(curve, width, segments = 216) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const half = width / 2;

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const normal = normalFromTangent(tangent);
    const left = center.clone().addScaledVector(normal, half);
    const right = center.clone().addScaledVector(normal, -half);
    left.y = 0.04;
    right.y = 0.04;

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, i / 12, 1, i / 12);
  }

  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

const ui = new UiStateModel({
  lap: 1,
  speed: 0,
  checkpoint: 0,
  boost: 0,
  boostMax: 9,
  lapTime: 0,
  bestLap: readStoredNumber(BEST_LAP_KEY),
  message: 'Ready',
  messageVisible: false,
  finalScore: 0,
  finalBestLap: readStoredNumber(BEST_LAP_KEY),
}, true);

new DomHudRenderer(ui)
  .bindText('[data-ui="lap"]', 'lap')
  .bindText('[data-ui="speed"]', 'speed', (value) => String(Math.round(value ?? 0)))
  .bindText('[data-ui="checkpoint"]', 'checkpoint')
  .bindText('[data-ui="lapTime"]', 'lapTime', formatLiveTime)
  .bindText('[data-ui="bestLap"]', 'bestLap', formatTime)
  .bindStyleWidth('[data-ui="boostFill"]', 'boost', 'boostMax')
  .bindText('[data-ui="message"]', 'message')
  .bindClassToggle('.toast', 'messageVisible', 'is-visible')
  .bindText('[data-ui="finalScore"]', 'finalScore')
  .bindText('[data-ui="finalBestLap"]', 'finalBestLap', formatTime)
  .attach();

function showToast(text, duration = 900) {
  ui.patch({ message: text, messageVisible: true });
  clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    ui.patch({ messageVisible: false });
  }, duration);
}

class CircuitGame {
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
    this.scene.fog = new THREE.Fog('#071316', 20, 66);

    this.camera = new THREE.PerspectiveCamera(56, 1, 0.1, 110);
    this.basis = DEFAULT_WORLD_BASIS;
    this.rng = new RandomGenerator(WORLD_SEED);
    this.curve = createCircuitCurve();
    this.trackLength = this.curve.getLength();
    this.cameraPosition = new THREE.Vector3();
    this.cameraLook = new THREE.Vector3();
    this.pickups = [];
    this.hazards = [];
    this.effects = [];
    this.checkpointGates = [];

    this.makeMaterials();
    this.makeScene();
    this.addEvents();
    this.resize();
    this.reset();
  }

  makeMaterials() {
    this.materials = {
      ground: new THREE.MeshStandardMaterial({ color: '#0b2026', roughness: 0.94 }),
      track: new THREE.MeshStandardMaterial({ color: '#f7f0df', map: makeTrackTexture(), roughness: 0.62, metalness: 0.02 }),
      cobalt: new THREE.MeshStandardMaterial({ color: '#1f66a7', roughness: 0.56 }),
      red: new THREE.MeshStandardMaterial({ color: '#cf3c32', roughness: 0.56 }),
      gold: new THREE.MeshStandardMaterial({ color: '#e2b34a', roughness: 0.36, metalness: 0.38 }),
      green: new THREE.MeshStandardMaterial({ color: '#3ba57a', roughness: 0.5 }),
      ink: new THREE.MeshStandardMaterial({ color: '#10272f', roughness: 0.64 }),
      porcelain: new THREE.MeshStandardMaterial({ color: '#f8f1df', roughness: 0.62, metalness: 0.04 }),
      porcelainWarm: new THREE.MeshStandardMaterial({ color: '#ead9b7', roughness: 0.72 }),
      tire: new THREE.MeshStandardMaterial({ color: '#111b1e', roughness: 0.82 }),
      glass: new THREE.MeshStandardMaterial({ color: '#6ac4d5', roughness: 0.18, metalness: 0.08, transparent: true, opacity: 0.72 }),
      skin: new THREE.MeshStandardMaterial({ color: '#f3c7a6', roughness: 0.72 }),
      hair: new THREE.MeshStandardMaterial({ color: '#2a1a16', roughness: 0.78 }),
      shadow: new THREE.MeshBasicMaterial({ color: '#001112', transparent: true, opacity: 0.28, depthWrite: false }),
    };
    this.plateTexture = makePlateTexture('9');
  }

  makeScene() {
    const hemi = new THREE.HemisphereLight('#f9f5e8', '#12363d', 2.2);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight('#fff3d2', 3.0);
    key.position.set(-5, 9, 7);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight('#57c2c6', 1.5);
    rim.position.set(6, 5, -8);
    this.scene.add(rim);

    this.world = new THREE.Group();
    this.scene.add(this.world);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(72, 72), this.materials.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.025;
    this.world.add(ground);

    this.makeTrack();
    this.makePaddock();
    this.makePickups();
    this.makeHazards();

    this.car = this.makeKart();
    this.scene.add(this.car);

    this.carShadow = new THREE.Mesh(new THREE.CircleGeometry(0.92, 36), this.materials.shadow);
    this.carShadow.rotation.x = -Math.PI / 2;
    this.carShadow.position.y = 0.035;
    this.scene.add(this.carShadow);
  }

  makeTrack() {
    const trackMesh = new THREE.Mesh(createTrackGeometry(this.curve, TRACK_WIDTH), this.materials.track);
    this.world.add(trackMesh);

    [HALF_TRACK + 0.08, -HALF_TRACK - 0.08].forEach((offset, index) => {
      const edgeCurve = this.makeOffsetCurve(offset, 216);
      const curb = new THREE.Mesh(
        new THREE.TubeGeometry(edgeCurve, 216, 0.075, 8, true),
        index === 0 ? this.materials.cobalt : this.materials.red
      );
      curb.position.y = 0.09;
      this.world.add(curb);
    });

    for (let i = 0; i < CHECKPOINT_COUNT; i += 1) {
      const progress = CHECKPOINTS[i];
      const gate = this.makeCheckpointGate(i + 1, progress);
      this.world.add(gate);
      this.checkpointGates.push(gate);
    }
  }

  makeOffsetCurve(offset, samples = 144) {
    const points = [];
    for (let i = 0; i < samples; i += 1) {
      const t = i / samples;
      const center = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t).normalize();
      const normal = normalFromTangent(tangent);
      const point = center.clone().addScaledVector(normal, offset);
      point.y = 0.09;
      points.push(point);
    }
    return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5);
  }

  makeCheckpointGate(number, progress) {
    const group = new THREE.Group();
    const pose = this.trackPose(progress, 0);
    group.position.copy(pose.center);
    group.rotation.y = Math.atan2(pose.tangent.x, pose.tangent.z);
    group.userData.baseY = 0;

    const postMat = number === 9 ? this.materials.gold : this.materials.cobalt;
    [-1, 1].forEach((side) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 1.85, 10), postMat);
      post.position.set(side * (HALF_TRACK + 0.55), 0.95, 0);
      group.add(post);
    });

    const beam = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH + 1.28, 0.14, 0.16), number === 9 ? this.materials.gold : this.materials.red);
    beam.visible = false;
    beam.position.y = 2.6;
    group.add(beam);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(TRACK_WIDTH, 0.035, 0.28), number === 9 ? this.materials.gold : this.materials.ink);
    stripe.position.y = 0.085;
    group.add(stripe);

    const label = makeTextSprite(number === 9 ? 'LAP' : `CP ${number}`, {
      width: 520,
      height: 150,
      fontSize: 64,
      scaleX: 1.25,
      scaleY: 0.34,
      fill: '#fff8e3',
      textColor: '#10272f',
      borderColor: number === 9 ? '#e2b34a' : '#1f66a7',
    });
    label.position.set(0, 2.74, 0);
    group.add(label);
    return group;
  }

  makePaddock() {
    const banner = makeTextSprite('IX PARTY / 伊万里 DX 勉強会', {
      width: 820,
      height: 170,
      fontSize: 54,
      scaleX: 4.1,
      scaleY: 0.72,
      fill: '#fff8e3',
      textColor: '#10272f',
      borderColor: '#cf3c32',
    });
    banner.position.set(0, 2.7, 12.2);
    this.world.add(banner);

    const mascot = this.makeImarieMascot(1.15);
    mascot.position.set(-4.8, 0, 10.7);
    mascot.rotation.y = 0.5;
    this.world.add(mascot);

    for (let i = 0; i < 18; i += 1) {
      const progress = i / 18;
      const side = i % 2 === 0 ? 1 : -1;
      const pose = this.trackPose(progress, side * (HALF_TRACK + 1.65 + (i % 3) * 0.22));
      const prop = new THREE.Group();

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 1.2, 8), this.materials.ink);
      pole.position.y = 0.6;
      prop.add(pole);

      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), i % 3 === 0 ? this.materials.gold : this.materials.cobalt);
      lamp.scale.set(1, 1.16, 1);
      lamp.position.y = 1.28;
      prop.add(lamp);

      const plate = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.028, 8, 42), i % 2 === 0 ? this.materials.red : this.materials.gold);
      plate.rotation.x = Math.PI / 2;
      plate.position.y = 0.1;
      prop.add(plate);

      if (i % 6 === 0) {
        const sign = makeTextSprite('九伊万里絵', {
          width: 520,
          height: 150,
          fontSize: 58,
          scaleX: 1.55,
          scaleY: 0.44,
          fill: '#fff8e3',
          textColor: '#10272f',
          borderColor: '#3ba57a',
        });
        sign.position.y = 1.72;
        prop.add(sign);
      }

      prop.position.copy(pose.position);
      prop.rotation.y = Math.atan2(pose.tangent.x, pose.tangent.z) + (side > 0 ? -0.45 : 0.45);
      this.world.add(prop);
    }

    for (let i = 0; i < 9; i += 1) {
      const kiln = new THREE.Mesh(
        new THREE.BoxGeometry(0.9 + (i % 3) * 0.28, 0.78 + (i % 2) * 0.32, 0.9),
        i % 2 === 0 ? this.materials.ink : this.materials.green
      );
      kiln.position.set((i - 4) * 1.28, 0.42, -12.8 - (i % 3) * 1.3);
      kiln.rotation.y = (i % 2 ? 0.22 : -0.18);
      this.world.add(kiln);
    }
  }

  makePickups() {
    const offsets = [0, -1.15, 1.15, 0.72, -0.72, 1.45, -1.45, 0.35, -0.35];
    for (let i = 0; i < 27; i += 1) {
      const progress = ((i + 0.42) / 27) % 1;
      const offset = offsets[i % offsets.length];
      const group = this.makePickup();
      const pose = this.trackPose(progress, offset);
      group.position.copy(pose.position);
      group.position.y = 0.55;
      group.userData.baseY = group.position.y;
      this.world.add(group);
      this.pickups.push({ progress, offset, group, active: true });
    }
  }

  makePickup() {
    const group = new THREE.Group();
    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 52),
      new THREE.MeshStandardMaterial({ map: this.plateTexture, color: '#ffffff', roughness: 0.48, metalness: 0.04, side: THREE.DoubleSide })
    );
    disk.rotation.x = -Math.PI / 2;
    group.add(disk);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 10, 52), this.materials.gold);
    rim.rotation.x = Math.PI / 2;
    group.add(rim);
    return group;
  }

  makeHazards() {
    const offsets = [-1.35, 1.35, 0, 0.92, -0.92];
    for (let i = 0; i < 15; i += 1) {
      const progress = ((i + 0.76) / 15) % 1;
      if (progress < 0.04 || progress > 0.96) continue;
      const offset = offsets[i % offsets.length];
      const group = this.makeHazard(i);
      const pose = this.trackPose(progress, offset);
      group.position.copy(pose.position);
      group.rotation.y = Math.atan2(pose.tangent.x, pose.tangent.z) + (i % 2 ? 0.2 : -0.2);
      this.world.add(group);
      this.hazards.push({ progress, offset, group, cooldown: 0 });
    }
  }

  makeHazard(index) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.74, 18), index % 2 === 0 ? this.materials.red : this.materials.ink);
    base.position.y = 0.37;
    group.add(base);

    const band = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 8, 36), this.materials.gold);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.42;
    group.add(band);

    if (index % 5 === 0) {
      const label = makeTextSprite('DX', {
        width: 320,
        height: 130,
        fontSize: 62,
        scaleX: 0.9,
        scaleY: 0.34,
        fill: '#fff8e3',
        textColor: '#10272f',
        borderColor: '#cf3c32',
      });
      label.position.y = 1.0;
      group.add(label);
    }
    return group;
  }

  makeKart() {
    const group = new THREE.Group();

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.28, 1.45), this.materials.red);
    chassis.position.y = 0.38;
    group.add(chassis);

    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.32, 0.86), this.materials.porcelain);
    shell.position.set(0, 0.62, -0.05);
    group.add(shell);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.76, 4), this.materials.cobalt);
    nose.rotation.y = Math.PI / 4;
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.48, 0.78);
    group.add(nose);

    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.32),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture('9', { width: 220, height: 150, fontSize: 92, borderColor: '#1f66a7' }), transparent: true })
    );
    plate.rotation.x = -0.48;
    plate.position.set(0, 0.82, 0.42);
    group.add(plate);

    this.wheels = [];
    [-0.62, 0.62].forEach((x) => {
      [-0.46, 0.48].forEach((z) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.22, 18), this.materials.tire);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.27, z);
        this.wheels.push(wheel);
        group.add(wheel);
      });
    });

    const driver = this.makeImarieMascot(0.52);
    driver.position.set(0, 0.7, -0.26);
    group.add(driver);

    const label = makeTextSprite('九伊万里絵', {
      width: 540,
      height: 150,
      fontSize: 60,
      scaleX: 1.45,
      scaleY: 0.4,
      fill: '#fff8e3',
      textColor: '#10272f',
      borderColor: '#3ba57a',
    });
    label.position.set(0, 1.78, -0.05);
    group.add(label);
    return group;
  }

  makeImarieMascot(scale = 1) {
    const group = new THREE.Group();
    group.scale.setScalar(scale);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.48, 0.86, 24), this.materials.porcelain);
    body.position.y = 0.62;
    group.add(body);

    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.09), this.materials.red);
    sash.position.set(0, 0.58, 0.39);
    group.add(sash);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 24, 18), this.materials.skin);
    head.position.y = 1.22;
    group.add(head);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 14), this.materials.hair);
    hair.scale.set(1.06, 0.82, 0.92);
    hair.position.set(0, 1.33, -0.04);
    group.add(hair);

    const fringe = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 16), this.materials.hair);
    fringe.rotation.x = Math.PI / 2;
    fringe.position.set(0, 1.27, 0.29);
    group.add(fringe);

    [-0.1, 0.1].forEach((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.033, 12, 8), this.materials.ink);
      eye.position.set(x, 1.24, 0.31);
      group.add(eye);
    });

    const fan = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 10, 52), this.materials.cobalt);
    fan.rotation.x = Math.PI / 2;
    fan.position.set(0, 0.76, -0.08);
    group.add(fan);
    return group;
  }

  addEvents() {
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => window.setTimeout(() => this.resize(), 80));

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.running = false;
      showToast('WebGLを再接続しています', 1600);
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
      if (event.code === 'ArrowUp' || event.code === 'Space') {
        event.preventDefault();
        this.keyThrottle = true;
      }
      if ((event.code === 'Enter') && !this.running && !this.finished) {
        event.preventDefault();
        startGame();
      }
    });
    window.addEventListener('keyup', (event) => {
      if ((event.code === 'ArrowLeft' || event.code === 'KeyA') && this.keyAxis < 0) this.keyAxis = 0;
      if ((event.code === 'ArrowRight' || event.code === 'KeyD') && this.keyAxis > 0) this.keyAxis = 0;
      if (event.code === 'ArrowUp' || event.code === 'Space') this.keyThrottle = false;
    });

    document.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  }

  resize() {
    const width = Math.max(1, app.clientWidth);
    const height = Math.max(1, app.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = width < height ? 59 : 50;
    this.camera.updateProjectionMatrix();
  }

  reset() {
    this.effects.forEach((effect) => disposeObject3D(effect.group));
    this.effects = [];
    this.pickups.forEach((pickup) => {
      pickup.active = true;
      pickup.group.visible = true;
    });
    this.hazards.forEach((hazard) => {
      hazard.cooldown = 0;
      hazard.group.visible = true;
    });

    this.running = false;
    this.finished = false;
    this.completedLaps = 0;
    this.nextCheckpoint = 0;
    this.progress = 0.018;
    this.previousProgress = this.progress;
    this.lateralOffset = 0;
    this.lateralTarget = 0;
    this.lateralVelocity = 0;
    this.speed = 0;
    this.boost = 0;
    this.boostTimer = 0;
    this.score = 0;
    this.lapTime = 0;
    this.totalTime = 0;
    this.clockSeconds = 0;
    this.pointerId = null;
    this.pointerThrottle = false;
    this.keyThrottle = false;
    this.keyAxis = 0;
    this.hitCooldown = 0;
    this.updateCarPose(1 / 60);
    this.updateCamera(1 / 60, true);
    this.patchUi();
  }

  start() {
    if (this.finished) this.reset();
    this.running = true;
    this.finished = false;
    showToast('9CPを抜けろ', 850);
  }

  onPointerDown(event) {
    event.preventDefault();
    if (this.finished) return;
    if (!this.running && startOverlay.hidden) {
      this.start();
    }
    this.pointerId = event.pointerId;
    this.pointerThrottle = true;
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
    this.pointerThrottle = false;
    app.releasePointerCapture?.(event.pointerId);
  }

  setTargetFromClientX(clientX) {
    const rect = app.getBoundingClientRect();
    const normalized = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    this.lateralTarget = lerp(-HALF_TRACK - 0.3, HALF_TRACK + 0.3, normalized);
  }

  patchUi() {
    ui.patch({
      lap: Math.min(MAX_LAPS, this.completedLaps + 1),
      speed: this.speed * 8.2,
      checkpoint: this.nextCheckpoint,
      boost: this.boost,
      lapTime: this.lapTime,
      bestLap: readStoredNumber(BEST_LAP_KEY),
      finalScore: this.score,
      finalBestLap: readStoredNumber(BEST_LAP_KEY),
    });
  }

  update(deltaSeconds) {
    const dt = clamp(deltaSeconds, 0, 1 / 30);
    this.clockSeconds += dt;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);

    if (this.running) {
      this.updateRace(dt);
    } else {
      this.speed = smoothToward(this.speed, 0, 0.5, dt);
      this.lateralOffset = smoothToward(this.lateralOffset, 0, 0.5, dt);
    }

    this.updateCarPose(dt);
    this.updateCollectables(dt);
    this.updateEffects(dt);
    this.updateCamera(dt);
    this.animateWorld(dt);
  }

  updateRace(dt) {
    this.lapTime += dt;
    this.totalTime += dt;

    if (this.keyAxis !== 0) {
      this.lateralTarget = clamp(this.lateralTarget + this.keyAxis * dt * 5.0, -HALF_TRACK - 0.3, HALF_TRACK + 0.3);
    }

    const previousLateral = this.lateralOffset;
    this.lateralOffset = smoothToward(this.lateralOffset, this.lateralTarget, 0.11, dt);
    this.lateralVelocity = (this.lateralOffset - previousLateral) / Math.max(dt, 1 / 120);

    const throttle = this.pointerThrottle || this.keyThrottle ? 1 : 0.52;
    const lapPressure = this.completedLaps * 0.45;
    const edgePenalty = Math.max(0, Math.abs(this.lateralOffset) - (HALF_TRACK - 0.2));
    const boostBonus = this.boostTimer > 0 ? 3.2 : 0;
    const targetSpeed = 4.4 + throttle * 2.7 + lapPressure + boostBonus - edgePenalty * 5.2;
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    this.speed = smoothToward(this.speed, clamp(targetSpeed, 3.2, 11.5), 0.34, dt);

    this.previousProgress = this.progress;
    this.progress = (this.progress + (this.speed * dt) / this.trackLength) % 1;
    this.updateCheckpoints(this.previousProgress, this.progress);
    this.patchUi();
  }

  updateCheckpoints(previousProgress, currentProgress) {
    const target = CHECKPOINTS[this.nextCheckpoint];
    if (!crossedProgress(previousProgress, currentProgress, target)) return;

    this.nextCheckpoint += 1;
    this.score += 90 + this.completedLaps * 9;
    this.boost = Math.min(9, this.boost + 1);
    this.spawnSpark(this.trackPose(target, 0).position.add(new THREE.Vector3(0, 1.2, 0)), `CP ${this.nextCheckpoint}`);

    if (this.nextCheckpoint >= CHECKPOINT_COUNT) {
      this.finishLap();
    } else if (this.nextCheckpoint === 8) {
      showToast('あと1CP', 650);
    }
  }

  finishLap() {
    this.completedLaps += 1;
    const bestLap = readStoredNumber(BEST_LAP_KEY);
    if (bestLap <= 0 || this.lapTime < bestLap) {
      writeStoredNumber(BEST_LAP_KEY, this.lapTime);
      showToast('Best Lap!', 1000);
    } else {
      showToast(`Lap ${this.completedLaps}`, 800);
    }

    this.score += 900 + Math.round(Math.max(0, 80 - this.lapTime) * 9);
    this.nextCheckpoint = 0;
    this.boost = Math.min(9, this.boost + 2);
    this.lapTime = 0;
    this.pickups.forEach((pickup) => {
      pickup.active = true;
      pickup.group.visible = true;
    });

    if (this.completedLaps >= MAX_LAPS) {
      this.finishRace();
    }
  }

  finishRace() {
    this.running = false;
    this.finished = true;
    const bestScore = Math.max(readStoredNumber(BEST_SCORE_KEY), this.score);
    writeStoredNumber(BEST_SCORE_KEY, bestScore);
    ui.patch({
      finalScore: this.score,
      finalBestLap: readStoredNumber(BEST_LAP_KEY),
      messageVisible: false,
    });
    this.spawnSpark(this.trackPose(this.progress, 0).position.add(new THREE.Vector3(0, 1.6, 0)), 'FINISH');
    navigator.vibrate?.([50, 30, 50]);
    window.setTimeout(() => {
      finishOverlay.hidden = false;
    }, 520);
  }

  updateCollectables(dt) {
    this.pickups.forEach((pickup, index) => {
      pickup.group.rotation.y += dt * 1.8;
      pickup.group.position.y = pickup.group.userData.baseY + Math.sin(this.clockSeconds * 4 + index) * 0.08;
      if (!this.running || !pickup.active) return;

      const along = circularDistance(this.progress, pickup.progress) * this.trackLength;
      const lateral = Math.abs(this.lateralOffset - pickup.offset);
      if (along < 0.86 && lateral < 0.72) {
        pickup.active = false;
        pickup.group.visible = false;
        this.collectPickup(pickup);
      }
    });

    this.hazards.forEach((hazard, index) => {
      hazard.group.rotation.y += Math.sin(this.clockSeconds * 2 + index) * dt * 0.18;
      hazard.cooldown = Math.max(0, hazard.cooldown - dt);
      if (!this.running || hazard.cooldown > 0) return;
      const along = circularDistance(this.progress, hazard.progress) * this.trackLength;
      const lateral = Math.abs(this.lateralOffset - hazard.offset);
      if (along < 0.74 && lateral < 0.54 && this.hitCooldown <= 0) {
        this.hitHazard(hazard);
      }
    });
  }

  collectPickup(pickup) {
    this.score += 19;
    this.boost = Math.min(9, this.boost + 1);
    this.spawnSpark(pickup.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), '+9');
    if (this.boost >= 9) {
      this.boost = 0;
      this.boostTimer = 3.2;
      this.score += 99;
      showToast('IX BOOST!', 900);
      navigator.vibrate?.(30);
    }
  }

  hitHazard(hazard) {
    hazard.cooldown = 1.8;
    this.hitCooldown = 0.7;
    this.speed *= 0.56;
    this.boost = Math.max(0, this.boost - 3);
    this.score = Math.max(0, this.score - 27);
    this.spawnSpark(hazard.group.position.clone().add(new THREE.Vector3(0, 0.7, 0)), 'SLOW');
    showToast('減速', 520);
    navigator.vibrate?.(45);
  }

  trackPose(progress, lateral = 0) {
    const center = this.curve.getPointAt(progress);
    const tangent = this.curve.getTangentAt(progress).normalize();
    const normal = normalFromTangent(tangent);
    const position = center.clone().addScaledVector(normal, lateral);
    position.y = 0.08;
    return { center, tangent, normal, position };
  }

  updateCarPose(dt) {
    const pose = this.trackPose(this.progress, this.lateralOffset);
    const steering = clamp(this.lateralVelocity * 0.045, -0.42, 0.42);
    this.car.position.copy(pose.position);
    this.car.position.y = 0.08 + Math.sin(this.clockSeconds * (this.running ? 13 : 3)) * 0.018;
    this.car.rotation.set(0, Math.atan2(pose.tangent.x, pose.tangent.z) + steering, -steering * 0.72);

    this.carShadow.position.copy(pose.position);
    this.carShadow.position.y = 0.035;
    this.carShadow.scale.set(1.2 + Math.abs(steering) * 0.5, 0.72, 1);

    const spin = this.speed * dt * 2.8;
    this.wheels.forEach((wheel) => {
      wheel.rotation.x += spin;
    });
  }

  updateCamera(dt, snap = false) {
    const pose = this.trackPose(this.progress, this.lateralOffset);
    const portrait = app.clientHeight >= app.clientWidth;
    const distance = portrait ? 8.8 : 10.2;
    const height = portrait ? 5.45 : 6.0;
    const desiredPosition = pose.position.clone()
      .addScaledVector(pose.tangent, -distance)
      .addScaledVector(pose.normal, -this.lateralOffset * 0.18)
      .add(this.basis.upVector().multiplyScalar(height));
    const desiredLook = pose.position.clone()
      .addScaledVector(pose.tangent, portrait ? 4.8 : 6.0)
      .add(this.basis.upVector().multiplyScalar(0.9));

    if (snap || this.cameraPosition.lengthSq() <= 0.0001) {
      this.cameraPosition.copy(desiredPosition);
      this.cameraLook.copy(desiredLook);
    } else {
      const alpha = clamp(dt * 5.2, 0, 1);
      this.cameraPosition.lerp(desiredPosition, alpha);
      this.cameraLook.lerp(desiredLook, alpha);
    }

    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.cameraLook);
  }

  animateWorld(dt) {
    this.checkpointGates.forEach((gate, index) => {
      const active = index === this.nextCheckpoint && this.running;
      gate.position.y = (gate.userData.baseY ?? 0) + (active ? Math.sin(this.clockSeconds * 6) * 0.08 : 0);
      gate.children.forEach((child) => {
        if (child.isSprite) child.material.opacity = active ? 0.94 : 0.42;
      });
    });
  }

  spawnSpark(position, text) {
    const group = new THREE.Group();
    const label = makeTextSprite(text, {
      width: 480,
      height: 150,
      fontSize: 68,
      scaleX: 1.28,
      scaleY: 0.4,
      fill: '#fff8e3',
      textColor: '#10272f',
      borderColor: text.includes('SLOW') ? '#cf3c32' : '#e2b34a',
    });
    label.position.copy(position);
    group.add(label);

    const particles = [];
    for (let i = 0; i < 12; i += 1) {
      const mat = (i % 3 === 0 ? this.materials.red : i % 3 === 1 ? this.materials.cobalt : this.materials.gold).clone();
      mat.transparent = true;
      mat.opacity = 0.95;
      const particle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), mat);
      particle.position.copy(position);
      const velocity = new THREE.Vector3(
        this.rng.uniform(-1.0, 1.0),
        this.rng.uniform(0.35, 1.6),
        this.rng.uniform(-1.0, 1.0)
      );
      particles.push({ particle, velocity });
      group.add(particle);
    }

    this.scene.add(group);
    this.effects.push({ group, particles, life: 0.86, maxLife: 0.86 });
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      effect.life -= dt;
      const alpha = clamp(effect.life / effect.maxLife, 0, 1);
      effect.group.children.forEach((child) => {
        if (child.isSprite) {
          child.position.y += dt * 1.0;
          child.material.opacity = alpha;
        }
      });
      effect.particles.forEach(({ particle, velocity }) => {
        velocity.y -= dt * 2.2;
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

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

const game = new CircuitGame();

function startGame() {
  startOverlay.hidden = true;
  finishOverlay.hidden = true;
  game.start();
}

function restartGame() {
  game.reset();
  finishOverlay.hidden = true;
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

window.__IX9_CIRCUIT__ = {
  start: startGame,
  restart: restartGame,
  state: () => ui.getState(),
};
