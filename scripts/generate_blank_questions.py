"""
generate_blank_questions.py
Reads extracted subnote texts from subnote_texts.json and generates
fill-in-the-blank questions for Korean teacher certification exam study.

Strategies:
  1. Definition blanks (term: definition -> blank the term)
  2. Person-theory blanks (theorist + theory -> blank the theorist)
  3. Enumeration blanks (listed items -> blank one item)
  4. Korean/English term pairs
  5. Disorder/technique name blanks
  6. Counseling principles
  7. Lifestyle types
"""

import sys
import re
import json
from pathlib import Path
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

# ── Paths ──────────────────────────────────────────────────────────
INPUT_FILE = Path(r"C:\Users\HOSEO\Desktop\임용\Makeup\subnote_texts.json")
OUTPUT_JSON = Path(r"C:\Users\HOSEO\Desktop\임용\Makeup\parsed\blank_questions.json")
OUTPUT_SQL = Path(r"C:\Users\HOSEO\Desktop\임용\app\scripts\import-blank-questions.sql")

# ── Watermark / noise filters ─────────────────────────────────────
SKIP_PATTERNS = [
    re.compile(r'루시아의\s*전문상담교사\s*서브노트'),
    re.compile(r'^\s*\d+\s*$'),
    re.compile(r'^\s*$'),
    re.compile(r'^\s*\[.*\]\s*$'),
    re.compile(r'cid:\d+'),
]

# Terms that are too generic to be good answers
GENERIC_TERMS = frozenset({
    '특징', '정의', '개요', '개념', '원인', '치료', '장점', '단점',
    '유형', '하위유형', '핵심증상', '공통양상', '차이점', '목표',
    '과정', '방법', '결과', '효과', '내용', '의미', '역할', '기능',
    '종류', '구분', '분류', '차이', '비교', '관계', '영향', '요인',
    '조건', '원리', '특성', '구조', '상담목표', '상담과정', '상담방법',
    '인간관', '상담자 역할', '공통점', '문제점', '필요성',
    '뇌 영역', '환경적 원인', '상실된 기억의 회복',
})

# Korean person names that should NOT be treated as scholars
NON_PERSON_KOREAN = frozenset({
    '인간', '개인', '자기', '내담자', '상담자', '환자', '부모', '자녀',
    '아동', '청소년', '성인', '사람', '치료자', '교사', '학습자',
    '내적', '외적', '사회적', '심리적', '정서적', '인지적', '행동적',
    '기관', '기능', '경험', '평가', '이상', '동작',
})


def should_skip_line(line: str) -> bool:
    for pat in SKIP_PATTERNS:
        if pat.search(line):
            return True
    return False


# ── Regex patterns ─────────────────────────────────────────────────
CIRCLED_NUM = r'[⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽⑾⑿]'
SUB_CIRCLED = r'[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]'
DOUBLE_CIRCLED = r'[ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙ]'

SECTION_HEADER_RE = re.compile(r'^\s*(\d+)\s{2,}(.+)$')
SUBSECTION_RE = re.compile(r'^(\d+)\.\s+(.+)$')

# Only match ⑴-style items for primary definitions
CIRCLED_DEF_RE = re.compile(rf'({CIRCLED_NUM})\s*(.+?)\s*[:：]\s*(.+)')
# ①-style for subtypes/disorders
SUB_CIRCLED_DEF_RE = re.compile(rf'({SUB_CIRCLED})\s*(.+?)\s*[:：]\s*(.+)')
# ⓐ-style for sub-sub items
DOUBLE_CIRCLED_DEF_RE = re.compile(rf'({DOUBLE_CIRCLED})\s*(.+?)\s*[:：]\s*(.+)')
# Korean term with English: 신경증(neurosis)
KR_EN_TERM_RE = re.compile(r'([\uac00-\ud7a3]{2,})\(([a-zA-Z][a-zA-Z\-\s]*[a-zA-Z])\)')
# Person(English): concept
PERSON_CONCEPT_RE = re.compile(
    r'([\uac00-\ud7a3]{2,6})\(([A-Z][a-zA-Z\s\.\']+)\)\s*[:：]\s*(.+)'
)


# ── Section parser ─────────────────────────────────────────────────

