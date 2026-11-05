// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptRoutingsearchFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSEARCH_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 80; trial++ {
		for _, limit := range []uint64{20, 100, 400, 10000} {
			g := layoutgraph.NewGraph()
			a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
			a.TopLeft = geo.NewPoint(0, 0)
			b := g.AddNode(layoutgraph.NewNode(2, 70, 50))
			b.TopLeft = geo.NewPoint(150, 100)
			edge := g.Connect(a, b)
			if trial%2 == 0 {
				edge.TargetArrowhead = "triangle"
			}
			if trial%5 == 0 {
				edge.SourceArrowheadLabel = &layoutgraph.Label{Text: "x", Width: 20, Height: 10}
			}
			ovg := NewOVG(g.Nodes)
			points := []*geo.Point{geo.NewPoint(40, 30), geo.NewPoint(80, 30), geo.NewPoint(115, 30), geo.NewPoint(115, 125), geo.NewPoint(150, 125), geo.NewPoint(40, 60), geo.NewPoint(40, 80), geo.NewPoint(185, 80), geo.NewPoint(185, 100), geo.NewPoint(185, 125)}
			nodes := []*OVGNode{}
			for i, p := range points {
				n := ovg.AddNode(NewOVGNode(p))
				n.Index = i
				nodes = append(nodes, n)
			}
			nodes[0].IsNodeCenter = true
			nodes[9].IsNodeCenter = true
			nodes[1].addPortOwner(a, geo.Right, true)
			nodes[5].addPortOwner(a, geo.Bottom, true)
			nodes[4].addPortOwner(b, geo.Left, true)
			nodes[8].addPortOwner(b, geo.Top, true)
			ovg.Ports[a] = []*OVGNode{nodes[1], nodes[5]}
			ovg.Ports[b] = []*OVGNode{nodes[4], nodes[8]}
			ovg.Centers[a] = nodes[0]
			ovg.Centers[b] = nodes[9]
			pairs := [][2]int{{0, 1}, {1, 2}, {2, 3}, {3, 4}, {4, 9}, {0, 5}, {5, 6}, {6, 7}, {7, 8}, {8, 9}}
			for _, p := range pairs {
				ovg.Connect(nodes[p[0]], nodes[p[1]])
			}
			if trial%3 == 0 {
				nodes[2].IsNearPort = map[*layoutgraph.Node]struct{}{a: {}}
			}
			router, err := newOVGEdgeRouterWithWorkLimit(context.Background(), Default, ovg, g, nil, []*layoutgraph.Edge{edge}, limit)
			msg := ""
			var ids []int
			var cost float64
			var work uint64
			if err == nil {
				var path []*OVGNode
				path, cost, err = router.search(context.Background(), edge)
				work = router.work.used
				if path != nil {
					ids = []int{}
					for _, n := range path {
						ids = append(ids, n.Index)
					}
				}
			}
			if err != nil {
				msg = err.Error()
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "error": msg, "work": work, "ids": ids, "cost": cost})
		}
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
