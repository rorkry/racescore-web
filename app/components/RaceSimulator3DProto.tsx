'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { generateTimeline, interpolateTimeline, type RaceTimeline, type RaceTimelineKeyframe } from '@/lib/race-simulator/timeline-generator';
import { validateInterpolatedTimeline } from '@/lib/race-simulator/timeline-validation';
import { buildVisualCourseCurve, sampleLoopPose, sampleRacePose, type VisualCourseCurve } from '@/lib/race-simulator/course-curve';
import { selectCameraMode, computeCameraPose, shouldUseFinishCamera, computeFinishApproachPose, type CameraMode } from '@/lib/race-simulator/camera-director';
import { shouldShowDebugHud } from '@/lib/race-simulator/hud-visibility';
import {
  resolveRacecourseLayout,
  runRaceDynamicsForRace,
  interpolateDynamicsForDisplay,
  buildForecastLayoutsFromSimulation,
  type RacecourseLayout,
  type ForecastLayouts3D,
} from '@/lib/race-simulator/race-3d-integration';
import { sampleRaceProgressPose, GEOMETRIES_BY_VENUE } from '@/lib/racecourse-geometry';
import { buildTrackGroup, buildStartFinishGroup, type TrackRenderResult } from '@/lib/race-simulator/track-render';
import type { RaceDynamicsResult } from '@/lib/race-dynamics';
import {
  createHorseVisualResources,
  createBroadcastCelHorseVisual,
  wakuCssColor,
  wakuTextColor,
  type HorseVisualResources,
  type HorseVisual,
} from '@/lib/race-simulator/broadcast-cel-horse';
import {
  HorseLabelManager,
  buildLabelPriority,
  shouldLabelHorse,
  type LabelInput,
  type LabelOut,
} from '@/lib/race-simulator/horse-labels';
import { RaceTrackingPanelDesktop, RaceTrackingPanelMobile } from './RaceTrackingPanel';
import { buildTrackingRows, trackingInputsFromDynamics, type TrackingRow } from '@/lib/race-simulator/tracking-rows';
import { computeRendererSize, applyViewportSizeToCamera } from '@/lib/race-simulator/viewport-size';

interface RaceSimulator3DProtoProps {
  simulationResult: any;
  courseInfo: any;
}

/**
 * 馬ビジュアルモード（feature flag）。
 * 既定は Broadcast Cel（本番標準）。?horseVisual=legacy で旧カプセルへ、?horseVisual=cel で強制。
 * 新ビジュアルの生成で例外が出た場合はレース単位で legacy へ自動 fallback する（warning 出力）。
 * 一般ユーザー向けの UI 切替ボタンは追加しない。
 */
type HorseVisualMode = 'cel' | 'legacy';
function resolveHorseVisualMode(search: string): HorseVisualMode {
  try {
    const p = new URLSearchParams(search).get('horseVisual');
    if (p === 'legacy') return 'legacy';
    if (p === 'cel') return 'cel';
  } catch { /* SSR等 */ }
  return 'cel';
}

/**
 * 頭上ラベルの表示モード（feature flag / デバッグ用）。
 * 既定 'auto' = 選択馬 / hover 馬 / 先頭馬のみ。?labels=all で全頭表示（デバッグ）。
 * 全頭の識別は常設の画面端トラッキングパネルが保証するため、通常は 'auto' で十分。
 */
type LabelsMode = 'auto' | 'all';
function resolveLabelsMode(search: string): LabelsMode {
  try {
    const p = new URLSearchParams(search).get('labels');
    if (p === 'all') return 'all';
  } catch { /* SSR等 */ }
  return 'auto';
}

/** simulationResult(読み取り専用) から horseNumber→{waku, 毛色名} を作る。simロジックは変更しない。 */
function buildHorseMetaMap(simulationResult: any): Map<number, { waku: number; coatName?: string }> {
  const map = new Map<number, { waku: number; coatName?: string }>();
  const list: any[] =
    simulationResult?.finalStandings ??
    simulationResult?.phases?.start?.horses ??
    [];
  for (const h of list) {
    if (h && typeof h.horseNumber === 'number') {
      map.set(h.horseNumber, {
        waku: typeof h.waku === 'number' && h.waku > 0 ? h.waku : jraWakuOf(h.horseNumber, list.length || 1),
        coatName: typeof h.coatColor === 'string' ? h.coatColor : (typeof h.keiro === 'string' ? h.keiro : undefined),
      });
    }
  }
  return map;
}

/** JRA 枠割り（実データに waku が無い場合の決定的 fallback）。 */
function jraWakuOf(horseNumber: number, total: number): number {
  if (total <= 8) return Math.max(1, Math.min(8, horseNumber));
  const base = Math.floor(total / 8);
  const extra = total % 8;
  let acc = 0;
  for (let w = 1; w <= 8; w++) {
    const inWaku = base + (w > 8 - extra ? 1 : 0);
    acc += inWaku;
    if (horseNumber <= acc) return w;
  }
  return 8;
}

/**
 * 馬モデルの見た目スケール（Visual Step 1C-3A）
 * 中継カメラ距離でも馬が点にならないよう、メッシュのローカルスケールのみ拡大する。
 * simulation 座標・laneOffset・currentDistance には一切影響しない。
 */
const HORSE_VISUAL_SCALE = 1.8;

/** 俯瞰(overview)カメラの基準視点（デバッグ/全体確認用） */
const OVERVIEW_POSITION = new THREE.Vector3(0, 320, -420);
const OVERVIEW_LOOKAT = new THREE.Vector3(0, 0, 0);
const OVERVIEW_FOV = 55;

/**
 * 3Dレースシミュレーター（Phase 4.2 縦切りプロトタイプ）
 * 
 * 目標: 実在する1レースを、現在のシミュレーション結果に沿って、
 *       スタートからゴールまで3Dで再生できること
 */
