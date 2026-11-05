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

func TestExportTypeScriptHierarchyassignFixtures(t *testing.T) {
	path := os.Getenv("TALA_HIERARCHYASSIGN_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		g.IsRootHierarchy = trial%2 == 0
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 6; i++ {
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
		for i, p := range pairs {
			e := g.Connect(nodes[p[0]], nodes[p[1]])
			if (trial+i)%4 != 0 {
				e.TargetArrowhead = layoutgraph.TriangleArrowhead
			}
			if (trial+i)%9 == 0 {
				e.SourceArrowhead = layoutgraph.TriangleArrowhead
			}
		}
		nodes[0].AddNear(nodes[5])
		if trial%7 == 0 {
			nodes[2].FixedTopLeft = nodes[2].TopLeft.Copy()
		}
		err := Assign(context.Background(), g, nil, Candidates(g))
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		levels := []int{}
		counts := []int{}
		nears := [][]int{}
		for _, n := range nodes {
			if n.Hierarchy == nil {
				levels = append(levels, -1)
				counts = append(counts, 0)
			} else {
				levels = append(levels, n.Hierarchy.Levels()[n])
				counts = append(counts, n.Hierarchy.LevelCount)
			}
			ns := []int{}
			for _, other := range nodes {
				if _, ok := n.Nears[other]; ok {
					ns = append(ns, int(other.ID))
				}
			}
			nears = append(nears, ns)
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "levels": levels, "counts": counts, "nears": nears})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
