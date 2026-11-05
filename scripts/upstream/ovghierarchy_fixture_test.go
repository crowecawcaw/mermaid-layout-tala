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

func TestExportTypeScriptOvghierarchyFixtures(t *testing.T) {
	path := os.Getenv("TALA_OVGHIERARCHY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	shapes := []string{"Square", "Diamond", "Oval", "Table"}
	for trial := 0; trial < 64; trial++ {
		for _, limit := range []uint64{10, 100, 500, 5000} {
			g := layoutgraph.NewGraph()
			n := g.AddNode(layoutgraph.NewNode(1, 80, 60))
			n.SetShape(shapes[trial%4])
			n.TopLeft = geo.NewPoint(float64(trial%7*20-40), float64(trial%5*20-40))
			h := layoutgraph.NewHierarchy()
			h.Levels()[n] = 0
			n.Hierarchy = h
			g.Directions[nil] = geo.Orientation(4 + trial/4%4)
			limits := defaultOVGBuildLimits()
			limits.work = limit
			guard, _ := newOVGBuildGuard(context.Background(), limits)
			ovg, err := newOVGForHierarchy(g, h, guard)
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			var points []*geo.Point
			if ovg != nil {
				points = []*geo.Point{}
				for _, v := range ovg.Nodes {
					points = append(points, v.Point)
				}
			}
			out = append(out, map[string]any{"trial": trial, "shape": shapes[trial%4], "limit": limit, "error": msg, "work": guard.work, "count": guard.nodes, "candidates": guard.candidates, "points": points, "position": n.TopLeft, "width": n.Width, "height": n.Height})
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
