/**
 * 指数CSVファイル結合・アップロードツール（テスト版）
 * 
 * テスト用のローカルフォルダを使用
 */

import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

// テスト用指数フォルダの設定
const INDEX_FOLDERS = [
  { name: 'L4F', path: './test-data/L4F' },
  { name: 'T2F', path: './test-data/T2F' },
  { name: 'ポテンシャル指数', path: './test-data/potential' },
  { name: 'レボウマ', path: './test-data/revouma' },
  { name: '巻き返し指数', path: './test-data/makikaeshi' },
  { name: 'クッション値', path: './test-data/cushion' },
];

// APIエンドポイント
const API_URL = 'http://localhost:3001/api/upload-indices';

interface IndexRecord {
  race_id: string;
  [key: string]: string | number | undefined;
}

/**
 * フォルダ内の全CSVファイルを読み込んで指数データを取得
 */
function readIndexFolder(folderPath: string, indexName: string): Map<string, number> {
  const indexMap = new Map<string, number>();
  
  if (!fs.existsSync(folderPath)) {
    console.warn(`⚠️ フォルダが見つかりません: ${folderPath}`);
    return indexMap;
  }

  const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.csv'));
  console.log(`📁 ${indexName}: ${files.length}個のCSVファイルを検出`);

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // CSVをパース（ヘッダーなし）
    const result = Papa.parse(content, {
      header: false,
      skipEmptyLines: true,
    });

    for (const row of result.data as string[][]) {
      if (row.length >= 2) {
        const raceId = row[0]?.trim();
        const value = parseFloat(row[1]);
        
        if (raceId && !isNaN(value)) {
          indexMap.set(raceId, value);
        }
      }
    }
  }

  console.log(`   → ${indexMap.size}件のレコードを読み込み`);
  return indexMap;
}

/**
 * 全指数データを横方向にマージ
 */
function mergeIndices(indexMaps: Map<string, Map<string, number>>): IndexRecord[] {
  // 全race_idを収集
  const allRaceIds = new Set<string>();
  for (const [, map] of indexMaps) {
    for (const raceId of map.keys()) {
      allRaceIds.add(raceId);
    }
  }

  console.log(`\n📊 合計 ${allRaceIds.size} 件のユニークなrace_idを検出`);

  // マージしたレコードを作成
  const records: IndexRecord[] = [];
  for (const raceId of allRaceIds) {
    const record: IndexRecord = { race_id: raceId };
    
    for (const [indexName, map] of indexMaps) {
      const value = map.get(raceId);
      if (value !== undefined) {
        record[indexName] = value;
      }
    }
    
    records.push(record);
  }

  return records;
}

/**
 * APIにデータをアップロード
 */
async function uploadToApi(data: IndexRecord[]): Promise<void> {
  console.log(`\n🚀 APIにデータをアップロード中...`);
  console.log(`   エンドポイント: ${API_URL}`);
  console.log(`   データ件数: ${data.length}`);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`APIエラー: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log(`\n✅ Success! ${result.message}`);
}

/**
 * メイン処理
 */
async function main() {
  console.log('='.repeat(60));
  console.log('🏇 競馬指数データ 結合・アップロードツール（テスト版）');
  console.log('='.repeat(60));
  console.log();

  // 各指数フォルダからデータを読み込み
  const indexMaps = new Map<string, Map<string, number>>();
  
  for (const folder of INDEX_FOLDERS) {
    const map = readIndexFolder(folder.path, folder.name);
    indexMaps.set(folder.name, map);
  }

  // データをマージ
  const mergedData = mergeIndices(indexMaps);

  if (mergedData.length === 0) {
    console.log('\n⚠️ アップロードするデータがありません');
    return;
  }

  // サンプルデータを表示
  console.log('\n📋 サンプルデータ（最初の3件）:');
  for (const record of mergedData.slice(0, 3)) {
    console.log(JSON.stringify(record, null, 2));
  }

  // APIにアップロード
  await uploadToApi(mergedData);
}

// 実行
main().catch((error) => {
  console.error('\n❌ エラーが発生しました:', error.message);
  process.exit(1);
});
