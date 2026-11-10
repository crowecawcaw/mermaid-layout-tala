// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/d2lang/d2/d2ast"
	"github.com/d2lang/d2/d2graph"
	"github.com/d2lang/d2/d2layouts/d2sequence"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/labeling"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2target"
	"github.com/d2lang/d2/lib/geo"
)

type orderingNode struct {
	ID           string            `json:"id"`
	Width        float64           `json:"width"`
	Height       float64           `json:"height"`
	IsInvisible  bool              `json:"isInvisible,omitempty"`
	IsGroup      bool              `json:"isGroup,omitempty"`
	ParentID     string            `json:"parentId,omitempty"`
	Shape        string            `json:"shape,omitempty"`
	Label        string            `json:"label"`
	LabelWidth   int               `json:"labelWidth,omitempty"`
	LabelHeight  int               `json:"labelHeight,omitempty"`
	Style        map[string]string `json:"style,omitempty"`
	NearID       string            `json:"nearId,omitempty"`
	HasClassData bool              `json:"hasClassData,omitempty"`
}
type orderingEdge struct {
	ID                    string              `json:"id"`
	From                  string              `json:"from"`
	To                    string              `json:"to"`
	D2Index               *int                `json:"d2Index,omitempty"`
	Label                 string              `json:"label"`
	LabelWidth            int                 `json:"labelWidth"`
	LabelHeight           int                 `json:"labelHeight"`
	SourceArrow           *bool               `json:"sourceArrow,omitempty"`
	TargetArrow           *bool               `json:"targetArrow,omitempty"`
	SourceArrowhead       string              `json:"sourceArrowhead,omitempty"`
	TargetArrowhead       string              `json:"targetArrowhead,omitempty"`
	SourceArrowheadFilled *bool               `json:"sourceArrowheadFilled,omitempty"`
	TargetArrowheadFilled *bool               `json:"targetArrowheadFilled,omitempty"`
	SourceArrowheadLabel  *orderingArrowLabel `json:"sourceArrowheadLabel,omitempty"`
	TargetArrowheadLabel  *orderingArrowLabel `json:"targetArrowheadLabel,omitempty"`
}
type orderingArrowLabel struct {
	Text   string `json:"text"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

func TestExportTypeScriptLayoutorderingFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTORDERING_FIXTURES")
	if path == "" {
		t.Skip("set TALA_LAYOUTORDERING_FIXTURES")
	}
	cases := []struct {
		name     string
		pairs    [][2]int
		nested   bool
		shapeSet int
	}{
		{"authored-order", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}, {0, 4}}, false, 0},
		{"parallel-edge-indices", [][2]int{{0, 1}, {0, 1}, {1, 2}, {1, 2}, {2, 3}, {3, 4}, {4, 0}}, false, 0},
		{"dotted-ids", [][2]int{{2, 3}, {2, 4}, {4, 3}}, true, 0},
		{"unicode-fold", [][2]int{{2, 3}, {2, 4}, {4, 3}}, true, 0},
		{"d2-shapes", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 1},
		{"d2-shapes-extra", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 2},
		{"font-defaults", [][2]int{{1, 2}, {1, 3}, {2, 4}}, false, 3},
		{"node-visibility-styles", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 4},
		{"arrow-flags-and-fill", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 5},
		{"arrow-label-default", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 6},
		{"tiny-empty-groups", [][2]int{}, false, 7},
		{"embedded-and-empty-labels", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 8},
		{"inferred-edge-indices", [][2]int{{0, 1}, {0, 1}, {1, 0}, {1, 0}, {2, 3}, {0, 1}}, false, 9},
		{"sequence-lifelines", [][2]int{{0, 1}, {1, 2}, {3, 4}}, false, 10},
		{"near-constants", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 11},
		{"near-constant-shadow", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 12},
		{"class-metadata", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 13},
	}
	indices := []int{0, 1, 0, 1, 0, 0, 0}
	dirs := map[string]string{"TB": "down", "BT": "up", "LR": "right", "RL": "left"}
	fixtures := []any{}
	for _, test := range cases {
		names := []string{"zeta", "alpha", "node10", "node2", "middle"}
		if test.nested {
			names = []string{"g.h", "g", "one", "two", "solo"}
		}
		if test.name == "unicode-fold" {
			names = []string{"Σ", "ς", "one", "two", "solo"}
		}
		if test.shapeSet == 12 {
			names[0] = "top-left"
		}
		for _, direction := range []string{"TB", "BT", "LR", "RL"} {
			g := d2graph.NewGraph()
			g.Root.Direction.Value = dirs[direction]
			nodes := []orderingNode{}
			edges := []orderingEdge{}
			objects := map[string]*d2graph.Object{}
			for i, id := range names {
				input := orderingNode{ID: id, Width: float64(60 + i*10), Height: float64(30 + i*5), IsInvisible: i%2 == 1}
				if test.shapeSet == 7 {
					input.IsGroup = i%2 == 0
					input.Width = 1
					input.Height = 1
					input.IsInvisible = false
				}
				if test.shapeSet == 8 {
					input.Shape = []string{"text", "class", "sql_table", "code", "rectangle"}[i]
					input.Label, input.LabelWidth, input.LabelHeight = "content", 40, 12
					if i == 4 {
						input.Label = ""
					}
				}
				if test.shapeSet == 11 && i == 0 {
					input.NearID = "top-left"
				}
				if test.shapeSet == 11 && i == 1 {
					input.NearID = "bottom-right"
				}
				if test.shapeSet == 12 && i == 2 {
					input.NearID = "top-left"
				}
				if test.shapeSet == 13 {
					input.Shape = "class"
					input.HasClassData = i%2 == 0
					input.Label = "class"
					input.LabelWidth = 40
					input.LabelHeight = 12
				}
				if test.shapeSet == 1 {
					input.Shape = []string{"square", "callout", "stored_data", "c4-person", "class"}[i]
				}
				if test.shapeSet == 2 {
					input.Shape = []string{"text", "code", "sequence_diagram", "document", "page"}[i]
				}
				if test.shapeSet == 3 {
					input.Shape = []string{"text", "rectangle", "sql_table", "class", "text"}[i]
					input.Label, input.LabelWidth, input.LabelHeight = "title", 40, 12
				}
				if test.shapeSet == 4 {
					input.IsInvisible = false
					styles := []map[string]string{{"opacity": "0"}, {"fill": "transparent", "stroke": "transparent"}, {"fill": "transparent", "strokeWidth": "0"}, {"fill": "transparent", "stroke": "transparent"}, {"opacity": "1"}}
					input.Style = styles[i]
					if i == 3 {
						input.Label, input.LabelWidth, input.LabelHeight = "visible", 30, 12
					}
				}
				parent := g.Root
				if test.shapeSet == 3 {
					input.IsGroup = i == 0
					if i == 1 {
						input.ParentID = names[0]
						parent = objects[input.ParentID]
					}
				}
				if test.nested {
					input.IsGroup = i < 2
					if i == 2 || i == 3 {
						input.ParentID = names[i-2]
						parent = objects[input.ParentID]
					}
				}
				obj := &d2graph.Object{Graph: g, Parent: parent, ID: id, IDVal: id, Box: geo.NewBox(geo.NewPoint(0, 0), input.Width, input.Height), Children: make(map[string]*d2graph.Object), Attributes: d2graph.Attributes{}}
				obj.Shape.Value = input.Shape
				if input.HasClassData {
					obj.Class = &d2target.Class{}
				}
				obj.Label.Value = input.Label
				obj.LabelDimensions = *d2target.NewTextDimensions(input.LabelWidth, input.LabelHeight)
				if input.NearID != "" {
					obj.NearKey = d2ast.MakeKeyPath([]string{input.NearID})
				}
				if input.IsInvisible {
					obj.Style.Opacity = &d2graph.Scalar{Value: "0"}
				}
				if v, ok := input.Style["opacity"]; ok {
					obj.Style.Opacity = &d2graph.Scalar{Value: v}
				}
				if v, ok := input.Style["fill"]; ok {
					obj.Style.Fill = &d2graph.Scalar{Value: v}
				}
				if v, ok := input.Style["stroke"]; ok {
					obj.Style.Stroke = &d2graph.Scalar{Value: v}
				}
				if v, ok := input.Style["strokeWidth"]; ok {
					obj.Style.StrokeWidth = &d2graph.Scalar{Value: v}
				}
				parent.Children[strings.ToLower(id)] = obj
				parent.ChildrenArray = append(parent.ChildrenArray, obj)
				g.Objects = append(g.Objects, obj)
				objects[id] = obj
				nodes = append(nodes, input)
			}
			for i, pair := range test.pairs {
				index := indices[i]
				input := orderingEdge{ID: fmt.Sprintf("edge%d", 20-i), From: names[pair[0]], To: names[pair[1]], D2Index: &index, Label: "link", LabelWidth: 30, LabelHeight: 12}
				if test.shapeSet == 10 && i != 1 {
					input.To = d2sequence.LifelineEndID(input.From)
				}
				if test.shapeSet == 8 && i%2 == 0 {
					input.Label = ""
				}
				edge := &d2graph.Edge{Index: index, Src: objects[input.From], Dst: objects[input.To], DstArrow: true, Attributes: d2graph.Attributes{}}
				if test.shapeSet == 10 && i != 1 {
					src, dst := false, false
					input.SourceArrow, input.TargetArrow = &src, &dst
					edge.SrcArrow, edge.DstArrow = false, false
					edge.Dst = &d2graph.Object{ID: input.To}
				}
				if test.shapeSet == 9 {
					src := []bool{false, false, true, false, false, false}[i]
					dst := []bool{true, true, false, true, true, true}[i]
					input.SourceArrow, input.TargetArrow = &src, &dst
					edge.SrcArrow, edge.DstArrow = src, dst
					edge.Index = 0
					for _, previous := range g.Edges {
						if previous.IsEquivalent(edge.Src, edge.SrcArrow, edge.Dst, edge.DstArrow) {
							edge.Index++
						}
					}
					input.D2Index = nil
				}
				if test.shapeSet == 6 {
					src := []bool{false, false, true, true, false}[i]
					dst := []bool{true, true, false, false, false}[i]
					input.SourceArrow, input.TargetArrow = &src, &dst
					edge.SrcArrow, edge.DstArrow = src, dst
					if i == 0 || i == 2 || i == 4 {
						input.SourceArrowheadLabel = &orderingArrowLabel{Text: "src", Width: 24, Height: 12}
						edge.SrcArrowhead = &d2graph.Attributes{}
						edge.SrcArrowhead.Label.Value = "src"
						edge.SrcArrowhead.LabelDimensions = *d2target.NewTextDimensions(24, 12)
					} else {
						input.TargetArrowheadLabel = &orderingArrowLabel{Text: "dst", Width: 28, Height: 14}
						edge.DstArrowhead = &d2graph.Attributes{}
						edge.DstArrowhead.Label.Value = "dst"
						edge.DstArrowhead.LabelDimensions = *d2target.NewTextDimensions(28, 14)
					}
				}
				if test.shapeSet == 5 {
					src := []bool{true, false, true, false, true}[i]
					dst := []bool{false, true, true, false, false}[i]
					input.SourceArrow, input.TargetArrow = &src, &dst
					edge.SrcArrow, edge.DstArrow = src, dst
					input.SourceArrowhead = []string{"diamond", "", "box", "triangle", "triangle"}[i]
					input.TargetArrowhead = []string{"", "triangle", "circle", "", "diamond"}[i]
					srcFilled := []bool{true, false, true, true, false}[i]
					dstFilled := []bool{false, false, true, false, true}[i]
					if input.SourceArrowhead != "" {
						input.SourceArrowheadFilled = &srcFilled
						edge.SrcArrowhead = &d2graph.Attributes{}
						edge.SrcArrowhead.Shape.Value = input.SourceArrowhead
						edge.SrcArrowhead.Style.Filled = &d2graph.Scalar{Value: strconv.FormatBool(srcFilled)}
					}
					if input.TargetArrowhead != "" {
						input.TargetArrowheadFilled = &dstFilled
						edge.DstArrowhead = &d2graph.Attributes{}
						edge.DstArrowhead.Shape.Value = input.TargetArrowhead
						edge.DstArrowhead.Style.Filled = &d2graph.Scalar{Value: strconv.FormatBool(dstFilled)}
					}
				}
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
			internalNodes := map[layoutgraph.EntityID]*layoutgraph.Node{}
			for _, node := range internal.Nodes {
				internalNodes[node.ID] = node
			}
			for _, edge := range internal.Edges {
				internalEdges[edge.ID] = edge
			}
			outNodes := []map[string]any{}
			for _, input := range nodes {
				obj := objects[input.ID]
				record := map[string]any{"id": input.ID, "x": obj.TopLeft.X + obj.Width/2, "y": obj.TopLeft.Y + obj.Height/2, "width": obj.Width, "height": obj.Height}
				if test.shapeSet == 8 {
					record["hasLabel"] = internalNodes[bindings.objectIDs[obj]].Label != nil
				}
				if obj.Style.FontSize != nil {
					size, err := strconv.Atoi(obj.Style.FontSize.Value)
					if err != nil {
						t.Fatal(err)
					}
					record["fontSize"] = size
				}
				outNodes = append(outNodes, record)
			}
			outEdges := []map[string]any{}
			for i, edge := range g.Edges {
				points := []map[string]float64{}
				for _, p := range edge.Route {
					points = append(points, map[string]float64{"x": p.X, "y": p.Y})
				}
				record := map[string]any{"id": edges[i].ID, "points": points, "isCurve": edge.IsCurve}
				if test.shapeSet == 10 {
					record["to"] = edge.Dst.ID
				}
				if test.shapeSet == 8 {
					record["hasLabel"] = internalEdges[bindings.edgeIDs[edge]].Label != nil
				}
				if e := internalEdges[bindings.edgeIDs[edge]]; e != nil {
					reversed := edge.SrcArrow && !edge.DstArrow
					if p := labeling.PositionArrowheadLabel(e, reversed, e.Points); p != nil {
						record["sourceArrowheadLabelPosition"] = map[string]float64{"x": p.Box.TopLeft.X + p.Box.Width/2, "y": p.Box.TopLeft.Y + p.Box.Height/2}
					}
					if p := labeling.PositionArrowheadLabel(e, !reversed, e.Points); p != nil {
						record["targetArrowheadLabelPosition"] = map[string]float64{"x": p.Box.TopLeft.X + p.Box.Width/2, "y": p.Box.TopLeft.Y + p.Box.Height/2}
					}
				}
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
			options := map[string]any{"direction": direction, "seeds": []int{1, 2, 3}, "inputOrder": "authored"}
			if test.name == "authored-order" {
				delete(options, "inputOrder")
			}
			fixtures = append(fixtures, map[string]any{"name": test.name + "-" + direction, "nodes": nodes, "edges": edges, "options": options, "expected": map[string]any{"nodes": outNodes, "edges": outEdges}})
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
