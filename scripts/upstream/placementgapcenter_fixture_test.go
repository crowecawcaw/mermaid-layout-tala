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

func TestExportTypeScriptPlacementgapcenterFixtures(t *testing.T) {
	path := os.Getenv("TALA_PLACEMENTGAPCENTER_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = 50
		nodes := []*layoutgraph.Node{}
		positions := []*geo.Point{geo.NewPoint(0, 0), geo.NewPoint(float64(100+trial%7*15), 0), geo.NewPoint(float64(300+trial%5*20), 0), geo.NewPoint(float64(100+trial%7*15), 150)}
		for i, p := range positions {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), 40, 30))
			n.TopLeft = p
			nodes = append(nodes, n)
		}
		g.Containers[nil] = nodes
		g.Connect(nodes[0], nodes[1])
		g.Connect(nodes[1], nodes[2])
		if trial%2 == 0 {
			g.Connect(nodes[1], nodes[3])
		}
		if trial%7 == 0 {
			nodes[1].FixedTopLeft = nodes[1].TopLeft.Copy()
		}
		if trial%3 == 0 {
			for _, n := range nodes {
				n.TopLeft.X, n.TopLeft.Y = n.TopLeft.Y, n.TopLeft.X
				n.Width, n.Height = n.Height, n.Width
			}
		}
		changed, err := Equidistance(context.Background(), g)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		points := []*geo.Point{}
		for _, n := range nodes {
			points = append(points, n.TopLeft.Copy())
		}
		out = append(out, map[string]any{"trial": trial, "changed": changed, "error": msg, "points": points})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
