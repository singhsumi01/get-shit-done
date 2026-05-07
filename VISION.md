# Contributor Standards Vision

This document explains why GSD is making `CONTEXT.md` and `docs/adr/` part of the contributor contract, especially for AI-agent-assisted contributions.

## Why this exists

GSD now receives a meaningful amount of agent-assisted work. That is useful, but it also creates a predictable failure mode: contributors arrive with code before they have absorbed the project's domain language, architectural seams, or maintainer decisions.

The result is review churn:
- synonyms instead of canonical module names
- new seams that cut across accepted boundaries
- tests that prove implementation trivia instead of interface contracts
- docs and prompts that ignore decisions already locked in
- AI-generated rationale that sounds polished but is not anchored in the actual repository standards

The goal of this document is to make the standards explicit.

## The standards hierarchy

When contributing to GSD, use this order of authority:

1. `VISION.md` — why the standards exist, how contributors are expected to use them, and how ADR governance works
2. `CONTEXT.md` — canonical domain language, module names, recurring PR mistakes, and workflow learnings
3. `docs/adr/` — accepted architecture decisions that contributors are expected to follow
4. approved issue scope — the specific change that a maintainer agreed to review

If these sources appear to disagree, stop and ask in the linked issue rather than guessing.

## Current accepted ADR standards

These ADRs are the currently accepted architectural standards in this repo:

- **ADR-0001 — Dispatch Policy Module as single seam for query execution outcomes**  
  Centralizes query dispatch outcomes behind one Dispatch Policy Module, with typed outcome handling, thin adapters, and explicit seam ownership.
- **ADR-0002 — Command Contract Validation Module**  
  Centralizes the `commands/gsd/*.md` contract, keeps `execution_context` references authoritative, and treats command/workflow contracts as something that must be validated consistently.
- **ADR-0003 — Model Catalog Module as single source of truth for agent profiles and runtime tier defaults**  
  Centralizes model-selection data so the SDK, CLI/CJS layer, and docs do not drift.

More ADRs are expected. Contributors should assume the standard set will grow, not shrink.

## What contributors must do

### 1. Read the standards before proposing architecture work

Before changing a seam, command contract, registry, workflow contract, or architectural boundary:
- read `CONTEXT.md`
- read the relevant ADR(s)
- use the glossary's vocabulary instead of inventing synonyms

### 2. Show your standards trace

In issues and PRs, explicitly name the standard you are following.

Recommended pattern:

```md
## Standards followed
- `CONTEXT.md`: used the canonical term `Command Topology Module`
- `ADR-0002`: treated `<execution_context>` as the single authoritative workflow reference
- `ADR-0003`: kept model resolution in the catalog instead of adding a second registry
```

This is not paperwork for its own sake. It lets reviewers immediately verify whether the proposal is aligned with the repo's existing decisions.

### 3. If you use an AI agent, prompt it to read the standards first

If you are using Claude, Cursor, Copilot, or another coding agent, do not let it freewheel from the current diff alone.

Tell it to read:
- `VISION.md`
- `CONTEXT.md`
- the relevant ADR(s)

Then require it to tell you:
- which ADR it followed
- which term from `CONTEXT.md` it used
- whether the change introduces a new seam, and if so, why that does not conflict with an accepted ADR

If the agent cannot answer those questions concretely, it has not done enough repo-specific reasoning yet.

### 4. Highlight the exact ADR clause or section that matters

"Follows ADR-0002" is better than nothing, but the preferred form is specific:
- "Follows ADR-0002 consequence: `execution_context` is the single authoritative declaration of what a command loads."
- "Follows ADR-0001 amendment: keep transport callers as thin adapters over the bridge seam."

The more specific the trace, the less likely the review devolves into style arguments.

## ADR governance

ADRs in this repo are **maintainer-authored standards**.

That means:
- contributors may suggest an ADR topic, concern, or amendment in issues/discussions
- contributors may supply evidence, tradeoffs, or alternative designs
- maintainers decide whether an ADR is created, accepted, amended, or reopened
- contributors should not open PRs that author a new ADR as though the decision were already made

Once an ADR is accepted, treat it as locked-in project guidance. It can be revisited, but that should be rare, explicit, and maintainer-led.

## What this is not

This is **not** a claim that maintainers are never wrong.

It **is** a claim that a small project needs stable decisions to stay coherent, especially when many contributions are generated or accelerated by tools that optimize for plausible output rather than continuity with project history.

The standard is:
- discuss first
- get maintainer direction
- then code the approved path

Not:
- code first
- retrofit a justification later
- ask maintainers to normalize a drifted design after the fact

## Rollout intent

This is being socialized before hard enforcement.

The likely path is:
- **now:** ask regular contributors for feedback on the standards language and workflow
- **near term:** encourage issue/PR citations to `CONTEXT.md` and ADRs
- **around the `1.50` release / new TDD mode:** tighten review expectations and start treating standards-trace omissions as process misses rather than optional polish

The point is to make the repo easier for serious contributors to work in, not to create a bureaucratic maze.

## The kind of feedback we want

Useful feedback looks like:
- "This requirement is clear but too heavy for bug-fix PRs; here is a lighter-weight version."
- "This ADR citation pattern will work if you add one example for tests and one for docs-only changes."
- "This is reasonable, but contributors need a short checklist in `CONTRIBUTING.md` rather than only a vision doc."

Unhelpful feedback looks like:
- generic AI-generated prose with no reference to the repo
- abstract objections to standards without naming a concrete burden
- suggestions that ignore the maintainer-owned nature of ADRs

The bar is simple: think about the actual contribution flow in this repo, then comment like a human who has used it.
