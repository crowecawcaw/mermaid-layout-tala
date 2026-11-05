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

func TestExportTypeScriptPlacenestedFixtures(t *testing.T) {
	path := os.Getenv("TALA_PLACENESTED_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 24; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = 40
		root := layoutgraph.NewNode(1, 120, 100)
		a := layoutgraph.NewNode(2, 40, 40)
		b := layoutgraph.NewNode(3, 45, 35)
		external := layoutgraph.NewNode(4, 50, 40)
		g.AddNewNodeToContainer(nil, root)
		g.AddNewNodeToContainer(root, a)
		g.AddNewNodeToContainer(root, b)
		g.AddNewNodeToContainer(nil, external)
		if trial%5 == 0 {
			root.FixedTopLeft = geo.NewPoint(20, 35)
		}
		edges := []*layoutgraph.Edge{g.Connect(a, b), g.Connect(b, external)}
		if trial%3 == 0 {
			edges = append(edges, g.Connect(a, external))
		}
		for _, e := range edges {
			e.TargetArrowhead = "triangle"
		}
		if err := placeNodes(context.Background(), g, nil, int64(trial+1), nil, nil); err != nil {
			t.Fatal(err)
		}
		nodes := []*layoutgraph.Node{root, a, b, external}
		points := []any{}
		for _, n := range nodes {
			points = append(points, []float64{n.TopLeft.X, n.TopLeft.Y, n.Width, n.Height})
		}
		order := []int{}
		for _, n := range g.Nodes {
			order = append(order, int(n.ID))
		}
		endpoints := []any{}
		for _, e := range g.Edges {
			endpoints = append(endpoints, []int{int(e.From.ID), int(e.To.ID)})
		}
		cell := g.CellSize
		if err := Place(context.Background(), g, int64(trial+1)); err != nil {
			t.Fatal(err)
		}
		placed := []any{}
		for _, n := range nodes {
			placed = append(placed, []float64{n.TopLeft.X, n.TopLeft.Y, n.Width, n.Height})
		}
		out = append(out, map[string]any{"placed": placed, "placedCell": g.CellSize, "trial": trial, "points": points, "order": order, "endpoints": endpoints, "cell": cell})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
