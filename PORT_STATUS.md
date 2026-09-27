# TypeScript port status

Source reference: D2 commit `bf33790338b9854cb2a34418e69c17f9abf8de4b`,
`d2layouts/d2talalayout`. That tree has 211 production Go files and about
59,600 lines. The Mermaid adapter in this repository is **not equivalent** to
that engine yet.

| Upstream area | TypeScript status |
| --- | --- |
| Weighted DAG ranker | Ported in `src/rank.ts` with translated fixtures and tests. |
| Input graph and shape geometry | Independent mutable graph records, input order, container ownership, adjacency, clone isolation, ordinary component splitting, and fixed-node component grouping are ported in `src/tala`. Upstream `Prescale` matches eight pinned shape, edge-port, fixed-node, explicit-size, font, and label fixtures and runs for flat and compound inputs; the Mermaid renderer grows the node outline to match. Shape snap points, side and diagonal port indices, mirrors, and center ports match 26 upstream fixtures covering all 23 shapes and table row counts 0, 1, 3, and 5. The seven box-size-dependent shape port formulas also match 42 upstream cases. Loop extents and label bounds match five upstream fixtures; ordinary node spacing matches eight fixtures including table gaps, loop extents, fixed outside labels, and edge minimum dimensions. The flat TALA path preserves fixed node origins through component packing. Upstream compound topology mutations and other shape policies remain unported. |
| Nested containers and direction | Ten compound-graph outputs are pinned from the upstream engine. The TypeScript recursive layout uses upstream's 60-unit ordinary container padding and leaves unspecified interior directions unconstrained in the ordinary placement scorer, as upstream does. Measured container boxes pass through the ordinary placement engine. All ten cases now match final node geometry and route points, including nested sibling services, direct container edges, a clustered diamond, a multiple-boundary graph, and an empty nested container. Empty nested containers retain their authored dimensions. Explicit inner direction remains supported. Container edge-abduction projection, restoration, and original-endpoint geometry in the sized placement scorer are ported. |
| Seed attempts | Independent mutable graph clones and deterministic ordering attempts are implemented. Upstream crossing evaluation is ported; random placement and full label scoring remain unported. |
| Tree, hierarchy, hub, proximity, cluster, and sequence discovery | Upstream `AddHubs` discovery, flat tree leaf peeling, sibling cluster discovery, connected `Step` sequence-run discovery, and automatic flat hierarchy discovery are ported. Tree extraction matches 24 pinned generated trees; flat sibling clustering matches five upstream cases. Tree geometry follows upstream's orientation transforms, level placement, sibling spacing, and edge-label clearance. Incoming and outgoing branches are placed around their junction. Flat hierarchy discovery includes source and sink checks, weighted duplicate merging, undirected edge expansion, and feedback arc reversal. Placement includes breadth-first component ordering, seeded shuffling, long-edge dummy vertices, crossing minimization, global sifting, level spacing, and four-direction Brandes–Kopf alignment. Twelve pinned layered graphs, including cross-level edges, varied sizes, and all four directions, match upstream's `PreprocessHierarchies` node geometry exactly, as do six mixed-direction and parallel-edge cases. Cluster vessel resizing, member arrangement, temporary graph installation, edge abduction, and restoration are ported. The topology matches four upstream clustered fixtures, and geometry matches four independent vessel fixtures. The flat cluster placement branch matches completed upstream geometry in the diamond and three-way parallel fan. The compound post-placement path now retains clustered sibling vessels through its alignment and spacing passes. Step sequence vessel sizing, wedge overlap, temporary topology, external-edge abduction, and member arrangement are ported for flat components; the public flat TALA path now places such runs through vessels. Upstream remembered-sequence lifecycle and routing remain unported. Hierarchy table columns, nested containers, fixed members, and general compound grouping remain unported. Ordinary connected components use translated TALA placement by default; nested containers still use the adapter's recursive placement. |
| General placement, symmetry, compaction, and bin packing | The ordinary-node initializer, Go-compatible random stream, sizeless and sized optimizers, spatial swaps, quarter-turn transposes, compaction, distance-cluster joining, and placement stage are translated. The graph direction mirror matches 24 upstream tree-stage fixtures. Sized scoring includes upstream flow continuity, ordered obstruction handling, near-node distance, and common-uncle axis penalties; transpose scoring includes straight-edge crossings and cached crossing cost. Placement costs match 54 pinned upstream fixtures, compaction matches 65 fixtures, distance-cluster joining matches 7 fixtures, and the complete ordinary placement stage matches 12 curated plus 32 special and generated graphs exactly. The public flat-tree path now runs the ordinary `GapNormalization` pass between placement and routing, excluding tree members as upstream does. Its speculative moves reject newly introduced clearance overlaps. Public results without fixed nodes normalize using node bounds, routed points, and available label bounds. Measured container proxies can use the ordinary stage, but full compound placement, herd behavior, bin packing, and the other upstream placement branches remain unported. |
| Edge routing | The center-port, S-shaped tree route kernel is ported for inward and outward branches and matches all edges in 24 pinned upstream tree fixtures; it now uses shape-specific center ports. The tree-sentinel branch of upstream `Dejitter` moves nodes to straighten short bends, checks sign flips, route obstructions, overlap, and symmetry, and reroutes accepted moves. The visibility-grid router uses shape-specific center ports for zero-offset edges, handles recessed ports, and honors explicit table row endpoints on horizontally separated nodes. Shorter edges route first, and reused ports respect arrowhead compatibility in the pinned flat cases. TALA's five-point self-loop router, loop extents, and loop label positions match five upstream fixtures and run in the public routing path. The upstream safe four-bend simplification stage is ported and runs after public routing; nine upstream obstruction and transpose cases pass. The straight-segment and ordinary bent-route endpoint branches of `BalanceEdgeSegments` are ported. The ordinary flat OVG candidate, construction, search, slingshot, flavor selection, and route reassignment stages now feed the public TALA path for eligible graphs. Shape-border tracing matches 1,104 Go cases across all 23 shapes and runs on those public flat OVG routes; 26 Go final-routing cases pass. Other graphs still use the visibility grid; hierarchical OVG construction, general port selection, channel refinements, and other route cleanup stages remain unported. |
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
and the public path now matches all six final node boxes. The straight-route
branch of `BalanceEdgeSegments` now uses upstream's floored distribution in
an odd-size overlap corridor; linked and nested examples match every final
route point. The general segment-balancing stage remains unported.
The one- and two-edge ordinary branches of upstream `TransposeAll` now run
on public graphs. Three pinned bridge fixtures match the complete Go
`TransposeAll` stage. Rotation trials use upstream's graph-level placement
score, including symmetry and crossing terms. A pinned nested-container stage
fixture verifies that the one-edge branch rotates a leaf around its neighbor,
rounds after each quarter-turn, and refits both containing boxes to the exact
upstream geometry. The public compound
placement now retains each projected edge's original descendant geometry
while scoring sized candidates and finding neighbor medians. Combined with
unconstrained interior directions and the transpose stage, all six nested
node boxes match upstream. Container-aware reachability in the two-edge
transpose branch and full compound placement transactions remain unported.
The expanded oracle adds six compound patterns. It exposes an interior cluster
ownership error, now fixed, and a missing ordinary `BalanceSymmetry` stage,
ported against its upstream stage trace. The ordinary placement path now runs
upstream's `direct` mirror after placement, including original descendant
endpoints for projected edges; this fixes the vertical orientation of the
multiple-boundary-edge case. The projected root placement now matches the
upstream stage exactly: the sized optimizer centers a container using its
protruding child endpoints and scores interior sibling boxes as route
obstacles. Given identical stage geometry, the port also matches both pinned
upstream container translations. Equidistance now excludes diagonal side
branches from connected moves. The public multiple-boundary graph now matches
all six node boxes and all five routes. The visibility-grid search accounts
for turns at both endpoint ports, and the bent-route endpoint balancing pass
uses the upstream floored center in odd-height node walls. The
empty-container fixture now matches all node boxes and routes. The TypeScript
port applies upstream's area and square-deviation scoring when combining
disconnected subgraphs. Upstream's speculative transaction rejects shifts
when an empty container cannot be wrapped; the TypeScript alignment pass now
preserves that rejection. A straight route through the shared span of two
offset rectangular faces uses the midpoint of that span. The diamond fixture
matches the full upstream output. An
unconstrained container interior keeps the optimizer's cluster vessel
coordinate; the compound post-placement passes retain that vessel until
alignment finishes. The visibility-grid router selects the middle of the
unobstructed bend corridor, and endpoint balancing floors the route rows.
All ten expanded compound cases now match their pinned complete outputs.
The ordinary-endpoint `AlignAxes` delta calculation, ordinary-container
connected-set traversal, non-center-port penalty, and equal-size peer-container
alignment cost are ported. The stage's shift validity check now applies the
upstream graph-size, center-line obstruction, and newly introduced overlap
rules, including connected-node clearance. It refits ordinary containers before
scoring and accepts the exact connected moves in two pinned compound stage
traces. The ordinary-endpoint
candidate search is ported as a pass that accepts a graph scoring callback,
including upstream's Y-before-X tie order. The ordinary graph-level edge
score now combines per-node costs, symmetry, and straight-edge crossings.
Its value and accepted alignment match both pinned upstream stage scores for
the one-container chain. The public compound path runs that pass before
routing: the outgoing node's horizontal coordinate now matches upstream, and
the directioned-container output matches upstream on the vertical axis.
Container abduction scoring, table-column costs, tree-edge exclusions, complete
gap and equidistance branches, and general compound placement remain incomplete.

