// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2graph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2target"
	"github.com/d2lang/d2/lib/geo"
	"net/url"
	"os"
	"strconv"
	"testing"
)

type nativeNodeInput struct {
	ID            string     `json:"id"`
	Width         float64    `json:"width"`
	Height        float64    `json:"height"`
	ParentID      string     `json:"parentId,omitempty"`
	IsGroup       bool       `json:"isGroup,omitempty"`
	Shape         string     `json:"shape,omitempty"`
	LabelWidth    int        `json:"labelWidth,omitempty"`
	LabelHeight   int        `json:"labelHeight,omitempty"`
	Label         string     `json:"label,omitempty"`
	LabelPosition string     `json:"labelPosition,omitempty"`
	Icon          string     `json:"icon,omitempty"`
	IconPosition  string     `json:"iconPosition,omitempty"`
	FontSize      int        `json:"fontSize,omitempty"`
	FixedPosition *geo.Point `json:"fixedPosition,omitempty"`
	FixedSize     bool       `json:"fixedSize,omitempty"`
	Is3D          bool       `json:"is3D,omitempty"`
	IsMultiple    bool       `json:"isMultiple,omitempty"`
}
type nativeEdgeInput struct {
	D2Index         int    `json:"d2Index"`
	ID              string `json:"id"`
	From            string `json:"from"`
	To              string `json:"to"`
	LabelWidth      int    `json:"labelWidth,omitempty"`
	LabelHeight     int    `json:"labelHeight,omitempty"`
	SourceArrowhead string `json:"sourceArrowhead,omitempty"`
	TargetArrowhead string `json:"targetArrowhead,omitempty"`
}

func TestExportTypeScriptLayoutnodeoptionsFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTNODEOPTIONS_FIXTURES")
	if path == "" {
		t.Skip("set TALA_LAYOUTNODEOPTIONS_FIXTURES")
	}
	fixtures := []any{}
	cases := []struct {
		name  string
		count int
		pairs [][2]int
	}{
		{"icons", 4, [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}}},
		{"fixed", 4, [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}}},
		{"fixedlabels", 4, [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}}},
		{"fixedsizes", 4, [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}}},
		{"modifiers", 4, [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}}},
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
				if test.name == "shapes" {
					input.Shape = []string{"diamond", "oval", "circle", "hexagon", "cylinder"}[i]
					obj.Shape.Value = input.Shape
				}
				if test.name == "nodelabels" || test.name == "nested" {
					input.LabelWidth = 30 + i*3
					input.LabelHeight = 15 + i
					obj.Label.Value = "label"
					obj.LabelDimensions = *d2target.NewTextDimensions(input.LabelWidth, input.LabelHeight)
				}
				if test.name == "icons" || test.name == "fixedlabels" || test.name == "modifiers" {
					input.Label = "node"
					input.LabelWidth = 30 + i*3
					input.LabelHeight = 15 + i
					obj.Label.Value = input.Label
					obj.LabelDimensions = *d2target.NewTextDimensions(input.LabelWidth, input.LabelHeight)
				}
				if test.name == "icons" {
					input.Icon = "https://example.com/icon.svg"
					obj.Icon, _ = url.Parse(input.Icon)
					if i%2 == 0 {
						input.IconPosition = "INSIDE_TOP_LEFT"
						obj.IconPosition = &input.IconPosition
					}
				}
				if test.name == "fixedlabels" {
					input.LabelPosition = "OUTSIDE_TOP_CENTER"
					obj.LabelPosition = &input.LabelPosition
					input.FontSize = 24
					obj.Style.FontSize = &d2graph.Scalar{Value: "24"}
				}
				if test.name == "fixed" {
					input.FixedPosition = geo.NewPoint(float64(i*400), float64((i%2)*200))
					obj.Left = &d2graph.Scalar{Value: fmt.Sprint(int(input.FixedPosition.X))}
					obj.Top = &d2graph.Scalar{Value: fmt.Sprint(int(input.FixedPosition.Y))}
				}
				if test.name == "fixedsizes" {
					input.FixedSize = true
					obj.WidthAttr = &d2graph.Scalar{Value: fmt.Sprint(int(input.Width))}
					obj.HeightAttr = &d2graph.Scalar{Value: fmt.Sprint(int(input.Height))}
				}
				if test.name == "modifiers" {
					if i%2 == 0 {
						input.Is3D = true
						obj.Style.ThreeDee = &d2graph.Scalar{Value: "true"}
					} else {
						input.IsMultiple = true
						obj.Style.Multiple = &d2graph.Scalar{Value: "true"}
					}
				}
				parent.Children[id] = obj
				parent.ChildrenArray = append(parent.ChildrenArray, obj)
				g.Objects = append(g.Objects, obj)
				objects[id] = obj
				nodes = append(nodes, input)
			}
			for i, pair := range test.pairs {
				input := nativeEdgeInput{D2Index: i, ID: fmt.Sprintf("e%d", i), From: fmt.Sprintf("n%d", pair[0]), To: fmt.Sprintf("n%d", pair[1])}
				edge := &d2graph.Edge{Index: i, Src: objects[input.From], Dst: objects[input.To], DstArrow: true, Attributes: d2graph.Attributes{}}
				if test.name == "arrows" {
					switch i % 4 {
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
					default:
						input.SourceArrowhead = "none"
						input.TargetArrowhead = "triangle"
					}
				}
				if test.name == "arrows" || test.name == "shapes" {
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
			internal := layoutgraph.NewGraph()
			bindings, err := translateGraph(context.Background(), g, internal, true)
			if err != nil {
				t.Fatal(err)
			}
			internalNodes := map[layoutgraph.EntityID]*layoutgraph.Node{}
			for _, node := range internal.Nodes {
				internalNodes[node.ID] = node
			}
			internalEdges := map[layoutgraph.EntityID]*layoutgraph.Edge{}
			for _, edge := range internal.Edges {
				internalEdges[edge.ID] = edge
			}
			outNodes := []map[string]any{}
			outEdges := []map[string]any{}
			for _, input := range nodes {
				obj := objects[input.ID]
				record := map[string]any{"id": input.ID, "x": obj.TopLeft.X + obj.Width/2, "y": obj.TopLeft.Y + obj.Height/2, "width": obj.Width, "height": obj.Height}
				if obj.Style.FontSize != nil {
					v, err := strconv.Atoi(obj.Style.FontSize.Value)
					if err != nil {
						t.Fatal(err)
					}
					record["fontSize"] = v
				}
				if obj.IconPosition != nil {
					record["iconPosition"] = *obj.IconPosition
				}
				if obj.LabelPosition != nil {
					record["labelPosition"] = *obj.LabelPosition
					record["labelWidth"] = obj.LabelDimensions.Width
					record["labelHeight"] = obj.LabelDimensions.Height
				}
				if n := internalNodes[bindings.objectIDs[obj]]; n.Label != nil {
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
