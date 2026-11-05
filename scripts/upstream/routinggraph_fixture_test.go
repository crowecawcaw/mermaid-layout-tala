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

func TestExportTypeScriptRoutinggraphFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGGRAPH_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 60; trial++ {
		for _, limit := range []uint64{20, 100, 1000, 20000, 660000000} {
			g := layoutgraph.NewGraph()
			a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
			a.TopLeft = geo.NewPoint(0, 0)
			b := g.AddNode(layoutgraph.NewNode(2, 70, 50))
			b.TopLeft = geo.NewPoint(float64(150+trial%3*30), float64(trial%5*50-100))
			c := g.AddNode(layoutgraph.NewNode(3, 30, 30))
			c.TopLeft = geo.NewPoint(float64(100+trial%4*30), 200)
			_ = c
			for i := 0; i < 1+trial%3; i++ {
				e := g.Connect(a, b)
				if trial%2 == 0 {
					e.TargetArrowhead = "triangle"
				}
				if trial%4 == 0 {
					e.Points = []*geo.Point{geo.NewPoint(80, float64(10+i*15)), geo.NewPoint(150, float64(10+i*15))}
				}
			}
			options := GraphRouteOptions{ForceReroute: trial%8 == 0, RoutesPreviouslyCompleted: trial%4 == 0}
			complete, err := RouteGraphWithWorkLimit(context.Background(), g, options, limit)
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			routes := []any{}
			for _, e := range g.Edges {
				routes = append(routes, e.Points)
			}
			owners := []bool{}
			for _, n := range g.Nodes {
				owners = append(owners, n.Graph == g)
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "error": msg, "complete": complete, "routes": routes, "owners": owners})
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
