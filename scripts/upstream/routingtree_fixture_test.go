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

func TestExportTypeScriptRoutingtreeFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGTREE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	shapes := []string{"Square", "Diamond", "Oval", "Hexagon"}
	for trial := 0; trial < 240; trial++ {
		for _, limit := range []uint64{5, 15, 50, 5000} {
			g := layoutgraph.NewGraph()
			a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
			a.TopLeft = geo.NewPoint(10, 20)
			a.SetShape(shapes[trial%4])
			b := g.AddNode(layoutgraph.NewNode(2, 60, 50))
			b.SetShape(shapes[trial/4%4])
			orientation := geo.Orientation(4 + trial%4)
			switch orientation {
			case geo.Top:
				b.TopLeft = geo.NewPoint(float64(18+trial%17), -150)
			case geo.Bottom:
				b.TopLeft = geo.NewPoint(float64(18+trial%17), 200)
			case geo.Left:
				b.TopLeft = geo.NewPoint(-150, float64(20+trial%11))
			case geo.Right:
				b.TopLeft = geo.NewPoint(200, float64(20+trial%11))
			}
			var e *layoutgraph.Edge
			if trial%2 == 0 {
				e = g.Connect(a, b)
			} else {
				e = g.Connect(b, a)
			}
			tree := &layoutgraph.Tree{Node: b, SentinelEdge: e, Orientation: orientation}
			g.NodeToTree = map[*layoutgraph.Node]*layoutgraph.Tree{b: tree}
			ovg := NewOVG(g.Nodes)
			setup, _ := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
			if err := ovg.addPorts(g, setup); err != nil {
				t.Fatal(err)
			}
			limits := defaultOVGBuildLimits()
			limits.work = limit
			guard, _ := newOVGBuildGuard(context.Background(), limits)
			err := ovg.addTreeNodes(g, guard)
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			points := []*geo.Point{}
			for _, n := range ovg.Nodes {
				points = append(points, n.Point)
			}
			ports := []*geo.Point{}
			for _, p := range ovg.Ports[b] {
				ports = append(ports, p.Point)
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "shapeA": shapes[trial%4], "shapeB": shapes[trial/4%4], "error": msg, "work": guard.work, "count": guard.nodes, "points": points, "ports": ports})
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
