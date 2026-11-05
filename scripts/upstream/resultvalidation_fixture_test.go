// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptResultvalidationFixtures(t *testing.T) {
	path := os.Getenv("TALA_RESULTVALIDATION_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		a := layoutgraph.NewNode(1, 40, 30)
		a.TopLeft = geo.NewPoint(0, 0)
		g.AddNewNodeToContainer(nil, a)
		b := layoutgraph.NewNode(2, 40, 30)
		b.TopLeft = geo.NewPoint(100, 0)
		g.AddNewNodeToContainer(nil, b)
		e := g.Connect(a, b)
		e.ID = 10
		e.Points = []*geo.Point{geo.NewPoint(40, 15), geo.NewPoint(100, 15)}
		switch trial % 10 {
		case 1:
			a.TopLeft = nil
		case 2:
			a.Width = 0
		case 3:
			a.TopLeft.X = 1000000001
		case 4:
			b.ID = 1
		case 5:
			e.Points = nil
		case 6:
			e.Points[1] = nil
		case 7:
			e.LabelPercentage = 2
		case 8:
			e.Label = &layoutgraph.Label{Width: -1, Height: 5}
		case 9:
			g.Edges = append(g.Edges, e)
		}
		err := validateCompletedGraph(context.Background(), g)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		out = append(out, map[string]any{"trial": trial, "error": msg})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
