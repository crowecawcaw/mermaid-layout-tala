// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package packing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptPackingroutesFixtures(t *testing.T) {
	path := os.Getenv("TALA_PACKINGROUTES_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 3; i++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), 40, 30))
			n.TopLeft = geo.NewPoint(float64(i*150), 0)
			nodes = append(nodes, n)
		}
		g.Containers[nil] = nodes
		e := g.Connect(nodes[0], nodes[1])
		f := g.Connect(nodes[1], nodes[2])
		switch trial % 5 {
		case 1:
			e.Points = []*geo.Point{geo.NewPoint(40, 15), geo.NewPoint(150, 15)}
		case 2:
			e.Points = []*geo.Point{geo.NewPoint(40, 15), geo.NewPoint(150, 15)}
			f.Points = []*geo.Point{geo.NewPoint(190, 15), geo.NewPoint(300, 15)}
		case 3:
			e.Points = []*geo.Point{geo.NewPoint(40, 15)}
		case 4:
			nodes[0].Edges = append(nodes[0].Edges, e)
		}
		guard, _ := newWorkGuard(context.Background(), 1000000)
		routed, incident, err := allEdgesHaveCompleteRoutesGuarded(g, nil, guard)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		ids := []int{}
		for _, edge := range incident {
			ids = append(ids, int(edge.ID))
		}
		out = append(out, map[string]any{"trial": trial, "routed": routed, "incident": ids, "error": msg, "work": guard.Used()})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
