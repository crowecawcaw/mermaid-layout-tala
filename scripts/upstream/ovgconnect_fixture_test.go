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

func TestExportTypeScriptOvgconnectFixtures(t *testing.T) {
	path := os.Getenv("TALA_OVGCONNECT_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 160; trial++ {
		for _, limit := range []uint64{25, 100, 250, 5000} {
			g := layoutgraph.NewGraph()
			for i := 0; i < 3; i++ {
				n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), 30, 40))
				n.TopLeft = geo.NewPoint(float64((trial*7+i*43)%160-30), float64((trial*11+i*29)%130-20))
				if trial%7 == 0 && i == 0 {
					n.FixedTopLeft = n.TopLeft.Copy()
				}
			}
			ovg := NewOVG(g.Nodes)
			ports := []*OVGNode{}
			for i := 0; i < 25; i++ {
				n := ovg.AddNode(NewOVGNode(geo.NewPoint(float64(i%5)*40, float64(i/5)*40)))
				n.Index = i
				if (i+trial)%9 == 0 {
					n.addPortOwner(g.Nodes[0], geo.Orientation(4+i%4), false)
					ports = append(ports, n)
				}
				if (i+trial)%23 == 0 {
					n.IsTunnel = true
				}
			}
			ovg.Ports[g.Nodes[0]] = ports
			limits := defaultOVGBuildLimits()
			limits.work = limit
			guard, _ := newOVGBuildGuard(context.Background(), limits)
			err := ovg.connectNodes(g, guard)
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			edges := [][]int{}
			for _, e := range ovg.Edges {
				edges = append(edges, []int{e.From.Index, e.To.Index})
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "error": msg, "work": guard.work, "count": guard.edges, "edges": edges})
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
