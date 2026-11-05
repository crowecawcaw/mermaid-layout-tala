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

func TestExportTypeScriptPackingroutedboxFixtures(t *testing.T) {
	path := os.Getenv("TALA_PACKINGROUTEDBOX_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		root := layoutgraph.NewNode(1, 200, float64(160-trial%4*10))
		root.TopLeft = geo.NewPoint(0, 0)
		root.SetContainer(true)
		ext := layoutgraph.NewNode(2, 40, 30)
		ext.TopLeft = geo.NewPoint(80, -150)
		child := layoutgraph.NewNode(3, 40, 30)
		child.TopLeft = geo.NewPoint(80, 50)
		g.AddNewNodeToContainer(nil, root)
		g.AddNewNodeToContainer(nil, ext)
		g.AddNewNodeToContainer(root, child)
		e := g.Connect(root, ext)
		e.Points = []*geo.Point{geo.NewPoint(100, 0), geo.NewPoint(100, -150)}
		if trial%5 == 0 {
			e.Points = []*geo.Point{geo.NewPoint(100, 0), geo.NewPoint(100, -50), geo.NewPoint(130, -50), geo.NewPoint(130, -150)}
		}
		if trial%7 == 0 {
			e.IsCurve = true
		}
		original := geo.NewBox(geo.NewPoint(0, 0), 200, 160)
		guard, _ := newWorkGuard(context.Background(), 1000000)
		decision, err := binPackCanUseRoutedContainerBox(g, root, original, []*layoutgraph.Edge{e}, guard)
		if err != nil {
			t.Fatal(err)
		}
		work := guard.Used()
		guard, _ = newWorkGuard(context.Background(), 1000000)
		preserved, err := routedContainerRoutesStayInsideShrink([]*layoutgraph.Edge{e}, original, &root.Box, guard)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, map[string]any{"trial": trial, "decision": decision, "work": work, "preserved": preserved, "routeWork": guard.Used()})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
