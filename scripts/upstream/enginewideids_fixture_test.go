// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
)

func TestExportTypeScriptEnginewideidsFixtures(t *testing.T) {
	path := os.Getenv("TALA_ENGINEWIDEIDS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	fixtures := []any{}
	for variant := 0; variant < 4; variant++ {
		for _, seed := range []int64{1, 123} {
			graph := layoutgraph.NewGraph()
			nodes := []*layoutgraph.Node{}
			inputNodes := []any{}
			inputEdges := []any{}
			for i := 0; i < 9; i++ {
				id := int64(1<<60) + int64(i*101+1)
				if i%2 == 1 {
					id = -int64(1<<60) + int64(i*103+1)
				}
				n := layoutgraph.NewNode(id, float64(40+i*5), float64(30+(i%4)*8))
				var parent *layoutgraph.Node
				if variant >= 2 {
					switch i {
					case 1, 2, 3:
						parent = nodes[0]
					case 4, 5:
						parent = nodes[3]
					}
				}
				graph.AddNewNodeToContainer(parent, n)
				nodes = append(nodes, n)
				record := map[string]any{"id": fmt.Sprint(id), "width": n.Width, "height": n.Height}
				if parent != nil {
					record["parent"] = fmt.Sprint(parent.IDValue())
				}
				inputNodes = append(inputNodes, record)
			}
			for i := 0; i < 9; i++ {
				for _, shift := range []int{1, 3} {
					from, to := nodes[i], nodes[(i+shift)%len(nodes)]
					e := graph.Connect(from, to)
					e.ID = math.MaxInt64 - int64(len(graph.Edges)*7)
					if variant%2 == 1 && i%3 == 0 {
						e.ID = 0
					}
					e.TargetArrowhead = "triangle"
					inputEdges = append(inputEdges, map[string]any{"id": fmt.Sprint(e.ID), "from": fmt.Sprint(from.IDValue()), "to": fmt.Sprint(to.IDValue())})
				}
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
			fixtures = append(fixtures, map[string]any{"name": fmt.Sprintf("wide-%d-%d", variant, seed), "seed": fmt.Sprint(seed), "nodes": inputNodes, "edges": inputEdges, "expectedNodes": outNodes, "expectedEdges": outEdges})
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
