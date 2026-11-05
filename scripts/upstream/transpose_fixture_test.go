// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placement

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptTransposeFixtures(t *testing.T) {
	path := os.Getenv("TALA_TRANSPOSE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = 60
		nodes := []*layoutgraph.Node{}
		positions := [][2]float64{{100, 100}, {250, 100}, {250, 250}, {400, 100}}
		if trial%3 == 0 {
			positions[2] = [2]float64{400, 100}
		}
		for i, p := range positions {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), 40, 40)
			g.AddNewNodeToContainer(nil, n)
			n.TopLeft = geo.NewPoint(p[0]+float64(trial%5), p[1])
			nodes = append(nodes, n)
		}
		for i := 1; i < 4; i++ {
			e := g.Connect(nodes[0], nodes[i])
			e.TargetArrowhead = "triangle"
		}
		if trial%7 == 0 {
			nodes[1].FixedTopLeft = geo.NewPoint(1, 1)
		}
		var abs []*layoutgraph.EdgeAbduction
		if trial%2 == 1 {
			abs = []*layoutgraph.EdgeAbduction{}
		}
		changed, err := transpose(context.Background(), g, nodes[1], abs)
		if err != nil {
			t.Fatal(err)
		}
		after := []any{}
		for _, n := range nodes {
			after = append(after, []float64{n.TopLeft.X, n.TopLeft.Y})
		}
		out = append(out, map[string]any{"trial": trial, "changed": changed, "positions": after})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
