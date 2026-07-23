'use client';

/**
 * Visual Lab シーン本体（本番 RaceSimulator3DProto から完全分離）
 *
 * 同一条件（同じ頭数・同じコース幅・同じカメラ・同じ密集配置）で
 * 3案（cel / semi / dataviz）を切り替えて見比べるための開発専用画面。
 *
 * - timeline / race-dynamics / racecourse-geometry / start-marker には一切依存しない
 * - 固定 fixture（fixtures.ts）から world pose を生成
 * - 性能HUD は renderer.info（draw calls / triangles / geometries / textures）を実測
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import {
  Approach, Scenario, Surface, SpeedMode, LabelMode,
  buildFixtureHorses, scenarioPoses, cameraFor, WAKU_HEX, wakuTextColor,
  TRACK_WIDTH,
} from './fixtures';
import { buildHorse, HorseModel } from './horseModels';
import { LabelManager, LabelInput, LabelOut } from './labels';

interface Settings {
  approach: Approach;
  scenario: Scenario;
  surface: Surface;
  speed: SpeedMode;
  horseCount: number;
  labelMode: LabelMode;
  shadows: boolean;
  selected: number;
}

const SPEED_VALUE: Record<SpeedMode, number> = { still: 0, slow: 0.35, normal: 1 };

export default function VisualLabScene() {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);

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

  const settingsRef = useRef<Settings>({
    approach: 'cel', scenario: 'straight', surface: 'turf',
    speed: 'normal', horseCount: 14, labelMode: 'all', shadows: true, selected: 5,
  });

  const [settings, setSettings] = useState<Settings>(settingsRef.current);
  const [hud, setHud] = useState({ fps: 0, calls: 0, tris: 0, geos: 0, texs: 0, programs: 0 });
  const [hysteresis, setHysteresis] = useState(true);

  // settings state -> ref 同期（アニメループはrefを読む）
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { labelMgrRef.current.hysteresis = hysteresis; }, [hysteresis]);

  // ---- renderer / scene / loop を一度だけ構築 ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
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
    // OrbitControls（任意で回して確認できる。既定はプリセット位置）
    import('three/examples/jsm/controls/OrbitControls.js').then(({ OrbitControls }) => {
      if (disposed) return;
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.target.set(0, 2, 0);
      controlsRef.current = controls;
      applyCamera(settingsRef.current.scenario);
    });

    // 初回コンテンツ
    rebuildScene();
    applyCamera(settingsRef.current.scenario);

    // リサイズ
    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);

    // FPS 計測
    let frames = 0, fpsAcc = 0;

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const dt = clockRef.current.getDelta();
      const t = clockRef.current.elapsedTime;
      const s = settingsRef.current;
      const speed = SPEED_VALUE[s.speed];

      // 密集の呼吸（packT）
      const packT = (t * 0.15) % 1;
      updateHorsePositions(packT);

      // 脚アニメ
      horsesRef.current.forEach((m) => m.gait(t, speed));

      controlsRef.current?.update();
      renderer.render(scene, camera);
      updateLabels();

      // HUD
      frames++; fpsAcc += dt;
      if (fpsAcc >= 0.5) {
        const info = renderer.info;
        setHud({
          fps: Math.round(frames / fpsAcc),
          calls: info.render.calls,
          tris: info.render.triangles,
          geos: info.memory.geometries,
          texs: info.memory.textures,
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

  // ---- 見た目に影響する設定変更でシーン再構築 ----
  useEffect(() => {
    if (!sceneRef.current) return;
    rebuildScene();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.approach, settings.scenario, settings.surface, settings.horseCount, settings.shadows, settings.selected]);

  useEffect(() => {
    applyCamera(settings.scenario);
    labelMgrRef.current.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.scenario]);

  // ---------- シーン構築ヘルパー ----------
  function applyCamera(scenario: Scenario) {
    const cam = cameraRef.current; if (!cam) return;
    const p = cameraFor(scenario);
    cam.fov = p.fov;
    cam.position.set(...p.position);
    cam.updateProjectionMatrix();
    if (controlsRef.current) {
      controlsRef.current.target.set(...p.lookAt);
      controlsRef.current.update();
    } else {
      cam.lookAt(p.lookAt[0], p.lookAt[1], p.lookAt[2]);
    }
  }

  function clearContent() {
    const scene = sceneRef.current; const content = contentRef.current;
    if (scene && content) {
      scene.remove(content);
      content.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) {
          for (const v of Object.values(mat as any)) if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
          mat.dispose();
        }
      });
    }
    contentRef.current = null;
  }

  function clearHorses() {
    const content = contentRef.current;
    horsesRef.current.forEach((m) => {
      content?.remove(m.group);
      m.group.parent?.remove(m.group);
      m.dispose();
    });
    horsesRef.current.clear();
  }

  function rebuildScene() {
    const scene = sceneRef.current; const renderer = rendererRef.current;
    if (!scene || !renderer) return;
    const s = settingsRef.current;

    clearHorses();
    clearContent();

    // 既存ライト削除
    const lights = scene.children.filter((c) => (c as THREE.Light).isLight);
    lights.forEach((l) => scene.remove(l));

    renderer.shadowMap.enabled = s.shadows;

    const content = new THREE.Group();
    contentRef.current = content;
    scene.add(content);

    setupLighting(scene, s);
    buildTrack(content, s);
    buildHorses(content, s);
  }

  function setupLighting(scene: THREE.Scene, s: Settings) {
    if (s.approach === 'semi') {
      const hemi = new THREE.HemisphereLight(0xbcd6f5, 0x50583e, 0.55);
      scene.add(hemi);
      const dir = new THREE.DirectionalLight(0xfff2df, 1.15);
      dir.position.set(40, 70, 30);
      dir.castShadow = s.shadows;
      dir.shadow.mapSize.set(1024, 1024);
      const c = dir.shadow.camera as THREE.OrthographicCamera;
      c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 1; c.far = 200;
      scene.add(dir);
    } else if (s.approach === 'cel') {
      const hemi = new THREE.HemisphereLight(0xffffff, 0x6b7280, 0.7);
      scene.add(hemi);
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(30, 60, 40);
      dir.castShadow = s.shadows;
      dir.shadow.mapSize.set(1024, 1024);
      const c = dir.shadow.camera as THREE.OrthographicCamera;
      c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 1; c.far = 200;
      scene.add(dir);
    } else {
      // dataviz: 均一で明るく、影は最小
      const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa4b2, 1.0);
      scene.add(hemi);
      const dir = new THREE.DirectionalLight(0xffffff, 0.5);
      dir.position.set(0, 80, 20);
      scene.add(dir);
    }
  }

  function buildTrack(content: THREE.Group, s: Settings) {
    const turf = s.surface === 'turf';
    // 地面テクスチャ（案ごとに密度を変える）
    const detail = s.approach === 'semi' ? 'high' : s.approach === 'cel' ? 'mid' : 'low';
    const groundTex = makeGroundTexture(turf, detail);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(8, 8);

    const groundMat = s.approach === 'semi'
      ? new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 })
      : new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = s.shadows;
    content.add(ground);

    // 走路帯（内外柵の間）
    const laneMat = new THREE.MeshStandardMaterial({
      color: turf ? 0x4f7f45 : 0xb08a5a, roughness: 1, transparent: true, opacity: 0.35,
    });
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_WIDTH, 300), laneMat);
    lane.rotation.x = -Math.PI / 2;
    lane.position.y = 0.02;
    content.add(lane);

    // 内外柵（白ポスト＋レール）
    const railMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const x = side * (TRACK_WIDTH / 2);
      const railGeo = new THREE.BoxGeometry(0.12, 0.12, 300);
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(x, 1.0, 0);
      content.add(rail);
      // 支柱
      for (let z = -140; z <= 140; z += 8) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), railMat);
        post.position.set(x, 0.5, z);
        post.castShadow = s.shadows;
        content.add(post);
      }
    }

    // ゴール線・ゴール板・ハロン棒
    if (s.scenario === 'straight' || s.scenario === 'goal' || s.scenario === 'pack') {
      const goalZ = s.scenario === 'goal' ? 14 : 40;
      const goalLine = new THREE.Mesh(
        new THREE.PlaneGeometry(TRACK_WIDTH, 0.6),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      goalLine.rotation.x = -Math.PI / 2;
      goalLine.position.set(0, 0.05, goalZ);
      content.add(goalLine);
      // ゴール板（赤白ポール + サイン）
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.7 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 8), poleMat);
      pole.position.set(TRACK_WIDTH / 2 + 1.5, 2, goalZ);
      pole.castShadow = s.shadows;
      content.add(pole);
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 2.4),
        new THREE.MeshStandardMaterial({ color: 0x1b3a6b, roughness: 0.6 }));
      board.position.set(TRACK_WIDTH / 2 + 1.5, 4.2, goalZ);
      content.add(board);
      // ハロン棒
      const furlongMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
      for (let z = goalZ - 200; z < goalZ; z += 200 / 5) {
        const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), furlongMat);
        fp.position.set(TRACK_WIDTH / 2 + 0.6, 1.2, z);
        content.add(fp);
      }
    }
  }

  function buildHorses(content: THREE.Group, s: Settings) {
    const horses = buildFixtureHorses(s.horseCount);
    for (const h of horses) {
      const model = buildHorse(s.approach, {
        waku: h.waku, horseNumber: h.horseNumber, selected: h.horseNumber === s.selected,
      });
      // 選択ハイライト（枠色リング）: 全案共通の補助
      if (h.horseNumber === s.selected) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1.3, 0.12, 8, 28),
          new THREE.MeshBasicMaterial({ color: 0xffffff }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.06;
        model.group.add(ring);
      }
      // 接地影: semi は shadowMap、cel/dataviz は blob
      if (s.approach !== 'semi' && blobRef.current) {
        const blob = new THREE.Mesh(
          new THREE.PlaneGeometry(2.2, 2.2),
          new THREE.MeshBasicMaterial({ map: blobRef.current, transparent: true, opacity: 0.5, depthWrite: false }),
        );
        blob.rotation.x = -Math.PI / 2;
        blob.position.y = 0.03;
        model.group.add(blob);
      }
      content.add(model.group);
      horsesRef.current.set(h.horseNumber, model);
    }
    updateHorsePositions(0);
  }

  function updateHorsePositions(packT: number) {
    const s = settingsRef.current;
    const horses = buildFixtureHorses(s.horseCount);
    const poses = scenarioPoses(horses, s.scenario, packT);
    for (const pose of poses) {
      const m = horsesRef.current.get(pose.horseNumber);
      if (!m) continue;
      m.group.position.set(pose.x, 0, pose.z);
      m.group.rotation.y = pose.heading;
    }
  }

  // ---------- ラベル（DOM overlay） ----------
  function updateLabels() {
    const layer = labelLayerRef.current; const cam = cameraRef.current; const renderer = rendererRef.current;
    if (!layer || !cam || !renderer) return;
    const s = settingsRef.current;
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;

    const horses = buildFixtureHorses(s.horseCount);
    const inputs: LabelInput[] = [];
    horses.forEach((hh) => {
      const m = horsesRef.current.get(hh.horseNumber);
      if (!m) return;
      const world = new THREE.Vector3(0, 3.2, 0).applyMatrix4(m.group.matrixWorld);
      // 先頭馬 = z が最大（+Z 進行）/ corner は概算で priority を距離ベースに
      const isSelected = hh.horseNumber === s.selected;
      const isLeader = hh.horseNumber <= 3 && hh.styleBias < 0.35;
      let priority = 10 - Math.abs(hh.horseNumber - s.selected) * 0.2;
      if (isLeader) priority = 50;
      if (isSelected) priority = 100;

      let forceShow = false;
      let include = true;
      if (s.labelMode === 'selected') { include = isSelected; forceShow = isSelected; }
      else if (s.labelMode === 'leaders') { include = isSelected || isLeader; }
      else if (s.labelMode === 'strip') { include = false; } // ストリップは下部UIで表示

      if (!include) return;
      inputs.push({
        id: hh.horseNumber, world,
        text: String(hh.horseNumber),
        color: `#${WAKU_HEX[(hh.waku - 1) % 8].toString(16).padStart(6, '0')}`,
        textColor: wakuTextColor(hh.waku),
        priority, forceShow,
      });
    });

    const maxVisible = s.labelMode === 'all' ? 99 : s.labelMode === 'leaders' ? 6 : 2;
    const outs = labelMgrRef.current.layout(inputs, cam, w, h, maxVisible, performance.now());
    renderLabelDom(layer, outs);
  }

  function renderLabelDom(layer: HTMLDivElement, outs: LabelOut[]) {
    const pool = labelPoolRef.current;
    while (pool.length < outs.length) {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.transform = 'translate(-50%,-50%)';
      el.style.pointerEvents = 'none';
      el.style.fontWeight = '700';
      el.style.fontSize = '13px';
      el.style.lineHeight = '18px';
      el.style.textAlign = 'center';
      el.style.minWidth = '20px';
      el.style.padding = '1px 5px';
      el.style.borderRadius = '5px';
      el.style.fontVariantNumeric = 'tabular-nums';
      el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';
      layer.appendChild(el);
      pool.push(el);
    }
    for (let i = 0; i < pool.length; i++) {
      const el = pool[i];
      const o = outs[i];
      if (!o || !o.visible) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      el.style.left = `${o.x}px`;
      el.style.top = `${o.y}px`;
      el.style.background = o.color;
      el.style.color = o.textColor;
      el.style.border = o.emphasized ? '2px solid #ffffff' : '1px solid rgba(0,0,0,0.3)';
      el.style.outline = o.emphasized ? '2px solid #ff3b30' : 'none';
      el.style.zIndex = o.emphasized ? '20' : '10';
      el.textContent = o.text;
    }
  }

  // ---------- UI ----------
  const set = (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch }));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full overflow-hidden rounded-lg border border-gray-300 bg-black" style={{ height: '68dvh' }}>
        <div ref={mountRef} className="absolute inset-0" />
        <div ref={labelLayerRef} className="pointer-events-none absolute inset-0" />
        {/* 性能HUD */}
        <div className="absolute left-2 top-2 rounded-md bg-black/70 px-3 py-2 font-mono text-[11px] leading-4 text-lime-300 tabular-nums">
          <div>FPS: {hud.fps}</div>
          <div>draw calls: {hud.calls}</div>
          <div>triangles: {hud.tris.toLocaleString()}</div>
          <div>geometries: {hud.geos}</div>
          <div>textures: {hud.texs}</div>
          <div>programs: {hud.programs}</div>
        </div>
        {/* 案バッジ */}
        <div className="absolute right-2 top-2 rounded-md bg-white/85 px-3 py-1 text-xs font-bold text-gray-800">
          {settings.approach === 'cel' ? '案A: Broadcast Cel' : settings.approach === 'semi' ? '案B: Semi-Realistic' : '案C: Data Visualization'}
        </div>
        {settings.labelMode === 'strip' && <TrackingStrip settings={settings} />}
      </div>

      {/* コントロール */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Control label="ビジュアル案">
          <Seg value={settings.approach} onChange={(v) => set({ approach: v as Approach })}
            options={[['cel', 'A:Cel'], ['semi', 'B:Semi'], ['dataviz', 'C:Data']]} />
        </Control>
        <Control label="シーン">
          <Seg value={settings.scenario} onChange={(v) => set({ scenario: v as Scenario })}
            options={[['straight', '直線'], ['corner', 'コーナー'], ['goal', 'ゴール前'], ['pack', '密集']]} />
        </Control>
        <Control label="馬場">
          <Seg value={settings.surface} onChange={(v) => set({ surface: v as Surface })}
            options={[['turf', '芝'], ['dirt', 'ダート']]} />
        </Control>
        <Control label="速度">
          <Seg value={settings.speed} onChange={(v) => set({ speed: v as SpeedMode })}
            options={[['still', '静止'], ['slow', '低速'], ['normal', '通常']]} />
        </Control>
        <Control label="頭数">
          <Seg value={String(settings.horseCount)} onChange={(v) => set({ horseCount: Number(v) })}
            options={[['8', '8'], ['14', '14'], ['18', '18']]} />
        </Control>
        <Control label="識別方式">
          <Seg value={settings.labelMode} onChange={(v) => set({ labelMode: v as LabelMode })}
            options={[['all', '全頭'], ['leaders', '先頭+選択'], ['selected', '選択のみ'], ['strip', 'ストリップ']]} />
        </Control>
        <Control label="接地影(semi=shadowMap)">
          <Seg value={settings.shadows ? 'on' : 'off'} onChange={(v) => set({ shadows: v === 'on' })}
            options={[['on', 'ON'], ['off', 'OFF']]} />
        </Control>
        <Control label="ラベルのヒステリシス">
          <Seg value={hysteresis ? 'on' : 'off'} onChange={(v) => setHysteresis(v === 'on')}
            options={[['on', 'ON'], ['off', 'OFF']]} />
        </Control>
      </div>
      <p className="text-pretty text-xs text-gray-500">
        ドラッグで視点回転・ホイールでズーム（比較時は各シーンの初期プリセットに合わせて評価）。
        性能HUDは renderer.info の実測値。selected馬=5番。
      </p>
    </div>
  );
}

