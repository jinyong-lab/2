"""
reimport_all.py
D1에서 갱신 대상 소스를 삭제하고 JSON에서 재임포트한다.
대상: formative, mindmap, fill-in/subnote, multiple-choice/subnote
"""
import sys
import json
import subprocess
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

APP_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\app")
WRANGLER = str(APP_DIR / "node_modules" / ".bin" / "wrangler.cmd")
DB_NAME = "exam-db"
PARSED_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\Makeup\parsed")

# subject name → D1 subjectId (교육학 과목)
FORMATIVE_SUBJECT_MAP = {
    "교육의 이해": 4, "교육과정": 1, "교육방법 및 공학": 2,
    "교육평가": 3, "교육행정": 5, "교육사회학": 6, "교육심리학": 7,
    "생활지도와 상담": 8, "기타": 1,
}


def content_to_sql_expr(text: str) -> str:
    text = text.replace('\x00', '').replace("'", "''")
    if '\n' not in text:
        return f"'{text}'"
    parts = text.split('\n')
    return " || char(10) || ".join(f"'{p}'" for p in parts)


def execute_file(sql: str) -> bool:
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False, encoding='utf-8') as f:
        f.write(sql)
        tmp = f.name
    try:
        result = subprocess.run(
            [WRANGLER, "d1", "execute", DB_NAME, "--remote", f"--file={tmp}"],
            capture_output=True, text=True, cwd=str(APP_DIR), encoding='utf-8'
        )
        if result.returncode != 0:
            print(f"    ERR: {result.stderr[:200]}")
        return result.returncode == 0
    finally:
        Path(tmp).unlink(missing_ok=True)


def batch_import(inserts: list[str], label: str):
    BATCH = 50
    batches = [inserts[i:i+BATCH] for i in range(0, len(inserts), BATCH)]
    success = 0
    for i, batch in enumerate(batches, 1):
        ok = execute_file("\n".join(batch))
        if ok:
            success += len(batch)
            if i % 5 == 0 or i == len(batches):
                print(f"    {label} 배치 {i}/{len(batches)} ({success}/{len(inserts)})")
        else:
            print(f"    {label} 배치 {i} 실패!")
    print(f"  {label}: {success}/{len(inserts)} 완료")
    return success


def make_insert(content, answer, qtype, source, difficulty, subject_id, page_ref=""):
    c = content_to_sql_expr(content)
    a = content_to_sql_expr(answer)
    pr = (page_ref or "").replace("'", "''").replace('\x00', '')
    return (
        f"INSERT INTO Question "
        f"(content, modelAnswer, type, source, difficulty, subjectId, pageRef, createdAt) "
        f"VALUES ({c}, {a}, '{qtype}', '{source}', {difficulty}, {subject_id}, '{pr}', datetime('now'));"
    )


def main():
    print("=" * 60)
    print("D1 전체 재임포트")
    print("=" * 60)

    # ── 1. 삭제 (FK 제약 처리) ──
    print("\n[1] 기존 데이터 삭제")
    deletes = [
        "DELETE FROM Attempt WHERE questionId IN (SELECT id FROM Question WHERE source IN ('formative','mindmap','subnote'));",
        "DELETE FROM Bookmark WHERE questionId IN (SELECT id FROM Question WHERE source IN ('formative','mindmap','subnote'));",
        "DELETE FROM Question WHERE source='formative';",
        "DELETE FROM Question WHERE source='mindmap';",
        "DELETE FROM Question WHERE type='fill-in' AND source='subnote';",
        "DELETE FROM Question WHERE type='multiple-choice' AND source='subnote';",
    ]
    ok = execute_file("\n".join(deletes))
    print(f"  삭제 {'성공' if ok else '실패'}")

    # ── 2. formative (essay) ──
    print("\n[2] formative 임포트")
    with open(PARSED_DIR / "formative.json", 'r', encoding='utf-8') as f:
        fqs = json.load(f)
    inserts = []
    for q in fqs:
        content = (q.get('question') or '').strip()
        answer = (q.get('answer') or '').strip()
        subject_name = (q.get('subject') or '').strip()
        if not content or not answer or not subject_name:
            continue
        sid = FORMATIVE_SUBJECT_MAP.get(subject_name, 1)
        pr = q.get('pageRef') or ''
        inserts.append(make_insert(content, answer, 'essay', 'formative', 3, sid, pr))
    print(f"  준비: {len(inserts)}개")
    batch_import(inserts, "formative")

    # ── 3. mindmap (essay) ──
    print("\n[3] mindmap 임포트")
    with open(PARSED_DIR / "mindmap_questions.json", 'r', encoding='utf-8') as f:
        mqs = json.load(f)
    inserts = []
    for q in mqs:
        inserts.append(make_insert(
            q['content'], q['modelAnswer'], 'essay', 'mindmap',
            q.get('difficulty', 3), q['subjectId'], q.get('pageRef', '')
        ))
    print(f"  준비: {len(inserts)}개")
    batch_import(inserts, "mindmap")

    # ── 4. fill-in/subnote ──
    print("\n[4] fill-in/subnote 임포트")
    with open(PARSED_DIR / "blank_questions.json", 'r', encoding='utf-8') as f:
        bqs = json.load(f)
    inserts = []
    for q in bqs:
        inserts.append(make_insert(
            q['content'], q['modelAnswer'], 'fill-in', 'subnote',
            q.get('difficulty', 3), q['subjectId'], q.get('pageRef', '')
        ))
    print(f"  준비: {len(inserts)}개")
    batch_import(inserts, "fill-in")

    # ── 5. multiple-choice/subnote ──
    print("\n[5] multiple-choice/subnote 임포트")
    with open(PARSED_DIR / "mcq_questions.json", 'r', encoding='utf-8') as f:
        mcqs = json.load(f)
    inserts = []
    for q in mcqs:
        inserts.append(make_insert(
            q['content'], q['modelAnswer'], 'multiple-choice', 'subnote',
            q.get('difficulty', 3), q['subjectId'], q.get('pageRef', '')
        ))
    print(f"  준비: {len(inserts)}개")
    batch_import(inserts, "mcq")

    print("\n" + "=" * 60)
    print("완료!")


if __name__ == "__main__":
    main()
