/**
 * データベーススキーマ確認API
 * 
 * テーブルのカラム一覧を取得して、カラム名の不一致を特定しやすくする
 * 管理者のみアクセス可能
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isAdminRequest } from '@/lib/auth-check';

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

interface TableSchema {
  tableName: string;
  columns: ColumnInfo[];
  sampleData?: Record<string, unknown>;
}

// 許可されたテーブル一覧（ホワイトリスト）
const ALLOWED_TABLES = [
  'umadata',
  'wakujun',
  'indices',
  'users',
  'predictions',
  'user_horse_marks',
  'race_memos',
  'baba_memos',
  'saga_analysis_cache',
  'race_pace_cache',
  'race_levels',
  'accounts',
  'sessions',
  'subscriptions',
  'user_points',
  'point_history',
  'user_badges',
  'login_history',
  'favorite_horses',
  'prediction_likes',
  'notifications',
  'races',
  'umaren',
  'wide',
];

export async function GET(req: NextRequest) {
  // 管理者認証チェック
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const tableName = searchParams.get('table');

    // 特定のテーブルのみ取得
    if (tableName) {
      // ホワイトリスト検証（SQLインジェクション対策）
      if (!ALLOWED_TABLES.includes(tableName)) {
        return NextResponse.json({ 
          error: 'Invalid table name',
          allowed: ALLOWED_TABLES 
        }, { status: 400 });
      }
      const schema = await getTableSchema(db, tableName);
      return NextResponse.json({
        success: true,
        table: schema,
      });
    }

    // 全テーブルのスキーマを取得
    const schemas: TableSchema[] = [];
    
    for (const table of ALLOWED_TABLES) {
      try {
        const schema = await getTableSchema(db, table);
        schemas.push(schema);
      } catch (error) {
        schemas.push({
          tableName: table,
          columns: [],
          sampleData: { error: `テーブルが存在しないか、アクセスできません: ${error instanceof Error ? error.message : 'Unknown'}` },
        });
      }
    }

    // よく使うカラムマッピングの推奨
    const columnMappingGuide = {
      'umadata': {
        '馬番': 'umaban',
        '馬名': 'horse_name または umamei',
        'レースID': 'race_id',
        '着順': 'finish_position',
        '距離': 'distance',
        '場所': 'place',
      },
      'wakujun': {
        '馬番': 'umaban',
        '馬名': 'umamei',
        'レース番号': 'race_number',
      },
      'indices': {
        'レースID(馬番込み)': 'race_id (16桁 + 馬番2桁 = 18桁)',
        '後半4F': '"L4F" (大文字、クォート必須)',
        '前半2F': '"T2F" (大文字、クォート必須)',
        'ポテンシャル': 'potential',
        '巻き返し': 'makikaeshi',
        'レボウマ': 'revouma',
        'クッション': 'cushion',
      },
    };

    return NextResponse.json({
      success: true,
      tables: schemas,
      columnMappingGuide,
      note: '?table=umadata などでテーブル指定可能',
    });
  } catch (error) {
    console.error('[schema-check] Error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

async function getTableSchema(db: ReturnType<typeof getDb>, tableName: string): Promise<TableSchema> {
  // 注意: tableNameは呼び出し元でALLOWED_TABLESに対して検証済み
  
  // PostgreSQLのinformation_schemaからカラム情報を取得
  const columns = await db.prepare(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = $1
    ORDER BY ordinal_position
  `).all(tableName) as ColumnInfo[];

  // サンプルデータを1件取得（テーブル名は検証済み）
  let sampleData: Record<string, unknown> | undefined;
  try {
    // テーブル名をダブルクォートでエスケープ（PostgreSQL識別子）
    const sample = await db.prepare(`SELECT * FROM "${tableName}" LIMIT 1`).get();
    sampleData = sample as Record<string, unknown>;
  } catch {
    // サンプル取得失敗は無視
  }

  return {
    tableName,
    columns,
    sampleData,
  };
}
