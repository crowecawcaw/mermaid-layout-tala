// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package packing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptPackingstageroutedFixtures(t *testing.T) {
	path := os.Getenv("TALA_PACKINGSTAGEROUTED_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 5; i++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(40+i*5), float64(30+i%3*10)))
			n.TopLeft = geo.NewPoint(float64(i*160+trial%11*4), float64((i*97+trial*13)%400))
			nodes = append(nodes, n)
		}
		g.Containers[nil] = nodes
		if trial%2 == 0 {
			g.Connect(nodes[0], nodes[1])
		}
		if trial%3 == 0 {
			g.Connect(nodes[2], nodes[3])
		}
		if trial%5 == 0 {
			nodes[0].FixedTopLeft = nodes[0].TopLeft.Copy()
		}
		for _, edge := range g.Edges {
			a, b := edge.From.Center(), edge.To.Center()
			edge.Points = []*geo.Point{a, geo.NewPoint(a.X, b.Y), b}
		}
		guard, _ := newWorkGuard(context.Background(), 10000000)
		err := packAtomic(context.Background(), g, nil, guard)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		points := []*geo.Point{}
		for _, n := range nodes {
			points = append(points, n.TopLeft.Copy())
		}
		routes := [][]*geo.Point{}
		for _, edge := range g.Edges {
			route := []*geo.Point{}
			for _, p := range edge.Points {
				route = append(route, p.Copy())
			}
			routes = append(routes, route)
		}
		out = append(out, map[string]any{"trial": trial, "points": points, "error": msg, "work": guard.Used(), "routes": routes})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
