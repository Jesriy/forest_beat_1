/**
 * homeScene.js —— 首页 Three.js 3D 场景
 * ---------------------------------------------------------------
 * 三个主题：
 *   forest 树林 + 暖色阳光 + 轻雾
 *   city   高楼 + 灰色雾 + 冷色暗光（降低曝光）
 *   mix    林城交织 + 蓝天 + 白云
 * 模型优先加载 public/assets/models/*.glb；加载失败自动使用
 * 圆锥/圆柱/盒子等基础几何体搭建占位场景。
 * 主题切换约 1 秒淡入淡出，天空 / 雾 / 灯光平滑过渡。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ASSETS, SCENE, assetUrl } from './config.js';

/* ---------------- 主题环境参数（过渡目标值） ---------------- */
const THEME_ENV = {
  forest: {
    skyTop: new THREE.Color('#57a7f0'),
    skyBottom: new THREE.Color('#ffe7bd'),
    fogColor: new THREE.Color('#dceeff'),
    fogNear: 18, fogFar: 72,
    hemiSky: new THREE.Color('#fff0d2'),
    hemiGround: new THREE.Color('#5f7d4e'),
    hemiIntensity: 0.95,
    dirColor: new THREE.Color('#ffd59a'),
    dirIntensity: 2.3,
    ambColor: new THREE.Color('#fff1dc'),
    ambIntensity: 0.32,
    exposure: 1.05,
    sunOpacity: 1,
    cloudOpacity: 0,
  },
  city: {
    skyTop: new THREE.Color('#39414b'),
    skyBottom: new THREE.Color('#6d737b'),
    fogColor: new THREE.Color('#5a6068'),
    fogNear: 11, fogFar: 46,
    hemiSky: new THREE.Color('#a7b8c8'),
    hemiGround: new THREE.Color('#2d3138'),
    hemiIntensity: 0.45,
    dirColor: new THREE.Color('#aab8c8'),
    dirIntensity: 0.75,
    ambColor: new THREE.Color('#8893a0'),
    ambIntensity: 0.42,
    exposure: 0.78,
    sunOpacity: 0,
    cloudOpacity: 0,
  },
  mix: {
    skyTop: new THREE.Color('#2f86f5'),
    skyBottom: new THREE.Color('#d2ecff'),
    fogColor: new THREE.Color('#cfe9ff'),
    fogNear: 24, fogFar: 88,
    hemiSky: new THREE.Color('#e8f5ff'),
    hemiGround: new THREE.Color('#7fa86a'),
    hemiIntensity: 1.0,
    dirColor: new THREE.Color('#ffffff'),
    dirIntensity: 1.9,
    ambColor: new THREE.Color('#eaf6ff'),
    ambIntensity: 0.42,
    exposure: 1.12,
    sunOpacity: 0.55,
    cloudOpacity: 1,
  },
};

/* ---------------- 程序化纹理 ---------------- */

/** 太阳光晕 Sprite 贴图 */
function makeSunTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,246,220,1)');
  g.addColorStop(0.22, 'rgba(255,224,150,.95)');
  g.addColorStop(0.5, 'rgba(255,190,90,.35)');
  g.addColorStop(1, 'rgba(255,180,80,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 白云 Sprite 贴图 */
function makeCloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  const blobs = [[80, 78, 46], [128, 62, 58], [176, 80, 42], [118, 84, 40], [160, 86, 34]];
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,.95)');
    g.addColorStop(0.7, 'rgba(255,255,255,.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 城市楼体贴图：灰墙 + 发光窗户 */
function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7d848e';
  ctx.fillRect(0, 0, 128, 128);
  // 轻微竖向明暗
  const grad = ctx.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,.08)');
  grad.addColorStop(1, 'rgba(0,0,0,.14)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const cols = 6, rows = 9;
  const pad = 7, ww = (128 - pad * (cols + 1)) / cols;
  const wh = (128 - pad * (rows + 1)) / rows;
  const lit = ['#ffe9a8', '#cfe8ff', '#fff6d8'];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const on = Math.random() < 0.42;
      ctx.fillStyle = on ? lit[(Math.random() * lit.length) | 0] : '#3d434c';
      const px = pad + x * (ww + pad);
      const py = pad + y * (wh + pad);
      ctx.fillRect(px, py, ww, wh);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------------- 占位场景搭建 ---------------- */

// 可复现的伪随机
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildTree(rng, bright = false) {
  const tree = new THREE.Group();
  const trunkH = 1.1 + rng() * 0.9;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.24, trunkH, 8),
    new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 0.95 })
  );
  trunk.position.y = trunkH / 2;
  tree.add(trunk);

  const baseColor = bright
    ? ['#43b45a', '#2f9e4e'][rng() * 2 | 0]
    : ['#2f8f43', '#3a9d4d', '#287a3a'][rng() * 3 | 0];
  const foliageMat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.9 });
  const r1 = 0.95 + rng() * 0.35;
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(r1, 1.7, 10), foliageMat);
  c1.position.y = trunkH + 0.75;
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(r1 * 0.72, 1.35, 10), foliageMat);
  c2.position.y = trunkH + 1.55;
  tree.add(c1, c2);
  return tree;
}

