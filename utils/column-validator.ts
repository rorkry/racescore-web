/**
 * カラム名検証ユーティリティ
 * 
 * データベースの結果オブジェクトに期待するカラムが存在するか検証し、
 * 不一致があれば詳細なエラー情報を返す
 */

export interface ColumnValidationResult {
  isValid: boolean;
  missingColumns: string[];
  availableColumns: string[];
  suggestion?: string;
}

/**
 * オブジェクトに期待するカラムが存在するか検証
 * 
 * @param row データベースから取得した行オブジェクト
 * @param expectedColumns 期待するカラム名の配列
 * @returns 検証結果
 */
export function validateColumns(
  row: Record<string, unknown> | null | undefined,
  expectedColumns: string[]
): ColumnValidationResult {
  if (!row) {
    return {
      isValid: false,
      missingColumns: expectedColumns,
      availableColumns: [],
      suggestion: 'データが取得できませんでした',
    };
  }

  const availableColumns = Object.keys(row);
  const missingColumns = expectedColumns.filter(col => !(col in row));

  if (missingColumns.length === 0) {
    return {
      isValid: true,
      missingColumns: [],
      availableColumns,
    };
  }

  // 類似カラム名の提案を生成
  const suggestions = missingColumns.map(missing => {
    const similar = findSimilarColumn(missing, availableColumns);
    return similar ? `${missing} → ${similar}?` : missing;
  });

  return {
    isValid: false,
    missingColumns,
    availableColumns,
    suggestion: `カラム名の不一致: ${suggestions.join(', ')}`,
  };
}

/**
 * 類似したカラム名を探す（Levenshtein距離ベース）
 */
function findSimilarColumn(target: string, candidates: string[]): string | null {
  const targetLower = target.toLowerCase();
  
  // 完全一致（大文字小文字の違いのみ）
  const exactMatch = candidates.find(c => c.toLowerCase() === targetLower);
  if (exactMatch) return exactMatch;

  // 部分一致
  const partialMatch = candidates.find(c => 
    c.toLowerCase().includes(targetLower) || 
    targetLower.includes(c.toLowerCase())
  );
  if (partialMatch) return partialMatch;

  // よくある置換パターン
  const commonMappings: Record<string, string[]> = {
    'horse_number': ['umaban', '馬番'],
    'horse_name': ['umamei', '馬名'],
    'race_id_new_no_horse_num': ['race_id', 'raceId'],
    'finish_position': ['着順', 'position'],
    'class_name': ['クラス名', 'grade'],
    'track_condition': ['馬場状態', 'condition'],
    'distance': ['距離'],
    'place': ['場所', '競馬場'],
    'date': ['日付'],
    'jockey': ['騎手'],
    'trainer': ['調教師'],
    'sire': ['種牡馬', '父'],
    'dam': ['母馬', '母'],
    'L4F': ['l4f', 'L4f'],
    'T2F': ['t2f', 'T2f'],
    'makikaeshi': ['巻き返し', '巻き返し指数'],
    'potential': ['ポテンシャル', 'ポテンシャル指数'],
    'revouma': ['レボウマ'],
    'cushion': ['クッション', 'クッション値'],
  };

  // マッピングから候補を探す
  for (const [key, aliases] of Object.entries(commonMappings)) {
    if (key === target || aliases.includes(target)) {
      const found = candidates.find(c => 
        c === key || aliases.includes(c) || 
        c.toLowerCase() === key.toLowerCase()
      );
      if (found) return found;
    }
  }

  return null;
}

/**
 * 検証エラーをフォーマット
 */
export function formatValidationError(
  tableName: string,
  result: ColumnValidationResult
): string {
  return [
    `[カラム不一致] ${tableName}テーブル`,
    `  不足: ${result.missingColumns.join(', ')}`,
    `  利用可能: ${result.availableColumns.slice(0, 20).join(', ')}${result.availableColumns.length > 20 ? '...' : ''}`,
    result.suggestion ? `  提案: ${result.suggestion}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * 複数行の最初の行でカラムを検証
 */
export function validateFirstRow(
  rows: unknown[] | null | undefined,
  expectedColumns: string[],
  tableName: string = 'unknown'
): { valid: boolean; error?: string } {
  if (!rows || rows.length === 0) {
    return { valid: true }; // データがない場合はスキップ
  }

  const firstRow = rows[0] as Record<string, unknown>;
  const result = validateColumns(firstRow, expectedColumns);

  if (result.isValid) {
    return { valid: true };
  }

  return {
    valid: false,
    error: formatValidationError(tableName, result),
  };
}

/**
 * デバッグ用: テーブルのカラム一覧を取得するSQL（PostgreSQL）
 */
export function getColumnsQuery(tableName: string): string {
  return `
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = '${tableName}'
    ORDER BY ordinal_position
  `;
}
