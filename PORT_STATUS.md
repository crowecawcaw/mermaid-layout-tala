# TypeScript port status

Source reference: D2 commit `bf33790338b9854cb2a34418e69c17f9abf8de4b`,
`d2layouts/d2talalayout`. That tree has 211 production Go files and about
59,600 lines. The Mermaid adapter in this repository is **not equivalent** to
that engine yet.

| Upstream area | TypeScript status |
| --- | --- |
| Weighted DAG ranker | Ported in `src/rank.ts` with translated fixtures and tests. |
| Input graph and shape geometry | Independent mutable graph records, input order, container ownership, adjacency, clone isolation, ordinary component splitting, and fixed-node component grouping are ported in `src/tala`. Upstream compound topology mutations and shape policies remain unported. |
| Nested containers and direction | Supported by a Mermaid-specific recursive layout in `src/layout.ts`; placement differs from upstream. |
| Seed attempts | Independent mutable graph clones and deterministic ordering attempts are implemented. Upstream crossing evaluation is ported; random placement and full label scoring remain unported. |
| Tree, hierarchy, hub, proximity, cluster, and sequence discovery | Upstream `AddHubs` discovery and a bounded ordinary rooted-tree geometry branch are ported. Branching arborescences match completed upstream node geometry in six pinned tree cases, including all four directions, unequal node sizes, and two levels. General tree extraction, hierarchy discovery and placement, and other grouping algorithms remain unported. Ordinary connected components use translated TALA placement by default; nested containers still use the adapter's recursive placement. |
| General placement, symmetry, compaction, and bin packing | The ordinary-node initializer, Go-compatible random stream, sizeless and sized optimizers, spatial swaps, quarter-turn transposes, compaction, distance-cluster joining, and placement stage are translated. Sized scoring includes upstream flow continuity and ordered obstruction handling; transpose scoring includes straight-edge crossings and cached crossing cost. Placement costs match 54 pinned upstream fixtures, compaction matches 65 fixtures, distance-cluster joining matches 7 fixtures, and the complete ordinary placement stage matches 12 curated plus 30 generated graphs exactly. Compound placement, labels, herd behavior, bin packing, and the other upstream placement branches remain unported. The ordinary stage is connected to the renderer for flat components. |
| Edge routing | Visibility-grid routing avoids node interiors; upstream route graph, port policies, channel refinements, and route cleanup remain unported. |
| Labels | Edge labels are measured and placed on a selected route segment; upstream label optimization remains unported. |
| Validation and resource limits | Basic input validation exists. Upstream graph invariants and work budgets remain unported. |

The complete Go pipeline oracle now covers ten small flat graphs. Relative
node positions and sizes match exactly in nine: a chain, a cycle, six rooted
trees, and two disconnected chains. The diamond still differs because upstream
selects hierarchical placement. Edge routes and labels are not included in
that nine-of-ten comparison.

A separate set of 24 generated branching trees exercises deeper and uneven
structures. The TypeScript geometry now matches the upstream node-placement
stage on 12 of them, and matches the completed pipeline on 8. The remaining
cases include tree partitions and orientation choices that are not yet ported,
prescaling that changes node sizes, and post-route `Dejitter` moves.

The current playground defaults to the translated ordinary placement stage
for flat components. Its optional layered setting uses the previous adapter
placement and spacing controls. A faithful TALA port still needs the remaining
upstream graph model and ordered pipeline, followed by differential tests
against pinned upstream fixtures. Avoid describing the adapter as equivalent
until those tests pass.

`tools/upstream-fixtures` contains the Go oracle harness, inputs, and recorded
outputs used by `test/tala-upstream-placement-cost.test.ts`. The TypeScript
runtime has no Go or D2 dependency; the harness is for port validation only.
