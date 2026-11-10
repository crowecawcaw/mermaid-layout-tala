// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2ast"
	"github.com/d2lang/d2/d2graph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2target"
	"github.com/d2lang/d2/lib/geo"
	"math/rand"
	"os"
	"strconv"
	"testing"
)

type randomNodeInput struct {
	ParentID     string  `json:"parentId,omitempty"`
	IsGroup      bool    `json:"isGroup,omitempty"`
	IsInvisible  bool    `json:"isInvisible,omitempty"`
	IsGrid       bool    `json:"isGrid,omitempty"`
	HasClassData bool    `json:"hasClassData,omitempty"`
	NearID       string  `json:"nearId,omitempty"`
	ID           string  `json:"id"`
	Width        float64 `json:"width"`
	Height       float64 `json:"height"`
	Shape        string  `json:"shape,omitempty"`
	LabelWidth   int     `json:"labelWidth,omitempty"`
	LabelHeight  int     `json:"labelHeight,omitempty"`
}
type randomEdgeInput struct {
	D2Index         int    `json:"d2Index"`
	ID              string `json:"id"`
	From            string `json:"from"`
	To              string `json:"to"`
	LabelWidth      int    `json:"labelWidth,omitempty"`
	LabelHeight     int    `json:"labelHeight,omitempty"`
	SourceArrowhead string `json:"sourceArrowhead,omitempty"`
	TargetArrowhead string `json:"targetArrowhead,omitempty"`
}

