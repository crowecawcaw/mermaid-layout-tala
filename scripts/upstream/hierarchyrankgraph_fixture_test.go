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

func TestExportTypeScriptHierarchyrankgraphFixtures(t *testing.T) {
	path := os.Getenv("TALA_HIERARCHYRANKGRAPH_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 6; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), 40, 30)
			n.TopLeft = geo.NewPoint(float64(i*100), 0)
			g.AddNewNodeToContainer(nil, n)
			nodes = append(nodes, n)
		}
		for i := 0; i < 5; i++ {
			e := g.Connect(nodes[i], nodes[i+1])
			e.TargetArrowhead = layoutgraph.TriangleArrowhead
			if (trial+i)%4 == 0 {
				e.SetHierarchyRankWeight(2 + i)
			}
		}
		if trial%3 == 0 {
			e := g.Connect(nodes[0], nodes[4])
			e.TargetArrowhead = layoutgraph.TriangleArrowhead
		}
		if trial%7 == 0 {
			g.Edges[0].TargetArrowhead = layoutgraph.NoArrowhead
		}
		if trial%11 == 0 {
			e := g.Connect(nodes[5], nodes[0])
			e.TargetArrowhead = layoutgraph.TriangleArrowhead
		}
		for i, e := range g.Edges {
			e.ID = layoutgraph.EntityID(i + 1)
		}
		guard, _ := limits.NewOptimizationWorkGuard(context.Background(), "RankDAG", 10000000)
		problem, err := newRankProblem(g, guard)
		msg := ""
		levels := []int64{}
		pivot := []int{}
		starts := []int{}
		edges := [][]int64{}
		if err == nil {
			levels, err = problem.longestPathLevels(guard)
			if err == nil {
				pivot = problem.pivotOrder
				starts = problem.outgoingStart
				for _, e := range problem.edges {
					edges = append(edges, []int64{int64(e.from), int64(e.to), e.weight, int64(e.id)})
				}
			}
		}
		if err != nil {
			msg = err.Error()
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "levels": levels, "pivot": pivot, "starts": starts, "edges": edges, "work": guard.Used()})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
