'use client';

import { useState, useEffect, useRef } from 'react';

interface ReplayDebuggerProps {
  simulationResult: any;
  courseDistance: number;
}

/**
 * Replay Debugger（最小構成）
 * 
 * 目的: 描画不具合とシミュレーション不具合を切り分け
 * 
 * Phase境界とイベントのキーフレームを使用し、
 * 画面上で補間して表示
 */
export default function ReplayDebugger({ simulationResult, courseDistance }: ReplayDebuggerProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [currentPhase, setCurrentPhase] = useState('start');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // 全Phaseからキーフレームを抽出
  const keyframes = extractKeyframes(simulationResult);
  const maxTime = keyframes.length > 0 ? keyframes[keyframes.length - 1].time : 100;
  
  // 再生制御
  useEffect(() => {
    if (!isPlaying) return;
    
    const interval = setInterval(() => {
      setCurrentTime(prev => {
        const next = prev + 0.1 * playbackSpeed;
        if (next >= maxTime) {
          setIsPlaying(false);
          return maxTime;
        }
        return next;
      });
    }, 100);
    
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, maxTime]);
  
  // 現在時刻の状態を補間
  const currentState = interpolateState(keyframes, currentTime);
  
  // 2D描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentState) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // キャンバスクリア
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // コース描画（上から見た2D）
    const scaleX = canvas.width / 30; // 横30m幅
    const scaleY = canvas.height / courseDistance; // 縦方向はコース距離
    
    // コース中央線
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // 内柵・外柵
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 7.5 * scaleX, 0);
    ctx.lineTo(canvas.width / 2 - 7.5 * scaleX, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 + 7.5 * scaleX, 0);
    ctx.lineTo(canvas.width / 2 + 7.5 * scaleX, canvas.height);
    ctx.stroke();
    
    // ゴールライン
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.beginPath();
    const goalY = canvas.height - courseDistance * scaleY;
    ctx.moveTo(0, goalY);
    ctx.lineTo(canvas.width, goalY);
    ctx.stroke();
    
    // 馬を描画
    currentState.horses.forEach((horse: any) => {
      const x = canvas.width / 2 + horse.lateralPosition * scaleX;
      const y = canvas.height - horse.currentDistance * scaleY;
      
      // 馬の円
      ctx.fillStyle = horse.blocked ? '#ff6b6b' : (horse.accelerationStarted ? '#51cf66' : '#4dabf7');
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // 枠番号
      ctx.fillStyle = '#000';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(horse.horseNumber.toString(), x, y);
      
      // 馬名と順位（小さく表示）
      ctx.fillStyle = '#333';
      ctx.font = '10px sans-serif';
      ctx.fillText(`${horse.position}位 ${horse.horseName}`, x, y - 15);
    });
    
  }, [currentState, courseDistance]);
  
  if (!currentState) {
    return <div>データ読み込み中...</div>;
  }
  
  return (
    <div className="space-y-4">
      {/* タイトル */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Replay Debugger（最小構成）</h3>
        <div className="text-sm text-gray-600">
          Phase: {currentState.phase} | 時刻: {currentTime.toFixed(1)}秒
        </div>
      </div>
      
      {/* 2D表示 */}
      <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={600}
          height={800}
          className="w-full"
        />
      </div>
      
      {/* コントロール */}
      <div className="space-y-2">
        {/* 再生ボタン */}
        <div className="flex gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            {isPlaying ? '⏸ 一時停止' : '▶ 再生'}
          </button>
          <button
            onClick={() => setCurrentTime(0)}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            ⏮ 最初に戻る
          </button>
        </div>
        
        {/* 速度調整 */}
        <div className="flex gap-2 items-center">
          <span className="text-sm">速度:</span>
          {[0.5, 1.0, 2.0].map(speed => (
            <button
              key={speed}
              onClick={() => setPlaybackSpeed(speed)}
              className={`px-3 py-1 rounded ${
                playbackSpeed === speed
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
        
        {/* タイムスライダー */}
        <div className="space-y-1">
          <label className="text-sm font-medium">時刻: {currentTime.toFixed(1)}秒</label>
          <input
            type="range"
            min={0}
            max={maxTime}
            step={0.1}
            value={currentTime}
            onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
      </div>
      
      {/* 馬の状態表示 */}
      <div className="border border-gray-300 rounded-lg p-4 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">順位</th>
              <th className="text-left p-2">馬名</th>
              <th className="text-right p-2">距離(m)</th>
              <th className="text-right p-2">速度(m/s)</th>
              <th className="text-right p-2">横位置(m)</th>
              <th className="text-right p-2">スタミナ(%)</th>
              <th className="text-center p-2">状態</th>
            </tr>
          </thead>
          <tbody>
            {currentState.horses.map((horse: any) => (
              <tr key={horse.horseNumber} className="border-b hover:bg-gray-50">
                <td className="p-2">{horse.position}</td>
                <td className="p-2">{horse.horseName}</td>
                <td className="text-right p-2">{horse.currentDistance.toFixed(1)}</td>
                <td className="text-right p-2">{horse.currentVelocity.toFixed(1)}</td>
                <td className="text-right p-2">{horse.lateralPosition.toFixed(1)}</td>
                <td className="text-right p-2">{horse.staminaRemaining.toFixed(0)}</td>
                <td className="text-center p-2 text-xs">
                  {horse.blocked && <span className="bg-red-100 text-red-800 px-1 rounded">ブロック</span>}
                  {horse.laneChangeState === 'moving' && <span className="bg-yellow-100 text-yellow-800 px-1 rounded">移動中</span>}
                  {horse.accelerationStarted && <span className="bg-green-100 text-green-800 px-1 rounded">加速</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* イベントログ */}
      {currentState.recentEvents && currentState.recentEvents.length > 0 && (
        <div className="border border-gray-300 rounded-lg p-4 bg-white">
          <h4 className="font-bold mb-2">最近のイベント</h4>
          <div className="space-y-1 text-sm">
            {currentState.recentEvents.map((event: any, idx: number) => (
              <div key={idx} className="text-gray-700">
                <span className="font-medium">{event.horseName}</span>: {event.description}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * シミュレーション結果からキーフレームを抽出
 */
function extractKeyframes(result: any): any[] {
  const keyframes: any[] = [];
  
  if (!result || !result.phases) return keyframes;
  
  const phases = ['start', 'formation', 'corner3_4', 'straight', 'goal'];
  
  for (const phaseName of phases) {
    const phase = result.phases[phaseName];
    if (!phase) continue;
    
    // Phase開始時
    keyframes.push({
      time: phase.timeRange.start,
      phase: phase.phaseName,
      horses: phase.horses.map((h: any) => ({ ...h })),
      events: [],
    });
    
    // Phase終了時
    keyframes.push({
      time: phase.timeRange.end,
      phase: phase.phaseName,
      horses: phase.horses.map((h: any) => ({ ...h })),
      events: phase.events || [],
    });
  }
  
  return keyframes.sort((a, b) => a.time - b.time);
}

/**
 * キーフレーム間を補間
 */
function interpolateState(keyframes: any[], time: number): any | null {
  if (keyframes.length === 0) return null;
  
  // 最初または最後のキーフレーム
  if (time <= keyframes[0].time) return keyframes[0];
  if (time >= keyframes[keyframes.length - 1].time) return keyframes[keyframes.length - 1];
  
  // 前後のキーフレームを探す
  let prevFrame = keyframes[0];
  let nextFrame = keyframes[1];
  
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (time >= keyframes[i].time && time < keyframes[i + 1].time) {
      prevFrame = keyframes[i];
      nextFrame = keyframes[i + 1];
      break;
    }
  }
  
  // 補間係数
  const duration = nextFrame.time - prevFrame.time;
  const t = duration > 0 ? (time - prevFrame.time) / duration : 0;
  
  // 各馬の状態を補間
  const interpolatedHorses = prevFrame.horses.map((prevHorse: any, idx: number) => {
    const nextHorse = nextFrame.horses[idx];
    if (!nextHorse) return prevHorse;
    
    return {
      ...prevHorse,
      currentDistance: lerp(prevHorse.currentDistance, nextHorse.currentDistance, t),
      currentVelocity: lerp(prevHorse.currentVelocity, nextHorse.currentVelocity, t),
      lateralPosition: lerp(prevHorse.lateralPosition, nextHorse.lateralPosition, t),
      staminaRemaining: lerp(prevHorse.staminaRemaining, nextHorse.staminaRemaining, t),
      position: t < 0.5 ? prevHorse.position : nextHorse.position,
      blocked: t < 0.5 ? prevHorse.blocked : nextHorse.blocked,
      laneChangeState: t < 0.5 ? prevHorse.laneChangeState : nextHorse.laneChangeState,
      accelerationStarted: prevHorse.accelerationStarted || nextHorse.accelerationStarted,
    };
  });
  
  return {
    time,
    phase: prevFrame.phase,
    horses: interpolatedHorses,
    recentEvents: nextFrame.events?.slice(-3) || [],
  };
}

/**
 * 線形補間
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
