// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"github.com/d2lang/d2/d2graph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2target"
	"github.com/d2lang/d2/lib/geo"
)

type orderingNode struct {
	ID          string  `json:"id"`
	Width       float64 `json:"width"`
	Height      float64 `json:"height"`
	IsInvisible bool    `json:"isInvisible,omitempty"`
}
type orderingEdge struct {
	ID          string `json:"id"`
	From        string `json:"from"`
	To          string `json:"to"`
	D2Index     int    `json:"d2Index"`
	Label       string `json:"label"`
	LabelWidth  int    `json:"labelWidth"`
	LabelHeight int    `json:"labelHeight"`
}

func TestExportTypeScriptLayoutorderingFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTORDERING_FIXTURES")
	if path == "" {
		t.Skip("set TALA_LAYOUTORDERING_FIXTURES")
	}
	cases := []struct {
		name  string
		pairs [][2]int
	}{
		{"authored-order", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}, {0, 4}}},
		{"parallel-edge-indices", [][2]int{{0, 1}, {0, 1}, {1, 2}, {1, 2}, {2, 3}, {3, 4}, {4, 0}}},
	}
	names := []string{"zeta", "alpha", "node10", "node2", "middle"}
	indices := []int{0, 1, 0, 1, 0, 0, 0}
	dirs := map[string]string{"TB": "down", "BT": "up", "LR": "right", "RL": "left"}
	fixtures := []any{}
	for _, test := range cases {
		for _, direction := range []string{"TB", "BT", "LR", "RL"} {
			g := d2graph.NewGraph()
			g.Root.Direction.Value = dirs[direction]
			nodes := []orderingNode{}
			edges := []orderingEdge{}
			objects := map[string]*d2graph.Object{}
			for i, id := range names {
				input := orderingNode{ID: id, Width: float64(60 + i*10), Height: float64(30 + i*5), IsInvisible: i%2 == 1}
				obj := &d2graph.Object{Graph: g, Parent: g.Root, ID: id, IDVal: id, Box: geo.NewBox(geo.NewPoint(0, 0), input.Width, input.Height), Children: make(map[string]*d2graph.Object), Attributes: d2graph.Attributes{}}
				if input.IsInvisible {
					obj.Style.Opacity = &d2graph.Scalar{Value: "0"}
				}
				g.Root.Children[id] = obj
				g.Root.ChildrenArray = append(g.Root.ChildrenArray, obj)
				g.Objects = append(g.Objects, obj)
				objects[id] = obj
				nodes = append(nodes, input)
			}
			for i, pair := range test.pairs {
				input := orderingEdge{ID: fmt.Sprintf("edge%d", 20-i), From: names[pair[0]], To: names[pair[1]], D2Index: indices[i], Label: "link", LabelWidth: 30, LabelHeight: 12}
				edge := &d2graph.Edge{Index: input.D2Index, Src: objects[input.From], Dst: objects[input.To], DstArrow: true, Attributes: d2graph.Attributes{}}
				edge.Label.Value = input.Label
				edge.LabelDimensions = *d2target.NewTextDimensions(input.LabelWidth, input.LabelHeight)
				g.Edges = append(g.Edges, edge)
				edges = append(edges, input)
			}
			opts := DefaultOptions()
			opts.Seeds = []int64{1, 2, 3}
			if err := Layout(context.Background(), g, &opts); err != nil {
				t.Fatalf("%s %s: %v", test.name, direction, err)
			}
			internal := layoutgraph.NewGraph()
			bindings, err := translateGraph(context.Background(), g, internal, true)
			if err != nil {
				t.Fatal(err)
			}
			internalEdges := map[layoutgraph.EntityID]*layoutgraph.Edge{}
			for _, edge := range internal.Edges {
				internalEdges[edge.ID] = edge
			}
			outNodes := []map[string]any{}
			for _, input := range nodes {
				obj := objects[input.ID]
				outNodes = append(outNodes, map[string]any{"id": input.ID, "x": obj.TopLeft.X + obj.Width/2, "y": obj.TopLeft.Y + obj.Height/2, "width": obj.Width, "height": obj.Height})
			}
			outEdges := []map[string]any{}
			for i, edge := range g.Edges {
				points := []map[string]float64{}
				for _, p := range edge.Route {
					points = append(points, map[string]float64{"x": p.X, "y": p.Y})
				}
				record := map[string]any{"id": edges[i].ID, "points": points, "isCurve": edge.IsCurve}
				if edge.LabelPosition != nil {
					record["labelPosition"] = *edge.LabelPosition
					record["labelPercentage"] = *edge.LabelPercentage
				}
				if e := internalEdges[bindings.edgeIDs[edge]]; e.Label != nil {
					p := e.LabelTopLeft(e.Label.Position, e.Label.Width, e.Label.Height)
					record["labelX"] = p.X + e.Label.Width/2
					record["labelY"] = p.Y + e.Label.Height/2
				}
				outEdges = append(outEdges, record)
			}
			fixtures = append(fixtures, map[string]any{"name": test.name + "-" + direction, "nodes": nodes, "edges": edges, "options": map[string]any{"direction": direction, "seeds": []int{1, 2, 3}, "inputOrder": "authored"}, "expected": map[string]any{"nodes": outNodes, "edges": outEdges}})
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
