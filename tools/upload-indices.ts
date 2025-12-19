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

// Index folder configuration
const INDEX_FOLDERS = [
  { name: 'L4F', path: 'C:\\競馬データ\\L4F\\2025' },
  { name: 'T2F', path: 'C:\\競馬データ\\T2F\\2025' },
  { name: 'potential', path: 'C:\\競馬データ\\ポテンシャル指数\\2025' },
  { name: 'revouma', path: 'C:\\競馬データ\\レボウマ\\2025' },
  { name: 'makikaeshi', path: 'C:\\競馬データ\\巻き返し指数\\2025' },
  { name: 'cushion', path: 'C:\\競馬データ\\クッション値\\2025' },
];

// API endpoint
const API_URL = 'http://localhost:3000/api/upload-indices';

interface IndexRecord {
  race_id: string;
  [key: string]: string | number | undefined;
}

/**
 * Read all CSV files from a folder and get index data
 */
function readIndexFolder(folderPath: string, indexName: string): Map<string, number> {
  const indexMap = new Map<string, number>();
  
  if (!fs.existsSync(folderPath)) {
    console.warn(`WARNING: Folder not found: ${folderPath}`);
    return indexMap;
  }

  const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.csv'));
  console.log(`[${indexName}] Found ${files.length} CSV files`);

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
 * Upload data to API
 */
async function uploadToApi(data: IndexRecord[]): Promise<void> {
  console.log(`\nUploading data to API...`);
  console.log(`  Endpoint: ${API_URL}`);
  console.log(`  Records: ${data.length}`);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log(`\n*** SUCCESS! ${result.count} records saved ***`);
}

/**
 * Main process
 */
async function main() {
  console.log('============================================================');
  console.log('Horse Racing Index Data Merge & Upload Tool');
  console.log('============================================================');
  console.log();

  // Read data from each index folder
  const indexMaps = new Map<string, Map<string, number>>();
  
  for (const folder of INDEX_FOLDERS) {
    const map = readIndexFolder(folder.path, folder.name);
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

  // Save to CSV file
  const outputCsvPath = path.join(process.cwd(), 'output', 'merged-indices.csv');
  saveToCsv(mergedData, outputCsvPath);

  // Upload to API
  await uploadToApi(mergedData);
}

// Execute
main().catch((error) => {
  console.error('\nERROR:', error.message);
  process.exit(1);
});
