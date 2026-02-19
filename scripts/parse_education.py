"""
parse_education.py - 교육학/전공 노트 파싱
Parse education theory notes from 교육학/ and 전공/ directories.
Uses regular version (NOT 골드) as primary source.
"""

import re
import json
from pathlib import Path
from collections import Counter

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
EDUCATION_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\교육학")
MAJOR_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\전공")
OUTPUT_DIR = Path(r"C:\Users\HOSEO\Desktop\임용\Makeup\parsed")
OUTPUT_FILE = OUTPUT_DIR / "education.json"

# Subject mapping: filename stem -> (subject, category)
SUBJECT_MAP = {
    "교육과정": ("교육과정", "교육학"),
    "교육과정 (1)": ("교육과정", "교육학"),
    "교육사회학": ("교육사회학", "교육학"),
    "교육심리학": ("교육심리학", "교육학"),
    "교육평가와 통계": ("교육평가", "교육학"),
    "생활지도와 상담": ("생활지도와 상담", "전공"),
}


def get_subject_from_stem(stem: str) -> tuple[str, str]:
    """Get subject info from file stem (without .pdf extension)."""
    # Direct lookup first
    if stem in SUBJECT_MAP:
        return SUBJECT_MAP[stem]

    # Fuzzy match
    for key, value in SUBJECT_MAP.items():
        if key in stem:
            return value

    return (stem, "교육학")


