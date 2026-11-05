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

func TestExportTypeScriptRouteinventoryFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTEINVENTORY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		a := g.AddNode(layoutgraph.NewNode(1, 20, 20))
		a.TopLeft = geo.NewPoint(0, 0)
		b := g.AddNode(layoutgraph.NewNode(2, 20, 20))
		b.TopLeft = geo.NewPoint(100, 0)
		ovg := NewOVG(g.Nodes)
		nodes := []*OVGNode{}
		for i := 0; i < 12; i++ {
			n := ovg.AddNode(NewOVGNode(geo.NewPoint(float64(i%6)*20, float64(i/6)*4)))
			n.Index = i
			nodes = append(nodes, n)
		}
		for i := 0; i < 12; i++ {
			if i%6 != 5 {
				ovg.Connect(nodes[i], nodes[i+1])
			}
			if i < 6 {
				ovg.Connect(nodes[i], nodes[i+6])
			}
		}
		guard, _ := newRouteSearchWorkGuard(context.Background(), Default, 100000)
		router := &ovgEdgeRouter{ovg: ovg, work: guard, edgeSet: newOvgEdgeSet(), pointToRoute: map[geo.Point][]*Route{}, hasNearbyEdge: map[*OVGEdge]struct{}{}, overlappingRoutes: map[*OVGEdge][]*Route{}}
		routes := []*Route{}
		for j := 0; j < 2; j++ {
			e := g.Connect(a, b)
			e.IsInvisible = (trial+j)%5 == 0
			start := (trial + j) % 2
			route := &Route{GEdge: e, OVGNodes: []*OVGNode{nodes[start*6], nodes[start*6+1], nodes[start*6+2], nodes[start*6+3], nodes[start*6+4]}}
			if err := router.addRoute(route); err != nil {
				t.Fatal(err)
			}
			routes = append(routes, route)
		}
		found, err := router.findOverlappingRoutes(nodes[1], nodes[3])
		if err != nil {
			t.Fatal(err)
		}
		ids := []int{}
		for _, r := range found {
			for i, item := range routes {
				if r == item {
					ids = append(ids, i)
				}
			}
		}
		flags := []any{}
		for _, e := range ovg.Edges {
			_, near := router.hasNearbyEdge[e]
			flags = append(flags, map[string]any{"near": near, "overlaps": len(router.overlappingRoutes[e])})
		}
		out = append(out, map[string]any{"trial": trial, "found": ids, "flags": flags, "work": guard.used})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
