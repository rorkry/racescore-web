'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { generateTimeline, interpolateTimeline, type RaceTimeline, type RaceTimelineKeyframe } from '@/lib/race-simulator/timeline-generator';
import { buildVisualCourseCurve, sampleLoopPose, sampleRacePose, type VisualCourseCurve } from '@/lib/race-simulator/course-curve';
import { selectCameraMode, computeCameraPose, computeGoalStandPose, DEFAULT_GOAL_STAND_CONFIG, type CameraMode } from '@/lib/race-simulator/camera-director';
import { shouldShowDebugHud } from '@/lib/race-simulator/hud-visibility';
import {
  resolveRacecourseLayout,
  runRaceDynamicsForRace,
  interpolateDynamics,
  type RacecourseLayout,
} from '@/lib/race-simulator/race-3d-integration';
import { sampleRaceProgressPose, GEOMETRIES_BY_VENUE } from '@/lib/racecourse-geometry';
import { buildTrackGroup, buildStartFinishGroup, type TrackRenderResult } from '@/lib/race-simulator/track-render';
import type { RaceDynamicsResult } from '@/lib/race-dynamics';

interface RaceSimulator3DProtoProps {
  simulationResult: any;
  courseInfo: any;
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
  const animationFrameRef = useRef<number | null>(null);
  const horseMeshesRef = useRef<Map<number, THREE.Group>>(new Map());
  const courseGeometryRef = useRef<{
    track?: THREE.Mesh;
    innerRail?: THREE.Line;
    outerRail?: THREE.Line;
    startLine?: THREE.Line;
    goalLine?: THREE.Line;
  }>({});
  
  const [timeline, setTimeline] = useState<RaceTimeline | null>(null);
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
  isPlayingRef.current = isPlaying;
  playbackSpeedRef.current = playbackSpeed;
  cameraModeRef.current = cameraMode;
  selectedHorseRef.current = selectedHorse;
  
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
    setTimeline(tl);
    
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
    
