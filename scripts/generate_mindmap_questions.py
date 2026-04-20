"""
generate_mindmap_questions.py
마인드맵 PDF에서 텍스트 추출 → 에세이 문제 생성 → D1 임포트
"""
import sys
import re
import json
import subprocess
import tempfile
from pathlib import Path
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

try:
    import pdfplumber
except ImportError:
    import subprocess as _sp
    _sp.run([r"C:\Users\HOSEO\uv\.venv\Scripts\pip.exe", "install", "pdfplumber"], check=True)
    import pdfplumber

MINDMAP_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\마인드맵")
OUTPUT_JSON = Path(r"C:\Users\HOSEO\Desktop\임용\Makeup\parsed\mindmap_questions.json")
APP_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\app")
WRANGLER = str(APP_DIR / "node_modules" / ".bin" / "wrangler.cmd")
DB_NAME = "exam-db"

# 파일명 → (subject_name, subjectId)
FILE_SUBJECT_MAP = {
    "심리학개론":    ("심리학개론",    19),
    "가족상담":      ("심리학개론",    19),  # 2-6은 심리학개론 주 과목
    "이상심리학":    ("이상심리학",    13),
    "상담이론과 실제": ("상담이론 및 실제", 10),
    "상담이론":      ("상담이론 및 실제", 10),
    "성격심리학":    ("성격심리학",    18),
    "진로상담":      ("진로상담",      12),
}


def get_subject_from_filename(filename: str):
    # 우선순위: 심리학개론 > 가족상담 > 성격심리학 > 이상심리학 > ...
    for key, val in FILE_SUBJECT_MAP.items():
        if key in filename:
            return val
    return ("기타", 1)


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


def parse_mindmap_sections(text: str) -> list[dict]:
    """
    마인드맵 텍스트를 섹션으로 파싱.
    각 줄에서 '주제: 내용' 패턴 또는 계층 구조 추출.
    """
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    sections = []
    current_topic = None
    current_items = []

    # 헤더처럼 보이는 줄 (짧고 뒤에 세부항목이 따라오는 패턴)
    # 패턴: "주제명\n내용1\n내용2..."
    # 또는 "주제명: 내용" 형식

    for line in lines:
        # 페이지 번호 등 제거
        if re.match(r'^\d+$', line):
            continue
        # (cid:XXXX) 등 PDF 아티팩트 제거
        line = re.sub(r'\(cid:\d+\)', '', line).strip()
        if not line:
            continue

        # "주제: 내용" 형식 파싱
        colon_match = re.match(r'^([^:]{2,30}):\s*(.{5,})$', line)
        if colon_match:
            key = colon_match.group(1).strip()
            val = colon_match.group(2).strip()
            sections.append({"topic": key, "content": val})
        elif len(line) <= 20 and not re.search(r'[:：]', line):
            # 짧은 줄 = 새 섹션 헤더
            if current_topic and current_items:
                sections.append({
                    "topic": current_topic,
                    "content": "\n".join(current_items)
                })
            current_topic = line
            current_items = []
        else:
            if current_topic:
                current_items.append(line)

    if current_topic and current_items:
        sections.append({"topic": current_topic, "content": "\n".join(current_items)})

    return sections


def generate_questions_from_mindmap(
    sections: list[dict],
    subject_name: str,
    subject_id: int,
    filename: str
) -> list[dict]:
    """마인드맵 섹션에서 에세이 문제 생성"""
    questions = []
    templates = [
        "{topic}의 개념을 설명하시오.",
        "{topic}에 대해 설명하시오.",
        "{topic}의 특징을 서술하시오.",
        "{topic}의 주요 내용을 기술하시오.",
        "{topic}의 핵심 개념을 설명하시오.",
    ]

    seen_topics = set()
    for i, sec in enumerate(sections):
        topic = sec["topic"].strip()
        content = sec["content"].strip()

        if not topic or not content:
            continue
        if len(content) < 10:
            continue
        if topic in seen_topics:
            continue
        seen_topics.add(topic)

        # 질문 생성
        tmpl = templates[i % len(templates)]
        question = tmpl.format(topic=topic)

        # 답변: content를 정리
        answer_lines = [l.strip() for l in content.split('\n') if l.strip() and len(l.strip()) > 5]
        answer = "\n".join(answer_lines[:6])
        if not answer:
            continue

        questions.append({
            "content": question,
            "modelAnswer": answer,
            "type": "essay",
            "source": "mindmap",
            "difficulty": 3,
            "subjectId": subject_id,
            "pageRef": filename,
        })

    return questions


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
            print(f"  WRANGLER ERROR: {result.stderr[:300]}")
        return result.returncode == 0
    finally:
        Path(tmp).unlink(missing_ok=True)


def ensure_subject_exists(subject_id: int, subject_name: str, category: str):
    """성격심리학 등 새 과목 추가"""
    sql = (
        f"INSERT OR IGNORE INTO Subject (id, name, category) "
        f"VALUES ({subject_id}, '{subject_name}', '{category}');"
    )
    execute_file(sql)
    print(f"  Subject 확인/추가: ID={subject_id} {subject_name}")


def main():
    print("=" * 60)
    print("마인드맵 문제 생성 및 D1 임포트")
    print("=" * 60)

    # 성격심리학 subject 추가 (ID=18, 없으면 추가)
    ensure_subject_exists(18, "성격심리학", "전공A")

    pdf_files = sorted(MINDMAP_DIR.glob("*.pdf"))
    print(f"\n마인드맵 PDF: {len(pdf_files)}개")

    all_questions = []

    for pdf_path in pdf_files:
        subject_name, subject_id = get_subject_from_filename(pdf_path.stem)
        print(f"\n  [{pdf_path.name}] → {subject_name} (ID={subject_id})")

        text = extract_pdf_text(pdf_path)
        if not text:
            print("    텍스트 없음 - 스킵")
            continue

        sections = parse_mindmap_sections(text)
        print(f"    섹션: {len(sections)}개")

        questions = generate_questions_from_mindmap(
            sections, subject_name, subject_id, pdf_path.stem
        )
        print(f"    문제: {len(questions)}개")
        all_questions.extend(questions)

    print(f"\n총 생성: {len(all_questions)}개")

    # JSON 저장
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
            f"VALUES ({c_expr}, {a_expr}, 'essay', 'mindmap', {q['difficulty']}, "
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
