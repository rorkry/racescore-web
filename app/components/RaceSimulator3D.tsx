'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { RaceTimeline } from '@/lib/race-simulator/timeline-generator';

interface RaceSimulator3DProps {
  timeline: RaceTimeline;
  courseName: string;
}

/**
 * 3Dレースシミュレーター
 * 
 * Three.jsを使用してリアルタイムでレースを可視化
 */
export default function RaceSimulator3D({
  timeline,
  courseName,
}: RaceSimulator3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  useEffect(() => {
    if (!containerRef.current || timeline.keyframes.length === 0) return;
    
    // ========================================
    // Three.js初期化
    // ========================================
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // シーン
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // 空色
    scene.fog = new THREE.Fog(0x87CEEB, 500, 2000);
    
    // カメラ
    const camera = new THREE.PerspectiveCamera(60, width / height, 1, 3000);
    camera.position.set(0, 150, -200); // 俯瞰視点
    camera.lookAt(0, 0, 0);
    
    // レンダラー
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    
    // コントロール
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2; // 地面より下に行かない
    
    // ライト
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 100);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // ========================================
    // コース描画
    // ========================================
    drawCourse(scene, courseDistance);
    
    // ========================================
    // 馬の描画
    // ========================================
    const horseMeshes: Map<number, THREE.Mesh> = new Map();
    const horseLabels: Map<number, THREE.Sprite> = new Map();
    
    for (const horseFrame of timeline.keyframes[0].horses) {
      // 馬を球体で表現（後でモデルに置き換え可能）
      const geometry = new THREE.SphereGeometry(2, 16, 16);
      const material = new THREE.MeshStandardMaterial({
        color: getHorseColor(horseFrame.horseNumber),
        metalness: 0.3,
        roughness: 0.7,
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      
      horseMeshes.set(horseFrame.horseNumber, mesh);
      
      // ラベル（馬番）
      const label = createHorseLabel(horseFrame.horseNumber);
      scene.add(label);
      horseLabels.set(horseFrame.horseNumber, label);
    }
    
    // ========================================
    // アニメーションループ
    // ========================================
    let animationId: number;
    let frameIndex = 0;
    let lastTime = Date.now();
    
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      
      controls.update();
      
      if (isPlaying && timeline.keyframes.length > 0) {
        const now = Date.now();
        const deltaTime = (now - lastTime) / 1000; // 秒
        lastTime = now;
        
        // フレームを進める（playbackSpeed倍速）
        const frameStep = deltaTime * 10 * playbackSpeed; // 10fps想定
        frameIndex += frameStep;
        
        if (frameIndex >= timeline.keyframes.length) {
          frameIndex = 0; // ループ
        }
        
        const currentFrameIdx = Math.floor(frameIndex);
        setCurrentFrame(currentFrameIdx);
        
        // 馬の位置を更新
        const frame = timeline.keyframes[currentFrameIdx];
        
        for (const horseFrame of frame.horses) {
          const mesh = horseMeshes.get(horseFrame.horseNumber);
          const label = horseLabels.get(horseFrame.horseNumber);
          
          if (mesh) {
            mesh.position.set(horseFrame.x, horseFrame.y + 2, horseFrame.z);
            
            // 加速中は色を変える
            if (horseFrame.isAccelerating) {
              (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0xff6600);
            } else {
              (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
            }
          }
          
          if (label) {
            label.position.set(horseFrame.x, horseFrame.y + 6, horseFrame.z);
          }
        }
        
        // カメラを先頭馬に追従
        const leadHorse = frame.horses[0];
        if (leadHorse) {
          camera.position.x = leadHorse.x;
          camera.position.z = leadHorse.z - 50;
          camera.lookAt(leadHorse.x, leadHorse.y, leadHorse.z + 50);
        }
      }
      
      renderer.render(scene, camera);
    };
    
    animate();
    
    // クリーンアップ
    return () => {
      cancelAnimationFrame(animationId);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [timeline, isPlaying, playbackSpeed, courseDistance]);
  
  return (
    <div className="relative w-full h-full">
      {/* 3D Canvas */}
      <div ref={containerRef} className="w-full h-[600px] bg-gray-900 rounded-lg" />
      
      {/* コントロールUI */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 rounded-lg p-4 flex items-center gap-4">
        {/* 再生/一時停止 */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          {isPlaying ? '⏸ 一時停止' : '▶️ 再生'}
        </button>
        
        {/* 速度調整 */}
        <div className="flex items-center gap-2">
          <span className="text-white text-sm">速度:</span>
          <button
            onClick={() => setPlaybackSpeed(0.5)}
            className={`px-3 py-1 rounded text-sm ${
              playbackSpeed === 0.5 ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300'
            }`}
          >
            0.5x
          </button>
          <button
            onClick={() => setPlaybackSpeed(1)}
            className={`px-3 py-1 rounded text-sm ${
              playbackSpeed === 1 ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300'
            }`}
          >
            1x
          </button>
          <button
            onClick={() => setPlaybackSpeed(2)}
            className={`px-3 py-1 rounded text-sm ${
              playbackSpeed === 2 ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300'
            }`}
          >
            2x
          </button>
          <button
            onClick={() => setPlaybackSpeed(4)}
            className={`px-3 py-1 rounded text-sm ${
              playbackSpeed === 4 ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300'
            }`}
          >
            4x
          </button>
        </div>
        
        {/* 進捗表示 */}
        <div className="text-white text-sm">
          {currentFrame} / {timeline.keyframes.length} フレーム
          {timeline.keyframes[currentFrame] && ` (時刻: ${timeline.keyframes[currentFrame].time.toFixed(1)}秒)`}
        </div>
      </div>
      
      {/* コース情報 */}
      <div className="absolute top-4 left-4 bg-black/70 rounded-lg p-3 text-white">
        <div className="font-bold text-lg">{courseName}</div>
        <div className="text-sm">{timeline.courseDistance}m</div>
      </div>
    </div>
  );
}

/**
 * コースを描画
 */
function drawCourse(scene: THREE.Scene, distance: number) {
  // 地面
  const groundGeometry = new THREE.PlaneGeometry(100, distance + 200);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x228B22, // 芝色
    roughness: 0.8,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  
  // トラック（ダートエリア）
  const trackGeometry = new THREE.PlaneGeometry(40, distance);
  const trackMaterial = new THREE.MeshStandardMaterial({
    color: 0xC19A6B, // ダート色
    roughness: 0.9,
  });
  const track = new THREE.Mesh(trackGeometry, trackMaterial);
  track.rotation.x = -Math.PI / 2;
  track.position.y = 0.1;
  track.receiveShadow = true;
  scene.add(track);
  
  // コースライン
  for (let i = -20; i <= 20; i += 5) {
    const lineGeometry = new THREE.BoxGeometry(0.3, 0.2, distance);
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const line = new THREE.Mesh(lineGeometry, lineMaterial);
    line.position.set(i, 0.2, 0);
    scene.add(line);
  }
  
  // スタート地点
  const startGeometry = new THREE.BoxGeometry(50, 1, 2);
  const startMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 });
  const startLine = new THREE.Mesh(startGeometry, startMaterial);
  startLine.position.set(0, 0.5, -distance / 2);
  scene.add(startLine);
  
  // ゴール地点
  const goalGeometry = new THREE.BoxGeometry(50, 1, 2);
  const goalMaterial = new THREE.MeshBasicMaterial({ color: 0x00FF00 });
  const goalLine = new THREE.Mesh(goalGeometry, goalMaterial);
  goalLine.position.set(0, 0.5, distance / 2);
  scene.add(goalLine);
}

/**
 * 馬の色を取得（枠番に応じて）
 */
function getHorseColor(horseNumber: number): number {
  const colors = [
    0xFF0000, // 1枠: 赤
    0x0000FF, // 2枠: 青
    0xFFFF00, // 3枠: 黄
    0x00FF00, // 4枠: 緑
    0xFF00FF, // 5枠: 紫
    0x00FFFF, // 6枠: 水色
    0xFFA500, // 7枠: オレンジ
    0xFFFFFF, // 8枠: 白
  ];
  
  return colors[(horseNumber - 1) % colors.length];
}

/**
 * 馬のラベルを作成
 */
function createHorseLabel(horseNumber: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, 64, 64);
    
    context.fillStyle = 'white';
    context.font = 'bold 32px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(horseNumber), 32, 32);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4, 4, 1);
  
  return sprite;
}
