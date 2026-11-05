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
Transactions and cloning are translated below; subgraph combination and additional graph operations remain pending.

`trees/geometry.ts` translates the complete upstream tree geometry kernel;
`trees/layout.ts` currently translates orientation construction and tree edge-label
placement, and `trees/traversal.ts` translates breadth-first descendants.
The 320 Go fixtures compare exact coordinates, edge-label state and work counts
for 80 trees in four orientations, including nested container descendants.
Placement candidate selection and transactional restoration are translated in `placement.ts` below. Regenerate geometry fixtures using `trees`.

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
use their length. Automatic Go backing-array growth/capacity tracking remains pending. The
subgraph-combination preflight is translated below. Regenerate `preflight`.

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
container, incidence and route identities. Transaction commit/overlap validation and tree placement are translated below.

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

`trees/placement.ts` completes candidate-side construction, distance/aspect-ratio
selection, arrowhead/direction grouping, transactional trials and the atomic
`Place` wrapper. One hundred sixty Go graph fixtures compare final node/edge
order, coordinates, labels, tree ownership and exact work counts; the same cases
also exercise the public wrapper. Cancellation and work-limit tests check
rollback identity. Regenerate `treeplacement`.

`layoutgraph/graph-bounds.ts` and `labelgeom/arrowhead.ts` translate routed-edge,
arrowhead-label and complete graph bounds. Three hundred forty Go fixtures
exercise arrowhead combinations, fractional text truncation, route directions,
and all supported edge-label positions. Regenerate `graphbounds`.

`proximity/` translates hub discovery, common-uncle sibling selection, atomic
near-set replacement, connected herd components, cousin-side intersection,
viral propagation and herd-fence synchronization. Two hundred Go compound-graph
fixtures compare ordered groups, neighbors, side assignments and pair counts.
Additional tests cover cancellation during near-set publication, work exhaustion,
independent propagated records and conflicting orientations. Regenerate
`proximity`.

`grouping/cluster-discovery.ts` and `clusters.ts` translate indexed sibling
comparison, arrow signatures, container estimates, seeded arrangement, vessel
allocation, edge abduction and atomic cluster installation. Two hundred forty
Go cases compare topology/order, geometry, exact 64-bit vessel IDs, random-stream
continuation and work counts. Regenerate `clusters`.

`gosort/slice.ts` directly translates Go 1.27.1's unstable `sort.Slice` algorithm,
including pivot selection, pattern breaking and heap fallback. Five hundred Go
cases compare the entire resulting permutation and comparison count, including
equal keys and adversarial orderings. Regenerate `gosort`. Cluster geometry uses
this implementation where upstream uses unstable sorting.

`grouping/sequences.ts` translates step-run discovery, defining-edge removal,
vessel creation, remembered-sequence validation, collision-safe IDs and repeated
installation. One hundred eighty Go fixtures compare both initial grouping and
cleanup/reinstallation, including parallel edges and narrow steps. Cancellation
checks restore consumed edges and resized member records. Regenerate `sequences`.

`grouping/lifecycle.ts` translates group cleanup, near-relation redistribution
and cluster retirement. One hundred Go cases compare cleanup, reset and repeated
reset, including vessel identity, graph ownership and incident-edge order.
Regenerate `lifecycle`. Shared Go slice backing views remain a general runtime
representation limitation described above.

`grouping/join.ts` and `layoutgraph/distance-clusters.ts` translate distance-island
discovery, fixed-origin-aware movement and the reverse-order position journal.
One hundred eighty Go cases compare final positions and exact work counts for
edge-connected, near-only and fixed-node graphs. Tests also restore shared point
identities and cancel after actual movement. Regenerate `join`.

`layoutgraph/reachability.ts`, `subgraphs.ts` and `edge-abduction.ts` translate
ordered reachability, temporary graph ownership, subgraph splitting, container
edge reassignment and restoration. Two hundred forty Go split fixtures compare
traversal order, component inventories, ownership and work counts; 240 additional
cases compare edge reassignment, partial-view restoration and reapplication.
A cancellation test restores near-only nodes outside the original node slice.
Regenerate `subgraphs` and `abduction`.

`packing/combine.ts` and `combine-snapshot.ts` translate subgraph combination,
including shared-topology validation, fixed-first placement, exact unstable area
ordering, ancestor obstacles, routed bounds, route translation and rollback.
The original 100 Go combination fixtures and 180 richer cases compare output
node/edge order and coordinates, including nested descendants and fractional
labels/routes. The node-owned combination preflight has 42 Go differential cases.
Regenerate `combine` and `combinationpreflight`.

