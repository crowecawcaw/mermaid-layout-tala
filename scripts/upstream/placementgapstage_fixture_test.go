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

func TestExportTypeScriptPlacementgapstageFixtures(t *testing.T) {
	path := os.Getenv("TALA_PLACEMENTGAPSTAGE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		for _, horizontal := range []bool{true, false} {
			for _, forward := range []bool{true, false} {
				g := layoutgraph.NewGraph()
				g.CellSize = 50
				nodes := []*layoutgraph.Node{}
				positions := []*geo.Point{geo.NewPoint(0, 0), geo.NewPoint(float64(220+trial%7*25), 0), geo.NewPoint(float64(-260-trial%5*20), 0), geo.NewPoint(0, 200)}
				for i, p := range positions {
					n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), 40, 30))
					n.TopLeft = p
					if !horizontal {
						n.TopLeft.X, n.TopLeft.Y = n.TopLeft.Y, n.TopLeft.X
						n.Width, n.Height = n.Height, n.Width
					}
					nodes = append(nodes, n)
				}
				g.Containers[nil] = nodes
				g.Connect(nodes[0], nodes[1])
				g.Connect(nodes[0], nodes[2])
				if trial%2 == 0 {
					g.Connect(nodes[0], nodes[3])
				}
				if trial%9 == 0 {
					nodes[1].FixedTopLeft = nodes[1].TopLeft.Copy()
				}
				changed, err := NormalizeGaps(context.Background(), g)
				length := float64(0)
				msg := ""
				if err != nil {
					msg = err.Error()
				}
				points := []*geo.Point{}
				for _, n := range nodes {
					points = append(points, n.TopLeft.Copy())
				}
				out = append(out, map[string]any{"trial": trial, "horizontal": horizontal, "forward": forward, "changed": changed, "length": length, "error": msg, "points": points})
			}
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
