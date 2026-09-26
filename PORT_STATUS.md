# TypeScript port status

Source reference: D2 commit `bf33790338b9854cb2a34418e69c17f9abf8de4b`,
`d2layouts/d2talalayout`. That tree has 211 production Go files and about
59,600 lines. The Mermaid adapter in this repository is **not equivalent** to
that engine yet.

| Upstream area | TypeScript status |
| --- | --- |
| Weighted DAG ranker | Ported in `src/rank.ts` with translated fixtures and tests. |
| Input graph and shape geometry | Mermaid node measurements adapted; upstream graph ownership, topology mutations, and shape policies remain unported. |
| Nested containers and direction | Supported by a Mermaid-specific recursive layout in `src/layout.ts`; placement differs from upstream. |
| Seed attempts | Deterministic ordering attempts and score selection implemented; random placement and exact upstream quality scoring remain unported. |
| Tree, hierarchy, hub, proximity, cluster, and sequence discovery | Upstream algorithms remain unported. The adapter applies layered placement to all connected components. |
| General placement, symmetry, compaction, and bin packing | Upstream algorithms remain unported. |
| Edge routing | Visibility-grid routing avoids node interiors; upstream route graph, port policies, channel refinements, and route cleanup remain unported. |
| Labels | Edge labels are measured and placed on a selected route segment; upstream label optimization remains unported. |
| Validation and resource limits | Basic input validation exists. Upstream graph invariants and work budgets remain unported. |

The current playground shows the TypeScript adapter's behavior. Similarity to
ELK on ordinary flowcharts is expected because both currently use layered
placement. A faithful TALA port needs the upstream graph model and ordered
placement pipeline, followed by differential tests against pinned upstream
fixtures. Avoid describing the adapter as equivalent until those tests pass.
