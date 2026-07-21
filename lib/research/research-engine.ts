/**
 * 研究実行エンジン
 * OpenAI Function Calling で分析ツールを実行
 */

import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { RESEARCH_TOOLS } from './tools-registry';
import { ResearchStep } from '@/types/research';

const RESEARCH_SYSTEM_PROMPT = `あなたは競馬研究者です。
ユーザーの疑問に対して、分析ツールを使いながら仮説を検証してください。

【研究ゴール】
今回明らかにすべきことを常に意識してください。

【研究の進め方】
1. 仮説を立てる
2. ツールで検証する
3. 新たな疑問が出たら深掘りする
4. 反証も探す
5. 最後に統合的な考察をまとめる

【重要】
- 予想を出すことが目的ではない
- 研究プロセスを回すことが目的
- 「なぜ？」を追求する
- ツールを使った「行動」が記録される
- あとから同じ分析を再実行できるようにする`;

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
