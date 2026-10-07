// 3D-модель пластикового окна для сайта «Вариант».
// Модель строится из реальных элементов (рама, импост, створки, уплотнители,
// штапики, стеклопакет, ручки, петли, запорный механизм), поэтому подсветка
// неисправности и разборка показывают фактическое устройство окна.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Цвета модели под фон сцены
const DEFAULT_THEME = {
  hl: '#2F8CEB', // подсветка неисправной детали
  air: '#3E9AE6', // частицы воздуха
  dim: '#8795A7', // размерные линии
  shadow: '30,45,65', // тень под окном, RGB
};

// Профиль, метры (ориентир — 70-мм системы)
const PR = {
  frameFace: 0.064,
  frameDepth: 0.07,
  impost: 0.078,
  overlap: 0.009,
  sashFace: 0.074,
  sashDepth: 0.072,
  sashFront: 0.008,
  bead: 0.02,
  beadDepth: 0.022,
  glassInset: 0.012,
};

// Слои для разнесённой схемы: смещение по глубине в долях масштаба
const LAYERS = {
  frame: -1.0,
  hardware: -0.56,
  seal: -0.26,
  sash: 0,
  glass: 0.36,
  glassSeal: 0.62,
  bead: 0.8,
  handle: 1.08,
};

const EXPLODED_VIEW = { yaw: -0.88, pitch: 0.24 };

const PART_LABELS = [
  { layer: 'frame', text: 'Рама', textMulti: 'Рама и импост', hl: null },
  { layer: 'hardware', text: 'Фурнитура', hl: ['hinge', 'lock'] },
  { layer: 'seal', text: 'Уплотнитель', hl: ['seal'] },
  { layer: 'sash', text: 'Створка', hl: null },
  { layer: 'glass', text: 'Стеклопакет', hl: ['glass'] },
  { layer: 'bead', text: 'Штапик', hl: null },
  { layer: 'handle', text: 'Ручка', hl: ['handle'] },
];

// Что подсвечивается при выборе неисправности
const MODE_HL = {
  close: {},
  draft: { seal: 0.55 },
  handle: { handle: 1 },
  seal: { seal: 1 },
  hardware: { hinge: 1, lock: 1 },
  glass: { glass: 1 },
  complex: { handle: 1, seal: 1, hinge: 1 },
};

const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

function ring(x0, y0, x1, y1, face, depth, bevel = 0.003) {
  const shape = new THREE.Shape();
  shape.moveTo(x0, y0);
  shape.lineTo(x1, y0);
  shape.lineTo(x1, y1);
  shape.lineTo(x0, y1);
  shape.lineTo(x0, y0);
  const ix0 = x0 + face, iy0 = y0 + face, ix1 = x1 - face, iy1 = y1 - face;
  const hole = new THREE.Path();
  hole.moveTo(ix0, iy0);
  hole.lineTo(ix0, iy1);
  hole.lineTo(ix1, iy1);
  hole.lineTo(ix1, iy0);
  hole.lineTo(ix0, iy0);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0005, depth - 2 * bevel),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  geo.translate(0, 0, bevel);
  return geo;
}

// Плоская рамка-полоса для подсветки контура уплотнителя
function band(x0, y0, x1, y1, grow, shrink) {
  const shape = new THREE.Shape();
  shape.moveTo(x0 - grow, y0 - grow);
  shape.lineTo(x1 + grow, y0 - grow);
  shape.lineTo(x1 + grow, y1 + grow);
  shape.lineTo(x0 - grow, y1 + grow);
  shape.lineTo(x0 - grow, y0 - grow);
  const hole = new THREE.Path();
  hole.moveTo(x0 + shrink, y0 + shrink);
  hole.lineTo(x0 + shrink, y1 - shrink);
  hole.lineTo(x1 - shrink, y1 - shrink);
  hole.lineTo(x1 - shrink, y0 + shrink);
  hole.lineTo(x0 + shrink, y0 + shrink);
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape);
}

