---
type: Fixed
pr: 3303
---
**`/gsd-plan-milestone-gaps` and `/gsd-import` now apply `project_code` prefix to phase directories** — projects with `project_code` set in `.planning/config.json` no longer accumulate mixed naming conventions when gap-closure phases or imported plans create new phase directories. Both workflows now query `gsd-sdk query init phase-op <N> --pick expected_phase_dir` and use that for the `mkdir`, matching the pattern PR #3292 established for `/gsd-discuss-phase` and `/gsd-plan-phase`. (#3298)
