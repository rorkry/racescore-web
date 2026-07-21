/**
 * 研究ラボ: 自律研究実行API
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { AutonomousResearchAgent } from '@/lib/research-agent/autonomous-engine';

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
    
    // 有望条件の数をカウント
    const promisingCount = researchSession.phase1_results.filter(r => r.is_promising).length;
    
    return NextResponse.json({
      success: true,
      session_id: researchSession.id,
      status: researchSession.status,
      theme: researchSession.theme,
      progress: researchSession.progress,
      
      // 結果サマリー
      phase1_tested: researchSession.phase1_results.length,
      phase1_promising: promisingCount,
      phase2_tested: researchSession.phase2_results.length,
      phase3_tested: researchSession.phase3_results.length,
      
      promising_count: promisingCount,
      rule_candidates: researchSession.rule_candidates,
      
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
