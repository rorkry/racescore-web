'use client';

/**
 * Visual Lab シーン本体（本番 RaceSimulator3DProto から完全分離）
 *
 * 目的: 3案(cel/semi/dataviz)を「同一URL=完全再現」の条件で中立比較する計測・撮影ハーネス。
 *  - timeline / race-dynamics / racecourse-geometry / start-marker に一切依存しない
 *  - 乱数は seed 固定の疑似乱数（Math.random 不使用）
 *  - 3案の見た目（モデル/材質/照明/カメラ）は変更しない。ここは共通ハーネスだけ
 *
 * URL パラメータ（同じURLで world position/番号/枠色/選択馬/カメラ/FOV/光源/surface/phase を完全再現）:
 *   variant=A|B|C  surface=turf|dirt  horses=8|14|18  scene=straight|corner|finish|dense
 *   speed=0|0.5|1  labels=all|selected|saddle|tracking  hysteresis=0|1  selectedHorse=<n>
 *   seed=<int>  view=default|zoomSide|zoomFront|zoomRear
 *   benchmark=0|1  duration=<sec>  capture=0|1
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import {
  Approach, Scenario, Surface, LabelMode, ViewMode,
  buildFixtureHorses, scenarioPoses, cameraFor, poseOf, WAKU_HEX, wakuTextColor,
  TRACK_WIDTH, pseudo,
  VARIANT_TO_APPROACH, APPROACH_TO_VARIANT, SCENE_TO_SCENARIO, SCENARIO_TO_SCENE,
} from './fixtures';
import { buildHorse, HorseModel } from './horseModels';
import { LabelManager, LabelInput, LabelOut } from './labels';
import { computeFrameStats, countOverlapPairs, overlapAreaSum, readJsHeapMB } from './instrumentation';

interface Settings {
  approach: Approach;
  scenario: Scenario;
  surface: Surface;
  speed: number;       // 0 | 0.5 | 1
  horseCount: number;
  labelMode: LabelMode;
  view: ViewMode;
  hysteresis: boolean;
  selected: number;
  seed: number;
}

interface LabelMetrics {
  total: number; visible: number; hidden: number;
  overlapPairs: number; overlapArea: number;
  selectedOverlap: number; relocationsPerSec: number;
  maxDist: number; breaks: number;
}

interface TaskResult { target: number; timeMs: number; wrong: number; }

const PRESETS: { id: string; label: string; patch: Partial<Settings> }[] = [
  { id: 'P1', label: 'P1 芝14 直線密集', patch: { surface: 'turf', horseCount: 14, scenario: 'straight', view: 'default', labelMode: 'all', selected: 5 } },
  { id: 'P2', label: 'P2 芝14 コーナー', patch: { surface: 'turf', horseCount: 14, scenario: 'corner', view: 'default', labelMode: 'all', selected: 5 } },
  { id: 'P3', label: 'P3 ダート14 ゴール前', patch: { surface: 'dirt', horseCount: 14, scenario: 'goal', view: 'default', labelMode: 'all', selected: 5 } },
  { id: 'P4', label: 'P4 芝18 最大密集', patch: { surface: 'turf', horseCount: 18, scenario: 'pack', view: 'default', labelMode: 'all', selected: 9 } },
  { id: 'P5', label: 'P5 拡大 側面', patch: { surface: 'turf', horseCount: 14, scenario: 'straight', view: 'zoomSide', labelMode: 'selected', selected: 5 } },
  { id: 'P6', label: 'P6 拡大 斜め前', patch: { surface: 'turf', horseCount: 14, scenario: 'straight', view: 'zoomFront', labelMode: 'selected', selected: 5 } },
  { id: 'P7', label: 'P7 拡大 斜め後ろ', patch: { surface: 'turf', horseCount: 14, scenario: 'straight', view: 'zoomRear', labelMode: 'selected', selected: 5 } },
];

const CAPTURE_SIZES: [number, number, string][] = [[1440, 900, '1440×900'], [1280, 720, '1280×720'], [390, 844, '390×844']];

export default function VisualLabScene() {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<any>(null);
  const contentRef = useRef<THREE.Group | null>(null);
  const horsesRef = useRef<Map<number, HorseModel>>(new Map());
  const blobRef = useRef<THREE.Texture | null>(null);
  const labelMgrRef = useRef<LabelManager>(new LabelManager());
  const labelPoolRef = useRef<HTMLDivElement[]>([]);
  const rafRef = useRef<number>(0);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

  const animTimeRef = useRef<number>(0);
  const frameBufRef = useRef<number[]>([]);
  const relocRef = useRef<{ prev: Map<number, { x: number; y: number; vis: boolean }>; total: number; sampleStart: number }>({ prev: new Map(), total: 0, sampleStart: 0 });
  const metricsAccRef = useRef<{ frames: number; visible: number; overlaps: number; area: number; startReloc: number; startT: number } | null>(null);

  const benchRef = useRef<{ running: boolean; phase: 'warmup' | 'measure'; startAt: number; measureAt: number; duration: number }>(
    { running: false, phase: 'warmup', startAt: 0, measureAt: 0, duration: 30 });
  const taskRef = useRef<{ active: boolean; order: number[]; index: number; startedAt: number; wrong: number; results: TaskResult[] }>(
    { active: false, order: [], index: 0, startedAt: 0, wrong: 0, results: [] });

  const settingsRef = useRef<Settings>({
    approach: 'cel', scenario: 'straight', surface: 'turf', speed: 1,
    horseCount: 14, labelMode: 'all', view: 'default', hysteresis: true, selected: 5, seed: 1,
  });
  const captureRef = useRef<boolean>(false);

  const [settings, setSettings] = useState<Settings>(settingsRef.current);
  const [capture, setCapture] = useState(false);
  const [hud, setHud] = useState({ fps: 0, calls: 0, tris: 0, geos: 0, texs: 0, programs: 0 });
  const [lm, setLm] = useState<LabelMetrics>({ total: 0, visible: 0, hidden: 0, overlapPairs: 0, overlapArea: 0, selectedOverlap: 0, relocationsPerSec: 0, maxDist: 0, breaks: 0 });
  const [benchState, setBenchState] = useState<{ running: boolean; phase: string; remaining: number }>({ running: false, phase: '', remaining: 0 });
  const [benchJson, setBenchJson] = useState('');
  const [taskState, setTaskState] = useState<{ active: boolean; target: number; index: number; total: number; done: boolean }>({ active: false, target: 0, index: 0, total: 0, done: false });
  const [taskJson, setTaskJson] = useState('');
  const [captureSize, setCaptureSize] = useState<[number, number] | null>(null);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { captureRef.current = capture; }, [capture]);
  useEffect(() => { labelMgrRef.current.hysteresis = settings.hysteresis; }, [settings.hysteresis]);

  // ---- 一度だけ renderer/scene/loop 構築 ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // URL パラメータ適用
    const init = parseUrl();
    if (init.settings) { settingsRef.current = { ...settingsRef.current, ...init.settings }; setSettings(settingsRef.current); }
    if (init.capture) { captureRef.current = true; setCapture(true); }
    labelMgrRef.current.hysteresis = settingsRef.current.hysteresis;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    (renderer as any).outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fb7de);
    scene.fog = new THREE.Fog(0x8fb7de, 120, 400);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(32, mount.clientWidth / mount.clientHeight, 0.1, 2000);
    cameraRef.current = camera;

    blobRef.current = makeBlobTexture();

    let disposed = false;
    import('three/examples/jsm/controls/OrbitControls.js').then(({ OrbitControls }) => {
      if (disposed) return;
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controlsRef.current = controls;
      applyCamera();
    });

    rebuildScene();
    applyCamera();

    // benchmark=1 なら自動開始
    if (init.benchmark) startBenchmark(init.duration ?? 30);

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    let frames = 0, fpsAcc = 0;
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const dt = clockRef.current.getDelta();
      const s = settingsRef.current;
      // capture 時はアニメを固定（速度0扱い=完全再現）
      const speed = captureRef.current ? 0 : s.speed;
      animTimeRef.current += dt * speed;
      const t = animTimeRef.current;

      const packT = (t * 0.15) % 1;
      updateHorsePositions(packT);
      horsesRef.current.forEach((m) => m.gait(t, speed));

      // ズームビューは選択馬を追う（同一URLで同一構図）
      if (s.view !== 'default') applyCamera();

      controlsRef.current?.update();
      renderer.render(scene, camera);
      const frameMs = dt * 1000;
      updateLabels(frameMs);

      // benchmark
      if (benchRef.current.running) tickBenchmark(clockRef.current.elapsedTime, frameMs);

      frames++; fpsAcc += dt;
      if (fpsAcc >= 0.5) {
        const info = renderer.info;
        setHud({
          fps: Math.round(frames / fpsAcc),
          calls: info.render.calls, tris: info.render.triangles,
          geos: info.memory.geometries, texs: info.memory.textures,
          programs: info.programs?.length ?? 0,
        });
        frames = 0; fpsAcc = 0;
      }
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      clearHorses();
      clearContent();
      blobRef.current?.dispose();
      controlsRef.current?.dispose?.();
      renderer.dispose();
      (renderer as any).forceContextLoss?.();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 見た目に影響する設定変更でシーン再構築（時刻/カメラ/位置は保持）
  useEffect(() => {
    if (!sceneRef.current) return;
    rebuildScene();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.approach, settings.scenario, settings.surface, settings.horseCount, settings.selected, settings.seed]);

  useEffect(() => { applyCamera(); /* eslint-disable-next-line */ }, [settings.scenario, settings.view]);

  // captureSize 反映
  useEffect(() => {
    const stage = stageRef.current, mount = mountRef.current, renderer = rendererRef.current, cam = cameraRef.current;
    if (!stage || !mount || !renderer || !cam) return;
    if (captureSize) { stage.style.width = `${captureSize[0]}px`; stage.style.height = `${captureSize[1]}px`; }
    else { stage.style.width = ''; stage.style.height = ''; }
    requestAnimationFrame(() => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      cam.aspect = mount.clientWidth / mount.clientHeight; cam.updateProjectionMatrix();
    });
  }, [captureSize]);

  // ---------- URL ----------
  function parseUrl(): { settings?: Partial<Settings>; capture?: boolean; benchmark?: boolean; duration?: number } {
    if (typeof window === 'undefined') return {};
    const q = new URLSearchParams(window.location.search);
    const s: Partial<Settings> = {};
    const variant = q.get('variant'); if (variant && VARIANT_TO_APPROACH[variant]) s.approach = VARIANT_TO_APPROACH[variant];
    const surface = q.get('surface'); if (surface === 'turf' || surface === 'dirt') s.surface = surface;
    const horses = q.get('horses'); if (horses) s.horseCount = Math.max(2, Math.min(18, Number(horses)));
    const scene = q.get('scene'); if (scene && SCENE_TO_SCENARIO[scene]) s.scenario = SCENE_TO_SCENARIO[scene];
    const speed = q.get('speed'); if (speed !== null) s.speed = [0, 0.5, 1].includes(Number(speed)) ? Number(speed) : 1;
    const labels = q.get('labels'); if (labels && ['all', 'selected', 'saddle', 'tracking'].includes(labels)) s.labelMode = labels as LabelMode;
    const hy = q.get('hysteresis'); if (hy !== null) s.hysteresis = hy === '1';
    const sel = q.get('selectedHorse'); if (sel) s.selected = Number(sel);
    const seed = q.get('seed'); if (seed) s.seed = Number(seed);
    const view = q.get('view'); if (view && ['default', 'zoomSide', 'zoomFront', 'zoomRear'].includes(view)) s.view = view as ViewMode;
    const cap = q.get('capture') === '1';
    const bench = q.get('benchmark') === '1';
    const dur = q.get('duration'); const duration = dur ? Number(dur) : 30;
    return { settings: Object.keys(s).length ? s : undefined, capture: cap, benchmark: bench, duration };
  }

  function currentUrl(): string {
    const s = settingsRef.current;
    const p = new URLSearchParams({
      variant: APPROACH_TO_VARIANT[s.approach], surface: s.surface, horses: String(s.horseCount),
      scene: SCENARIO_TO_SCENE[s.scenario], speed: String(s.speed), labels: s.labelMode,
      hysteresis: s.hysteresis ? '1' : '0', selectedHorse: String(s.selected), seed: String(s.seed), view: s.view,
    });
    return `${window.location.pathname}?${p.toString()}`;
  }

  // ---------- カメラ ----------
  function applyCamera() {
    const cam = cameraRef.current; if (!cam) return;
    const s = settingsRef.current;
    const packT = (animTimeRef.current * 0.15) % 1;
    const sel = s.view !== 'default' ? poseOf(s.selected, s.horseCount, s.scenario, packT, s.seed) : null;
    const p = cameraFor(s.scenario, s.view, sel);
    cam.fov = p.fov;
    cam.position.set(p.position[0], p.position[1], p.position[2]);
    cam.updateProjectionMatrix();
    if (controlsRef.current) { controlsRef.current.target.set(p.lookAt[0], p.lookAt[1], p.lookAt[2]); controlsRef.current.update(); }
    else cam.lookAt(p.lookAt[0], p.lookAt[1], p.lookAt[2]);
  }

  // ---------- シーン ----------
  function clearContent() {
    const scene = sceneRef.current; const content = contentRef.current;
    if (scene && content) {
      scene.remove(content);
      content.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) { for (const v of Object.values(mat as any)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose(); mat.dispose(); }
      });
    }
    contentRef.current = null;
  }
  function clearHorses() {
    horsesRef.current.forEach((m) => { m.group.parent?.remove(m.group); m.dispose(); });
    horsesRef.current.clear();
  }
  function rebuildScene() {
    const scene = sceneRef.current; const renderer = rendererRef.current;
    if (!scene || !renderer) return;
    const s = settingsRef.current;
    clearHorses(); clearContent();
    scene.children.filter((c) => (c as THREE.Light).isLight).forEach((l) => scene.remove(l));
    renderer.shadowMap.enabled = true;
    const content = new THREE.Group(); contentRef.current = content; scene.add(content);
    setupLighting(scene, s);
    buildTrack(content, s);
    buildHorses(content, s);
  }

  function setupLighting(scene: THREE.Scene, s: Settings) {
    if (s.approach === 'semi') {
      scene.add(new THREE.HemisphereLight(0xbcd6f5, 0x50583e, 0.55));
      const dir = new THREE.DirectionalLight(0xfff2df, 1.15); dir.position.set(40, 70, 30); dir.castShadow = true;
      dir.shadow.mapSize.set(1024, 1024); const c = dir.shadow.camera as THREE.OrthographicCamera;
      c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 1; c.far = 200; scene.add(dir);
    } else if (s.approach === 'cel') {
      scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7280, 0.7));
      const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(30, 60, 40); dir.castShadow = true;
      dir.shadow.mapSize.set(1024, 1024); const c = dir.shadow.camera as THREE.OrthographicCamera;
      c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 1; c.far = 200; scene.add(dir);
    } else {
      scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa4b2, 1.0));
      const dir = new THREE.DirectionalLight(0xffffff, 0.5); dir.position.set(0, 80, 20); scene.add(dir);
    }
  }

  function buildTrack(content: THREE.Group, s: Settings) {
    const turf = s.surface === 'turf';
    const detail = s.approach === 'semi' ? 'high' : s.approach === 'cel' ? 'mid' : 'low';
    const groundTex = makeGroundTexture(turf, detail, s.seed);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping; groundTex.repeat.set(8, 8);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; content.add(ground);

    const lane = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_WIDTH, 300),
      new THREE.MeshStandardMaterial({ color: turf ? 0x4f7f45 : 0xb08a5a, roughness: 1, transparent: true, opacity: 0.35 }));
    lane.rotation.x = -Math.PI / 2; lane.position.y = 0.02; content.add(lane);

    const railMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const x = side * (TRACK_WIDTH / 2);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 300), railMat); rail.position.set(x, 1.0, 0); content.add(rail);
      for (let z = -140; z <= 140; z += 8) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), railMat); post.position.set(x, 0.5, z); post.castShadow = true; content.add(post);
      }
    }

    if (s.scenario === 'straight' || s.scenario === 'goal' || s.scenario === 'pack') {
      const goalZ = s.scenario === 'goal' ? 14 : 40;
      const goalLine = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_WIDTH, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      goalLine.rotation.x = -Math.PI / 2; goalLine.position.set(0, 0.05, goalZ); content.add(goalLine);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 8), new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.7 }));
      pole.position.set(TRACK_WIDTH / 2 + 1.5, 2, goalZ); pole.castShadow = true; content.add(pole);
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 2.4), new THREE.MeshStandardMaterial({ color: 0x1b3a6b, roughness: 0.6 }));
      board.position.set(TRACK_WIDTH / 2 + 1.5, 4.2, goalZ); content.add(board);
      const furlongMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
      for (let z = goalZ - 200; z < goalZ; z += 200 / 5) {
        const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), furlongMat); fp.position.set(TRACK_WIDTH / 2 + 0.6, 1.2, z); content.add(fp);
      }
    }
  }

  function buildHorses(content: THREE.Group, s: Settings) {
    const horses = buildFixtureHorses(s.horseCount, s.seed);
    for (const h of horses) {
      const model = buildHorse(s.approach, { waku: h.waku, horseNumber: h.horseNumber, selected: h.horseNumber === s.selected });
      model.group.userData.horseNumber = h.horseNumber;
      if (h.horseNumber === s.selected && s.selected > 0) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.12, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; model.group.add(ring);
      }
      if (s.approach !== 'semi' && blobRef.current) {
        const blob = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: blobRef.current, transparent: true, opacity: 0.5, depthWrite: false }));
        blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03; model.group.add(blob);
      }
      content.add(model.group);
      horsesRef.current.set(h.horseNumber, model);
    }
    updateHorsePositions((animTimeRef.current * 0.15) % 1);
  }

  function updateHorsePositions(packT: number) {
    const s = settingsRef.current;
    const horses = buildFixtureHorses(s.horseCount, s.seed);
    const poses = scenarioPoses(horses, s.scenario, packT);
    for (const pose of poses) {
      const m = horsesRef.current.get(pose.horseNumber);
      if (!m) continue;
      m.group.position.set(pose.x, 0, pose.z);
      m.group.rotation.y = pose.heading;
    }
  }

  // ---------- ラベル ----------
  function updateLabels(_frameMs: number) {
    const layer = labelLayerRef.current; const cam = cameraRef.current; const renderer = rendererRef.current;
    if (!layer || !cam || !renderer) return;
    const s = settingsRef.current;
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    const horses = buildFixtureHorses(s.horseCount, s.seed);

    const anchorY = s.labelMode === 'saddle' ? 1.5 : 3.2;
    const inputs: LabelInput[] = [];
    const anchorScreen = new Map<number, { x: number; y: number }>();
    horses.forEach((hh) => {
      const m = horsesRef.current.get(hh.horseNumber); if (!m) return;
      const world = new THREE.Vector3(0, anchorY, 0).applyMatrix4(m.group.matrixWorld);
      const isSelected = hh.horseNumber === s.selected && s.selected > 0;
      let priority = 10 - Math.abs(hh.horseNumber - s.selected) * 0.2;
      if (isSelected) priority = 100;
      // 対応把握用に anchor の screen 座標も記録
      const v = world.clone().project(cam);
      anchorScreen.set(hh.horseNumber, { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h });

      let include = true; let forceShow = false;
      if (s.labelMode === 'selected') { include = isSelected; forceShow = isSelected; }
      else if (s.labelMode === 'tracking') { include = false; } // 3Dラベルは出さず下部ストリップ
      if (!include) return;
      inputs.push({
        id: hh.horseNumber, world, text: String(hh.horseNumber),
        color: hex(WAKU_HEX[(hh.waku - 1) % 8]), textColor: wakuTextColor(hh.waku),
        priority, forceShow,
      });
    });

    const maxVisible = s.labelMode === 'all' || s.labelMode === 'saddle' ? 99 : s.labelMode === 'selected' ? 2 : 0;
    const outs = labelMgrRef.current.layout(inputs, cam, w, h, maxVisible, performance.now());
    renderLabelDom(layer, outs);

    // ---- 識別指標（A/B/C 共通アルゴリズム）----
    const visibleOuts = outs.filter((o) => o.visible);
    const boxes = visibleOuts.map((o) => ({ x: o.x, y: o.y }));
    const overlapPairs = countOverlapPairs(boxes);
    const area = overlapAreaSum(boxes);
    let selectedOverlap = 0, maxDist = 0, breaks = 0;
    for (const o of visibleOuts) {
      const a = anchorScreen.get(o.id);
      if (a) { const d = Math.hypot(o.x - a.x, o.y - a.y); maxDist = Math.max(maxDist, d); if (d > 60) breaks++; }
      if (o.emphasized) {
        for (const o2 of visibleOuts) if (o2.id !== o.id && Math.abs(o.x - o2.x) < 26 && Math.abs(o.y - o2.y) < 20) selectedOverlap++;
      }
    }
    // relocation（表示/非表示トグル or 大きな位置移動）
    const rel = relocRef.current; const nowT = clockRef.current.elapsedTime;
    if (rel.sampleStart === 0) rel.sampleStart = nowT;
    for (const o of outs) {
      const prev = rel.prev.get(o.id);
      if (prev) { if (prev.vis !== o.visible) rel.total++; else if (o.visible && Math.hypot(o.x - prev.x, o.y - prev.y) > 6) rel.total++; }
      rel.prev.set(o.id, { x: o.x, y: o.y, vis: o.visible });
    }
    const elapsed = Math.max(0.001, nowT - rel.sampleStart);
    const relocationsPerSec = rel.total / elapsed;

    const total = s.labelMode === 'tracking' ? 0 : horses.length;
    const selectedHiddenNow = s.selected > 0 && !outs.find((o) => o.id === s.selected && o.visible) && s.labelMode !== 'tracking' && (s.labelMode === 'all' || s.labelMode === 'saddle' || s.labelMode === 'selected');

    const metrics: LabelMetrics = {
      total, visible: visibleOuts.length, hidden: Math.max(0, total - visibleOuts.length),
      overlapPairs, overlapArea: area, selectedOverlap: Math.round(selectedOverlap / 2),
      relocationsPerSec: Math.round(relocationsPerSec * 10) / 10, maxDist: Math.round(maxDist), breaks,
    };
    // HUD は 0.5s ごと更新（下の benchmark と同じ tick に相乗り）
    metricsAccRef.current = metricsAccRef.current ?? { frames: 0, visible: 0, overlaps: 0, area: 0, startReloc: rel.total, startT: nowT };
    lmThrottle(metrics, selectedHiddenNow);

    // benchmark 集計
    if (benchRef.current.running && benchRef.current.phase === 'measure' && metricsAccRef.current) {
      const acc = metricsAccRef.current; acc.frames++; acc.visible += visibleOuts.length; acc.overlaps += overlapPairs; acc.area += area;
    }
  }

  const lmLastRef = useRef(0);
  function lmThrottle(m: LabelMetrics, _selHidden: boolean) {
    const now = performance.now();
    if (now - lmLastRef.current >= 500) { lmLastRef.current = now; setLm(m); }
  }

  function renderLabelDom(layer: HTMLDivElement, outs: LabelOut[]) {
    const pool = labelPoolRef.current;
    while (pool.length < outs.length) {
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'absolute', transform: 'translate(-50%,-50%)', pointerEvents: 'none', fontWeight: '700',
        fontSize: '13px', lineHeight: '18px', textAlign: 'center', minWidth: '20px', padding: '1px 5px',
        borderRadius: '5px', fontVariantNumeric: 'tabular-nums', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      } as CSSStyleDeclaration);
      layer.appendChild(el); pool.push(el);
    }
    for (let i = 0; i < pool.length; i++) {
      const el = pool[i]; const o = outs[i];
      if (!o || !o.visible) { el.style.display = 'none'; continue; }
      el.style.display = 'block'; el.style.left = `${o.x}px`; el.style.top = `${o.y}px`;
      el.style.background = o.color; el.style.color = o.textColor;
      el.style.border = o.emphasized ? '2px solid #ffffff' : '1px solid rgba(0,0,0,0.3)';
      el.style.outline = o.emphasized ? '2px solid #ff3b30' : 'none';
      el.style.zIndex = o.emphasized ? '20' : '10';
      el.textContent = o.text;
    }
  }

  // ---------- ベンチマーク ----------
  function startBenchmark(duration: number) {
    if (benchRef.current.running) return;
    frameBufRef.current = [];
    relocRef.current = { prev: new Map(), total: 0, sampleStart: 0 };
    metricsAccRef.current = null;
    benchRef.current = { running: true, phase: 'warmup', startAt: clockRef.current.elapsedTime, measureAt: 0, duration };
    setBenchState({ running: true, phase: 'warmup(5s)', remaining: duration });
    setBenchJson('');
  }
  function tickBenchmark(now: number, frameMs: number) {
    const b = benchRef.current;
    if (b.phase === 'warmup') {
      if (now - b.startAt >= 5) {
        b.phase = 'measure'; b.measureAt = now; frameBufRef.current = [];
        metricsAccRef.current = { frames: 0, visible: 0, overlaps: 0, area: 0, startReloc: relocRef.current.total, startT: now };
        setBenchState({ running: true, phase: 'measure', remaining: b.duration });
      }
      return;
    }
    // measure
    frameBufRef.current.push(frameMs);
    const rem = b.duration - (now - b.measureAt);
    if (Math.floor(rem) !== Math.floor(b.duration - (now - b.measureAt) + frameMs / 1000)) {
      setBenchState({ running: true, phase: 'measure', remaining: Math.max(0, Math.ceil(rem)) });
    }
    if (now - b.measureAt >= b.duration) finishBenchmark(now);
  }
  function finishBenchmark(now: number) {
    const b = benchRef.current; b.running = false;
    const renderer = rendererRef.current!; const info = renderer.info; const s = settingsRef.current;
    const stats = computeFrameStats(frameBufRef.current);
    const acc = metricsAccRef.current;
    const measured = Math.max(0.001, now - b.measureAt);
    const result = {
      capturedAt: new Date().toISOString(),
      note: 'ローカルブラウザ内計測。headless/software renderingのFPSは実機性能ではない。',
      condition: {
        variant: APPROACH_TO_VARIANT[s.approach], scene: SCENARIO_TO_SCENE[s.scenario], surface: s.surface,
        horses: s.horseCount, labels: s.labelMode, hysteresis: s.hysteresis, seed: s.seed, view: s.view,
        devicePixelRatio: window.devicePixelRatio, viewport: { w: mountRef.current?.clientWidth, h: mountRef.current?.clientHeight },
      },
      fps: stats,
      render: { calls: info.render.calls, triangles: info.render.triangles },
      memory: { geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0 },
      note_memory: 'geometries/textures は three.js の管理数。GPUメモリ量ではない。',
      jsHeapMB: readJsHeapMB(),
      labels: acc && acc.frames > 0 ? {
        activeHorses: s.horseCount,
        avgVisible: Math.round((acc.visible / acc.frames) * 10) / 10,
        avgOverlapPairs: Math.round((acc.overlaps / acc.frames) * 10) / 10,
        avgOverlapArea: Math.round(acc.area / acc.frames),
        relocationsPerSec: Math.round(((relocRef.current.total - acc.startReloc) / measured) * 10) / 10,
      } : null,
    };
    setBenchState({ running: false, phase: 'done', remaining: 0 });
    setBenchJson((prev) => {
      const arr = prev ? safeParseArray(prev) : [];
      arr.push(result);
      return JSON.stringify(arr, null, 2);
    });
  }

  // ---------- 馬発見タスク ----------
  function startTask() {
    const s = settingsRef.current;
    const nums = buildFixtureHorses(s.horseCount, s.seed).map((h) => h.horseNumber);
    // seed 固定シャッフル（A/B/C で同一出題順）
    const order = seededShuffle(nums, s.seed).slice(0, Math.min(8, nums.length));
    taskRef.current = { active: true, order, index: 0, startedAt: performance.now(), wrong: 0, results: [] };
    // 対象の自動強調を避けるため選択リングを外す
    setSettings((prev) => ({ ...prev, selected: 0, labelMode: prev.labelMode === 'tracking' ? 'tracking' : prev.labelMode }));
    setTaskJson('');
    setTaskState({ active: true, target: order[0], index: 0, total: order.length, done: false });
  }
  function onPointerDown(ev: PointerEvent) {
    const t = taskRef.current; if (!t.active) return;
    const renderer = rendererRef.current, cam = cameraRef.current; if (!renderer || !cam) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    raycasterRef.current.setFromCamera(ndc, cam);
    const groups = Array.from(horsesRef.current.values()).map((m) => m.group);
    const hits = raycasterRef.current.intersectObjects(groups, true);
    let clicked = -1;
    if (hits.length) { let o: THREE.Object3D | null = hits[0].object; while (o) { if (o.userData?.horseNumber) { clicked = o.userData.horseNumber; break; } o = o.parent; } }
    const target = t.order[t.index];
    if (clicked === target) {
      t.results.push({ target, timeMs: Math.round(performance.now() - t.startedAt), wrong: t.wrong });
      t.index++; t.wrong = 0; t.startedAt = performance.now();
      if (t.index >= t.order.length) finishTask();
      else setTaskState((st) => ({ ...st, target: t.order[t.index], index: t.index }));
    } else if (clicked !== -1) {
      t.wrong++;
    }
  }
  function finishTask() {
    const t = taskRef.current; t.active = false;
    const times = t.results.map((r) => r.timeMs).sort((a, b) => a - b);
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
    const median = times.length ? times[Math.floor(times.length / 2)] : 0;
    const wrongTotal = t.results.reduce((a, r) => a + r.wrong, 0);
    const s = settingsRef.current;
    const out = {
      note: '厳密な学術実験ではなく、案の相対比較用。',
      condition: { variant: APPROACH_TO_VARIANT[s.approach], scene: SCENARIO_TO_SCENE[s.scenario], horses: s.horseCount, labels: s.labelMode, seed: s.seed },
      questions: t.results, averageFindMs: avg, medianFindMs: median, wrongClicks: wrongTotal,
      completionRate: t.results.length / t.order.length,
    };
    setTaskJson(JSON.stringify(out, null, 2));
    setTaskState((st) => ({ ...st, active: false, done: true }));
  }

  // ---------- キャプチャ ----------
  function downloadCurrentPng() {
    const renderer = rendererRef.current, scene = sceneRef.current, cam = cameraRef.current; if (!renderer || !scene || !cam) return;
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    const s = settingsRef.current;
    const name = `${APPROACH_TO_VARIANT[s.approach]}-${s.approach}-${SCENARIO_TO_SCENE[s.scenario]}-${s.horseCount}${s.view !== 'default' ? '-' + s.view : ''}.png`;
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  }

  // ---------- UI ----------
  const set = (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch }));
  const applyPreset = (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch }));

  return (
    <div className="flex flex-col gap-3">
      <div ref={stageRef} className="relative mx-auto w-full overflow-hidden rounded-lg border border-gray-300 bg-black" style={{ height: '68dvh' }}>
        <div ref={mountRef} className="absolute inset-0" />
        <div ref={labelLayerRef} className="pointer-events-none absolute inset-0" />

        {!capture && (
          <div className="absolute left-2 top-2 rounded-md bg-black/70 px-3 py-2 font-mono text-[11px] leading-4 text-lime-300 tabular-nums">
            <div>FPS: {hud.fps} <span className="text-lime-500/70">(参考)</span></div>
            <div>draw calls: {hud.calls}</div>
            <div>triangles: {hud.tris.toLocaleString()}</div>
            <div>geometries: {hud.geos} / textures: {hud.texs}</div>
            <div>programs: {hud.programs}</div>
          </div>
        )}
        {!capture && (
          <div className="absolute right-2 top-2 rounded-md bg-white/85 px-3 py-2 font-mono text-[11px] leading-4 text-gray-800 tabular-nums">
            <div className="font-bold">label metrics</div>
            <div>total {lm.total} / visible {lm.visible} / hidden {lm.hidden}</div>
            <div>overlap pairs {lm.overlapPairs} / area {lm.overlapArea}</div>
            <div>sel-overlap {lm.selectedOverlap} / reloc/s {lm.relocationsPerSec}</div>
            <div>maxDist {lm.maxDist}px / breaks {lm.breaks}</div>
          </div>
        )}

        {taskState.active && (
          <div className="absolute inset-x-0 top-0 flex justify-center">
            <div className="mt-2 rounded-md bg-black/80 px-4 py-2 text-center text-white">
              <div className="text-xs text-gray-300">この馬番をクリック（{taskState.index + 1}/{taskState.total}）</div>
              <div className="text-3xl font-bold tabular-nums">{taskState.target}</div>
            </div>
          </div>
        )}

        {settings.labelMode === 'tracking' && <TrackingStrip settings={settings} />}
      </div>

      {!capture && (
        <>
          {/* プリセット */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-gray-500">プリセット</span>
            {PRESETS.map((p) => (
              <button key={p.id} onClick={() => applyPreset(p.patch)}
                className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
                {p.label}
              </button>
            ))}
          </div>

          {/* 変数（変わるのはビジュアル方式だけ） */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Control label="ビジュアル案 (variant)">
              <Seg value={settings.approach} onChange={(v) => set({ approach: v as Approach })}
                options={[['cel', 'A:Cel'], ['semi', 'B:Semi'], ['dataviz', 'C:Data']]} />
            </Control>
            <Control label="scene">
              <Seg value={settings.scenario} onChange={(v) => set({ scenario: v as Scenario })}
                options={[['straight', '直線'], ['corner', 'コーナー'], ['goal', 'ゴール前'], ['pack', '密集']]} />
            </Control>
            <Control label="surface"><Seg value={settings.surface} onChange={(v) => set({ surface: v as Surface })} options={[['turf', '芝'], ['dirt', 'ダート']]} /></Control>
            <Control label="speed"><Seg value={String(settings.speed)} onChange={(v) => set({ speed: Number(v) })} options={[['0', '0'], ['0.5', '0.5'], ['1', '1']]} /></Control>
            <Control label="horses"><Seg value={String(settings.horseCount)} onChange={(v) => set({ horseCount: Number(v) })} options={[['8', '8'], ['14', '14'], ['18', '18']]} /></Control>
            <Control label="labels"><Seg value={settings.labelMode} onChange={(v) => set({ labelMode: v as LabelMode })} options={[['all', '全頭'], ['selected', '選択のみ'], ['saddle', 'ゼッケン'], ['tracking', 'ストリップ']]} /></Control>
            <Control label="view"><Seg value={settings.view} onChange={(v) => set({ view: v as ViewMode })} options={[['default', '広角'], ['zoomSide', '側面'], ['zoomFront', '斜め前'], ['zoomRear', '斜め後']]} /></Control>
            <Control label="hysteresis"><Seg value={settings.hysteresis ? '1' : '0'} onChange={(v) => set({ hysteresis: v === '1' })} options={[['1', 'ON'], ['0', 'OFF']]} /></Control>
          </div>

          {/* アクション */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => startBenchmark(30)} disabled={benchState.running}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-gray-400">
              30秒ベンチ（現在の頭数）
            </button>
            <button onClick={() => startTask()} disabled={taskState.active}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:bg-gray-400">
              馬発見タスク開始
            </button>
            <button onClick={downloadCurrentPng} className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-900">
              現在の画面をPNG保存
            </button>
            <button onClick={() => setCapture(true)} className="rounded-md bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-300">
              captureモード
            </button>
            <span className="text-[11px] text-gray-500">固定サイズ:</span>
            {CAPTURE_SIZES.map(([w, h, lbl]) => (
              <button key={lbl} onClick={() => setCaptureSize([w, h])} className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-200">{lbl}</button>
            ))}
            <button onClick={() => setCaptureSize(null)} className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-200">可変</button>
            <button onClick={() => navigator.clipboard?.writeText(window.location.origin + currentUrl()).catch(() => {})}
              className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-200">
              固定URLをコピー
            </button>
          </div>

          {benchState.phase && (
            <div className="text-xs text-gray-600">ベンチ状態: {benchState.phase} {benchState.running ? `残り ${benchState.remaining}s` : ''}</div>
          )}
          {benchJson && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-gray-500">benchmark JSON（選択してコピー可）</span>
              <textarea readOnly value={benchJson} className="h-40 w-full rounded-md border border-gray-300 p-2 font-mono text-[11px] text-gray-800" />
            </div>
          )}
          {taskJson && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-gray-500">馬発見タスク JSON</span>
              <textarea readOnly value={taskJson} className="h-32 w-full rounded-md border border-gray-300 p-2 font-mono text-[11px] text-gray-800" />
            </div>
          )}

          <p className="text-pretty text-xs text-gray-500">
            同じURLで world position / 番号 / 枠色 / 選択馬 / カメラ / FOV / 光源 / surface / phase が完全再現されます（speed=0推奨で静止再現）。
            FPSは<b>参考値</b>。headless/software renderingは実機性能ではありません。A/B/C切替で馬位置・カメラ・時刻は変わりません。
          </p>
        </>
      )}

      {capture && (
        <div className="flex items-center gap-2">
          <button onClick={() => setCapture(false)} className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-900">captureモード解除</button>
          <button onClick={downloadCurrentPng} className="rounded-md bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700">PNG保存</button>
          <span className="text-[11px] text-gray-500">HUD/操作は非表示。識別UI（ラベル/ストリップ）は案の一部として残します。</span>
        </div>
      )}
    </div>
  );
}

