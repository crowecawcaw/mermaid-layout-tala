# TypeScript port status

Source reference: D2 commit `bf33790338b9854cb2a34418e69c17f9abf8de4b`,
`d2layouts/d2talalayout`. That tree has 211 production Go files and about
59,600 lines. The Mermaid adapter in this repository is **not equivalent** to
that engine yet.

| Upstream area | TypeScript status |
| --- | --- |
| Weighted DAG ranker | Ported in `src/rank.ts` with translated fixtures and tests. |
| Input graph and shape geometry | Independent mutable graph records, input order, container ownership, adjacency, clone isolation, ordinary component splitting, and fixed-node component grouping are ported in `src/tala`. Upstream `Prescale` matches eight pinned shape, edge-port, fixed-node, explicit-size, font, and label fixtures and runs for flat and compound inputs; the Mermaid renderer grows the node outline to match. Shape snap points, side and diagonal port indices, mirrors, and center ports match 26 upstream fixtures covering all 23 shapes and table row counts 0, 1, 3, and 5. Loop extents and label bounds match five upstream fixtures; ordinary node spacing matches eight fixtures including table gaps, loop extents, fixed outside labels, and edge minimum dimensions. The flat TALA path preserves fixed node origins through component packing. Upstream compound topology mutations and other shape policies remain unported. |
| Nested containers and direction | Five compound-graph outputs are pinned from the upstream engine. The TypeScript recursive layout uses upstream's 60-unit ordinary container padding and leaves unspecified interior directions unconstrained in the ordinary placement scorer, as upstream does. Measured container boxes pass through the ordinary placement engine. All final node geometry matches upstream in the one-container chain, directioned-container, and linked-container fixtures; the first also matches every route point. The linked-container routes differ by one pixel on their shared horizontal axis. Nested-container fixtures still differ. Explicit inner direction remains supported. The container edge-abduction projection and restoration are ported to the mutable TypeScript graph. |
| Seed attempts | Independent mutable graph clones and deterministic ordering attempts are implemented. Upstream crossing evaluation is ported; random placement and full label scoring remain unported. |
| Tree, hierarchy, hub, proximity, cluster, and sequence discovery | Upstream `AddHubs` discovery, flat tree leaf peeling, sibling cluster discovery, and connected `Step` sequence-run discovery are ported. Tree extraction matches 24 pinned generated trees; flat sibling clustering matches five upstream cases. Tree geometry follows upstream's orientation transforms, level placement, sibling spacing, and edge-label clearance. Incoming and outgoing branches are placed around their junction. Cluster vessel resizing, member arrangement, temporary graph installation, edge abduction, and restoration are ported. The topology matches four upstream clustered fixtures, and geometry matches four independent vessel fixtures. The flat cluster placement branch matches completed upstream geometry in the diamond and three-way parallel fan. Step sequence vessel sizing, wedge overlap, temporary topology, external-edge abduction, and member arrangement are ported for flat components; the public flat TALA path now places such runs through vessels. Upstream remembered-sequence lifecycle and routing remain unported. General compound grouping, cluster rotation and axis alignment, hierarchy discovery and placement, and other grouping algorithms remain unported. Ordinary connected components use translated TALA placement by default; nested containers still use the adapter's recursive placement. |
| General placement, symmetry, compaction, and bin packing | The ordinary-node initializer, Go-compatible random stream, sizeless and sized optimizers, spatial swaps, quarter-turn transposes, compaction, distance-cluster joining, and placement stage are translated. The graph direction mirror matches 24 upstream tree-stage fixtures. Sized scoring includes upstream flow continuity and ordered obstruction handling; transpose scoring includes straight-edge crossings and cached crossing cost. Placement costs match 54 pinned upstream fixtures, compaction matches 65 fixtures, distance-cluster joining matches 7 fixtures, and the complete ordinary placement stage matches 12 curated plus 30 generated graphs exactly. Public results without fixed nodes now normalize using node bounds, routed points, and available label bounds. Measured container proxies can use the ordinary stage, but full compound placement, herd behavior, bin packing, and the other upstream placement branches remain unported. |
| Edge routing | The center-port, S-shaped tree route kernel is ported for inward and outward branches and matches all edges in 24 pinned upstream tree fixtures; it now uses shape-specific center ports. The visibility-grid router uses shape-specific center ports for zero-offset edges, handles recessed ports, and honors explicit table row endpoints on horizontally separated nodes. TALA's five-point self-loop router, loop extents, and loop label positions match five upstream fixtures and run in the public routing path. The upstream safe four-bend simplification stage is ported and runs after public routing; nine upstream obstruction and transpose cases pass. General edge routing still uses the visibility grid; upstream route graph, general port selection, channel refinements, and the other route cleanup stages remain unported. |
| Labels | The node-label default and full position preference tranches match upstream for all 23 shapes, as ordinary nodes and containers. Edge labels are measured and placed on a selected route segment; actual node/icon positioning and upstream label optimization remain unported. |
| Validation and resource limits | Basic input validation exists. Upstream graph invariants and work budgets remain unported. |

