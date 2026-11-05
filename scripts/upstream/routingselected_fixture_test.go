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

func TestExportTypeScriptRoutingselectedFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSELECTED_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		for _, limit := range []uint64{5, 20, 50, 100, 1000} {
			g := layoutgraph.NewGraph()
			a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
			a.TopLeft = geo.NewPoint(0, 0)
			b := g.AddNode(layoutgraph.NewNode(2, 80, 60))
			b.TopLeft = geo.NewPoint(200, 0)
			edges := []*layoutgraph.Edge{}
			for i := 0; i < 3; i++ {
				e := g.Connect(a, b)
				e.Points = []*geo.Point{geo.NewPoint(-1, -1), geo.NewPoint(-2, -2)}
				edges = append(edges, e)
			}
			routes := []*Route{}
			for i := 0; i < 3; i++ {
				y := float64(10 + (2-i)*20)
				points := []*OVGNode{NewOVGNode(geo.NewPoint(40, 30)), NewOVGNode(geo.NewPoint(80, y)), NewOVGNode(geo.NewPoint(130, y)), NewOVGNode(geo.NewPoint(200, y)), NewOVGNode(geo.NewPoint(240, 30))}
				routes = append(routes, &Route{GEdge: edges[i], OVGNodes: points, FromPort: *points[1].Point, ToPort: *points[3].Point})
			}
			guard, _ := newRouteSearchWorkGuard(context.Background(), Default, limit)
			err := finalizeSelectedRoutes(context.Background(), g, routes, nil, guard, trial%2 == 0)
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			paths := []any{}
			for _, edge := range edges {
				paths = append(paths, edge.Points)
			}
			ids := []int{}
			for _, r := range routes {
				for i, e := range edges {
					if e == r.GEdge {
						ids = append(ids, i)
					}
				}
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "error": msg, "work": guard.used, "paths": paths, "routeEdges": ids})
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