// ---- 小物 ----
function Control({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex flex-col gap-1"><span className="text-[11px] font-medium text-gray-500">{label}</span>{children}</div>;
}
function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([v, lbl]) => (
        <button key={v} onClick={() => onChange(v)}
          className={'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ' + (value === v ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}>
          {lbl}
        </button>
      ))}
    </div>
  );
}
function TrackingStrip({ settings }: { settings: Settings }) {
  const horses = buildFixtureHorses(settings.horseCount, settings.seed).slice().sort((a, b) => a.styleBias - b.styleBias);
  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap gap-1 rounded-md bg-black/55 p-1.5">
      {horses.map((h) => {
        const sel = h.horseNumber === settings.selected && settings.selected > 0;
        return (
          <span key={h.horseNumber} className="inline-flex size-6 items-center justify-center rounded text-xs font-bold tabular-nums"
            style={{ background: hex(WAKU_HEX[(h.waku - 1) % 8]), color: wakuTextColor(h.waku), outline: sel ? '2px solid #ff3b30' : 'none' }}>
            {h.horseNumber}
          </span>
        );
      })}
    </div>
  );
}

// ---- utils ----
function hex(n: number): string { return `#${n.toString(16).padStart(6, '0')}`; }
function safeParseArray(s: string): any[] { try { const v = JSON.parse(s); return Array.isArray(v) ? v : [v]; } catch { return []; } }
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(pseudo(i * 3.1 + seed * 17.7) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- テクスチャ（seed 固定・Math.random 不使用）----
function makeBlobTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function makeGroundTexture(turf: boolean, detail: 'low' | 'mid' | 'high', seed: number): THREE.CanvasTexture {
  const size = detail === 'high' ? 512 : detail === 'mid' ? 256 : 128;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  let k = seed * 1000 + (turf ? 7 : 13);
  const rnd = () => { k += 1; return pseudo(k); };
  if (turf) {
    ctx.fillStyle = '#3f7a3a'; ctx.fillRect(0, 0, size, size);
    const stripe = size / 8;
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'; ctx.fillRect(0, i * stripe, size, stripe); }
    if (detail !== 'low') for (let i = 0; i < size * 4; i++) { ctx.fillStyle = `rgba(${30 + rnd() * 40},${90 + rnd() * 60},${30 + rnd() * 40},0.25)`; ctx.fillRect(rnd() * size, rnd() * size, 1, 2); }
  } else {
    ctx.fillStyle = '#b58a58'; ctx.fillRect(0, 0, size, size);
    if (detail !== 'low') {
      for (let i = 0; i < size * 6; i++) { const v = rnd(); ctx.fillStyle = `rgba(${120 + v * 60},${90 + v * 40},${50 + v * 30},0.3)`; ctx.fillRect(rnd() * size, rnd() * size, 1, 1); }
      ctx.strokeStyle = 'rgba(90,60,35,0.25)';
      for (let x = 0; x < size; x += size / 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 6, size); ctx.stroke(); }
    }
  }
  return new THREE.CanvasTexture(c);
}