def is_gold_version(filename: str) -> bool:
    """Check if file is a 골드 (gold) version to skip."""
    return "골드" in filename


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract all text from a PDF file."""
    text_parts = []
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            total_pages = len(pdf.pages)
            for page_num, page in enumerate(pdf.pages, 1):
                if page_num % 20 == 0:
                    print(f"    처리 중: {page_num}/{total_pages} 페이지...")
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
    except Exception as e:
        print(f"  ERROR extracting {pdf_path.name}: {e}")
        return ""
    return "\n".join(text_parts)


# Roman numeral characters used in Korean PDFs
ROMAN_CHARS = set("ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅺⅻ")


def is_roman_numeral_header(line: str) -> bool:
    """Check if line starts with a Roman numeral."""
    return len(line) > 0 and line[0] in ROMAN_CHARS


def extract_sections_and_concepts(text: str) -> list[dict]:
    """
    Parse education notes into structured sections.

    Structure:
    - 【 Major Section 】 markers
    - Ⅰ, Ⅱ, Ⅲ... sub-section headers
    - Numbered concept definitions (1., 2., 3.)
    - Slash-separated sub-items

    Returns list of {section, subsection, concepts} dicts.
    """
    results = []

    lines = text.split("\n")
    current_section = None
    current_subsection = None
    current_concepts = []

    # Patterns
    section_pattern = re.compile(r'【\s*([^】]+)\s*】')
    numbered_item = re.compile(r'^(\d+)\.\s+(.+)')

    def save_subsection():
        if current_subsection and current_concepts:
            results.append({
                "section": current_section,
                "subsection": current_subsection,
                "concepts": list(current_concepts),
            })

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Section header 【】
        section_match = section_pattern.search(line)
        if section_match:
            save_subsection()
            current_section = section_match.group(1).strip()
            current_subsection = None
            current_concepts = []
            continue

        # Roman numeral subsection (Ⅰ, Ⅱ, etc.)
        if is_roman_numeral_header(line):
            save_subsection()
            current_subsection = line.strip()
            current_concepts = []
            continue

        # Numbered concept definition
        num_match = numbered_item.match(line)
        if num_match and current_section:
            concept_text = num_match.group(2).strip()
            current_concepts.append(concept_text)
            continue

        # Regular content lines - add to current concepts if we have context
        if current_subsection and current_section and len(line) > 10:
            # Skip slash-only separator lines
            if line.strip() == "/" or line.strip() == "|":
                continue
            current_concepts.append(line)

    # Save last subsection
    save_subsection()

    return results


def generate_questions(
    sections: list[dict],
    subject: str,
    category: str,
    source_label: str = "notes"
) -> list[dict]:
    """
    Generate essay-type questions from sections and subsections.
    Uses template-based approach.
    """
    questions = []
    q_num = 1

    # Templates for generating questions
    def make_question(subsection_title: str, concepts: list[str]) -> tuple[str, str]:
        """Generate question text and model answer from subsection."""
        # Clean title
        clean_title = re.sub(r'^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\.\s*', '', subsection_title).strip()
        clean_title = re.sub(r'^\d+\.\s*', '', clean_title).strip()

        if not clean_title:
            return None, None

        # Determine concept count for template
        meaningful_concepts = [c for c in concepts if len(c) > 15]
        count = min(len(meaningful_concepts), 3)

        if count == 0:
            return None, None

        # Choose question template based on content
        if "정의" in clean_title or "개념" in clean_title:
            q_text = f"{clean_title}을(를) 설명하시오."
        elif count >= 3:
            q_text = f"{clean_title}의 주요 내용 {count}가지를 서술하시오."
        elif "특징" in clean_title or "원리" in clean_title:
            q_text = f"{clean_title}의 특징을 설명하시오."
        else:
            q_text = f"{clean_title}에 대해 설명하시오."

        # Build model answer from concepts
        answer_lines = meaningful_concepts[:5]  # max 5 lines
        model_answer = "\n".join(answer_lines)

        return q_text, model_answer

    for section_data in sections:
        section = section_data.get("section", "")
        subsection = section_data.get("subsection", "")
        concepts = section_data.get("concepts", [])

        if not subsection or not concepts:
            continue

        # Clean section for context
        clean_section = re.sub(r'\d+\.\s*', '', section).strip() if section else ""

        q_text, model_answer = make_question(subsection, concepts)
        if not q_text or not model_answer:
            continue

        # Add section context to question if subsection is too generic
        if len(q_text) < 15 and clean_section:
            q_text = f"[{clean_section}] {q_text}"

        questions.append({
            "question": q_text,
            "answer": model_answer,
            "pageRef": None,
            "subject": subject,
            "category": category,
            "source": source_label,
            "setNumber": 0,
            "questionNumber": q_num,
        })
        q_num += 1

    return questions


def parse_education_pdfs() -> list[dict]:
    """Parse all education and major PDFs."""
    all_questions = []

    # Collect all PDFs from both directories
    pdf_sources = []

    for edu_dir in [EDUCATION_DIR, MAJOR_DIR]:
        if not edu_dir.exists():
            print(f"WARNING: Directory not found: {edu_dir}")
            continue

        for pdf_path in sorted(edu_dir.glob("*.pdf")):
            # Skip 골드 versions
            if is_gold_version(pdf_path.name):
                print(f"  Skipping 골드 version: {pdf_path.name}")
                continue
            pdf_sources.append(pdf_path)

    print(f"Found {len(pdf_sources)} PDFs to parse (골드 versions excluded)")

    for pdf_path in pdf_sources:
        stem = pdf_path.stem
        subject, category = get_subject_from_stem(stem)

        print(f"\nParsing: {pdf_path.name}")
        print(f"  Subject: {subject} ({category})")

        text = extract_text_from_pdf(pdf_path)
        if not text:
            print(f"  WARNING: No text extracted from {pdf_path.name}")
            continue

        sections = extract_sections_and_concepts(text)
        print(f"  Found {len(sections)} sections/subsections")

        questions = generate_questions(sections, subject, category, source_label="notes")
        print(f"  Generated {len(questions)} questions")
        all_questions.extend(questions)

    return all_questions


def main():
    print("=" * 60)
    print("교육학/전공 노트 PDF 파싱 시작")
    print("=" * 60)

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    questions = parse_education_pdfs()

    print(f"\n총 {len(questions)}개 문항 생성 완료")

    # Save to JSON
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f"저장 완료: {OUTPUT_FILE}")

    # Summary by subject
    subject_counts = Counter(q["subject"] for q in questions)
    print("\n과목별 문항 수:")
    for subject, count in sorted(subject_counts.items()):
        print(f"  {subject}: {count}개")

    return questions


if __name__ == "__main__":
    main()
