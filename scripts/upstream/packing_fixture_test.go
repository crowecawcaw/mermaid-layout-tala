// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package packing

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"math/rand"
	"os"
	"testing"
)

func TestExportTypeScriptPackingFixtures(t *testing.T) {
	path := os.Getenv("TALA_PACKING_FIXTURES")
	if path == "" {
		t.Skip("set TALA_PACKING_FIXTURES")
	}
	out := []any{}
	rng := rand.New(rand.NewSource(19))
	for trial := 0; trial < 100; trial++ {
		master := layoutgraph.NewGraph()
		graphs := []*layoutgraph.Graph{}
		inputs := []any{}
		mapping := map[*layoutgraph.Node]string{}
		id := 0
		count := 1 + rng.Intn(7)
		for i := 0; i < count; i++ {
			graph := layoutgraph.NewGraph()
			nodes := []any{}
			for j := 0; j < 1+rng.Intn(4); j++ {
				id++
				n := graph.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(id), float64(20+rng.Intn(80)), float64(20+rng.Intn(80))))
				n.TopLeft = geo.NewPoint(float64(j*140+rng.Intn(20)), float64(j*100+rng.Intn(20)))
				mapping[n] = fmt.Sprint(id)
				nodes = append(nodes, map[string]any{"id": mapping[n], "x": n.Center().X, "y": n.Center().Y, "width": n.Width, "height": n.Height, "rank": 0, "order": j})
			}
			graphs = append(graphs, graph)
			inputs = append(inputs, map[string]any{"nodes": nodes, "edges": []any{}})
		}
		combined, err := CombineSubgraphs(context.Background(), master, graphs, nil)
		if err != nil {
			t.Fatal(err)
		}
		expected := map[string]any{}
		for _, n := range combined.Nodes {
			expected[mapping[n]] = map[string]float64{"x": n.Center().X, "y": n.Center().Y}
		}
		out = append(out, map[string]any{"name": fmt.Sprintf("packing-%03d", trial), "components": inputs, "expected": expected})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
