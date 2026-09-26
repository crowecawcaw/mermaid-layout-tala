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
| Tree, hierarchy, hub, proximity, cluster, and sequence discovery | Upstream `AddHubs` is ported. The other algorithms remain unported. The adapter still applies layered placement to all connected components. |
| General placement, symmetry, compaction, and bin packing | The ordinary-node initializer, Go-compatible random stream, sizeless and sized optimizers, spatial swaps, quarter-turn transposes, compaction, and placement stage are translated. Sized scoring includes upstream flow continuity and ordered obstruction handling. Placement costs match 54 pinned upstream fixtures; compaction matches 65 fixtures; and the complete ordinary placement stage matches 12 curated graphs exactly. A wider 30-graph random audit matched 17, so equivalence is still incomplete. Compound placement, labels, crossing costs in transpose decisions, herd behavior, bin packing, and the remaining randomized divergences require work. The translated stage is not connected to the renderer yet. |
| Edge routing | Visibility-grid routing avoids node interiors; upstream route graph, port policies, channel refinements, and route cleanup remain unported. |
| Labels | Edge labels are measured and placed on a selected route segment; upstream label optimization remains unported. |
| Validation and resource limits | Basic input validation exists. Upstream graph invariants and work budgets remain unported. |

The current playground shows the TypeScript adapter's behavior. Similarity to
ELK on ordinary flowcharts is expected because both currently use layered
placement. A faithful TALA port needs the upstream graph model and ordered
placement pipeline, followed by differential tests against pinned upstream
fixtures. Avoid describing the adapter as equivalent until those tests pass.

`tools/upstream-fixtures` contains the Go oracle harness, inputs, and recorded
outputs used by `test/tala-upstream-placement-cost.test.ts`. The TypeScript
runtime has no Go or D2 dependency; the harness is for port validation only.