`layoutgraph/ports.ts` translates absolute port coordinates, port-side lookup,
facing table-column ports and axis alignment. `placementcost/{geometry,axis,
cluster,flow-continuity}.ts` translate scoring dependencies. `edge-length.ts`
assembles the edge scorer, including obstruction, direction, cluster and table
penalties. The reusable scorer caches preparation and replays cancellation polls;
pool allocation and broader grouped/table differential coverage remain pending.
Graph-wide scoring uses sequential execution instead of Go worker goroutines,
so concurrent cancellation and panic ordering are not yet equivalent. Lazy turn/crossing/
non-center-port cost calculation is translated in `layoutgraph/placement-cost.ts`.
Four hundred Go cases compare scoring values and compass calculations, and 460
cases cover all 23 shapes' absolute ports and table-column distances. Regenerate
`placementgeometry` and `ports`.

The assembled edge scorer is compared with Go across 320 graphs and eight option
combinations each; these fixtures do not establish complete pipeline parity.
Regenerate `edgelength`.

The node symmetry score is translated and compared with Go for every node in
the 320 `edgelength` graphs; group and abduction cases need additional coverage.

Graph-wide costs and cache hashes also match Go for the 320 `edgelength` graphs
across eight option combinations; larger parallel and grouped graphs need coverage.

The orthogonal placement pass now connects translated initialization, sizeless
and sized optimization, compaction, nested geometry and herd synchronization.
Forty-eight Go fixtures compare final coordinates, turn cost and RNG state on
small chain and branching graphs, including fixed nodes. Nested groups, larger
graphs and full public-pipeline integration still require verification. Regenerate
`orthogonal`.

The recursive placement stage now connects subgraph splitting, nesting, the
orthogonal optimizer, tree placement, direction refinement and packing. Go
fixtures compare 48 flat and 24 nested graphs, including fixed nodes and edge
abductions. It remains an internal translation; the public adapter still uses
the earlier pipeline. Regenerate `placenodes` and `placenested`.

`routing/{geometry,turns,cost}.ts` translate segment and box intersection,
ideal turn axes, route crossings and candidate route cost. Six hundred Go
fixtures cover these shared routing primitives, including degenerate segments
and negative-size boxes. The routing stages that use them remain in progress.
Regenerate `routinggeometry`.

`routing/trace.ts` translates the shape-border tracing kernel, including
3D/multiple offsets and restoration of aliased node positions. Go fixtures
cover all 23 shapes, self-edges and modifier combinations. The atomic route-stage wrapper includes validation, work accounting and
rollback; 480 Go work-limit cases compare its output and failure boundaries.
Regenerate `routingtrace` and `routingstage`.

`routing/edge-simplify.ts` translates route bend simplification, obstacle and
other-edge checks, signed endpoint direction checks, and atomic rollback.
1,440 Go comparisons cover successful simplification, obstructions, transposed
routes and work-limit failures. Regenerate `routingsimplify`.

`routing/priority-queue.ts` translates the indexed min-heap used by route
search, including insertion-order ties, decrease-key, entry reuse and work
charges. Its pop order and work totals match 160 Go fixtures. Regenerate
`routingqueue`.

`routing/ovg-node.ts` and `ovg-edge.ts` translate visibility graph node/edge
metadata, including multiple owners and directions per port, direction-set
transforms and distance to node boundaries. The visibility construction and
port-index scans remain pending. Regenerate `routingovg` for 360 Go cases.

`routing/ovg-edge-set.ts` translates visibility-edge indexing, ordered overlap
and crossing queries, and guarded insertion/work accounting. Its 160 Go
fixtures cover 6,400 queries, duplicates and zero-length edges. Regenerate
`routingedgeset`.

`routing/search-guard.ts` translates per-flavor search budgeting, cancellation,
aggregate accounting, telemetry and guarded ancestry helpers. The route-stage
stable merge sort is also translated. Go fixtures compare 2,400 work-budget
sequences and 1,560 stable-sort and interrupted-sort cases. The search guard's
concurrent worker ordering remains subject to the existing JavaScript/Go
concurrency limitation. Regenerate `routingguard` and `routingsort`.

`routing/ovg.ts` and `ovg-resource.ts` translate foundational visibility graph
insertion and connection, point canonicalization and resource accounting.
The remaining visibility graph construction scans are not yet translated.
180 Go fixtures cover graph operations and resource-limit boundaries;
regenerate `ovgresource`.

