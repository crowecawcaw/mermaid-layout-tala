# Native TypeScript parity with TALA

Reference: D2 [`bf33790338b9854cb2a34418e69c17f9abf8de4b`](https://github.com/d2lang/d2/tree/bf33790338b9854cb2a34418e69c17f9abf8de4b/d2layouts/d2talalayout).

Full parity means reproducing the supported upstream contracts and deterministic
layout results, not merely accepting equivalent inputs. This repository does
**not** currently meet that definition. Passing the local suite does not establish
full parity. The prior WebAssembly replacement remains reverted; the public
`rankDag` and `layoutFlowchart` APIs remain synchronous TypeScript.

| Domain | Current implementation | Evidence / remaining work |
| --- | --- | --- |
| Engine and graph model | Direct TypeScript translation of the upstream pipeline and graph stages | `upstream-enginepipeline.test.ts` compares complete single-seed layouts; broaden topology and cancellation coverage |
| Hierarchy, placement and packing | Translated upstream algorithms, including compound hierarchy placement | Go differential fixtures cover rank assignment, ordering, alignment, gap normalization, recursive packing and grouped layouts; more complex graphs remain to be tested |
| Routing and labels | Translated upstream OVG routing, cleanup, port swaps, segment balancing, channel nudging, shortcutting and label placement | Go differential fixtures cover stages and work limits; shapes, clusters, aliases and larger diagrams need broader coverage |
| Candidate selection | Go-compatible random stream, upstream penalty/area scoring and compound refinement | Scoring and refinement have differential fixtures; public adapter validation and additional D2 metadata need coverage |
| Mermaid adapter | Maps the supported flowchart input to the translated graph | 417/417 pinned full-layout fixtures pass, including authored ordering and explicit D2 edge indices. The input model does not expose all D2 shape and style features |
| Resource accounting | Translated work guards, stage rollback, and public cancellation contexts | Go comparisons cover pre-canceled layout, routing and seed coordination; expand cancellation and failure tests through the complete public pipeline |
| Standalone edge rerouting | Additional-edge routing, the guarded `RouteEdges` transaction, and the public positioned-graph adapter are translated | 32 coordinator, 76 transaction, and 45 public Go comparisons cover nested graphs, existing routes, labels, SQL ports, reversed and parallel edges, failures and work limits; broaden sequence coverage |

`upstream-opacity.test.ts` also compares node and edge opacity validation and
visibility against Go, including decimal and hexadecimal float syntax and
rounding at floating-point boundaries.
`upstream-edgeconstraints.test.ts` checks Go's combined edge-label and
arrowhead-label size limits, including transparent edges.

## Acceptance work still required

1. Expand end-to-end Go comparisons beyond the current 417 cases, including
   larger and nested graphs, labels, alternate shapes and fixed ports.
2. Extend the Mermaid input mapping and result validation for upstream features
   that the current flowchart API cannot represent.
3. Verify browser rendering and performance on representative Mermaid diagrams.
4. Continue differential testing of seed choices, cancellation and resource
   limits across the entire pipeline.

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
These are stage-level comparisons; the public corpus separately checks full layouts.

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
`1e-7`. Route comparisons check every vertex in order, including collinear
vertices. Matching stage fixtures does
not imply a matching complete engine pipeline. The remaining full-layout
differences are reported, not hidden behind skips or permissive assertions.

Component combination fixtures can be regenerated with the same script using
`packing` as its final argument. They cover one to seven rectangular subgraphs
with varying sizes and multiple nodes. Route-bound translation is integrated in
the adapter; the current Go packing corpus covers node geometry only.