func TestExportTypeScriptLayoutrandomextendedFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTRANDOMEXTENDED_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	rng := rand.New(rand.NewSource(842719))
	dirs := []string{"TB", "BT", "LR", "RL"}
	d2dirs := []string{"down", "up", "right", "left"}
	shapes := []string{"", "diamond", "oval", "hexagon", "cylinder", "square", "callout", "stored_data", "class", "sql_table", "text", "code", "TEXT", "SQL_TABLE"}
	for trial := 0; trial < 64; trial++ {
		g := d2graph.NewGraph()
		g.Root.Direction.Value = d2dirs[trial%4]
		if trial%5 == 0 {
			g.Root.Direction.Value = ""
		}
		g.RootLevel = trial % 3
		nodes := []randomNodeInput{}
		edges := []randomEdgeInput{}
		objects := []*d2graph.Object{}
		count := 4 + rng.Intn(5)
		for i := 0; i < count; i++ {
			id := fmt.Sprintf("n%d", count-1-i)
			input := randomNodeInput{ID: id, Width: float64(40 + rng.Intn(7)*10), Height: float64(30 + rng.Intn(7)*10)}
			obj := &d2graph.Object{Graph: g, Parent: g.Root, ID: id, IDVal: id, Box: geo.NewBox(geo.NewPoint(0, 0), input.Width, input.Height), Children: make(map[string]*d2graph.Object), Attributes: d2graph.Attributes{}}
			if trial >= 32 {
				if i < 2 {
					input.IsGroup = true
				} else if i%3 != 0 {
					obj.Parent = objects[i%2]
					input.ParentID = obj.Parent.ID
				}
			}
			input.Shape = shapes[rng.Intn(len(shapes))]
			obj.Shape.Value = input.Shape
			if trial%4 == 0 {
				input.LabelWidth = 20 + rng.Intn(5)*5
				input.LabelHeight = 10 + rng.Intn(3)*5
				obj.Label.Value = "label"
				obj.LabelDimensions = *d2target.NewTextDimensions(input.LabelWidth, input.LabelHeight)
			}
			if trial%7 == 0 && i == 1 {
				input.IsInvisible = true
				obj.Style.Opacity = &d2graph.Scalar{Value: "0"}
			}
			if trial%6 == 0 && i == 2 {
				input.IsGrid = true
				obj.GridRows = &d2graph.Scalar{Value: "2"}
			}
			if input.Shape == "class" && trial%2 == 0 {
				input.HasClassData = true
				obj.Class = &d2target.Class{}
			}
			if trial < 32 && trial%4 == 3 && i == count-1 {
				input.NearID = objects[0].ID
				obj.NearKey = d2ast.MakeKeyPath([]string{input.NearID})
			}
			obj.Parent.Children[id] = obj
			obj.Parent.ChildrenArray = append(obj.Parent.ChildrenArray, obj)
			g.Objects = append(g.Objects, obj)
			objects = append(objects, obj)
			nodes = append(nodes, input)
		}
		edgeCount := 3 + rng.Intn(9)
		for i := 0; i < edgeCount; i++ {
			from, to := rng.Intn(count), rng.Intn(count)
			input := randomEdgeInput{D2Index: i, ID: fmt.Sprintf("e%d", i), From: objects[from].ID, To: objects[to].ID}
			edge := &d2graph.Edge{Index: i, Src: objects[from], Dst: objects[to], DstArrow: true, Attributes: d2graph.Attributes{}}
			if trial%4 == 1 {
				input.LabelWidth = 20 + rng.Intn(4)*10
				input.LabelHeight = 10 + rng.Intn(3)*5
				edge.Label.Value = "label"
				edge.LabelDimensions = *d2target.NewTextDimensions(input.LabelWidth, input.LabelHeight)
			}
			if trial%4 == 2 {
				switch i % 3 {
				case 0:
					edge.SrcArrow = true
					edge.DstArrow = false
					input.SourceArrowhead = "triangle"
					input.TargetArrowhead = "none"
				case 1:
					edge.SrcArrow = true
					input.SourceArrowhead = "triangle"
					input.TargetArrowhead = "triangle"
				case 2:
					edge.DstArrow = false
					input.SourceArrowhead = "none"
					input.TargetArrowhead = "none"
				}
			}
			g.Edges = append(g.Edges, edge)
			edges = append(edges, input)
		}
		opts := DefaultOptions()
		opts.Seeds = []int64{1, 2, 3}
		if err := Layout(context.Background(), g, &opts); err != nil {
			t.Fatalf("trial %d: %v", trial, err)
		}
		internal := layoutgraph.NewGraph()
		bindings, err := translateGraph(context.Background(), g, internal, true)
		if err != nil {
			t.Fatal(err)
		}
		byNode := map[layoutgraph.EntityID]*layoutgraph.Node{}
		byEdge := map[layoutgraph.EntityID]*layoutgraph.Edge{}
		for _, n := range internal.Nodes {
			byNode[n.ID] = n
		}
		for _, e := range internal.Edges {
			byEdge[e.ID] = e
		}
		outNodes := []map[string]any{}
		outEdges := []map[string]any{}
		for i, input := range nodes {
			obj := objects[i]
			record := map[string]any{"id": input.ID, "x": obj.TopLeft.X + obj.Width/2, "y": obj.TopLeft.Y + obj.Height/2, "width": obj.Width, "height": obj.Height, "hasLabel": byNode[bindings.objectIDs[obj]].Label != nil}
			if obj.Style.FontSize != nil {
				size, e := strconv.Atoi(obj.Style.FontSize.Value)
				if e != nil {
					t.Fatal(e)
				}
				record["fontSize"] = size
			}
			if n := byNode[bindings.objectIDs[obj]]; n.Label != nil {
				p := n.LabelTopLeft(n.Label.Position, n.Label.Width, n.Label.Height)
				record["labelX"] = p.X + n.Label.Width/2
				record["labelY"] = p.Y + n.Label.Height/2
			}
			outNodes = append(outNodes, record)
		}
		for i, edge := range g.Edges {
			points := []map[string]float64{}
			for _, p := range edge.Route {
				points = append(points, map[string]float64{"x": p.X, "y": p.Y})
			}
			record := map[string]any{"id": edges[i].ID, "points": points, "hasLabel": byEdge[bindings.edgeIDs[edge]].Label != nil}
			if e := byEdge[bindings.edgeIDs[edge]]; e.Label != nil {
				p := e.LabelTopLeft(e.Label.Position, e.Label.Width, e.Label.Height)
				record["labelX"] = p.X + e.Label.Width/2
				record["labelY"] = p.Y + e.Label.Height/2
			}
			outEdges = append(outEdges, record)
		}
		options := map[string]any{"direction": dirs[trial%4], "seeds": []int{1, 2, 3}, "rootLevel": trial % 3}
		if trial%5 == 0 {
			delete(options, "direction")
		}
		out = append(out, map[string]any{"name": fmt.Sprintf("extended-random-%02d-%s", trial, dirs[trial%4]), "nodes": nodes, "edges": edges, "options": options, "expected": map[string]any{"nodes": outNodes, "edges": outEdges}})
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
