"""Demo job generator — multi-hop benchmark questions.

Ground-truth answers make Phase 2 scoring objective; the two-hop structure
makes Phase 3 subcontract decomposition natural. Sampling uses the seeded
RNG so a scenario run is reproducible.
"""
import random

from canopy.config import settings
from canopy.jobs.schema import Job

# (question, ground_truth) — ground truth is held out for the scorer/eval only.
QUESTION_BANK: list[tuple[str, str]] = [
    (
        "Which year was the director of the film 'Inception' born, "
        "and what other film did he direct in 2014?",
        "1970; Interstellar",
    ),
    (
        "What is the capital of the country that hosted the 2016 Summer Olympics, "
        "and on which continent is that country?",
        "Brasília; South America",
    ),
    (
        "Which chemical element has an atomic number equal to the number of players "
        "on a soccer team, and what is its symbol?",
        "Sodium; Na",
    ),
    (
        "Who wrote 'Pride and Prejudice', and in which century was that author born?",
        "Jane Austen; the 18th century",
    ),
    (
        "What is the largest planet in the solar system, and who first observed "
        "its four largest moons?",
        "Jupiter; Galileo Galilei",
    ),
    (
        "Which country has the world's longest coastline, and what is its capital?",
        "Canada; Ottawa",
    ),
    (
        "Who painted the Mona Lisa, and in which museum does it hang today?",
        "Leonardo da Vinci; the Louvre",
    ),
    (
        "What is the chemical formula of table salt, and which two elements compose it?",
        "NaCl; sodium and chlorine",
    ),
    (
        "Which US president appears on the $5 bill, and in which year was he assassinated?",
        "Abraham Lincoln; 1865",
    ),
    (
        "What is the tallest mountain above sea level, and on the border of which "
        "two countries does its summit sit?",
        "Mount Everest; Nepal and China",
    ),
]


def seed_jobs(n: int, rng: random.Random, client_id: str = "human") -> list[Job]:
    picks = [QUESTION_BANK[i % len(QUESTION_BANK)] for i in range(n)]
    rng.shuffle(picks)
    return [
        Job(
            id=f"job-{i:03d}",
            spec=question,
            category="multi-hop-qa",
            bounty_cap=settings.default_bounty_cap,
            client_id=client_id,
            ground_truth=truth,
        )
        for i, (question, truth) in enumerate(picks)
    ]
