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

func TestExportTypeScriptRoutingtunnelFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGTUNNEL_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 240; trial++ {
		for _, limit := range []uint64{10, 30, 70, 5000} {
			graph := layoutgraph.NewGraph()
			a := graph.AddNode(layoutgraph.NewNode(1, 100, 120))
			a.TopLeft = geo.NewPoint(0, 0)
			b := graph.AddNode(layoutgraph.NewNode(2, 100, 120))
			b.TopLeft = geo.NewPoint(250, float64(trial%7)*20-50)
			for j := 0; j < trial%4; j++ {
				n := graph.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(j+3), float64(20+j*15), float64(20+(trial+j)%7*10)))
				n.TopLeft = geo.NewPoint(float64(110+j*45), float64((trial*11+j*29)%220-70))
			}
			for j := 0; j < 1+trial%5; j++ {
				graph.Connect(a, b)
			}
			if trial%2 == 1 {
				for _, n := range graph.Nodes {
					n.TopLeft.X, n.TopLeft.Y = n.TopLeft.Y, n.TopLeft.X
					n.Width, n.Height = n.Height, n.Width
				}
			}
			limits := defaultOVGBuildLimits()
			limits.work = limit
			guard, _ := newOVGBuildGuard(context.Background(), limits)
			ranges, horizontal, err := tunnelRangesBetween(graph, a, b, trial%3 == 0, guard)
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			r := []any(nil)
			if ranges != nil {
				r = []any{}
				for _, x := range ranges {
					r = append(r, []float64{x.start, x.end})
				}
			}
			guard2, _ := newOVGBuildGuard(context.Background(), limits)
			tunnels, err2 := buildTunnels(graph, guard2)
			msg2 := ""
			if err2 != nil {
				msg2 = err2.Error()
			}
			outT := []any(nil)
			if tunnels != nil {
				outT = []any{}
				for _, tunnel := range tunnels {
					outT = append(outT, []*geo.Point{tunnel.EntryA.OVGNode.Point, tunnel.EntryB.OVGNode.Point})
				}
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "ranges": r, "horizontal": horizontal, "error": msg, "work": guard.work, "tunnels": outT, "tunnelError": msg2, "tunnelWork": guard2.work, "tunnelNodes": guard2.nodes})
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