const AIR_VS = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uPixel;
attribute vec3 aNormal;
attribute float aSeed;
attribute float aU;
varying float vA;
void main() {
  float speed = 0.16 + 0.08 * fract(aSeed * 7.31);
  float life = fract(uTime * speed + aSeed);
  float s = life - aU * 0.07;
  float sc = clamp(s, 0.0, 1.0);
  vec3 p = position;
  // воздух проходит через притвор: над створкой внутрь комнаты и опускается вниз
  p -= aNormal * (0.085 * sc);
  p.z += 0.06 * sc;
  p.y -= 0.06 * sc * sc;
  p += vec3(-aNormal.y, aNormal.x, 0.0) * sin(sc * 6.0 + aSeed * 40.0) * 0.01;
  vA = uOpacity * sin(3.14159 * life) * (1.0 - aU * 0.8) * step(0.0, s);
  gl_PointSize = uPixel * (1.0 - aU * 0.45);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const AIR_FS = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() { gl_FragColor = vec4(uColor, vA); }`;

export class WindowViewer {
  constructor(container, options = {}) {
    this.el = container;
    this.o = {
      width: 1400,
      height: 1400,
      sashes: 2,
      dims: true,
      parts: true,
      tilt: false, // одна створка в режиме проветривания (для главного экрана)
      yaw: -0.3,
      pitch: 0.06,
      pad: { top: 24, right: 24, bottom: 24, left: 24 },
      ...options,
    };
    this.theme = { ...DEFAULT_THEME, ...(options.theme || {}) };
    this.HL = new THREE.Color(this.theme.hl);

    this.cur = { w: this.o.width, h: this.o.height };
    this.target = { w: this.o.width, h: this.o.height };
    this.n = this.o.sashes;
    this.built = { w: 0, h: 0, n: 0 };
    this.mode = null;
    this.hl = { handle: 0, hinge: 0, lock: 0, seal: 0, glass: 0 };
    this.fx = { xray: 0, air: 0, explode: 0, handleTurn: 0, sashOpen: 0 };
    this.exploded = false;
    this.user = { yaw: 0, pitch: 0 };
    this.view = { yaw: this.o.yaw, pitch: this.o.pitch, dist: 0 };
    this.tweens = new Map();
    this.parts = [];
    this.sashes = [];
    this.anchors = [];
    this.time = 0;
    this.visible = false;
    this.raf = 0;
    this.last = 0;
    this.modeStart = 0;

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (err) {
      this.failed = true;
      container.classList.add('is-fallback');
      return;
    }

    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.domElement.classList.add('w3d-canvas');
    r.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(r.domElement);

    this.overlay = document.createElement('div');
    this.overlay.className = 'w3d-overlay';
    this.overlay.innerHTML = '<svg class="w3d-leaders" aria-hidden="true"></svg>';
    container.appendChild(this.overlay);
    this.leaders = this.overlay.querySelector('svg');

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xffffff, 0.6);
    key.position.set(-1.5, 2.5, 3);
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe5ec, 0.35));

    this.camera = new THREE.PerspectiveCamera(26, 1, 0.05, 60);
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.makeMaterials();
    this.makeShared();
    this.makeShadow();
    this.makeLabels();

    this.airUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color(this.theme.air) },
      uPixel: { value: 3 },
    };

    this.tick = this.tick.bind(this);
    this.bindPointer();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.io = new IntersectionObserver((entries) => {
      this.visible = entries[0].isIntersecting;
      if (this.visible) this.invalidate();
    });
    this.io.observe(container);

    this.build();
    this.resize();
    this.view.yaw = this.o.yaw;
    this.view.pitch = this.o.pitch;
  }

  /* ---------- материалы ---------- */

  makeMaterials() {
    const pvc = () =>
      new THREE.MeshPhysicalMaterial({
        color: '#F2F3F1',
        roughness: 0.4,
        clearcoat: 0.25,
        clearcoatRoughness: 0.35,
      });
    const M = {
      frame: pvc(),
      sash: pvc(),
      bead: pvc(),
      seal: new THREE.MeshStandardMaterial({ color: '#33383E', roughness: 0.85 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: '#D3E6E8',
        roughness: 0.03,
        metalness: 0,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        envMapIntensity: 1.3,
        side: THREE.DoubleSide,
      }),
      spacer: new THREE.MeshStandardMaterial({ color: '#AEB5BB', metalness: 0.7, roughness: 0.4 }),
      handle: new THREE.MeshPhysicalMaterial({ color: '#F7F7F5', roughness: 0.28, clearcoat: 0.6 }),
      hinge: new THREE.MeshStandardMaterial({ color: '#D5D9DC', metalness: 0.5, roughness: 0.35 }),
      lock: new THREE.MeshStandardMaterial({ color: '#B9C0C6', metalness: 0.85, roughness: 0.35 }),
      dim: new THREE.LineBasicMaterial({ color: this.theme.dim, transparent: true }),
      sealGlow: new THREE.MeshBasicMaterial({ color: this.HL, transparent: true, opacity: 0, depthWrite: false }),
    };
    for (const m of Object.values(M)) {
      m.userData.base = m.color.clone();
      if (m.emissive) m.userData.baseEmissive = m.emissive.clone();
    }
    M.glass.userData.hlColor = new THREE.Color('#7FBDF2');
    this.M = M;
  }

  makeShared() {
    this.shared = {
      handleBase: new RoundedBoxGeometry(0.03, 0.08, 0.012, 2, 0.005),
      handleNeck: new THREE.CylinderGeometry(0.0085, 0.0085, 0.016, 20).rotateX(Math.PI / 2),
      handleGrip: new RoundedBoxGeometry(0.022, 0.12, 0.016, 3, 0.0075),
      hinge: new RoundedBoxGeometry(0.022, 0.07, 0.022, 2, 0.006),
      cam: new THREE.CylinderGeometry(0.0055, 0.0055, 0.012, 14),
    };
    for (const g of Object.values(this.shared)) g.userData.shared = true;
  }

  makeShadow() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 32, 4, 128, 32, 128);
    const sc = this.theme.shadow;
    g.addColorStop(0, `rgba(${sc},0.42)`);
    g.addColorStop(0.5, `rgba(${sc},0.16)`);
    g.addColorStop(1, `rgba(${sc},0)`);
    x.fillStyle = g;
    x.save();
    x.scale(1, 0.25);
    x.fillRect(0, 0, 256, 256);
    x.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.shadowMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.root.add(this.shadow);
  }

  makeLabels() {
    this.dimLabels = [0, 1].map(() => {
      const d = document.createElement('div');
      d.className = 'w3d-dim';
      this.overlay.appendChild(d);
      return d;
    });
    this.partLabels = PART_LABELS.map((p) => {
      const d = document.createElement('div');
      d.className = 'w3d-part';
      d.textContent = p.text;
      this.overlay.appendChild(d);
      return { ...p, el: d };
    });
  }

  /* ---------- построение модели ---------- */

  addPart(obj, parent, layer, extra = 0) {
    parent.add(obj);
    obj.userData.base = obj.position.clone();
    obj.userData.layer = layer;
    obj.userData.extra = extra;
    this.parts.push(obj);
    return obj;
  }

  disposeModel() {
    if (!this.model) return;
    this.model.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    });
    this.root.remove(this.model);
    this.model = null;
  }

  build() {
    this.disposeModel();
    this.parts = [];
    this.sashes = [];
    const W = this.cur.w / 1000;
    const H = this.cur.h / 1000;
    const n = this.n;
    const M = this.M;
    const ff = PR.frameFace;
    const model = new THREE.Group();
    this.model = model;
    this.root.add(model);

    const mesh = (geo, mat) => new THREE.Mesh(geo, mat);

    // рама
    const frame = mesh(ring(-W / 2, -H / 2, W / 2, H / 2, ff, PR.frameDepth), M.frame);
    frame.position.z = -PR.frameDepth;
    this.addPart(frame, model, 'frame');

    const ox0 = -W / 2 + ff, ox1 = W / 2 - ff, oy0 = -H / 2 + ff, oy1 = H / 2 - ff;
    const cells = [];
    let left = ox0;
    for (let i = 0; i < n; i++) {
      if (i < n - 1) {
        const xc = -W / 2 + ((i + 1) * W) / n;
        const imp = mesh(new RoundedBoxGeometry(PR.impost, oy1 - oy0 + 0.02, PR.frameDepth, 2, 0.003), M.frame);
        imp.position.set(xc, 0, -PR.frameDepth / 2);
        this.addPart(imp, model, 'frame');
        cells.push([left, xc - PR.impost / 2]);
        left = xc + PR.impost / 2;
      } else {
        cells.push([left, ox1]);
      }
    }

    const ov = PR.overlap;
    const sf = PR.sashFace;
    const zF = PR.sashFront;
    const zRail = -0.03;
    const airBases = [];

    cells.forEach(([L, R], i) => {
      const hingeLeft = i < Math.ceil(n / 2);
      const sx0 = L - ov, sx1 = R + ov, sy0 = oy0 - ov, sy1 = oy1 + ov;
      const cx = (sx0 + sx1) / 2, cy = (sy0 + sy1) / 2;
      const sw = sx1 - sx0, sh = sy1 - sy0;
      const hingeX = hingeLeft ? sx0 : sx1;
      const freeX = hingeLeft ? sx1 : sx0;
      const out = hingeLeft ? 1 : -1; // направление от створки к раме на стороне ручки

      // поворотная и откидная оси
      const turn = new THREE.Group();
      turn.position.set(hingeX, 0, zF);
      const tilt = new THREE.Group();
      tilt.position.set(cx - hingeX, sy0, 0);
      const g = new THREE.Group();
      g.position.set(-cx, -sy0, -zF);
      turn.add(tilt);
      tilt.add(g);
      model.add(turn);

      // створка
      const sashRing = mesh(ring(sx0, sy0, sx1, sy1, sf, PR.sashDepth), M.sash);
      sashRing.position.z = zF - PR.sashDepth;
      this.addPart(sashRing, g, 'sash');

      // уплотнитель притвора
      const seal = mesh(ring(sx0 - 0.003, sy0 - 0.003, sx1 + 0.003, sy1 + 0.003, 0.0055, 0.006, 0.001), M.seal);
      seal.position.z = -0.003;
      this.addPart(seal, g, 'seal');
      const sealGlow = mesh(band(sx0, sy0, sx1, sy1, 0.011, 0.002), M.sealGlow);
      sealGlow.position.z = 0.0015;
      sealGlow.renderOrder = 4;
      this.addPart(sealGlow, g, 'seal');

      // штапик
      const ix0 = sx0 + sf, iy0 = sy0 + sf, ix1 = sx1 - sf, iy1 = sy1 - sf;
      const bead = mesh(ring(ix0, iy0, ix1, iy1, PR.bead, PR.beadDepth, 0.002), M.bead);
      const beadBack = zF - 0.003 - PR.beadDepth;
      bead.position.z = beadBack;
      this.addPart(bead, g, 'bead');

      // стеклопакет: 3 стекла, 2 дистанционные рамки
      const gi = PR.glassInset;
      const gx0 = ix0 - gi, gy0 = iy0 - gi, gx1 = ix1 + gi, gy1 = iy1 + gi;
      const gw = gx1 - gx0, gh = gy1 - gy0;
      const paneGeo = new THREE.BoxGeometry(gw, gh, 0.004);
      [0, 1, 2].forEach((k) => {
        const pane = mesh(k === 0 ? paneGeo : paneGeo.clone(), M.glass);
        pane.position.set((gx0 + gx1) / 2, (gy0 + gy1) / 2, beadBack - 0.002 - k * 0.014);
        pane.renderOrder = 2;
        this.addPart(pane, g, 'glass', (1 - k) * 0.1);
      });
      [0, 1].forEach((k) => {
        const sp = mesh(ring(gx0 + 0.003, gy0 + 0.003, gx1 - 0.003, gy1 - 0.003, 0.009, 0.01, 0.0008), M.spacer);
        sp.position.z = beadBack - 0.014 - k * 0.014;
        this.addPart(sp, g, 'glass', (0.5 - k) * 0.1);
      });

      // уплотнитель стеклопакета
      const bx0 = ix0 + PR.bead, by0 = iy0 + PR.bead, bx1 = ix1 - PR.bead, by1 = iy1 - PR.bead;
      const gseal = mesh(ring(bx0 - 0.004, by0 - 0.004, bx1 + 0.004, by1 + 0.004, 0.0068, 0.004, 0.0008), M.seal);
      gseal.position.z = beadBack;
      this.addPart(gseal, g, 'glassSeal');
      const gGlow = mesh(band(bx0, by0, bx1, by1, 0.002, 0.008), M.sealGlow);
      gGlow.position.z = beadBack + 0.0045;
      gGlow.renderOrder = 4;
      this.addPart(gGlow, g, 'glassSeal');

      // ручка
      const hx = hingeLeft ? sx1 - sf / 2 : sx0 + sf / 2;
      const handle = new THREE.Group();
      handle.position.set(hx, cy, zF);
      const base = mesh(this.shared.handleBase, M.handle);
      base.position.z = 0.006;
      handle.add(base);
      const lever = new THREE.Group();
      lever.position.z = 0.012;
      const neck = mesh(this.shared.handleNeck, M.handle);
      neck.position.z = 0.008;
      const grip = mesh(this.shared.handleGrip, M.handle);
      grip.position.set(0, -0.05, 0.02);
      lever.add(neck, grip);
      handle.add(lever);
      this.addPart(handle, g, 'handle');

      // петли (на раме, у оси поворота)
      [sy0 + 0.075, sy1 - 0.075].forEach((y) => {
        const h = mesh(this.shared.hinge, M.hinge);
        h.position.set(hingeX - out * 0.002, y, 0.011);
        this.addPart(h, model, 'hardware');
      });

      // запорный механизм: тяги по периметру и цапфы
      const railX = freeX + out * 0.0016;
      const rails = [
        [new THREE.BoxGeometry(0.003, sh - 0.12, 0.016), railX, cy],
        [new THREE.BoxGeometry(sw - 0.12, 0.003, 0.016), cx, sy1 + 0.0016],
        [new THREE.BoxGeometry(sw - 0.12, 0.003, 0.016), cx, sy0 - 0.0016],
      ];
      rails.forEach(([geo, x, y]) => {
        const m = mesh(geo, M.lock);
        m.position.set(x, y, zRail);
        this.addPart(m, g, 'hardware');
      });
      const cams = [];
      const sideCount = Math.max(2, Math.round(sh / 0.55));
      for (let k = 0; k < sideCount; k++) {
        const y = sy0 + 0.14 + ((sh - 0.28) * k) / (sideCount - 1);
        cams.push({ x: freeX + out * 0.007, y, side: true });
      }
      cams.push({ x: freeX - out * 0.14, y: sy1 + 0.007, side: false });
      cams.push({ x: freeX - out * 0.14, y: sy0 - 0.007, side: false });
      cams.forEach((c) => {
        const cam = mesh(this.shared.cam, M.lock);
        cam.position.set(c.x, c.y, zRail);
        if (c.side) cam.rotation.z = Math.PI / 2;
        this.addPart(cam, g, 'hardware');
        // ответная планка на раме
        const sg = c.side ? new THREE.BoxGeometry(0.006, 0.045, 0.02) : new THREE.BoxGeometry(0.045, 0.006, 0.02);
        const strike = mesh(sg, M.lock);
        const dx = c.side ? out * 0.009 : 0;
        const dy = c.side ? 0 : Math.sign(c.y - cy) * 0.009;
        strike.position.set(c.x + dx, c.y + dy, zRail);
        this.addPart(strike, model, 'frame');
      });

      // точки для визуализации продувания: верхний притвор и сторона ручки,
      // где уплотнитель обычно прижат слабее всего
      const edges = [
        { len: sw, at: (t) => [sx0 + t, sy1 + 0.004], n: [0, 1] },
        { len: sh * 0.75, at: (t) => [freeX + out * 0.004, sy1 - t], n: [out, 0] },
      ];
      edges.forEach((ed) => {
        const count = Math.max(3, Math.round(ed.len * 7));
        for (let k = 0; k < count; k++) {
          const [x, y] = ed.at(((k + 0.2 + Math.random() * 0.6) / count) * ed.len);
          airBases.push([x, y, 0.004, ed.n[0], ed.n[1], Math.random()]);
        }
      });

      this.sashes.push({ turn, tilt, lever, hingeLeft, sx0, sx1, sy0, sy1, cx, cy, hx });
    });

    this.buildAir(model, airBases);
    if (this.o.dims) this.buildDims(model, W, H);

    // тень
    this.shadow.position.set(0, -H / 2 - 0.004, -0.035);
    this.shadow.scale.set(W * 1.35, 0.42, 1);

    // точки привязки подписей разнесённой схемы
    const last = this.sashes[this.sashes.length - 1];
    const lastH = last.sy1 - last.sy0;
    this.anchors = {
      frame: new THREE.Vector3(W / 2 - ff / 2, H / 2 - ff * 0.6, 0),
      hardware: new THREE.Vector3(last.hingeLeft ? last.sx0 : last.sx1, last.sy1 - 0.075, 0.02),
      seal: new THREE.Vector3(last.sx1 + 0.002, last.sy0 + lastH * 0.72, 0.003),
      sash: new THREE.Vector3(last.sx1 - PR.sashFace / 2, last.sy0 + lastH * 0.56, zF),
      glass: new THREE.Vector3(last.sx1 - PR.sashFace - 0.03, last.sy0 + lastH * 0.4, -0.02),
      bead: new THREE.Vector3(last.sx1 - PR.sashFace - PR.bead / 2, last.sy0 + lastH * 0.24, 0.005),
      handle: new THREE.Vector3(last.hx, last.cy - 0.09, zF + 0.035),
    };
    this.partLabels[0].el.textContent = n > 1 ? this.partLabels[0].textMulti : this.partLabels[0].text;
    this.explodeScale = 0.24 + 0.26 * Math.max(W, H);
    this.built = { w: this.cur.w, h: this.cur.h, n };
  }

  buildAir(model, bases) {
    const SEG = 5;
    const vCount = bases.length * SEG;
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    const seed = new Float32Array(vCount);
    const u = new Float32Array(vCount);
    bases.forEach((b, i) => {
      for (let k = 0; k < SEG; k++) {
        const v = i * SEG + k;
        pos.set([b[0], b[1], b[2]], v * 3);
        nor.set([b[3], b[4], 0], v * 3);
        seed[v] = b[5];
        u[v] = k / (SEG - 1);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aNormal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aU', new THREE.BufferAttribute(u, 1));
    if (!this.airMat) {
      this.airMat = new THREE.ShaderMaterial({
        uniforms: this.airUniforms,
        vertexShader: AIR_VS,
        fragmentShader: AIR_FS,
        transparent: true,
        depthWrite: false,
      });
    }
    const points = new THREE.Points(geo, this.airMat);
    points.frustumCulled = false;
    points.renderOrder = 3;
    this.air = points;
    model.add(points);
  }

  buildDims(model, W, H) {
    const d = 0.1;
    const z = 0.012;
    const t = 0.014;
    const top = H / 2 + d;
    const right = W / 2 + d;
    const p = [];
    const seg = (x0, y0, x1, y1) => p.push(x0, y0, z, x1, y1, z);
    // ширина
    seg(-W / 2, H / 2 + 0.018, -W / 2, top + 0.022);
    seg(W / 2, H / 2 + 0.018, W / 2, top + 0.022);
    seg(-W / 2, top, W / 2, top);
    seg(-W / 2 - t, top - t, -W / 2 + t, top + t);
    seg(W / 2 - t, top - t, W / 2 + t, top + t);
    // высота
    seg(W / 2 + 0.018, H / 2, right + 0.022, H / 2);
    seg(W / 2 + 0.018, -H / 2, right + 0.022, -H / 2);
    seg(right, -H / 2, right, H / 2);
    seg(right - t, H / 2 - t, right + t, H / 2 + t);
    seg(right - t, -H / 2 - t, right + t, -H / 2 + t);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    const lines = new THREE.LineSegments(geo, this.M.dim);
    model.add(lines);
    this.dimAnchors = [new THREE.Vector3(0, top, z), new THREE.Vector3(right, 0, z)];
  }

  /* ---------- публичные методы ---------- */

  setSize(w, h, n) {
    if (this.failed) return;
    this.target.w = w;
    this.target.h = h;
    if (n !== this.n) {
      this.n = n;
      this.built.n = -1; // пересобрать с новым числом створок
    }
    this.animate('w', this.cur, 'w', w, 480, ease.outCubic);
    this.animate('h', this.cur, 'h', h, 480, ease.outCubic);
    this.invalidate();
  }

  setMode(mode) {
    if (this.failed || mode === this.mode) return;
    this.mode = mode;
    this.modeStart = this.time;
    const hl = MODE_HL[mode] || {};
    for (const k of Object.keys(this.hl)) this.animate(`hl-${k}`, this.hl, k, hl[k] || 0, 420, ease.outCubic);
    this.animate('xray', this.fx, 'xray', mode === 'hardware' ? 1 : 0, 520, ease.inOutCubic);
    this.animate('air', this.fx, 'air', mode === 'draft' ? 1 : 0, 600, ease.inOutSine);
    if (mode !== 'close') this.animate('sashOpen', this.fx, 'sashOpen', 0, 500, ease.inOutCubic);
    if (mode === 'handle' && !REDUCED) {
      this.fx.handleTurn = 0;
      this.handleAnimStart = this.time + 0.25;
    } else {
      this.handleAnimStart = null;
      this.animate('handleTurn', this.fx, 'handleTurn', 0, 300, ease.outCubic);
    }
    this.syncPartLabels();
    this.invalidate();
  }

  setExploded(on) {
    if (this.failed) return;
    this.exploded = on;
    this.user.yaw = 0;
    this.user.pitch = 0;
    this.animate('explode', this.fx, 'explode', on ? 1 : 0, REDUCED ? 0 : 1300, ease.inOutCubic);
    this.el.classList.toggle('is-exploded', on);
    this.invalidate();
  }

  toggleExploded() {
    this.setExploded(!this.exploded);
    return this.exploded;
  }

  /* ---------- анимация ---------- */

  animate(key, obj, prop, to, dur, easing = ease.outCubic) {
    if (REDUCED || dur <= 0) {
      obj[prop] = to;
      this.tweens.delete(key);
      this.invalidate();
      return;
    }
    const from = obj[prop];
    if (Math.abs(from - to) < 1e-6) {
      this.tweens.delete(key);
      return;
    }
    this.tweens.set(key, { obj, prop, from, to, dur: dur / 1000, t: 0, easing });
    this.invalidate();
  }

  invalidate(force = false) {
    if (this.failed || this.raf || (!this.visible && !force)) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  tick(now) {
    this.raf = 0;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    let busy = false;

    for (const [key, tw] of this.tweens) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.obj[tw.prop] = lerp(tw.from, tw.to, tw.easing(k));
      if (k >= 1) this.tweens.delete(key);
      busy = true;
    }

    // работа створки при «плохо закрывается»
    if (this.mode === 'close' && !this.exploded) {
      if (REDUCED) {
        this.fx.sashOpen = 0.35;
      } else {
        const t = ((this.time - this.modeStart) % 4.6) / 4.6;
        const ajar = 0.08;
        let v;
        if (t < 0.1) v = lerp(0, ajar, ease.outCubic(t / 0.1));
        else if (t < 0.42) v = lerp(ajar, 1, ease.inOutSine((t - 0.1) / 0.32));
        else if (t < 0.52) v = 1;
        else if (t < 0.78) {
          const k = (t - 0.52) / 0.26;
          v = lerp(1, ajar, ease.outCubic(k)) + Math.sin(k * Math.PI) * 0.02;
        } else v = ajar; // створка не доходит до рамы
        this.fx.sashOpen = v;
        busy = true;
      }
    } else if (this.exploded && this.fx.sashOpen > 0) {
      this.fx.sashOpen = Math.max(0, this.fx.sashOpen - dt * 2);
      busy = true;
    }

    // поворот ручки
    if (this.handleAnimStart != null) {
      const t = this.time - this.handleAnimStart;
      if (t >= 0) {
        const T = 1.9;
        const k = t / T;
        if (k < 0.32) this.fx.handleTurn = ease.inOutCubic(k / 0.32);
        else if (k < 0.62) this.fx.handleTurn = 1;
        else if (k < 1) this.fx.handleTurn = 1 - ease.inOutCubic((k - 0.62) / 0.38);
        else {
          this.fx.handleTurn = 0;
          this.handleAnimStart = null;
        }
      }
      busy = true;
    }

    // продувание
    if (this.fx.air > 0.001) {
      if (!REDUCED) this.airUniforms.uTime.value += dt;
      else this.airUniforms.uTime.value = 0.45;
      busy = true;
    }

    // вид
    const e = ease.inOutCubic(this.fx.explode);
    const tYaw = clamp(lerp(this.o.yaw, EXPLODED_VIEW.yaw, e) + this.user.yaw, -1.2, 0.95);
    const tPitch = clamp(lerp(this.o.pitch, EXPLODED_VIEW.pitch, e) + this.user.pitch, -0.22, 0.45);
    const k = 1 - Math.pow(0.0015, dt);
    this.view.yaw += (tYaw - this.view.yaw) * k;
    this.view.pitch += (tPitch - this.view.pitch) * k;
    const fitD = this.fitDistance(e);
    this.view.dist += (fitD - this.view.dist) * (this.view.dist ? k : 1);
    if (Math.abs(tYaw - this.view.yaw) > 1e-4 || Math.abs(tPitch - this.view.pitch) > 1e-4 || Math.abs(fitD - this.view.dist) > 1e-4) busy = true;

    this.apply(e);
    this.renderer.render(this.scene, this.camera);
    this.updateOverlay(e);

    if (busy || this.drag) {
      if (this.visible && !document.hidden) this.raf = requestAnimationFrame(this.tick);
    }
  }

  apply(e) {
    const needBuild =
      this.built.n !== this.n ||
      Math.abs(this.built.w - this.cur.w) > 0.5 ||
      Math.abs(this.built.h - this.cur.h) > 0.5;
    if (needBuild) this.build();

    // разнесённая схема
    const s = this.explodeScale;
    for (const p of this.parts) {
      const layer = LAYERS[p.userData.layer] ?? 0;
      p.position.copy(p.userData.base);
      p.position.z += (layer + p.userData.extra) * s * e;
    }

    // створки
    this.sashes.forEach((sa, i) => {
      const dir = sa.hingeLeft ? -1 : 1;
      const open = i === 0 ? this.fx.sashOpen : 0;
      sa.turn.rotation.y = dir * open * 0.5;
      const tilted = this.o.tilt && i === this.sashes.length - 1;
      sa.tilt.rotation.x = tilted ? 0.11 * (1 - e) : 0;
      let lever = 0;
      if (tilted) lever = Math.PI * (1 - e);
      const turnDir = sa.hingeLeft ? -1 : 1;
      if (i === 0 && this.mode === 'close') lever = (turnDir * Math.PI) / 2 * Math.min(1, open * 3);
      lever += turnDir * (Math.PI / 2) * this.fx.handleTurn;
      sa.lever.rotation.z = lever;
    });

    // материалы
    const HL = this.HL;
    const setHL = (m, v) => {
      m.color.copy(m.userData.base).lerp(HL, 0.85 * v);
      m.emissive.copy(HL).multiplyScalar(0.3 * v);
    };
    setHL(this.M.handle, this.hl.handle);
    setHL(this.M.hinge, this.hl.hinge);
    setHL(this.M.lock, this.hl.lock);
    setHL(this.M.seal, this.hl.seal);
    setHL(this.M.spacer, this.hl.glass);
    this.M.sealGlow.opacity = 0.5 * this.hl.seal;
    const gm = this.M.glass;
    gm.color.copy(gm.userData.base).lerp(gm.userData.hlColor, this.hl.glass);
    gm.opacity = 0.16 + 0.22 * this.hl.glass - 0.06 * this.fx.xray;

    const x = this.fx.xray;
    for (const m of [this.M.frame, this.M.sash, this.M.bead]) {
      const transparent = x > 0.001;
      if (m.transparent !== transparent) {
        m.transparent = transparent;
        m.needsUpdate = true;
      }
      m.opacity = 1 - 0.8 * x;
      m.depthWrite = x < 0.5;
    }

    this.airUniforms.uOpacity.value = 0.6 * this.fx.air * (1 - e);
    if (this.air) this.air.visible = this.fx.air > 0.001 && e < 0.99;
    this.M.dim.opacity = 1 - e;
    this.shadowMat.opacity = 1 - e;

    this.root.rotation.set(this.view.pitch, this.view.yaw, 0, 'XYZ');
    this.placeCamera(e);
  }

  /* ---------- камера и размеры ---------- */

  // Габариты модели на экране: углы общего объёма (с разнесёнными слоями и размерами),
  // повёрнутые так же, как модель (без учёта ручного поворота — чтобы кадр не «дышал»)
  content(e) {
    const W = this.cur.w / 1000;
    const H = this.cur.h / 1000;
    const dm = this.o.dims ? 0.16 * (1 - e) : 0;
    const s = this.explodeScale || 0.5;
    const z0 = -0.075 + LAYERS.frame * s * e;
    const z1 = 0.05 + LAYERS.handle * s * e;
    const yaw = lerp(this.o.yaw, EXPLODED_VIEW.yaw, e);
    const pitch = lerp(this.o.pitch, EXPLODED_VIEW.pitch, e);
    this._m = this._m || new THREE.Matrix4();
    this._e = this._e || new THREE.Euler();
    this._v = this._v || new THREE.Vector3();
    this._m.makeRotationFromEuler(this._e.set(pitch, yaw, 0, 'XYZ'));
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const x of [-W / 2, W / 2 + dm])
      for (const y of [-H / 2 - 0.02, H / 2 + dm])
        for (const z of [z0, z1]) {
          const v = this._v.set(x, y, z).applyMatrix4(this._m);
          minx = Math.min(minx, v.x);
          maxx = Math.max(maxx, v.x);
          miny = Math.min(miny, v.y);
          maxy = Math.max(maxy, v.y);
        }
    const persp = 1 + 0.05 * e;
    return { w: (maxx - minx) * persp, h: (maxy - miny) * persp, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2 };
  }

  pads(e) {
    const p = { ...this.o.pad };
    // панель с легендой и кнопкой поверх сцены: отступ по её фактической высоте
    if (this.o.topBar) p.top = Math.max(p.top, this.o.topBar.offsetHeight + 36);
    const wide = this.width > 560;
    const labelCol = this.o.parts ? e * (wide ? 150 : 0) : 0;
    const bottomLabels = this.o.parts && !wide ? e * 150 : 0;
    return {
      top: p.top,
      right: p.right + labelCol,
      bottom: p.bottom + bottomLabels,
      left: p.left,
    };
  }

  fitDistance(e) {
    if (!this.width) return 5;
    const c = this.content(e);
    const p = this.pads(e);
    const aw = Math.max(80, this.width - p.left - p.right);
    const ah = Math.max(80, this.height - p.top - p.bottom);
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return ((Math.max(c.h / ah, c.w / aw) * this.height) / (2 * tan)) * 1.02;
  }

  placeCamera(e) {
    const c = this.content(e);
    const p = this.pads(e);
    this.camera.position.set(c.cx, c.cy, this.view.dist);
    this.camera.lookAt(c.cx, c.cy, 0);
    const w = this.width, h = this.height;
    this.camera.setViewOffset(w, h, -(p.left - p.right) / 2, -(p.top - p.bottom) / 2, w, h);
    this.camera.updateProjectionMatrix();
  }

  resize() {
    if (this.failed) return;
    const r = this.el.getBoundingClientRect();
    this.width = Math.max(1, Math.round(r.width));
    this.height = Math.max(1, Math.round(r.height));
    this.renderer.setSize(this.width, this.height, false);
    this.airUniforms.uPixel.value = 2.8 * this.renderer.getPixelRatio();
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.view.dist = 0;
    this.invalidate(true);
  }

  /* ---------- подписи ---------- */

  project(v) {
    const p = v.clone().applyMatrix4(this.root.matrixWorld).project(this.camera);
    return { x: ((p.x + 1) / 2) * this.width, y: ((1 - p.y) / 2) * this.height };
  }

  syncPartLabels() {
    const active = MODE_HL[this.mode] || {};
    for (const l of this.partLabels) {
      const on = l.hl && l.hl.some((k) => active[k] > 0.5);
      l.el.classList.toggle('is-active', !!on);
    }
  }

  updateOverlay(e) {
    this.model.updateMatrixWorld(true);
    // размеры
    if (this.o.dims && this.dimAnchors) {
      const [a, b] = this.dimAnchors.map((v) => this.project(v));
      const texts = [this.target.w, this.target.h].map((v) => `${Math.round(v)} мм`);
      [a, b].forEach((pt, i) => {
        const el = this.dimLabels[i];
        if (el.textContent !== texts[i]) el.textContent = texts[i];
        el.style.transform = `translate(${pt.x}px, ${pt.y}px) translate(-50%, -50%)`;
        el.style.opacity = String(1 - e * 1.6);
      });
    } else {
      this.dimLabels.forEach((el) => (el.style.opacity = '0'));
    }

    // подписи деталей
    if (!this.o.parts) {
      this.partLabels.forEach((l) => (l.el.style.opacity = '0'));
      return;
    }
    const show = clamp((e - 0.55) / 0.45, 0, 1);
    if (show <= 0) {
      if (this.leaders.innerHTML) this.leaders.innerHTML = '';
      this.partLabels.forEach((l) => (l.el.style.opacity = '0'));
      return;
    }
    const s = this.explodeScale;
    const pts = this.partLabels.map((l) => {
      const v = this.anchors[l.layer].clone();
      v.z += (LAYERS[l.layer] ?? 0) * s * e;
      return { l, ...this.project(v) };
    });
    const wide = this.width > 560;
    const gap = wide ? 30 : 22;
    let col;
    if (wide) {
      pts.sort((a, b) => a.y - b.y);
      col = Math.min(this.width - 130, Math.max(...pts.map((p) => p.x)) + 36);
      // разводим по вертикали
      const ys = pts.map((p) => p.y);
      for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
      const over = ys[ys.length - 1] - (this.height - 24);
      if (over > 0) for (let i = 0; i < ys.length; i++) ys[i] -= over;
      for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap);
      pts.forEach((p, i) => (p.ly = ys[i]));
    }
    let svg = '';
    const order = PART_LABELS.map((p) => p.layer);
    pts.forEach((p) => {
      const el = p.l.el;
      const act = el.classList.contains('is-active') ? ' class="is-active"' : '';
      el.style.opacity = String(show);
      if (wide) {
        el.style.transform = `translate(${col}px, ${p.ly}px) translate(0, -50%)`;
        svg += `<polyline${act} points="${p.x.toFixed(1)},${p.y.toFixed(1)} ${(col - 18).toFixed(1)},${p.ly.toFixed(1)} ${(col - 6).toFixed(1)},${p.ly.toFixed(1)}"/>`;
        svg += `<rect${act} x="${(p.x - 2.5).toFixed(1)}" y="${(p.y - 2.5).toFixed(1)}" width="5" height="5"/>`;
      } else {
        // узкий экран: номера на модели, легенда в две колонки снизу
        const i = order.indexOf(p.l.layer);
        const colW = (this.width - 32) / 2;
        const lx = 16 + (i % 2) * colW;
        const ly = this.height - 132 + Math.floor(i / 2) * 26;
        el.dataset.n = String(i + 1);
        el.style.maxWidth = `${colW - 8}px`;
        el.style.transform = `translate(${lx}px, ${ly}px)`;
        svg += `<g${act}><rect x="${(p.x - 8).toFixed(1)}" y="${(p.y - 8).toFixed(1)}" width="16" height="16"/><text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}">${i + 1}</text></g>`;
      }
    });
    this.leaders.style.opacity = String(show);
    this.leaders.innerHTML = svg;
    this.overlay.classList.toggle('is-compact', !wide);
  }

  /* ---------- вращение мышью и пальцем ---------- */

  bindPointer() {
    const c = this.renderer.domElement;
    c.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      this.drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, yaw: this.user.yaw, pitch: this.user.pitch };
      c.setPointerCapture(ev.pointerId);
      this.el.classList.add('is-dragging');
      this.el.dispatchEvent(new CustomEvent('w3d:interact'));
      this.invalidate();
    });
    c.addEventListener('pointermove', (ev) => {
      if (!this.drag || ev.pointerId !== this.drag.id) return;
      const dx = ev.clientX - this.drag.x;
      const dy = ev.clientY - this.drag.y;
      this.user.yaw = clamp(this.drag.yaw + dx * 0.006, -0.7, 0.7);
      if (ev.pointerType === 'mouse') this.user.pitch = clamp(this.drag.pitch + dy * 0.004, -0.25, 0.25);
      this.invalidate();
    });
    const end = (ev) => {
      if (!this.drag || ev.pointerId !== this.drag.id) return;
      this.drag = null;
      this.el.classList.remove('is-dragging');
      this.invalidate();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }
}
