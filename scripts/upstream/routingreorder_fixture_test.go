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

func TestExportTypeScriptRoutingreorderFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGREORDER_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		a := layoutgraph.NewNode(1, 40, 40)
		a.TopLeft = geo.NewPoint(0, 0)
		b := layoutgraph.NewNode(2, 40, 40)
		b.TopLeft = geo.NewPoint(300, 0)
		g.AddNewNodeToContainer(nil, a)
		g.AddNewNodeToContainer(nil, b)
		for i := 0; i < 3; i++ {
			e := g.Connect(a, b)
			e.Points = []*geo.Point{geo.NewPoint(40, float64(10+i*10)), geo.NewPoint(300, float64(10+i*10))}
			if i == 1 {
				e.Label = &layoutgraph.Label{Text: "label", Width: 40, Height: 20}
			}
			if trial%3 == 0 && i == 2 {
				e.From, e.To = e.To, e.From
				e.Points[0], e.Points[1] = e.Points[1], e.Points[0]
			}
			if trial%5 == 0 && i == 0 {
				e.Label = &layoutgraph.Label{Text: "other", Width: 40, Height: 20}
			}
			if trial%7 == 0 && i == 2 {
				e.Label = &layoutgraph.Label{Text: "other", Width: 40, Height: 20}
			}
		}
		err := ReorderDuplicates(context.Background(), g)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		routes := [][]*geo.Point{}
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
