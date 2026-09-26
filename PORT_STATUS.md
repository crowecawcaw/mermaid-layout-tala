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
| General placement, symmetry, compaction, and bin packing | The even-seed graph-distance initializer, odd-seed ordinary-node initializer including fixed anchors, placement cell sizing, geometry constants, ordinary-box overlap, box distances, compass helpers, Go-compatible seeded random stream, ordinary-node sizeless optimizer, and sized placement candidate/move search are translated. The ordinary optimizers now use their ported scores by default. Sizeless edge cost, sized edge cost including semi-diagonal route alternatives and separately obstructed diagonal routes, turn cost, and local symmetry match 48 pinned upstream fixtures. Ordinary-node compaction visibility, candidate generation, inflation, group shifts, and node search match 65 upstream fixtures, including 27 full compaction runs. Sized scoring still needs labels, crossings, and compound branches; bin packing remains unported, so the optimizer is not connected to the renderer. |
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
