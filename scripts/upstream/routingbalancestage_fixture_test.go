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

func TestExportTypeScriptRoutingbalancestageFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGBALANCESTAGE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 240; trial++ {
		g := layoutgraph.NewGraph()
		for i := 0; i < 4; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), 40, 30)
			n.TopLeft = geo.NewPoint(float64((i%2)*200), float64((i/2)*180))
			if trial%4 == 0 && i == 0 {
				n.SetShape("diamond")
			}
			g.AddNewNodeToContainer(nil, n)
		}
		for i := 0; i < 3; i++ {
			e := g.Connect(g.Nodes[i], g.Nodes[(i+1)%4])
			x := float64(60 + i*24 + trial%7)
			y := float64(40 + i*20)
			e.Points = []*geo.Point{geo.NewPoint(x, 30), geo.NewPoint(x, y), geo.NewPoint(x+65, y), geo.NewPoint(x+65, y+50), geo.NewPoint(x+100, y+50), geo.NewPoint(x+100, 180)}
		}
		limit := uint64(1 + trial*15)
		if trial >= 120 {
			limit = 50000000
		}
		err := balanceEdgeSegmentsWithLimit(context.Background(), g, limit)
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
