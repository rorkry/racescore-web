/**
 * 研究実行エンジン
 * OpenAI Function Calling で分析ツールを実行
 */

import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { RESEARCH_TOOLS } from './tools-registry';
import { ResearchStep } from '@/types/research';

const RESEARCH_SYSTEM_PROMPT = `あなたは競馬研究者です。
ユーザーの疑問に対して、分析ツールを使いながら**期待値のある条件**を見つけてください。

【研究ゴール】
「勝てる条件」ではなく「期待値がある条件」を抽出する

【期待値評価の基準】
すべての分析結果には競争成績と投資成績が含まれます。以下の基準で評価してください：

1. **再現性重視**
   - サンプル数が十分（最低30、理想は100以上）
   - 好走率（三着内率）が一定以上（15%以上を推奨）
   - 平均着順が妥当な範囲

2. **収益性重視**
   - 単勝・複勝回収率がプラス
   - ただし回収率だけが異常に高い場合は警戒（一撃依存の可能性）

3. **安定性重視**
   - 好走率と回収率のバランスが取れている
   - 例: サンプル100、三着内率5%、単勝回収率180% → 一撃依存で低評価
   - 例: サンプル80、三着内率35%、単勝回収率110% → 安定して高評価

【評価すべき指標】
- performance_score.total_score: 総合スコア（80以上が優秀、60以上が実用的）
- performance_score.evaluation: 評価コメント
- competition_performance.show_rate: 三着内率（再現性の指標）
- investment_performance.win_return_rate: 単勝回収率（収益性の指標）

【研究の進め方】
1. 仮説を立てる
2. ツールで検証し、スコアを確認
3. スコアが低い場合は理由を分析（サンプル不足？一撃依存？）
4. 新たな角度から検証
5. 最終的に「期待値がある条件」を特定

【重要】
- 単に成績が良いだけでは不十分
- 再現性と安定性を重視
- 一撃依存のパターンは明確に指摘
- 「この条件なら期待値がある」と言えるまで深掘りする`;

export async function runResearch(
  sessionId: string,
  question: string,
  goal: string,
  context: any,
  apiKey: string
): Promise<ResearchStep[]> {
  const openai = new OpenAI({ apiKey });
  const steps: ResearchStep[] = [];
  
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
    { role: 'user', content: `
【研究ゴール】${goal}

【疑問】${question}

【コンテキスト】${JSON.stringify(context)}
` }
  ];
  
  let stepNumber = 0;
  const MAX_STEPS = 10;  // 無限ループ防止
  
  while (stepNumber < MAX_STEPS) {
    stepNumber++;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: RESEARCH_TOOLS,
      tool_choice: 'auto'
    });
    
    const message = response.choices[0].message;
    
    // ツール呼び出しがない場合は終了
    if (!message.tool_calls || message.tool_calls.length === 0) {
      messages.push(message);
      break;
    }
    
    messages.push(message);
    
    // 各ツール呼び出しを実行
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const toolInput = JSON.parse(toolCall.function.arguments);
      
      // ツール実行
      const startTime = Date.now();
      const toolOutput = await executeToolFunction(toolName, toolInput);
      const executionTime = Date.now() - startTime;
      
      // 行動ログを記録（シンプル + バージョニング）
      const step: ResearchStep = {
        id: `${sessionId}_step${stepNumber}_${toolCall.id}`,
        sessionId,
        stepNumber,
        toolName: toolName as any,
        toolVersion: '1.0',  // 現在のツールバージョン
        toolInput,
        toolOutput,  // schema_version を含む
        executedAt: new Date(),
        executionTimeMs: executionTime
      };
      
      steps.push(step);
      
      // ツール結果をメッセージに追加
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolOutput)
      });
    }
  }
  
  return steps;
}

async function executeToolFunction(toolName: string, input: any): Promise<any> {
  // 各ツールのAPIエンドポイントを呼び出し
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const toolPath = toolName.replace(/_/g, '/');
  
  try {
    const response = await fetch(`${baseUrl}/api/ai-tools/${toolPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    
    if (!response.ok) {
      return {
        schema_version: '1.0',
        error: `HTTP ${response.status}`,
        summary: `ツール実行エラー: ${response.statusText}`
      };
    }
    
    return await response.json();
  } catch (error) {
    return {
      schema_version: '1.0',
      error: 'Fetch failed',
      summary: `ツール実行エラー: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}