function buildBuilding(rng, tex, minH = 3, maxH = 10) {
  const g = new THREE.Group();
  const w = 1.5 + rng() * 1.3;
  const d = 1.5 + rng() * 1.3;
  const h = minH + rng() * (maxH - minH);
  const map = tex.clone();
  map.needsUpdate = true;
  map.repeat.set(Math.max(1, Math.round(w / 1.5)), Math.max(2, Math.round(h / 2)));
  const mat = new THREE.MeshStandardMaterial({
    color: rng() < 0.25 ? '#9aa1ab' : '#868d97',
    map,
    roughness: 0.85,
    metalness: 0.1,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  body.position.y = h / 2;
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.5, 0.4, d * 0.5),
    new THREE.MeshStandardMaterial({ color: '#5d636b', roughness: 1 })
  );
  roof.position.y = h + 0.2;
  g.add(body, roof);
  return g;
}

function buildForestPlaceholder() {
  const root = new THREE.Group();
  root.name = 'placeholder-forest';
  const rng = makeRng(20240520);

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(16, 16.5, 0.9, 48),
    new THREE.MeshStandardMaterial({ color: '#6fa152', roughness: 1 })
  );
  ground.position.y = -0.45;
  root.add(ground);

  // 树木按黄金角散布
  for (let i = 0; i < 16; i++) {
    const a = i * 2.39996;
    const r = 2.6 + ((i * 37) % 10) * 0.95 + rng() * 0.4;
    const tree = buildTree(rng, false);
    const s = 0.8 + rng() * 0.55;
    tree.scale.setScalar(s);
    tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    tree.rotation.y = rng() * Math.PI * 2;
    root.add(tree);
  }
  // 灌木
  for (let i = 0; i < 8; i++) {
    const a = rng() * Math.PI * 2;
    const r = 3 + rng() * 10;
    const bush = new THREE.Mesh(
      new THREE.SphereGeometry(0.5 + rng() * 0.35, 10, 8),
      new THREE.MeshStandardMaterial({ color: '#3c9b50', roughness: 1 })
    );
    bush.scale.y = 0.65;
    bush.position.set(Math.cos(a) * r, 0.25, Math.sin(a) * r);
    root.add(bush);
  }
  return root;
}

function buildCityPlaceholder() {
  const root = new THREE.Group();
  root.name = 'placeholder-city';
  const rng = makeRng(998877);
  const tex = makeWindowTexture();

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(34, 0.7, 34),
    new THREE.MeshStandardMaterial({ color: '#32363c', roughness: 1 })
  );
  ground.position.y = -0.35;
  root.add(ground);

  // 网格 + 抖动排列高楼
  for (let ix = -2; ix <= 2; ix++) {
    for (let iz = -2; iz <= 2; iz++) {
      if (rng() < 0.12) continue; // 空隙
      const b = buildBuilding(rng, tex, 3, 10);
      b.position.set(
        ix * 3.4 + (rng() - 0.5) * 0.9,
        0,
        iz * 3.4 + (rng() - 0.5) * 0.9
      );
      b.rotation.y = (rng() - 0.5) * 0.15;
      root.add(b);
    }
  }
  return root;
}

function buildMixPlaceholder() {
  const root = new THREE.Group();
  root.name = 'placeholder-mix';
  const rng = makeRng(13579);
  const tex = makeWindowTexture();

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(16, 16.5, 0.9, 48),
    new THREE.MeshStandardMaterial({ color: '#79a85d', roughness: 1 })
  );
  ground.position.y = -0.45;
  root.add(ground);

  // 树与楼沿两条交错的弧线摆放
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const r = 4.5 + (i % 3) * 2.4;
    const tree = buildTree(rng, true);
    tree.scale.setScalar(0.75 + rng() * 0.4);
    tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    tree.rotation.y = rng() * 6.28;
    root.add(tree);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.55;
    const r = 5.2 + ((i * 2) % 3) * 2.2;
    const b = buildBuilding(rng, tex, 2.2, 5.5);
    b.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    b.rotation.y = rng() * 6.28;
    root.add(b);
  }
  return root;
}

