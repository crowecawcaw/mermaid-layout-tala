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

func TestExportTypeScriptRoutingstandaloneFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSTANDALONE_FIXTURES")
	if path == "" {
		t.Skip("set TALA_ROUTINGSTANDALONE_FIXTURES")
	}
	out := []any{}
	for trial := 0; trial < 76; trial++ {
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
		if trial%3 == 0 {
			one.Label = &layoutgraph.Label{Text: "edge", Width: 24, Height: 12}
		}
		if trial%5 == 0 {
			one.SourceArrowheadLabel = &layoutgraph.Label{Text: "start", Width: 20, Height: 10}
		}
		selected := []*layoutgraph.Edge{one}
		if trial%2 == 0 {
			two := g.Connect(b, c)
			two.TargetArrowhead = "triangle"
			if trial%8 == 0 {
				b.SetShape("Table")
				b.SetNumColumns(3)
				column := 1
				two.FromTableColumnIndex = &column
			}
			selected = append(selected, two)
		}
		if trial >= 32 && trial < 48 {
			loop := g.Connect(c, c)
			loop.TargetArrowhead = "triangle"
			selected = append(selected, loop)
		}
		if trial >= 48 && trial < 64 {
			parallel := g.Connect(a, c)
			parallel.TargetArrowhead = "triangle"
			selected = append(selected, parallel)
			if trial >= 56 {
				another := g.Connect(a, c)
				another.TargetArrowhead = "triangle"
				selected = append(selected, another)
			}
		}
		if trial%4 == 0 {
			c.Label = &layoutgraph.Label{Text: "node", Width: 30, Height: 12}
		}
		g.ComputeCellSize()
		budget := maxRouteStageWorkUnits
		if trial >= 64 {
			budget = []uint64{0, 1, 10, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800}[trial-64]
		}
		err := routeEdgesWithBudgets(context.Background(), g, selected, defaultOVGBuildLimits(), budget)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		routes := []any{}
		labels := []any{}
		for _, edge := range g.Edges {
			routes = append(routes, edge.Points)
			if edge.Label == nil {
				labels = append(labels, nil)
			} else {
				labels = append(labels, map[string]any{"position": int(edge.Label.Position), "percentage": edge.LabelPercentage})
			}
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "routes": routes, "labels": labels, "budget": budget})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
