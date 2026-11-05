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

func TestExportTypeScriptInitializeFixtures(t *testing.T) {
	path := os.Getenv("TALA_INITIALIZE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = float64(20 + trial%20)
		count := 2 + trial%5
		nodes := []*layoutgraph.Node{}
		edges := []any{}
		for j := 0; j < count; j++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(j+1), float64(20+j*5), float64(20+j*3))
			g.AddNewNodeToContainer(nil, n)
			nodes = append(nodes, n)
		}
		if trial%4 == 0 {
			nodes[0].FixedTopLeft = geo.NewPoint(float64(trial%60), float64(trial%45))
		}
		for j := 1; j < count; j++ {
			e := g.Connect(nodes[j-1], nodes[j])
			if (trial+j)%3 == 0 {
				e.SourceArrowhead = "triangle"
			} else {
				e.TargetArrowhead = "triangle"
			}
			edges = append(edges, map[string]any{"source": string(e.SourceArrowhead), "target": string(e.TargetArrowhead)})
		}
		stress, err := initializeByGraphDistance(context.Background(), g)
		if err != nil {
			t.Fatal(err)
		}
		stressPositions := []any{}
		if stress {
			for _, n := range nodes {
				stressPositions = append(stressPositions, []float64{n.TopLeft.X, n.TopLeft.Y})
				n.TopLeft = nil
			}
		}
		if err := initializeNodes(context.Background(), g); err != nil {
			t.Fatal(err)
		}
		positions := []any{}
		for _, n := range nodes {
			positions = append(positions, []float64{n.TopLeft.X, n.TopLeft.Y})
		}
		out = append(out, map[string]any{"stress": stress, "stressPositions": stressPositions, "trial": trial, "cell": g.CellSize, "count": count, "fixed": trial%4 == 0, "edges": edges, "positions": positions})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
