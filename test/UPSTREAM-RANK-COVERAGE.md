# Upstream TALA rank test coverage

The TypeScript tests in `rank.test.ts` translate the black-box contract from
[`d2layouts/d2talalayout/internal/hierarchy/rank_correctness_test.go`](https://github.com/d2lang/d2/blob/bf33790338b9854cb2a34418e69c17f9abf8de4b/d2layouts/d2talalayout/internal/hierarchy/rank_correctness_test.go).
The Go suite was run with Go 1.27.1, which was used to generate the checked-in
seeded input corpus in `fixtures/upstream-rank-random-cases.json`. It contains
the exact 200 weighted DAGs produced by `math/rand.NewSource(1)` in that Go
test.

| Upstream Go test | TypeScript test |
| --- | --- |
| `TestRankDAGFindsOptimalRanks` | `finds the optimum for the upstream five-node fixture` |
| `TestRankDAGImprovesLongestPathThroughSimplexExchange` | `finds the weighted-span optimum and improves the longest-path ranking` |
| `TestRankDAGUsesDeterministicNormalizedOptimum` | `normalizes the upstream equal-cost ranking deterministically` |
| `TestRankDAGTieUsesSimplexBasisWithoutSecondaryPostpass` | `matches TALA simplex tie choices deterministically` |
| `TestRankSimplexTreeFlowCertificate` | `passes the upstream tree-flow fixture through its optimality certificate` |
| `TestRankSimplexHandlesTreeEdgeOppositeRootOrder` | `ranks a single edge whose source has a larger ID than its target` |
| `TestRankSimplexCertificateRejectsNonoptimalTree` | No direct equivalent: this injects a private, deliberately nonoptimal simplex basis. `rankDag` exposes no basis input; every successful call still runs and checks its primal/dual certificate. |
| `TestRankSimplexBlandOrderHandlesDegeneratePivot` | `completes the upstream degenerate Bland-pivot fixture deterministically` |
| `TestRankSimplexCompletesManyExchanges` | `completes the upstream 250-node, 1,000-edge exchange graph` |
| `TestRankDAGPreservesParallelEdgeRankWeight` | `preserves parallel-edge influence through rank weights` |
| `TestRankDAGFindsOptimalRanksForSmallDAGs` | `matches TALA optimum costs for every connected forward DAG through five nodes` |
| `TestRankDAGFindsOptimalRanksForWeightedSmallDAGs` | `matches weighted TALA optima when edge weights can change the chosen ranks` |
| `TestRankDAGRejectsInvalidExplicitRankWeight` | `rejects invalid explicit rank weights` |
| `TestRankDAGFindsOptimalRanksForRandomWeightedDAGs` | `matches optimal costs for the exact Go-seeded random DAG corpus` |
| `TestRankDAGIsIndependentOfInputSliceOrder` | `is independent of the upstream weighted graph input order` |
| `TestRankDAGRejectsCycles` | `rejects cycles and disconnected graphs` |

The three Go tests that inspect simplex internals are adapted to assert the
same public rank and objective behavior where possible. The ranker keeps those
internals private and verifies a dual certificate before returning a result.
