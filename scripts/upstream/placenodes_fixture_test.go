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

func TestExportTypeScriptPlacenodesFixtures(t *testing.T) {
	path := os.Getenv("TALA_PLACENODES_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 48; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = 40
		count := 1 + trial%5
		nodes := []*layoutgraph.Node{}
		for i := 0; i < count; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(40+i*4), float64(40+i*3))
			g.AddNewNodeToContainer(nil, n)
			nodes = append(nodes, n)
		}
		if trial%7 == 0 {
			nodes[0].FixedTopLeft = geo.NewPoint(20, 35)
		}
		edges := []any{}
		for i := 1; i < count; i++ {
			if trial%5 == 0 && i == count-1 {
				continue
			}
			from := i - 1
			if trial%3 == 1 {
				from = 0
			}
			e := g.Connect(nodes[from], nodes[i])
			e.TargetArrowhead = "triangle"
			edges = append(edges, []int{from, i})
		}
		seed := int64(trial + 1)
		if err := placeNodes(context.Background(), g, nil, seed, nil, nil); err != nil {
			t.Fatal(err)
		}
		points := []any{}
		for _, n := range nodes {
			points = append(points, []float64{n.TopLeft.X, n.TopLeft.Y, n.Width, n.Height})
		}
		ids := []int{}
		for _, n := range g.Nodes {
			ids = append(ids, int(n.ID))
		}
		out = append(out, map[string]any{"trial": trial, "count": count, "edges": edges, "points": points, "order": ids, "cell": g.CellSize})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
