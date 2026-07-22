/**
 * 研究ラボ: 自律研究実行API
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { AutonomousResearchAgent } from '@/lib/research-agent/autonomous-engine';
import { saveRuleCandidate } from '@/lib/services/rule-candidate-service';
import { getDbAsync } from '@/lib/db';
import { nanoid } from 'nanoid';

export async function POST(req: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const { theme, mode = 'manual' } = await req.json();
    
    if (!theme) {
      return NextResponse.json(
        { error: 'Theme is required' },
        { status: 400 }
      );
    }
    
    const db = await getDbAsync();
    const sessionId = nanoid();
    
    // 研究セッションをDBに保存（開始時）
    try {
      await db.query(`
        INSERT INTO research_lab_sessions (
          id, user_id, theme, mode, status, progress, phase, started_at
        ) VALUES ($1, $2, $3, $4, 'running', 0, 1, NOW())
      `, [sessionId, session.user.id, theme, mode]);
      
      console.log(`[Research Agent] Session created: ${sessionId}`);
    } catch (dbError) {
      console.warn('[Research Agent] Failed to save session to DB (table may not exist yet):', dbError);
      // DBエラーでも研究は続行
    }
    
    // 自律研究エージェントを起動
    const agent = new AutonomousResearchAgent(
      session.user.id,
      process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    );
    
    console.log(`[Research Agent] Starting research for user: ${session.user.id}`);
    console.log(`[Research Agent] Theme: ${theme}`);
    console.log(`[Research Agent] Mode: ${mode}`);
    
    // 研究実行
    const researchSession = await agent.startResearch(theme);
    
    console.log(`[Research Agent] Research completed`);
    console.log(`[Research Agent] Status: ${researchSession.status}`);
    console.log(`[Research Agent] Phase 1 results: ${researchSession.phase1_results.length}`);
    console.log(`[Research Agent] Phase 2 results: ${researchSession.phase2_results.length}`);
    console.log(`[Research Agent] Phase 3 results: ${researchSession.phase3_results.length}`);
    console.log(`[Research Agent] Rule candidates: ${researchSession.rule_candidates.length}`);
    
    // ルール候補をDBに保存（テーブルが存在する場合のみ）
    const savedCandidates = [];
    
    // TODO: rule_candidatesテーブルの作成が完了したら、この条件を削除
    const saveToDb = false; // テーブル作成後にtrueに変更
    
    if (saveToDb) {
      for (const candidate of researchSession.rule_candidates) {
        try {
          const saved = await saveRuleCandidate(session.user.id, {
            name: candidate.name,
            conditions: candidate.conditions,
            statistics: candidate.statistics,
            confidence: candidate.confidence,
            validation_results: candidate.validation_results || [],
            ai_reasoning: candidate.ai_reasoning,
            research_session_id: researchSession.id
          });
          savedCandidates.push(saved);
          console.log(`[Research Agent] Saved rule candidate: ${saved.id}`);
        } catch (error) {
          console.error(`[Research Agent] Failed to save rule candidate:`, error);
        }
      }
    } else {
      console.log(`[Research Agent] Skipping DB save (rule_candidates table not yet created)`);
      // ルール候補はメモリ上で返すのみ
    }
    
    // 有望条件の数をカウント
    const promisingCount = researchSession.phase1_results.filter(r => r.is_promising).length;
    
    // 研究完了後、結果をDBに保存
    try {
      await db.query(`
        UPDATE research_lab_sessions
        SET 
          status = 'completed',
          progress = 100,
          phase = $2,
          phase1_results = $3,
          phase2_results = $4,
          phase3_results = $5,
          rule_candidates = $6,
          phase1_tested = $7,
          phase1_promising = $8,
          phase2_tested = $9,
          phase3_tested = $10,
          promising_count = $11,
          completed_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `, [
        sessionId,
        researchSession.phase,
        JSON.stringify(researchSession.phase1_results),
        JSON.stringify(researchSession.phase2_results),
        JSON.stringify(researchSession.phase3_results),
        JSON.stringify(savedCandidates),
        researchSession.phase1_results.length,
        promisingCount,
        researchSession.phase2_results.length,
        researchSession.phase3_results.length,
        promisingCount
      ]);
      
      console.log(`[Research Agent] Session saved to DB: ${sessionId}`);
    } catch (dbError) {
      console.warn('[Research Agent] Failed to save results to DB:', dbError);
      // DBエラーでも結果は返す
    }
    
    return NextResponse.json({
      success: true,
      session: {
        id: sessionId, // DB保存されたセッションIDを返す
        theme: researchSession.theme.theme,
        phase: researchSession.phase,
        status: researchSession.status,
        progress: researchSession.progress
      },
      
      // 結果サマリー
      phase1_tested: researchSession.phase1_results.length,
      phase1_promising: promisingCount,
      phase2_tested: researchSession.phase2_results.length,
      phase3_tested: researchSession.phase3_results.length,
      
      promising_count: promisingCount,
      rule_candidates: savedCandidates,
      
      // 詳細結果（UI表示用）
      phase1_results: researchSession.phase1_results,
      phase2_results: researchSession.phase2_results,
      phase3_results: researchSession.phase3_results,
      
      started_at: researchSession.started_at,
      completed_at: researchSession.completed_at
    });
    
  } catch (error) {
    console.error('[Research Agent] Error:', error);
    return NextResponse.json(
      { 
        error: 'Research failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
