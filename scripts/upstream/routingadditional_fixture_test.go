// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
)

func TestExportTypeScriptRoutingadditionalFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGADDITIONAL_FIXTURES")
	if path == "" {
		t.Skip("set TALA_ROUTINGADDITIONAL_FIXTURES")
	}
	out := []any{}
	for trial := 0; trial < 32; trial++ {
		g := layoutgraph.NewGraph()
		a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
		a.TopLeft = geo.NewPoint(0, 0)
		b := g.AddNode(layoutgraph.NewNode(2, 80, 60))
		b.TopLeft = geo.NewPoint(200, 0)
		c := g.AddNode(layoutgraph.NewNode(3, 70, 50))
		c.TopLeft = geo.NewPoint(float64(30+trial%5*35), float64(130+trial%3*25))
		existing := g.Connect(a, b)
		existing.Points = []*geo.Point{geo.NewPoint(80, 30), geo.NewPoint(200, 30)}
		one := g.Connect(a, c)
		one.TargetArrowhead = "triangle"
		selected := []*layoutgraph.Edge{one}
		if trial%2 == 0 {
			two := g.Connect(b, c)
			two.TargetArrowhead = "triangle"
			selected = append(selected, two)
		}
		if trial%4 == 0 {
			c.Label = &layoutgraph.Label{Text: "node", Width: 30, Height: 12}
		}
		g.ComputeCellSize()
		_, err := routeAdditionalEdgesWithLimits(context.Background(), g, selected, defaultOVGBuildLimits())
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		routes := []any{}
		for _, edge := range g.Edges {
			routes = append(routes, edge.Points)
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
