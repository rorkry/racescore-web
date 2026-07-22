'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { generateTimeline, interpolateTimeline, type RaceTimeline, type RaceTimelineKeyframe } from '@/lib/race-simulator/timeline-generator';
import { getTrackPosition, getCourseBounds, getLastGeometrySource } from '@/lib/race-simulator/course-geometry';

interface RaceSimulator3DProtoProps {
  simulationResult: any;
  courseInfo: any;
}

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
  const [cameraMode, setCameraMode] = useState<'overview' | 'follow'>('overview');
  const [selectedHorse, setSelectedHorse] = useState<number | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(true);
  const lastTimeRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0); // 内部再生時刻（毎フレーム更新）
  const lastUIUpdateRef = useRef<number>(0); // 最後にUI更新した時刻
  const lastDebugAtRef = useRef<number>(0); // デバッグログ出力時刻
  const previousDistanceRef = useRef<number | null>(null); // 前回の距離
  const debugInitializedRef = useRef<boolean>(false); // 初回ログ出力済み
  
  // 画面内デバッグHUD用の状態
  const [debugInfo, setDebugInfo] = useState<any>(null);
  
  // CourseInfo追跡（初回のみ）
  useEffect(() => {
    console.warn('[COURSEINFO] RaceSimulator3DProto:', {
      courseInfo: courseInfo ? 'LOADED' : 'NULL',
      courseInfoKeys: courseInfo ? Object.keys(courseInfo) : [],
      courseInfoValue: courseInfo
    });
  }, [courseInfo]);
  
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
  
  // Three.js初期化
  useEffect(() => {
    if (!containerRef.current || !timeline) return;
    
    console.log('[3DSimulator] Three.js初期化中...');
    
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
    
    // コース作成
    createCourse(scene, timeline.courseDistance, courseInfo);
    
    // 馬作成
    createHorses(scene, timeline.keyframes[0]);
    
    console.log('[3DSimulator] Three.js初期化完了');
    
    // クリーンアップ
    return () => {
      console.log('[3DSimulator] リソースクリーンアップ中...');
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      
      if (rendererRef.current) {
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
      
      if (containerRef.current && rendererRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, [timeline, courseInfo]);
  
  // アニメーションループ
  useEffect(() => {
    if (!timeline || !sceneRef.current || !cameraRef.current || !rendererRef.current) return;
    
    const animate = () => {
      const now = performance.now();
      const deltaTime = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      
      // 再生中の時間更新（ref使用、毎フレーム）
      if (isPlaying) {
        const next = currentTimeRef.current + deltaTime * playbackSpeed;
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
        // 馬の位置更新
        updateHorses(currentState);
        
        // カメラ更新
        if (cameraMode === 'follow' && selectedHorse !== null) {
          updateFollowCamera(currentState);
        }
      }
      
      // コントロール更新（追従カメラ時は無効化）
      if (controlsRef.current) {
        controlsRef.current.enabled = cameraMode !== 'follow';
        if (cameraMode !== 'follow') {
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
      }
    };
  }, [timeline, currentTime, isPlaying, playbackSpeed, cameraMode, selectedHorse]);
  
  // コース作成
  const createCourse = (scene: THREE.Scene, courseDistance: number, courseInfo: any) => {
    const bounds = getCourseBounds(courseInfo);
    
    // 走路
    const trackGeometry = new THREE.PlaneGeometry(bounds.courseWidth, courseDistance);
    const trackMaterial = new THREE.MeshStandardMaterial({
      color: 0x228B22, // 緑（芝）
      side: THREE.DoubleSide,
    });
    const track = new THREE.Mesh(trackGeometry, trackMaterial);
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, -0.1, courseDistance / 2);
    scene.add(track);
    courseGeometryRef.current.track = track;
    
    // 内柵
    const innerRailGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(bounds.innerBound, 0, 0),
      new THREE.Vector3(bounds.innerBound, 0, courseDistance),
    ]);
    const railMaterial = new THREE.LineBasicMaterial({ color: 0x8B4513, linewidth: 3 });
    const innerRail = new THREE.Line(innerRailGeometry, railMaterial);
    scene.add(innerRail);
    courseGeometryRef.current.innerRail = innerRail;
    
    // 外柵
    const outerRailGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(bounds.outerBound, 0, 0),
      new THREE.Vector3(bounds.outerBound, 0, courseDistance),
    ]);
    const outerRail = new THREE.Line(outerRailGeometry, railMaterial);
    scene.add(outerRail);
    courseGeometryRef.current.outerRail = outerRail;
    
    // スタートライン
    const startLineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(bounds.innerBound, 0, 0),
      new THREE.Vector3(bounds.outerBound, 0, 0),
    ]);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xFFFFFF, linewidth: 2 });
    const startLine = new THREE.Line(startLineGeometry, lineMaterial);
    scene.add(startLine);
    courseGeometryRef.current.startLine = startLine;
    
    // ゴールライン
    const goalLineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(bounds.innerBound, 0, courseDistance),
      new THREE.Vector3(bounds.outerBound, 0, courseDistance),
    ]);
    const goalMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 4 });
    const goalLine = new THREE.Line(goalLineGeometry, goalMaterial);
    scene.add(goalLine);
    courseGeometryRef.current.goalLine = goalLine;
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
      
      if (horse1) {
        const trackPos = getTrackPosition(horse1.currentDistance, horse1.lateralPosition, courseInfo);
        const distanceDelta = previousDistanceRef.current !== null 
          ? horse1.currentDistance - previousDistanceRef.current 
          : null;
        
        // 画面内HUDに表示
        const geometrySource = getLastGeometrySource();
        setDebugInfo({
          time: currentTimeRef.current.toFixed(1) + 's',
          frameTime: currentState.time.toFixed(1) + 's',
          phase: currentState.phase,
          currentDistance: horse1.currentDistance.toFixed(1) + 'm',
          distanceDelta: distanceDelta !== null ? '+' + distanceDelta.toFixed(1) + 'm' : 'N/A',
          velocity: horse1.currentVelocity.toFixed(1) + 'm/s',
          position: horse1.position,
          timelineXYZ: `(${trackPos.x.toFixed(1)}, ${trackPos.y.toFixed(1)}, ${trackPos.z.toFixed(1)})`,
          meshXYZ: mesh1 ? `(${mesh1.position.x.toFixed(1)}, ${mesh1.position.y.toFixed(1)}, ${mesh1.position.z.toFixed(1)})` : 'NO MESH',
          deltaXYZ: mesh1 ? `(${(trackPos.x - mesh1.position.x).toFixed(1)}, ${(trackPos.y - (mesh1.position.y - 1)).toFixed(1)}, ${(trackPos.z - mesh1.position.z).toFixed(1)})` : 'N/A',
          courseInfo: courseInfo ? 'LOADED' : 'NULL',
          geometrySource: geometrySource.toUpperCase(),
          meshCount: horseMeshesRef.current.size,
        });
        
        previousDistanceRef.current = horse1.currentDistance;
      } else {
        setDebugInfo({ error: 'horse1 not found' });
      }
    }
    
    for (const horse of currentState.horses) {
      const mesh = horseMeshesRef.current.get(horse.horseNumber);
      if (!mesh) continue;

      // 3D座標を取得
      const trackPos = getTrackPosition(horse.currentDistance, horse.lateralPosition, courseInfo);

      mesh.position.set(trackPos.x, trackPos.y + 1, trackPos.z);
      
      // 進行方向を向く
      const angle = Math.atan2(trackPos.tangent.x, trackPos.tangent.z);
      mesh.rotation.y = angle;
      
      // 状態による色変更
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
  };
  
  // 追従カメラ更新
  const updateFollowCamera = (currentState: RaceTimelineKeyframe) => {
    const horse = currentState.horses.find(h => h.horseNumber === selectedHorse);
    if (!horse || !cameraRef.current) return;
    
    const trackPos = getTrackPosition(horse.currentDistance, horse.lateralPosition, courseInfo);
    
    // カメラを馬の後方・上方に配置
    const cameraOffset = new THREE.Vector3(-trackPos.tangent.x * 15, 10, -trackPos.tangent.z * 15);
    const targetPos = new THREE.Vector3(trackPos.x, trackPos.y + 2, trackPos.z);
    const cameraPos = targetPos.clone().add(cameraOffset);
    
    // 滑らかに移動
    cameraRef.current.position.lerp(cameraPos, 0.1);
    cameraRef.current.lookAt(targetPos);
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
        {/* コンポーネント情報（左上） */}
        <div className="absolute left-2 top-2 z-50 bg-red-600 px-2 py-1 text-xs text-white font-mono rounded">
          DEBUG: RaceSimulator3DProto a840cc3
        </div>
        
        {/* CourseInfo 追跡（右上） */}
        <div className="absolute right-2 top-2 z-50 bg-blue-600 px-2 py-1 text-xs text-white font-mono rounded">
          CourseInfo: {courseInfo ? 'LOADED ✓' : 'NULL ✗'}
        </div>
        
        {/* デバッグHUD（左下） */}
        {debugInfo && (
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
