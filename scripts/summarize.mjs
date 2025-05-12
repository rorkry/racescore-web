// scripts/summarize.mjs
import fs from 'fs';
import { marked } from 'marked';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Chat ログを読み取る（今回は markdown ファイルを想定）
const log = fs.readFileSync(process.argv[2] ?? './chat.md', 'utf8');

// Markdown → プレーンテキスト（コード・引用を除去）
const plain = marked.parse(log).replace(/<[^>]+>/g, '');

const resp = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'あなたは優秀なソフトウェアアーキテクトです。' },
    { role: 'user',   content: `次の会話を箇条書きで要約してください:\n\n${plain}` }
  ],
});

console.log(resp.choices[0].message.content.trim());