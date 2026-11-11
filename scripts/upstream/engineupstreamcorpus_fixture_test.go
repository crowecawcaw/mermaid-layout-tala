// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/graphjson"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
)

func TestExportTypeScriptEngineupstreamcorpusFixtures(t *testing.T) {
	path := os.Getenv("TALA_ENGINEUPSTREAMCORPUS_FIXTURES")
	if path == "" {
		t.Skip("set TALA_ENGINEUPSTREAMCORPUS_FIXTURES")
	}
	cases := []struct{ name, path string }{
		{"trees_26nodes", "benchmark/trees_26nodes.json"},
		{"18tables", "benchmark/18tables.json"},
		{"clusters_28nodes", "benchmark/clusters_28nodes.json"},
		{"hierarchy_nested", "benchmark/hierarchy_nested.json"},
		{"generated_nested", "benchmark/nodes10_edges20_containers5_width4441_height4198.json"},
	}
	entries, err := os.ReadDir(filepath.Join("..", "testdata", "layout"))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		input := filepath.Join("layout", entry.Name(), "graph.input.json")
		if _, err := os.Stat(filepath.Join("..", "testdata", input)); err != nil {
			if os.IsNotExist(err) {
				continue
			}
			t.Fatal(err)
		}
		cases = append(cases, struct{ name, path string }{entry.Name(), input})
	}
	fixtures := []any{}
	for _, c := range cases {
		data, err := os.ReadFile(filepath.Join("..", "testdata", c.path))
		if err != nil {
			t.Fatal(err)
		}
		for _, seed := range []int64{1, 123} {
			graph := layoutgraph.NewGraph()
			if err := graphjson.Unmarshal(context.Background(), data, graph); err != nil {
				t.Fatal(err)
			}
			result, err := Layout(context.Background(), graph, LayoutOptions{Seed: seed})
			if err != nil {
				t.Fatalf("%s seed %d: %v", c.name, seed, err)
			}
			if seed == 123 && strings.HasPrefix(c.path, "layout/") {
				goldenPath := filepath.Join("..", "testdata", strings.TrimSuffix(c.path, "graph.input.json"), "graph.exp.json")
				goldenData, err := os.ReadFile(goldenPath)
				if err != nil {
					t.Fatal(err)
				}
				var golden struct {
					Nodes []struct {
						ID            int64 `json:"id"`
						Width, Height float64
						TopLeft       *struct{ X, Y float64 } `json:"topLeft"`
					} `json:"nodes"`
					Edges []struct {
						ID     int64                    `json:"id"`
						Points []struct{ X, Y float64 } `json:"points"`
					} `json:"edges"`
				}
				if err := json.Unmarshal(goldenData, &golden); err != nil {
					t.Fatal(err)
				}
				if len(golden.Nodes) != len(result.Nodes) || len(golden.Edges) != len(result.Edges) {
					t.Fatalf("%s seed %d: upstream golden topology differs", c.name, seed)
				}
				goldenNodes := map[int64]int{}
				for i, n := range golden.Nodes {
					goldenNodes[n.ID] = i
				}
				for _, n := range result.Nodes {
					i, ok := goldenNodes[n.IDValue()]
					if !ok || golden.Nodes[i].TopLeft == nil {
						t.Fatalf("%s: node %d missing from upstream golden", c.name, n.IDValue())
					}
					g := golden.Nodes[i]
					if math.Abs(n.TopLeft.X-g.TopLeft.X) > 1e-7 || math.Abs(n.TopLeft.Y-g.TopLeft.Y) > 1e-7 || math.Abs(n.Width-g.Width) > 1e-7 || math.Abs(n.Height-g.Height) > 1e-7 {
						t.Fatalf("%s: node %d differs from upstream golden", c.name, n.IDValue())
					}
				}
				goldenEdges := map[int64]int{}
				for i, e := range golden.Edges {
					goldenEdges[e.ID] = i
				}
				for _, e := range result.Edges {
					i, ok := goldenEdges[int64(e.ID)]
					if !ok || len(e.Points) != len(golden.Edges[i].Points) {
						t.Fatalf("%s: edge %d differs from upstream golden", c.name, e.ID)
					}
					for j, p := range e.Points {
						g := golden.Edges[i].Points[j]
						if math.Abs(p.X-g.X) > 1e-7 || math.Abs(p.Y-g.Y) > 1e-7 {
							t.Fatalf("%s: edge %d vertex %d differs from upstream golden", c.name, e.ID, j)
						}
					}
				}
			}
			nodes := []any{}
			edges := []any{}
			for _, n := range result.Nodes {
				record := map[string]any{"id": n.IDValue(), "x": n.TopLeft.X, "y": n.TopLeft.Y, "width": n.Width, "height": n.Height}
				if n.Label != nil {
					record["label"] = map[string]any{"position": n.Label.Position.String(), "width": n.Label.Width, "height": n.Label.Height}
				}
				if n.Icon != nil {
					record["iconPosition"] = n.Icon.Position.String()
				}
				nodes = append(nodes, record)
			}
			for _, e := range result.Edges {
				record := map[string]any{"id": e.ID, "points": e.Points, "isCurve": e.IsCurve}
				if e.Label != nil {
					record["label"] = map[string]any{"position": e.Label.Position.String(), "percentage": e.LabelPercentage, "width": e.Label.Width, "height": e.Label.Height}
				}
				edges = append(edges, record)
			}
			fixtures = append(fixtures, map[string]any{"name": fmt.Sprintf("upstream-%s-seed-%d", c.name, seed), "seed": seed, "input": json.RawMessage(data), "nodes": nodes, "edges": edges})
		}
	}
	data, err := json.MarshalIndent(fixtures, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