export default function RaceSimulator3DProto({
  simulationResult,
  courseInfo,
}: RaceSimulator3DProtoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  /** 3D viewport（containerRef）の実測サイズのみを監視。tracking panel 等の高さは含めない。 */
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const horseMeshesRef = useRef<Map<number, THREE.Group>>(new Map());
  // Broadcast Cel: 共有リソース（renderer/コンポーネント生存中は保持し、unmount時のみ dispose）
  const horseResourcesRef = useRef<HorseVisualResources | null>(null);
  // レース固有の各馬ビジュアル（レース切替で root だけ破棄。共有リソースは破棄しない）
  const horseVisualsRef = useRef<Map<number, HorseVisual>>(new Map());
  const horseModeRef = useRef<HorseVisualMode>('cel');       // 実効モード（fallback で legacy になり得る）
  const horseMetaRef = useRef<Map<number, { waku: number; coatName?: string }>>(new Map());
  /** horseNumber → 馬名（トラッキング表示用。レース切替で再構築） */
  const horseNameRef = useRef<Map<number, string>>(new Map());
  // 頭上ラベル（screen-space・選択/hover/先頭のみ・真上固定）。全頭識別はトラッキングパネルで保証。
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const labelMgrRef = useRef<HorseLabelManager>(new HorseLabelManager());
  const labelPoolRef = useRef<HTMLDivElement[]>([]);
  const labelsModeRef = useRef<LabelsMode>('auto');
  const hoverHorseRef = useRef<number | null>(null);
  const prevHeadingRef = useRef<Map<number, number>>(new Map());
  const gaitTimeRef = useRef<number>(0);            // 再生中のみ進む gait 時刻（frame-rate 非依存）
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  /** ゴール先頭入線時刻（currentTimeRef 基準）。未入線は null */
  const leaderFinishTimeRef = useRef<number | null>(null);
  /** トラッキング行（3D と同じ dynamics/timeline フレームから 100〜200ms で更新） */
  const [trackingRows, setTrackingRows] = useState<TrackingRow[]>([]);
  const courseGeometryRef = useRef<{
    track?: THREE.Mesh;
    innerRail?: THREE.Line;
    outerRail?: THREE.Line;
    startLine?: THREE.Line;
    goalLine?: THREE.Line;
  }>({});
  
  const [timeline, setTimeline] = useState<RaceTimeline | null>(null);
  // timeline が再生契約を満たすか（frames>=2 / duration有限正 / time単調 等）。
  // 不正な場合でも scene と初期馬位置は表示するが、再生はさせない（3Dクラッシュ防止）。
  const [timelineValid, setTimelineValid] = useState(false);
  const [timelineErrors, setTimelineErrors] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [cameraMode, setCameraMode] = useState<'broadcast' | 'overview' | 'follow'>('broadcast');
  const [selectedHorse, setSelectedHorse] = useState<number | null>(null);
  // 中継カメラの現在デバッグ表示用（HUD）
  const [broadcastModeLabel, setBroadcastModeLabel] = useState<CameraMode | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(true);
  const [showDebugHud, setShowDebugHud] = useState(false); // デバッグHUD表示制御（production + ?debug=1 または development）
  const lastTimeRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0); // 内部再生時刻（毎フレーム更新）
  const lastUIUpdateRef = useRef<number>(0); // 最後にUI更新した時刻
  const lastDebugAtRef = useRef<number>(0); // デバッグログ出力時刻
  const previousDistanceRef = useRef<number | null>(null); // 前回の距離
  const debugInitializedRef = useRef<boolean>(false); // 初回ログ出力済み
  
  // Visual Step 1B: 周回コース曲線（1回だけ構築、courseInfo変化時のみ再構築）
  const visualCurveRef = useRef<VisualCourseCurve | null>(null);
  
  // Visual Step 1C-3A: 中継カメラの平滑化用（瞬間移動を避けるため time 補間）
  const broadcastLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const broadcastInitRef = useRef<boolean>(false); // 初回フレームは補間せず即セット
  const broadcastModeRef = useRef<CameraMode | null>(null);
  
  // Phase B: 公式ジオメトリ + レースダイナミクス接続（位置とレース進行の正本）
  const layoutRef = useRef<RacecourseLayout | null>(null);
  const dynamicsRef = useRef<RaceDynamicsResult | null>(null);
  /** Old-2D start/goal layouts for goal-approach display blend (meters). */
  const forecastLayoutsRef = useRef<ForecastLayouts3D | null>(null);
  const trackGroupsRef = useRef<TrackRenderResult[]>([]);
  const groundRef = useRef<THREE.Mesh | null>(null);
  // レース切替の安全化: シーン世代。init のたびに +1 し、
  // 古い requestAnimationFrame ループ（旧世代）は自分の世代不一致で即停止する。
  const sceneGenerationRef = useRef<number>(0);
  
  // 画面内デバッグHUD用の状態
  const [debugInfo, setDebugInfo] = useState<any>(null);
  
  // レース識別シグネチャ（これが変わったときだけ 3D シーンを作り直す）。
  // simulationResult / courseInfo はfetchのたびに新規オブジェクトになるため、
  // オブジェクト参照ではなく安定した文字列で init をキーする（多重initによる不整合を防ぐ）。
  const raceSignature = [
    simulationResult?.raceKey ?? '',
    simulationResult?.raceDistance ?? '',
    courseInfo?.id ?? '',
    courseInfo?.place ?? '',
    courseInfo?.distance ?? '',
    courseInfo?.trackType ?? '',
  ].join('::');
  
  // 再生関連stateはアニメーションループから ref 経由で読む
  // （scene初期化effectやループを currentTime/isPlaying/playbackSpeed に依存させないため）
  const isPlayingRef = useRef(isPlaying);
  const playbackSpeedRef = useRef(playbackSpeed);
  const cameraModeRef = useRef(cameraMode);
  const selectedHorseRef = useRef(selectedHorse);
  const timelineValidRef = useRef(timelineValid);
  isPlayingRef.current = isPlaying;
  playbackSpeedRef.current = playbackSpeed;
  cameraModeRef.current = cameraMode;
  selectedHorseRef.current = selectedHorse;
  timelineValidRef.current = timelineValid;
  
  // CourseInfo追跡（初回のみ）
  useEffect(() => {
    console.warn('[COURSEINFO] RaceSimulator3DProto:', {
      courseInfo: courseInfo ? 'LOADED' : 'NULL',
      courseInfoKeys: courseInfo ? Object.keys(courseInfo) : [],
      courseInfoValue: courseInfo
    });
  }, [courseInfo]);
  
  // デバッグHUD表示制御（SSR安全・純粋関数で判定）
  useEffect(() => {
    setShowDebugHud(
      shouldShowDebugHud({
        nodeEnv: process.env.NODE_ENV,
        search: typeof window !== 'undefined' ? window.location.search : '',
      })
    );
  }, []);
  
  // タイムライン生成
  useEffect(() => {
    if (!simulationResult) return;
    
    console.log('[3DSimulator] タイムライン生成中...');
    const tl = generateTimeline(simulationResult);

    // timeline 契約を検証（空/NaN/Infinity/非単調/duration不正を検出）。
    // 不正でも tl 自体はセットして初期位置を描画する（黒画面回避）が、再生は無効化する。
    const validation = validateInterpolatedTimeline(tl);
    setTimeline(tl);
    setTimelineValid(validation.valid);
    setTimelineErrors(validation.errors);

    // 不正時は currentTime/再生をリセットし NaN を持ち込まない
    if (!validation.valid) {
      currentTimeRef.current = 0;
      setCurrentTime(0);
      setIsPlaying(false);
      // production console へ原因を1回だけ出す（fallbackでバグを隠さない）
      console.error(
        '[3DSimulator] ❌ タイムラインが再生契約を満たしません。再生を無効化します:',
        validation.errors,
        { totalDuration: tl.totalDuration, keyframes: tl.keyframes.length }
      );
    }
    
    // 初回デバッグ: keyframes データの確認
    console.log('[SimulatorDebug] === タイムライン生成完了 ===');
    console.log('[SimulatorDebug] keyframes数:', tl.keyframes.length);
    console.log('[SimulatorDebug] 総再生時間:', tl.totalDuration, '秒');
    console.log('[SimulatorDebug] コース距離:', tl.courseDistance, 'm');
    
    if (tl.keyframes.length > 0) {
      const firstFrame = tl.keyframes[0];
      const midFrame = tl.keyframes[Math.floor(tl.keyframes.length / 2)];
      const lastFrame = tl.keyframes[tl.keyframes.length - 1];
      
      const horse1First = firstFrame.horses.find(h => h.horseNumber === 1);
      const horse1Mid = midFrame.horses.find(h => h.horseNumber === 1);
      const horse1Last = lastFrame.horses.find(h => h.horseNumber === 1);
      
      console.log('[SimulatorDebug] 先頭フレーム (t=0):', {
        time: firstFrame.time,
        phase: firstFrame.phase,
        horsesCount: firstFrame.horses.length,
        horse1: horse1First ? {
          horseNumber: horse1First.horseNumber,
          horseName: horse1First.horseName,
          currentDistance: horse1First.currentDistance,
          currentVelocity: horse1First.currentVelocity,
          lateralPosition: horse1First.lateralPosition,
          position: horse1First.position
        } : 'not found'
      });
      
      console.log('[SimulatorDebug] 中間フレーム (t=' + midFrame.time.toFixed(1) + '):', {
        time: midFrame.time,
        phase: midFrame.phase,
        horse1: horse1Mid ? {
          currentDistance: horse1Mid.currentDistance,
          currentVelocity: horse1Mid.currentVelocity,
          position: horse1Mid.position
        } : 'not found'
      });
      
      console.log('[SimulatorDebug] 最終フレーム (t=' + lastFrame.time.toFixed(1) + '):', {
        time: lastFrame.time,
        phase: lastFrame.phase,
        horse1: horse1Last ? {
          currentDistance: horse1Last.currentDistance,
          currentVelocity: horse1Last.currentVelocity,
          position: horse1Last.position
        } : 'not found'
      });
      
      console.log('[SimulatorDebug] 利用可能なフィールド (horse1):', horse1First ? Object.keys(horse1First) : []);
    }
    
    console.log('[SimulatorDebug] CourseInfo:', courseInfo);
    
    debugInitializedRef.current = true;
  }, [simulationResult, courseInfo]);
  
  // Visual Step 1B: 周回コース曲線の構築（courseInfo変化時のみ1回実行）
  useEffect(() => {
    if (!courseInfo) {
      visualCurveRef.current = null;
      console.warn('[VisualCurve] courseInfo が null のため curve 未構築');
      return;
    }
    
    try {
      const curve = buildVisualCourseCurve(courseInfo);
      visualCurveRef.current = curve;
      console.log('[VisualCurve] 周回コース曲線を構築:', {
        raceDistance: curve.raceDistance,
        loopLength: curve.loopLength.toFixed(1),
        startOffset: curve.startOffset.toFixed(1),
        clockwise: curve.clockwise,
        provenance: curve.provenance,
        warnings: curve.warnings.length,
      });
    } catch (e) {
      console.error('[VisualCurve] 曲線構築エラー:', e);
      visualCurveRef.current = null;
    }
  }, [courseInfo]);
  
  /**
   * 3D viewport（containerRef）の実測 width/height に renderer・camera を合わせる。
   * - CSS 側（aspect-video / md:h-[600px] 等）が表示サイズの正本。canvas の内部解像度と
   *   CSS 表示サイズを混同しないよう、canvas.style は 100%/100% に固定し、setSize は
   *   updateStyle=false で内部解像度のみ更新する。
   * - tracking panel はこの container の中身（PC=absolute overlay）か外側（mobile=兄弟要素）
   *   のため、ここでの height 計算には混ざらない。
   */
  const applyViewportSize = useCallback(() => {
    const container = containerRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    if (!container || !renderer || !camera) return;
    const size = computeRendererSize(container.clientWidth, container.clientHeight);
    if (!size) return; // 実測サイズ不正時は前回サイズを維持（黒画面・warp防止）
    renderer.setSize(size.width, size.height, false);
    const canvas = renderer.domElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    applyViewportSizeToCamera(camera, size.width, size.height);
  }, []);

  // Three.js初期化（raceSignature が変わったときだけ再構築）
  useEffect(() => {
    if (!containerRef.current || !simulationResult) return;
    
    console.log('[3DSimulator] Three.js初期化中...');
    
    // このレース用の timeline をローカル生成（stateのlagで layout と食い違わないようにする）
    // 注: state の timeline はタイムライン生成effect が別途 setTimeline する（二重setを避けここでは呼ばない）
    const tl = generateTimeline(simulationResult);
    
    // シーン世代を更新（旧世代の animate ループを無効化）
    sceneGenerationRef.current++;
    // 念のため trackGroups を初期化（cleanup 済みのはずだが多重防御）
    trackGroupsRef.current = [];
    
    // シーン
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // 空色
    sceneRef.current = scene;
    
    // カメラ（初期 aspect は fallback。実サイズは直後の applyViewportSize で確定）
    const initWidth = containerRef.current.clientWidth || 16;
    const initHeight = containerRef.current.clientHeight || 9;
    const camera = new THREE.PerspectiveCamera(
      60,
      initWidth / initHeight,
      0.1,
      10000
    );
    camera.position.set(0, 200, -300);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    
    // レンダラー（表示サイズは CSS のアスペクト比が正本。内部解像度のみ applyViewportSize で合わせる）
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 上限設定
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    applyViewportSize();

    // viewport（containerRef）自体の実測サイズ変化のみを監視（tracking panel 等は含めない）
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        applyViewportSize();
      });
      ro.observe(containerRef.current);
      resizeObserverRef.current = ro;
    }
    
    // コントロール
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;
    
    // ライト（セルルックの読みやすさ: 空/地の環境光 + 指向性。白飛び/黒潰れを避ける）
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x6b7280, 0.85);
    scene.add(hemiLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(100, 200, 100);
    scene.add(directionalLight);
    
    // Phase B: 公式ジオメトリ + レースダイナミクスを解決（位置とレース進行の正本）
    const layout = resolveRacecourseLayout(courseInfo);
    layoutRef.current = layout;
    let dynamics: RaceDynamicsResult | null = null;
    if (layout && simulationResult) {
      try {
        dynamics = runRaceDynamicsForRace(simulationResult, layout, courseInfo);
      } catch (e) {
        console.error('[3DSimulator] race-dynamics 生成エラー（fallbackへ）:', e);
        dynamics = null;
      }
    }
    dynamicsRef.current = dynamics;
    forecastLayoutsRef.current =
      layout && simulationResult
        ? buildForecastLayoutsFromSimulation(
            simulationResult,
            layout.raceDistance,
            layout.geometry.trackWidth,
          )
        : null;
    console.log('[3DSimulator] layout/dynamics:', {
      layout: layout ? layout.routeId : 'null(旧描画へfallback)',
      dynamics: dynamics ? `${dynamics.frames.length}frames/${dynamics.totalTime}s` : 'null',
      startMarkerFallback: layout?.startMarkerIsFallback,
      forecastGoal: forecastLayoutsRef.current?.goal?.length ?? 0,
    });

    // 地面（背景）
    const groundGeom = new THREE.PlaneGeometry(4000, 4000);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a5f3a, roughness: 1 });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.0;
    scene.add(ground);
    groundRef.current = ground;

    // コース作成
    if (layout) {
      // 同一競馬場の全走路を別geometryで描画（active=選択レース）
      try {
        const venueGeoms = GEOMETRIES_BY_VENUE.get(layout.geometry.venue) ?? [layout.geometry];
        for (const g of venueGeoms) {
          const isActive = g.id === layout.geometry.id;
          const tr = buildTrackGroup(g, { active: isActive });
          scene.add(tr.group);
          trackGroupsRef.current.push(tr);
        }
        const sf = buildStartFinishGroup(layout.geometry, layout.startMarker);
        scene.add(sf.group);
        trackGroupsRef.current.push(sf);
      } catch (e) {
        console.error('[3DSimulator] 新走路描画エラー（旧描画へfallback）:', e);
        createCourse(scene, tl.courseDistance, courseInfo);
      }
    } else {
      // layout 解決不可 → 旧 VisualCourseCurve 描画へ fallback
      createCourse(scene, tl.courseDistance, courseInfo);
    }
    
    // 馬ビジュアルモードを解決（既定=Broadcast Cel）。メタ(枠色/毛色名)を読み取り専用で構築。
    const requestedMode = resolveHorseVisualMode(typeof window !== 'undefined' ? window.location.search : '');
    horseModeRef.current = requestedMode;
    labelsModeRef.current = resolveLabelsMode(typeof window !== 'undefined' ? window.location.search : '');
    horseMetaRef.current = buildHorseMetaMap(simulationResult);
    // 馬名マップ（トラッキング用）。simulation の finalStandings / start horses から構築。
    {
      const names = new Map<number, string>();
      const list: any[] =
        simulationResult?.finalStandings ??
        simulationResult?.phases?.start?.horses ??
        [];
      for (const h of list) {
        if (h && typeof h.horseNumber === 'number' && typeof h.horseName === 'string') {
          names.set(h.horseNumber, h.horseName);
        }
      }
      horseNameRef.current = names;
    }
    // 共有リソースは一度だけ生成し保持（レース切替では作り直さない）
    if (requestedMode === 'cel' && !horseResourcesRef.current) {
      try {
        horseResourcesRef.current = createHorseVisualResources();
      } catch (e) {
        console.warn('[3DSimulator] Broadcast Cel 共有リソース生成に失敗 → legacy へ fallback:', e);
        horseModeRef.current = 'legacy';
      }
    }

    // 馬作成
    createHorses(scene, tl.keyframes[0]);

    // トラッキング初回同期（dynamics 設定直後。3D と同じ t=0 フレーム）
    leaderFinishTimeRef.current = null;
    {
      const dynamics = dynamicsRef.current;
      const layout = layoutRef.current;
      const raceDistance = layout?.raceDistance ?? tl.courseDistance ?? 0;
      const wakuOf = (hn: number) => horseMetaRef.current.get(hn)?.waku;
      const nameOf = (hn: number) => horseNameRef.current.get(hn);
      if (dynamics && raceDistance > 0) {
        const frame = interpolateDynamicsForDisplay(dynamics, 0, forecastLayoutsRef.current);
        setTrackingRows(
          buildTrackingRows(trackingInputsFromDynamics(frame, raceDistance, nameOf), { wakuOf, raceDistance }),
        );
      } else {
        const state0 = interpolateTimeline(tl, 0);
        if (state0) {
          setTrackingRows(
            buildTrackingRows(
              state0.horses.map((h) => ({
                horseNumber: h.horseNumber,
                position: h.position,
                horseName: h.horseName ?? nameOf(h.horseNumber),
                currentDistance: h.currentDistance,
                distanceFromLeader: h.distanceFromLeader,
              })),
              { wakuOf, raceDistance },
            ),
          );
        }
      }
    }

    // Broadcast Cel: hover 検出（頭上ラベルの hover 高優先度用。pointer-events は canvas のみ）
    const onPointerMove = (ev: PointerEvent) => {
      if (horseModeRef.current !== 'cel') return;
      const cam = cameraRef.current, rnd = rendererRef.current;
      if (!cam || !rnd) return;
      const rect = rnd.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycasterRef.current.setFromCamera(ndc, cam);
      const roots = Array.from(horseVisualsRef.current.values()).map((v) => v.root);
      const hits = roots.length ? raycasterRef.current.intersectObjects(roots, true) : [];
      let hovered: number | null = null;
      if (hits.length) {
        let o: THREE.Object3D | null = hits[0].object;
        while (o) { if (o.userData?.horseNumber) { hovered = o.userData.horseNumber; break; } o = o.parent; }
      }
      hoverHorseRef.current = hovered;
    };
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', () => { hoverHorseRef.current = null; });

    console.log('[3DSimulator] Three.js初期化完了', { horseMode: horseModeRef.current });
    
    // ── 描画パイプライン診断（debug=1 のときだけ・1回） ──
    const debugEnabled = shouldShowDebugHud({
      nodeEnv: process.env.NODE_ENV,
      search: typeof window !== 'undefined' ? window.location.search : '',
    });
    if (debugEnabled) {
      try {
        const gl = renderer.getContext();
        const size = new THREE.Vector2();
        renderer.getSize(size);
        let meshCount = 0, lineCount = 0, lightCount = 0;
        scene.traverse((o: THREE.Object3D) => {
          const any = o as unknown as { isMesh?: boolean; isLine?: boolean; isLight?: boolean };
          if (any.isMesh) meshCount++;
          else if (any.isLine) lineCount++;
          else if (any.isLight) lightCount++;
        });
        camera.updateMatrixWorld(true);
        const trackCenter = new THREE.Vector3();
        if (layout) {
          const mid = sampleRaceProgressPose(layout.geometry, layout.startMarker.pathDistance, layout.raceDistance / 2, 0);
          trackCenter.set(mid.position.x, mid.position.y, mid.position.z);
        }
        const ndc = trackCenter.clone().project(camera);
        console.log('[BlackScreenDiag] A/B/C/E 診断', {
          canvas: { w: renderer.domElement.width, h: renderer.domElement.height, clientW: renderer.domElement.clientWidth, clientH: renderer.domElement.clientHeight, connected: renderer.domElement.isConnected },
          rendererSize: { x: size.x, y: size.y }, pixelRatio: renderer.getPixelRatio(), contextLost: gl.isContextLost(),
          sceneChildren: scene.children.length, mesh: meshCount, line: lineCount, light: lightCount, horses: horseMeshesRef.current.size, trackGroups: trackGroupsRef.current.length,
          camera: { pos: camera.position.toArray().map((n) => +n.toFixed(1)), fov: camera.fov, near: camera.near, far: camera.far, aspect: +camera.aspect.toFixed(3) },
          trackCenter: trackCenter.toArray().map((n) => +n.toFixed(1)),
          trackCenterNDC: { x: +ndc.x.toFixed(3), y: +ndc.y.toFixed(3), z: +ndc.z.toFixed(3), visible: Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z >= -1 && ndc.z <= 1 },
          generation: sceneGenerationRef.current, renderFrame: renderer.info.render.frame,
        });
        const startFrame = renderer.info.render.frame;
        window.setTimeout(() => {
          try {
            console.log('[BlackScreenDiag] D 1s later', { renderFrame: renderer.info.render.frame, advanced: renderer.info.render.frame > startFrame, contextLost: renderer.getContext().isContextLost() });
          } catch { /* renderer 破棄後は無視 */ }
        }, 1000);
        const dom = renderer.domElement;
        dom.addEventListener('webglcontextlost', () => console.warn('[BlackScreenDiag] webglcontextlost 発火'));
        dom.addEventListener('webglcontextrestored', () => console.warn('[BlackScreenDiag] webglcontextrestored 発火'));
      } catch (e) {
        console.warn('[BlackScreenDiag] 診断中に例外:', e);
      }
    }
    
    // クリーンアップ
    return () => {
      console.log('[3DSimulator] リソースクリーンアップ中...');
      
      // このシーンを無効化（旧世代の animate ループが触れないように）
      sceneGenerationRef.current++;
      
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      
      if (rendererRef.current) {
        // WebGL コンテキストを明示解放（切替ごとの context リーク/枯渇を防ぐ）
        try {
          rendererRef.current.forceContextLoss();
        } catch { /* 一部環境で未対応でも致命ではない */ }
        rendererRef.current.dispose();
      }
      
      // Broadcast Cel: 各馬 root を scene から外すだけ（共有 geometry/material は保持＝誤破棄しない）。
      // legacy: 従来通り per-mesh dispose（旧カプセルは共有リソースを持たない）。
      if (horseVisualsRef.current.size > 0) {
        horseVisualsRef.current.forEach((v) => {
          if (sceneRef.current) sceneRef.current.remove(v.root);
          v.dispose();
        });
        horseVisualsRef.current.clear();
      } else {
        horseMeshesRef.current.forEach(mesh => {
          mesh.traverse(child => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (Array.isArray(child.material)) {
                child.material.forEach(mat => mat.dispose());
              } else {
                child.material.dispose();
              }
            }
          });
        });
      }
      horseMeshesRef.current.clear();
      // レース固有状態をリセット（共有リソースは保持）
      labelMgrRef.current.clearForRaceSwitch();
      prevHeadingRef.current.clear();
      leaderFinishTimeRef.current = null;
      setTrackingRows([]);
      horseNameRef.current = new Map();
      hoverHorseRef.current = null;
      
      // コースジオメトリの dispose（Visual Step 1C-1）
      if (courseGeometryRef.current.track) {
        courseGeometryRef.current.track.geometry.dispose();
        if (courseGeometryRef.current.track.material instanceof THREE.Material) {
          courseGeometryRef.current.track.material.dispose();
        }
      }
      if (courseGeometryRef.current.innerRail) {
        courseGeometryRef.current.innerRail.geometry.dispose();
        if (courseGeometryRef.current.innerRail.material instanceof THREE.Material) {
          courseGeometryRef.current.innerRail.material.dispose();
        }
      }
      if (courseGeometryRef.current.outerRail) {
        courseGeometryRef.current.outerRail.geometry.dispose();
        if (courseGeometryRef.current.outerRail.material instanceof THREE.Material) {
          courseGeometryRef.current.outerRail.material.dispose();
        }
      }
      
      // Phase B: 新走路グループの dispose（scene から remove 後に破棄）
      for (const tr of trackGroupsRef.current) {
        if (sceneRef.current) sceneRef.current.remove(tr.group);
        tr.dispose();
      }
      trackGroupsRef.current = [];
      if (groundRef.current) {
        if (sceneRef.current) sceneRef.current.remove(groundRef.current);
        groundRef.current.geometry.dispose();
        if (groundRef.current.material instanceof THREE.Material) groundRef.current.material.dispose();
        groundRef.current = null;
      }
      
      // DOM から canvas を除去（既に外れている場合は contains でガード）
      if (containerRef.current && rendererRef.current) {
        const dom = rendererRef.current.domElement;
        if (dom && containerRef.current.contains(dom)) {
          containerRef.current.removeChild(dom);
        }
      }
      
      // 参照を明示クリア（dispose 済みオブジェクトへの後続アクセスを防ぐ）
      layoutRef.current = null;
      dynamicsRef.current = null;
      forecastLayoutsRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      broadcastInitRef.current = false;
    };
    // raceSignature が変わったときだけ作り直す（simulationResult/courseInfo の参照churn無視）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceSignature]);

  // 共有リソースの寿命 = コンポーネント生存期間。unmount時にだけ dispose する。
  // （レース切替では作り直さない＝切替時の再コンパイル/一時停止と dispose漏れリスクを避ける）
  useEffect(() => {
    return () => {
      if (horseResourcesRef.current) {
        horseResourcesRef.current.dispose();
        horseResourcesRef.current = null;
      }
      horseVisualsRef.current.clear();
      labelPoolRef.current = [];
    };
  }, []);
  
  // 選択馬の変更を Broadcast Cel の選択リングへ同期（頭上ラベルは次フレームで自動反映）
  useEffect(() => {
    horseVisualsRef.current.forEach((v, hn) => v.setSelected(hn === selectedHorse));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHorse]);

  // カメラモード切替時の初期化（アニメーションループとは分離）
  useEffect(() => {
    if (cameraMode === 'overview' && cameraRef.current) {
      cameraRef.current.position.copy(OVERVIEW_POSITION);
      cameraRef.current.fov = OVERVIEW_FOV;
      cameraRef.current.updateProjectionMatrix();
      cameraRef.current.lookAt(OVERVIEW_LOOKAT);
      if (controlsRef.current) {
        controlsRef.current.target.copy(OVERVIEW_LOOKAT);
        controlsRef.current.update();
      }
    }
    if (cameraMode !== 'broadcast') {
      broadcastInitRef.current = false; // broadcast へ戻ったとき最初のフレームで即セット
    }
  }, [cameraMode]);
  
  // トラッキング行を 3D と同じ補間済み状態から組み立てる（100〜200ms throttle 前提）。
  // dynamics があるときは raceProgress/rank を正本にし、無ければ timeline の走破距離から算出する。
  const syncTrackingRows = (tl: RaceTimeline, time: number) => {
    const dynamics = dynamicsRef.current;
    const layout = layoutRef.current;
    const raceDistance =
      layout?.raceDistance ??
      (Number.isFinite(tl.courseDistance) ? tl.courseDistance : 0) ??
      0;
    const wakuOf = (hn: number) => horseMetaRef.current.get(hn)?.waku;
    const nameOf = (hn: number) => horseNameRef.current.get(hn);

    if (dynamics && raceDistance > 0) {
      const dur = tl.totalDuration > 0 ? tl.totalDuration : 1;
      const dynTime = (time / dur) * dynamics.totalTime;
      const frame = interpolateDynamicsForDisplay(dynamics, dynTime, forecastLayoutsRef.current);
      const inputs = trackingInputsFromDynamics(frame, raceDistance, nameOf);
      setTrackingRows(buildTrackingRows(inputs, { wakuOf, raceDistance }));
      return;
    }

    const state = interpolateTimeline(tl, time);
    if (!state) {
      setTrackingRows([]);
      return;
    }
    setTrackingRows(
      buildTrackingRows(
        state.horses.map((h) => ({
          horseNumber: h.horseNumber,
          position: h.position,
          horseName: h.horseName ?? nameOf(h.horseNumber),
          currentDistance: h.currentDistance,
          distanceFromLeader: h.distanceFromLeader,
        })),
        { wakuOf, raceDistance },
      ),
    );
  };

  // アニメーションループ（scene生成後に1本のみ。再生stateは ref 経由で読む）
  // timeline が未設定でも scene/コースは render する（黒画面防止）。
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;
    
    // このループが属するシーン世代。init が作り直すと世代が変わり、旧ループは停止する。
    const myGeneration = sceneGenerationRef.current;
    
    const animate = () => {
      // 旧世代（レース切替でシーン再構築済み）のループは即停止し再スケジュールしない
      if (sceneGenerationRef.current !== myGeneration) return;
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
      
      const now = performance.now();
      const deltaTime = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      
      // timeline があるフレームのみ、時間更新・馬位置・中継カメラを進める
      if (timeline) {
        const duration = Number.isFinite(timeline.totalDuration) ? timeline.totalDuration : 0;
        // 再生中の時間更新（ref使用、毎フレーム）
        // ※ timeline が不正（validate失敗）な場合は再生を進めない＝初期位置のみ表示
        if (isPlayingRef.current && timelineValidRef.current && duration > 0) {
          const next = currentTimeRef.current + deltaTime * playbackSpeedRef.current;
          if (next >= duration) {
            currentTimeRef.current = duration;
            setIsPlaying(false);
            setCurrentTime(duration); // 最終フレームでUI更新
            syncTrackingRows(timeline, duration);
          } else {
            currentTimeRef.current = next;
            
            // UI更新は100msごと（60fps → 10fps）。トラッキングも同じ周期で 3D と同じフレームを参照。
            if (now - lastUIUpdateRef.current >= 100) {
              setCurrentTime(currentTimeRef.current);
              syncTrackingRows(timeline, currentTimeRef.current);
              lastUIUpdateRef.current = now;
            }
          }
        }
        
        // 現在状態を補間（refから取得）
        const currentState = interpolateTimeline(timeline, currentTimeRef.current);
        
        if (currentState) {
          const layout = layoutRef.current;
          const dynamics = dynamicsRef.current;
          // 馬の位置更新（優先: 新geometry+dynamics / 次: 新geometry+既存distance / 最後: 旧描画）
          if (layout) {
            const dur = timeline.totalDuration > 0 ? timeline.totalDuration : 1;
            if (dynamics) {
              const dynTime = (currentTimeRef.current / dur) * dynamics.totalTime;
              const frame = interpolateDynamicsForDisplay(dynamics, dynTime, forecastLayoutsRef.current);
              positionHorsesOnGeometry(
                layout,
                frame.map((h) => ({
                  horseNumber: h.horseNumber,
                  progressMeters: h.raceProgress,
                  lateral: h.lateralPosition,
                  blocked: h.blocked,
                  finished: h.finished,
                }))
              );
            } else {
              positionHorsesOnGeometry(
                layout,
                currentState.horses.map((h) => ({
                  horseNumber: h.horseNumber,
                  progressMeters: h.currentDistance,
                  lateral: h.lateralPosition,
                }))
              );
            }
          } else {
            updateHorses(currentState);
          }
          
          // カメラ更新（モードは ref 経由）
          const mode = cameraModeRef.current;
          if (mode === 'broadcast') {
            updateBroadcastCamera(currentState);
          } else if (mode === 'follow' && selectedHorseRef.current !== null) {
            updateFollowCamera(currentState);
          }

          // Broadcast Cel: gait アニメ（再生中のみ進む＝停止時は脚を止める）+ 頭上ラベル
          if (horseVisualsRef.current.size > 0) {
            const playing = isPlayingRef.current && timelineValidRef.current;
            if (playing) gaitTimeRef.current += deltaTime * playbackSpeedRef.current;
            driveHorseGait(currentState, playing, deltaTime);
            updateHorseLabels(currentState);
          } else {
            hideAllLabels();
          }
        }
      }
      
      // コントロール更新（overview のみユーザー操作を許可）
      if (controlsRef.current) {
        controlsRef.current.enabled = cameraModeRef.current === 'overview';
        if (cameraModeRef.current === 'overview') {
          controlsRef.current.update();
        }
      }
      
      // レンダリング（timeline の有無に関わらず毎フレーム実行）
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    lastTimeRef.current = performance.now();
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
    // 再生state(currentTime/isPlaying/playbackSpeed/cameraMode/selectedHorse)は ref 経由で読むため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline]);
  
  // コース作成（Visual Step 1C-1: 曲線走路）
  const createCourse = (scene: THREE.Scene, courseDistance: number, courseInfo: any) => {
    // visualCurve が構築されていない場合は何も描画しない（クライアント全体を落とさない）
    if (!visualCurveRef.current) {
      console.warn('[createCourse] visualCurve 未構築のためコース描画をスキップ');
      return;
    }
    
    const curve = visualCurveRef.current;
    const halfWidth = curve.trackWidth / 2;
    
    // ループを等間隔でサンプリング（200分割 ≈ 8m間隔で約1600m loop）
    const segments = 200;
    const innerPoints: THREE.Vector3[] = [];
    const outerPoints: THREE.Vector3[] = [];
    
    for (let i = 0; i <= segments; i++) {
      const loopDist = (i / segments) * curve.loopLength;
      const pose = sampleLoopPose(curve, loopDist);
      
      // 内外端: normal 方向へ ±halfWidth（normal は外向き）
      const inner = pose.position.clone().addScaledVector(pose.normal, -halfWidth);
      const outer = pose.position.clone().addScaledVector(pose.normal, halfWidth);
      innerPoints.push(inner);
      outerPoints.push(outer);
    }
    
    // 走路 ribbon mesh（内外端を結ぶ閉じた帯）
    // 頂点配列: [inner0, outer0, inner1, outer1, ...]
    const positions: number[] = [];
    for (let i = 0; i <= segments; i++) {
      positions.push(innerPoints[i].x, innerPoints[i].y, innerPoints[i].z);
      positions.push(outerPoints[i].x, outerPoints[i].y, outerPoints[i].z);
    }
    
    // index 構築: quad を2三角形に分割（CCW頂点順で法線を +Y に）
    const indices: number[] = [];
    for (let i = 0; i < segments; i++) {
      const base = i * 2;
      // tri1: inner[i], inner[i+1], outer[i]
      indices.push(base, base + 2, base + 1);
      // tri2: outer[i], inner[i+1], outer[i+1]
      indices.push(base + 1, base + 2, base + 3);
    }
    
    const trackGeometry = new THREE.BufferGeometry();
    trackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    trackGeometry.setIndex(indices);
    trackGeometry.computeVertexNormals(); // 法線は +Y 向き（頂点順序で保証）
    
    const trackMaterial = new THREE.MeshStandardMaterial({
      color: 0x228B22, // 緑（芝）
      side: THREE.FrontSide, // 法線が上向きなので FrontSide で十分
    });
    const track = new THREE.Mesh(trackGeometry, trackMaterial);
    track.position.y = -0.1; // 地面よりわずかに下
    scene.add(track);
    courseGeometryRef.current.track = track;
    
    // 内柵（閉じた線）
    const railMaterial = new THREE.LineBasicMaterial({ color: 0x8B4513, linewidth: 2 });
    const innerRailGeometry = new THREE.BufferGeometry().setFromPoints(innerPoints);
    const innerRail = new THREE.Line(innerRailGeometry, railMaterial);
    scene.add(innerRail);
    courseGeometryRef.current.innerRail = innerRail;
    
    // 外柵（閉じた線）
    const outerRailGeometry = new THREE.BufferGeometry().setFromPoints(outerPoints);
    const outerRail = new THREE.Line(outerRailGeometry, railMaterial);
    scene.add(outerRail);
    courseGeometryRef.current.outerRail = outerRail;
    
    // スタート/ゴールラインは今回省略（Visual Step 1C-3 でレース区間マーカーとして追加）
    courseGeometryRef.current.startLine = undefined;
    courseGeometryRef.current.goalLine = undefined;
  };
  
  // 馬作成（Broadcast Cel / legacy を feature flag で分岐）
  const createHorses = (scene: THREE.Scene, initialFrame: RaceTimelineKeyframe) => {
    if (horseModeRef.current === 'cel' && horseResourcesRef.current) {
      try {
        createBroadcastCelHorses(scene, initialFrame);
        return;
      } catch (e) {
        // 新ビジュアルの生成で例外 → このレースは legacy へ fallback（warning で分かるように）
        console.warn('[3DSimulator] Broadcast Cel 馬生成で例外 → legacy 馬へ fallback:', e);
        // 途中まで作った cel visual を撤去
        horseVisualsRef.current.forEach((v) => { scene.remove(v.root); v.dispose(); });
        horseVisualsRef.current.clear();
        horseMeshesRef.current.clear();
        horseModeRef.current = 'legacy';
      }
    }
    createLegacyHorses(scene, initialFrame);
  };

  // Broadcast Cel 馬（共有リソースを使用。root は本番ロジックが position/heading を設定する）
  const createBroadcastCelHorses = (scene: THREE.Scene, initialFrame: RaceTimelineKeyframe) => {
    const res = horseResourcesRef.current!;
    const total = initialFrame.horses.length;
    for (const horse of initialFrame.horses) {
      const meta = horseMetaRef.current.get(horse.horseNumber);
      const waku = meta?.waku ?? jraWakuOf(horse.horseNumber, total);
      const visual = createBroadcastCelHorseVisual(res, {
        horseNumber: horse.horseNumber,
        waku,
        coatName: meta?.coatName ?? null,
        selected: horse.horseNumber === selectedHorseRef.current,
      });
      // 見た目のみ拡大（位置・laneOffset・heading には影響しない。旧カプセルと同じ倍率）
      visual.root.scale.setScalar(HORSE_VISUAL_SCALE);
      scene.add(visual.root);
      horseVisualsRef.current.set(horse.horseNumber, visual);
      horseMeshesRef.current.set(horse.horseNumber, visual.root);
    }
  };

  // 旧馬（fallback 用: 単一カプセル + 常時スプライトラベル）
  const createLegacyHorses = (scene: THREE.Scene, initialFrame: RaceTimelineKeyframe) => {
    const wakuColors = [
      0xFFFFFF, // 1枠 白
      0x000000, // 2枠 黒
      0xFF0000, // 3枠 赤
      0x0000FF, // 4枠 青
      0xFFFF00, // 5枠 黄
      0x00FF00, // 6枠 緑
      0xFFA500, // 7枠 橙
      0xFF69B4, // 8枠 桃
    ];
    
    for (const horse of initialFrame.horses) {
      const group = new THREE.Group();
      
      // 馬体（カプセル状）
      const bodyGeometry = new THREE.CapsuleGeometry(0.6, 2.5, 8, 16);
      const bodyColor = wakuColors[(horse.horseNumber - 1) % wakuColors.length];
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: bodyColor });
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
      body.rotation.x = Math.PI / 2;
      group.add(body);
      
      // 馬番ラベル
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = 128;
        canvas.height = 128;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 128, 128);
        context.fillStyle = '#000000';
        context.font = 'bold 80px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(horse.horseNumber.toString(), 64, 64);
      }
      
      const labelTexture = new THREE.CanvasTexture(canvas);
      const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture });
      const label = new THREE.Sprite(labelMaterial);
      label.scale.set(3, 3, 1);
      label.position.set(0, 4, 0);
      group.add(label);
      
      // Visual Step 1C-3A: 見た目のみ拡大（位置・laneOffset には影響しない）
      group.scale.setScalar(HORSE_VISUAL_SCALE);
      
      scene.add(group);
      horseMeshesRef.current.set(horse.horseNumber, group);
    }
  };
  
  // 馬の位置更新
  const updateHorses = (currentState: RaceTimelineKeyframe) => {
    // デバッグ: 1秒に1回だけ更新
    const now = performance.now();
    if (now - lastDebugAtRef.current >= 1000) {
      lastDebugAtRef.current = now;
      
      const horse1 = currentState.horses.find(h => h.horseNumber === 1);
      const mesh1 = horse1 ? horseMeshesRef.current.get(horse1.horseNumber) : null;
      
      if (horse1 && visualCurveRef.current) {
        // Visual Step 1B: 新しい sampleRacePose を使用
        const pose = sampleRacePose(visualCurveRef.current, horse1.currentDistance, horse1.lateralPosition);
        const distanceDelta = previousDistanceRef.current !== null 
          ? horse1.currentDistance - previousDistanceRef.current 
          : null;
        
        // 画面内HUDに表示
        setDebugInfo({
          time: currentTimeRef.current.toFixed(1) + 's',
          frameTime: currentState.time.toFixed(1) + 's',
          phase: currentState.phase,
          currentDistance: horse1.currentDistance.toFixed(1) + 'm',
          distanceDelta: distanceDelta !== null ? '+' + distanceDelta.toFixed(1) + 'm' : 'N/A',
          velocity: horse1.currentVelocity.toFixed(1) + 'm/s',
          position: horse1.position,
          poseXYZ: `(${pose.position.x.toFixed(1)}, ${pose.position.y.toFixed(1)}, ${pose.position.z.toFixed(1)})`,
          heading: pose.heading.toFixed(3) + 'rad',
          meshXYZ: mesh1 ? `(${mesh1.position.x.toFixed(1)}, ${mesh1.position.y.toFixed(1)}, ${mesh1.position.z.toFixed(1)})` : 'NO MESH',
          curveLoop: visualCurveRef.current.loopLength.toFixed(1) + 'm',
          curveStart: visualCurveRef.current.startOffset.toFixed(1) + 'm',
          clockwise: visualCurveRef.current.clockwise ? 'CW' : 'CCW',
          courseInfo: courseInfo ? 'LOADED' : 'NULL',
          meshCount: horseMeshesRef.current.size,
        });
        
        previousDistanceRef.current = horse1.currentDistance;
      } else if (horse1) {
        // curve が未構築の場合
        setDebugInfo({ 
          error: 'visualCurve not built',
          currentDistance: horse1.currentDistance.toFixed(1) + 'm',
        });
      } else {
        setDebugInfo({ error: 'horse1 not found' });
      }
    }
    
    // Visual Step 1B: 全馬を新しい周回曲線上へ配置
    if (!visualCurveRef.current) {
      // curve 未構築時は馬を更新しない（初期位置のまま）
      if (!debugInitializedRef.current) {
        console.warn('[updateHorses] visualCurve が未構築のため馬位置を更新しません');
        debugInitializedRef.current = true;
      }
      return;
    }
    
    const curve = visualCurveRef.current;
    
    for (const horse of currentState.horses) {
      const mesh = horseMeshesRef.current.get(horse.horseNumber);
      if (!mesh) continue;

      // Visual Step 1B: sampleRacePose で3D座標を取得
      // lateralPosition の符号は既存と同じ（正=外側）なので変換不要
      try {
        const pose = sampleRacePose(curve, horse.currentDistance, horse.lateralPosition);
        
        // NaN チェック（sampleRacePose は clamp/throw するが念のため）
        if (!Number.isFinite(pose.position.x) || !Number.isFinite(pose.position.z) || !Number.isFinite(pose.heading)) {
          // 大量ログ回避: 馬ごと・フレームごとではなく最初の1回だけ警告
          if (horse.horseNumber === 1) {
            console.error('[updateHorses] 不正な座標:', {
              horseNumber: horse.horseNumber,
              currentDistance: horse.currentDistance,
              pose,
            });
          }
          continue; // この馬はスキップ（前フレームの位置のまま）
        }
        
        // 位置: 走路面から最小限の高さ（馬体が埋まらない程度）
        // elevation=0 なので pose.position.y=0、+1.0 で馬体の底面が地面付近
        mesh.position.set(pose.position.x, pose.position.y + 1.0, pose.position.z);
        
        // 向き: heading を使用（カプセルの長軸=Z軸なので rotation.y でOK）
        mesh.rotation.y = pose.heading;
        
        // 状態による色変更（既存ロジック維持 / cel は per-instance マーカー）
        const cv = horseVisualsRef.current.get(horse.horseNumber);
        if (cv) {
          cv.setBlocked(!!horse.blocked);
        } else {
          const body = mesh.children[0] as THREE.Mesh;
          if (body && body.material instanceof THREE.MeshStandardMaterial) {
            if (horse.blocked) {
              body.material.emissive.setHex(0xFF0000); // ブロック: 赤
            } else if (horse.accelerationStarted) {
              body.material.emissive.setHex(0x00FF00); // 加速: 緑
            } else {
              body.material.emissive.setHex(0x000000); // 通常
            }
          }
        }
      } catch (e) {
        // sampleRacePose が RangeError を投げた場合（NaN など）
        if (horse.horseNumber === 1) {
          console.error('[updateHorses] sampleRacePose エラー:', e, {
            horseNumber: horse.horseNumber,
            currentDistance: horse.currentDistance,
          });
        }
        continue;
      }
    }
  };
  
  // Phase B: 新geometry上へ馬を配置（progress は dynamics.raceProgress or 既存 currentDistance）
  const positionHorsesOnGeometry = (
    layout: RacecourseLayout,
    horses: Array<{ horseNumber: number; progressMeters: number; lateral: number; blocked?: boolean; finished?: boolean }>
  ) => {
    const geometry = layout.geometry;
    const startPathDistance = layout.startMarker.pathDistance;
    for (const h of horses) {
      const mesh = horseMeshesRef.current.get(h.horseNumber);
      if (!mesh) continue;
      try {
        const pose = sampleRaceProgressPose(geometry, startPathDistance, h.progressMeters, h.lateral);
        if (
          !Number.isFinite(pose.position.x) ||
          !Number.isFinite(pose.position.z) ||
          !Number.isFinite(pose.heading)
        ) {
          continue;
        }
        mesh.position.set(pose.position.x, pose.position.y + 1.0, pose.position.z);
        mesh.rotation.y = pose.heading;
        const cv = horseVisualsRef.current.get(h.horseNumber);
        if (cv) {
          // Broadcast Cel: 状態フィードバックは共有 material を汚さず per-instance マーカーで
          cv.setBlocked(!!h.blocked);
        } else {
          const body = mesh.children[0] as THREE.Mesh;
          if (body && body.material instanceof THREE.MeshStandardMaterial) {
            body.material.emissive.setHex(h.blocked ? 0x552200 : 0x000000);
          }
        }
      } catch {
        continue;
      }
    }
  };

  // Broadcast Cel: gait アニメを本番速度へ接続（root position/heading は変更しない）
  const driveHorseGait = (
    currentState: RaceTimelineKeyframe,
    playing: boolean,
    deltaTime: number,
  ) => {
    const gt = gaitTimeRef.current;
    for (const h of currentState.horses) {
      const v = horseVisualsRef.current.get(h.horseNumber);
      if (!v) continue;
      // 速度で周期・振幅を変える。停止（再生していない）時は 0＝脚を止める。
      const speedFactor = playing ? Math.max(0, Math.min(1, (h.currentVelocity ?? 0) / 17)) : 0;
      // コーナー傾き: heading 角速度から（root.rotation.y は positioning が設定済みの値を読むだけ）
      const cur = v.root.rotation.y;
      const prev = prevHeadingRef.current.get(h.horseNumber);
      let lean = 0;
      if (prev !== undefined && deltaTime > 1e-4) {
        let dh = cur - prev;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        const angVel = dh / deltaTime;
        lean = Math.max(-0.3, Math.min(0.3, -angVel * 0.35)) * speedFactor;
      }
      prevHeadingRef.current.set(h.horseNumber, cur);
      v.update(gt, speedFactor, lean);
    }
  };

  // Broadcast Cel: 頭上ラベル（新仕様: 選択馬 / hover 馬 / 先頭馬のみ・馬の真上に固定）
  // 全頭の識別は画面端のトラッキングパネルが保証する。?labels=all で全頭表示（デバッグ）。
  const updateHorseLabels = (currentState: RaceTimelineKeyframe) => {
    const layer = labelLayerRef.current;
    const cam = cameraRef.current;
    const renderer = rendererRef.current;
    if (!layer || !cam || !renderer) return;
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    if (w === 0 || h === 0) return;

    let leader: number | null = null;
    for (const hh of currentState.horses) { if (hh.position === 1) { leader = hh.horseNumber; break; } }
    const selected = selectedHorseRef.current;
    const hover = hoverHorseRef.current;
    const showAll = labelsModeRef.current === 'all';

    const inputs: LabelInput[] = [];
    for (const hh of currentState.horses) {
      const v = horseVisualsRef.current.get(hh.horseNumber);
      if (!v) continue;
      // 新仕様: 選択/hover/先頭のみ（デバッグ時のみ全頭）
      if (!showAll && !shouldLabelHorse({
        horseNumber: hh.horseNumber, selectedHorse: selected, hoverHorse: hover, leaderHorse: leader,
      })) continue;
      const meta = horseMetaRef.current.get(hh.horseNumber);
      const waku = meta?.waku ?? jraWakuOf(hh.horseNumber, currentState.horses.length);
      const anchorY = v.root.position.y + 2.9 * HORSE_VISUAL_SCALE;
      const pr = buildLabelPriority({ horseNumber: hh.horseNumber, selectedHorse: selected, hoverHorse: hover, leaderHorse: leader });
      inputs.push({
        id: hh.horseNumber,
        wx: v.root.position.x, wy: anchorY, wz: v.root.position.z,
        text: String(hh.horseNumber),
        color: wakuCssColor(waku),
        textColor: wakuTextColor(((waku - 1) % 8) + 1),
        priority: pr.priority, forceShow: pr.forceShow,
      });
    }

    const tmp = new THREE.Vector3();
    const projector = {
      project: (x: number, y: number, z: number) => {
        const p = tmp.set(x, y, z).project(cam);
        return { x: p.x, y: p.y, z: p.z };
      },
    };
    const outs = labelMgrRef.current.layout(inputs, projector, {
      width: w, height: h, now: performance.now(),
      hysteresis: true,
    });
    renderLabelDom(layer, outs);
  };

  const renderLabelDom = (layer: HTMLDivElement, outs: LabelOut[]) => {
    const pool = labelPoolRef.current;
    while (pool.length < outs.length) {
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'absolute', transform: 'translate(-50%,-50%)', pointerEvents: 'none',
        fontWeight: '700', fontSize: '13px', lineHeight: '18px', textAlign: 'center',
        minWidth: '20px', padding: '1px 6px', borderRadius: '6px',
        fontVariantNumeric: 'tabular-nums', boxShadow: '0 1px 3px rgba(0,0,0,0.45)', whiteSpace: 'nowrap',
      } as Partial<CSSStyleDeclaration>);
      layer.appendChild(el); pool.push(el);
    }
    for (let i = 0; i < pool.length; i++) {
      const el = pool[i]; const o = outs[i];
      if (!o || !o.visible) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      el.style.left = `${o.x}px`; el.style.top = `${o.y}px`;
      el.style.background = o.color; el.style.color = o.textColor;
      el.style.border = o.emphasized ? '2px solid #ffffff' : '1px solid rgba(0,0,0,0.35)';
      el.style.outline = o.emphasized ? '2px solid #ff3b30' : 'none';
      el.style.zIndex = o.emphasized ? '30' : '20';
      el.textContent = o.text;
    }
  };

  const hideAllLabels = () => {
    for (const el of labelPoolRef.current) el.style.display = 'none';
  };

  // Visual Step 1C-3A: 馬群の framing を計算（純粋な読み取りのみ）
  // 1頭だけを追跡せず、全馬の中心距離・広がりから代表位置を求める。
  const computePackFraming = (currentState: RaceTimelineKeyframe) => {
    const curve = visualCurveRef.current;
    if (!curve) return null;
    const horses = currentState.horses;
    if (!horses || horses.length === 0) return null;

    let minD = Infinity, maxD = -Infinity, sumD = 0;
    let minL = Infinity, maxL = -Infinity, sumL = 0;
    let count = 0;
    for (const h of horses) {
      const d = h.currentDistance;
      const l = h.lateralPosition ?? 0;
      if (!Number.isFinite(d)) continue;
      minD = Math.min(minD, d); maxD = Math.max(maxD, d); sumD += d;
      minL = Math.min(minL, l); maxL = Math.max(maxL, l); sumL += l;
      count++;
    }
    if (count === 0) return null;

    const avgD = sumD / count;
    const avgL = sumL / count;
    const spread = maxD - minD;
    const laneSpread = maxL - minL;

    // 馬群中心の pose（laneOffset は平均値で中心線寄り）
    const pose = sampleRacePose(curve, avgD, avgL);
    if (
      !Number.isFinite(pose.position.x) || !Number.isFinite(pose.position.y) || !Number.isFinite(pose.position.z) ||
      !Number.isFinite(pose.tangent.x) || !Number.isFinite(pose.tangent.z) ||
      !Number.isFinite(pose.normal.x) || !Number.isFinite(pose.normal.z)
    ) {
      return null;
    }

    return {
      framing: {
        center: pose.position,
        tangent: pose.tangent,
        normal: pose.normal,
        spread,
        laneSpread,
      },
      avgDistance: avgD,
      progress: curve.raceDistance > 0 ? Math.min(1, Math.max(0, avgD / curve.raceDistance)) : 0,
    };
  };

  // カメラ pose を平滑適用（瞬間移動・急反転を避ける）
  const applyBroadcastPose = (
    camera: THREE.PerspectiveCamera,
    pose: { position: THREE.Vector3; lookAt: THREE.Vector3; fov: number },
    label: CameraMode
  ) => {
    if (
      !Number.isFinite(pose.position.x) || !Number.isFinite(pose.position.y) || !Number.isFinite(pose.position.z) ||
      !Number.isFinite(pose.lookAt.x) || !Number.isFinite(pose.lookAt.y) || !Number.isFinite(pose.lookAt.z) ||
      !Number.isFinite(pose.fov)
    ) {
      return;
    }
    if (broadcastModeRef.current !== label) {
      broadcastModeRef.current = label;
      setBroadcastModeLabel(label);
    }
    if (!broadcastInitRef.current) {
      camera.position.copy(pose.position);
      broadcastLookAtRef.current.copy(pose.lookAt);
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(broadcastLookAtRef.current);
      broadcastInitRef.current = true;
      return;
    }
    camera.position.lerp(pose.position, 0.06);
    broadcastLookAtRef.current.lerp(pose.lookAt, 0.06);
    const nextFov = camera.fov + (pose.fov - camera.fov) * 0.06;
    if (Math.abs(nextFov - camera.fov) > 1e-4) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(broadcastLookAtRef.current);
  };

  // 中継カメラ更新。layout がある場合は新geometry基準。
  // 通常は馬群追従、先頭がゴール接近したらゴール入線カメラへ滑らかに移行し、勝ち馬を保持する。
  const updateBroadcastCamera = (currentState: RaceTimelineKeyframe) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const aspect = camera.aspect && Number.isFinite(camera.aspect) ? camera.aspect : 16 / 9;
    const layout = layoutRef.current;
    const dynamics = dynamicsRef.current;

    if (layout) {
      const raceDistance = layout.raceDistance;
      const geometry = layout.geometry;
      const startPathDistance = layout.startMarker.pathDistance;
      const dur = timeline && timeline.totalDuration > 0 ? timeline.totalDuration : 1;

      let horses: Array<{
        horseNumber: number;
        progressMeters: number;
        lateral: number;
        finished?: boolean;
        finishTime?: number;
      }>;
      if (dynamics) {
        const dynTime = (currentTimeRef.current / dur) * dynamics.totalTime;
        horses = interpolateDynamicsForDisplay(dynamics, dynTime, forecastLayoutsRef.current).map((h) => ({
          horseNumber: h.horseNumber,
          progressMeters: h.raceProgress,
          lateral: h.lateralPosition,
          finished: h.finished,
          finishTime: h.finishTime,
        }));
      } else {
        horses = currentState.horses.map((h) => ({
          horseNumber: h.horseNumber,
          progressMeters: h.currentDistance,
          lateral: h.lateralPosition ?? 0,
        }));
      }

      let sum = 0, min = Infinity, max = -Infinity, lsum = 0, lmin = Infinity, lmax = -Infinity, c = 0;
      let leaderProgress = -1;
      let leaderHn: number | null = null;
      let leaderLat = 0;
      let leaderFinished = false;
      for (const h of horses) {
        if (!Number.isFinite(h.progressMeters)) continue;
        sum += h.progressMeters; min = Math.min(min, h.progressMeters); max = Math.max(max, h.progressMeters);
        const l = h.lateral ?? 0;
        lsum += l; lmin = Math.min(lmin, l); lmax = Math.max(lmax, l); c++;
        if (h.progressMeters > leaderProgress) {
          leaderProgress = h.progressMeters;
          leaderHn = h.horseNumber;
          leaderLat = l;
          leaderFinished = !!h.finished;
        }
      }
      if (c === 0) return;

      const avg = sum / c;
      const avgL = lsum / c;
      const spread = Math.max(0, max - min); // meters
      const laneSpread = lmax - lmin;
      const leaderProgress01 = raceDistance > 0 ? Math.min(1, Math.max(0, leaderProgress / raceDistance)) : 0;

      // 先頭入線時刻を記録（currentTimeRef 基準）
      if (leaderProgress01 < 0.94 && !leaderFinished) {
        leaderFinishTimeRef.current = null;
      }
      if (leaderFinished && leaderFinishTimeRef.current == null) {
        leaderFinishTimeRef.current = currentTimeRef.current;
      }
      const timeSinceFinish =
        leaderFinishTimeRef.current != null
          ? currentTimeRef.current - leaderFinishTimeRef.current
          : null;

      const gp = sampleRaceProgressPose(geometry, startPathDistance, raceDistance, 0);
      const goalPos = new THREE.Vector3(gp.position.x, gp.position.y, gp.position.z);
      const goalTan = new THREE.Vector3(gp.tangent.x, 0, gp.tangent.z).normalize();
      const standNormal = new THREE.Vector3(gp.normal.x, 0, gp.normal.z).normalize();

      const useFinish = shouldUseFinishCamera({
        leaderProgress01,
        leaderFinished,
        timeSinceLeaderFinish: timeSinceFinish,
      });

      if (useFinish && leaderHn != null) {
        const leaderPose = sampleRaceProgressPose(
          geometry,
          startPathDistance,
          Math.min(raceDistance, Math.max(0, leaderProgress)),
          leaderLat,
        );
        const leaderPos = new THREE.Vector3(
          leaderPose.position.x,
          leaderPose.position.y,
          leaderPose.position.z,
        );
        const pose = computeFinishApproachPose({
          goalPosition: goalPos,
          goalTangent: goalTan,
          standSideNormal: standNormal,
          leaderPosition: leaderPos,
          packSpread: Math.max(spread, laneSpread + 10),
        });
        applyBroadcastPose(camera, pose, 'FINISH');
        return;
      }

      // 通常: 馬群中心を追従（ゴール固定カメラにはしない）
      // horses.progress は dynamics/timeline とも 0..1 に正規化済み
      const packProgressM = Math.min(raceDistance, Math.max(0, avg)); // avg is meters
      const cp = sampleRaceProgressPose(geometry, startPathDistance, packProgressM, avgL);
      const center = new THREE.Vector3(cp.position.x, cp.position.y, cp.position.z);
      const tangent = new THREE.Vector3(cp.tangent.x, 0, cp.tangent.z).normalize();
      const normal = new THREE.Vector3(cp.normal.x, 0, cp.normal.z).normalize();
      const progress01 = raceDistance > 0 ? packProgressM / raceDistance : 0;
      const mode = selectCameraMode(currentState.phase, progress01);
      const pose = computeCameraPose(
        mode,
        {
          center,
          tangent,
          normal,
          spread: Math.max(spread, 18),
          laneSpread: Math.max(laneSpread, 6),
        },
        aspect,
      );
      applyBroadcastPose(camera, pose, mode);
      return;
    }

    // fallback: 旧 VisualCourseCurve ベースの framing
    const packed = computePackFraming(currentState);
    if (!packed) return;
    const mode = selectCameraMode(currentState.phase, packed.progress);
    const pose = computeCameraPose(mode, packed.framing, aspect);
    applyBroadcastPose(camera, pose, mode);
  };

  // 追従カメラ更新
  const updateFollowCamera = (currentState: RaceTimelineKeyframe) => {
    const horse = currentState.horses.find(h => h.horseNumber === selectedHorseRef.current);
    if (!horse || !cameraRef.current || !visualCurveRef.current) return;
    
    // Visual Step 1B: sampleRacePose で座標取得
    try {
      const pose = sampleRacePose(visualCurveRef.current, horse.currentDistance, horse.lateralPosition);
      
      if (!Number.isFinite(pose.position.x) || !Number.isFinite(pose.position.z)) {
        return; // 不正座標の場合はカメラ更新しない
      }
      
      // カメラを馬の後方・上方に配置
      // tangent は進行方向なので、その逆方向へオフセット
      const cameraOffset = new THREE.Vector3(-pose.tangent.x * 15, 10, -pose.tangent.z * 15);
      const targetPos = new THREE.Vector3(pose.position.x, pose.position.y + 2, pose.position.z);
      const cameraPos = targetPos.clone().add(cameraOffset);
      
      // 滑らかに移動
      cameraRef.current.position.lerp(cameraPos, 0.1);
      cameraRef.current.lookAt(targetPos);
    } catch (e) {
      // sampleRacePose エラー時はカメラ更新しない
      return;
    }
  };
  
  // timeline 未設定でも 3D コンテナは常時マウントする（黒画面防止: init effect が container を掴めるように）
  const currentState = timeline ? interpolateTimeline(timeline, currentTime) : null;
  const selectedHorseState = currentState?.horses.find(h => h.horseNumber === selectedHorse);
  
  // Fallback使用チェック
  const usingFallback = !courseInfo || !courseInfo.corners || courseInfo.corners.length === 0;
  
  return (
    <div className="space-y-4">
      {/* Fallback警告 */}
      {usingFallback && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded">
          ⚠️ <strong>プロトタイプ形状:</strong> コース情報が未登録のため、直線コースとして表示しています
        </div>
      )}
      
      {/*
        Simulator wrapper: 3D viewport（常に横長 16:9 / PC は既存比率）と tracking panel を分離。
        スマホでは tracking panel を viewport の外側・下に配置し、canvas の高さ計算に混ぜない。
      */}
      <div className="w-full">
      {/* 3Dビュー: timeline の有無に関わらず常時マウント（container 未マウントで init が bail するのを防ぐ） */}
      <div 
        ref={containerRef}
        className="relative w-full max-w-full aspect-video overflow-hidden rounded-lg border border-gray-300 bg-black md:aspect-auto md:h-[600px]"
        style={{ touchAction: 'none' }}
      >
        {/* Broadcast Cel: 頭上ラベル層（screen-space・pointer-events なし。canvas 操作を妨げない） */}
        <div ref={labelLayerRef} className="pointer-events-none absolute inset-0 z-30" />

        {/* PC: viewport 内側・右端の縦帯（absolute overlay）。viewport の高さには影響しない。 */}
        {timeline && trackingRows.length > 0 && (
          <RaceTrackingPanelDesktop
            rows={trackingRows}
            selectedHorse={selectedHorse}
            onSelect={setSelectedHorse}
          />
        )}

        {/* タイムライン生成待ちの読み込み表示（canvas は既にマウント済み） */}
        {!timeline && (
          <div className="absolute inset-0 z-40 flex items-center justify-center text-white/80 text-sm">
            タイムライン生成中...
          </div>
        )}

        {/* タイムライン生成失敗（不正timeline）: scene と初期馬位置は表示しつつ再生を止める */}
        {timeline && !timelineValid && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center p-3">
            <div className="pointer-events-auto rounded-md bg-red-600/90 px-4 py-2 text-center text-sm text-white shadow">
              <div className="font-bold">タイムライン生成に失敗しました</div>
              <div className="text-xs opacity-90">初期位置のみ表示しています（再生は無効）</div>
              {showDebugHud && timelineErrors.length > 0 && (
                <div className="mt-1 text-left text-[10px] font-mono opacity-80">
                  {timelineErrors.map((err, i) => (
                    <div key={i}>・{err}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* コンポーネント情報（左上）: 本番通常URLでは非表示 */}
        {showDebugHud && (
          <div className="absolute left-2 top-2 z-50 bg-red-600 px-2 py-1 text-xs text-white font-mono rounded">
            DEBUG: RaceSimulator3DProto a840cc3
            {broadcastModeLabel ? ` / CAM:${broadcastModeLabel}` : ''}
          </div>
        )}
        
        {/* CourseInfo 追跡（右上）: 本番通常URLでは非表示 */}
        {showDebugHud && (
          <div className="absolute right-2 top-2 z-50 bg-blue-600 px-2 py-1 text-xs text-white font-mono rounded">
            CourseInfo: {courseInfo ? 'LOADED ✓' : 'NULL ✗'}
          </div>
        )}
        
        {/* デバッグHUD（左下） */}
        {showDebugHud && debugInfo && (
          <div className="absolute bottom-2 left-2 z-50 bg-black/90 p-3 rounded text-xs text-green-400 font-mono whitespace-pre-wrap max-w-md">
            <div className="text-yellow-400 font-bold mb-1">DEBUG HUD (1s更新)</div>
            {Object.entries(debugInfo).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="text-gray-400 w-24">{key}:</span>
                <span className={
                  key === 'fallback' && value === 'YES' ? 'text-red-400 font-bold' :
                  key === 'distanceDelta' && value !== 'N/A' ? 'text-cyan-400 font-bold' :
                  ''
                }>{String(value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* スマホ: viewport の外側・下に続く横帯（通常フロー）。canvas の高さ計算には混ざらない。 */}
      {timeline && trackingRows.length > 0 && (
        <div className="mt-1.5 md:hidden">
          <RaceTrackingPanelMobile
            rows={trackingRows}
            selectedHorse={selectedHorse}
            onSelect={setSelectedHorse}
          />
        </div>
      )}
      </div>
      
      {timeline && (
      <>
      {/* コントロールパネル */}
      <div className="bg-white border border-gray-300 rounded-lg p-4 space-y-4">
        {/* 再生ボタン */}
        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={() => {
              if (!timelineValid) return; // 不正timelineでは再生させない
              const newState = !isPlaying;
              console.log('[DEBUG] 再生状態変更:', newState);
              setIsPlaying(newState);
            }}
            disabled={!timelineValid}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPlaying ? '⏸ 一時停止' : '▶ 再生'}
          </button>
          <button
            onClick={() => { 
              currentTimeRef.current = 0;
              setCurrentTime(0); 
              setIsPlaying(false);
              leaderFinishTimeRef.current = null;
              if (timeline) syncTrackingRows(timeline, 0);
            }}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            ⏮ 最初に戻る
          </button>
          
          {/* 速度 */}
          <div className="flex gap-1 items-center">
            <span className="text-sm mr-2">速度:</span>
            {[0.5, 1.0, 2.0].map(speed => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`px-3 py-1 rounded text-sm ${
                  playbackSpeed === speed
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
          
          {/* カメラ */}
          <div className="flex gap-1 items-center">
            <span className="text-sm mr-2">カメラ:</span>
            <button
              onClick={() => setCameraMode('broadcast')}
              className={`px-3 py-1 rounded text-sm ${
                cameraMode === 'broadcast'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              中継
            </button>
            <button
              onClick={() => setCameraMode('overview')}
              className={`px-3 py-1 rounded text-sm ${
                cameraMode === 'overview'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              俯瞰
            </button>
            <button
              onClick={() => setCameraMode('follow')}
              disabled={selectedHorse === null}
              className={`px-3 py-1 rounded text-sm ${
                cameraMode === 'follow'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 disabled:opacity-50'
              }`}
            >
              追従
            </button>
          </div>
          
          {/* デバッグ */}
          <button
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
          >
            {showDebugPanel ? 'デバッグ非表示' : 'デバッグ表示'}
          </button>
        </div>
        
        {/* タイムスライダー */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>時刻: {currentTime.toFixed(1)}秒</span>
            <span>Phase: {currentState?.phase || '-'}</span>
            <span>残り距離: {currentState ? (timeline.courseDistance - Math.max(...currentState.horses.map(h => h.currentDistance))).toFixed(0) : '-'}m</span>
          </div>
          <input
            type="range"
            min={0}
            max={timelineValid && Number.isFinite(timeline.totalDuration) ? timeline.totalDuration : 0}
            step={0.1}
            value={currentTime}
            disabled={!timelineValid}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              const newTime = Number.isFinite(parsed) ? parsed : 0;
              currentTimeRef.current = newTime;
              setCurrentTime(newTime);
              // seek 直後にトラッキングを該当時刻へ追従
              if (timeline) syncTrackingRows(timeline, newTime);
            }}
            className="w-full"
          />
        </div>
      </div>
      
      {/* 馬選択 */}
      <div className="bg-white border border-gray-300 rounded-lg p-4">
        <h4 className="font-bold mb-2">馬選択（追従カメラ用）</h4>
        <div className="flex gap-2 flex-wrap">
          {currentState?.horses.map(horse => (
            <button
              key={horse.horseNumber}
              onClick={() => setSelectedHorse(horse.horseNumber)}
              className={`px-3 py-1 rounded text-sm ${
                selectedHorse === horse.horseNumber
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              {horse.position}位 {horse.horseNumber} {horse.horseName}
            </button>
          ))}
        </div>
      </div>
      
      {/* デバッグパネル */}
      {showDebugPanel && selectedHorseState && (
        <div className="bg-white border border-gray-300 rounded-lg p-4">
          <h4 className="font-bold mb-2">デバッグ情報: {selectedHorseState.horseName} ({selectedHorseState.horseNumber}番)</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div><span className="font-medium">順位:</span> {selectedHorseState.position}</div>
            <div><span className="font-medium">距離:</span> {selectedHorseState.currentDistance.toFixed(1)}m</div>
            <div><span className="font-medium">速度:</span> {selectedHorseState.currentVelocity.toFixed(1)}m/s</div>
            <div><span className="font-medium">横位置:</span> {selectedHorseState.lateralPosition.toFixed(1)}m</div>
            <div><span className="font-medium">スタミナ:</span> {selectedHorseState.staminaRemaining.toFixed(0)}%</div>
            <div><span className="font-medium">先頭差:</span> {selectedHorseState.distanceFromLeader.toFixed(1)}m</div>
            <div><span className="font-medium">ブロック:</span> {selectedHorseState.blocked ? 'あり' : 'なし'}</div>
            <div><span className="font-medium">加速:</span> {selectedHorseState.accelerationStarted ? 'あり' : 'なし'}</div>
          </div>
          {currentState?.eventReason && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
              <span className="font-medium">イベント:</span> {currentState.eventReason}
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
