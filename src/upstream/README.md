# Direct TypeScript translation

Reference: D2 commit `bf33790338b9854cb2a34418e69c17f9abf8de4b`.

This tree is the direct translation of upstream engine dependencies. Preserve
upstream algorithms, constants, branch order, mutation order, rounding, and
numerical edge cases. Do not substitute the existing adapter's placement or
routing strategies. Preserve upstream package boundaries and function names
where possible so changes can be reviewed beside their Go source.

The current public layout implementation is still the earlier partial native
implementation. These modules are not yet connected to that pipeline. Complete
engine parity requires translating the graph records and their ownership rules,
then the algorithms and ordered engine pipeline, and replacing the earlier
implementation. The Mermaid adapter belongs outside the translated engine.

## Current translation

`geo/` translates the numerical operations in `lib/geo/{math,orientation,point,
vector,segment,box,route,ellipse,bezier,spacing}.go`. TypeScript classes represent
Go records and methods; standalone orientation functions represent Go enum
methods. `Round` supplies Go's half-away-from-zero behavior. Point JSON retains
upstream lowercase coordinates. Diagnostic formatting and nil-receiver helpers
are not fully translated yet.

`test/upstream-geo.test.ts` compares 400 deterministic Go-generated cases, including
degenerate segments, empty intersections, and nonfinite results. Comparison uses
relative tolerance `1e-10` for floating-point numerical operations, and exact
structural and categorical results. This tolerance is local to geometry tests;
it does not change the full-layout acceptance tolerance.

Regenerate with:

```sh
TALA_GO=/path/to/go node scripts/generate-hierarchy-fixtures.mjs /path/to/d2 geo
```

Source quirks are preserved rather than silently corrected: point-set equality
checks membership without multiplicity, box intersection tests edges rather than
contained segments, vector angles round through float32, and the quadratic
Bézier root branch returns after filtering its first root.

`limits/` translates work accounting, overflow checks, cancellation polling and
guarded shuffle. `Context` supplies the Go cancellation boundary; errors retain
wrapped causes. Integer counters use bigint to retain signed/unsigned 64-bit
behavior. Upstream limit/cancellation tests are translated in
`test/upstream-limits.test.ts`.

`label/label.ts` translates `lib/label/label.go`, including all 37 position values,
box placement and route placement. Eighty Go-generated cases exercise every
position and compare exact coordinates, classifications, mirroring and returned
segment indices. The upstream shadowed result index for outside route labels is
preserved. These are dependencies of the forthcoming graph and engine port,
not replacements connected to the current public layout pipeline yet.
