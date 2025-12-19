import Database from 'better-sqlite3';

const db = new Database('./races.db');

// umadataテーブルのみを作成（既存のテーブルは変更しない）
const createUmadataTable = `
CREATE TABLE IF NOT EXISTS umadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  race_id_new_no_horse_num TEXT,
  date TEXT,
  distance TEXT,
  horse_number TEXT,
  horse_name TEXT,
  index_value TEXT,
  class_name TEXT,
  track_condition TEXT,
  finish_position TEXT,
  last_3f TEXT,
  finish_time TEXT,
  standard_time TEXT,
  rpci TEXT,
  pci TEXT,
  good_run TEXT,
  pci3 TEXT,
  horse_mark TEXT,
  corner_2 TEXT,
  corner_3 TEXT,
  corner_4 TEXT,
  gender TEXT,
  age TEXT,
  horse_weight TEXT,
  weight_change TEXT,
  jockey_weight TEXT,
  jockey TEXT,
  multiple_entries TEXT,
  affiliation TEXT,
  trainer TEXT,
  place TEXT,
  number_of_horses TEXT,
  popularity TEXT,
  sire TEXT,
  dam TEXT,
  track_condition_2 TEXT,
  place_2 TEXT,
  margin TEXT,
  corner_1 TEXT,
  corner_2_2 TEXT,
  corner_3_2 TEXT,
  corner_4_2 TEXT,
  work_1s TEXT,
  horse_mark_2 TEXT,
  horse_mark_3 TEXT,
  horse_mark_4 TEXT,
  horse_mark_5 TEXT,
  horse_mark_6 TEXT,
  horse_mark_7 TEXT,
  horse_mark_7_2 TEXT,
  horse_mark_8 TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`;

db.exec(createUmadataTable);

console.log('✅ umadataテーブルを作成しました');

db.close();
