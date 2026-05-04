"""
parse_practice.py
예상문제 PDF에서 Q. 형식 문제를 파싱하여 essay 문제로 변환.
source='practice', modelAnswer='교재 참고하여 서술' (답이 없으므로 플레이스홀더)
"""
import sys
import re
import json
import subprocess
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

try:
    import pdfplumber
except ImportError:
    import subprocess as _sp
    _sp.run([r"C:\Users\HOSEO\uv\.venv\Scripts\pip.exe", "install", "pdfplumber"], check=True)
    import pdfplumber

PRACTICE_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\예상문제")
SUBNOTE_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\서브노트")
OUTPUT_JSON = Path(r"C:\Users\HOSEO\Desktop\임용\Makeup\parsed\practice_questions.json")
APP_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\app")
WRANGLER = str(APP_DIR / "node_modules" / ".bin" / "wrangler.cmd")
DB_NAME = "exam-db"


# 파일명 키워드 → (subject, subjectId)
def get_subject(filename: str):
    if '집단상담' in filename:
        return "집단상담", 11
    if '가족상담' in filename:
        return "가족상담", 20
    if '상이실' in filename or '상담이론' in filename:
        return "상담이론 및 실제", 10
    if '성심' in filename or '성격' in filename:
        return "성격심리학", 18
    if '학교상담' in filename:
        return "학교상담", 15
    if '특수아' in filename:
        return "상담이론 및 실제", 10
    if '이상심' in filename:
        return "이상심리학", 13
    if '진로' in filename:
        return "진로상담", 12
    return "상담이론 및 실제", 10


def extract_pdf_text(pdf_path: Path) -> str:
    parts = []
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    parts.append(t)
    except Exception as e:
        print(f"  ERROR: {pdf_path.name}: {e}")
        return ""
    return "\n".join(parts).replace('\x00', '')


def parse_questions(text: str) -> list[str]:
    """Q. 로 시작하는 줄을 문제로 파싱. 여러 줄에 걸친 문제도 합침."""
    lines = text.split('\n')
    questions = []
    current = None

    # 헤더/푸터 제거 패턴
    skip_patterns = [
        r'^문제 페이지',
        r'^뼈대 문제',
        r'^\d+\s*$',
        r'^-\s*\d+\s*-',
    ]

    for raw in lines:
        line = raw.strip()
        if not line:
            # 빈 줄 = 문제 경계
            if current:
                questions.append(current)
                current = None
            continue

        if any(re.match(p, line) for p in skip_patterns):
            continue

        # 새 문제 시작
        m = re.match(r'^Q\.\s*(.+)$', line)
        if m:
            if current:
                questions.append(current)
            current = m.group(1).strip()
        elif current:
            # 이어지는 문제 내용
            current = current + ' ' + line

    if current:
        questions.append(current)

    # 유효한 문제만 필터
    return [q for q in questions if len(q) >= 5 and len(q) <= 500]


def content_to_sql_expr(text: str) -> str:
    text = text.replace('\x00', '').replace("'", "''")
    if '\n' not in text:
        return f"'{text}'"
    parts = text.split('\n')
    return " || char(10) || ".join(f"'{p}'" for p in parts)


def execute_file(sql: str) -> bool:
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False,
                                     encoding='utf-8') as f:
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


def main():
    print("=" * 60)
    print("예상문제 파싱")
    print("=" * 60)

    if not PRACTICE_DIR.exists():
        print(f"폴더 없음: {PRACTICE_DIR}")
        return

    # 기존 practice 문제 삭제 (중복 방지, FK 처리)
    print("\n[기존 practice 삭제]")
    delete_sql = (
        "DELETE FROM Attempt WHERE questionId IN (SELECT id FROM Question WHERE source='practice');\n"
        "DELETE FROM Bookmark WHERE questionId IN (SELECT id FROM Question WHERE source='practice');\n"
        "DELETE FROM Question WHERE source='practice';"
    )
    if execute_file(delete_sql):
        print("  삭제 OK")

    pdf_files = sorted(PRACTICE_DIR.glob("*.pdf"))
    # 서브노트 폴더에 있는 예상문제 파일도 포함
    if SUBNOTE_DIR.exists():
        for f in sorted(SUBNOTE_DIR.glob("*예상문제*.pdf")):
            pdf_files.append(f)
    print(f"예상문제 PDF: {len(pdf_files)}개")

    all_questions = []

    for pdf_path in pdf_files:
        subject, sid = get_subject(pdf_path.name)
        print(f"\n  [{pdf_path.name}] → {subject} (ID={sid})")

        text = extract_pdf_text(pdf_path)
        if not text:
            print("    텍스트 없음")
            continue

        qs = parse_questions(text)
        print(f"    문제 {len(qs)}개")

        for q in qs:
            all_questions.append({
                "content": q,
                "modelAnswer": "교재 참고하여 서술",
                "type": "essay",
                "source": "practice",
                "difficulty": 3,
                "subjectId": sid,
                "pageRef": pdf_path.stem,
            })

    print(f"\n총 생성: {len(all_questions)}개")

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(all_questions, f, ensure_ascii=False, indent=2)
    print(f"JSON 저장: {OUTPUT_JSON}")

    # D1 임포트
    BATCH = 50
    inserts = []
    for q in all_questions:
        c_expr = content_to_sql_expr(q['content'])
        a_expr = content_to_sql_expr(q['modelAnswer'])
        pr = (q.get('pageRef') or '').replace("'", "''")
        inserts.append(
            f"INSERT INTO Question "
            f"(content, modelAnswer, type, source, difficulty, subjectId, pageRef, createdAt) "
            f"VALUES ({c_expr}, {a_expr}, 'essay', 'practice', {q['difficulty']}, "
            f"{q['subjectId']}, '{pr}', datetime('now'));"
        )

    batches = [inserts[i:i+BATCH] for i in range(0, len(inserts), BATCH)]
    print(f"\nD1 임포트: {len(inserts)}개를 {len(batches)}배치로")

    success = 0
    for i, batch in enumerate(batches, 1):
        ok = execute_file("\n".join(batch))
        if ok:
            success += len(batch)
            print(f"  배치 {i}/{len(batches)} OK ({success}/{len(inserts)})")
        else:
            print(f"  배치 {i}/{len(batches)} 실패")

    print(f"\n완료: {success}/{len(inserts)} 임포트")


if __name__ == "__main__":
    main()
