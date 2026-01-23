/**
 * ファインチューニング管理API
 * 
 * POST /api/admin/fine-tune
 * - action: 'prepare' | 'upload' | 'start' | 'status' | 'list' | 'set-model'
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  prepareFineTuningData,
  exportToJsonl,
  uploadFineTuningFile,
  createFineTuningJob,
  getFineTuningJob,
  listFineTuningJobs,
  saveFineTunedModel,
  getFineTunedModel,
  estimateCost,
} from '@/lib/ai-chat/fine-tuning';

export async function POST(request: NextRequest) {
  try {
    // 認証確認
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // 管理者確認
    const db = getDb();
    const user = await db.prepare(
      'SELECT role FROM users WHERE id = $1'
    ).get<{ role: string }>(session.user.id);
    
    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    
    const body = await request.json();
    const { action, jobId, modelId, limit } = body;
    
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }
    
    // 学習データ取得件数（指定がなければ全件）
    const dataLimit = limit ? parseInt(limit, 10) : undefined;
    
    switch (action) {
      case 'prepare': {
        // 学習データを準備
        const { data, stats } = await prepareFineTuningData(dataLimit);
        const cost = estimateCost(data);
        
        return NextResponse.json({
          success: true,
          stats,
          cost,
          preview: data.slice(0, 3).map(d => ({
            user: d.messages[1].content,
            assistant: d.messages[2].content.substring(0, 200) + '...',
          })),
        });
      }
      
      case 'upload': {
        // 学習データをJSONLに変換してアップロード
        const { data, stats } = await prepareFineTuningData(dataLimit);
        const jsonl = exportToJsonl(data);
        
        console.log(`[Fine-tune] Using ${data.length} of ${stats.dbTotal} available examples (${jsonl.length} bytes)`);
        
        const fileResult = await uploadFineTuningFile(apiKey, jsonl);
        
        console.log(`[Fine-tune] File uploaded: ${fileResult.id}`);
        
        return NextResponse.json({
          success: true,
          fileId: fileResult.id,
          filename: fileResult.filename,
          bytes: fileResult.bytes,
        });
      }
      
      case 'start': {
        // ファインチューニングジョブを開始
        const { fileId } = body;
        if (!fileId) {
          return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
        }
        
        console.log(`[Fine-tune] Starting job with file: ${fileId}`);
        
        const job = await createFineTuningJob(apiKey, fileId);
        
        console.log(`[Fine-tune] Job created: ${job.id}`);
        
        // ジョブIDを保存
        await db.prepare(`
          INSERT INTO app_settings (key, value, updated_at)
          VALUES ('fine_tuning_job_id', $1, NOW())
          ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `).run(job.id);
        
        return NextResponse.json({
          success: true,
          job: {
            id: job.id,
            status: job.status,
            model: job.model,
          },
        });
      }
      
      case 'status': {
        // ジョブの状態を確認
        let targetJobId = jobId;
        
        if (!targetJobId) {
          // 保存されているジョブIDを取得
          const saved = await db.prepare(`
            SELECT value FROM app_settings WHERE key = 'fine_tuning_job_id'
          `).get<{ value: string }>();
          targetJobId = saved?.value;
        }
        
        if (!targetJobId) {
          return NextResponse.json({ error: 'No job ID found' }, { status: 404 });
        }
        
        const job = await getFineTuningJob(apiKey, targetJobId);
        
        // 完了していればモデルIDを保存
        if (job.status === 'succeeded' && job.fine_tuned_model) {
          await saveFineTunedModel(job.fine_tuned_model);
          console.log(`[Fine-tune] Model saved: ${job.fine_tuned_model}`);
        }
        
        return NextResponse.json({
          success: true,
          job: {
            id: job.id,
            status: job.status,
            model: job.model,
            fine_tuned_model: job.fine_tuned_model,
            created_at: new Date(job.created_at * 1000).toISOString(),
            finished_at: job.finished_at ? new Date(job.finished_at * 1000).toISOString() : null,
            trained_tokens: job.trained_tokens,
            error: job.error,
          },
        });
      }
      
      case 'list': {
        // ジョブ一覧を取得
        const result = await listFineTuningJobs(apiKey);
        
        return NextResponse.json({
          success: true,
          jobs: result.data.map(job => ({
            id: job.id,
            status: job.status,
            model: job.model,
            fine_tuned_model: job.fine_tuned_model,
            created_at: new Date(job.created_at * 1000).toISOString(),
          })),
        });
      }
      
      case 'set-model': {
        // 使用するモデルを設定
        if (!modelId) {
          return NextResponse.json({ error: 'modelId is required' }, { status: 400 });
        }
        
        await saveFineTunedModel(modelId);
        
        return NextResponse.json({
          success: true,
          modelId,
        });
      }
      
      case 'get-model': {
        // 現在のモデルを取得
        const currentModel = await getFineTunedModel();
        
        return NextResponse.json({
          success: true,
          modelId: currentModel,
          isFineTuned: !!currentModel,
        });
      }
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
    
  } catch (error) {
    console.error('[Fine-tune] Error:', error);
    return NextResponse.json({
      error: 'Fine-tuning operation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    // 認証確認
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // 管理者確認
    const db = getDb();
    const user = await db.prepare(
      'SELECT role FROM users WHERE id = $1'
    ).get<{ role: string }>(session.user.id);
    
    if (user?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }
    
    // 現在の設定を返す
    const currentModel = await getFineTunedModel();
    const jobId = await db.prepare(`
      SELECT value FROM app_settings WHERE key = 'fine_tuning_job_id'
    `).get<{ value: string }>();
    
    return NextResponse.json({
      currentModel,
      lastJobId: jobId?.value || null,
      isFineTuned: !!currentModel,
    });
    
  } catch (error) {
    console.error('[Fine-tune] GET Error:', error);
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}
