// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package engine

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/lib/geo"
	"github.com/d2lang/d2/lib/label"
	"os"
	"testing"
)

func TestExportTypeScriptEnginecompoundroutesFixtures(t *testing.T) {
	path := os.Getenv("TALA_ENGINECOMPOUNDROUTES_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		root := layoutgraph.NewNode(1, 300, 200)
		root.TopLeft = geo.NewPoint(0, 0)
		g.AddNewNodeToContainer(nil, root)
		a := layoutgraph.NewNode(2, 40, 40)
		a.TopLeft = geo.NewPoint(20, 60)
		g.AddNewNodeToContainer(root, a)
		b := layoutgraph.NewNode(3, 40, 40)
		b.TopLeft = geo.NewPoint(220, 60)
		g.AddNewNodeToContainer(root, b)
		e := g.Connect(a, b)
		e.Points = []*geo.Point{geo.NewPoint(60, 80), geo.NewPoint(float64(80+trial%25*10), 80), geo.NewPoint(220, 80)}
		if trial%3 == 0 {
			e.Label = &layoutgraph.Label{Text: "test", Width: 20, Height: 10, Position: label.InsideMiddleCenter}
			e.LabelPercentage = 0.5
		}
		if trial%7 == 0 {
			e.Points[0].X = 50
		}
		guard, _ := limits.NewWorkGuard(context.Background(), "CompoundRoutes", limits.MaxEngineWorkUnits)
		enclosed, err := compoundEnclosedRoute(e, guard)
		if err != nil {
			t.Fatal(err)
		}
		refined, err := PreserveCompoundRoutes(context.Background(), g, g)
		if err != nil {
			t.Fatal(err)
		}
		coords := [][]float64{}
		for _, n := range refined.Nodes {
			coords = append(coords, []float64{n.TopLeft.X, n.TopLeft.Y})
		}
		out = append(out, map[string]any{"trial": trial, "enclosed": enclosed, "work": guard.Used(), "coords": coords, "route": refined.Edges[0].Points})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