def parse_sections(text: str) -> list:
    """Parse text into hierarchical sections with line tracking."""
    lines = text.split('\n')
    sections = []
    current_section = ''
    current_subsection = ''

    for line in lines:
        stripped = line.strip()
        if not stripped or should_skip_line(stripped):
            continue

        sec_match = SECTION_HEADER_RE.match(stripped)
        if sec_match:
            current_section = sec_match.group(2).strip()
            current_subsection = ''
            continue

        sub_match = SUBSECTION_RE.match(stripped)
        if sub_match:
            current_subsection = sub_match.group(2).strip()
            continue

        if re.match(r'^(이상심리학|상담이론과?\s*실제)[ⅠⅡⅢⅣⅤ]*\s*$', stripped):
            continue

        sections.append({
            'section': current_section,
            'subsection': current_subsection,
            'line': stripped,
        })

    return sections


# ── Validation helpers ─────────────────────────────────────────────

def clean_text(s: str) -> str:
    s = s.strip()
    s = re.sub(r'^[\s,.:：·∙\-]+|[\s,.:：·∙\-]+$', '', s)
    s = re.sub(r'\s*\d+\s*$', '', s)
    return s


def is_good_answer(answer: str) -> bool:
    """Strict validation for answers."""
    if not answer or len(answer) < 2 or len(answer) > 25:
        return False
    if re.match(r'^[\d\s\.\,\-]+$', answer):
        return False
    if 'cid:' in answer:
        return False
    if answer in GENERIC_TERMS:
        return False
    # Reject answers that look like descriptions (too many spaces/words)
    words = answer.split()
    if len(words) > 5:
        return False
    return True


def is_good_question(content: str) -> bool:
    if not content or len(content) < 20 or len(content) > 180:
        return False
    if '( )' not in content:
        return False
    if 'cid:' in content:
        return False
    return True


def make_context(section: str, subsection: str) -> str:
    parts = [p for p in [section, subsection] if p]
    return ' > '.join(parts)


def truncate_def(defn: str, max_len: int = 60) -> str:
    """Truncate definition to max_len, breaking at word boundary."""
    if len(defn) <= max_len:
        return defn
    truncated = defn[:max_len]
    # Try to break at a space or comma
    last_break = max(truncated.rfind(' '), truncated.rfind(','), truncated.rfind('('))
    if last_break > max_len // 2:
        truncated = truncated[:last_break]
    return truncated


# ── Strategy 1: Definition blanks (⑴ only) ────────────────────────

def strategy_definition_blanks(sections: list, file_key: str) -> list:
    """Primary definitions using ⑴⑵⑶ circled numbers only."""
    questions = []

    for item in sections:
        line = item['line']
        m = CIRCLED_DEF_RE.match(line)
        if not m:
            continue

        term = clean_text(m.group(2))
        defn = clean_text(m.group(3))

        if not is_good_answer(term) or len(defn) < 8:
            continue

        ctx = make_context(item['section'], item['subsection'])
        defn = truncate_def(defn, 70)

        if ctx:
            content = f"{ctx}에서, {defn}에 해당하는 것은 ( )이다."
        else:
            content = f"{defn}에 해당하는 것은 ( )이다."

        if is_good_question(content):
            questions.append({
                'content': content,
                'modelAnswer': term,
                'source_file': file_key,
            })

    return questions


# ── Strategy 2: Person-theory blanks ──────────────────────────────

def strategy_person_theory(sections: list, file_key: str) -> list:
    """Match Korean(English): concept patterns for scholars."""
    questions = []
    seen = set()

    for item in sections:
        line = item['line']

        # Match: 한글이름(EnglishName): concept/theory
        for m in PERSON_CONCEPT_RE.finditer(line):
            kr_name = m.group(1).strip()
            en_name = m.group(2).strip()
            concept = clean_text(m.group(3))

            if kr_name in NON_PERSON_KOREAN:
                continue
            if len(en_name) < 3 or len(concept) < 5:
                continue

            key = (en_name, concept[:25])
            if key in seen:
                continue
            seen.add(key)

            ctx = make_context(item['section'], item['subsection'])
            concept = truncate_def(concept, 55)

            if ctx:
                content = f"{ctx}에서, '{concept}'을/를 주장한 학자는 ( )이다."
            else:
                content = f"'{concept}'을/를 주장한 학자는 ( )이다."

            if is_good_question(content):
                questions.append({
                    'content': content,
                    'modelAnswer': f"{kr_name}({en_name})",
                    'source_file': file_key,
                })

    # Also match section headers: "Ellis의 합리적 정서행동치료"
    for item in sections:
        line = item['line']
        # Match "Name의 Theory" at start of line or after section number
        header_m = re.match(
            r'^(?:\s*\d+\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*의\s+'
            r'([\uac00-\ud7a3][\uac00-\ud7a3\s·]+(?:치료|이론|심리학|상담|모델|학파))',
            line
        )
        if header_m:
            person = header_m.group(1).strip()
            theory = header_m.group(2).strip()

            key = (person, theory)
            if key in seen:
                continue
            seen.add(key)

            content = f"{theory}을/를 개발(주장)한 학자는 ( )이다."
            if is_good_question(content):
                questions.append({
                    'content': content,
                    'modelAnswer': person,
                    'source_file': file_key,
                })

    return questions


