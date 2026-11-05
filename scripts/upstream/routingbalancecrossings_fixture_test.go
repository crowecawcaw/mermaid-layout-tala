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

func TestExportTypeScriptRoutingbalancecrossingsFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGBALANCECROSSINGS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		addRoute := func(coords ...float64) *layoutgraph.Edge {
			n := layoutgraph.NewNode(layoutgraph.EntityID(len(g.Nodes)+1), 10, 10)
			n.TopLeft = geo.NewPoint(1000, float64(len(g.Nodes)*20))
			g.AddNewNodeToContainer(nil, n)
			m := layoutgraph.NewNode(layoutgraph.EntityID(len(g.Nodes)+1), 10, 10)
			m.TopLeft = geo.NewPoint(1100, n.TopLeft.Y)
			g.AddNewNodeToContainer(nil, m)
			e := g.Connect(n, m)
			for i := 0; i < len(coords); i += 2 {
				e.Points = append(e.Points, geo.NewPoint(coords[i], coords[i+1]))
			}
			return e
		}
		moving := addRoute(10, 0, 10, 20)
		addRoute(0, 5, 20, 5)
		if trial%3 == 1 {
			addRoute(20, 15, 40, 15)
		}
		if trial%3 == 2 {
			addRoute(0, 15, 20, 15)
		}
		segment := layoutgraph.NewEdgeSegment(moving.Points[0], moving.Points[1], moving)
		guard, _ := newRouteWorkGuard(context.Background(), "balance", 10000)
		accepted, err := balanceReversalRemovesCrossings(g, []*layoutgraph.EdgeSegment{segment}, []float64{float64(trial % 5 * 10)}, true, guard)
		if err != nil {
			t.Fatal(err)
		}
		overlap := balanceCollinearOverlap(geo.NewPoint(0, 0), geo.NewPoint(0, 20), geo.NewPoint(0, float64(trial%25)), geo.NewPoint(0, 30))
		out = append(out, map[string]any{"trial": trial, "accepted": accepted, "work": guard.used, "overlap": overlap})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
