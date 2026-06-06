"""Held-out evaluation jobs — disjoint from jobs/seed.py (the demo set).

20 multi-hop QA questions for the allocator comparison, plus 5
unseen-category structured-extraction jobs for the "does it generalize?"
question (spec §17). Ground truths hand-verified.
"""
from canopy.jobs.schema import Job

# (question, ground_truth, category, hops)
HELDOUT_BANK: list[tuple[str, str, str, int]] = [
    # --- film / arts ---
    (
        "Who directed the film 'Jaws', and in which decade was it released?",
        "Steven Spielberg; the 1970s",
        "film",
        2,
    ),
    (
        "Which artist painted 'The Starry Night', and in which country was he born?",
        "Vincent van Gogh; the Netherlands",
        "film",
        2,
    ),
    (
        "Who composed the opera 'The Magic Flute', and in which city did he die?",
        "Wolfgang Amadeus Mozart; Vienna",
        "film",
        2,
    ),
    (
        "Which film won the first Academy Award for Best Picture, and in which year "
        "was that first ceremony held?",
        "Wings; 1929",
        "film",
        2,
    ),
    # --- geography ---
    (
        "What is the longest river in South America, and into which ocean does it empty?",
        "the Amazon; the Atlantic Ocean",
        "geography",
        2,
    ),
    (
        "Which is the smallest country in the world by area, and inside which city is it located?",
        "Vatican City; Rome",
        "geography",
        2,
    ),
    (
        "What is the capital of Australia, and is it larger or smaller in population than Sydney?",
        "Canberra; smaller",
        "geography",
        2,
    ),
    (
        "Which desert is the largest hot desert on Earth, and on which continent is it?",
        "the Sahara; Africa",
        "geography",
        2,
    ),
    (
        "What is the deepest point in the world's oceans, and in which ocean does it lie?",
        "the Challenger Deep (Mariana Trench); the Pacific Ocean",
        "geography",
        2,
    ),
    # --- science ---
    (
        "Which gas makes up the largest share of Earth's atmosphere, and roughly what "
        "percentage is it?",
        "Nitrogen; about 78%",
        "science",
        2,
    ),
    (
        "Who proposed the theory of general relativity, and in which year was it published?",
        "Albert Einstein; 1915",
        "science",
        2,
    ),
    (
        "What is the chemical symbol for gold, and from which language does that symbol derive?",
        "Au; Latin (aurum)",
        "science",
        2,
    ),
    (
        "Which planet is closest to the Sun, and how many moons does it have?",
        "Mercury; zero",
        "science",
        2,
    ),
    (
        "What particle carries a negative elementary charge, and who discovered it?",
        "the electron; J.J. Thomson",
        "science",
        2,
    ),
    # --- history / literature ---
    (
        "Who was the first President of the United States, and in which year did he take office?",
        "George Washington; 1789",
        "history",
        2,
    ),
    (
        "In which year did the Berlin Wall fall, and which two countries reunified afterward?",
        "1989; East Germany and West Germany",
        "history",
        2,
    ),
    (
        "Who wrote '1984', and in which year was it published?",
        "George Orwell; 1949",
        "literature",
        2,
    ),
    # --- 3-hop complex (the managers' niche) ---
    (
        "Who wrote 'Romeo and Juliet', in which century did he live, and in which "
        "English town was he born?",
        "William Shakespeare; the 16th-17th century; Stratford-upon-Avon",
        "literature",
        3,
    ),
    (
        "Which country hosted the 2008 Summer Olympics, what is its capital, and "
        "what is its most populous city?",
        "China; Beijing; Shanghai",
        "geography",
        3,
    ),
    (
        "Who discovered penicillin, in which year did the discovery happen, and "
        "which award did he share for it in 1945?",
        "Alexander Fleming; 1928; the Nobel Prize in Physiology or Medicine",
        "science",
        3,
    ),
]

# Unseen category: structured extraction — never appears in training/seed
# data or any agent's skill profile. (question, ground_truth, category, hops)
UNSEEN_BANK: list[tuple[str, str, str, int]] = [
    (
        "Extract as JSON with keys name, year, city: 'The Eiffel Tower was completed "
        "in 1889 for the World's Fair in Paris.'",
        '{"name": "Eiffel Tower", "year": 1889, "city": "Paris"}',
        "extraction",
        2,
    ),
    (
        "Extract as JSON with keys company, founder, year: 'Apple was founded by "
        "Steve Jobs, Steve Wozniak and Ronald Wayne in 1976.'",
        '{"company": "Apple", "founder": ["Steve Jobs", "Steve Wozniak", "Ronald Wayne"], "year": 1976}',
        "extraction",
        2,
    ),
    (
        "Extract as JSON with keys title, author, pages: 'War and Peace by Leo "
        "Tolstoy runs roughly 1,225 pages in its first English edition.'",
        '{"title": "War and Peace", "author": "Leo Tolstoy", "pages": 1225}',
        "extraction",
        2,
    ),
    (
        "Extract as JSON with keys element, symbol, atomic_number: 'Oxygen, with "
        "symbol O, has atomic number 8.'",
        '{"element": "Oxygen", "symbol": "O", "atomic_number": 8}',
        "extraction",
        2,
    ),
    (
        "Extract as JSON with keys mountain, height_m, range: 'K2 rises 8,611 "
        "meters in the Karakoram range.'",
        '{"mountain": "K2", "height_m": 8611, "range": "Karakoram"}',
        "extraction",
        2,
    ),
]


def heldout_jobs(include_unseen: bool = True, limit: int | None = None) -> list[Job]:
    bank = HELDOUT_BANK + (UNSEEN_BANK if include_unseen else [])
    if limit:
        bank = bank[:limit]
    return [
        Job(
            id=f"eval-{i:03d}",
            spec=q,
            category=cat,
            hops=hops,
            bounty_cap=10.0 * hops / 2,
            client_id="human",
            ground_truth=truth,
        )
        for i, (q, truth, cat, hops) in enumerate(bank)
    ]