# ── Strategy 3: Enumeration blanks ────────────────────────────────

def strategy_enumeration_blanks(sections: list, file_key: str) -> list:
    """Group ⑴-items under same subsection and create enumeration questions."""
    questions = []
    seen = set()

    # Group by (section, subsection)
    groups = {}
    for item in sections:
        line = item['line']
        key = (item['section'], item['subsection'])

        m = CIRCLED_DEF_RE.match(line)
        if m:
            term = clean_text(m.group(2))
            defn = clean_text(m.group(3))
            if is_good_answer(term) and len(defn) >= 5:
                groups.setdefault(key, []).append((term, defn))

    for (section, subsection), items in groups.items():
        if len(items) < 3 or len(items) > 7:
            continue

        ctx = make_context(section, subsection)
        terms = [t for t, _ in items]

        for i, (term, defn) in enumerate(items):
            other_terms = [t for j, t in enumerate(terms) if j != i][:3]
            if not other_terms:
                continue

            dedup_key = ('enum', ctx, term)
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            others_str = ', '.join(other_terms)
            defn_short = truncate_def(defn, 40)

            if ctx:
                content = (
                    f"{ctx}에서 {others_str}과/와 함께 제시되는 것으로, "
                    f"'{defn_short}'에 해당하는 것은 ( )이다."
                )
            else:
                content = (
                    f"{others_str}과/와 함께 제시되는 것으로, "
                    f"'{defn_short}'에 해당하는 것은 ( )이다."
                )

            if is_good_question(content):
                questions.append({
                    'content': content,
                    'modelAnswer': term,
                    'source_file': file_key,
                })

    return questions


# ── Strategy 4: Korean/English term pairs ─────────────────────────

def strategy_kr_en_terms(sections: list, file_key: str) -> list:
    """Korean(English) term pairs like 신경증(neurosis)."""
    questions = []
    seen = set()

    SKIP_KR = {'예', '즉', '의', '등', '것', '수', '참고', '참조', '약', '표'}

    for item in sections:
        line = item['line']
        for m in KR_EN_TERM_RE.finditer(line):
            kr = m.group(1).strip()
            en = m.group(2).strip()

            if kr in SKIP_KR or len(kr) < 2 or len(en) < 4:
                continue

            key = (kr, en)
            if key in seen:
                continue
            seen.add(key)

            ctx = make_context(item['section'], item['subsection'])

            # English -> Korean
            if ctx:
                content = f"{ctx}에서, {en}의 한국어 용어는 ( )이다."
            else:
                content = f"{en}의 한국어 용어는 ( )이다."

            if is_good_question(content) and is_good_answer(kr):
                questions.append({
                    'content': content,
                    'modelAnswer': kr,
                    'source_file': file_key,
                })

    return questions


# ── Strategy 5: Disorder subtypes (① level) ──────────────────────

def strategy_disorder_subtypes(sections: list, file_key: str) -> list:
    """Match ① disorder/technique: description patterns."""
    questions = []
    seen = set()

    # Only keep items that end in 장애, 증, 공포증, 치료, 기법, 훈련, etc.
    GOOD_SUFFIXES = ('장애', '증', '공포증', '치료', '기법', '훈련', '방법', '요법',
                     '상담', '검사', '기술', '학파')

    for item in sections:
        line = item['line']
        m = SUB_CIRCLED_DEF_RE.match(line)
        if not m:
            continue

        term = clean_text(m.group(2))
        defn = clean_text(m.group(3))

        if not is_good_answer(term) or len(defn) < 10:
            continue
        if not any(term.endswith(s) for s in GOOD_SUFFIXES):
            continue

        ctx = make_context(item['section'], item['subsection'])
        dedup_key = (ctx, term)
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        defn = truncate_def(defn, 65)
        if ctx:
            content = f"{ctx}에서, {defn}에 해당하는 것은 ( )이다."
        else:
            content = f"{defn}에 해당하는 것은 ( )이다."

        if is_good_question(content):
            questions.append({
                'content': content,
                'modelAnswer': term,
                'source_file': file_key,
            })

    return questions


# ── Strategy 6: Counseling principles ─────────────────────────────

