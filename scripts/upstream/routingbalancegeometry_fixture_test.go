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

func TestExportTypeScriptRoutingbalancegeometryFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGBALANCEGEOMETRY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 4; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), 40, 30)
			n.TopLeft = geo.NewPoint(float64(i*100), float64(i%2*100))
			g.AddNewNodeToContainer(nil, n)
			nodes = append(nodes, n)
		}
		for i := 0; i < 2; i++ {
			e := g.Connect(nodes[i], nodes[i+2])
			e.Points = []*geo.Point{geo.NewPoint(float64(i*20), 0), geo.NewPoint(float64(i*20), 100)}
		}
		guard, _ := newRouteWorkGuard(context.Background(), "BalanceEdgeSegments", 100000)
		segments, err := edgeSegmentsGuarded(g.Edges, false, guard)
		if err != nil {
			t.Fatal(err)
		}
		locked, err := nodeSegmentsGuarded(nodes, false, guard)
		if err != nil {
			t.Fatal(err)
		}
		floor, ceil, err := routeSegmentBounds(segments[0].Segment, locked, 10, guard)
		if err != nil {
			t.Fatal(err)
		}
		values, err := evenlyDistributeGuarded(0, 100, trial%6, guard)
		if err != nil {
			t.Fatal(err)
		}
		proposed := []float64{float64(trial % 6 * 10)}
		batch := []*layoutgraph.EdgeSegment{segments[0]}
		status, err := checkBalanceOrder(batch, map[*layoutgraph.EdgeSegment]bool{segments[0]: true}, segments, proposed, true, guard)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, map[string]any{"trial": trial, "floor": floor, "ceil": ceil, "values": values, "status": status, "work": guard.used})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
