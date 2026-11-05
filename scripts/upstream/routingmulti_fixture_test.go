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

func TestExportTypeScriptRoutingmultiFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGMULTI_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 60; trial++ {
		g := layoutgraph.NewGraph()
		a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
		a.TopLeft = geo.NewPoint(0, 0)
		b := g.AddNode(layoutgraph.NewNode(2, 70, 50))
		b.TopLeft = geo.NewPoint(float64(150+trial%3*30), float64(trial%5*50-100))
		edges := []*layoutgraph.Edge{}
		for i := 0; i < 2+trial%2; i++ {
			var e *layoutgraph.Edge
			if trial%4 == 0 && i == 1 {
				e = g.Connect(b, a)
			} else {
				e = g.Connect(a, b)
			}
			if trial%2 == 0 {
				e.TargetArrowhead = "triangle"
			}
			edges = append(edges, e)
		}
		guard, _ := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
		ovg, err := buildOVGFromGraphWithGuard(g, nil, guard)
		if err != nil {
			t.Fatal(err)
		}
		router, err := newOVGEdgeRouterWithWorkLimit(context.Background(), Default, ovg, g, nil, edges, maxRouteSearchWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		outputs := []any{}
		for _, edge := range edges {
			path, cost, err := router.search(context.Background(), edge)
			msg := ""
			var points []*geo.Point
			if err != nil {
				msg = err.Error()
			} else {
				points = []*geo.Point{}
				for _, n := range path {
					points = append(points, n.Point)
				}
				route := &Route{GEdge: edge, OVGNodes: path, FromPort: *path[1].Point, ToPort: *path[len(path)-2].Point}
				if err = router.addRoute(route); err != nil {
					msg = err.Error()
				}
			}
			outputs = append(outputs, map[string]any{"error": msg, "points": points, "cost": cost})
			if msg != "" {
				break
			}
		}
		out = append(out, map[string]any{"trial": trial, "outputs": outputs})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
