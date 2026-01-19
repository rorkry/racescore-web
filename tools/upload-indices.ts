/**
 * Index CSV File Merge & Upload Tool
 * 
 * Usage:
 *   npx ts-node tools/upload-indices.ts
 * 
 * Or double-click sync-indices.bat on Windows
 */

import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

// Index folder configuration (base paths - year folders will be auto-detected)
const INDEX_BASE_FOLDERS = [
  { name: 'L4F', basePath: 'C:\\競馬データ\\L4F' },
  { name: 'T2F', basePath: 'C:\\競馬データ\\T2F' },
  { name: 'potential', basePath: 'C:\\競馬データ\\ポテンシャル指数' },
  { name: 'revouma', basePath: 'C:\\競馬データ\\レボウマ' },
  { name: 'makikaeshi', basePath: 'C:\\競馬データ\\巻き返し指数' },
  { name: 'cushion', basePath: 'C:\\競馬データ\\クッション値' },
];

/**
 * Get recent year folders from a base path
 * Limited to 2024+ to save database storage
 */
const MIN_YEAR = 2024; // 2024年以降のデータのみ（ストレージ節約）

function getYearFolders(basePath: string): string[] {
  if (!fs.existsSync(basePath)) {
    return [];
  }
  
  const entries = fs.readdirSync(basePath, { withFileTypes: true });
  const yearFolders = entries
    .filter(e => e.isDirectory() && /^\d{4}$/.test(e.name))
    .filter(e => parseInt(e.name, 10) >= MIN_YEAR) // 2024年以降のみ
    .map(e => path.join(basePath, e.name))
    .sort();
  
  return yearFolders;
}

// API endpoint - Railway production or local
const RAILWAY_URL = 'https://racescore-web-production.up.railway.app';
const DEFAULT_PORT = process.env.PORT || '3000';

// 環境変数 USE_RAILWAY=true でRailwayにアップロード
const useRailway = process.env.USE_RAILWAY === 'true';
const API_URL = useRailway 
  ? `${RAILWAY_URL}/api/upload-indices`
  : `http://localhost:${DEFAULT_PORT}/api/upload-indices`;

console.log(`Using API endpoint: ${API_URL}`);
console.log(`Mode: ${useRailway ? 'RAILWAY (Production)' : 'LOCAL (Development)'}`);

interface IndexRecord {
  race_id: string;
  [key: string]: string | number | undefined;
}

/**
 * Read all CSV files from a single folder and get index data
 */
function readCsvFilesFromFolder(folderPath: string): Map<string, number> {
  const indexMap = new Map<string, number>();
  
  if (!fs.existsSync(folderPath)) {
    return indexMap;
  }

  const files = fs.readdirSync(folderPath).filter(f => 
    f.endsWith('.csv') && !f.includes('作成用')
  );

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Parse CSV (no header)
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

  return indexMap;
}

/**
 * Read all CSV files from base folder (including all year subfolders)
 */
function readIndexFolder(basePath: string, indexName: string): Map<string, number> {
  const indexMap = new Map<string, number>();
  
  if (!fs.existsSync(basePath)) {
    console.warn(`WARNING: Base folder not found: ${basePath}`);
    return indexMap;
  }

  // Get all year folders
  const yearFolders = getYearFolders(basePath);
  
  if (yearFolders.length === 0) {
    // If no year folders, try reading CSVs directly from base folder
    console.log(`[${indexName}] No year folders found, reading from base folder`);
    const directMap = readCsvFilesFromFolder(basePath);
    for (const [key, value] of directMap) {
      indexMap.set(key, value);
    }
  } else {
    // Read from each year folder
    const years = yearFolders.map(f => path.basename(f)).join(', ');
    console.log(`[${indexName}] Found year folders: ${years}`);
    
    let totalFiles = 0;
    for (const yearFolder of yearFolders) {
      const files = fs.readdirSync(yearFolder).filter(f => 
        f.endsWith('.csv') && !f.includes('作成用')
      );
      totalFiles += files.length;
      
      const yearMap = readCsvFilesFromFolder(yearFolder);
      for (const [key, value] of yearMap) {
        indexMap.set(key, value);
      }
    }
    console.log(`  -> ${totalFiles} CSV files found`);
  }

  console.log(`  -> ${indexMap.size} records loaded`);
  return indexMap;
}

