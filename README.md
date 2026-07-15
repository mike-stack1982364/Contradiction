# Meta-Contradiction

A browser-based experimental reasoning game combining four concurrent demands:

1. **Contradiction repair** — infer whether a highlighted end-relation must be `=` or `≠`.
2. **Contradiction n-back** — judge whether the current deep relation sequence matches the sequence from *n* trials earlier.
3. **Meta-distinction** — classify how the current deep sequence transforms the previous one: Same, Mirror, Invert, Rotate, or Depth.
4. **Meta n-back** — judge whether the current transformation type matches the transformation from *n* transitions earlier.

Every trial stimulus contains **three to five relation tokens**, satisfying the compact-display constraint. Entity letters change, but the permanent grammar does not. Novelty comes from relational structure and cross-trial transformation rather than endlessly memorising new operators.

## Play

Open `index.html` directly in a modern browser, or publish the repository root with GitHub Pages.

No build step or external dependency is required.

## Learning and navigation

The interface uses a light, high-contrast design and four permanent colour categories that retain the same meaning everywhere:

1. blue — contradiction repair;
2. purple — contradiction-structure n-back;
3. orange — meta-transformation classification;
4. green — meta-transformation n-back.

The navigation path is **Home → Learn → Play → Progress**. The Learn portal contains five sequential lessons covering the two signs, contradiction repair, structural memory, transformation classes, and the complete four-job trial.

The Play portal offers a **Guided session** and **Full session**. Both use exactly the same generated trials, n-back level, scoring, adaptive thresholds, and relational complexity. Guided mode changes only the clarity and amount of interface instruction.

## Formal grammar

Each entity has one of two latent states:

- `A=B`: A and B occupy the same state.
- `A≠B`: A and B occupy opposite states.

Relations compose by parity. For example:

```text
A=B B≠C A=C
```

The outlined claim `A=C` is contradictory because the chain implies `A≠C`.

## Why the meta layer matters

The contradiction itself is intentionally compact. Difficulty is produced by maintaining two related but distinct memory streams:

- the contradiction's **deep pattern**;
- the **transformation class** connecting adjacent patterns.

This prevents the implementation from collapsing into ordinary spatial n-back while keeping each visible trial extremely short.

## Scoring

The game reports separate accuracy for all four streams. Adaptive progression changes the n-back level only after a full session:

- advance when total accuracy is at least 84% and both available n-back streams are at least 78%;
- reduce n when total accuracy falls below 62% or either n-back stream falls below 55%;
- otherwise hold the current level.

There is no speed bonus. Response time is recorded only as descriptive data.

## Validation

```bash
npm test
```

The automated tests verify:

- all stimuli remain at or below five tokens;
- every displayed claim is genuinely contradictory;
- generated meta-transformations are unambiguous;
- contradiction and meta n-back truth values use the correct references;
- complete correct responses score correctly.

## Research status

Meta-Contradiction is an experimental training architecture, not a validated intelligence test or proven fluid-intelligence intervention. Claims about g-loading or far transfer require preregistered validation against active controls and untrained fluid-reasoning measures.
