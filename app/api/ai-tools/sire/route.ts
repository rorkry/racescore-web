/**
 * AI研究ツール: 血統分析
 * 種牡馬の成績・適性を分析
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  calculateCompetitionPerformance,
  calculateInvestmentPerformance,
  evaluatePerformance,
  generatePerformanceSummary
} from '@/lib/research/performance-calculator';

const TOOL_VERSION = '1.2'; // 血統詳細情報追加

export async function POST(req: NextRequest) {
  try {
    const { horse_name, race_surface, race_distance } = await req.json();
    
    if (!horse_name || !race_surface || !race_distance) {
      return NextResponse.json({ 
        schema_version: TOOL_VERSION,
        error: 'horse_name, race_surface, and race_distance are required'
      }, { status: 400 });
    }
    
    const db = getDb();
    
    // 馬の血統情報を取得
    const horse = await db.prepare(`
      SELECT 
        sire,
        sire_type,
        dam,
        dam_type,
        broodmare_sire,
        broodmare_sire_type
      FROM umadata 
      WHERE horse_name = $1 
      ORDER BY date DESC LIMIT 1
    `).get<any>(horse_name);
    
    if (!horse?.sire) {
      return NextResponse.json({ 
        schema_version: TOOL_VERSION,
        error: 'Horse not found',
        summary: `${horse_name}のデータが見つかりません` 
      });
    }
    
    const sire = horse.sire;
    const sireType = horse.sire_type || '不明';
    const broodmareSire = horse.broodmare_sire || '不明';
    const broodmareSireType = horse.broodmare_sire_type || '不明';
    
    // 種牡馬の成績データを取得（オッズ含む）
    const races = await db.prepare(`
      SELECT 
        finish_position,
        field_size,
        popularity,
        win_odds,
        place_odds_low,
        place_odds_high,
        distance
      FROM umadata
      WHERE sire = $1 AND distance LIKE $2
      LIMIT 300
    `).all<any>(sire, `${race_surface}%`);
    
    if (!races || races.length === 0) {
      return NextResponse.json({
        schema_version: TOOL_VERSION,
        error: 'No data',
        summary: `${sire}産駒の${race_surface}データが見つかりません`
      });
    }
    
    // 競争成績を計算
    const competition = calculateCompetitionPerformance(races);
    
    // 投資成績を計算（実際のオッズデータを使用）
    const investment = calculateInvestmentPerformance(races);
    
    // 期待値評価
    const score = evaluatePerformance(competition, investment);
    
    // 距離適性
    const avgDistance = races.reduce((sum, r) => {
      const dist = parseInt(r.distance?.match(/\d+/)?.[0] || '0', 10);
      return sum + dist;
    }, 0) / races.length;
    
    const distanceMatch = Math.abs(race_distance - avgDistance) < 400;
    
    // サマリー生成（血統情報含む）
    const summary = `${horse_name}は${sire}(${sireType}) × ${broodmareSire}(${broodmareSireType})配合。` +
      `${sire}産駒${race_surface}: ` + 
      generatePerformanceSummary(competition, investment, score) +
      ` 今回${race_distance}mは${distanceMatch ? '適性範囲' : '範囲外'}。`;
    
    return NextResponse.json({
      schema_version: TOOL_VERSION,
      sire,
      sire_type: sireType,
      dam: horse.dam || '不明',
      dam_type: horse.dam_type || '不明',
      broodmare_sire: broodmareSire,
      broodmare_sire_type: broodmareSireType,
      competition_performance: competition,
      investment_performance: investment,
      performance_score: score,
      distance_match: distanceMatch,
      summary
    });
    
  } catch (error) {
    console.error('[AI Tool: Sire] Error:', error);
    return NextResponse.json({ 
      schema_version: TOOL_VERSION,
      error: 'Internal error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
