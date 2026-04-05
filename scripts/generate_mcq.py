"""
Generate multiple-choice questions (MCQ) from subnote_texts.json.

Strategies:
  1. Definition Matching - term:definition pairs from numbered items
  2. Odd One Out - 3 correct + 1 wrong from different section
  3. Person-Theory Matching - theorist-concept associations
  4. Concept-Description Matching - description -> concept name
  5. True/False Style (which is correct) - from comparison tables

Output:
  - JSON: Makeup/parsed/mcq_questions.json
  - SQL:  app/scripts/import-mcq.sql
"""

import json
import re
import os
import sys
import random
from dataclasses import dataclass, field, asdict
from typing import Optional

sys.stdout.reconfigure(encoding='utf-8')
random.seed(42)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE = r"C:\Users\HOSEO\Desktop\임용"
INPUT_PATH = os.path.join(BASE, "Makeup", "subnote_texts.json")
JSON_OUT = os.path.join(BASE, "Makeup", "parsed", "mcq_questions.json")
SQL_OUT = os.path.join(BASE, "app", "scripts", "import-mcq.sql")

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------
@dataclass
class MCQ:
    question: str
    choices: list  # ["A. ...", "B. ...", "C. ...", "D. ..."]
    answer: str    # "A", "B", "C", "D"
    difficulty: int
    subjectId: int
    source_file: str
    strategy: str

    @property
    def content(self) -> str:
        return self.question + "\n" + "\n".join(self.choices)


# ---------------------------------------------------------------------------
# Text cleaning
# ---------------------------------------------------------------------------
WATERMARK_RE = re.compile(r"루시아의\s*전문상담교사\s*서브노트.*?\]")
PAGE_NUM_RE = re.compile(r"^\d{1,3}\s*$", re.MULTILINE)
CID_RE = re.compile(r"\(cid:\d+\)")

