// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placementcost

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptEdgelengthFixtures(t *testing.T) {
	path := os.Getenv("TALA_EDGELENGTH_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 320; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = float64(20 + trial%40)
		nodes := []*layoutgraph.Node{}
		dataNodes := []any{}
		for j := 0; j < 5; j++ {
			w, h := float64(20+(trial*7+j*19)%80), float64(20+(trial*11+j*13)%70)
			n := layoutgraph.NewNode(layoutgraph.EntityID(j+1), w, h)
			g.AddNewNodeToContainer(nil, n)
			x, y := float64((trial*13+j*53)%300), float64((trial*17+j*71)%300)
			if trial%4 == 0 {
				x = float64(j%2) * 50
			}
			if trial%4 == 1 {
				y = float64(j%2) * 60
			}
			n.TopLeft = geo.NewPoint(x, y)
			nodes = append(nodes, n)
			dataNodes = append(dataNodes, map[string]any{"x": x, "y": y, "w": w, "h": h})
		}
		edges := []any{}
		for j := 1; j < 5; j++ {
			e := g.Connect(nodes[0], nodes[j])
			if j%2 == 0 {
				e.SourceArrowhead = "triangle"
			} else {
				e.TargetArrowhead = "triangle"
			}
			edges = append(edges, map[string]any{"source": string(e.SourceArrowhead), "target": string(e.TargetArrowhead)})
		}
		if trial%3 == 0 {
			g.Directions[nil] = []geo.Orientation{geo.Top, geo.Bottom, geo.Left, geo.Right}[trial%4]
		}
		values := []float64{}
		for mask := 0; mask < 8; mask++ {
			opts := EdgeLengthOptions{IncludeNodeSizes: mask&1 != 0, EnforceMinimumGap: mask&2 != 0, PenalizeDirection: mask&4 != 0}
			result, err := NodeEdgeLength(context.Background(), nodes[0], opts)
			if err != nil {
				t.Fatal(err)
			}
			values = append(values, result)
		}
		out = append(out, map[string]any{"trial": trial, "cell": g.CellSize, "direction": g.Direction(nil), "nodes": dataNodes, "edges": edges, "expected": values})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
