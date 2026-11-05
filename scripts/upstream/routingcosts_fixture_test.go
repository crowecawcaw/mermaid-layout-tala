// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/labeling"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"math"
	"os"
	"testing"
)

func TestExportTypeScriptRoutingcostsFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGCOSTS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 240; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 4; i++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), 30, 30))
			n.TopLeft = geo.NewPoint(float64((trial*7+i*31)%110), float64((trial*11+i*23)%100))
			if (i+trial)%4 == 0 {
				n.FixedTopLeft = n.TopLeft.Copy()
			}
			nodes = append(nodes, n)
		}
		e := g.Connect(nodes[0], nodes[1])
		other := g.Connect(nodes[2], nodes[3])
		other.Points = []*geo.Point{geo.NewPoint(10, 10), geo.NewPoint(100, 10), geo.NewPoint(100, 80)}
		positioned := labeling.PositionedArrowheadLabel{Box: *geo.NewBox(geo.NewPoint(float64(trial%8*10), float64(trial%7*10)), 20, 15), Edge: e, Text: "x"}
		labels := []labeling.PositionedArrowheadLabel{}
		if trial%4 == 0 {
			labels = append(labels, labeling.PositionedArrowheadLabel{Box: *geo.NewBox(geo.NewPoint(30, 30), 20, 20), Edge: other, Text: "y"})
		}
		route := &Route{GEdge: other, OVGNodes: []*OVGNode{NewOVGNode(geo.NewPoint(20, 20)), NewOVGNode(geo.NewPoint(20, 100))}}
		guard, _ := newRouteSearchWorkGuard(context.Background(), Default, 10000)
		cost, err := positionedArrowheadLabelCostGuarded(positioned, nodes, labels, []*Route{route}, []*layoutgraph.Edge{other}, guard)
		if err != nil {
			t.Fatal(err)
		}
		if math.IsInf(cost, 1) {
			cost = -1
		}
		guard2, _ := newRouteSearchWorkGuard(context.Background(), Default, 10000)
		overlap, err := fixedOverlapsForRoute(nodes, guard2)
		if err != nil {
			t.Fatal(err)
		}
		flags := []bool{}
		for _, n := range nodes {
			_, ok := overlap[n]
			flags = append(flags, ok)
		}
		out = append(out, map[string]any{"trial": trial, "cost": cost, "work": guard.used, "overlap": flags, "overlapWork": guard2.used})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