The generated compound oracle now covers twelve more container chains with two,
three, and four children in all four directions. The two-child top-to-bottom and
left-to-right cases match all node boxes and routes. The placement port now
distinguishes Go's nil edge-abduction slice from a present empty slice when
evaluating local quarter-turn transposes. Its three-child interior matches
the pinned Go placement stage. The ordinary sibling branch of `SwapStuff`
also matches a pinned three-child stage. During parent placement, symmetry
scoring follows an abducted edge into the original child topology, recovering
Go's 2/3 alignment reward for a chain endpoint. The three-child
top-to-bottom case now matches all six final node boxes after the compound
`Equidistance` pass reproduces Go's ordered child and container moves. Four
routes still differ. Most four-child cases and
other compound directions remain unmatched. Initializing an ordinary component
now traverses near-linked siblings in upstream breadth-first order. The pinned
four-child near/common-uncle placement fixture consequently matches Go's full
ordinary stage; the public compound case still has a seven-pixel interior
offset and a different parent placement.

The complete Go pipeline oracle now covers ten small flat graphs. Relative
node positions, sizes, and complete edge routes match exactly in all ten: a
chain, a cycle, six rooted trees, two disconnected chains, and a diamond.
Upstream treats the diamond's middle pair as a temporary cluster, which the
TypeScript port now does too. Labels are not included in that comparison.

