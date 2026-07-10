# Commitment-crowding plan — doors must be able to close

**Status: DRAFT (pre-review)**

## Problem

`analyze()` is purely additive: a career's support only grows with selections,
and the headline "N future paths open" is monotone non-decreasing. Simulated
4-year accumulation on the Data catalog: open goes 2→6 by pick 6 and stays 6
through pick 15, even as the stack becomes heavily specialized. Real intuition:
a senior's advanced courses lean toward a specialization and *close* doors —
time and credits spent deepening one direction are not available to others.
The model has convergence (specializations brighten) and fade (marginal paths
recede) but no opportunity cost.

## Model: commitment crowds out weakly-supported paths

Additions to `score.js` (pure, tunable constants at top):

- **Commitment** `C = Σ inputStrength(selected)` — how much a stack has
  committed, weighted by how committal each pick is (1000: 0.35 … internship:
  1.0). Six intros ≈ 2.1 commits little; three 3000s + an internship ≈ 3.55
  commits a lot. Exposed on the analysis result.
- **Crowding-out rule**: once `C > CLOSE_FREE_COMMITMENT` (default 2.5 — a
  first/second-year breadth stack can never close anything), a *reached*
  career **closes** when its share of the stack `support / C <
  CLOSE_SHARE` (default 0.12). Interpretation: your accumulated commitment
  points so much elsewhere that this path is crowded out, not merely faded.
- **Tiers**: `closed` sits below `fading`; closed ⇒ faded. Unreached careers
  keep their current semantics (never opened ≠ closed).
- **Reopen cost**: `needed = CLOSE_SHARE × C − support`, reported per closed
  career so the panel can say what it would take to rebalance (≈ one advanced
  course ≈ 0.85).
- **Non-monotone headline**: `summarize()` counts `open` excluding closed and
  returns `closedCount`. Adding a committal pick raises C faster than most
  careers' support, so open can now *decrease* — the senior-year narrowing.
- Reopening is possible and honest: adding support for a closed career raises
  its share above the threshold again.

## App changes

- `render.js` `applyState`: closed careers get an `is-closed` state — dimmest
  tier, no label; edges into them near-invisible. Detail panel status copy:
  closed by your current specialization + what reopening takes.
- `main.js` summary line gains "M closing as you specialize" phrasing change
  (fading and closed reported distinctly).
- `styles.css`: `.is-closed` styles.

## Workflow changes

- **Validator gate (full runs only)**: a deterministic *senior-narrowing
  simulation* imports `score.js`, builds a committal stack from the dataset
  itself (greedy: the most-supported career's inputs, highest level first, up
  to ~12 picks), and asserts the intended arc: (a) a breadth-first prefix
  (C ≤ CLOSE_FREE) closes nothing; (b) the full senior stack closes ≥ 1
  career; (c) ≥ 2 careers remain open. A generated industry dataset that
  cannot exhibit open-then-narrow fails its gates — shape, not just size.
- Report agent prompt: include the simulation numbers in the sign-off report.
- Plan doc: this section merged into the grounding plan.

## Calibration

Constants tuned against both the frozen fixture (existing behavioral tests
must stay green: 4-pick data stack C=2.55 keeps founder *fading*, share 0.137
> 0.12, not closed) and the live Data catalog (15-pick senior simulation must
close some doors while keeping the specialization cluster open).

## Open questions for review

1. Is share-of-commitment the right crowding signal vs alternatives (rank-based
   closing, budget-remaining models)?
2. Pathologies: very small selections just over CLOSE_FREE; datasets with few
   careers; stacks concentrated on one career; interaction with dampened
   judgment edges (they close earlier — acceptable?).
3. Constant defaults (2.5 / 0.12) and whether they need per-dataset scaling.
4. UI honesty: is "closed" too absolute? Panel copy must say rebalancing
   reopens it.
