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

func TestExportTypeScriptRoutinglineFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGLINE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 240; trial++ {
		for _, limit := range []uint64{20, 100, 1000, 100000} {
			g := layoutgraph.NewGraph()
			a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
			a.TopLeft = geo.NewPoint(0, 0)
			b := g.AddNode(layoutgraph.NewNode(2, 70, 50))
			b.TopLeft = geo.NewPoint(float64((trial%5-2)*100), float64((trial/5%5-2)*100))
			c := g.AddNode(layoutgraph.NewNode(3, 30, 30))
			c.TopLeft = geo.NewPoint(float64((trial*7)%240-100), float64((trial*11)%220-100))
			e := g.Connect(a, b)
			e.SourceArrowhead = "triangle"
			if trial%9 == 0 {
				e.TargetArrowheadLabel = &layoutgraph.Label{Text: "label", Width: 20, Height: 10}
			}
			if trial%3 == 0 {
				other := g.Connect(a, c)
				other.SourceArrowhead = "triangle"
				other.Points = []*geo.Point{geo.NewPoint(80, 30), geo.NewPoint(120, 30), geo.NewPoint(120, 90)}
			}
			guard, _ := newRouteSearchWorkGuard(context.Background(), Default, limit)
			from, to, cost, err := routeLineChecked(g, e, g.Edges, nil, guard.step, guard)
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "error": msg, "work": guard.used, "from": from, "to": to, "cost": cost})
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
