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

func corpusID(id int64) string { return fmt.Sprint(id) }

func corpusIDs(ids []int64) []string {
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = corpusID(id)
	}
	return out
}

func corpusAbductions(values []graphjson.SerializedEdgeAbduction) []any {
	out := make([]any, 0, len(values))
	for _, value := range values {
		out = append(out, map[string]string{
			"edge": corpusID(value.Edge), "originallyFrom": corpusID(value.OriginallyFromNode), "originallyTo": corpusID(value.OriginallyToNode),
			"currentFrom": corpusID(value.CurrentFromNode), "currentTo": corpusID(value.CurrentToNode),
		})
	}
	return out
}

func corpusTree(tree graphjson.SerializedTree) map[string]any {
	children := make([]any, 0, len(tree.Children))
	for _, child := range tree.Children {
		children = append(children, corpusTree(child))
	}
	edgeID := tree.SentinelEdge.ID
	if tree.SentinelEdge.OriginalID != nil {
		edgeID = *tree.SentinelEdge.OriginalID
	}
	return map[string]any{"node": corpusID(tree.Node.ID), "edge": corpusID(edgeID), "orientation": tree.Orientation, "children": children}
}

func corpusVessels(values map[int64]graphjson.SerializedNode) map[string]any {
	out := map[string]any{}
	for id, node := range values {
		out[corpusID(id)] = map[string]any{"width": node.Width, "height": node.Height, "topLeft": node.TopLeft,
			"shapeType": node.ShapeType, "fontSize": node.FontSize, "isInvisible": node.IsInvisible,
			"is3D": node.Is3D, "isMultiple": node.IsMultiple, "forceHierarchy": node.ForceHierarchy}
	}
	return out
}

func corpusStructure(graph *graphjson.SerializedGraph) map[string]any {
	containers := map[string][]string{}
	for id, children := range graph.Containers {
		containers[corpusID(id)] = corpusIDs(children)
	}
	hubs := map[string][]string{}
	for id, spokes := range graph.Hubs {
		hubs[corpusID(id)] = corpusIDs(spokes)
	}
	clusters := map[string]any{}
	for id, cluster := range graph.Clusters {
		clusters[corpusID(id)] = map[string]any{"nodes": corpusIDs(cluster.Nodes), "arrangement": cluster.Arrangement,
			"desiredArrangement": cluster.DesiredArrangement, "container": corpusID(cluster.Container), "abductions": corpusAbductions(cluster.EdgeAbductions),
			"padding": cluster.Padding, "fixedSize": cluster.FixedSize}
	}
	sequences := map[string]any{}
	for id, sequence := range graph.Sequences {
		sequences[corpusID(id)] = map[string]any{"nodes": corpusIDs(sequence.Nodes), "container": corpusID(sequence.Container), "abductions": corpusAbductions(sequence.EdgeAbductions)}
	}
	trees := map[string][]any{}
	for id, roots := range graph.Trees {
		values := make([]any, 0, len(roots))
		for _, root := range roots {
			values = append(values, corpusTree(root))
		}
		trees[corpusID(id)] = values
	}
	return map[string]any{"cellSize": graph.CellSize, "containers": containers, "hubs": hubs, "clusters": clusters, "sequences": sequences,
		"clusterVessels": corpusVessels(graph.ClusterVessels), "sequenceVessels": corpusVessels(graph.SequenceVessels),
		"trees": trees, "hierarchies": graph.Hierarchies}
}

func TestExportTypeScriptEngineupstreamcorpusFixtures(t *testing.T) {
	path := os.Getenv("TALA_ENGINEUPSTREAMCORPUS_FIXTURES")
	if path == "" {
		t.Skip("set TALA_ENGINEUPSTREAMCORPUS_FIXTURES")
	}
	cases := []struct{ name, path string }{}
	benchmarks, err := os.ReadDir(filepath.Join("..", "testdata", "benchmark"))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range benchmarks {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".json") {
			continue
		}
		cases = append(cases, struct{ name, path string }{strings.TrimSuffix(name, ".json"), filepath.Join("benchmark", name)})
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
				nears := []string{}
				for _, near := range layoutgraph.OrderedNearsForSerialization(n) {
					nears = append(nears, fmt.Sprint(near.IDValue()))
				}
				record := map[string]any{"id": n.IDValue(), "x": n.TopLeft.X, "y": n.TopLeft.Y, "width": n.Width, "height": n.Height,
					"d2id": n.D2ID, "fontSize": n.FontSize, "shapeType": n.ShapeType(), "numColumns": n.NumColumns(),
					"isInvisible": n.IsInvisible, "is3D": n.Is3D, "isMultiple": n.IsMultiple, "forceHierarchy": n.ForceHierarchy, "isContainer": n.IsContainer(), "nears": nears}
				if n.Label != nil {
					record["label"] = map[string]any{"text": n.Label.Text, "position": n.Label.Position.String(), "width": n.Label.Width, "height": n.Label.Height}
				}
				if n.Icon != nil {
					record["iconPosition"] = n.Icon.Position.String()
				}
				nodes = append(nodes, record)
			}
			for _, e := range result.Edges {
				record := map[string]any{"id": e.ID, "points": e.Points, "isCurve": e.IsCurve, "d2id": e.D2ID,
					"from": e.From.IDValue(), "to": e.To.IDValue(), "sourceArrowhead": e.SourceArrowhead,
					"targetArrowhead": e.TargetArrowhead, "minWidth": e.MinWidth, "minHeight": e.MinHeight,
					"fromTableColumnIndex": e.FromTableColumnIndex, "toTableColumnIndex": e.ToTableColumnIndex, "isInvisible": e.IsInvisible}
				if e.Label != nil {
					record["label"] = map[string]any{"text": e.Label.Text, "position": e.Label.Position.String(), "percentage": e.LabelPercentage, "width": e.Label.Width, "height": e.Label.Height}
				}
				edges = append(edges, record)
			}
			serialized, err := graphjson.Serialize(context.Background(), result)
			if err != nil {
				t.Fatalf("%s seed %d serialize: %v", c.name, seed, err)
			}
			structure := corpusStructure(serialized)
			fixtures = append(fixtures, map[string]any{"name": fmt.Sprintf("upstream-%s-seed-%d", c.name, seed), "seed": seed, "input": json.RawMessage(data), "nodes": nodes, "edges": edges, "structure": structure})
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
