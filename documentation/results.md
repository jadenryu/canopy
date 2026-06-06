# Canopy evaluation results — market vs. baselines

Formal `weave.Evaluation` (`canopy-allocator-eval`): 25 held-out jobs (incl. 5 unseen-category), seeds [42, 43, 44], identical fleet/scorer/lifecycle — only the assignment rule differs.

| condition | quality (mean±std) | accuracy | paid/job | quality-per-dollar |
|---|---|---|---|---|
| **market** | 0.982 ± 0.021 | 0.99 ± 0.02 | 2.77 ± 0.03 | 0.354 ± 0.011 |
| **single_cheap** | 0.989 ± 0.006 | 0.99 ± 0.02 | 2.63 ± 0.09 | 0.377 ± 0.011 |
| **single_premium** | 0.989 ± 0.010 | 0.99 ± 0.02 | 8.51 ± 0.21 | 0.116 ± 0.002 |
| **random** | 0.797 ± 0.037 | 0.80 ± 0.04 | 2.37 ± 0.30 | 0.338 ± 0.033 |
| **round_robin** | 0.830 ± 0.007 | 0.84 ± 0.00 | 2.70 ± 0.03 | 0.308 ± 0.006 |

**Market vs round_robin: +15% quality-per-dollar.**

**Market vs single_premium: +205% quality-per-dollar.**

## Market mechanism stats (warm-up runs)
```
{'seed 42': {'specialization': {'geography': 0.6666666666666666, 'film': 0.6666666666666666, 'science': 0.5, 'literature': 1.0}, 'convergence_to_±10%': {}}, 'seed 43': {'specialization': {'geography': 0.6666666666666666, 'science': 0.5, 'literature': 1.0, 'film': 1.0}, 'convergence_to_±10%': {'film:h1': 'job 1/3'}}, 'seed 44': {'specialization': {'geography': 0.6666666666666666, 'literature': 1.0, 'film': 1.0, 'science': 0.5}, 'convergence_to_±10%': {}}}
```
