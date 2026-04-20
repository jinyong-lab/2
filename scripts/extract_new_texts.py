"""
extract_new_texts.py
서브노트/보충프린트/DAY/필기노트/복습테스트 PDF 텍스트를 추출하여 subnote_texts.json에 추가한다.

처리 대상:
- 서브노트 1-1~2-5 (이상심리학/상담이론/성격심리학/진로상담)
- 보충프린트 전체
- DAY1-DAY25 (이상심리학 DSM-5) → ID 13
- 필기노트 (교육과정/교육방법 및 공학/교육평가)
- 복습테스트 (진로상담)
"""

import sys
import re
import json
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

try:
    import pdfplumber
except ImportError:
    import subprocess
    subprocess.run(
        [r"C:\Users\HOSEO\uv\.venv\Scripts\pip.exe", "install", "pdfplumber"],
        check=True
    )
    import pdfplumber

SUBNOTE_TEXTS = Path(r"C:\Users\HOSEO\Desktop\임용\Makeup\subnote_texts.json")

SUBNOTE_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\서브노트")
BOOCHUNG_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\보충프린트")
DAY_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\형성평가\문제")
PILGI_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\필기노트")
REVIEW_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\복습테스트")


def extract_pdf_text(pdf_path: Path) -> str:
    """PDF 전체 텍스트 추출 (null 문자 제거)"""
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


def main():
    # 기존 데이터 로드
    with open(SUBNOTE_TEXTS, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"기존 항목: {len(data)}개")
    existing_keys = set(data.keys())
    new_count = 0

    # ── 1. 서브노트 전체 (빈칸 버전) ──────────────────────────────
    print("\n[서브노트 추출]")

    # 파일명 → (subject, subjectId) 매핑
    def get_subnote_subject(filename):
        if '심리학개론' in filename or '가족상담' in filename:
            # 심리학개론, 가족상담 → 심리학개론(19) 주 과목
            return "심리학개론", 19
        elif '성격심리학' in filename and '진로상담' in filename:
            return "성격심리학", 18
        elif '성격심리학' in filename:
            return "성격심리학", 18
        elif '이상심리학' in filename:
            return "이상심리학", 13
        elif '상담이론' in filename:
            return "상담이론 및 실제", 10
        elif '진로상담' in filename:
            return "진로상담", 12
        return "상담이론 및 실제", 10

    subnote_files = sorted(SUBNOTE_DIR.glob("*.pdf"))
    for pdf_path in subnote_files:
        key = pdf_path.name
        if key in existing_keys:
            print(f"  SKIP: {key} (이미 존재)")
            continue

        text = extract_pdf_text(pdf_path)
        if not text:
            print(f"  SKIP: {pdf_path.name} (텍스트 없음)")
            continue

        subject, sid = get_subnote_subject(pdf_path.name)
        data[key] = {
            "subject": subject,
            "subjectId": sid,
            "full_text": text
        }
        new_count += 1
        print(f"  OK: {key} ({len(text)} chars) → {subject}(ID={sid})")

    # ── 2. 보충프린트 전체 ─────────────────────────────────────────
    print("\n[보충프린트 추출]")
    boochung_files = sorted(BOOCHUNG_DIR.glob("*.pdf"))

    for pdf_path in boochung_files:
        key = f"보충_{pdf_path.stem}"
        if key in existing_keys:
            print(f"  SKIP: {key} (이미 존재)")
            continue

        text = extract_pdf_text(pdf_path)
        if not text:
            print(f"  SKIP: {pdf_path.name} (텍스트 없음)")
            continue

        subject, sid = get_subnote_subject(pdf_path.name)
        data[key] = {
            "subject": subject,
            "subjectId": sid,
            "full_text": text
        }
        new_count += 1
        print(f"  OK: {key} ({len(text)} chars) → {subject}(ID={sid})")

    # ── 3. DAY1-DAY25 ─────────────────────────────────────────────
    print("\n[DAY1-DAY25 추출]")
    day_files = sorted(
        [f for f in DAY_DIR.glob("DAY*.pdf")],
        key=lambda p: int(re.search(r'(\d+)', p.stem).group(1))
    )

    for pdf_path in day_files:
        num = re.search(r'(\d+)', pdf_path.stem).group(1)
        key = f"day{num}"
        if key in existing_keys:
            print(f"  SKIP: {key} (이미 존재)")
            continue

        text = extract_pdf_text(pdf_path)
        if not text:
            print(f"  SKIP: {pdf_path.name} (텍스트 없음)")
            continue

        data[key] = {
            "subject": "이상심리학",
            "subjectId": 13,
            "full_text": text
        }
        new_count += 1
        print(f"  OK: {key} - {pdf_path.name} ({len(text)} chars)")

    # ── 4. 필기노트 ─────────────────────────────────────────────
    print("\n[필기노트 추출]")

    def get_pilgi_subject(filename):
        if '교육방법' in filename and '교육평가' in filename:
            return "교육방법 및 공학", 2
        elif '교육평가' in filename and '교육행정' in filename:
            return "교육평가", 3
        elif '교육방법' in filename:
            return "교육방법 및 공학", 2
        elif '교육평가' in filename:
            return "교육평가", 3
        elif '교육행정' in filename:
            return "교육행정", 5
        elif '교육과정' in filename:
            return "교육과정", 1
        return "교육과정", 1

    if PILGI_DIR.exists():
        pilgi_files = sorted(PILGI_DIR.glob("*.pdf"))
        for pdf_path in pilgi_files:
            key = f"필기_{pdf_path.stem}"
            if key in existing_keys:
                print(f"  SKIP: {key} (이미 존재)")
                continue

            text = extract_pdf_text(pdf_path)
            if not text:
                print(f"  SKIP: {pdf_path.name} (텍스트 없음)")
                continue

            subject, sid = get_pilgi_subject(pdf_path.name)
            data[key] = {
                "subject": subject,
                "subjectId": sid,
                "full_text": text
            }
            new_count += 1
            print(f"  OK: {key} ({len(text)} chars) → {subject}(ID={sid})")

    # ── 5. 복습테스트 ────────────────────────────────────────────
    print("\n[복습테스트 추출]")
    if REVIEW_DIR.exists():
        review_files = sorted(REVIEW_DIR.glob("*.pdf"))
        for pdf_path in review_files:
            key = f"복습_{pdf_path.stem}"
            if key in existing_keys:
                print(f"  SKIP: {key} (이미 존재)")
                continue

            text = extract_pdf_text(pdf_path)
            if not text:
                print(f"  SKIP: {pdf_path.name} (텍스트 없음)")
                continue

            subject, sid = get_subnote_subject(pdf_path.name)
            data[key] = {
                "subject": subject,
                "subjectId": sid,
                "full_text": text
            }
            new_count += 1
            print(f"  OK: {key} ({len(text)} chars) → {subject}(ID={sid})")

    # ── 저장 ──────────────────────────────────────────────────────
    print(f"\n새로 추가: {new_count}개 / 전체: {len(data)}개")

    with open(SUBNOTE_TEXTS, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"저장 완료: {SUBNOTE_TEXTS}")

    # 통계
    print("\n[전체 항목]")
    for k, v in sorted(data.items()):
        print(f"  {k:50s} | {v['subject']:15s} | {len(v['full_text']):6d} chars")


if __name__ == "__main__":
    main()
