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

func TestExportTypeScriptOvgboundaryFixtures(t *testing.T) {
	path := os.Getenv("TALA_OVGBOUNDARY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		for _, limit := range []uint64{10, 40, 100, 1000} {
			g := layoutgraph.NewGraph()
			for i := 0; i < 3; i++ {
				n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(20+i*10), float64(30+i*5)))
				n.TopLeft = geo.NewPoint(float64((trial*7+i*43)%180-40), float64((trial*11+i*29)%160-30))
			}
			ovg := NewOVG(g.Nodes)
			for _, p := range []*geo.Point{geo.NewPoint(0, 0), geo.NewPoint(50, 0), geo.NewPoint(100, 0), geo.NewPoint(0, 50), geo.NewPoint(100, 50), geo.NewPoint(0, 100), geo.NewPoint(50, 100), geo.NewPoint(100, 100)} {
				ovg.AddNode(NewOVGNode(p))
			}
			limits := defaultOVGBuildLimits()
			limits.work = limit
			guard, _ := newOVGBuildGuard(context.Background(), limits)
			tl, br := geo.NewPoint(0, 0), geo.NewPoint(100, 100)
			err := ovg.addNewBoundaryLayers(g, tl, br, guard)
			if err == nil {
				err = ovg.addCornerNodes(g, tl, br, guard)
			}
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			points := []*geo.Point{}
			for _, n := range ovg.Nodes {
				points = append(points, n.Point)
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "error": msg, "work": guard.work, "count": guard.nodes, "points": points})
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