const PLACEHOLDERS = {
  forest: buildForestPlaceholder,
  city: buildCityPlaceholder,
  mix: buildMixPlaceholder,
};

/* ---------------- 模型淡入淡出工具 ---------------- */

function prepareFade(root) {
  root.traverse((o) => {
    if (o.isMesh || o.isSprite) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const clones = mats.map((m) => {
        const c = m.clone();
        c.transparent = true;
        return c;
      });
      o.material = Array.isArray(o.material) ? clones : clones[0];
    }
  });
  setRootOpacity(root, 0);
  root.visible = false;
}

function setRootOpacity(root, v) {
  root.traverse((o) => {
    if (!o.isMesh && !o.isSprite) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) m.opacity = v;
  });
}

/* ---------------- 首页场景主类 ---------------- */

export class HomeScene {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onLoading?:(show:boolean,pct?:number)=>void, onNotice?:(msg:string)=>void}} hooks
   */
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.roots = {};          // 三个主题根节点
    this.rootCache = {};      // Promise 缓存
    this.current = null;
    this.fade = null;         // 进行中的淡变
    this.warned = new Set();

    this._initRenderer();
    this._initSky();
    this._initLights();
    this._initSunAndClouds();

    this.clock = new THREE.Clock();
    this._tick = this._tick.bind(this);
    this.rafId = requestAnimationFrame(this._tick);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xdceeff, 18, 72);

    this.camera = new THREE.PerspectiveCamera(SCENE.fov, 1, 0.1, 200);
    this.camera.position.set(0, SCENE.cameraHeight, SCENE.cameraDistance);
    this.camera.lookAt(0, 3.2, 0);

    this.loader = new GLTFLoader();
  }

  _initSky() {
    // 渐变天空穹顶（背面渲染的球 + Shader）
    const geo = new THREE.SphereGeometry(90, 32, 16);
    this.skyUniforms = {
      topColor: { value: new THREE.Color('#57a7f0') },
      bottomColor: { value: new THREE.Color('#ffe7bd') },
    };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.skyUniforms,
      vertexShader: /* glsl */`
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y;
          float t = smoothstep(-0.15, 0.65, h);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.scene.add(this.sky);
  }

  _initLights() {
    this.hemi = new THREE.HemisphereLight(0xfff0d2, 0x5f7d4e, 0.95);
    this.dir = new THREE.DirectionalLight(0xffd59a, 2.3);
    this.dir.position.set(9, 13, 7);
    this.ambient = new THREE.AmbientLight(0xfff1dc, 0.32);
    this.scene.add(this.hemi, this.dir, this.ambient);
  }

  _initSunAndClouds() {
    // 阳光光晕（Sprite 光效，无需后处理 Bloom 也有明显感觉）
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeSunTexture(),
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 1,
    }));
    this.sun.scale.setScalar(17);
    this.sun.position.set(-24, 20, -38);
    this.scene.add(this.sun);

    // 白云
    this.clouds = [];
    const cloudTex = makeCloudTexture();
    const cloudCfg = [
      [-26, 17, -42, 13], [-6, 20, -48, 16], [16, 15, -40, 12],
      [30, 19, -50, 15], [-38, 13, -30, 11], [6, 23, -55, 14],
    ];
    for (const [x, y, z, s] of cloudCfg) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTex, transparent: true, depthWrite: false, opacity: 0, fog: false,
      }));
      sp.position.set(x, y, z);
      sp.scale.set(s * 2.4, s, 1);
      sp.userData.speed = 0.25 + Math.random() * 0.35;
      this.clouds.push(sp);
      this.scene.add(sp);
    }
  }

  /**
   * 切换主题（带淡入淡出）。可在模型尚未就绪时调用，会自动弹加载框。
   */
  async setTheme(name) {
    if (!THEME_ENV[name]) return;
    const targetEnv = THEME_ENV[name];
    this._targetEnv = targetEnv; // 每帧平滑趋近

    const root = await this._ensureRoot(name);
    this.roots[name] = root;
    if (this._wantTheme && this._wantTheme !== name) return; // 期间又被切换

    const old = this.current;
    if (old === name) return;
    this.current = name;

    root.visible = true;
    this.fade = {
      fromRoot: old ? this.roots[old] : null,
      toRoot: root,
      t: old ? 0 : 1,
      dur: SCENE.fadeDuration,
    };
    if (!old) setRootOpacity(root, 1);
  }

  /** 取得（或构建 + 尝试加载 glb）某主题根节点 */
  _ensureRoot(name) {
    if (this.rootCache[name]) return this.rootCache[name];
    this._wantTheme = name;
    this.rootCache[name] = (async () => {
      const root = new THREE.Group();
      root.name = `theme-${name}`;
      let content = null;
      let modelLoaded = false;
      try {
        this.hooks.onLoading?.(true, 0);
        const gltf = await this._loadGLB(assetUrl(ASSETS.models[name]));
        content = new THREE.Group();
        content.add(gltf.scene);
        modelLoaded = true;
      } catch (err) {
        content = PLACEHOLDERS[name]();
        const msg = `未找到 ${ASSETS.models[name]}（或加载失败），当前使用占位模型。把导出的 .glb 放到该路径后刷新即可。`;
        if (!this.warned.has(name)) {
          this.warned.add(name);
          this.hooks.onNotice?.(msg);
        }
      } finally {
        this.hooks.onLoading?.(false);
      }

      // 统一结构 root > inner（inner 负责居中缩放与自转）
      root.add(content);
      this._normalizeModel(
        root,
        modelLoaded ? SCENE.modelTargetSize : SCENE.modelTargetSize * 1.35
      );
      prepareFade(root);
      this.scene.add(root);
      return root;
    })();
    return this.rootCache[name];
  }

  _loadGLB(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => resolve(gltf),
        (ev) => {
          if (ev.total) this.hooks.onLoading?.(true, Math.round((ev.loaded / ev.total) * 100));
        },
        (err) => reject(err)
      );
    });
  }

  /**
   * 自动包围盒：把内容缩放至目标尺寸，并居中到 x/z、底边落在 y=0。
   * 直接修改 group 内唯一子节点的 scale / position。
   */
  _normalizeModel(container, targetSize) {
    const inner = container.children[0];
    if (!inner) return;
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const k = targetSize / maxDim;
    inner.scale.multiplyScalar(k);
    inner.position.set(
      -center.x * k,
      -(center.y - size.y / 2) * k,
      -center.z * k
    );
  }

  /** 环境参数平滑插值 */
  _lerpEnv(dt) {
    const env = this._targetEnv || THEME_ENV.forest;
    const k = 1 - Math.exp(-dt * 4.5); // 帧率无关的平滑
    const cur = {
      skyTop: this.skyUniforms.topColor.value,
      skyBottom: this.skyUniforms.bottomColor.value,
      fogColor: this.scene.fog.color,
    };
    cur.skyTop.lerp(env.skyTop, k);
    cur.skyBottom.lerp(env.skyBottom, k);
    cur.fogColor.lerp(env.fogColor, k);
    this.scene.fog.near += (env.fogNear - this.scene.fog.near) * k;
    this.scene.fog.far += (env.fogFar - this.scene.fog.far) * k;

    this.hemi.color.lerp(env.hemiSky, k);
    this.hemi.groundColor.lerp(env.hemiGround, k);
    this.hemi.intensity += (env.hemiIntensity - this.hemi.intensity) * k;
    this.dir.color.lerp(env.dirColor, k);
    this.dir.intensity += (env.dirIntensity - this.dir.intensity) * k;
    this.ambient.color.lerp(env.ambColor, k);
    this.ambient.intensity += (env.ambIntensity - this.ambient.intensity) * k;
    this.renderer.toneMappingExposure += (env.exposure - this.renderer.toneMappingExposure) * k;

    this.sun.material.opacity += (env.sunOpacity - this.sun.material.opacity) * k;
    for (const cl of this.clouds) {
      cl.material.opacity += (env.cloudOpacity * 0.9 - cl.material.opacity) * k;
    }
  }

  _tick() {
    this.rafId = requestAnimationFrame(this._tick);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    // 主题淡变
    if (this.fade) {
      const f = this.fade;
      f.t += dt / f.dur;
      const e = Math.min(1, Math.max(0, f.t));
      const ease = e * e * (3 - 2 * e); // smoothstep
      if (f.fromRoot) setRootOpacity(f.fromRoot, 1 - ease);
      setRootOpacity(f.toRoot, ease);
      if (e >= 1) {
        if (f.fromRoot) f.fromRoot.visible = false;
        this.fade = null;
      }
    }

    // 模型缓慢自转
    if (this.current && this.roots[this.current]) {
      const root = this.roots[this.current];
      if (root.children[0]) root.children[0].rotation.y += SCENE.rotateSpeed * dt;
    }

    // 云漂移
    for (const cl of this.clouds) {
      cl.position.x += cl.userData.speed * dt;
      if (cl.position.x > 48) cl.position.x = -48;
    }

    this._lerpEnv(dt);
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 竖屏（手机）时拉远一点，避免模型被裁
    this.camera.position.z = SCENE.cameraDistance * (w < h ? 1.35 : 1);
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
