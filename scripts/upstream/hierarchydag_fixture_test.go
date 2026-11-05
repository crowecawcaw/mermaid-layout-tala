// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package hierarchy

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptHierarchydagFixtures(t *testing.T) {
	path := os.Getenv("TALA_HIERARCHYDAG_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 5; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), 40, 30)
			n.TopLeft = geo.NewPoint(float64(i*100), 0)
			g.AddNewNodeToContainer(nil, n)
			nodes = append(nodes, n)
		}
		pairs := [][2]int{{0, 1}, {1, 2}, {2, 3}, {3, 4}, {0, 3}}
		if trial%3 == 0 {
			pairs = append(pairs, [2]int{4, 0})
		}
		if trial%4 == 0 {
			pairs = append(pairs, [2]int{0, 1})
		}
		if trial%5 == 0 {
			pairs = append(pairs, [2]int{2, 2})
		}
		for i, p := range pairs {
			e := g.Connect(nodes[p[0]], nodes[p[1]])
			if (trial+i)%4 != 0 {
				e.TargetArrowhead = layoutgraph.TriangleArrowhead
			}
			if (trial+i)%9 == 0 {
				e.SourceArrowhead = layoutgraph.TriangleArrowhead
			}
		}
		dag, err := makeSimpleDAG(context.Background(), g)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		arcs := [][]int{}
		levels := []int{}
		count := 0
		if err == nil {
			for _, e := range dag.Edges {
				arcs = append(arcs, []int{int(e.ID), int(e.From.ID), int(e.To.ID), e.HierarchyRankWeight()})
			}
			var r rankResult
			r, err = rankDAG(context.Background(), dag)
			if err == nil {
				count = r.levelCount
				for _, n := range dag.Nodes {
					levels = append(levels, r.nodeToLevel[n])
				}
			} else {
				msg = err.Error()
			}
		}
		out = append(out, map[string]any{"trial": trial, "arcs": arcs, "levels": levels, "count": count, "error": msg})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