`routing/route.ts` translates segment endpoint extraction, colinearity and
opposing-direction checks, and guarded route-swap eligibility. 1,200 Go
fixtures compare these decisions and work charges. Regenerate `routingroute`.

`routing/tunnel.ts` translates tunnel range splitting, obstacle filtering,
sequence wedge adjustment, endpoint creation and whole-graph discovery.
960 Go cases cover horizontal/vertical layouts, obstructions, multiple edges
and work-limit failures. Regenerate `routingtunnel`.

`routing/ovg-ports.ts` translates visibility port generation, shared-point
ownership, tunnel insertion and center connections. Go fixtures cover all 23
shapes, shared coordinates, invisible nodes and interrupted builds across 736
cases. Regenerate `ovgports`.

`routing/ovg-boundaries.ts` translates boundary layers, corner nodes, bounding
boxes and the point proximity index. 480 Go cases compare generated boundary
nodes and resource-limit behavior; index-specific coverage remains pending.
Regenerate `ovgboundary`.

`routing/ovg-port-index.ts` translates port coordinate indexing, aligned-owner
merging, clearance queries and the unobstructed port-line scan. Two hundred
single-owner Go fixtures compare 6,000 queries and aggregate work; Go map owner
iteration can differ for multiple owners. Regenerate `ovgportindex`.

`routing/ovg-intersections.ts` connects Cartesian candidate generation,
fixed-overlap discovery, port indexing and proximity rejection. Six hundred
forty Go cases compare generated nodes, budget use and failure boundaries;
fixtures currently use one port owner, so multi-owner Go map ordering needs
additional coverage. Regenerate `ovgintersection`.

`routing/ovg-edge-points.ts` translates edge perimeter and halfway point
construction and the edge-point scan. The individual geometry routines match
960 Go cases across orientations, shapes and work limits; grouped nodes and
the complete multi-owner scan need additional coverage. Regenerate
`ovgedgepoints`.

`routing/ovg-port-boundaries.ts` translates boundary connections from ports,
including direction-aware obstacle exceptions and the fallback connection
path. Four hundred eighty Go cases compare generated points and resource
accounting; multi-owner and nested-container coverage remains pending.
Regenerate `ovgportboundary`.

`routing/ovg-connect.ts` translates axis sweeps, obstacle checks, sequence-port
restrictions and port-direction compatibility. Six hundred forty Go cases
compare ordered connections and work-limit behavior; grouped and multi-owner
cases need additional coverage. Regenerate `ovgconnect`.

`routing/ovg-postconnect.ts` translates nested container assignment and the
breadth-first near-port penalty flags. Four hundred eighty Go cases compare
nested containment, flag propagation and interrupted work. Regenerate
`ovgpostconnect`.

`routing/tree-routes.ts` translates tree edge port selection, alignment,
midpoints and OVG insertion. Go fixtures cover 960 combinations of direction,
shape, source/target orientation and work limits; shared parent arrowhead
conflicts need more coverage. Regenerate `routingtree`.

`routing/ovg-hierarchy.ts` translates hierarchy visibility levels, boundary
alignment, port-direction transforms and the hierarchy build wrapper. Single-
node Go fixtures cover all four directions, table transposition and restoration
on work-limit failures. Multi-level hierarchy builds and multiple port owners
need further differential coverage. Regenerate `ovghierarchy`.

`routing/ovg-build.ts` connects the translated visibility graph construction
passes in upstream order. One hundred twenty-eight single-node Go cases compare
the complete resulting graph and work-limit failures; multiple nodes,
hierarchies, groups and Go map iteration require further differential testing.
This internal builder is not yet connected to public routing. Regenerate
`ovgbuild`.
Eighty additional connected two-node Go cases compare complete visibility
coordinates and edge topology independent of map-driven insertion order;
regenerate `ovgbuildmulti`.

`routing/sort-edges.ts` translates all four route generation orders and
cluster-first stable ordering, using Go's stable sort schedule. One hundred
eighty Go graphs compare every flavor. Regenerate `routingsortedge`.

`routing/slingshot-geometry.ts` translates the upstream quick-route launch,
landing and flight geometry helpers, preference calculation, path filling and
route-check caching. Four hundred eighty Go cases cover the geometric
predicates and preferences; the complete slingshot search remains pending.
Regenerate `slingshotgeometry`.

`routing/best-route.ts` translates the final route reconstruction, including
turn-cost correction, ideal axes, cycle handling and bounded work. Eight
hundred Go cases compare route selection and interruption. Regenerate
`routingbest`.

