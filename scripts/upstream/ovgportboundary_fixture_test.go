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

func TestExportTypeScriptOvgportboundaryFixtures(t *testing.T) {
	path := os.Getenv("TALA_OVGPORTBOUNDARY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	names := []string{"Square", "Parallelogram", "Cylinder", "Step", "Diamond", "Oval", "Cloud", "Table"}
	for trial := 0; trial < 120; trial++ {
		for _, limit := range []uint64{20, 100, 500, 5000} {
			g := layoutgraph.NewGraph()
			a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
			a.SetShape(names[trial%len(names)])
			a.TopLeft = geo.NewPoint(0, 0)
			b := g.AddNode(layoutgraph.NewNode(2, 30, 40))
			b.TopLeft = geo.NewPoint(float64((trial*7)%200-70), float64((trial*11)%160-50))
			ovg := NewOVG([]*layoutgraph.Node{a})
			setup, _ := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
			if err := ovg.addPorts(g, setup); err != nil {
				t.Fatal(err)
			}
			ovg.NodesInsideBoundingBox = g.Nodes
			limits := defaultOVGBuildLimits()
			limits.work = limit
			guard, _ := newOVGBuildGuard(context.Background(), limits)
			err := ovg.addPortConnectionNodesAtBoundaries(g, geo.NewPoint(-40, -30), geo.NewPoint(120, 100), guard)
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			points := []*geo.Point{}
			for _, n := range ovg.Nodes {
				points = append(points, n.Point)
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "shape": names[trial%len(names)], "error": msg, "work": guard.work, "count": guard.nodes, "points": points})
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
