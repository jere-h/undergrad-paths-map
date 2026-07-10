# Commitment-crowding — doors close as a stack specializes

**Status: v2, implemented.** Draft v1 proposed closing on share-of-commitment
(`support / C < 0.12` once `C > 2.5`); an adversarial computational review ran
the rule against the real catalogs and rejected the signal (findings below).
v2 keeps the goals and replaces the mechanism.

## Problem

`analyze()` was purely additive: support only grows with selections, so the
headline "N future paths open" was monotone non-decreasing. A simulated 4-year
accumulation on the Data catalog reached 6 open by pick 6 and stayed there
through pick 15 — a senior with a heavily specialized stack saw maximal
openness, the opposite of real life, where advanced courses lean toward a
specialization and close doors.

## Model (implemented in `score.js`)

Two ingredients, both reusing structure the model already had:

1. **Committal-only gate.** `committal = Σ inputStrength(pick)` over picks
   with strength ≥ `COMMITTAL_STRENGTH` (0.85: 3000-level courses and
   internships). Closing activates only when `committal >
   CLOSE_FREE_COMMITMENT` (2.5 ≈ three advanced courses). Intros contribute
   nothing, so **no quantity of breadth ever closes a door** — by
   construction, not by tuning.
2. **Leader-relative trigger.** Once active, a reached career **closes**
   (tier `closed`, subset of faded) when its existing gamma-sharpened
   emphasis (`(support/maxSupport)^gamma`) falls below `CLOSE_EMPHASIS`
   (1e-3). One normalization serves both fade and close, is invariant to how
   many careers a catalog has, and reopens honestly: support added for a
   closed career lifts its emphasis back over the floor.

`summarize()` now returns `open = reached − closed` (deliberately
non-monotone) plus `closedCount`. The app renders closed careers as dim hollow
rings without labels, the summary band reports "N crowded out by your
specialization", and the detail panel says crowded-out, not gone: reopening
takes choices that lead there.

Measured arcs: fixture CS-lean journey peaks at 17 open then narrows to 8
open / 9 closed; the Data senior stack narrows 6 → 4 open; every-intro stacks
close zero on both catalogs.

## Workflow gate (implemented in `scripts/validate-dataset.mjs`)

Full-run datasets with ≥ 6 careers must pass a deterministic
**senior-narrowing simulation** (`simulateNarrowing`, unit-tested):

- selecting every 1000-level course closes nothing (breadth check);
- a greedy committal stack (target = career with max summed edge strength,
  ties by id; supporters sorted strength desc then id; `min(12, all)` picks)
  must **peak higher than it ends** (the arc), crowd out ≥ 1 career, and
  leave ≥ 2 open.

A generated industry dataset that cannot tell the open-then-specialize story
fails its gates on shape, not just size. The simulation numbers surface as a
validator WARN line and flow into the sign-off report.

## Review findings that shaped v2 (changelog from v1)

The reviewer computed against the live files: (1) share-based closing fired
under maximal breadth — ten intros (C=3.5) closed bi-analyst; fixed by the
committal-only gate. (2) "Born-closed" careers: dampened inferred edges
(0.35×0.55) could never clear `0.12×C` once C>1.6, so the pick that opened a
door closed it in the same frame; the emphasis trigger dissolves the case.
(3) `CLOSE_SHARE` could not survive career-count growth (mean share ∝ 1/K);
emphasis is leader-relative and scale-free. (4) Cliff/flap instability at the
threshold (open→closed→open across three consecutive picks); the committal
gate plus multiplicative emphasis dynamics remove the observed flapping.
(5) A second normalization alongside rel/emphasis was incoherent — adopted:
the close trigger now *is* the emphasis signal. (6) The frozen 4-pick test
stack sat 0.017 from breaking; under v2 its committal sum (1.85) keeps the
regime inactive entirely, and `render.js`'s hard-coded classList.remove list
gained `tier-closed` (the latent reopen-styling bug). (7) "Closed" copy
softened to crowded-out/reopenable, since closure tracks dataset edges, not
an advisor's verdict. (8) The v1 gate "C ≤ CLOSE_FREE closes nothing" was
tautological — replaced with the all-intros assertion; the closure requirement
is skipped below 6 careers where it cannot be satisfied honestly. (9) The
greedy simulation was underspecified (target definition, internship ordering,
tie-breaks) — all three pinned. (10) The v1 reopen-cost formula understated
by 1/(1−threshold); v2 drops the numeric claim for honest qualitative copy.
