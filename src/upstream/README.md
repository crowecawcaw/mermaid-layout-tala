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

`layoutgraph/` now contains the initial graph-owned node, edge, tree, grouping,
label, icon and hierarchy records, basic topology mutations and shared constants.
This is a partial graph translation: transactions, cloning and the remaining graph operations are still pending.

`trees/geometry.ts` translates the complete upstream tree geometry kernel;
`trees/layout.ts` currently translates orientation construction and tree edge-label
placement, and `trees/traversal.ts` translates breadth-first descendants.
The 320 Go fixtures compare exact coordinates, edge-label state and work counts
for 80 trees in four orientations, including nested container descendants.
Placement candidate selection and transactional restoration remain pending. Regenerate using the fixture generator's `trees` argument.

`trees/discovery.ts` and `trees/preprocess-helpers.ts` translate discovery,
terminal selection, root merging, chain reversal, pruning, reconnection and
membership indexing. Two hundred Go cases compare exact retained node/edge
order, all incidence lists, container membership, tree structure and work counts.
They cover mixed arrows, parallel/loop edges, tables, fixed nodes, near constraints
and nested containers. The public `Preprocess` transaction/validation wrapper now uses the translated
snapshot and rollback logic; these tests compare both the internal stages and
the wrapper against the Go topology results. Regenerate using
`discovery` as the generator's final argument.

`nodeshape/` translates all 23 shape policies: port groups, mirrored and center
ports, label preference tiers, and table row ports. Its `NewPolicy` constructor
shares the node box with the translated `lib/shape` perimeter and sizing geometry. The 460 Go differential fixtures
compare exact values across dimensions and table row counts. Regenerate using
`shapes`. The typed policy layer does not substitute rectangle geometry for
missing shape geometry.

`shape/` translates all 23 upstream shape geometries, including fitting, inner
boxes, padding, border tracing, perimeter curves, SVG path strings and typed path
commands. `svg/path.ts` translates their `SvgPathContext` dependency. The 480 Go
differential fixtures compare geometry numerically and SVG commands/strings
exactly. Regenerate with `shapegeometry`. Node dimensions, positions, shape
geometry and port policies share the same mutable box, as upstream.

`layoutgraph/clone.ts` translates the complete internal copy stage, preserving
shared references, independent geometry and labels, active/inactive grouping
ownership, tree-only records, edge abductions, hierarchy maps and transient state
resets. Eighty Go differential fixtures compare copied state and exact work
counts; additional tests check isolation and duplicate record rejection.
The `Clone` wrapper validates the source and publishes only a completed copy.
Regenerate using `cloning`.

`layoutgraph/topology-preflight.ts` translates engine topology inventory, parent
relations, descendant/tree cycle and depth checks, tree ownership and alias
validation. Forty-two Go cases compare successful and rejected topologies at
depth boundaries; tests also cover cancellation and nil root sentinels. Slice
capacity metadata supports Go resource accounting; ordinary JS arrays currently
use their length. Automatic Go backing-array growth/capacity tracking and the
separate subgraph-combination preflight remain pending. Regenerate `preflight`.

`layoutgraph/{runtime-objects,transaction-snapshot,graph-state}.ts` translates
runtime ownership inventory, scoped snapshot capture and rollback. Eighty Go
fixtures compare restored geometry, labels, topology, reference identity and
exact work counts. Empty Go maps are compared by contents, not their nil header.
The current JS array representation preserves array/object identity and declared
capacity metadata; shared Go slice views and hidden spare backing elements still
need explicit representation. Regenerate with `snapshot`.

`trees/preprocess.ts` completes the upstream validation/snapshot/discovery/pruning
wrapper. Tests force cancellation after removal, installation and reconnection,
and interrupt the operation at successive work budgets, checking restored graph,
container, incidence and route identities. Full transaction commit/overlap
validation and tree placement remain pending.

`layoutgraph/node-spatial.ts` and `node-spacing.ts` translate spacing clearance,
fixed label/icon margins, modifier offsets, overlaps, distances, orientation,
visibility predicates and segment/box clipping. Five hundred Go fixtures compare
all results and charged edge scans; explicit regressions cover corner tangency,
boundary overlap, negative box dimensions and NaN boundaries. Regenerate `spatial`.

`layoutgraph/transaction-overlaps.ts` translates the initial overlap sweep,
including broad-phase padding, exact/padded pair inventories, asymmetric edge
references, duplicate node pointers and retained-reference limits. Two hundred
Go cases compare pair sets, errors and exact work counts. Regenerate `overlaps`.

`layoutgraph/node-geometry.ts` and `containment.ts` translate label/icon bounds,
rounded content boxes, container padding/fitting, fixed-origin lookup, descendant
movement, and mirror offsets. Two hundred thirty Go fixtures exercise every
shape and every label position, comparing geometry and exact bound-scan work.
Regenerate with `nodegeometry`.

`layoutgraph/group-geometry.ts` translates cluster resize/arrangement, sequence
step advancement and arrangement, and nested synchronization order. Two hundred
forty Go fixtures include fixed-size clusters, unplaced vessels/members, nested
container movement and narrow/negative-width sequence steps, with exact work
counts. Regenerate with `groupgeometry`.

`layoutgraph/transaction.ts`, `bad-state.ts`, `errors.ts` and `placement-cost.ts`
translate transaction construction, shared request guards, candidate operations,
container/group synchronization, dirty/full post-state overlap scans, exception
marking, fixed-position checks, rejection rollback, snapshot refresh and geometry
trial clones. Placement cost rollback remains separate from ordinary speculative
rollback, as upstream. Three hundred Go fixtures exercise eight successive
candidates each, comparing acceptance, committed/restored geometry and snapshots.
Construction work and non-container commit work compare exactly. Rejected
container checks have Go-map-order-dependent work counts (confirmed by repeated
Go runs); those fixtures compare outcomes and geometry instead of a single work
count. Additional tests cover cancellation, thrown operations, snapshot sharing,
candidate error causes and disabled/restored placement caches. Regenerate
`transaction`.
