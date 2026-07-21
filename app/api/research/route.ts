/**
 * 研究AI APIエンドポイント
 * POST /api/research
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { isPremiumUser } from '@/lib/premium';
import { runResearch } from '@/lib/research/research-engine';
import { nanoid } from 'nanoid';

export async function POST(req: NextRequest) {
  try {
    // 認証
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // プレミアム確認
    const isPremium = await isPremiumUser(session.user.id);
    if (!isPremium) {
      return NextResponse.json({ 
        error: 'Premium required',
        message: '研究AI機能はプレミアム会員限定です'
      }, { status: 403 });
    }
    
    const { target_type, target_id, question, goal, parent_session_id, context } = await req.json();
    
    if (!target_type || !target_id || !question || !goal) {
      return NextResponse.json({ 
        error: 'target_type, target_id, question, and goal are required' 
      }, { status: 400 });
    }
    
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }
    
    const db = getDb();
    const sessionId = nanoid();
    
    // セッション作成（親子構造対応）
    await db.prepare(`
      INSERT INTO research_sessions (
        id, user_id, parent_session_id, target_type, target_id, 
        initial_question, research_goal, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'running')
    `).run(sessionId, session.user.id, parent_session_id || null, target_type, target_id, question, goal);
    
    try {
      // 研究実行
      const steps = await runResearch(sessionId, question, goal, context, apiKey);
      
      // 行動ログを保存（シンプル + バージョニング）
      for (const step of steps) {
        await db.prepare(`
          INSERT INTO research_steps (
            id, session_id, step_number,
            tool_name, tool_version, tool_input, tool_output,
            executed_at, execution_time_ms
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `).run(
          step.id,
          step.sessionId,
          step.stepNumber,
          step.toolName,
          step.toolVersion,
          JSON.stringify(step.toolInput),
          JSON.stringify(step.toolOutput),
          step.executedAt.toISOString(),
          step.executionTimeMs || null
        );
      }
      
      // セッション完了
      await db.prepare(`
        UPDATE research_sessions 
        SET status = 'completed', completed_at = NOW(), total_steps = $1
        WHERE id = $2
      `).run(steps.length, sessionId);
      
      return NextResponse.json({
        session_id: sessionId,
        steps: steps.map(s => ({
          step_number: s.stepNumber,
          tool_name: s.toolName,
          tool_input: s.toolInput,
          tool_output: s.toolOutput
        }))
      });
      
    } catch (error) {
      console.error('[Research] Error:', error);
      
      // セッション失敗
      await db.prepare(`
        UPDATE research_sessions SET status = 'failed', completed_at = NOW()
        WHERE id = $1
      `).run(sessionId);
      
      return NextResponse.json({ 
        error: 'Research failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('[Research] Error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
