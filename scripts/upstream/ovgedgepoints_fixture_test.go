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

func TestExportTypeScriptOvgedgepointsFixtures(t *testing.T) {
	path := os.Getenv("TALA_OVGEDGEPOINTS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	names := []string{"Square", "Parallelogram", "Cylinder", "Step", "Diamond", "Oval", "Cloud", "Table"}
	for trial := 0; trial < 240; trial++ {
		for _, limit := range []uint64{10, 50, 100, 5000} {
			g := layoutgraph.NewGraph()
			a := g.AddNode(layoutgraph.NewNode(1, 80.5, 60.25))
			a.SetShape(names[trial%len(names)])
			a.TopLeft = geo.NewPoint(0, 0)
			b := g.AddNode(layoutgraph.NewNode(2, 70.75, 50.5))
			b.SetShape(names[(trial/8)%len(names)])
			b.TopLeft = geo.NewPoint(float64(trial%5-2)*120, float64(trial/5%5-2)*100)
			ovg := NewOVG(g.Nodes)
			setup, _ := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
			if err := ovg.addPorts(g, setup); err != nil {
				t.Fatal(err)
			}
			limits := defaultOVGBuildLimits()
			limits.work = limit
			guard, _ := newOVGBuildGuard(context.Background(), limits)
			perimeter, err := ovg.perimeterPoints(a, b, guard)
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			var halfway []*geo.Point
			if err == nil {
				halfway, err = ovg.halfwayPoints(a, b, guard)
				if err != nil {
					msg = err.Error()
				}
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "shapeA": names[trial%len(names)], "shapeB": names[(trial/8)%len(names)], "perimeter": perimeter, "halfway": halfway, "error": msg, "work": guard.work})
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
