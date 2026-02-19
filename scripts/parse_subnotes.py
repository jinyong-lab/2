"""
parse_subnotes.py - 서브노트 빈칸/완성 파싱
Parse study notes that have blank (빈칸) and complete (완성) versions.
"""

import re
import json
import os
from pathlib import Path
from collections import defaultdict

try:
    import pdfplumber
except ImportError:
    print("pdfplumber not installed. Installing...")
    import subprocess
    subprocess.run(
        [r"C:\Users\HOSEO\uv\.venv\Scripts\pip.exe", "install", "pdfplumber"],
        check=True
    )
    import pdfplumber

# Directories
SUBNOTE_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\서브노트")
OUTPUT_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\Makeup\parsed")
OUTPUT_FILE = OUTPUT_DIR / "subnotes.json"


def get_subject_from_filename(filename: str) -> tuple[str, str]:
    """
    Extract subject and category from filename.
    Returns (subject, category).
    """
    if "이상심리학" in filename:
        return "이상심리학", "전공"
    elif "상담이론과 실제" in filename or "상담이론" in filename:
        return "상담이론과 실제", "전공"
    else:
        return "기타", "전공"


def get_set_number(filename: str) -> int:
    """Extract set number from filename like '1-2', '1-5', '1-6'."""
    match = re.search(r'1-(\d+)', filename)
    if match:
        return int(match.group(1))
    return 0


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract all text from a PDF file."""
    text_parts = []
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
    except Exception as e:
        print(f"  ERROR extracting {pdf_path.name}: {e}")
        return ""
    return "\n".join(text_parts)


def extract_sections(text: str) -> list[dict]:
    """
    Extract sections from subnote text.
    Sections are marked with 【】brackets or numbered headers.
    Returns list of {title, content} dicts.
    """
    sections = []

    # Pattern for section headers like 【 1. 불안장애 】 or 【불안장애】
    section_pattern = re.compile(r'【\s*([^】]+)\s*】')

    # Also look for Roman numeral headers
    roman_pattern = re.compile(r'^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]\.\s+.+$', re.MULTILINE)

    lines = text.split("\n")
    current_section = None
    current_content = []

    def save_section():
        if current_section and current_content:
            sections.append({
                "title": current_section,
                "content": "\n".join(current_content).strip()
            })

    for line in lines:
        line = line.strip()
        if not line:
            if current_content:
                current_content.append("")
            continue

        # Check if this is a section header
        section_match = section_pattern.search(line)
        if section_match:
            save_section()
            current_section = section_match.group(1).strip()
            current_content = []
        else:
            if current_section is not None:
                current_content.append(line)

    save_section()
    return sections


def generate_questions_from_sections(
    sections: list[dict],
    subject: str,
    category: str,
    set_number: int,
    source_label: str = "subnotes"
) -> list[dict]:
    """
    Generate essay-type questions from section headers and content.
    """
    questions = []

    question_templates = [
        "{title}의 개념을 설명하시오.",
        "{title}의 특징을 서술하시오.",
        "{title}에 대해 설명하시오.",
        "{title}의 핵심 내용을 기술하시오.",
    ]

    for i, section in enumerate(sections):
        title = section["title"]
        content = section["content"]

        if not content or len(content) < 20:
            continue

        # Clean up title - remove numbering like "1.", "Ⅰ." etc.
        clean_title = re.sub(r'^[\d]+\.\s*', '', title).strip()
        clean_title = re.sub(r'^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\.\s*', '', clean_title).strip()

        if not clean_title:
            continue

        # Choose template based on index
        template = question_templates[i % len(question_templates)]
        question_text = template.format(title=clean_title)

        # Extract key sentences from content as model answer
        content_lines = [l.strip() for l in content.split("\n") if l.strip()]
        # Take first 5 meaningful lines as model answer
        answer_lines = [l for l in content_lines if len(l) > 10][:5]
        model_answer = "\n".join(answer_lines)

        if not model_answer:
            continue

        questions.append({
            "question": question_text,
            "answer": model_answer,
            "pageRef": None,
            "subject": subject,
            "category": category,
            "source": source_label,
            "setNumber": set_number,
            "questionNumber": i + 1,
        })

    return questions


def find_paired_files(subnote_dir: Path) -> list[tuple[Path, Path | None, str, int]]:
    """
    Find pairs of blank and complete subnote files.
    Returns list of (complete_path, blank_path_or_None, subject, set_num).
    """
    all_pdfs = list(subnote_dir.glob("*.pdf"))

    # Separate blank and complete files
    blank_files = {}  # key -> path
    complete_files = {}  # key -> path

    for pdf in all_pdfs:
        name = pdf.stem  # filename without extension
        if "(빈칸)" in name:
            # Remove "(빈칸)" to get key
            key = name.replace("(빈칸)", "").strip()
            blank_files[key] = pdf
        else:
            complete_files[name] = pdf

    # Build pairs
    pairs = []
    processed_complete = set()

    for key, blank_path in blank_files.items():
        complete_path = complete_files.get(key)
        subject, category = get_subject_from_filename(key)
        set_num = get_set_number(key)

        if complete_path:
            pairs.append((complete_path, blank_path, subject, category, set_num))
            processed_complete.add(key)
        else:
            # Blank-only file, skip per spec
            print(f"  Skipping blank-only file (no complete version): {blank_path.name}")

    # Also process complete files that have no blank counterpart (if any)
    for key, complete_path in complete_files.items():
        if key not in processed_complete:
            subject, category = get_subject_from_filename(key)
            set_num = get_set_number(key)
            pairs.append((complete_path, None, subject, category, set_num))

    return pairs


def parse_subnotes() -> list[dict]:
    """Parse all subnote PDF pairs."""
    all_questions = []

    if not SUBNOTE_DIR.exists():
        print(f"ERROR: Directory not found: {SUBNOTE_DIR}")
        return []

    pairs = find_paired_files(SUBNOTE_DIR)
    print(f"Found {len(pairs)} subnote files/pairs in {SUBNOTE_DIR}")

    for item in pairs:
        complete_path, blank_path, subject, category, set_num = item

        print(f"\nParsing: {complete_path.name}")
        print(f"  Subject: {subject}, Set: {set_num}")
        if blank_path:
            print(f"  Paired with blank: {blank_path.name}")

        # Extract text from the COMPLETE version (primary source)
        text = extract_text_from_pdf(complete_path)
        if not text:
            print(f"  WARNING: No text extracted from {complete_path.name}")
            continue

        # Extract sections
        sections = extract_sections(text)
        print(f"  Found {len(sections)} sections")

        # Generate questions
        questions = generate_questions_from_sections(
            sections, subject, category, set_num, source_label="subnotes"
        )
        print(f"  Generated {len(questions)} questions")
        all_questions.extend(questions)

    return all_questions


def main():
    print("=" * 60)
    print("서브노트 PDF 파싱 시작")
    print("=" * 60)

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    questions = parse_subnotes()

    print(f"\n총 {len(questions)}개 문항 생성 완료")

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
