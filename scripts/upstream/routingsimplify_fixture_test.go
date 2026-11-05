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

func TestExportTypeScriptRoutingsimplifyFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSIMPLIFY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 240; trial++ {
		for _, limit := range []uint64{10, 25, 40, 60, 100, 1000} {
			g := layoutgraph.NewGraph()
			a := g.AddNode(layoutgraph.NewNode(1, 20, 20))
			a.TopLeft = geo.NewPoint(-10, -10)
			b := g.AddNode(layoutgraph.NewNode(2, 20, 20))
			b.TopLeft = geo.NewPoint(60, -30)
			obstacle := g.AddNode(layoutgraph.NewNode(3, 10, 10))
			obstacle.TopLeft = geo.NewPoint(float64(20+(trial%9)*10), float64(-5+((trial/9)%6)*10))
			if trial%4 == 0 {
				obstacle.TopLeft = geo.NewPoint(300, 300)
			}
			e := g.Connect(a, b)
			e.Points = []*geo.Point{geo.NewPoint(10, 0), geo.NewPoint(30, 0), geo.NewPoint(30, 40), geo.NewPoint(70, 40), geo.NewPoint(70, -10)}
			if trial%3 == 0 {
				e.Points = append(e.Points[:4], geo.NewPoint(70, 20), geo.NewPoint(90, 20), geo.NewPoint(90, -10))
			}
			if trial%5 == 0 {
				other := g.Connect(a, b)
				other.Points = []*geo.Point{geo.NewPoint(45, -15), geo.NewPoint(45, 15)}
			}
			if trial%2 == 1 {
				for _, n := range g.Nodes {
					n.TopLeft.X, n.TopLeft.Y = n.TopLeft.Y, n.TopLeft.X
					n.Width, n.Height = n.Height, n.Width
				}
				for _, edge := range g.Edges {
					for _, p := range edge.Points {
						p.X, p.Y = p.Y, p.X
					}
				}
			}
			err := simplifyEdgeRoutesWithLimit(context.Background(), g, limit)
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			routes := []any{}
			for _, edge := range g.Edges {
				routes = append(routes, edge.Points)
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "error": msg, "routes": routes})
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