/**
 * Merge all index data horizontally
 */
function mergeIndices(indexMaps: Map<string, Map<string, number>>): IndexRecord[] {
  // Collect all race_ids
  const allRaceIds = new Set<string>();
  for (const [, map] of indexMaps) {
    for (const raceId of map.keys()) {
      allRaceIds.add(raceId);
    }
  }

  console.log(`\nTotal ${allRaceIds.size} unique race_ids found`);

  // Create merged records
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
 * Save merged data to CSV file
 */
function saveToCsv(data: IndexRecord[], outputPath: string): void {
  console.log(`\nSaving merged data to CSV...`);
  console.log(`  Output: ${outputPath}`);

  // Create header
  const headers = ['race_id', 'L4F', 'T2F', 'potential', 'revouma', 'makikaeshi', 'cushion'];
  
  // Create CSV content
  const rows = data.map(record => {
    return headers.map(h => {
      const value = record[h];
      return value !== undefined ? String(value) : '';
    }).join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, csvContent, 'utf-8');
  console.log(`  -> ${data.length} records saved to CSV`);
}

/**
 * Upload data to API in batches
 */
async function uploadToApi(data: IndexRecord[]): Promise<void> {
  console.log(`\nUploading data to API...`);
  console.log(`  Endpoint: ${API_URL}`);
  console.log(`  Total Records: ${data.length}`);

  const BATCH_SIZE = 5000; // 5000件ずつアップロード
  const totalBatches = Math.ceil(data.length / BATCH_SIZE);
  let uploadedCount = 0;

  for (let i = 0; i < totalBatches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, data.length);
    const batch = data.slice(start, end);

    console.log(`\n  Batch ${i + 1}/${totalBatches}: ${batch.length} records (${start + 1}-${end})`);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: batch }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`  ERROR: ${response.status} - ${errorText}`);
        // エラーでも続行（部分的にでもアップロードする）
        continue;
      }

      const result = await response.json();
      uploadedCount += result.count || batch.length;
      console.log(`  -> ${result.count || batch.length} records saved`);
      
      // レート制限を避けるため少し待機
      if (i < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`  ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`);
      // エラーでも続行
    }
  }

  console.log(`\n*** DONE! Total ${uploadedCount} records uploaded ***`);
}

/**
 * Main process
 */
async function main() {
  console.log('============================================================');
  console.log('Horse Racing Index Data Merge & Upload Tool');
  console.log('============================================================');
  console.log();

  // Read data from each index folder (auto-detecting year subfolders)
  const indexMaps = new Map<string, Map<string, number>>();
  
  for (const folder of INDEX_BASE_FOLDERS) {
    const map = readIndexFolder(folder.basePath, folder.name);
    indexMaps.set(folder.name, map);
  }

  // Merge data
  const mergedData = mergeIndices(indexMaps);

  if (mergedData.length === 0) {
    console.log('\nWARNING: No data to upload');
    return;
  }

  // Show sample data
  console.log('\nSample data (first 3 records):');
  for (const record of mergedData.slice(0, 3)) {
    console.log(JSON.stringify(record, null, 2));
  }

  // Save to CSV file (to Downloads folder)
  const userHome = process.env.USERPROFILE || process.env.HOME || '';
  const outputCsvPath = path.join(userHome, 'Downloads', 'merged-indices.csv');
  saveToCsv(mergedData, outputCsvPath);

  // Upload to API
  await uploadToApi(mergedData);
}

// Execute
main().catch((error) => {
  console.error('\nERROR:', error.message);
  process.exit(1);
});
