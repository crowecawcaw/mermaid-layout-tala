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

func TestExportTypeScriptRoutingcoordinatorFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGCOORDINATOR_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 100; trial++ {
		g := layoutgraph.NewGraph()
		a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
		a.TopLeft = geo.NewPoint(0, 0)
		b := g.AddNode(layoutgraph.NewNode(2, 70, 50))
		b.TopLeft = geo.NewPoint(float64(150+trial%3*30), float64(trial%5*50-100))
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
		}
		guard, _ := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
		_, err := routeEdgesWithResourceGuards(context.Background(), g, nil, guard, maxRouteSearchWorkUnits)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		routes := []any{}
		for _, e := range g.Edges {
			routes = append(routes, e.Points)
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "routes": routes})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
