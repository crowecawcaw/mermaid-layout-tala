// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
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
