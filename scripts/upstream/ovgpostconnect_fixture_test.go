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

func TestExportTypeScriptOvgpostconnectFixtures(t *testing.T) {
	path := os.Getenv("TALA_OVGPOSTCONNECT_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		for _, limit := range []uint64{10, 50, 150, 1000} {
			g := layoutgraph.NewGraph()
			a := g.AddNode(layoutgraph.NewNode(1, 110, 110))
			a.TopLeft = geo.NewPoint(0, 0)
			a.SetContainer(true)
			b := g.AddNode(layoutgraph.NewNode(2, 40, 40))
			b.TopLeft = geo.NewPoint(float64(trial%5)*10, float64(trial%7)*10)
			b.SetContainer(true)
			b.Container = a
			g.Containers[nil] = []*layoutgraph.Node{a}
			g.Containers[a] = []*layoutgraph.Node{b}
			ovg := NewOVG(g.Nodes)
			nodes := []*OVGNode{}
			for i := 0; i < 25; i++ {
				n := ovg.AddNode(NewOVGNode(geo.NewPoint(float64(i%5)*25, float64(i/5)*25)))
				n.Index = i
				nodes = append(nodes, n)
			}
			ports := []*OVGNode{}
			for i, n := range nodes {
				if (i+trial)%11 == 0 {
					n.addPortOwner(a, geo.Top, false)
					ports = append(ports, n)
				}
				if i%5 != 4 {
					ovg.Connect(n, nodes[i+1])
				}
				if i < 20 {
					ovg.Connect(n, nodes[i+5])
				}
			}
			ovg.Ports[a] = ports
			limits := defaultOVGBuildLimits()
			limits.work = limit
			guard, _ := newOVGBuildGuard(context.Background(), limits)
			err := ovg.mapNodesToContainer(g, guard)
			if err == nil {
				err = ovg.flagNodesNearPorts(guard)
			}
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			states := []any{}
			for _, n := range nodes {
				id := 0
				if n.Container != nil {
					id = int(n.Container.ID)
				}
				_, near := n.IsNearPort[a]
				states = append(states, map[string]any{"container": id, "near": near})
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "error": msg, "work": guard.work, "states": states})
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
