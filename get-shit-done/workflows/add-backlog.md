# Add Backlog Item Workflow

Invoked by `/gsd-capture --backlog` (`commands/gsd/capture.md`).

Adds an idea to the ROADMAP.md backlog parking lot using 999.x numbering. Backlog items
are unsequenced ideas that aren't ready for active planning — they live outside the normal
phase sequence and accumulate context over time.

<process>

## Step 1: Read ROADMAP.md

Check for existing backlog entries:

```bash
cat .planning/ROADMAP.md
```

## Step 2: Find next backlog number

```bash
NEXT=$(gsd-sdk query phase.next-decimal 999 --raw)
```

If no 999.x phases exist yet, `phase.next-decimal` returns `999.1`. Sparse numbering
is fine (e.g. 999.1, 999.3) — always use `phase.next-decimal`, never guess.

## Step 3: Write ROADMAP entry

**Write the ROADMAP entry BEFORE creating the directory.** Directory existence is a
reliable indicator that the phase is already registered, which prevents false duplicate
detection in any hook that checks for existing 999.x directories (#2280).

Add under a `## Backlog` section. If the section doesn't exist, create it at the end
of ROADMAP.md:

```markdown
## Backlog

### Phase {NEXT}: {description} (BACKLOG)

**Goal:** [Captured for future planning]
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)
```

## Step 4: Create the phase directory

Read the project_code prefix first so the directory name matches the convention
used by `phase.add` / `phase.insert` (e.g. `CK-999.1-my-idea`). When
`project_code` is empty or absent the prefix expands to nothing, preserving
current behavior for projects that do not set one (k301: graceful root fallback).

```bash
SLUG=$(gsd-sdk query generate-slug "$ARGUMENTS" --raw)
PREFIX=$(gsd-sdk query config-get project_code --raw 2>/dev/null || echo "")
DIR="${PREFIX:+${PREFIX}-}${NEXT}-${SLUG}"
mkdir -p ".planning/phases/${DIR}"
touch ".planning/phases/${DIR}/.gitkeep"
```

## Step 5: Commit

```bash
gsd-sdk query commit "docs: add backlog item ${NEXT} — ${ARGUMENTS}" --files .planning/ROADMAP.md ".planning/phases/${DIR}/.gitkeep"
```

## Step 6: Report

```
## 📋 Backlog Item Added

Phase {NEXT}: {description}
Directory: .planning/phases/{DIR}/

This item lives in the backlog parking lot.
Use /gsd-discuss-phase {NEXT} to explore it further.
Use /gsd-review-backlog to promote items to active milestone.
```

</process>

<notes>
- 999.x numbering keeps backlog items out of the active phase sequence
- Phase directories are created immediately so /gsd-discuss-phase and /gsd-plan-phase work on them
- No `Depends on:` field — backlog items are unsequenced by definition
- Sparse numbering is fine (999.1, 999.3) — always uses next-decimal
- Promote backlog items to the active milestone with /gsd-review-backlog
</notes>