def strategy_counseling_principles(sections: list, file_key: str) -> list:
    """Match "X의 원리: description" patterns."""
    questions = []
    seen = set()

    for item in sections:
        line = item['line']
        m = re.match(
            rf'(?:{CIRCLED_NUM}|{SUB_CIRCLED})\s*(.+의\s*원리)\s*[:：]\s*(.+)',
            line
        )
        if not m:
            continue

        principle = clean_text(m.group(1))
        description = clean_text(m.group(2))

        if not is_good_answer(principle) or len(description) < 10:
            continue

        key = ('principle', principle)
        if key in seen:
            continue
        seen.add(key)

        ctx = make_context(item['section'], item['subsection'])
        description = truncate_def(description, 60)

        if ctx:
            content = f"{ctx}에서, '{description}'에 해당하는 원리는 ( )이다."
        else:
            content = f"'{description}'에 해당하는 원리는 ( )이다."

        if is_good_question(content):
            questions.append({
                'content': content,
                'modelAnswer': principle,
                'source_file': file_key,
            })

    return questions


# ── Strategy 7: Lifestyle/personality types ───────────────────────

def strategy_types(sections: list, file_key: str) -> list:
    """Match "X형: description" patterns for typologies."""
    questions = []
    seen = set()

    for item in sections:
        line = item['line']
        m = re.match(
            rf'(?:{CIRCLED_NUM}|{SUB_CIRCLED})\s*(.+형)\s*[:：]\s*(.+)',
            line
        )
        if not m:
            continue

        type_name = clean_text(m.group(1))
        description = clean_text(m.group(2))

        if not is_good_answer(type_name) or len(description) < 10:
            continue

        key = ('type', type_name)
        if key in seen:
            continue
        seen.add(key)

        ctx = make_context(item['section'], item['subsection'])
        description = truncate_def(description, 60)

        if ctx:
            content = f"{ctx}에서, {description}에 해당하는 유형은 ( )이다."
        else:
            content = f"{description}에 해당하는 유형은 ( )이다."

        if is_good_question(content):
            questions.append({
                'content': content,
                'modelAnswer': type_name,
                'source_file': file_key,
            })

    return questions


# ── Strategy 8: Named concepts (⑴ level, non-definition) ─────────

def strategy_named_concepts(sections: list, file_key: str) -> list:
    """
    Specific named concepts at ⑴ level that have known-concept suffixes.
    e.g., ⑴ 통계적기준, ⑴ 개별화의 원리, ⑴ 생활양식
    These are terms worth knowing by name.
    """
    questions = []
    seen = set()

    # Named concept suffixes worth questioning
    CONCEPT_SUFFIXES = (
        '기준', '원리', '양식', '감', '콤플렉스', '목적론', '관심',
        '지향', '전이', '역전이', '동맹', '저항', '자각', '직면',
        '불안', '방어기제', '자아', '초자아', '원본능', '리비도',
    )

    for item in sections:
        line = item['line']
        m = CIRCLED_DEF_RE.match(line)
        if not m:
            continue

        term = clean_text(m.group(2))
        defn = clean_text(m.group(3))

        if not is_good_answer(term):
            continue
        if not any(term.endswith(s) for s in CONCEPT_SUFFIXES):
            continue

        ctx = make_context(item['section'], item['subsection'])
        key = ('named', term, ctx)
        if key in seen:
            continue
        seen.add(key)

        defn = truncate_def(defn, 55)
        if ctx:
            content = f"{ctx}에서, '{defn}'에 해당하는 개념은 ( )이다."
        else:
            content = f"'{defn}'에 해당하는 개념은 ( )이다."

        if is_good_question(content):
            questions.append({
                'content': content,
                'modelAnswer': term,
                'source_file': file_key,
            })

    return questions


# ── Deduplication ──────────────────────────────────────────────────

def deduplicate(questions: list) -> list:
    """Remove duplicates. Keep best version per (answer, file)."""
    seen_content = set()
    by_answer_file = {}
    result = []

    for q in questions:
        content = q['content']
        answer = q['modelAnswer']
        fkey = q.get('source_file', '')

        if content in seen_content:
            continue
        seen_content.add(content)

        af_key = (answer, fkey)
        if af_key in by_answer_file:
            # Keep the one with better context (longer but within limits)
            existing = by_answer_file[af_key]
            if len(content) > len(existing['content']) and len(content) <= 180:
                result = [r for r in result if r is not existing]
                by_answer_file[af_key] = q
                result.append(q)
            continue

        by_answer_file[af_key] = q
        result.append(q)

    return result


# ── SQL generation ─────────────────────────────────────────────────