// ---- 小物UI ----
function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-gray-500">{label}</span>
      {children}
    </div>
  );
}

function Seg({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([v, lbl]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={
            'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ' +
            (value === v ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
          }
        >
          {lbl}
        </button>
      ))}
    </div>
  );
}

function TrackingStrip({ settings }: { settings: Settings }) {
  const horses = buildFixtureHorses(settings.horseCount)
    .slice()
    .sort((a, b) => a.styleBias - b.styleBias); // 先頭順
  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-wrap gap-1 rounded-md bg-black/55 p-1.5">
      {horses.map((h) => {
        const hex = `#${WAKU_HEX[(h.waku - 1) % 8].toString(16).padStart(6, '0')}`;
        const sel = h.horseNumber === settings.selected;
        return (
          <span key={h.horseNumber}
            className="inline-flex size-6 items-center justify-center rounded text-xs font-bold tabular-nums"
            style={{
              background: hex, color: wakuTextColor(h.waku),
              outline: sel ? '2px solid #ff3b30' : 'none',
            }}>
            {h.horseNumber}
          </span>
        );
      })}
    </div>
  );
}

// ---- テクスチャ生成 ----
function makeBlobTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function makeGroundTexture(turf: boolean, detail: 'low' | 'mid' | 'high'): THREE.CanvasTexture {
  const size = detail === 'high' ? 512 : detail === 'mid' ? 256 : 128;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  if (turf) {
    ctx.fillStyle = '#3f7a3a'; ctx.fillRect(0, 0, size, size);
    // 刈り目（明暗ストライプ）
    const stripe = size / 8;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(0, i * stripe, size, stripe);
    }
    if (detail !== 'low') {
      for (let i = 0; i < size * 4; i++) {
        ctx.fillStyle = `rgba(${30 + Math.random() * 40},${90 + Math.random() * 60},${30 + Math.random() * 40},0.25)`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 1, 2);
      }
    }
  } else {
    ctx.fillStyle = '#b58a58'; ctx.fillRect(0, 0, size, size);
    if (detail !== 'low') {
      for (let i = 0; i < size * 6; i++) {
        const v = Math.random();
        ctx.fillStyle = `rgba(${120 + v * 60},${90 + v * 40},${50 + v * 30},0.3)`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
      }
      // 轍
      ctx.strokeStyle = 'rgba(90,60,35,0.25)';
      for (let x = 0; x < size; x += size / 16) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 6, size); ctx.stroke();
      }
    }
  }
  return new THREE.CanvasTexture(c);
}
