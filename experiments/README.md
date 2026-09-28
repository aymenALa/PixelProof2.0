# Experiment harness

Run every fixed pipeline over every fixture and write one CSV row per fixture/pipeline pair:

```text
npm run experiments -- --runs=3 --out=experiments.csv
```

The harness runs in a local Playwright page using `InlineRunner`. It checks deterministic output fields across repeated runs and reports the first run's wall-clock `ms`; timing is intentionally not treated as deterministic. No parameters are searched, tuned, or optimized.
