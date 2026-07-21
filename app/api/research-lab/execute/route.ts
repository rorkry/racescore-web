/**
 * 研究ラボ: 自律研究実行API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AutonomousResearchAgent } from '@/lib/research-agent/autonomous-engine';
import { saveRuleCandidate } from '@/lib/services/rule-candidate-service';

export async function POST(req: NextRequest) {
  try {
    // 認証チェック
    const session = await getServerSession(authOptions);
    
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
    
    // ルール候補をDBに保存
    const savedCandidates = [];
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
    
    // 有望条件の数をカウント
    const promisingCount = researchSession.phase1_results.filter(r => r.is_promising).length;
    
    return NextResponse.json({
      success: true,
      session: {
        id: researchSession.id,
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
