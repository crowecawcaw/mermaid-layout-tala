// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptRoutinggeometryFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGGEOMETRY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 600; trial++ {
		pts := make([]*geo.Point, 8)
		for j := range pts {
			pts[j] = geo.NewPoint(float64((trial*17+j*43+j*trial*3)%81-40), float64((trial*29+j*11+j*trial*7)%79-39))
			if trial%5 == 0 {
				pts[j].X = float64((j % 3) * 10)
			}
			if trial%7 == 0 {
				pts[j].Y = float64((j % 3) * 10)
			}
		}
		box := geo.NewBox(geo.NewPoint(float64(trial%31-15), float64(trial%27-13)), float64(trial%17-4), float64(trial%19-4))
		a := layoutgraph.NewNode(1, float64(5+trial%31), float64(5+trial%29))
		a.TopLeft = pts[0]
		b := layoutgraph.NewNode(2, float64(5+trial%23), float64(5+trial%37))
		b.TopLeft = pts[1]
		axes := []any{}
		for _, axis := range idealTurnAxes(a, b) {
			axes = append(axes, map[string]any{"isX": axis.isX, "val": axis.val})
		}
		e := &layoutgraph.Edge{Points: pts[:4]}
		other := &layoutgraph.Edge{Points: pts[4:]}
		out = append(out, map[string]any{"trial": trial, "points": pts, "box": box, "aWidth": a.Width, "aHeight": a.Height, "bWidth": b.Width, "bHeight": b.Height, "expected": map[string]any{"box": segmentIntersectsBox(pts[0], pts[1], box), "orientation": orientation(pts[0], pts[1], pts[2]), "intersection": intersects(pts[0], pts[1], pts[2], pts[3]), "nonparallel": nonParallelIntersection(pts[0], pts[1], pts[2], pts[3]), "axes": axes, "crossings": countNonSharedCrossings(e, other), "cost": estimateRouteCost(layoutgraph.Edges{e, other}, e)}})
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
