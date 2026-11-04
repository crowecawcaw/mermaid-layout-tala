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
| Seed selection and quality | Not implemented | Go random stream, independent attempts, quality penalty/area scoring, later-seed tie rule remain unported |
| Resource accounting | Ranker checks and bounded routing grid | Upstream aggregate work accounting, cancellation, atomic rollback contracts remain unported |

## Acceptance work still required

1. Add a pinned Go reference fixture generator for full layout inputs and outputs,
   including containers, cycles, parallel edges, labels, shapes and multiple seeds.
2. Translate upstream hierarchy placement and ordering with focused invariant
   tests before integrating general placement stages.
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
