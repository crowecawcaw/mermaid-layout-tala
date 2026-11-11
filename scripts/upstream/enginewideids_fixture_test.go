// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/graphjson"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/shape"
)

func TestExportTypeScriptEnginewideidsFixtures(t *testing.T) {
	path := os.Getenv("TALA_ENGINEWIDEIDS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	fixtures := []any{}
	for variant := 0; variant < 12; variant++ {
		for _, seed := range []int64{1, 123} {
			graph := layoutgraph.NewGraph()
			nodes := []*layoutgraph.Node{}
			inputNodes := []any{}
			inputEdges := []any{}
			random := rand.New(rand.NewSource(seed))
			count := 9
			if variant >= 6 {
				count = 20
			}
			if variant >= 10 {
				count = 9
			}
			for i := 0; i < count; i++ {
				id := int64(1<<60) + int64(i*101+1)
				if i%2 == 1 {
					id = -int64(1<<60) + int64(i*103+1)
				}
				if variant >= 4 && variant < 6 {
					id = math.MaxInt64 - int64(i*101)
					if i%2 == 1 {
						id = math.MinInt64 + int64(i*103)
					}
				}
				if variant >= 6 {
					id = random.Int63()
					if variant >= 8 && (i == 1 || i == 2) {
						id = nodes[0].IDValue() + int64(i)
					}
				}
				n := layoutgraph.NewNode(id, float64(40+i*5), float64(30+(i%4)*8))
				if variant >= 6 && variant < 10 && (i == 7 || i == 8) {
					n.Width, n.Height = 128, 128
					n.SetShape(shape.OVAL_TYPE)
				}
				if variant >= 10 && i >= 1 && i <= 4 {
					n.SetShape(shape.STEP_TYPE)
				}
				var parent *layoutgraph.Node
				if variant >= 2 && variant < 6 {
					switch i {
					case 1, 2, 3:
						parent = nodes[0]
					case 4, 5:
						parent = nodes[3]
					}
				}
				if variant >= 6 && variant < 10 {
					switch i {
					case 1, 2, 3:
						parent = nodes[0]
					case 9, 10, 11:
						parent = nodes[6]
					case 13, 14, 15:
						parent = nodes[12]
					}
				}
				graph.AddNewNodeToContainer(parent, n)
				nodes = append(nodes, n)
				record := map[string]any{"id": fmt.Sprint(id), "width": n.Width, "height": n.Height, "shape": n.ShapeType()}
				if parent != nil {
					record["parent"] = fmt.Sprint(parent.IDValue())
				}
				inputNodes = append(inputNodes, record)
			}
			pairs := [][2]int{}
			if variant >= 10 {
				pairs = [][2]int{{0, 1}, {1, 2}, {2, 3}, {3, 4}, {4, 5}, {6, 1}, {4, 7}, {7, 8}}
			} else if variant >= 6 {
				pairs = [][2]int{{1, 2}, {1, 3}, {3, 2}, {4, 5}, {0, 5}, {6, 0}, {5, 4}, {7, 0}, {8, 0}}
			} else {
				for i := 0; i < 9; i++ {
					for _, shift := range []int{1, 3} {
						pairs = append(pairs, [2]int{i, (i + shift) % len(nodes)})
					}
				}
			}
			for i, pair := range pairs {
				from, to := nodes[pair[0]], nodes[pair[1]]
				e := graph.Connect(from, to)
				e.ID = math.MaxInt64 - int64(len(graph.Edges)*7)
				if variant%2 == 1 && i%3 == 0 {
					e.ID = 0
				}
				e.TargetArrowhead = "triangle"
				inputEdges = append(inputEdges, map[string]any{"id": fmt.Sprint(e.ID), "from": fmt.Sprint(from.IDValue()), "to": fmt.Sprint(to.IDValue())})
			}
			result, err := Layout(context.Background(), graph, LayoutOptions{Seed: seed})
			if err != nil {
				t.Fatalf("variant %d seed %d: %v", variant, seed, err)
			}
			outNodes := []any{}
			outEdges := []any{}
			for _, n := range result.Nodes {
				outNodes = append(outNodes, map[string]any{"id": fmt.Sprint(n.IDValue()), "x": n.TopLeft.X, "y": n.TopLeft.Y, "width": n.Width, "height": n.Height})
			}
			for _, e := range result.Edges {
				outEdges = append(outEdges, map[string]any{"id": fmt.Sprint(e.ID), "from": fmt.Sprint(e.From.IDValue()), "to": fmt.Sprint(e.To.IDValue()), "points": e.Points})
			}
			serialized, err := graphjson.Serialize(context.Background(), result)
			if err != nil {
				t.Fatal(err)
			}
			if variant >= 6 && variant < 10 {
				offset := int64(1)
				if variant >= 8 {
					offset = 3
				}
				if _, ok := serialized.Clusters[nodes[0].IDValue()+offset]; !ok {
					t.Fatalf("variant %d seed %d: expected a cluster ID collision with node %d", variant, seed, nodes[0].IDValue())
				}
			}
			if variant >= 10 {
				if _, ok := serialized.Sequences[nodes[0].IDValue()+3]; !ok {
					t.Fatalf("variant %d seed %d: expected a sequence ID collision with node %d", variant, seed, nodes[0].IDValue())
				}
			}
			ids := func(values []int64) []string {
				result := make([]string, 0, len(values))
				for _, value := range values {
					result = append(result, fmt.Sprint(value))
				}
				return result
			}
			containers, hubs, clusters, sequences := map[string][]string{}, map[string][]string{}, map[string][]string{}, map[string][]string{}
			for id, children := range serialized.Containers {
				containers[fmt.Sprint(id)] = ids(children)
			}
			for id, spokes := range serialized.Hubs {
				hubs[fmt.Sprint(id)] = ids(spokes)
			}
			for id, cluster := range serialized.Clusters {
				clusters[fmt.Sprint(id)] = ids(cluster.Nodes)
			}
			for id, sequence := range serialized.Sequences {
				sequences[fmt.Sprint(id)] = ids(sequence.Nodes)
			}
			fixtures = append(fixtures, map[string]any{"name": fmt.Sprintf("wide-%d-%d", variant, seed), "seed": fmt.Sprint(seed), "nodes": inputNodes, "edges": inputEdges, "expectedNodes": outNodes, "expectedEdges": outEdges, "structure": map[string]any{"containers": containers, "hubs": hubs, "clusters": clusters, "sequences": sequences}})
		}
	}
	data, err := json.MarshalIndent(fixtures, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
