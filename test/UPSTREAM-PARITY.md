# Native TypeScript parity with TALA

Reference: D2 [`bf33790338b9854cb2a34418e69c17f9abf8de4b`](https://github.com/d2lang/d2/tree/bf33790338b9854cb2a34418e69c17f9abf8de4b/d2layouts/d2talalayout).

Full parity means reproducing the supported upstream contracts and deterministic
layout results, not merely accepting equivalent inputs. This repository does
**not** currently meet that definition. Passing the local suite does not establish
full parity. The prior WebAssembly replacement remains reverted; the public
`rankDag` and `layoutFlowchart` APIs remain synchronous TypeScript.

| Domain | Current implementation | Evidence / remaining work |
| --- | --- | --- |
| Weighted DAG ranking | Upstream-derived network simplex | [Rank coverage](./UPSTREAM-RANK-COVERAGE.md): exhaustive small DAG optima, Go-seeded corpus, deterministic tie fixtures; private basis injection not exposed |
| Hierarchy discovery | Deterministic DFS feedback-edge removal | Upstream eligibility, hierarchy discovery, fixed hierarchy contracts remain unported |
| Layer ordering and alignment | Translated crossing minimization, global sifting, long-edge dummy chains and four-direction Brandes–Köpf alignment | `hierarchy.test.ts`: 120 Go-generated differential fixtures (including dummy chains) compare exact layer order and coordinates; four upstream alignment-root contracts. Nested compound alignment and table-column handling remain unported |
| Nested containers | Native bottom-up child placement and descendant-edge projection | `compound.test.ts`: containment, local/inherited direction, group endpoints, input-order stability, invalid parents; upstream compound admission/placement goldens not ported |
| General placement | Layered placement only | Tree, sequence, hub, herd, cluster discovery and placement/refinement stages remain unported |
| Component packing | Cross-axis packing | Upstream bin packing, aspect-ratio objectives, route extents remain unported |
| Routing | Native rectangle visibility-grid fallback with bend cost | `routing.test.ts`: obstacles, shortcuts, feedback edges, all directions; upstream OVG, port swapping, channel nudging, route cleanup and shape-specific geometry remain unported |
| Self/parallel edges | Orthogonal lanes | Local layout tests; upstream reserved loop extents and duplicate-route optimization remain unported |
| Edge labels | Measured spacing, arc-length midpoint and greedy collision avoidance | `labeling.test.ts`: parallel labels, node avoidance, all directions; upstream label scoring, icons, arrowhead labels remain unported |
| Mermaid rendering | Native helper adapter; measured groups, labels and shape clipping | Adapter unit test and real Mermaid integration under jsdom, including nested groups and group endpoints; real-browser playground smoke check performed separately |
| Seed selection and quality | Go-compatible random stream, isolated attempts, translated penalty/area scoring and exact later-seed tie rule | `random.test.ts`, `seeds.test.ts`, `quality.test.ts`: Go stream fixtures and 100 differential scoring fixtures; icons, arrowhead labels and cluster membership scoring remain outside the adapter model |
| Resource accounting | Ranker checks and bounded routing grid | Upstream aggregate work accounting, cancellation, atomic rollback contracts remain unported |

## Acceptance work still required

1. Expand the pinned full-layout corpus beyond its initial 36 cases. It currently
   covers empty graphs, singletons, chains, diamonds, cycles, loops, parallel
   labels, disconnected components and nested groups in four directions.
   `npm run test:parity` reports 8/36 matching; this command deliberately exits
   nonzero until full-layout geometry and routes match.
2. Extend the translated hierarchy stages to compound alignment and table-column
   handling, then integrate upstream general placement stages.
3. Port graph ownership, preprocessing, placement, packing, routing, labeling and
   quality stages in their upstream pipeline order. Keep functional fallbacks
   explicitly distinguished from translated algorithms.
4. Compare final geometry, routes, labels and seed choices against the reference
   fixtures. Record tolerances explicitly; input-order determinism alone is not
   an upstream differential test.
5. Test actual browser measurements and SVG paths in addition to jsdom. Keep
   public API compatibility and package/playground builds in CI.

## Regenerate hierarchy differential fixtures

Use a clean checkout of the pinned D2 commit and Go 1.27.1:

```sh
node scripts/generate-hierarchy-fixtures.mjs /path/to/d2
```

Set `TALA_GO` to a Go executable path if needed. The script checks the upstream
commit, installs a temporary test in the Go internal package, generates the
120 cases from `math/rand.NewSource(42)`, and removes the test afterward.
The checked-in Go source calls upstream ordering/alignment directly; it does
not reimplement those algorithms to manufacture expected results. Fixture
assertions use upstream spacing (60px siblings, 50px dummies, 60px outer padding).
The Mermaid adapter retains configurable spacing, so these are stage-level
comparisons, not a claim of full-pipeline coordinate parity.

## Scoring, randomness and full-layout references

```sh
TALA_GO=/path/to/go node scripts/generate-hierarchy-fixtures.mjs /path/to/d2 quality
TALA_GO=/path/to/go node scripts/generate-hierarchy-fixtures.mjs /path/to/d2 layout
go run scripts/upstream/random-fixtures.go > test/fixtures/upstream-random.json
npm run test:parity
```

Quality fixtures call the Go evaluator on complete rectangular graph records,
including root container membership. They cover overlapping labels, group
relationships, shared routes, loops, diagonal crossings and fractional route
bounds. Random fixtures cross the 607-word generator state boundary for each
seed and exercise exact signed-64-bit boundary seeds.

Full-layout comparisons use absolute positions and dimensions with tolerance
`1e-7`. Route comparison removes redundant collinear vertices from both outputs
but otherwise compares directed geometry exactly. Matching stage fixtures does
not imply a matching complete engine pipeline. The remaining full-layout
differences are reported, not hidden behind skips or permissive assertions.
