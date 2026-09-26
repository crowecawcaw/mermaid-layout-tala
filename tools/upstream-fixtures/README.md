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
