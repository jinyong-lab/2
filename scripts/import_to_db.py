"""
import_to_db.py - JSON 파일을 SQLite DB로 임포트
Read all parsed JSON files from Makeup/parsed/ and import into the Prisma SQLite database.
Uses raw sqlite3 module (NOT Prisma).
"""

import json
import sqlite3
from pathlib import Path
from datetime import datetime

# Paths
PARSED_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\Makeup\parsed")
DB_PATH = Path(r"C:\Users\HOSEO\Desktop\임용\Makeup\exam.db")

# JSON files to import
JSON_FILES = [
    PARSED_DIR / "formative.json",
    PARSED_DIR / "subnotes.json",
    PARSED_DIR / "education.json",
]


def connect_db() -> sqlite3.Connection:
    """Connect to SQLite database."""
    if not DB_PATH.exists():
        print(f"WARNING: DB file not found at {DB_PATH}")
        print("Creating new DB with schema...")
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    # Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_schema(conn: sqlite3.Connection):
    """Create tables if they don't exist (Prisma may have already created them)."""
    cursor = conn.cursor()

    # Check if tables exist
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='Subject'"
    )
    if cursor.fetchone():
        print("  DB schema already exists (created by Prisma)")
        return

    print("  Creating schema...")
    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS "Subject" (
            "id"       INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "name"     TEXT NOT NULL UNIQUE,
            "category" TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS "Topic" (
            "id"        INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "name"      TEXT NOT NULL,
            "subjectId" INTEGER NOT NULL,
            CONSTRAINT "Topic_subjectId_fkey"
                FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
                ON DELETE RESTRICT ON UPDATE CASCADE,
            UNIQUE ("name", "subjectId")
        );

        CREATE TABLE IF NOT EXISTS "Question" (
            "id"          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "content"     TEXT NOT NULL,
            "modelAnswer" TEXT NOT NULL,
            "type"        TEXT NOT NULL DEFAULT 'essay',
            "source"      TEXT NOT NULL DEFAULT 'formative',
            "difficulty"  INTEGER NOT NULL DEFAULT 3,
            "pageRef"     TEXT,
            "subjectId"   INTEGER NOT NULL,
            "topicId"     INTEGER,
            "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Question_subjectId_fkey"
                FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")
                ON DELETE RESTRICT ON UPDATE CASCADE,
            CONSTRAINT "Question_topicId_fkey"
                FOREIGN KEY ("topicId") REFERENCES "Topic"("id")
                ON DELETE SET NULL ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS "BlankItem" (
            "id"         INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "position"   INTEGER NOT NULL,
            "answer"     TEXT NOT NULL,
            "context"    TEXT NOT NULL,
            "questionId" INTEGER NOT NULL,
            CONSTRAINT "BlankItem_questionId_fkey"
                FOREIGN KEY ("questionId") REFERENCES "Question"("id")
                ON DELETE RESTRICT ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS "Attempt" (
            "id"         INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "questionId" INTEGER NOT NULL,
            "userAnswer" TEXT NOT NULL,
            "score"      INTEGER NOT NULL,
            "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Attempt_questionId_fkey"
                FOREIGN KEY ("questionId") REFERENCES "Question"("id")
                ON DELETE RESTRICT ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS "Bookmark" (
            "id"         INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "questionId" INTEGER NOT NULL,
            "note"       TEXT,
            "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Bookmark_questionId_fkey"
                FOREIGN KEY ("questionId") REFERENCES "Question"("id")
                ON DELETE RESTRICT ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS "Setting" (
            "key"   TEXT NOT NULL PRIMARY KEY,
            "value" TEXT NOT NULL
        );
    """)
    conn.commit()
    print("  Schema created.")


def upsert_subject(conn: sqlite3.Connection, name: str, category: str) -> int:
    """Get or create a subject, return its id."""
    cursor = conn.cursor()
    cursor.execute(
        'SELECT "id" FROM "Subject" WHERE "name" = ?',
        (name,)
    )
    row = cursor.fetchone()
    if row:
        return row["id"]

    cursor.execute(
        'INSERT INTO "Subject" ("name", "category") VALUES (?, ?)',
        (name, category)
    )
    conn.commit()
    return cursor.lastrowid


def upsert_topic(conn: sqlite3.Connection, name: str, subject_id: int) -> int:
    """Get or create a topic, return its id."""
    cursor = conn.cursor()
    cursor.execute(
        'SELECT "id" FROM "Topic" WHERE "name" = ? AND "subjectId" = ?',
        (name, subject_id)
    )
    row = cursor.fetchone()
    if row:
        return row["id"]

    cursor.execute(
        'INSERT INTO "Topic" ("name", "subjectId") VALUES (?, ?)',
        (name, subject_id)
    )
    conn.commit()
    return cursor.lastrowid


def question_exists(conn: sqlite3.Connection, content: str, subject_id: int) -> bool:
    """Check if a question with the same content and subject already exists."""
    cursor = conn.cursor()
    cursor.execute(
        'SELECT "id" FROM "Question" WHERE "content" = ? AND "subjectId" = ?',
        (content, subject_id)
    )
    return cursor.fetchone() is not None


def insert_question(
    conn: sqlite3.Connection,
    content: str,
    model_answer: str,
    q_type: str,
    source: str,
    difficulty: int,
    page_ref: str | None,
    subject_id: int,
    topic_id: int | None,
) -> int:
    """Insert a question and return its id."""
    cursor = conn.cursor()
    cursor.execute(
        '''INSERT INTO "Question"
           ("content", "modelAnswer", "type", "source", "difficulty",
            "pageRef", "subjectId", "topicId", "createdAt")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (
            content,
            model_answer,
            q_type,
            source,
            difficulty,
            page_ref,
            subject_id,
            topic_id,
            datetime.now().isoformat(),
        )
    )
    conn.commit()
    return cursor.lastrowid


def load_json_file(json_path: Path) -> list[dict]:
    """Load and return JSON data from file."""
    if not json_path.exists():
        print(f"  WARNING: JSON file not found: {json_path}")
        return []
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)


def import_questions(conn: sqlite3.Connection, questions: list[dict]) -> dict:
    """
    Import a list of questions into the database.
    Returns stats dict with counts.
    """
    stats = {
        "inserted": 0,
        "skipped_duplicate": 0,
        "skipped_invalid": 0,
        "subjects_created": 0,
        "topics_created": 0,
    }

    # Cache for subject/topic IDs to avoid repeated DB lookups
    subject_cache: dict[str, int] = {}
    topic_cache: dict[tuple, int] = {}  # (topic_name, subject_id) -> id

    # Track how many subjects existed before vs. created
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) FROM "Subject"')
    subjects_before = cursor.fetchone()[0]
    cursor.execute('SELECT COUNT(*) FROM "Topic"')
    topics_before = cursor.fetchone()[0]

    for q in questions:
        # Validate required fields
        content = q.get("question", "").strip()
        answer = q.get("answer", "").strip()
        subject_name = q.get("subject", "").strip()
        category = q.get("category", "교육학").strip()
        source = q.get("source", "formative")
        page_ref = q.get("pageRef")

        if not content or not answer or not subject_name:
            stats["skipped_invalid"] += 1
            continue

        # Get or create subject
        if subject_name not in subject_cache:
            subject_id = upsert_subject(conn, subject_name, category)
            subject_cache[subject_name] = subject_id
        subject_id = subject_cache[subject_name]

        # Skip duplicate questions
        if question_exists(conn, content, subject_id):
            stats["skipped_duplicate"] += 1
            continue

        # Determine topic from set number / source
        topic_id = None
        set_num = q.get("setNumber", 0)
        if set_num:
            topic_name = f"세트 {set_num}"
            cache_key = (topic_name, subject_id)
            if cache_key not in topic_cache:
                tid = upsert_topic(conn, topic_name, subject_id)
                topic_cache[cache_key] = tid
            topic_id = topic_cache[cache_key]

        # Insert question
        insert_question(
            conn=conn,
            content=content,
            model_answer=answer,
            q_type="essay",
            source=source,
            difficulty=3,
            page_ref=page_ref,
            subject_id=subject_id,
            topic_id=topic_id,
        )
        stats["inserted"] += 1

    # Count newly created subjects/topics
    cursor.execute('SELECT COUNT(*) FROM "Subject"')
    subjects_after = cursor.fetchone()[0]
    cursor.execute('SELECT COUNT(*) FROM "Topic"')
    topics_after = cursor.fetchone()[0]

    stats["subjects_created"] = subjects_after - subjects_before
    stats["topics_created"] = topics_after - topics_before

    return stats


def print_db_summary(conn: sqlite3.Connection):
    """Print a summary of what's in the database."""
    cursor = conn.cursor()

    cursor.execute('SELECT COUNT(*) FROM "Subject"')
    subject_count = cursor.fetchone()[0]

    cursor.execute('SELECT COUNT(*) FROM "Topic"')
    topic_count = cursor.fetchone()[0]

    cursor.execute('SELECT COUNT(*) FROM "Question"')
    question_count = cursor.fetchone()[0]

    print(f"\n=== 데이터베이스 현황 ===")
    print(f"  과목 수: {subject_count}개")
    print(f"  토픽 수: {topic_count}개")
    print(f"  문항 수: {question_count}개")

    # Questions by subject
    cursor.execute('''
        SELECT s."name", s."category", COUNT(q."id") as cnt
        FROM "Subject" s
        LEFT JOIN "Question" q ON q."subjectId" = s."id"
        GROUP BY s."id"
        ORDER BY s."category", s."name"
    ''')
    rows = cursor.fetchall()
    if rows:
        print("\n  과목별 문항 수:")
        for row in rows:
            print(f"    [{row['category']}] {row['name']}: {row['cnt']}개")

    # Questions by source
    cursor.execute('''
        SELECT "source", COUNT(*) as cnt
        FROM "Question"
        GROUP BY "source"
        ORDER BY cnt DESC
    ''')
    rows = cursor.fetchall()
    if rows:
        print("\n  출처별 문항 수:")
        for row in rows:
            print(f"    {row['source']}: {row['cnt']}개")


def main():
    print("=" * 60)
    print("JSON → SQLite 데이터베이스 임포트 시작")
    print("=" * 60)

    # Connect to DB
    print(f"\nDB 연결: {DB_PATH}")
    conn = connect_db()

    try:
        # Ensure schema exists
        ensure_schema(conn)

        total_stats = {
            "inserted": 0,
            "skipped_duplicate": 0,
            "skipped_invalid": 0,
            "subjects_created": 0,
            "topics_created": 0,
        }

        # Import each JSON file
        for json_path in JSON_FILES:
            print(f"\n파일 임포트: {json_path.name}")
            questions = load_json_file(json_path)

            if not questions:
                print(f"  데이터 없음, 스킵")
                continue

            print(f"  {len(questions)}개 문항 처리 중...")
            stats = import_questions(conn, questions)

            print(f"  삽입: {stats['inserted']}개")
            print(f"  중복 스킵: {stats['skipped_duplicate']}개")
            print(f"  유효하지 않은 데이터 스킵: {stats['skipped_invalid']}개")
            if stats['subjects_created']:
                print(f"  새 과목 생성: {stats['subjects_created']}개")
            if stats['topics_created']:
                print(f"  새 토픽 생성: {stats['topics_created']}개")

            # Accumulate totals
            for key in total_stats:
                total_stats[key] += stats[key]

        # Print overall summary
        print(f"\n{'=' * 40}")
        print("전체 임포트 결과:")
        print(f"  총 삽입: {total_stats['inserted']}개")
        print(f"  총 중복 스킵: {total_stats['skipped_duplicate']}개")
        print(f"  총 유효하지 않은 데이터 스킵: {total_stats['skipped_invalid']}개")
        print(f"  총 새 과목: {total_stats['subjects_created']}개")
        print(f"  총 새 토픽: {total_stats['topics_created']}개")

        # Print DB summary
        print_db_summary(conn)

    finally:
        conn.close()
        print(f"\nDB 연결 종료: {DB_PATH}")


if __name__ == "__main__":
    main()