The flat hierarchy fixture adds two branched workflows and twelve generated
layered DAGs. Their node boxes match the upstream hierarchy stage exactly,
including four cases with cross-level edges. Nine of twelve generated cases
match completed upstream node geometry; three still differ by 1–4 pixels after
the route-dependent `Dejitter` stage. Hierarchy edge routes are not yet exact.
The DAG preparation branch now expands undirected edges, reverses feedback
arcs, and merges repeated edges with rank weights. Six mixed-direction and
parallel-edge fixtures match upstream's hierarchy stage. Four also match
completed node geometry; two single-feedback-edge cases still have
route-dependent `Dejitter` differences.

The route comparison helper now reports edge-path parity as well as node
geometry. For the two curated branched workflows, only 5/8 and 3/8 routes
match the complete Go output. This isolates the next major integration gap:
the upstream OVG router and its later route cleanup passes.

The ordinary-node OVG visibility sweep from `routing/ovg.go` is translated in
`src/tala/ovg-sweep.ts`. It matches five focused Go sweep fixtures and nine
complete flat OVG builds when supplied the Go build's pre-sweep vertices,
including obstacle, port-direction, touching-port, and tunnel cases.
`src/tala/ovg-build.ts` now connects the translated candidate geometry,
visibility filtering, boundary stages, tunnel entries, and sweep for flat
graphs. Its full OVG vertex and edge sets match all nine pinned upstream
graphs. This graph construction is not yet integrated into the public router;
OVG path search, route cleanup, and hierarchical graph construction remain.
The post-sweep center connections, isolated-vertex removal, near-port flags,
and per-vertex indices now match all nine upstream final OVG fixtures in
`src/tala/ovg-finalize.ts`. The route search's stable indexed priority queue
is translated in `src/tala/priority-queue.ts`.
`src/tala/ovg-search.ts` translates the ordinary single-edge search branch,
including port direction checks, center-port and turn penalties, near-port
penalties, and path reconstruction. Its full vertex sequence and search cost
match pinned Go output for all nine flat OVG fixtures. Sequential multi-edge
search now indexes occupied points and edges in `src/tala/ovg-route-state.ts`
and applies center symmetry, duplicate-port, sharing, near-edge, and crossing
costs. Ordered paths and costs match eleven pinned Go cases with two or three
edges, including parallel and crossing routes. `src/tala/ovg-slingshot.ts`
now translates Go's L- and S-shaped rule-based choices, including obstruction,
sharing, crossing, and flight costs. The complete flat route-generation stage
matches Go's selected paths and total costs in those eleven multi-edge cases
and nine earlier single-edge geometry cases. Arrowhead and label costs,
route cleanup, hierarchical graph construction, and broader public router
integration remain.
Go's three ordinary route orders and first-minimum selection are translated;
the separate top-down order used by hierarchies also matches the pinned
eleven multi-edge fixtures. `Route.createSegmentEndpoints`
matches Go on those fixtures and the nine single-edge geometry cases. The
public TALA path now uses the selected OVG routes for flat, ordinary,
graphs without tree-sentinel routes, loops, or table-column
ports. The flat branch of `reorderSelectedRoutes` assigns parallel paths to
graph edges in input order after shared-port and orientation checks. All
eleven multi-edge fixtures now match final edge paths from Go's ordinary routing
stage through that public branch. Fifteen shape-specific fixtures compare
public paths after Go's shape-border tracing. The added reversed and vertical parallel
cases verify Go's rule against reusing a tunnel segment that contains an
entire existing route. The chain,
diamond, cycle, and
disconnected-chain complete-layout fixtures
retain exact Go routes. Other graphs still use the earlier visibility-grid
router until tree-route occupancy, nested OVG
construction, postprocessing, and full resource accounting are ported.
The TypeScript OVG construction now enforces upstream's one-million
intersection-candidate, 200,000-node, and 500,000-edge limits. Its separate
work-unit budgets and atomic cancellation behavior remain unported.