    // カメラ
    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      10000
    );
    camera.position.set(0, 200, -300);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    
    // レンダラー
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 上限設定
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // コントロール
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;
    
    // ライト
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
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
    console.log('[3DSimulator] layout/dynamics:', {
      layout: layout ? layout.routeId : 'null(旧描画へfallback)',
      dynamics: dynamics ? `${dynamics.frames.length}frames/${dynamics.totalTime}s` : 'null',
      startMarkerFallback: layout?.startMarkerIsFallback,
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
    
    // 馬作成
    createHorses(scene, tl.keyframes[0]);
    
    console.log('[3DSimulator] Three.js初期化完了');
    
    // クリーンアップ
    return () => {
      console.log('[3DSimulator] リソースクリーンアップ中...');
      
      // このシーンを無効化（旧世代の animate ループが触れないように）
      sceneGenerationRef.current++;
      
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
      horseMeshesRef.current.clear();
      
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
      rendererRef.current = null;
      controlsRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      broadcastInitRef.current = false;
    };
    // raceSignature が変わったときだけ作り直す（simulationResult/courseInfo の参照churn無視）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceSignature]);
  
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
  
  // アニメーションループ（raceSignature/timeline 単位で1本のみ。再生stateは ref 経由で読む）
  useEffect(() => {
    if (!timeline || !sceneRef.current || !cameraRef.current || !rendererRef.current) return;
    
    // このループが属するシーン世代。init が作り直すと世代が変わり、旧ループは停止する。
    const myGeneration = sceneGenerationRef.current;
    
    const animate = () => {
      // 旧世代（レース切替でシーン再構築済み）のループは即停止し再スケジュールしない
      if (sceneGenerationRef.current !== myGeneration) return;
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
      
      const now = performance.now();
      const deltaTime = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      
      // 再生中の時間更新（ref使用、毎フレーム）
      if (isPlayingRef.current) {
        const next = currentTimeRef.current + deltaTime * playbackSpeedRef.current;
        if (next >= timeline.totalDuration) {
          currentTimeRef.current = timeline.totalDuration;
          setIsPlaying(false);
          setCurrentTime(timeline.totalDuration); // 最終フレームでUI更新
        } else {
          currentTimeRef.current = next;
          
          // UI更新は100msごと（60fps → 10fps）
          if (now - lastUIUpdateRef.current >= 100) {
            setCurrentTime(currentTimeRef.current);
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
            const frame = interpolateDynamics(dynamics, dynTime);
            positionHorsesOnGeometry(
              layout,
              frame.map((h) => ({
                horseNumber: h.horseNumber,
                progress: h.raceProgress,
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
                progress: h.currentDistance,
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
      }
      
      // コントロール更新（overview のみユーザー操作を許可）
      if (controlsRef.current) {
        controlsRef.current.enabled = cameraModeRef.current === 'overview';
        if (cameraModeRef.current === 'overview') {
          controlsRef.current.update();
        }
      }
      
      // レンダリング
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
  
  // 馬作成
  const createHorses = (scene: THREE.Scene, initialFrame: RaceTimelineKeyframe) => {
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
        
        // 状態による色変更（既存ロジック維持）
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
    horses: Array<{ horseNumber: number; progress: number; lateral: number; blocked?: boolean; finished?: boolean }>
  ) => {
    const geometry = layout.geometry;
    const startPathDistance = layout.startMarker.pathDistance;
    for (const h of horses) {
      const mesh = horseMeshesRef.current.get(h.horseNumber);
      if (!mesh) continue;
      try {
        const pose = sampleRaceProgressPose(geometry, startPathDistance, h.progress, h.lateral);
        if (
          !Number.isFinite(pose.position.x) ||
          !Number.isFinite(pose.position.z) ||
          !Number.isFinite(pose.heading)
        ) {
          continue;
        }
        mesh.position.set(pose.position.x, pose.position.y + 1.0, pose.position.z);
        mesh.rotation.y = pose.heading;
        const body = mesh.children[0] as THREE.Mesh;
        if (body && body.material instanceof THREE.MeshStandardMaterial) {
          body.material.emissive.setHex(h.blocked ? 0x552200 : 0x000000);
        }
      } catch {
        continue;
      }
    }
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

  // 中継カメラ更新。layout がある場合は新geometry基準（最終直線はゴール前スタンド視点）。
  const updateBroadcastCamera = (currentState: RaceTimelineKeyframe) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const aspect = camera.aspect && Number.isFinite(camera.aspect) ? camera.aspect : 16 / 9;
    const layout = layoutRef.current;
    const dynamics = dynamicsRef.current;

    if (layout) {
      // pack（進行度・広がり）を dynamics または既存 distance から求める
      let horses: Array<{ progress: number; lateral: number }>;
      if (dynamics) {
        const dur = timeline && timeline.totalDuration > 0 ? timeline.totalDuration : 1;
        const dynTime = (currentTimeRef.current / dur) * dynamics.totalTime;
        horses = interpolateDynamics(dynamics, dynTime).map((h) => ({
          progress: h.raceProgress,
          lateral: h.lateralPosition,
        }));
      } else {
        horses = currentState.horses.map((h) => ({
          progress: h.currentDistance,
          lateral: h.lateralPosition ?? 0,
        }));
      }
      let sum = 0, min = Infinity, max = -Infinity, lsum = 0, lmin = Infinity, lmax = -Infinity, c = 0;
      for (const h of horses) {
        if (!Number.isFinite(h.progress)) continue;
        sum += h.progress; min = Math.min(min, h.progress); max = Math.max(max, h.progress);
        const l = h.lateral ?? 0;
        lsum += l; lmin = Math.min(lmin, l); lmax = Math.max(lmax, l); c++;
      }
      if (c > 0) {
        const avg = sum / c;
        const avgL = lsum / c;
        const spread = max - min;
        const laneSpread = lmax - lmin;
        const raceDistance = layout.raceDistance;
        const frac = raceDistance > 0 ? Math.min(1, Math.max(0, avg / raceDistance)) : 0;
        const geometry = layout.geometry;
        const startPathDistance = layout.startMarker.pathDistance;

        if (frac >= 0.68) {
          // 最終盤: ゴール前スタンド視点を通常基準にする
          const gp = sampleRaceProgressPose(geometry, startPathDistance, raceDistance, 0);
          const goalPos = new THREE.Vector3(gp.position.x, gp.position.y, gp.position.z);
          const goalTan = new THREE.Vector3(gp.tangent.x, 0, gp.tangent.z).normalize();
          const standNormal = new THREE.Vector3(gp.normal.x, 0, gp.normal.z).normalize();
          const cfg = {
            ...DEFAULT_GOAL_STAND_CONFIG,
            standDistance: Math.min(130, Math.max(45, spread * 0.8 + 45)),
          };
          const pose = computeGoalStandPose(goalPos, goalTan, standNormal, cfg);
          applyBroadcastPose(camera, pose, 'FINISH');
          return;
        }

        // 序盤〜コーナー: broadcast director（横追走）
        const cp = sampleRaceProgressPose(geometry, startPathDistance, avg, avgL);
        const framing = {
          center: new THREE.Vector3(cp.position.x, cp.position.y, cp.position.z),
          tangent: new THREE.Vector3(cp.tangent.x, 0, cp.tangent.z).normalize(),
          normal: new THREE.Vector3(cp.normal.x, 0, cp.normal.z).normalize(),
          spread,
          laneSpread,
        };
        const mode = selectCameraMode(undefined, frac);
        const pose = computeCameraPose(mode, framing, aspect);
        applyBroadcastPose(camera, pose, mode);
        return;
      }
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
  
  if (!timeline) {
    return <div>タイムライン生成中...</div>;
  }
  
  const currentState = interpolateTimeline(timeline, currentTime);
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
      
      {/* 3Dビュー */}
      <div 
        ref={containerRef}
        className="w-full h-[600px] border border-gray-300 rounded-lg overflow-hidden bg-black relative"
        style={{ touchAction: 'none' }}
      >
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
      
      {/* コントロールパネル */}
      <div className="bg-white border border-gray-300 rounded-lg p-4 space-y-4">
        {/* 再生ボタン */}
        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={() => {
              const newState = !isPlaying;
              console.log('[DEBUG] 再生状態変更:', newState);
              setIsPlaying(newState);
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            {isPlaying ? '⏸ 一時停止' : '▶ 再生'}
          </button>
          <button
            onClick={() => { 
              currentTimeRef.current = 0;
              setCurrentTime(0); 
              setIsPlaying(false); 
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
            max={timeline.totalDuration}
            step={0.1}
            value={currentTime}
            onChange={(e) => {
              const newTime = parseFloat(e.target.value);
              currentTimeRef.current = newTime;
              setCurrentTime(newTime);
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
    </div>
  );
}
