// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptSlingshotgeometryFixtures(t *testing.T) {
	path := os.Getenv("TALA_SLINGSHOTGEOMETRY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 480; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 6; i++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), 30, 40))
			n.TopLeft = geo.NewPoint(float64((trial*7+i*31)%180-80), float64((trial*11+i*23)%180-80))
			nodes = append(nodes, n)
		}
		for i := 1; i < 6; i++ {
			g.Connect(nodes[0], nodes[i])
			if i%2 == 0 {
				g.Connect(nodes[1], nodes[i])
			}
		}
		prev := NewOVGNode(geo.NewPoint(float64((trial*13)%220-110), float64((trial*17)%220-110)))
		next := NewOVGNode(geo.NewPoint(float64((trial*19)%220-110), float64((trial*23)%220-110)))
		if trial%3 == 0 {
			next.X = prev.X
		}
		if trial%5 == 0 {
			next.Y = prev.Y
		}
		orientation := geo.Orientation(trial % 9)
		vertical := trial%2 == 0
		l := trial%3 == 0
		preferred, strong := preferLaunchingVertically(nodes[0], nodes[1], orientation)
		out = append(out, map[string]any{"trial": trial, "expected": map[string]any{"undershot": undershot(prev, nodes[1], orientation, vertical), "overshot": overshot(prev, nodes[1], orientation, vertical, l), "flight": isOnFlightPlan(prev, next, orientation, vertical), "preferred": preferred, "strong": strong}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