A separate set of 24 generated branching trees exercises deeper and uneven
structures. The TypeScript geometry matches the upstream node-placement stage
on all 24, plus four edge-labeled tree fixtures. The stage tests call the tree
placer directly, before route refinements. After porting tree-sentinel
`Dejitter` and applying `GapNormalization` to the flat-tree path, the completed
node geometry matches all 24. Upstream's gap transaction rejects a different
tree's seemingly beneficial move because it creates a new clearance overlap;
the TypeScript pass now makes the same rejection.

Tree route points match upstream in all 24 pinned fixtures when given upstream's
completed node geometry. All 24 match the completed node geometry and
route points together through the public TypeScript layout entry point.

The current playground defaults to the translated ordinary placement stage
for flat components. Its optional layered setting uses the previous adapter
placement and spacing controls. A faithful TALA port still needs the remaining
upstream graph model and ordered pipeline, followed by differential tests
against pinned upstream fixtures. Avoid describing the adapter as equivalent
until those tests pass.

`tools/upstream-fixtures` contains the Go oracle harness, inputs, and recorded
outputs used by `test/tala-upstream-placement-cost.test.ts`. The TypeScript
runtime has no Go or D2 dependency; the harness is for port validation only.

Twelve generated compound chain cases now provide a wider complete-pipeline
comparison across four directions and two to four children. The Go
`GapNormalization` branch that pulls a child toward its padded container wall
is translated and matches the upward and downward stage traces. The complete
top-down and left-to-right two-child cases match all node geometry and route
points. The bottom-up two-child case has a one-pixel node difference introduced
after placement by route-dependent `Dejitter`. The remaining generated cases
diverge at `NodePlacement`: the upstream engine uses a different interior
ordering for three and four children, so the recursive scope placement still
needs to carry more of the original compound topology into preprocessing.