def escape_sql(s: str) -> str:
    return s.replace("'", "''")


def generate_sql(questions: list) -> str:
    lines = [
        "-- Auto-generated fill-in-the-blank questions from subnote texts",
        f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"-- Total: {len(questions)} questions",
        "",
    ]

    for q in questions:
        content_esc = escape_sql(q['content'])
        answer_esc = escape_sql(q['modelAnswer'])
        sid = q['subjectId']
        pref = escape_sql(q.get('pageRef', ''))

        lines.append(
            f"INSERT INTO Question "
            f"(content, modelAnswer, type, source, difficulty, subjectId, pageRef, createdAt) "
            f"VALUES ("
            f"'{content_esc}', '{answer_esc}', 'fill-in', 'subnote', 3, {sid}, "
            f"'{pref}', datetime('now'));"
        )

    return '\n'.join(lines)


# ── Main ───────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Subnote Fill-in-the-Blank Question Generator")
    print("=" * 60)
    print()

    if not INPUT_FILE.exists():
        print(f"ERROR: Input file not found: {INPUT_FILE}")
        sys.exit(1)

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        raw = f.read()
    # Strip null characters that may come from PDF extraction
    raw = raw.replace('\x00', '')
    data = json.loads(raw)

    print(f"Loaded {len(data)} files from subnote_texts.json\n")

    all_questions = []
    file_stats = {}
    subject_stats = {}

    strategies = [
        ('definition', strategy_definition_blanks),
        ('person_theory', strategy_person_theory),
        ('enumeration', strategy_enumeration_blanks),
        ('kr_en_terms', strategy_kr_en_terms),
        ('disorder_subtypes', strategy_disorder_subtypes),
        ('principles', strategy_counseling_principles),
        ('types', strategy_types),
        ('named_concepts', strategy_named_concepts),
    ]

    for file_key, file_data in sorted(data.items()):
        subject = file_data.get('subject', '')
        subject_id = file_data.get('subjectId', 0)
        full_text = file_data.get('full_text', '').replace('\x00', '')

        if not full_text:
            continue

        print(f"Processing: {file_key}")
        print(f"  Subject: {subject} (ID: {subject_id}), Text: {len(full_text)} chars")

        sections = parse_sections(full_text)

        file_questions = []
        strat_counts = {}

        for name, fn in strategies:
            qs = fn(sections, file_key)
            strat_counts[name] = len(qs)
            file_questions.extend(qs)

        file_questions = deduplicate(file_questions)

        for q in file_questions:
            q['subjectId'] = subject_id
            q['subject'] = subject
            q['pageRef'] = file_key

        n = len(file_questions)
        print(f"  Generated: {n} questions")
        for sname, cnt in strat_counts.items():
            if cnt > 0:
                print(f"    {sname}: {cnt}")

        file_stats[file_key] = n
        subject_stats[subject] = subject_stats.get(subject, 0) + n
        all_questions.extend(file_questions)
        print()

    all_questions = deduplicate(all_questions)
    total = len(all_questions)

    print("=" * 60)
    print(f"TOTAL: {total} questions\n")
    print("Per file:")
    for f, c in sorted(file_stats.items()):
        print(f"  {f}: {c}")
    print("\nPer subject:")
    for s, c in sorted(subject_stats.items()):
        print(f"  {s}: {c}")
    print()

    # Ensure output dirs
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_SQL.parent.mkdir(parents=True, exist_ok=True)

    # JSON output
    output_data = []
    for i, q in enumerate(all_questions, 1):
        output_data.append({
            'id': i,
            'content': q['content'],
            'modelAnswer': q['modelAnswer'],
            'type': 'fill-in',
            'source': 'subnote',
            'difficulty': 3,
            'subjectId': q['subjectId'],
            'subject': q['subject'],
            'pageRef': q['pageRef'],
        })

    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    print(f"JSON: {OUTPUT_JSON}")

    # SQL output
    sql = generate_sql(all_questions)
    with open(OUTPUT_SQL, 'w', encoding='utf-8') as f:
        f.write(sql)
    print(f"SQL:  {OUTPUT_SQL}\n")

    # Samples
    print("=" * 60)
    print("SAMPLE QUESTIONS:")
    print("=" * 60)
    # Show a spread of samples
    step = max(1, total // 15)
    for idx in range(0, total, step):
        q = output_data[idx]
        print(f"  [{q['id']:3d}] Q: {q['content']}")
        print(f"       A: {q['modelAnswer']}")
        print(f"       [{q['subject']}]\n")


if __name__ == '__main__':
    main()
