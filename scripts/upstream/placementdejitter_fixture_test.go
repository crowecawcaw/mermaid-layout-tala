// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placement

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptPlacementdejitterFixtures(t *testing.T) {
	path := os.Getenv("TALA_PLACEMENTDEJITTER_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 160; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = 50
		offset := float64(5 + trial%10*10)
		a := g.AddNode(layoutgraph.NewNode(1, 40, 30))
		b := g.AddNode(layoutgraph.NewNode(2, 40, 30))
		a.TopLeft = geo.NewPoint(0, 0)
		b.TopLeft = geo.NewPoint(offset, 200)
		nodes := []*layoutgraph.Node{a, b}
		edge := g.Connect(a, b)
		edge.Points = []*geo.Point{geo.NewPoint(20, 30), geo.NewPoint(20, 80), geo.NewPoint(20+offset, 80), geo.NewPoint(20+offset, 200)}
		if trial%4 == 0 {
			a.FixedTopLeft = a.TopLeft.Copy()
		}
		if trial%5 == 0 {
			b.FixedTopLeft = b.TopLeft.Copy()
		}
		if trial%3 == 0 {
			n := g.AddNode(layoutgraph.NewNode(3, 20, 20))
			n.TopLeft = geo.NewPoint(25+offset/2, 90)
			nodes = append(nodes, n)
		}
		if trial%2 == 0 {
			for _, n := range nodes {
				n.TopLeft.X, n.TopLeft.Y = n.TopLeft.Y, n.TopLeft.X
				n.Width, n.Height = n.Height, n.Width
			}
			for _, p := range edge.Points {
				p.X, p.Y = p.Y, p.X
			}
		}
		g.Containers[nil] = nodes
		changed, err := Dejitter(context.Background(), g)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		points := []*geo.Point{}
		for _, n := range nodes {
			points = append(points, n.TopLeft.Copy())
		}
		out = append(out, map[string]any{"trial": trial, "changed": changed, "error": msg, "nodes": points, "route": edge.Points})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
