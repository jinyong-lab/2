/**
 * Supplemental seed script to bring ALL subjects (2-17) to 110+ questions.
 * Usage: node scripts/seed-supplement.js
 *
 * This script loads question data from ./data/supplement-*.js files
 * and inserts them into the exam.db database with duplicate checking.
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'Makeup', 'exam.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// ── Load all supplement data files ──────────────────────────────────

// Subjects 2-5 (extracted from inline data)
const s2 = require('./data/supplement-s2.js');
const s3 = require('./data/supplement-s3.js');
const s4 = require('./data/supplement-s4.js');
const s5 = require('./data/supplement-s5.js');

// Subjects 6-9
const s6 = require('./data/supplement-s6.js');
const s7 = require('./data/supplement-s7.js');
const s7e = require('./data/supplement-s7-extra.js');
const s8 = require('./data/supplement-s8.js');
const s8e = require('./data/supplement-s8-extra.js');
const s9 = require('./data/supplement-s9.js');
const s9e = require('./data/supplement-s9-extra.js');

// Subjects 10-12
const s10 = require('./data/supplement-s10.js');
const s10e = require('./data/supplement-s10-extra.js');
const s11 = require('./data/supplement-s11.js');
const s11e = require('./data/supplement-s11-extra.js');
const s11e2 = require('./data/supplement-s11-extra2.js');
const s12 = require('./data/supplement-s12.js');
const s12e = require('./data/supplement-s12-extra.js');
const s12e2 = require('./data/supplement-s12-extra2.js');

// Subjects 13-17
const s13 = require('./data/supplement-s13.js');
const s14 = require('./data/supplement-s14.js');
const s14e = require('./data/supplement-s14-extra.js');
const s15 = require('./data/supplement-s15.js');
const s16 = require('./data/supplement-s16.js');
const s17 = require('./data/supplement-s17.js');

// ── Combine data per subject ────────────────────────────────────────

const allSets = [
  { id: 2, name: '교육방법 및 공학', questions: [...s2] },
  { id: 3, name: '교육평가', questions: [...s3] },
  { id: 4, name: '교육의 이해', questions: [...s4] },
  { id: 5, name: '교육행정', questions: [...s5] },
  { id: 6, name: '교육사회학', questions: [...s6] },
  { id: 7, name: '교육심리학', questions: [...s7, ...s7e] },
  { id: 8, name: '생활지도와 상담', questions: [...s8, ...s8e] },
  { id: 9, name: '교육심리', questions: [...s9, ...s9e] },
  { id: 10, name: '상담이론 및 실제', questions: [...s10, ...s10e] },
  { id: 11, name: '집단상담', questions: [...s11, ...s11e, ...s11e2] },
  { id: 12, name: '진로상담', questions: [...s12, ...s12e, ...s12e2] },
  { id: 13, name: '이상심리학', questions: [...s13] },
  { id: 14, name: '발달심리학', questions: [...s14, ...s14e] },
  { id: 15, name: '학교상담', questions: [...s15] },
  { id: 16, name: '심리측정 및 평가', questions: [...s16] },
  { id: 17, name: '학습심리학', questions: [...s17] },
];

// ── Prepared statements ─────────────────────────────────────────────

const countStmt = db.prepare('SELECT COUNT(*) AS cnt FROM Question WHERE subjectId = ?');
const checkDup = db.prepare('SELECT COUNT(*) AS cnt FROM Question WHERE content = ? AND subjectId = ?');
const insertStmt = db.prepare(`
  INSERT INTO Question (content, modelAnswer, type, source, difficulty, subjectId, createdAt)
  VALUES (?, ?, ?, 'template', ?, ?, datetime('now'))
`);

// ── Execute insertion in a transaction ──────────────────────────────

let totalInserted = 0;
let totalSkipped = 0;

const insertAll = db.transaction(() => {
  for (const set of allSets) {
    const before = countStmt.get(set.id).cnt;
    let inserted = 0;
    let skipped = 0;

    for (const q of set.questions) {
      const exists = checkDup.get(q.content, set.id).cnt;
      if (exists > 0) {
        skipped++;
        continue;
      }
      insertStmt.run(q.content, q.modelAnswer, q.type, q.difficulty, set.id);
      inserted++;
    }

    const after = countStmt.get(set.id).cnt;
    console.log(`[Subject ${set.id}: ${set.name}] Before: ${before}, Inserted: ${inserted}, Skipped: ${skipped}, After: ${after}`);
    totalInserted += inserted;
    totalSkipped += skipped;
  }
});

try {
  console.log('=== Supplemental Question Seeding ===');
  console.log(`Database: ${dbPath}\n`);
  insertAll();
  console.log(`\nDone! Total inserted: ${totalInserted}, Total skipped (duplicates): ${totalSkipped}`);

  // Print final summary
  console.log('\n=== Final Question Counts ===');
  for (const set of allSets) {
    const count = countStmt.get(set.id).cnt;
    const status = count >= 110 ? 'OK' : count >= 100 ? 'ok' : 'LOW';
    console.log(`  Subject ${set.id} (${set.name}): ${count} [${status}]`);
  }
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
} finally {
  db.close();
}
