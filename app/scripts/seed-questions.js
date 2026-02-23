/**
 * Seed script for 전문상담교사 임용시험 questions.
 * Inserts questions for under-populated subjects to bring them to 100+ total.
 * Usage: node scripts/seed-questions.js
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'Makeup', 'exam.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Load question sets from data modules
const subject4 = require('./data/subject4');
const subject6 = require('./data/subject6');
const subject7 = require('./data/subject7');
const subject8 = require('./data/subject8');
const subject9 = require('./data/subject9');
const subject10 = require('./data/subject10');
const subject11 = require('./data/subject11');
const subject12 = require('./data/subject12');
const subject13 = require('./data/subject13');
const subject14 = require('./data/subject14');
const subject15 = require('./data/subject15');
const subject16 = require('./data/subject16');
const subject17 = require('./data/subject17');

const allSets = [
  { id: 4, name: '교육의 이해', questions: subject4 },
  { id: 6, name: '교육사회학', questions: subject6 },
  { id: 7, name: '교육심리학', questions: subject7 },
  { id: 8, name: '생활지도와 상담', questions: subject8 },
  { id: 9, name: '교육심리', questions: subject9 },
  { id: 10, name: '상담이론 및 실제', questions: subject10 },
  { id: 11, name: '집단상담', questions: subject11 },
  { id: 12, name: '진로상담', questions: subject12 },
  { id: 13, name: '이상심리학', questions: subject13 },
  { id: 14, name: '발달심리학', questions: subject14 },
  { id: 15, name: '학교상담', questions: subject15 },
  { id: 16, name: '심리측정 및 평가', questions: subject16 },
  { id: 17, name: '학습심리학', questions: subject17 },
];

// Prepared statements
const countStmt = db.prepare('SELECT COUNT(*) AS cnt FROM Question WHERE subjectId = ?');
const checkDup = db.prepare('SELECT COUNT(*) AS cnt FROM Question WHERE content = ? AND subjectId = ?');
const insertStmt = db.prepare(`
  INSERT INTO Question (content, modelAnswer, type, source, difficulty, subjectId, createdAt)
  VALUES (?, ?, ?, 'template', ?, ?, datetime('now'))
`);

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
    console.log(`[${set.name}] Before: ${before}, Inserted: ${inserted}, Skipped: ${skipped}, After: ${after}`);
    totalInserted += inserted;
    totalSkipped += skipped;
  }
});

try {
  insertAll();
  console.log(`\nDone! Total inserted: ${totalInserted}, Total skipped (duplicates): ${totalSkipped}`);
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
} finally {
  db.close();
}
