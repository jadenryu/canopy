# Canopy evaluation results — market vs. baselines

Formal `weave.Evaluation` (`canopy-allocator-eval`): 3 held-out jobs (incl. 0 unseen-category), seeds [42], identical fleet/scorer/lifecycle — only the assignment rule differs.

| condition | quality (mean±std) | accuracy | paid/job | quality-per-dollar |
|---|---|---|---|---|
| **market** | 1.000 ± 0.000 | 1.00 ± 0.00 | 2.10 ± 0.00 | 0.477 ± 0.000 |
| **round_robin** | 1.000 ± 0.000 | 1.00 ± 0.00 | 2.45 ± 0.00 | 0.408 ± 0.000 |

**Market vs round_robin: +17% quality-per-dollar.**

## Market mechanism stats (warm-up runs)
```
{'seed 42': {'specialization': {'geography': 1.0, 'science': 1.0, 'film': 1.0, 'literature': 1.0}, 'convergence_to_±10%': {}}}
```
