// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package hierarchy

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptHierarchysimplexFixtures(t *testing.T) {
	path := os.Getenv("TALA_HIERARCHYSIMPLEX_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 240; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		count := 4 + trial%5
		for i := 0; i < count; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), 40, 30)
			n.TopLeft = geo.NewPoint(float64(i*100), 0)
			g.AddNewNodeToContainer(nil, n)
			nodes = append(nodes, n)
		}
		seen := map[[2]int]bool{}
		for i := 1; i < count; i++ {
			parent := (i - 1)
			if trial%3 != 0 {
				parent = (i*7 + trial) % i
			}
			seen[[2]int{parent, i}] = true
			e := g.Connect(nodes[parent], nodes[i])
			e.TargetArrowhead = layoutgraph.TriangleArrowhead
			e.SetHierarchyRankWeight(1 + (i+trial)%5)
		}
		for i := 0; i < count-2; i++ {
			j := i + 2 + (trial+i)%(count-i-2)
			if seen[[2]int{i, j}] {
				continue
			}
			e := g.Connect(nodes[i], nodes[j])
			e.TargetArrowhead = layoutgraph.TriangleArrowhead
			e.SetHierarchyRankWeight(1 + (trial+i*3)%5)
		}
		for i, e := range g.Edges {
			e.ID = layoutgraph.EntityID(i + 1)
		}
		guard, _ := limits.NewOptimizationWorkGuard(context.Background(), "RankDAG", 10000000)
		problem, err := newRankProblem(g, guard)
		msg := ""
		levels := []int{}
		var dual, initialCost int64
		countLevels := 0
		if err == nil {
			initial, e := problem.longestPathLevels(guard)
			err = e
			if err == nil {
				for _, edge := range problem.edges {
					initialCost += edge.weight * (initial[edge.to] - initial[edge.from])
				}
				var solved []int64
				solved, dual, err = problem.solve(initial, guard)
				if err == nil {
					var result rankResult
					var primal int64
					result, primal, err = problem.makeResult(solved, guard)
					if err == nil && primal != dual {
						t.Fatal("bad certificate")
					}
					countLevels = result.levelCount
					for _, n := range nodes {
						levels = append(levels, result.nodeToLevel[n])
					}
				}
			}
		}
		if err != nil {
			msg = err.Error()
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "levels": levels, "count": countLevels, "dual": dual, "initialCost": initialCost, "work": guard.Used()})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
