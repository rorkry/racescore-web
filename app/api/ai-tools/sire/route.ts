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
    const { horse_name, sire, race_surface, race_distance } = await req.json();
    
    if (!race_surface || !race_distance) {
      return NextResponse.json({ 
        schema_version: TOOL_VERSION,
        error: 'race_surface and race_distance are required'
      }, { status: 400 });
    }
    
    const db = getDb();
    
    let targetSire: string | undefined;
    let sireInfo: any = {};
    
    // sireが直接指定されている場合（研究エージェント用）
    if (sire) {
      targetSire = sire;
      // sire情報を取得（オプション）
      const sireData = await db.prepare(`
        SELECT 
          sire_type,
          COUNT(*) as count
        FROM umadata 
        WHERE sire = $1 
        GROUP BY sire_type
        ORDER BY count DESC
        LIMIT 1
      `).get<any>(sire);
      
      if (sireData) {
        sireInfo = {
          sire: sire,
          sire_type: sireData.sire_type
        };
      }
    }
    // horse_nameが指定されている場合
    else if (horse_name) {
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
      
      targetSire = horse.sire;
      sireInfo = horse;
    }
    else {
      return NextResponse.json({ 
        schema_version: TOOL_VERSION,
        error: 'Either horse_name or sire is required'
      }, { status: 400 });
    }
    
    if (!targetSire) {
      return NextResponse.json({ 
        schema_version: TOOL_VERSION,
        error: 'Sire information not found'
      }, { status: 400 });
    }
    
    const sireType = sireInfo.sire_type || '不明';
    const broodmareSire = sireInfo.broodmare_sire || '不明';
    const broodmareSireType = sireInfo.broodmare_sire_type || '不明';
    
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
    `).all<any>(targetSire, `${race_surface}%`);
    
    if (!races || races.length === 0) {
      return NextResponse.json({
        schema_version: TOOL_VERSION,
        error: 'No data',
        summary: `${targetSire}産駒の${race_surface}データが見つかりません`
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
    const summary = horse_name
      ? `${horse_name}は${targetSire}(${sireType}) × ${broodmareSire}(${broodmareSireType})配合。` +
        `${targetSire}産駒${race_surface}: ` + 
        generatePerformanceSummary(competition, investment, score) +
        ` 今回${race_distance}mは${distanceMatch ? '適性範囲' : '範囲外'}。`
      : `${targetSire}(${sireType})産駒${race_surface}: ` +
        generatePerformanceSummary(competition, investment, score) +
        ` 距離${race_distance}mは${distanceMatch ? '適性範囲' : '範囲外'}。`;
    
    return NextResponse.json({
      schema_version: TOOL_VERSION,
      sire: targetSire,
      sire_type: sireType,
      dam: sireInfo.dam || '不明',
      dam_type: sireInfo.dam_type || '不明',
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
