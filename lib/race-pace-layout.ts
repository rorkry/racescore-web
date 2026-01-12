/**
 * レース展開予想 - レイアウト計算ロジック
 * 
 * 馬の視覚的配置を計算
 */

export interface HorseLayout {
  x: number; // 横位置（%）
  y: number; // 縦位置（レーン: 0=上, 1=中, 2=下）
}

/**
 * 馬群のグループ分けとレイアウト計算
 * 
 * @param horses - 馬情報配列（expectedPosition を含む）
 * @param isGoal - ゴール時かスタート時か
 * @returns 馬番をキーとしたレイアウトマップ
 */
export function calculateHorseLayout<T extends {
  horseNumber: number;
  expectedPosition2C?: number;
  expectedPositionGoal?: number;
}>(
  horses: T[],
  isGoal: boolean
): Map<number, HorseLayout> {
  const layoutMap = new Map<number, HorseLayout>();
  
  // ソート用の配列を作成
  const sorted = [...horses].sort((a, b) => {
    const posA = isGoal ? (a.expectedPositionGoal ?? 999) : (a.expectedPosition2C ?? 999);
    const posB = isGoal ? (b.expectedPositionGoal ?? 999) : (b.expectedPosition2C ?? 999);
    return posA - posB;
  });
  
  // グループ化のための閾値
  const groupThreshold = 1.5; // 馬身差
  const groupGap = 12; // グループ間の最小間隔（%）
  const minGap = 3; // 同一グループ内の最小間隔（%）
  const jitter = 2; // ランダムなずれ（%）
  
  let currentX = 2; // 左端から2%スタート
  let lastPosition: number | null = null;
  let currentLane = 0; // 現在のレーン (0=上, 1=中, 2=下)
  
  // 孤立馬検出用（単独グループで前後に大きな間隔）
  const groups: T[][] = [];
  let currentGroup: T[] = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const horse = sorted[i];
    const position = isGoal 
      ? (horse.expectedPositionGoal ?? 999) 
      : (horse.expectedPosition2C ?? 999);
    
    if (lastPosition === null || Math.abs(position - lastPosition) <= groupThreshold) {
      currentGroup.push(horse);
    } else {
      if (currentGroup.length > 0) {
        groups.push([...currentGroup]);
      }
      currentGroup = [horse];
    }
    
    lastPosition = position;
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  
  // 孤立馬の検出とレーン調整
  for (let groupIdx = 0; groupIdx < groups.length; groupIdx++) {
    const group = groups[groupIdx];
    
    // 単独グループかつ前後に3馬身以上の間隔 = 孤立馬
    if (group.length === 1) {
      let isIsolated = false;
      
      if (groupIdx === 0) {
        // 先頭グループが単独 & 次グループと3馬身以上離れている
        if (groups.length > 1) {
          const nextGroupPos = isGoal 
            ? (groups[1][0].expectedPositionGoal ?? 999) 
            : (groups[1][0].expectedPosition2C ?? 999);
          const thisPos = isGoal 
            ? (group[0].expectedPositionGoal ?? 999) 
            : (group[0].expectedPosition2C ?? 999);
          
          if (Math.abs(nextGroupPos - thisPos) >= 3.0) {
            isIsolated = true;
          }
        }
      } else if (groupIdx === groups.length - 1) {
        // 最後尾グループが単独 & 前グループと3馬身以上離れている
        const prevGroupPos = isGoal 
          ? (groups[groupIdx - 1][0].expectedPositionGoal ?? 999) 
          : (groups[groupIdx - 1][0].expectedPosition2C ?? 999);
        const thisPos = isGoal 
          ? (group[0].expectedPositionGoal ?? 999) 
          : (group[0].expectedPosition2C ?? 999);
        
        if (Math.abs(thisPos - prevGroupPos) >= 3.0) {
          isIsolated = true;
        }
      } else {
        // 中間グループが単独 & 前後と3馬身以上離れている
        const prevGroupPos = isGoal 
          ? (groups[groupIdx - 1][0].expectedPositionGoal ?? 999) 
          : (groups[groupIdx - 1][0].expectedPosition2C ?? 999);
        const nextGroupPos = isGoal 
          ? (groups[groupIdx + 1][0].expectedPositionGoal ?? 999) 
          : (groups[groupIdx + 1][0].expectedPosition2C ?? 999);
        const thisPos = isGoal 
          ? (group[0].expectedPositionGoal ?? 999) 
          : (group[0].expectedPosition2C ?? 999);
        
        if (
          Math.abs(thisPos - prevGroupPos) >= 3.0 && 
          Math.abs(nextGroupPos - thisPos) >= 3.0
        ) {
          isIsolated = true;
        }
      }
      
      // 孤立馬は中央レーンに配置
      if (isIsolated) {
        currentLane = 1;
      }
    }
    
    // グループ内の馬を配置
    for (let i = 0; i < group.length; i++) {
      const horse = group[i];
      const position = isGoal 
        ? (horse.expectedPositionGoal ?? 999) 
        : (horse.expectedPosition2C ?? 999);
      
      // X座標計算
      if (lastPosition === null) {
        // 先頭馬
        lastPosition = position;
      } else if (Math.abs(position - lastPosition) > groupThreshold) {
        // 新しいグループ = 大きな間隔
        currentX += groupGap;
        lastPosition = position;
        
        // レーンをリセット
        currentLane = 0;
      } else {
        // 同一グループ内 = 小さな間隔 + ランダムなずれ
        currentX += minGap + Math.random() * jitter;
      }
      
      // 右端を超えないように
      if (currentX > 98) {
        currentX = 98;
      }
      
      // レイアウトを保存
      layoutMap.set(horse.horseNumber, {
        x: currentX,
        y: currentLane
      });
      
      // レーンをローテーション（密集回避）
      if (group.length > 3) {
        currentLane = (currentLane + 1) % 3;
      }
    }
  }
  
  return layoutMap;
}

/**
 * 特定の馬のレイアウトを取得
 * 
 * @param horseNumber - 馬番
 * @param layoutMap - レイアウトマップ
 * @returns レイアウト（存在しない場合はデフォルト値）
 */
export function getHorseLayout(
  horseNumber: number,
  layoutMap: Map<number, HorseLayout>
): HorseLayout {
  return layoutMap.get(horseNumber) ?? { x: 50, y: 1 };
}










