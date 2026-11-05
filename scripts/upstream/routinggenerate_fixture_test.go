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

func TestExportTypeScriptRoutinggenerateFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGGENERATE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	flavors := []RouteGenerationFlavor{Default, ShortestToLongest, LongestToShortest, TopDownLeftRight}
	for trial := 0; trial < 48; trial++ {
		for _, flavor := range flavors {
			g := layoutgraph.NewGraph()
			a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
			a.TopLeft = geo.NewPoint(0, 0)
			b := g.AddNode(layoutgraph.NewNode(2, 70, 50))
			b.TopLeft = geo.NewPoint(float64(150+trial%3*30), float64(trial%5*50-100))
			edges := []*layoutgraph.Edge{}
			ids := map[*layoutgraph.Edge]int{}
			for i := 0; i < 1+trial%3; i++ {
				var e *layoutgraph.Edge
				if trial%4 == 0 && i == 1 {
					e = g.Connect(b, a)
				} else {
					e = g.Connect(a, b)
				}
				if trial%2 == 0 {
					e.TargetArrowhead = "triangle"
				}
				if trial%7 == 0 && i == 0 {
					e.TargetArrowheadLabel = &layoutgraph.Label{Text: "label", Width: 20, Height: 10}
				}
				ids[e] = i
				edges = append(edges, e)
			}
			guard, _ := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
			ovg, err := buildOVGFromGraphWithGuard(g, nil, guard)
			if err != nil {
				t.Fatal(err)
			}
			router, err := newOVGEdgeRouterWithWorkLimit(context.Background(), flavor, ovg, g, nil, edges, maxRouteSearchWorkUnits)
			if err != nil {
				t.Fatal(err)
			}
			result := router.generateRoutes(context.Background(), true)
			msg := ""
			if result.Err != nil {
				msg = result.Err.Error()
			}
			var routes []any
			if result.Routes != nil {
				routes = []any{}
				for _, route := range result.Routes {
					points := []*geo.Point{}
					for _, n := range route.OVGNodes {
						points = append(points, n.Point)
					}
					routes = append(routes, map[string]any{"edge": ids[route.GEdge], "points": points})
				}
			}
			out = append(out, map[string]any{"trial": trial, "flavor": flavor, "error": msg, "distance": result.Distance, "routes": routes})
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
