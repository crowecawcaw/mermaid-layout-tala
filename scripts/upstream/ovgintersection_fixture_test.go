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

func TestExportTypeScriptOvgintersectionFixtures(t *testing.T) {
	path := os.Getenv("TALA_OVGINTERSECTION_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 160; trial++ {
		for _, limit := range []uint64{40, 100, 300, 5000} {
			g := layoutgraph.NewGraph()
			owner := g.AddNode(layoutgraph.NewNode(1, 40, 40))
			owner.TopLeft = geo.NewPoint(0, 0)
			if trial%4 == 0 {
				owner.FixedTopLeft = owner.TopLeft.Copy()
			}
			for i := 0; i < 2; i++ {
				n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+2), 20, 30))
				n.TopLeft = geo.NewPoint(float64((trial*7+i*31)%100-30), float64((trial*11+i*23)%100-30))
			}
			ovg := NewOVG(g.Nodes)
			ports := []*OVGNode{}
			for i := 0; i < 7; i++ {
				p := ovg.AddNode(NewOVGNode(geo.NewPoint(float64((i*5+trial)%9)*10, float64((i*3+trial)%9)*10)))
				ports = append(ports, p)
			}
			ovg.Ports[owner] = ports
			limits := defaultOVGBuildLimits()
			limits.work = limit
			guard, _ := newOVGBuildGuard(context.Background(), limits)
			err := ovg.addNodesIntersections(g, guard)
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			points := []*geo.Point{}
			for _, n := range ovg.Nodes {
				points = append(points, n.Point)
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "error": msg, "work": guard.work, "count": guard.nodes, "candidates": guard.candidates, "points": points})
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
