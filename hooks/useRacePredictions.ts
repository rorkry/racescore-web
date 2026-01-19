import { useState, useEffect, useCallback } from 'react';
import type { MarkType } from '@/app/components/InlineMarkSelector';

interface Prediction {
  horse_number: string;  // APIからはスネークケース
  mark: MarkType;
  result_position?: number;
  is_hit?: number;
}

interface UseRacePredictionsResult {
  predictions: Map<string, MarkType>;
  setPrediction: (horseNumber: string, mark: MarkType) => Promise<void>;
  isRaceFinished: boolean;
  loading: boolean;
  saving: boolean;
}

/**
 * レース予想（印）を管理するフック
 * @param raceKey レースを一意に識別するキー（例: "2026-01-11_中山_9"）
 * @param raceDate レース日付（過去レースかどうかの判定に使用）
 */
export function useRacePredictions(raceKey: string | null, raceDate?: string): UseRacePredictionsResult {
  const [predictions, setPredictions] = useState<Map<string, MarkType>>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // レースが終了しているか判定（今日より前の日付なら終了）
  const isRaceFinished = (() => {
    if (!raceDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // raceDateは "0111" のような形式の場合があるので変換
    let raceDateObj: Date;
    if (raceDate.length === 4) {
      const month = parseInt(raceDate.substring(0, 2));
      const day = parseInt(raceDate.substring(2, 4));
      raceDateObj = new Date(today.getFullYear(), month - 1, day);
    } else {
      raceDateObj = new Date(raceDate);
    }
    raceDateObj.setHours(0, 0, 0, 0);
    
    return raceDateObj < today;
  })();

  // 予想を取得
  useEffect(() => {
    if (!raceKey) return;

    const fetchPredictions = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/user/predictions?raceKey=${encodeURIComponent(raceKey)}`);
        if (res.ok) {
          const data = await res.json();
          const newPredictions = new Map<string, MarkType>();
          data.predictions?.forEach((p: Prediction) => {
            if (p.mark) {
              newPredictions.set(p.horse_number, p.mark as MarkType);
            }
          });
          setPredictions(newPredictions);
        }
      } catch (error) {
        console.error('Failed to fetch predictions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPredictions();
  }, [raceKey]);

  // 予想を保存
  const setPrediction = useCallback(async (horseNumber: string, mark: MarkType) => {
    console.log('[useRacePredictions] setPrediction called:', { raceKey, horseNumber, mark, isRaceFinished });
    if (!raceKey || isRaceFinished) {
      console.log('[useRacePredictions] Skipped: no raceKey or race finished');
      return;
    }

    // 楽観的更新
    const prevPredictions = new Map(predictions);
    const newPredictions = new Map(predictions);
    if (mark) {
      newPredictions.set(horseNumber, mark);
    } else {
      newPredictions.delete(horseNumber);
    }
    setPredictions(newPredictions);

    setSaving(true);
    try {
      console.log('[useRacePredictions] Sending to API:', { raceKey, horseNumber, mark });
      const res = await fetch('/api/user/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raceKey, horseNumber, mark })
      });

      const data = await res.json();
      console.log('[useRacePredictions] API response:', res.status, data);

      if (!res.ok) {
        // 失敗したら元に戻す
        setPredictions(prevPredictions);
        console.error('[useRacePredictions] Failed to save prediction:', data);
      }
    } catch (error) {
      // 失敗したら元に戻す
      setPredictions(prevPredictions);
      console.error('[useRacePredictions] Error:', error);
    } finally {
      setSaving(false);
    }
  }, [raceKey, isRaceFinished, predictions]);

  return {
    predictions,
    setPrediction,
    isRaceFinished,
    loading,
    saving
  };
}