`routing/route-sharing.ts` translates route overlap eligibility, guarded edge
and node scans, ancestor filtering and cluster membership discovery. Six
hundred Go cases compare arrowhead-based sharing, geometric overlap and work
charges; complex styles and nested clusters need broader coverage. Regenerate
`routingsharing`.

`routing/table-ports.ts` and `labeling/arrowhead.ts` translate table-column
port selection and renderer-compatible arrowhead label boxes. Two hundred forty
Go cases compare port identities, work charges and label positions. Regenerate
`routingtable`.

`routing/route-inventory.ts` translates route registration, overlapping-route
lookup and nearby-edge indexing. One hundred twenty Go cases compare overlap
lookups, proximity flags and work totals; cancellation during Go map iteration
and richer labels need further coverage. Regenerate `routeinventory`.

`routing/route-ports.ts` translates used-port discovery and mirrored-port
preferences using a coordinate-keyed point map. One hundred twenty Go cases
compare all six occupancy sets, symmetry decisions and work charges.
Regenerate `routeports`.

`routing/search-costs.ts` and the search guard's fixed-overlap inventory
translate arrowhead label obstruction costs and fixed-node overlap discovery.
Two hundred forty Go cases compare costs, overlap sets and work accounting.
Regenerate `routingcosts`.

`routing/route-line.ts` translates guarded straight-line candidate selection,
including port sharing, obstacles, angle checks, labels and route scoring.
Nine hundred sixty Go cases compare candidates, cost and budget failures.
Regenerate `routingline`.

`routing/edge-router.ts` translates the OVG Dijkstra search, including quick
straight-line candidates, port and container constraints, route sharing,
label penalties, turn costs and path reconstruction. Three hundred twenty Go
cases compare routes, costs and work failures on a controlled visibility graph.
The complete slingshot optimization, multi-route scenarios, generated-graph
search and public pipeline integration still need verification/translation.
Regenerate `routingsearch`.
Eighty connected two-node cases also match Go search paths and costs using
fully generated visibility graphs. Regenerate `routinggenerated`.
Sixty additional Go cases compare sequential searches for two or three edges,
including duplicate and reversed connections. Regenerate `routingmulti`.

`routing/slingshot.ts` translates the upstream L- and S-shaped quick-route
search, overlap checks, preferences and label penalties. One hundred Go cases
compare normal slingshot results, and eighty more directly compare S-shaped
searches with obstacles. Multi-route and table-column cases need broader
coverage. Regenerate `routingslingshot` and `routingsshape`.

`routing/generate-routes.ts` connects slingshot, Dijkstra and straight-line
fallback in the upstream route-generation order. One hundred ninety-two Go
cases compare complete route sets across all four flavors, including duplicate
edges and arrowhead labels. Graph-stage orchestration, post-processing and the
public adapter remain in progress. Regenerate `routinggenerate`.

`routing/selected-routes.ts` translates parallel-route ordering and the atomic
commit of selected route points. Six hundred Go cases compare route ownership,
committed geometry and work-limit failures. Regenerate `routingselected`.

`routing/sentinel-routes.ts` translates tree sentinel path traversal,
port-ownership validation and loop-route conversion. Eighty Go cases cover
all directions and missing path segments; full tree-route integration needs
additional coverage. Regenerate `routingsentinel`.

`routing/coordinator.ts` connects visibility graph construction, tree and loop
routes, route flavors and selected-route commit. One hundred Go cases compare
complete subgraph edge routes, including duplicate connections and labels.
Flavor execution is currently sequential in TypeScript, so Go worker panic and
cancellation ordering differ. The whole-graph atomic stage remains pending.
Regenerate `routingcoordinator`.

`graphbounds/bounds.ts` translates guarded node and fixed-origin bounds used
by routing and packing, including outside labels, icons and modifier offsets.
Three hundred Go cases compare bounds and exact work counts. Regenerate
`guardedbounds`.

`routing/graph-stage.ts` connects tracked subgraph splitting, nearby obstacles,
aggregate budgets, subgraph routing, ownership restoration and atomic rollback.
Three hundred Go cases compare complete routes, rerouting/early-return behavior
and work-limit rollback. Broader nested, tree, concurrent-failure and observer
coverage remains pending. Regenerate `routinggraph`.

`placement/symmetry-stage.ts` translates symmetry balancing and the complete
transpose-stage wrapper. One hundred sixty Go fixtures compare node positions
and cell size across both stages. Go map order for adjacent nodes remains a
potential tie difference. Regenerate `placementsymmetrystage`.
