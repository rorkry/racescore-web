/**
 * AI研究ツール: 母父分析
 * 母父（Broodmare Sire）の影響を分析
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  calculateCompetitionPerformance,
  calculateInvestmentPerformance,
  evaluatePerformance,
  generatePerformanceSummary
} from '@/lib/research/performance-calculator';

const TOOL_VERSION = '1.0';

export async function POST(req: NextRequest) {
  try {
    const { horse_name, broodmare_sire, race_surface, race_distance } = await req.json();
    
    const db = getDb();
    
    let targetBroodmareSire: string | undefined;
    let broodmareSireType = '不明';
    let sireInfo: any = {};
    
    // broodmare_sireが直接指定されている場合（研究エージェント用）
    if (broodmare_sire) {
      targetBroodmareSire = broodmare_sire;
      // broodmare_sire_typeを取得（オプション）
      const bmsData = await db.prepare(`
        SELECT 
          broodmare_sire_type,
          COUNT(*) as count
        FROM umadata 
        WHERE broodmare_sire = $1 
        GROUP BY broodmare_sire_type
        ORDER BY count DESC
        LIMIT 1
      `).get<any>(broodmare_sire);
      
      if (bmsData) {
        broodmareSireType = bmsData.broodmare_sire_type || '不明';
      }
    }
    // horse_nameが指定されている場合
    else if (horse_name) {
      const horse = await db.prepare(`
        SELECT 
          broodmare_sire,
          broodmare_sire_type,
          sire,
          sire_type
        FROM umadata 
        WHERE horse_name = $1 
        ORDER BY date DESC LIMIT 1
      `).get<any>(horse_name);
      
      if (!horse?.broodmare_sire) {
        return NextResponse.json({ 
          schema_version: TOOL_VERSION,
          error: 'Broodmare sire not found',
          summary: `${horse_name}の母父データが見つかりません` 
        });
      }
      
      targetBroodmareSire = horse.broodmare_sire;
      broodmareSireType = horse.broodmare_sire_type || '不明';
      sireInfo = horse;
    }
    else {
      return NextResponse.json({ 
        schema_version: TOOL_VERSION,
        error: 'Either horse_name or broodmare_sire is required'
      }, { status: 400 });
    }
    
    if (!targetBroodmareSire) {
      return NextResponse.json({ 
        schema_version: TOOL_VERSION,
        error: 'Broodmare sire information not found'
      }, { status: 400 });
    }
    
    // 母父が同じ馬の成績データを取得
    let query = `
      SELECT 
        finish_position,
        field_size,
        popularity,
        win_odds,
        place_odds_low,
        place_odds_high,
        distance
      FROM umadata
      WHERE broodmare_sire = $1
    `;
    
    const params: any[] = [targetBroodmareSire];
    
    // 芝/ダート指定がある場合
    if (race_surface) {
      query += ` AND distance LIKE $2`;
      params.push(`${race_surface}%`);
    }
    
    query += ` LIMIT 300`;
    
    const races = await db.prepare(query).all<any>(...params);
    
    if (!races || races.length === 0) {
      return NextResponse.json({
        schema_version: TOOL_VERSION,
        error: 'No data',
        summary: `${targetBroodmareSire}が母父の馬のデータが見つかりません`
      });
    }
    
    // 競争成績を計算
    const competition = calculateCompetitionPerformance(races);
    
    // 投資成績を計算
    const investment = calculateInvestmentPerformance(races);
    
    // 期待値評価
    const score = evaluatePerformance(competition, investment);
    
    // 距離適性（距離指定がある場合）
    let distanceMatch = null;
    if (race_distance) {
      const avgDistance = races.reduce((sum, r) => {
        const dist = parseInt(r.distance?.match(/\d+/)?.[0] || '0', 10);
        return sum + dist;
      }, 0) / races.length;
      
      distanceMatch = Math.abs(race_distance - avgDistance) < 400;
    }
    
    // 父×母父の相性チェック（sireInfoがある場合のみ）
    let hasNicks = false;
    if (sireInfo.sire) {
      const nicks = await db.prepare(`
        SELECT 
          COUNT(*) as count,
          AVG(CASE WHEN finish_position = '1' THEN 1.0 ELSE 0.0 END) as win_rate
        FROM umadata
        WHERE sire = $1 AND broodmare_sire = $2
      `).get<any>(sireInfo.sire, targetBroodmareSire);
      
      hasNicks = (nicks?.count || 0) > 10 && (nicks?.win_rate || 0) > 0.15;
    }
    
    // サマリー生成
    let summary = horse_name
      ? `${horse_name}の母父は${targetBroodmareSire}(${broodmareSireType})。`
      : `母父${targetBroodmareSire}(${broodmareSireType})の実績: `;
    
    if (race_surface) {
      summary += `${race_surface}での母父実績: ${generatePerformanceSummary(competition, investment, score)}`;
    } else {
      summary += `母父実績: ${generatePerformanceSummary(competition, investment, score)}`;
    }
    
    if (hasNicks && sireInfo.sire) {
      summary += ` ${sireInfo.sire}×${targetBroodmareSire}は好相性配合。`;
    }
    
    if (distanceMatch !== null) {
      summary += ` ${race_distance}mは${distanceMatch ? '適性範囲' : '範囲外'}。`;
    }
    
    return NextResponse.json({
      schema_version: TOOL_VERSION,
      broodmare_sire: targetBroodmareSire,
      broodmare_sire_type: broodmareSireType,
      sire: sireInfo.sire || '不明',
      has_nicks: hasNicks,
      competition_performance: competition,
      investment_performance: investment,
      performance_score: score,
      distance_match: distanceMatch,
      summary
    });
    
  } catch (error) {
    console.error('[AI Tool: Broodmare Sire] Error:', error);
    return NextResponse.json({ 
      schema_version: TOOL_VERSION,
      error: 'Internal error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
