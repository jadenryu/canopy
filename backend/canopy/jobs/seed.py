"""Demo job generator — multi-hop benchmark questions.

Ground-truth answers make scoring objective; the multi-hop structure makes
subcontract decomposition natural. Questions are tagged by category (drives
RedisVL capability matching + per-category clearing prices) and by hop
count (3-hop "complex" jobs are the managers' niche — they decompose).
Sampling uses the seeded RNG so a scenario run is reproducible.
"""
import random

from canopy.config import settings
from canopy.jobs.schema import Job

# (question, ground_truth, category, hops)
QUESTION_BANK: list[tuple[str, str, str, int]] = [
    (
        "Which year was the director of the film 'Inception' born, "
        "and what other film did he direct in 2014?",
        "1970; Interstellar",
        "film",
        2,
    ),
    (
        "What is the capital of the country that hosted the 2016 Summer Olympics, "
        "and on which continent is that country?",
        "Brasília; South America",
        "geography",
        2,
    ),
    (
        "Which chemical element has an atomic number equal to the number of players "
        "on a soccer team, and what is its symbol?",
        "Sodium; Na",
        "science",
        2,
    ),
    (
        "Who wrote 'Pride and Prejudice', and in which century was that author born?",
        "Jane Austen; the 18th century",
        "literature",
        2,
    ),
    (
        "What is the largest planet in the solar system, and who first observed "
        "its four largest moons?",
        "Jupiter; Galileo Galilei",
        "science",
        2,
    ),
    (
        "Which country has the world's longest coastline, and what is its capital?",
        "Canada; Ottawa",
        "geography",
        2,
    ),
    (
        "Who painted the Mona Lisa, and in which museum does it hang today?",
        "Leonardo da Vinci; the Louvre",
        "film",  # arts & entertainment bucket
        2,
    ),
    (
        "What is the chemical formula of table salt, and which two elements compose it?",
        "NaCl; sodium and chlorine",
        "science",
        2,
    ),
    (
        "Which US president appears on the $5 bill, and in which year was he assassinated?",
        "Abraham Lincoln; 1865",
        "history",
        2,
    ),
    (
        "What is the tallest mountain above sea level, and on the border of which "
        "two countries does its summit sit?",
        "Mount Everest; Nepal and China",
        "geography",
        2,
    ),
    # --- 3-hop complex jobs: the managers' niche (decompose + subcontract) ---
    (
        "Which year was the director of 'Inception' born, what other film did he "
        "direct in 2014, and which actor appears in both of those films?",
        "1970; Interstellar; Michael Caine",
        "film",
        3,
    ),
    (
        "What is the largest planet in the solar system, who first observed its "
        "four largest moons, and in which year did that observation happen?",
        "Jupiter; Galileo Galilei; 1610",
        "science",
        3,
    ),
    (
        "Which country has the world's longest coastline, what is its capital, "
        "and on which river does that capital sit?",
        "Canada; Ottawa; the Ottawa River",
        "geography",
        3,
    ),
]


def seed_jobs(n: int, rng: random.Random, client_id: str = "human") -> list[Job]:
    picks = [QUESTION_BANK[i % len(QUESTION_BANK)] for i in range(n)]
    rng.shuffle(picks)
    return [
        Job(
            id=f"job-{i:03d}",
            spec=question,
            category=category,
            hops=hops,
            # complex jobs carry a bigger bounty — more hops, more value
            bounty_cap=settings.default_bounty_cap * hops / 2,
            client_id=client_id,
            ground_truth=truth,
        )
        for i, (question, truth, category, hops) in enumerate(picks)
    ]
