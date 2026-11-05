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

func TestExportTypeScriptOvgportindexFixtures(t *testing.T) {
	path := os.Getenv("TALA_OVGPORTINDEX_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 200; trial++ {
		g := layoutgraph.NewGraph()
		owner := g.AddNode(layoutgraph.NewNode(1, 40, 40))
		owner.TopLeft = geo.NewPoint(0, 0)
		owner.IsInvisible = trial%7 == 0
		for i := 0; i < 3; i++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+2), 20, 30))
			n.TopLeft = geo.NewPoint(float64((trial*7+i*31)%100-30), float64((trial*11+i*23)%100-30))
		}
		ovg := NewOVG(g.Nodes)
		ports := []*OVGNode{}
		for i := 0; i < 10; i++ {
			p := NewOVGNode(geo.NewPoint(float64((i*7+trial)%7)*10, float64((i*3+trial)%7)*10))
			ports = append(ports, p)
		}
		ovg.Ports[owner] = ports
		guard, _ := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
		index, err := newOVGPortIndex(ovg.Ports, g, map[*layoutgraph.Node]struct{}{}, guard)
		if err != nil {
			t.Fatal(err)
		}
		answers := []any{}
		for i := 0; i < 30; i++ {
			x, y := float64((trial+i*7)%13-3)*10, float64((trial+i*11)%13-3)*10
			near, err := index.tooClose(x, y, float64(i%4*5), guard)
			if err != nil {
				t.Fatal(err)
			}
			candidate := NewOVGNode(geo.NewPoint(x, y))
			visible, err := candidate.hasUnobstructedLineToPorts(ovg, index, 2, guard)
			if err != nil {
				t.Fatal(err)
			}
			answers = append(answers, map[string]any{"near": near, "visible": visible})
		}
		out = append(out, map[string]any{"trial": trial, "answers": answers, "work": guard.work})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
