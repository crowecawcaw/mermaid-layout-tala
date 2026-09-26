# Placement cost differential fixtures

`main.go` calls the pinned upstream D2 TALA implementation to record ordinary
node placement costs. The browser and published package do not use this harness.

Source revision: `bf33790338b9854cb2a34418e69c17f9abf8de4b`.
Place `main.go` at
`d2layouts/d2talalayout/cmd/ts-fixtures/main.go` within a checkout of that
revision. From the D2 repository root, build the command and run it against
the input files in this directory:

```powershell
go build -o tala-ts-fixtures.exe ./d2layouts/d2talalayout/cmd/ts-fixtures
# Pass cases.json or random-cases.json on stdin and save stdout as the
# corresponding expected.json or random-expected.json file.
```

Run `node random-cases.mjs` to reproduce the varied inputs. The Go program
records the sizeless and sized `NodeEdgeLength` results, `NodeSymmetry`, cell
size, and the halved turn cost seen by sized placement. The TypeScript test
compares those results to the port.

`compaction_fixture_test.go` is a separate oracle in the upstream
`internal/placement` package. Copy it there as `ts_compaction_fixture_test.go`.
Set `TALA_TS_COMPACTION_INPUT` and `TALA_TS_COMPACTION_OUTPUT` to absolute paths
for one input/output pair, then run:

```powershell
go test ./d2layouts/d2talalayout/internal/placement -run '^TestTSCompactionFixtures$' -count=1
```

The pairs are `compaction-cases.json` / `compaction-expected.json` and
`compaction-random-cases.json` / `compaction-random-expected.json`. Run
`node compaction-random-cases.mjs` to reproduce the latter inputs.
Full compaction runs are in `compaction-full-cases.json` /
`compaction-full-expected.json` and `compaction-full-random-cases.json` /
`compaction-full-random-expected.json`. Run
`node compaction-full-random-cases.mjs` to reproduce the varied full inputs.

`placement_fixture_test.go` calls upstream's complete ordinary-node
`placeNodesOrthogonally` stage. Copy it into the upstream `internal/placement`
package as `ts_placement_fixture_test.go`, set `TALA_TS_PLACEMENT_INPUT` and
`TALA_TS_PLACEMENT_OUTPUT` to absolute paths for `placement-cases.json` and
`placement-expected.json`, then run:

```powershell
go test ./d2layouts/d2talalayout/internal/placement -run '^TestTSOrdinaryPlacementFixtures$' -count=1
```

The pairs are `placement-cases.json` / `placement-expected.json` and
`placement-random-cases.json` / `placement-random-expected.json`. Run
`node placement-random-cases.mjs` to reproduce the latter inputs. Together
they cover 42 connected ordinary graphs and compare final node coordinates
exactly. They do not cover compound structures, labels, edge routing, or bin
packing.

`join_fixture_test.go` is another oracle in the upstream `internal/grouping`
package. Copy it there as `ts_join_fixture_test.go`, set `TALA_TS_JOIN_INPUT`
and `TALA_TS_JOIN_OUTPUT` to absolute paths for `join-cases.json` and
`join-expected.json`, then run:

```powershell
go test ./d2layouts/d2talalayout/internal/grouping -run '^TestTSOrdinaryJoinFixtures$' -count=1
```

`full-layout-oracle.go` runs the complete upstream pipeline for the graphs in
`full-layout-cases.json`. Copy it to
`d2layouts/d2talalayout/cmd/ts-full-layout/main.go` in the pinned checkout,
then pass the case JSON on stdin to `go run ./d2layouts/d2talalayout/cmd/ts-full-layout`.
Its output is `full-layout-expected.json`. After `npm run build`, run
`node tools/upstream-fixtures/compare-full.mjs` from this repository to show
relative geometry differences. The test `tala-upstream-full-layout.test.ts`
pins the nine cases whose node geometry matches; edge routes are still outside
that assertion.

Run `node full-tree-random-cases.mjs` to regenerate 24 deeper branching-tree
cases. `full-tree-random-expected.json` records complete upstream results for
them. Compare with `node tools/upstream-fixtures/compare-full.mjs
./full-tree-random-cases.json ./full-tree-random-expected.json`. These generated
cases currently expose the missing general tree pipeline; they are diagnostic
inputs, not parity assertions.

`node-placement-oracle_test.go` records the upstream graph immediately after
the `NodePlacement` pipeline stage. Copy it into the pinned checkout's
`internal/engine` package as `ts_node_placement_fixture_test.go`. Set
`TALA_TS_NODE_PLACEMENT_INPUT` and `TALA_TS_NODE_PLACEMENT_OUTPUT` to absolute
paths for `full-tree-random-cases.json` and
`full-tree-random-stage-expected.json`, then run:

```powershell
go test ./d2layouts/d2talalayout/internal/engine -run '^TestTSNodePlacementFixtures$' -count=1
```

`test/tala-upstream-tree-stage.test.ts` pins all 24 generated cases and four
edge-labeled trees with exact relative node geometry at that stage. Later
routing refinements can still move nodes, so the completed-layout fixture is a
separate check. The labeled inputs and oracle results are in
`labeled-tree-cases.json` and `labeled-tree-stage-expected.json`.
For tree preprocessing, the same `node-placement-oracle_test.go` harness has
`TestTSTreeExtractionFixtures`. Copy it into the pinned upstream engine package
and run with `TALA_TS_TREE_EXTRACTION_INPUT` pointing to
`full-tree-random-cases.json` and `TALA_TS_TREE_EXTRACTION_OUTPUT` pointing to
`full-tree-random-extraction-expected.json`. This records the graph's remaining
nodes and the ordered extracted trees after upstream's fourth pipeline stage.

For a trace between extraction and the graph-wide direction mirror, run
`TestTSTreeRawPlacementFixtures` with `TALA_TS_TREE_RAW_INPUT` pointing to the
same cases and `TALA_TS_TREE_RAW_OUTPUT` pointing to
`full-tree-random-raw-expected.json`. This runs upstream `trees.Place` after
preprocessing and before `placement.direct`.

`TestTSClusterExtractionFixtures` records ordinary sibling clusters after the
sixth upstream stage. Set `TALA_TS_CLUSTER_INPUT` to `flat-cluster-cases.json`
and `TALA_TS_CLUSTER_OUTPUT` to `flat-cluster-expected.json`. The complete
pipeline results for those cases are in `flat-cluster-full-expected.json`.

`cluster-geometry-oracle_test.go` records `layoutgraph.Cluster.Resize`,
`ArrangeClusterNodes`, and a second `SyncGeometry` pass for row and column
vessels. Copy it into the pinned upstream engine package as
`ts_cluster_geometry_fixture_test.go`; set `TALA_TS_CLUSTER_GEOMETRY_INPUT` to
`cluster-geometry-cases.json` and `TALA_TS_CLUSTER_GEOMETRY_OUTPUT` to
`cluster-geometry-expected.json`, then run `TestTSClusterGeometryFixtures`.

`TestTSClusterTopologyFixtures` in `node-placement-oracle_test.go` records the
temporary graph nodes, rewritten edges, and edge-abduction records immediately
after `PreprocessClusters`. Set `TALA_TS_CLUSTER_TOPOLOGY_INPUT` to
`flat-cluster-cases.json` and `TALA_TS_CLUSTER_TOPOLOGY_OUTPUT` to
`flat-cluster-topology-expected.json` before running it in the pinned upstream
engine package. The tree-leaves case has no cluster and remains in tree
preprocessing, so the topology parity test checks the other four cases.
