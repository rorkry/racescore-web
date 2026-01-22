/**
 * OpenAI ファインチューニング機能
 * 
 * 過去の予想データを学習させてカスタムモデルを作成
 */

import { getDb } from '@/lib/db';

// ファインチューニング用データフォーマット（OpenAI Chat形式）
export interface FineTuningExample {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
}

// ファインチューニングジョブの状態
export interface FineTuningJob {
  id: string;
  status: 'validating_files' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  model: string;
  fine_tuned_model: string | null;
  created_at: number;
  finished_at: number | null;
  error?: { message: string };
  trained_tokens?: number;
}

// システムプロンプト（学習用）
const FINE_TUNING_SYSTEM_PROMPT = `あなたは競馬予想のエキスパートです。以下の特徴で予想文を書いてください：

1. 文体: 口語調で自然な語り口。「〜そう」「〜かな」「面白そう」を使う
2. 論理: 展開予想→前走分析（度外視理由）→今回の好転要素→結論
3. 独自表現: 「かみ合っていない」「通用する」「魅力を感じない」「変わり身に期待」
4. 買い目: 「単勝 X」「馬連 X-Y.Z」形式

人気馬を嫌う理由、穴馬を推す理由を明確に書いてください。`;

/**
 * DBから学習データを取得してJSONL形式に変換
 */
export async function prepareFineTuningData(): Promise<{
  data: FineTuningExample[];
  stats: {
    total: number;
    withHonmei: number;
    avgLength: number;
  };
}> {
  const db = getDb();
  
  // 予想データを取得（本命が設定されているもの優先）
  const predictions = await db.prepare(`
    SELECT 
      id,
      race_course,
      race_number,
      distance,
      surface,
      honmei,
      full_text,
      reaction_count
    FROM ai_predictions
    WHERE full_text IS NOT NULL 
      AND LENGTH(full_text) > 100
    ORDER BY reaction_count DESC
    LIMIT 1000
  `).all<{
    id: string;
    race_course: string | null;
    race_number: number | null;
    distance: number | null;
    surface: string | null;
    honmei: string | null;
    full_text: string;
    reaction_count: number;
  }>();
  
  const examples: FineTuningExample[] = [];
  let withHonmei = 0;
  let totalLength = 0;
  
  for (const pred of predictions) {
    // ユーザープロンプトを生成（レース情報）
    const userPrompt = generateUserPrompt(pred);
    
    // アシスタントの応答（実際の予想文）
    const assistantContent = pred.full_text.trim();
    
    if (assistantContent.length < 50) continue;
    
    examples.push({
      messages: [
        { role: 'system', content: FINE_TUNING_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: assistantContent },
      ],
    });
    
    if (pred.honmei) withHonmei++;
    totalLength += assistantContent.length;
  }
  
  return {
    data: examples,
    stats: {
      total: examples.length,
      withHonmei,
      avgLength: examples.length > 0 ? Math.round(totalLength / examples.length) : 0,
    },
  };
}

/**
 * レース情報からユーザープロンプトを生成
 */
function generateUserPrompt(pred: {
  race_course: string | null;
  race_number: number | null;
  distance: number | null;
  surface: string | null;
}): string {
  const parts: string[] = [];
  
  if (pred.race_course) {
    parts.push(pred.race_course);
  }
  
  if (pred.race_number) {
    parts.push(`${pred.race_number}R`);
  }
  
  if (pred.surface && pred.distance) {
    parts.push(`${pred.surface}${pred.distance}m`);
  }
  
  if (parts.length === 0) {
    return '以下のレースの予想を書いてください。';
  }
  
  return `${parts.join(' ')}の予想を書いてください。`;
}

/**
 * JSONL形式でエクスポート
 */
export function exportToJsonl(examples: FineTuningExample[]): string {
  return examples.map(ex => JSON.stringify(ex)).join('\n');
}

/**
 * ファインチューニングファイルをアップロード
 */
export async function uploadFineTuningFile(
  apiKey: string,
  jsonlContent: string
): Promise<{ id: string; filename: string; bytes: number }> {
  const blob = new Blob([jsonlContent], { type: 'application/jsonl' });
  const formData = new FormData();
  formData.append('file', blob, 'training_data.jsonl');
  formData.append('purpose', 'fine-tune');
  
  const response = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`File upload failed: ${error.error?.message || response.statusText}`);
  }
  
  return response.json();
}

/**
 * ファインチューニングジョブを作成
 */
export async function createFineTuningJob(
  apiKey: string,
  fileId: string,
  suffix?: string
): Promise<FineTuningJob> {
  const response = await fetch('https://api.openai.com/v1/fine_tuning/jobs', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      training_file: fileId,
      model: 'gpt-4o-mini-2024-07-18',
      suffix: suffix || 'stride-prediction',
    }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Fine-tuning job creation failed: ${error.error?.message || response.statusText}`);
  }
  
  return response.json();
}

/**
 * ファインチューニングジョブの状態を取得
 */
export async function getFineTuningJob(
  apiKey: string,
  jobId: string
): Promise<FineTuningJob> {
  const response = await fetch(`https://api.openai.com/v1/fine_tuning/jobs/${jobId}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to get job status: ${error.error?.message || response.statusText}`);
  }
  
  return response.json();
}

/**
 * ファインチューニングジョブ一覧を取得
 */
export async function listFineTuningJobs(
  apiKey: string,
  limit: number = 10
): Promise<{ data: FineTuningJob[] }> {
  const response = await fetch(`https://api.openai.com/v1/fine_tuning/jobs?limit=${limit}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to list jobs: ${error.error?.message || response.statusText}`);
  }
  
  return response.json();
}

/**
 * ファインチューニング済みモデルIDを保存/取得
 */
export async function saveFineTunedModel(modelId: string): Promise<void> {
  const db = getDb();
  await db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('fine_tuned_model', $1, NOW())
    ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
  `).run(modelId);
}

export async function getFineTunedModel(): Promise<string | null> {
  const db = getDb();
  const result = await db.prepare(`
    SELECT value FROM app_settings WHERE key = 'fine_tuned_model'
  `).get<{ value: string }>();
  return result?.value || null;
}

/**
 * コスト見積もり
 */
export function estimateCost(examples: FineTuningExample[]): {
  trainingTokens: number;
  trainingCost: number;
  perRequestCost: number;
} {
  // 概算: 1例あたり約800トークン
  const avgTokensPerExample = 800;
  const trainingTokens = examples.length * avgTokensPerExample;
  
  // GPT-4o-mini fine-tuning: $3.00 / 1M training tokens
  const trainingCost = (trainingTokens / 1_000_000) * 3.00;
  
  // 推論コスト: $0.30 / 1M input + $1.20 / 1M output
  // 1リクエストあたり約6000入力 + 600出力
  const perRequestCost = (6000 / 1_000_000) * 0.30 + (600 / 1_000_000) * 1.20;
  
  return {
    trainingTokens,
    trainingCost: Math.round(trainingCost * 100) / 100,
    perRequestCost: Math.round(perRequestCost * 10000) / 10000,
  };
}