Step sequence defining edges are now suppressed in the public result. A
three-step public layout matches the pinned upstream engine's final normalized
node geometry; remembered-sequence lifecycle is still absent.

The compound oracle includes stage traces for a container with an internal
chain and one outgoing edge, two containers linked through their children,
and a nested container with a cross-boundary edge.
The TypeScript port matches the first fixture's completed node geometry and
route points exactly. The ordinary-container branches of `GapNormalization`
and `Equidistance` match their pinned stage outputs for the linked containers,
and the public path now matches all six final node boxes. Upstream changes the
linked-container route axis by one pixel at `BalanceEdgeSegments`; that route
stage remains unported.
The one-edge branch of upstream `TransposeAll` now runs on public compound
graphs. A pinned nested-container stage fixture verifies that it rotates a
leaf branch around its neighbor, rounds after each quarter-turn, and refits
both containing boxes to the exact upstream geometry. The nested public
layout still diverges earlier, in compound `NodePlacement`: its projected
edge score uses the API container proxy instead of the original Service
endpoint. At stage 07 the API and Cloud dimensions now match upstream, but
Database and Client horizontal positions differ. The two-edge transpose
branch and full compound placement transactions remain unported.
The ordinary-endpoint `AlignAxes` delta calculation, ordinary-container
connected-set traversal, non-center-port penalty, and equal-size peer-container
alignment cost are ported. The stage's shift validity check now applies the
upstream graph-size and center-line obstruction rules, and accepts the exact
connected move in the pinned compound stage trace. The ordinary-endpoint
candidate search is ported as a pass that accepts a graph scoring callback,
including upstream's Y-before-X tie order. The ordinary graph-level edge
score now combines per-node costs, symmetry, and straight-edge crossings.
Its value and accepted alignment match both pinned upstream stage scores for
the one-container chain. The public compound path runs that pass before
routing: the outgoing node's horizontal coordinate now matches upstream, and
the directioned-container output matches upstream on the vertical axis.
Container abduction scoring, table-column costs, tree-edge exclusions, complete
gap and equidistance branches, and general compound placement remain incomplete.

The complete Go pipeline oracle now covers ten small flat graphs. Relative
node positions and sizes match exactly in all ten: a chain, a cycle, six rooted
trees, two disconnected chains, and a diamond. Upstream treats the diamond's
middle pair as a temporary cluster, which the TypeScript port now does too.
Edge routes and labels are not included in that comparison.

A separate set of 24 generated branching trees exercises deeper and uneven
structures. The TypeScript geometry now matches the upstream node-placement
stage on all 24, plus four edge-labeled tree fixtures. It matches the completed
pipeline's relative node geometry on 16 of the 24. The remaining cases have
post-placement movement in upstream's routing and `Dejitter` stages; those
stages have not been ported.

Tree route points match upstream in all 24 pinned fixtures when given upstream's
completed node geometry. Sixteen match the completed node geometry and route
points together through the public TypeScript layout entry point.

The current playground defaults to the translated ordinary placement stage
for flat components. Its optional layered setting uses the previous adapter
placement and spacing controls. A faithful TALA port still needs the remaining
upstream graph model and ordered pipeline, followed by differential tests
against pinned upstream fixtures. Avoid describing the adapter as equivalent
until those tests pass.

`tools/upstream-fixtures` contains the Go oracle harness, inputs, and recorded
outputs used by `test/tala-upstream-placement-cost.test.ts`. The TypeScript
runtime has no Go or D2 dependency; the harness is for port validation only.