def clean_text(text: str) -> str:
    text = WATERMARK_RE.sub("", text)
    text = PAGE_NUM_RE.sub("", text)
    text = CID_RE.sub("", text)
    # collapse multiple blank lines
    text = re.compile(r"\n{3,}").sub("\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def split_major_sections(text: str) -> list:
    """Split by major section headers like ' 1 ', ' 2 ' etc (with box-style numbers)."""
    # Pattern matches section headers like " 1  Title" or "1 Title" at start of line
    parts = re.split(r"\n\s*(?=\d{1,2}\s+[가-힣])", text)
    sections = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        # Extract section number and title
        m = re.match(r"(\d{1,2})\s+(.+?)(?:\n|$)", part)
        if m:
            sections.append({
                "number": int(m.group(1)),
                "title": m.group(2).strip(),
                "content": part
            })
        else:
            sections.append({
                "number": 0,
                "title": "",
                "content": part
            })
    return sections


def extract_numbered_items(text: str) -> list:
    """Extract ⑴, ⑵, ⑶ ... style numbered items with their content."""
    # Unicode parenthesized numbers: ⑴-⒇
    pattern = re.compile(r"([⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽⑾⑿⒀⒁⒂⒃⒄⒅⒆⒇])\s*(.+?)(?=\n[⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽⑾⑿⒀⒁⒂⒃⒄⒅⒆⒇]|\n\d+\.\s|\n\s*$|\Z)", re.DOTALL)
    items = []
    for m in pattern.finditer(text):
        num_char = m.group(1)
        content = m.group(2).strip()
        # Clean up multiline content
        content = re.sub(r"\s+", " ", content)
        items.append({"marker": num_char, "text": content})
    return items


def extract_circled_items(text: str) -> list:
    """Extract ①, ②, ③ ... style items."""
    pattern = re.compile(r"([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮])\s*(.+?)(?=\n[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]|\n[⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽]|\n\d+\.\s|\Z)", re.DOTALL)
    items = []
    for m in pattern.finditer(text):
        content = re.sub(r"\s+", " ", m.group(2).strip())
        items.append({"marker": m.group(1), "text": content})
    return items


def parse_term_definition(item_text: str) -> Optional[tuple]:
    """Parse 'term: definition' or 'term - definition' pattern."""
    # Try colon separator
    m = re.match(r"^([^:：]{2,20})[：:]\s*(.+)$", item_text)
    if m:
        term = m.group(1).strip()
        definition = m.group(2).strip()
        # Skip if term is too generic
        if len(term) < 2 or len(definition) < 5:
            return None
        return (term, definition)
    return None


def extract_subsections(text: str) -> list:
    """Extract numbered subsections like '1. Title', '2. Title'."""
    pattern = re.compile(r"(\d+)\.\s+(.+?)(?=\n\d+\.\s|\Z)", re.DOTALL)
    subs = []
    for m in pattern.finditer(text):
        subs.append({
            "number": int(m.group(1)),
            "title": m.group(2).split("\n")[0].strip(),
            "content": m.group(2).strip()
        })
    return subs


def extract_person_theory(text: str) -> list:
    """Extract person-theory associations from text."""
    pairs = []
    # Patterns like "Ellis의 합리적 정서행동치료"
    for m in re.finditer(r"([A-Za-z가-힣]+(?:\s*[A-Za-z가-힣]+)?)\s*(?:의|가\s*제시한|이\s*주장한)\s+([가-힣A-Za-z()（）\s]{3,30}?)(?:[을를은는이가에서]|\s*$|[,.])", text):
        person = m.group(1).strip()
        theory = m.group(2).strip()
        if len(person) >= 2 and len(theory) >= 3:
            pairs.append((person, theory))

    # Patterns like "학자(Name)" or "(Name)" associated with a concept
    for m in re.finditer(r"([가-힣A-Za-z]{3,30}?)\s*[（(]([A-Za-z\s.]+)[)）]", text):
        concept = m.group(1).strip()
        person = m.group(2).strip()
        if len(person) >= 3 and len(concept) >= 3:
            pairs.append((person, concept))

    return pairs


def extract_comparison_table(text: str) -> list:
    """Extract comparison tables from text (e.g., 신경증 vs 정신증)."""
    tables = []
    # Look for patterns with two concepts being compared in tabular form
    lines = text.split("\n")
    for i, line in enumerate(lines):
        # Look for lines with exactly 2 concepts separated by spaces
        stripped = line.strip()
        if re.match(r"^[가-힣]+\s{2,}[가-힣]+\s*$", stripped):
            parts = stripped.split()
            if len(parts) == 2:
                concept_a, concept_b = parts
                # Collect comparison rows
                rows = []
                for j in range(i + 1, min(i + 10, len(lines))):
                    row_line = lines[j].strip()
                    if not row_line or re.match(r"^\d+\.", row_line):
                        break
                    row_parts = re.split(r"\s{2,}", row_line)
                    if len(row_parts) >= 2:
                        rows.append(row_parts)
                if rows:
                    tables.append({
                        "concepts": (concept_a, concept_b),
                        "rows": rows
                    })
    return tables


# ---------------------------------------------------------------------------
# Question generators
# ---------------------------------------------------------------------------

def make_choices(correct: str, distractors: list, shuffle: bool = True) -> tuple:
    """Build (choices_list, answer_letter). Always 4 options."""
    options = [correct] + distractors[:3]
    if len(options) < 4:
        return None, None
    if shuffle:
        random.shuffle(options)
    letters = ["A", "B", "C", "D"]
    answer_idx = options.index(correct)
    choices = [f"{letters[i]}. {options[i]}" for i in range(4)]
    return choices, letters[answer_idx]


def gen_definition_matching(sections_data: list, subject_id: int, filename: str) -> list:
    """Strategy 1: Definition Matching questions."""
    questions = []

    for section in sections_data:
        content = section["content"]
        subsections = extract_subsections(content)

        for sub in subsections:
            items = extract_numbered_items(sub["content"])
            if len(items) < 4:
                continue

            # Parse term:definition pairs
            td_pairs = []
            for item in items:
                parsed = parse_term_definition(item["text"])
                if parsed:
                    td_pairs.append(parsed)

            if len(td_pairs) < 4:
                continue

            # Generate questions for each term-definition pair (use first 4)
            for i, (term, definition) in enumerate(td_pairs[:min(len(td_pairs), 6)]):
                # Truncate definition if too long
                short_def = definition[:80] + "..." if len(definition) > 80 else definition

                # Question: which term matches this definition?
                other_terms = [t for t, d in td_pairs if t != term]
                if len(other_terms) < 3:
                    continue
                distractors = random.sample(other_terms, 3)
                choices, answer = make_choices(term, distractors)
                if choices is None:
                    continue

                q_text = f"{sub['title']}에서 '{short_def}'에 해당하는 것은?"
                questions.append(MCQ(
                    question=q_text,
                    choices=choices,
                    answer=answer,
                    difficulty=3,
                    subjectId=subject_id,
                    source_file=filename,
                    strategy="definition_matching"
                ))

                # Reverse: which definition matches this term?
                other_defs = [(t, d) for t, d in td_pairs if t != term]
                if len(other_defs) < 3:
                    continue
                distractor_defs = [d[:60] for t, d in random.sample(other_defs, 3)]
                correct_def = definition[:60]
                choices2, answer2 = make_choices(correct_def, distractor_defs)
                if choices2 is None:
                    continue

                q_text2 = f"'{term}'에 대한 설명으로 옳은 것은?"
                questions.append(MCQ(
                    question=q_text2,
                    choices=choices2,
                    answer=answer2,
                    difficulty=3,
                    subjectId=subject_id,
                    source_file=filename,
                    strategy="definition_matching"
                ))

    return questions


def gen_odd_one_out(sections_data: list, subject_id: int, filename: str) -> list:
    """Strategy 2: Odd One Out questions."""
    questions = []

    # Collect items by subsection for cross-section distractor picking
    all_subsection_items = []

    for section in sections_data:
        content = section["content"]
        subsections = extract_subsections(content)
        for sub in subsections:
            items = extract_numbered_items(sub["content"])
            # Also try circled items
            circled = extract_circled_items(sub["content"])
            all_items = items + circled

            term_items = []
            for item in all_items:
                parsed = parse_term_definition(item["text"])
                if parsed:
                    term_items.append(parsed[0])  # just the term
                else:
                    # Use first ~25 chars as a short label
                    short = item["text"][:40].strip()
                    if len(short) >= 4:
                        term_items.append(short)

            if len(term_items) >= 3:
                all_subsection_items.append({
                    "title": sub["title"],
                    "section_title": section.get("title", ""),
                    "items": term_items
                })

    # Generate odd-one-out by combining items from different subsections
    for i, group_a in enumerate(all_subsection_items):
        if len(group_a["items"]) < 3:
            continue
        for j, group_b in enumerate(all_subsection_items):
            if i == j:
                continue
            if len(group_b["items"]) < 1:
                continue
            # Don't mix different major sections excessively
            if group_a["section_title"] != group_b["section_title"] and group_a["section_title"] and group_b["section_title"]:
                continue

            # Pick 3 from group_a, 1 from group_b
            correct_items = random.sample(group_a["items"], min(3, len(group_a["items"])))
            if len(correct_items) < 3:
                continue
            odd_item = random.choice(group_b["items"])

            # Truncate items
            correct_items = [c[:40] for c in correct_items]
            odd_item = odd_item[:40]

            # Skip if odd item overlaps with correct items
            if odd_item in correct_items:
                continue

            choices, answer = make_choices(odd_item, correct_items)
            if choices is None:
                continue

            q_text = f"다음 중 '{group_a['title']}'에 해당하지 않는 것은?"
            questions.append(MCQ(
                question=q_text,
                choices=choices,
                answer=answer,
                difficulty=3,
                subjectId=subject_id,
                source_file=filename,
                strategy="odd_one_out"
            ))

    return questions


# ---------------------------------------------------------------------------
# Person-Theory knowledge base (manually curated from subnote content)
# ---------------------------------------------------------------------------
PERSON_THEORY_DB = [
    # 상담이론
    ("Ellis", "합리적 정서행동치료(REBT)"),
    ("Beck", "인지치료"),
    ("Rogers", "인간중심 상담"),
    ("Perls", "게슈탈트 상담"),
    ("Adler", "개인심리학"),
    ("Freud", "정신분석"),
    ("Jung", "분석심리학"),
    ("Frankl", "실존주의 상담(로고테라피)"),
    ("Skinner", "행동주의"),
    ("Bandura", "사회학습이론"),
    ("Glasser", "현실치료"),
    ("Berne", "교류분석(TA)"),
    ("Lazarus", "다중양식치료"),
    ("Meichenbaum", "인지행동수정"),
    ("Wolpe", "체계적 둔감법"),
    ("Minuchin", "구조적 가족치료"),
    ("Satir", "경험적 가족치료"),
    ("Bowen", "다세대 가족치료"),
    ("Haley", "전략적 가족치료"),
    ("Williamson", "지시적 상담"),
    ("Dreikurs", "격려 기법"),
    # 이상심리학
    ("Salkovskis", "침투적 사고와 자동적 사고"),
    ("Rachman", "파국적 해석"),
    ("Wegner", "사고억제의 역설적 효과"),
    ("Seligman", "학습된 무기력"),
    ("Watson", "고전적 조건형성(Little Albert)"),
    ("Mowrer", "2요인 이론"),
    ("Summerfeldt", "위험회피와 불완전감"),
    ("O'Connor", "추론융합"),
    ("Veale", "신체상에 대한 부정적 평가"),
    ("Vaihinger", "허구적 최종목적론"),
    ("Mosak", "다섯 가지 인생과제"),
]


def gen_person_theory(sections_data: list, subject_id: int, filename: str) -> list:
    """Strategy 3: Person-Theory Matching questions."""
    questions = []

    # Filter relevant entries based on subject
    if subject_id == 13:  # 이상심리학
        relevant = [(p, t) for p, t in PERSON_THEORY_DB if any(
            kw in t for kw in ["사고", "해석", "효과", "무기력", "조건형성", "이론", "융합", "평가", "추론", "불완전"]
        )]
    else:  # 상담이론
        relevant = [(p, t) for p, t in PERSON_THEORY_DB if not any(
            kw in t for kw in ["사고와 자동적", "파국적 해석", "역설적 효과", "학습된 무기력", "Little Albert", "2요인", "불완전감", "추론융합", "부정적 평가"]
        )]

    if len(relevant) < 4:
        return questions

    for person, theory in relevant:
        # Who developed this theory?
        other_persons = [p for p, t in relevant if p != person]
        if len(other_persons) < 3:
            continue
        distractors = random.sample(other_persons, 3)
        choices, answer = make_choices(person, distractors)
        if choices is None:
            continue

        q_text = f"'{theory}'와 관련이 깊은 학자는?"
        questions.append(MCQ(
            question=q_text,
            choices=choices,
            answer=answer,
            difficulty=3,
            subjectId=subject_id,
            source_file=filename,
            strategy="person_theory"
        ))

        # What theory is this person associated with?
        other_theories = [t for p, t in relevant if t != theory]
        if len(other_theories) < 3:
            continue
        dist_theories = random.sample(other_theories, 3)
        choices2, answer2 = make_choices(theory, dist_theories)
        if choices2 is None:
            continue

        q_text2 = f"{person}와(과) 가장 관련이 깊은 이론 또는 개념은?"
        questions.append(MCQ(
            question=q_text2,
            choices=choices2,
            answer=answer2,
            difficulty=3,
            subjectId=subject_id,
            source_file=filename,
            strategy="person_theory"
        ))

    return questions


# ---------------------------------------------------------------------------
# Concept-Description knowledge base (curated from subnote content)
# ---------------------------------------------------------------------------
CONCEPT_DESC_DB = {
    13: [  # 이상심리학
        # 방어기제
        ("투사", "자신이 받아들일 수 없는 충동이나 감정을 다른 사람의 것으로 돌리는 것"),
        ("반동형성", "받아들일 수 없는 충동과 반대되는 행동을 하는 것"),
        ("합리화", "자신의 행동에 대해 그럴듯한 이유를 붙여 정당화하는 것"),
        ("억압", "위협적인 생각이나 감정을 의식 밖으로 밀어내는 것"),
        ("승화", "사회적으로 용납되지 않는 욕구를 사회적으로 바람직한 방향으로 전환하는 것"),
        ("퇴행", "이전 발달단계의 행동으로 되돌아가는 것"),
        ("대치", "위협적인 대상 대신 덜 위협적인 대상에게 감정을 표출하는 것"),
        ("부정", "고통스러운 현실을 인정하지 않으려 하는 것"),
        ("격리", "감정과 사고를 분리시켜 감정 없이 사건을 회상하는 것"),
        ("취소", "이미 한 행동의 효과를 상징적으로 되돌리려는 시도"),
        # 장애 핵심 특징
        ("범불안장애", "수많은 일상 활동에서의 지나친 불안이 6개월 이상 지속"),
        ("특정공포증", "특정한 대상이나 상황에 대한 극심한 공포와 회피"),
        ("사회불안장애", "주목, 평가받는 관계나 상황에서의 불안과 회피"),
        ("공황장애", "공황발작과 함께 걱정이나 부적응 행동이 1개월 이상"),
        ("강박장애", "불안을 유발하는 강박사고나 강박행동으로 시간을 소모"),
        ("분리불안장애", "애착대상과의 분리에 대한 두려움이 6개월 이상"),
        ("광장공포증", "2가지 이상의 상황에서 당혹스러운 증상에 대한 불안"),
        ("선택적함구증", "말할 능력은 있으나 특정 사회적 상황에서 말하지 않음"),
        # 신경증 vs 정신증
        ("신경증", "현실판단력 정상, 경미한 부적응, 자기통찰 있음"),
        ("정신증", "현실판단력 손상, 심각한 부적응, 자기통찰 없음"),
        # 강박 관련
        ("신체이형장애", "미미한 신체적 외모의 결함에 대한 지나친 몰두와 집착"),
        ("수집광", "물건을 버리는 것을 어려워하고 고통으로 여기는 장애"),
        ("발모광", "탈모로 이어지는 반복적인 털 뽑기 행동"),
        ("피부뜯기장애", "반복적으로 피부를 벗기거나 뜯어 손상시키는 행동"),
        # 치료법
        ("체계적 둔감법", "긴장을 이완시킨 상태에서 약한 공포자극부터 시작하여 점진적으로 노출"),
        ("노출 및 반응방지법", "두려워하는 자극에 노출시키되 강박행동을 하지 못하게 하는 치료"),
        ("사고중지기법", "강박사고가 떠오를 때 '그만!'이라고 소리쳐 집착을 완화"),
        ("역설적 의도", "강박행동을 오히려 과장된 방식으로 하려고 시도하는 치료"),
        # 분류
        ("범주적 분류", "이상행동이 정상행동과 질적으로 구분된다는 가정에 근거"),
        ("차원적 분류", "정상과 이상의 구분이 정도의 문제일 뿐 질적 차이는 없다는 가정"),
        # 인지적 특성
        ("사고-행위 융합", "생각한 것이 곧 행위한 것과 다르지 않다는 믿음"),
        ("추론융합", "상상한 가능성과 현실적 가능성을 혼동하여 행동하는 것"),
    ],
    10: [  # 상담이론 및 실제
        # 상담 기법
        ("경청", "상담자가 내담자의 말과 행동을 적극적으로 듣는 것"),
        ("재진술", "내담자가 말한 내용을 다시 한 번 반복해 주는 것"),
        ("요약", "내담자의 여러 가지 생각과 감정을 간략하게 묶어 정리하는 것"),
        ("명료화", "불확실하거나 모호한 내용을 찾아 지적하고 확인하는 대화 기술"),
        ("감정반영", "내담자가 말한 내용에서 감정과 관련된 부분을 바꾸어 말하는 것"),
        ("질문", "생략된 정보를 보완하고 내담자 말의 의미를 구체화하고자 할 때 사용"),
        ("직면", "내담자가 모르거나 인정을 거부하는 생각과 느낌에 주목하게 하는 개입"),
        ("해석", "내담자의 생활경험과 행동의 의미를 새로운 각도에서 설명해 주는 것"),
        ("즉시성", "상담 순간에 느껴지는 상담자의 감정과 직관을 내담자에게 내놓는 것"),
        ("자기개방", "상담자가 자신의 생각, 가치, 느낌 등을 내담자에게 드러내 보이는 것"),
        # 상담 원리
        ("개별화의 원리", "내담자들의 개성과 개인차를 고려하여 상담에 임하는 것"),
        ("비심판적 태도의 원리", "내담자의 행위에 대하여 판단이나 비판을 하지 않는 것"),
        ("자기결정의 원리", "내담자가 스스로 선택하고 결정한다는 것"),
        ("비밀보장의 원리", "상담과정의 모든 사항을 제3자가 알지 못하도록 하는 것"),
        ("수용의 원리", "내담자를 인격체로 존중한다는 의미"),
        ("통제된 정서관여의 원리", "내담자의 감정에 민감하게 반응하면서도 자신의 감정을 적절히 통제"),
        ("진실성의 원리", "상담자는 내담자에게 진실된 모습을 보여야 한다는 것"),
        # 윤리 원칙
        ("자율성 존중", "내담자가 자신의 행동을 스스로 결정하고 처리할 수 있는 존재로 존중"),
        ("비유해성", "내담자에게 해를 끼치지 않을 것이라고 확신할 수 있는 개입만 사용"),
        ("선의", "다른 사람에게 선행을 베풀겠다는 의도를 가지고 행동하는 것"),
        ("공정성", "인종, 성별, 종교를 이유로 내담자를 차별하지 않는 것"),
        ("충실성", "내담자와의 약속과 진실에 충실하여 신뢰를 이끌어 내는 것"),
        # 아들러 개념
        ("생활양식", "인생의 목표를 달성하기 위하여 개인이 지닌 특성(성격과 유사)"),
        ("사회적 관심", "개인의 이익보다 사회발전을 위해 다른 사람과 협력하는 것"),
        ("허구적 최종목적론", "허구 속에서 목적을 추구하며 살아가는 인간의 행동을 이해하는 개념"),
        ("열등감", "자기완성을 위한 필수요인이자 모든 노력의 근원"),
        ("창조적 자기", "자유와 선택을 강조하며 인간이 스스로 자신의 삶을 만들어 나간다는 개념"),
        # 아들러 생활양식 유형
        ("지배형", "부모의 독재적 양육으로 상대방에게 지배와 복종을 강요"),
        ("기생형", "과잉보호 양육으로 의존성이 강한 생활양식"),
        ("회피형", "용기를 꺾어버린 양육으로 소극적이며 부정적인 태도"),
        ("사회적 유용형", "높은 사회적 관심으로 자신과 타인의 욕구를 동시에 충족"),
        # REBT 관련
        ("비합리적 신념", "합리적이지 못한 방식으로 받아들여 자기 패배적 결과를 가져오는 신념"),
        ("논박", "내담자의 비합리적 신념을 합리적 신념으로 수정하기 위한 적극적 개입"),
        # 열등감 콤플렉스 원천
        ("기관열등감", "신체 특유의 기관에 대한 열등감"),
        ("과잉보호", "자녀를 지나치게 보호하는 양육태도에서 비롯된 열등감"),
        ("양육태만", "부모가 자녀에 대한 최소한의 도리를 하지 않는 것에서 비롯된 열등감"),
        # 비행행동 목적
        ("관심 끌기", "주변 사람들의 관심과 주의를 끌기 위한 비행행동"),
    ]
}


def gen_concept_description(subject_id: int, filename: str) -> list:
    """Strategy 4: Concept-Description Matching questions."""
    questions = []
    db = CONCEPT_DESC_DB.get(subject_id, [])
    if len(db) < 4:
        return questions

    for concept, description in db:
        # "다음 설명에 해당하는 것은?"
        other_concepts = [c for c, d in db if c != concept]
        if len(other_concepts) < 3:
            continue
        distractors = random.sample(other_concepts, 3)
        choices, answer = make_choices(concept, distractors)
        if choices is None:
            continue

        short_desc = description[:80] + "..." if len(description) > 80 else description
        q_text = f"다음 설명에 해당하는 것은?\n\"{short_desc}\""
        questions.append(MCQ(
            question=q_text,
            choices=choices,
            answer=answer,
            difficulty=3,
            subjectId=subject_id,
            source_file=filename,
            strategy="concept_description"
        ))

    return questions


# ---------------------------------------------------------------------------
# Curated Concept Groups for better odd-one-out questions
# ---------------------------------------------------------------------------
CONCEPT_GROUPS = {
    13: [  # 이상심리학
        {
            "title": "이상행동의 판별기준",
            "items": ["통계적 기준", "개인적 기준", "문화적 기준", "기능적 기준"],
            "distractors": ["경제적 기준", "도덕적 기준", "법적 기준", "종교적 기준"]
        },
        {
            "title": "경험과학의 네 가지 기능",
            "items": ["기술", "설명", "예측", "통제"],
            "distractors": ["분류", "해석", "비교", "일반화"]
        },
        {
            "title": "이론적 입장",
            "items": ["정신분석 입장", "행동주의 입장", "인지적 입장", "생물학적 입장"],
            "distractors": ["실존주의 입장", "인본주의 입장", "구성주의 입장", "사회문화적 입장"]
        },
        {
            "title": "범주적 분류의 장점",
            "items": ["의사소통 원활", "체계적 연구", "치료법 개발과 적용"],
            "distractors": ["개인 정보 유실", "낙인 효과", "선입견 형성", "정보 왜곡"]
        },
        {
            "title": "범주적 분류의 단점",
            "items": ["개인정보 유실", "낙인 효과", "예후와 치료 효과에 대한 선입견"],
            "distractors": ["의사소통 원활", "체계적 연구", "치료법 개발", "객관적 평가"]
        },
        {
            "title": "불안장애의 하위유형",
            "items": ["범불안장애", "특정공포증", "광장공포증", "사회불안장애", "공황장애", "분리불안장애", "선택적함구증"],
            "distractors": ["강박장애", "외상후스트레스장애", "적응장애", "해리장애", "신체이형장애"]
        },
        {
            "title": "범불안장애의 인지적 특성",
            "items": ["잠재적 위험에 예민", "발생확률 높이 평가", "부정적 결과를 치명적으로 평가", "자신의 대처능력 과소평가"],
            "distractors": ["타인의 평가에 민감", "과거 경험에 집착", "완벽주의적 기준 설정", "사회적 비교 경향"]
        },
        {
            "title": "강박 및 관련 장애의 하위유형",
            "items": ["강박장애", "신체이형장애", "수집광", "발모광(털뽑기장애)", "피부뜯기장애"],
            "distractors": ["범불안장애", "사회불안장애", "공황장애", "분리불안장애"]
        },
        {
            "title": "강박장애의 하위유형",
            "items": ["순수한 강박사고형", "내현적 강박행동형", "외현적 강박행동형"],
            "distractors": ["자동적 사고형", "반복적 회피형", "사회적 철회형", "인지적 왜곡형"]
        },
        {
            "title": "강박장애의 인지행동적 치료",
            "items": ["노출 및 반응방지법", "사고중지기법", "역설적 의도", "인지적 치료기법"],
            "distractors": ["자유연상법", "꿈의 분석", "전이 분석", "체계적 둔감법"]
        },
        {
            "title": "책임감 감소 기법",
            "items": ["파이기법", "이중기준기법", "법정절차기법", "행동실험법"],
            "distractors": ["역할극", "비운 의자 기법", "과장기법", "둔감화 기법"]
        },
        {
            "title": "사고-행위 융합의 유형",
            "items": ["도덕성 융합", "발생가능성 융합"],
            "distractors": ["행동 융합", "정서 융합", "인지 융합", "사회적 융합"]
        },
    ],
    10: [  # 상담이론 및 실제
        {
            "title": "상담의 기본 원리",
            "items": ["개별화의 원리", "의도적인 감정표현의 원리", "통제된 정서관여의 원리", "수용의 원리", "비심판적 태도의 원리", "자기결정의 원리", "비밀보장의 원리", "진실성의 원리"],
            "distractors": ["객관성의 원리", "효율성의 원리", "전문성의 원리", "평가의 원리"]
        },
        {
            "title": "비밀보장 원칙의 예외",
            "items": ["자해, 자살 등 위급한 상황", "타인 또는 사회의 안전 위협", "법적으로 정보 공개가 요구되는 경우", "감염성 치명적 질병", "심각한 학대"],
            "distractors": ["내담자의 직장 문제", "경제적 어려움", "가벼운 대인관계 갈등", "학업 부진"]
        },
        {
            "title": "키츠너의 윤리적 상담 원칙",
            "items": ["자율성 존중", "비유해성(무해성)", "선의", "공정성(정의)", "충실성"],
            "distractors": ["효율성", "전문성", "객관성", "중립성"]
        },
        {
            "title": "상담의 주요 기법",
            "items": ["경청", "재진술", "요약", "명료화", "감정반영", "질문", "직면", "해석", "즉시성", "자기개방"],
            "distractors": ["자유연상", "꿈 분석", "전이 분석", "저항 분석"]
        },
        {
            "title": "사이버상담의 장점",
            "items": ["편의성", "익명성", "경제성", "내담자의 주도성"],
            "distractors": ["비언어적 소통 가능", "깊이 있는 관계 형성", "즉각적 위기 개입", "정확한 감정 파악"]
        },
        {
            "title": "사이버상담의 단점",
            "items": ["내담자의 책임감 부족", "정보 왜곡 가능성", "상담의 안정성 부족", "내담자 정보의 제한성"],
            "distractors": ["편의성 부족", "비용 과다", "접근성 부족", "기록 어려움"]
        },
        {
            "title": "아들러의 다섯 가지 인생과제",
            "items": ["영성", "자기지향", "일과 여가", "우정", "사랑"],
            "distractors": ["권력", "경쟁", "독립", "성취"]
        },
        {
            "title": "아들러의 생활양식 유형",
            "items": ["지배형", "기생형", "회피형", "사회적 유용형"],
            "distractors": ["도전형", "분석형", "창조형", "적응형"]
        },
        {
            "title": "열등감 콤플렉스의 원천",
            "items": ["기관열등감", "과잉보호", "양육태만"],
            "distractors": ["사회적 비교", "학업 부진", "경제적 결핍", "또래 거부"]
        },
        {
            "title": "아들러의 성격 평가방법",
            "items": ["초기회상", "꿈 분석", "출생순위 분석", "기본적 오류"],
            "distractors": ["투사적 검사", "표준화 검사", "행동 관찰", "자기보고식 검사"]
        },
        {
            "title": "비합리적 신념의 특징",
            "items": ["절대적인 강요와 당위", "사건에 대한 극단적 과장(재앙화)", "인간에 대한 일반화된 평가", "당위적 요구 좌절 시 참을 수 없다는 사고"],
            "distractors": ["현실적 기대", "유연한 선호", "상황에 따른 판단", "합리적 자기평가"]
        },
        {
            "title": "REBT 상담기법",
            "items": ["비합리적 신념에 대한 논박", "인지적 과제", "자신의 말 바꾸기", "유머 사용", "역할 연기", "수치심 공격하기", "합리적 정서 심상법"],
            "distractors": ["자유연상법", "꿈의 해석", "전이 분석", "빈 의자 기법"]
        },
    ]
}


def gen_curated_odd_one_out(subject_id: int, filename: str) -> list:
    """Generate high-quality odd-one-out questions from curated groups."""
    questions = []
    groups = CONCEPT_GROUPS.get(subject_id, [])

    for group in groups:
        title = group["title"]
        items = group["items"]
        distractors = group["distractors"]

        if len(items) < 3 or len(distractors) < 1:
            continue

        # Generate multiple questions per group
        num_qs = min(3, len(distractors))
        used_distractors = random.sample(distractors, num_qs)

        for distractor in used_distractors:
            correct_sample = random.sample(items, min(3, len(items)))
            choices, answer = make_choices(distractor, correct_sample)
            if choices is None:
                continue

            q_text = f"다음 중 '{title}'에 해당하지 않는 것은?"
            questions.append(MCQ(
                question=q_text,
                choices=choices,
                answer=answer,
                difficulty=3,
                subjectId=subject_id,
                source_file=filename,
                strategy="odd_one_out_curated"
            ))

        # Also generate "which IS correct" style
        if len(distractors) >= 3:
            correct_item = random.choice(items)
            wrong_items = random.sample(distractors, 3)
            choices, answer = make_choices(correct_item, wrong_items)
            if choices is None:
                continue

            q_text = f"다음 중 '{title}'에 해당하는 것은?"
            questions.append(MCQ(
                question=q_text,
                choices=choices,
                answer=answer,
                difficulty=3,
                subjectId=subject_id,
                source_file=filename,
                strategy="which_is_correct"
            ))

    return questions


# ---------------------------------------------------------------------------
# Additional curated True/False style questions
# ---------------------------------------------------------------------------
CURATED_TF_QUESTIONS = {
    13: [
        {
            "q": "신경증(neurosis)의 특징으로 옳은 것은?",
            "correct": "현실판단력이 정상적이며 자기통찰이 있다",
            "wrong": [
                "환각이나 망상 등 현실 왜곡 증상이 두드러진다",
                "사회적 적응에 심각한 곤란을 겪는다",
                "자기통찰이 없어 입원치료가 필요하다"
            ]
        },
        {
            "q": "정신증(psychosis)의 특징으로 옳은 것은?",
            "correct": "환각이나 망상과 같은 현실 왜곡적 증상이 두드러진다",
            "wrong": [
                "현실판단력이 정상적이다",
                "경미한 부적응만 보인다",
                "자기통찰이 있어 외래치료가 가능하다"
            ]
        },
        {
            "q": "범주적 분류의 특징으로 옳은 것은?",
            "correct": "이상행동이 정상행동과 질적으로 구분된다고 본다",
            "wrong": [
                "정상과 이상의 구분은 정도의 문제이다",
                "연속선상에서 범위로 분류한다",
                "양적인 차이만 존재한다고 본다"
            ]
        },
        {
            "q": "차원적 분류의 특징으로 옳은 것은?",
            "correct": "정상행동과 이상행동의 구분이 부적응성의 정도 문제이다",
            "wrong": [
                "이상행동은 정상행동과 질적으로 구분된다",
                "명료한 차이가 존재한다고 본다",
                "흑백논리적으로 분류한다"
            ]
        },
        {
            "q": "강박사고에 대한 설명으로 옳은 것은?",
            "correct": "반복적으로 의식에 침투하는 고통스러운 생각, 충동 또는 심상",
            "wrong": [
                "강박사고로 인한 불안을 감소시키기 위한 반복적 행동",
                "특정 대상에 대한 극심한 공포 반응",
                "의식적으로 떠올리는 긍정적 사고"
            ]
        },
        {
            "q": "강박행동에 대한 설명으로 옳은 것은?",
            "correct": "강박사고로 인한 불안을 감소시키기 위해 반복적으로 나타내는 행동",
            "wrong": [
                "반복적으로 의식에 침투하는 고통스러운 생각",
                "특정 상황에서의 회피 행동",
                "무의식적 갈등에 의한 자발적 행동"
            ]
        },
        {
            "q": "Mowrer의 2요인 이론에 대한 설명으로 옳은 것은?",
            "correct": "고전적 조건형성으로 공포 습득, 조작적 조건형성으로 공포 유지",
            "wrong": [
                "고전적 조건형성만으로 공포 습득 및 유지를 설명",
                "조작적 조건형성만으로 공포를 설명",
                "인지적 평가를 통한 공포 습득을 설명"
            ]
        },
        {
            "q": "Seligman의 준비성(preparedness)에 대한 설명으로 옳은 것은?",
            "correct": "생존을 위협하는 자극에는 공포반응을 더 쉽게 학습하는 생물학적 성향",
            "wrong": [
                "모든 자극에 대해 동일한 확률로 공포를 학습한다",
                "공포 반응은 전적으로 학습에 의해서만 결정된다",
                "무의식적 갈등이 공포의 유일한 원인이다"
            ]
        },
        {
            "q": "노출 및 반응방지법에 대한 설명으로 옳은 것은?",
            "correct": "두려워하는 자극에 노출시키되 강박행동을 하지 못하게 하는 치료법",
            "wrong": [
                "긴장을 이완시킨 상태에서 약한 자극부터 노출하는 방법",
                "강박행동을 오히려 과장하여 수행하도록 하는 방법",
                "강박사고가 떠오를 때 '그만!'이라고 외치는 방법"
            ]
        },
        {
            "q": "Wegner의 사고억제의 역설적 효과에 대한 설명으로 옳은 것은?",
            "correct": "어떤 생각을 억제하려 할수록 그 생각이 더 잘 떠오르는 현상",
            "wrong": [
                "사고를 억제하면 점점 약해지는 현상",
                "반복적 노출을 통해 사고가 소거되는 현상",
                "의식적 사고가 무의식으로 전환되는 현상"
            ]
        },
    ],
    10: [
        {
            "q": "Rogers의 인간중심 상담에서 강조하는 상담자의 태도로 옳은 것은?",
            "correct": "무조건적 긍정적 존중, 공감적 이해, 일치성(진실성)",
            "wrong": [
                "적극적이고 지시적인 역할",
                "비합리적 신념에 대한 직접적 논박",
                "과거 경험에 대한 해석과 분석"
            ]
        },
        {
            "q": "아들러의 개인심리학에서 인간관으로 옳은 것은?",
            "correct": "사회적이고 목적론적 존재(인간의 모든 행동은 목적이 있다)",
            "wrong": [
                "본능과 충동에 의해 결정되는 존재",
                "환경에 의해 수동적으로 형성되는 존재",
                "무의식적 갈등에 의해 지배받는 존재"
            ]
        },
        {
            "q": "REBT에서 심리적 장애의 근원지로 보는 것은?",
            "correct": "비합리적 신념",
            "wrong": [
                "무의식적 갈등",
                "어린 시절의 외상 경험",
                "뇌의 구조적 결함"
            ]
        },
        {
            "q": "Ellis의 ABCDE 모델에서 'D'에 해당하는 것은?",
            "correct": "비합리적 신념에 대한 논박(Dispute)",
            "wrong": [
                "선행사건(Activating event)",
                "정서적-행동적 결과(Consequence)",
                "신념과 사고방식(Belief)"
            ]
        },
        {
            "q": "REBT 상담자의 역할로 옳은 것은?",
            "correct": "적극적이고 지시적인 역할(교사, 토론가)",
            "wrong": [
                "비지시적이고 수동적인 역할",
                "내담자의 자유연상을 경청하는 역할",
                "내담자의 자기탐색만을 촉진하는 역할"
            ]
        },
        {
            "q": "상담에서 '직면' 기법에 대한 설명으로 옳은 것은?",
            "correct": "내담자가 모르거나 인정을 거부하는 생각과 느낌에 주목하게 하는 개입",
            "wrong": [
                "내담자가 말한 내용을 다시 한 번 반복해 주는 것",
                "내담자의 감정과 관련된 부분을 바꾸어 말하는 것",
                "상담 순간의 상담자 감정을 내담자에게 전달하는 것"
            ]
        },
        {
            "q": "상담에서 '즉시성' 기법에 대한 설명으로 옳은 것은?",
            "correct": "상담 순간에 느껴지는 상담자의 감정과 직관을 내담자에게 내놓는 것",
            "wrong": [
                "내담자의 말을 간략하게 요약하는 것",
                "불확실한 내용을 구체화하는 기법",
                "내담자의 비합리적 신념에 도전하는 것"
            ]
        },
        {
            "q": "사전동의에 대한 설명으로 옳은 것은?",
            "correct": "상담과정에서 경험하게 될 활동, 위험성 등을 알리고 내담자가 동의하는 것",
            "wrong": [
                "상담자가 일방적으로 상담 방법을 결정하는 것",
                "내담자의 문제를 제3자에게 공개하는 것",
                "상담 종결 후 추수 상담을 계획하는 것"
            ]
        },
        {
            "q": "아들러의 '열등감'에 대한 설명으로 옳은 것은?",
            "correct": "자기완성을 위한 필수요인이자 모든 노력의 근원(긍정적 측면)",
            "wrong": [
                "제거해야 할 병리적 증상",
                "타인과의 비교에서만 발생하는 감정",
                "무의식적 갈등의 결과"
            ]
        },
        {
            "q": "아들러의 '우월성 추구'에 대한 설명으로 옳은 것은?",
            "correct": "자기완성, 자아실현이라는 의미로 사용한 개념",
            "wrong": [
                "타인을 지배하고 통제하려는 욕구",
                "경쟁에서 반드시 이기려는 욕구",
                "사회적 지위를 높이려는 욕구"
            ]
        },
    ]
}


def gen_true_false(subject_id: int, filename: str) -> list:
    """Strategy 5: True/False style (which is correct) from curated data."""
    questions = []
    tf_items = CURATED_TF_QUESTIONS.get(subject_id, [])

    for item in tf_items:
        choices, answer = make_choices(item["correct"], item["wrong"])
        if choices is None:
            continue
        questions.append(MCQ(
            question=item["q"],
            choices=choices,
            answer=answer,
            difficulty=3,
            subjectId=subject_id,
            source_file=filename,
            strategy="true_false"
        ))

    return questions


# ---------------------------------------------------------------------------
# Additional parsed-based generators
# ---------------------------------------------------------------------------

def gen_from_parsed_sections(text: str, subject_id: int, filename: str) -> list:
    """Generate questions by parsing the actual text structure."""
    questions = []
    sections = split_major_sections(text)

    # Strategy 1 & 2 from parsed text
    questions.extend(gen_definition_matching(sections, subject_id, filename))

    return questions


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

def deduplicate(questions: list) -> list:
    """Remove duplicate questions based on content similarity."""
    seen = set()
    unique = []
    for q in questions:
        # Create a normalized key
        key = re.sub(r"\s+", "", q.question)[:60]
        if key not in seen:
            seen.add(key)
            unique.append(q)
    return unique


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def escape_sql(s: str) -> str:
    return s.replace("'", "''")


def to_json(questions: list) -> list:
    result = []
    for q in questions:
        result.append({
            "content": q.content,
            "modelAnswer": q.answer,
            "type": "multiple-choice",
            "source": "subnote",
            "difficulty": q.difficulty,
            "subjectId": q.subjectId,
            "strategy": q.strategy,
            "source_file": q.source_file,
        })
    return result


def to_sql(questions: list) -> str:
    lines = [
        "-- Auto-generated MCQ questions from subnote texts",
        f"-- Total: {len(questions)} questions",
        f"-- Generated by generate_mcq.py",
        "",
    ]
    for q in questions:
        content = escape_sql(q.content)
        answer = escape_sql(q.answer)
        source_file = escape_sql(q.source_file)
        lines.append(
            f"INSERT INTO Question (content, modelAnswer, type, source, difficulty, subjectId, pageRef, createdAt) "
            f"VALUES ('{content}', '{answer}', 'multiple-choice', 'subnote', {q.difficulty}, {q.subjectId}, "
            f"'{source_file}', datetime('now'));"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # Load input
    with open(INPUT_PATH, encoding="utf-8") as f:
        data = json.load(f)

    all_questions = []
    generated_subjects = set()  # Track which subjects already got static questions

    for filename, info in data.items():
        subject = info["subject"]
        subject_id = info["subjectId"]
        raw_text = info["full_text"]
        text = clean_text(raw_text)

        print(f"Processing: {filename} (subject={subject}, id={subject_id})")

        # Strategy 1 & 2: Parse-based (unique per file)
        parsed_qs = gen_from_parsed_sections(text, subject_id, filename)
        print(f"  Parsed definitions: {len(parsed_qs)}")
        all_questions.extend(parsed_qs)

        # Static knowledge-base strategies: generate only ONCE per subject
        if subject_id not in generated_subjects:
            generated_subjects.add(subject_id)

            # Strategy 3: Person-Theory
            pt_qs = gen_person_theory([], subject_id, filename)
            print(f"  Person-theory: {len(pt_qs)}")
            all_questions.extend(pt_qs)

            # Strategy 4: Concept-Description
            cd_qs = gen_concept_description(subject_id, filename)
            print(f"  Concept-description: {len(cd_qs)}")
            all_questions.extend(cd_qs)

            # Strategy 5: True/False
            tf_qs = gen_true_false(subject_id, filename)
            print(f"  True/false: {len(tf_qs)}")
            all_questions.extend(tf_qs)

            # Curated odd-one-out
            oo_qs = gen_curated_odd_one_out(subject_id, filename)
            print(f"  Curated odd-one-out: {len(oo_qs)}")
            all_questions.extend(oo_qs)
        else:
            print(f"  (static strategies already generated for subject {subject_id})")

    # Deduplicate
    before = len(all_questions)
    all_questions = deduplicate(all_questions)
    print(f"\nDeduplication: {before} -> {len(all_questions)}")

    # Assign varying difficulty
    for q in all_questions:
        if q.strategy == "true_false":
            q.difficulty = random.choice([2, 3])
        elif q.strategy in ("concept_description", "definition_matching"):
            q.difficulty = random.choice([2, 3, 3])
        elif q.strategy == "person_theory":
            q.difficulty = random.choice([3, 4])
        elif q.strategy in ("odd_one_out", "odd_one_out_curated", "which_is_correct"):
            q.difficulty = random.choice([3, 3, 4])

    # Output JSON
    os.makedirs(os.path.dirname(JSON_OUT), exist_ok=True)
    json_data = to_json(all_questions)
    with open(JSON_OUT, "w", encoding="utf-8") as f:
        json.dump(json_data, f, ensure_ascii=False, indent=2)
    print(f"\nJSON saved: {JSON_OUT} ({len(json_data)} questions)")

    # Output SQL
    os.makedirs(os.path.dirname(SQL_OUT), exist_ok=True)
    sql_data = to_sql(all_questions)
    with open(SQL_OUT, "w", encoding="utf-8") as f:
        f.write(sql_data)
    print(f"SQL saved: {SQL_OUT}")

    # Stats
    print(f"\n{'='*60}")
    print(f"Total questions: {len(all_questions)}")
    by_strategy = {}
    by_subject = {}
    for q in all_questions:
        by_strategy[q.strategy] = by_strategy.get(q.strategy, 0) + 1
        by_subject[q.subjectId] = by_subject.get(q.subjectId, 0) + 1

    print(f"\nBy strategy:")
    for s, c in sorted(by_strategy.items()):
        print(f"  {s}: {c}")
    print(f"\nBy subject:")
    for s, c in sorted(by_subject.items()):
        name = "이상심리학" if s == 13 else "상담이론 및 실제"
        print(f"  {name} (id={s}): {c}")

    # Difficulty distribution
    by_diff = {}
    for q in all_questions:
        by_diff[q.difficulty] = by_diff.get(q.difficulty, 0) + 1
    print(f"\nBy difficulty:")
    for d, c in sorted(by_diff.items()):
        print(f"  Level {d}: {c}")


if __name__ == "__main__":
    main()
