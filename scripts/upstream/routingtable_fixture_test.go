// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/labeling"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/nodeshape"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptRoutingtableFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGTABLE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 240; trial++ {
		g := layoutgraph.NewGraph()
		a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
		a.TopLeft = geo.NewPoint(0, 0)
		b := g.AddNode(layoutgraph.NewNode(2, 90, 70))
		b.TopLeft = geo.NewPoint(float64(trial%3-1)*150, float64(trial/3%3-1)*150)
		if trial%2 == 0 {
			a.SetShape("Table")
			nodeshape.SetNumColumns(a.Shape, 1+trial%4)
		}
		if trial%4 == 0 {
			b.SetShape("Table")
			nodeshape.SetNumColumns(b.Shape, 1+trial%3)
		}
		e := g.Connect(a, b)
		col := 0
		if trial%3 != 0 {
			e.FromTableColumnIndex = &col
		}
		if trial%5 != 0 {
			e.ToTableColumnIndex = &col
		}
		e.SourceArrowhead = "triangle"
		e.TargetArrowhead = "diamond"
		e.SourceArrowheadLabel = &layoutgraph.Label{Text: "source", Width: 23.5, Height: 11.25}
		e.TargetArrowheadLabel = &layoutgraph.Label{Text: "target", Width: 31.5, Height: 13.75}
		ovg := NewOVG(g.Nodes)
		setup, _ := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
		if err := ovg.addPorts(g, setup); err != nil {
			t.Fatal(err)
		}
		guard, _ := newRouteSearchWorkGuard(context.Background(), Default, 10000)
		router := &ovgEdgeRouter{ovg: ovg, work: guard}
		source, target, err := router.tablePorts(e, a, b, trial%2 == 0)
		if err != nil {
			t.Fatal(err)
		}
		toIndices := func(ports map[*OVGNode]struct{}, owner *layoutgraph.Node) []int {
			if ports == nil {
				return nil
			}
			out := []int{}
			for i, p := range ovg.Ports[owner] {
				if _, ok := ports[p]; ok {
					out = append(out, i)
				}
			}
			return out
		}
		route := []*geo.Point{geo.NewPoint(80, 30), geo.NewPoint(120, 30), geo.NewPoint(120, 100), geo.NewPoint(160, 100)}
		la := labeling.PositionArrowheadLabel(e, false, route)
		lb := labeling.PositionArrowheadLabel(e, true, route)
		out = append(out, map[string]any{"trial": trial, "source": toIndices(source, a), "target": toIndices(target, b), "work": guard.used, "aLabel": la.TopLeft, "bLabel": lb.TopLeft})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
