"""
parse_formative.py - 형성평가 해설편 PDF 파싱
Parse 12 answer-key PDFs from 형성평가/해설/ into Q&A pairs.
"""

import re
import json
import os
from pathlib import Path

# Subject header keywords that appear as PDF artifacts at the bottom of answer pages
_SUBJECT_HEADER_KEYWORDS = [
    '교육의이해', '교육과정', '교육방법', '교육평가', '교육행정',
    '교육심리', '교육사회', '생활지도와', '교육사', '및공학',
    '상담', '교육철학',
]


_PAGE_FOOTER_RE = re.compile(r'^-\s*\d+\s*-\s*\S')


def _is_only_checkbox_chars(line: str) -> bool:
    """Returns True if line contains only □ (U+25A1) characters."""
    stripped = line.strip()
    return bool(stripped) and all(c == '\u25a1' for c in stripped)


def _is_subject_header_line(line: str) -> bool:
    """Returns True if line is a subject-list artifact (only subject name tokens)."""
    stripped = line.strip()
    if not stripped:
        return False
    remainder = stripped
    for kw in _SUBJECT_HEADER_KEYWORDS:
        remainder = remainder.replace(kw, '')
    return len(remainder.strip()) <= 2


def _is_page_footer_line(line: str) -> bool:
    """Returns True if line is a page footer like '- 10- 설보연SANTA 교육학'."""
    return bool(_PAGE_FOOTER_RE.match(line.strip()))


def _is_artifact_line(line: str) -> bool:
    """Returns True if a trailing line is a PDF artifact."""
    return (
        _is_only_checkbox_chars(line)
        or _is_subject_header_line(line)
        or _is_page_footer_line(line)
        or not line.strip()
    )


def clean_answer_text(text: str) -> str:
    """
    Remove PDF checkbox artifacts and subject header lines from answer text.
    - Removes lines that are ONLY □ characters anywhere in the text
    - Removes trailing subject header lines (navigation footer artifacts)
    - Removes trailing page footer lines like '- 10- 설보연SANTA 교육학'
    - Strips trailing whitespace
    """
    if not text:
        return text

    lines = text.split('\n')

    # Remove internal □-only lines
    cleaned = [line for line in lines if not _is_only_checkbox_chars(line)]

    # Strip trailing artifact lines (multi-pass until stable)
    changed = True
    while changed and cleaned:
        changed = False
        while cleaned and _is_artifact_line(cleaned[-1]):
            cleaned.pop()
            changed = True

    return '\n'.join(cleaned).strip()

try:
    import pdfplumber
except ImportError:
    print("pdfplumber not installed. Installing...")
    import subprocess
    import sys
    subprocess.run(
        [r"C:\Users\HOSEO\uv\.venv\Scripts\pip.exe", "install", "pdfplumber"],
        check=True
    )
    import pdfplumber

# Directories
HAESUL_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\형성평가\해설")
OUTPUT_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\Makeup\parsed")
OUTPUT_FILE = OUTPUT_DIR / "formative.json"


