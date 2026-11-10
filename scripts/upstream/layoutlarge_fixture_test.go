// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2graph"
	"github.com/d2lang/d2/d2target"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

type nativeNodeInput struct {
	ID       string  `json:"id"`
	Width    float64 `json:"width"`
	Height   float64 `json:"height"`
	ParentID string  `json:"parentId,omitempty"`
	IsGroup  bool    `json:"isGroup,omitempty"`
}
type nativeEdgeInput struct {
	D2Index     int    `json:"d2Index"`
	ID          string `json:"id"`
	From        string `json:"from"`
	To          string `json:"to"`
	LabelWidth  int    `json:"labelWidth,omitempty"`
	LabelHeight int    `json:"labelHeight,omitempty"`
}

func TestExportTypeScriptLayoutlargeFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTLARGE_FIXTURES")
	if path == "" {
		t.Skip("set TALA_LAYOUTLARGE_FIXTURES")
	}
	fixtures := []any{}
	cases := []struct {
		name  string
		count int
		pairs [][2]int
	}{
		{"large-layered", 8, [][2]int{{0, 2}, {0, 3}, {0, 4}, {1, 2}, {1, 3}, {1, 4}, {2, 5}, {2, 6}, {3, 5}, {3, 6}, {4, 5}, {4, 6}, {5, 7}, {6, 7}}},
		{"twelve", 12, [][2]int{{0, 2}, {0, 3}, {1, 3}, {1, 4}, {2, 5}, {3, 5}, {3, 6}, {4, 6}, {5, 7}, {5, 8}, {6, 8}, {6, 9}, {7, 10}, {8, 10}, {8, 11}, {9, 11}}},
		{"large-cyclic", 8, [][2]int{{0, 1}, {1, 2}, {2, 3}, {3, 0}, {1, 4}, {4, 5}, {5, 2}, {3, 6}, {6, 7}, {7, 4}, {0, 5}, {2, 6}, {5, 7}, {7, 7}}},
	}
	for _, test := range cases {
		for _, direction := range []string{"TB", "BT", "LR", "RL"} {
			g := d2graph.NewGraph()
			dirs := map[string]string{"TB": "down", "BT": "up", "LR": "right", "RL": "left"}
			g.Root.Direction.Value = dirs[direction]
			nodes := []nativeNodeInput{}
			edges := []nativeEdgeInput{}
			objects := map[string]*d2graph.Object{}
			for i := 0; i < test.count; i++ {
				id := fmt.Sprintf("n%d", i)
				input := nativeNodeInput{ID: id, Width: float64(60 + i*10), Height: float64(30 + i*5)}
				parent := g.Root
				if test.name == "nested" {
					if i < 2 {
						input.IsGroup = true
					}
					if i == 1 || i == 4 {
						input.ParentID = "n0"
					}
					if i == 2 || i == 3 {
						input.ParentID = "n1"
					}
					if input.ParentID != "" {
						parent = objects[input.ParentID]
					}
				}
				obj := &d2graph.Object{Graph: g, Parent: parent, ID: id, IDVal: id, Box: geo.NewBox(geo.NewPoint(0, 0), input.Width, input.Height), Children: make(map[string]*d2graph.Object), Attributes: d2graph.Attributes{}}
				parent.Children[id] = obj
				parent.ChildrenArray = append(parent.ChildrenArray, obj)
				g.Objects = append(g.Objects, obj)
				objects[id] = obj
				nodes = append(nodes, input)
			}
			for i, pair := range test.pairs {
				input := nativeEdgeInput{D2Index: i, ID: fmt.Sprintf("e%d", i), From: fmt.Sprintf("n%d", pair[0]), To: fmt.Sprintf("n%d", pair[1])}
				edge := &d2graph.Edge{Index: i, Src: objects[input.From], Dst: objects[input.To], DstArrow: true, Attributes: d2graph.Attributes{}}
				if test.name == "labelled" || test.name == "multiedges" {
					input.LabelWidth = 40
					input.LabelHeight = 20
					edge.Label.Value = "label"
					edge.LabelDimensions = *d2target.NewTextDimensions(40, 20)
				}
				g.Edges = append(g.Edges, edge)
				edges = append(edges, input)
			}
			opts := DefaultOptions()
			opts.Seeds = []int64{1, 2, 3}
			if err := Layout(context.Background(), g, &opts); err != nil {
				t.Fatalf("%s %s: %v", test.name, direction, err)
			}
			outNodes := []map[string]any{}
			outEdges := []map[string]any{}
			for _, input := range nodes {
				obj := objects[input.ID]
				outNodes = append(outNodes, map[string]any{"id": input.ID, "x": obj.TopLeft.X + obj.Width/2, "y": obj.TopLeft.Y + obj.Height/2, "width": obj.Width, "height": obj.Height})
			}
			for i, edge := range g.Edges {
				points := []map[string]float64{}
				for _, p := range edge.Route {
					points = append(points, map[string]float64{"x": p.X, "y": p.Y})
				}
				outEdges = append(outEdges, map[string]any{"id": edges[i].ID, "points": points})
			}
			fixtures = append(fixtures, map[string]any{"name": test.name + "-" + direction, "nodes": nodes, "edges": edges, "options": map[string]any{"direction": direction, "seeds": []int{1, 2, 3}}, "expected": map[string]any{"nodes": outNodes, "edges": outEdges}})
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