def get_subject_info(filename: str) -> tuple[str, str, int]:
    """
    Extract subject name, category, and set number from filename.
    Returns (subject, category, set_number).
    """
    # Extract number from filename (e.g., "01", "08", "11")
    match = re.search(r'(\d+)', filename)
    if not match:
        return "기타", "교육학", 0
    num = int(match.group(1))

    if num == 1:
        return "교육의 이해", "교육학", num
    elif num in (2, 3, 4):
        return "교육과정", "교육학", num
    elif num in (5, 6, 7):
        return "교육방법 및 공학", "교육학", num
    elif num in (8, 9, 10):
        return "교육평가", "교육학", num
    elif num in (11, 12, 13):
        return "교육행정", "교육학", num
    elif num in (14, 15, 16):
        return "교육심리", "교육학", num
    else:
        return "기타", "교육학", num


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract all text from a PDF file using pdfplumber."""
    text_parts = []
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            for page_num, page in enumerate(pdf.pages, 1):
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
    except Exception as e:
        print(f"  ERROR extracting {pdf_path.name}: {e}")
        return ""
    return "\n".join(text_parts)


def parse_questions(text: str, subject: str, category: str, set_number: int) -> list[dict]:
    """
    Parse question-answer pairs from extracted text.
    Questions start with a number followed by a period: ^\d+\.
    """
    questions = []

    # Split text into lines, clean up
    lines = [line.strip() for line in text.split("\n") if line.strip()]

    # Find question boundaries using pattern: line starts with digit(s) + period + space
    # e.g., "1.", "2.", "10.", "30."
    q_pattern = re.compile(r'^(\d+)\.\s+(.+)$')

    current_q_num = None
    current_q_content = None
    current_answer_lines = []
    current_page_ref = None

    def save_question():
        nonlocal current_q_num, current_q_content, current_answer_lines, current_page_ref
        if current_q_num is None or current_q_content is None:
            return

        # Extract page reference from question content if present
        # Pattern: (p30-(2)-①) or (p30) or similar
        page_ref_match = re.search(r'\(([^)]+)\)\s*$', current_q_content)
        page_ref = None
        question_text = current_q_content

        if page_ref_match:
            page_ref = page_ref_match.group(1)
            # Remove page ref from question text
            question_text = current_q_content[:page_ref_match.start()].strip()

        # Join answer lines and clean PDF artifacts
        answer = clean_answer_text("\n".join(current_answer_lines))

        if question_text and answer:
            questions.append({
                "question": question_text,
                "answer": answer,
                "pageRef": page_ref,
                "subject": subject,
                "category": category,
                "source": "formative",
                "setNumber": set_number,
                "questionNumber": current_q_num,
            })

        current_q_num = None
        current_q_content = None
        current_answer_lines = []
        current_page_ref = None

    for line in lines:
        # Skip header/footer lines
        if re.match(r'^20\d\d학년도', line):
            continue
        if '복습check' in line or '형성평가' in line and len(line) < 30:
            continue
        if re.match(r'^\d+\s*페이지', line) or re.match(r'^- \d+ -', line):
            continue

        # Check if this line starts a new question
        m = q_pattern.match(line)
        if m:
            # Save previous question first
            save_question()

            current_q_num = int(m.group(1))
            current_q_content = m.group(2).strip()
            current_answer_lines = []
        elif current_q_num is not None:
            # This is an answer line for the current question
            current_answer_lines.append(line)

    # Save last question
    save_question()

    return questions


def parse_formative_pdfs() -> list[dict]:
    """Parse all 형성평가 해설 PDFs."""
    all_questions = []

    if not HAESUL_DIR.exists():
        print(f"ERROR: Directory not found: {HAESUL_DIR}")
        return []

    pdf_files = sorted(HAESUL_DIR.glob("*.pdf"))
    print(f"Found {len(pdf_files)} PDF files in {HAESUL_DIR}")

    for pdf_path in pdf_files:
        filename = pdf_path.name
        subject, category, set_number = get_subject_info(filename)

        print(f"\nParsing: {filename}")
        print(f"  Subject: {subject}, Set: {set_number}")

        text = extract_text_from_pdf(pdf_path)
        if not text:
            print(f"  WARNING: No text extracted from {filename}")
            continue

        questions = parse_questions(text, subject, category, set_number)
        print(f"  Extracted {len(questions)} questions")
        all_questions.extend(questions)

    return all_questions


def main():
    print("=" * 60)
    print("형성평가 해설편 PDF 파싱 시작")
    print("=" * 60)

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    questions = parse_formative_pdfs()

    print(f"\n총 {len(questions)}개 문항 파싱 완료")

    # Save to JSON
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f"저장 완료: {OUTPUT_FILE}")

    # Summary by subject
    from collections import Counter
    subject_counts = Counter(q["subject"] for q in questions)
    print("\n과목별 문항 수:")
    for subject, count in sorted(subject_counts.items()):
        print(f"  {subject}: {count}개")

    return questions


if __name__ == "__main__":
    main()
