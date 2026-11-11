// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
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
	ID            string            `json:"id"`
	D2ID          *string           `json:"d2Id,omitempty"`
	Width         float64           `json:"width"`
	Height        float64           `json:"height"`
	IsInvisible   bool              `json:"isInvisible,omitempty"`
	IsGroup       bool              `json:"isGroup,omitempty"`
	ParentID      string            `json:"parentId,omitempty"`
	Shape         string            `json:"shape,omitempty"`
	Label         string            `json:"label"`
	LabelWidth    int               `json:"labelWidth,omitempty"`
	LabelHeight   int               `json:"labelHeight,omitempty"`
	Style         map[string]string `json:"style,omitempty"`
	NearID        string            `json:"nearId,omitempty"`
	NearPath      []string          `json:"nearPath,omitempty"`
	Direction     string            `json:"direction,omitempty"`
	HasClassData  bool              `json:"hasClassData,omitempty"`
	IsGrid        bool              `json:"isGrid,omitempty"`
	Icon          *string           `json:"icon,omitempty"`
	DesiredWidth  *int              `json:"desiredWidth,omitempty"`
	DesiredHeight *int              `json:"desiredHeight,omitempty"`
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
	SourceArrowhead       *string             `json:"sourceArrowhead,omitempty"`
	TargetArrowhead       *string             `json:"targetArrowhead,omitempty"`
	SourceArrowheadFilled *bool               `json:"sourceArrowheadFilled,omitempty"`
	TargetArrowheadFilled *bool               `json:"targetArrowheadFilled,omitempty"`
	SourceArrowheadStyle  map[string]string   `json:"sourceArrowheadStyle,omitempty"`
	TargetArrowheadStyle  map[string]string   `json:"targetArrowheadStyle,omitempty"`
	Style                 map[string]string   `json:"style,omitempty"`
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
		{"unspecified-direction", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 14},
		{"unspecified-cycle", [][2]int{{0, 1}, {1, 2}, {2, 0}, {2, 3}, {3, 4}}, false, 14},
		{"unspecified-components", [][2]int{{0, 1}, {1, 2}, {3, 4}}, false, 14},
		{"unspecified-reverse", [][2]int{{4, 3}, {3, 2}, {2, 1}, {1, 0}}, false, 14},
		{"unspecified-dense", [][2]int{{0, 1}, {0, 2}, {0, 3}, {1, 3}, {1, 4}, {2, 4}, {3, 4}}, false, 14},
		{"sequence-container-font", [][2]int{{2, 3}, {2, 4}, {4, 3}}, false, 15},
		{"root-sequence-font", [][2]int{{2, 3}, {2, 4}, {4, 3}}, false, 16},
		{"nested-root-level", [][2]int{{2, 3}, {2, 4}, {4, 3}}, false, 17},
		{"grid-font", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 18},
		{"empty-icon-presence", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 19},
		{"negative-edge-indices", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 20},
		{"near-case-ascii", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 21},
		{"near-case-sigma", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 22},
		{"near-case-dotted-i", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 23},
		{"scoped-object-ids", [][2]int{{2, 3}, {2, 4}, {4, 3}, {3, 2}}, false, 24},
		{"scoped-lifelines", [][2]int{{0, 1}, {1, 2}, {3, 4}}, false, 25},
		{"empty-local-id", [][2]int{{2, 3}, {3, 4}}, false, 26},
		{"empty-arrowhead-shapes", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 27},
		{"independent-fixed-sizes", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 28},
		{"unicode-hash-collision", [][2]int{{0, 2}, {1, 2}, {2, 3}, {3, 4}, {4, 0}}, false, 29},
		{"node-style-metadata", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 30},
		{"nested-near-path", [][2]int{{2, 3}, {2, 4}, {4, 3}, {3, 2}}, false, 31},
		{"arrowhead-style-metadata", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 32},
		{"unicode-transparent-styles", [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}, {3, 4}}, false, 33},
		{"nested-container-directions", [][2]int{{2, 4}, {4, 5}, {5, 3}, {3, 6}}, false, 34},
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
		if test.shapeSet == 21 {
			names[0] = "Alpha"
			names[1] = "bravo"
		}
		if test.shapeSet == 22 {
			names[0] = "ΟΣ"
		}
		if test.shapeSet == 23 {
			names[0] = "İ"
		}
		if test.shapeSet == 24 || test.shapeSet == 31 {
			names = []string{"group-a", "group-b", "a-item", "b-item", "solo"}
		}
		if test.shapeSet == 34 {
			names = []string{"group-a", "group-b", "a-item", "b-item", "a-second", "a-third", "solo"}
		}
		if test.shapeSet == 26 {
			names = []string{"outer-api", "empty-api", "leaf-api", "other-api", "solo-api"}
		}
		if test.shapeSet == 29 {
			names = []string{"𐀀1ti7zkx", "\ue000zvtd6b", "one", "two", "three"}
		}
		if test.shapeSet == 15 || test.shapeSet == 16 || test.shapeSet == 17 {
			names = []string{"seq", "inner", "leaf", "other", "solo"}
		}
		directions := []string{"TB", "BT", "LR", "RL"}
		if test.shapeSet == 14 {
			directions = []string{"DEFAULT"}
		}
		for _, direction := range directions {
			g := d2graph.NewGraph()
			if test.shapeSet == 17 {
				g.RootLevel = 2
			}
			if test.shapeSet == 16 {
				g.Root.Shape.Value = "sequence_diagram"
			}
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
				if test.shapeSet == 21 && i == 2 {
					input.NearID = "aLPHa"
				}
				if test.shapeSet == 22 && i == 2 {
					input.NearID = "οσ"
				}
				if test.shapeSet == 23 && i == 2 {
					input.NearID = "i"
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
				if test.shapeSet == 33 {
					input.IsInvisible = false
					if i < 2 {
						input.Style = map[string]string{"fill": "tranſparent", "stroke": "TRANſPARENT"}
					}
				}
				if test.shapeSet == 15 || test.shapeSet == 16 || test.shapeSet == 17 {
					input.IsGroup = i < 2
					if i == 0 && test.shapeSet == 15 {
						input.Shape = "sequence_diagram"
					}
					if i < 2 {
						input.Label = "title"
						input.LabelWidth = 35
						input.LabelHeight = 12
					}
				}
				if test.shapeSet == 18 {
					input.IsGrid = i%2 == 0
				}
				if test.shapeSet == 19 {
					input.IsInvisible = false
					input.Style = map[string]string{"fill": "transparent", "stroke": "transparent"}
					if i%2 == 0 {
						icon := ""
						if i == 2 {
							icon = "https://example.com/icon.svg"
						}
						input.Icon = &icon
					}
				}
				if test.shapeSet == 24 || test.shapeSet == 31 || test.shapeSet == 34 {
					if test.shapeSet == 34 {
						input.IsInvisible = false
					}
					ids := []string{"left", "right", "item", "item", "solo"}
					if test.shapeSet == 34 {
						ids = []string{"left", "right", "item", "item", "second", "third", "solo"}
					}
					id := ids[i]
					input.D2ID = &id
					input.IsGroup = i < 2
					if i == 4 && test.shapeSet == 24 {
						input.NearID = "LEFT"
					}
					if i == 4 && test.shapeSet == 31 {
						input.NearPath = []string{"RIGHT", "ITEM"}
					}
					if test.shapeSet == 34 && i < 2 {
						input.Direction = []string{"LR", "BT"}[i]
					}
				}
				if test.shapeSet == 25 {
					id := []string{"actor", "beta", "gamma", "delta", "omega"}[i]
					input.D2ID = &id
				}
				if test.shapeSet == 28 {
					if i == 0 || i == 2 {
						width := 110 + i*10
						input.DesiredWidth = &width
					}
					if i == 1 || i == 2 {
						height := 80 + i*10
						input.DesiredHeight = &height
					}
				}
				if test.shapeSet == 30 {
					styles := []map[string]string{
						{"fontSize": "25", "threeDee": "true", "bold": "TRUE"},
						{"fontSize": "18", "multiple": "true", "italic": "1"},
						{"threeDee": "TRUE", "multiple": "1"},
						{"fontSize": "+22", "underline": "False"},
						{"shadow": "t", "filled": "0"},
					}
					input.Style = styles[i]
				}
				if test.shapeSet == 26 {
					id := []string{"outer", "", "leaf", "other", "solo"}[i]
					input.D2ID = &id
					input.IsGroup = i < 2
				}
				parent := g.Root
				if (test.shapeSet == 24 || test.shapeSet == 31 || test.shapeSet == 34) && (i == 2 || i == 3) {
					input.ParentID = names[i-2]
					parent = objects[input.ParentID]
				}
				if test.shapeSet == 34 && (i == 4 || i == 5) {
					input.ParentID = names[0]
					parent = objects[input.ParentID]
				}
				if test.shapeSet == 26 && (i == 1 || i == 2) {
					input.ParentID = names[i-1]
					parent = objects[input.ParentID]
				}
				if test.shapeSet == 15 || test.shapeSet == 16 || test.shapeSet == 17 {
					if i == 1 {
						input.ParentID = names[0]
						parent = objects[input.ParentID]
					}
					if i == 2 {
						input.ParentID = names[1]
						parent = objects[input.ParentID]
					}
					if i == 3 {
						input.ParentID = names[0]
						parent = objects[input.ParentID]
					}
				}
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
				d2ID := id
				if input.D2ID != nil {
					d2ID = *input.D2ID
				}
				obj := &d2graph.Object{Graph: g, Parent: parent, ID: d2ID, IDVal: d2ID, Box: geo.NewBox(geo.NewPoint(0, 0), input.Width, input.Height), Children: make(map[string]*d2graph.Object), Attributes: d2graph.Attributes{}}
				obj.Shape.Value = input.Shape
				if input.Direction != "" {
					obj.Direction.Value = dirs[input.Direction]
				}
				if input.DesiredWidth != nil {
					obj.WidthAttr = &d2graph.Scalar{Value: strconv.Itoa(*input.DesiredWidth)}
				}
				if input.DesiredHeight != nil {
					obj.HeightAttr = &d2graph.Scalar{Value: strconv.Itoa(*input.DesiredHeight)}
				}
				if input.Icon != nil {
					var err error
					obj.Icon, err = url.Parse(*input.Icon)
					if err != nil {
						t.Fatal(err)
					}
				}
				if input.IsGrid {
					obj.GridRows = &d2graph.Scalar{Value: "2"}
				}
				if input.HasClassData {
					obj.Class = &d2target.Class{}
				}
				obj.Label.Value = input.Label
				obj.LabelDimensions = *d2target.NewTextDimensions(input.LabelWidth, input.LabelHeight)
				if input.NearID != "" {
					obj.NearKey = d2ast.MakeKeyPath([]string{input.NearID})
				}
				if len(input.NearPath) != 0 {
					obj.NearKey = d2ast.MakeKeyPath(input.NearPath)
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
				if v, ok := input.Style["fontSize"]; ok {
					obj.Style.FontSize = &d2graph.Scalar{Value: v}
				}
				if v, ok := input.Style["threeDee"]; ok {
					obj.Style.ThreeDee = &d2graph.Scalar{Value: v}
				}
				if v, ok := input.Style["multiple"]; ok {
					obj.Style.Multiple = &d2graph.Scalar{Value: v}
				}
				if v, ok := input.Style["bold"]; ok {
					obj.Style.Bold = &d2graph.Scalar{Value: v}
				}
				if v, ok := input.Style["italic"]; ok {
					obj.Style.Italic = &d2graph.Scalar{Value: v}
				}
				if v, ok := input.Style["underline"]; ok {
					obj.Style.Underline = &d2graph.Scalar{Value: v}
				}
				if v, ok := input.Style["shadow"]; ok {
					obj.Style.Shadow = &d2graph.Scalar{Value: v}
				}
				if v, ok := input.Style["filled"]; ok {
					obj.Style.Filled = &d2graph.Scalar{Value: v}
				}
				parent.Children[strings.ToLower(d2ID)] = obj
				parent.ChildrenArray = append(parent.ChildrenArray, obj)
				g.Objects = append(g.Objects, obj)
				objects[id] = obj
				nodes = append(nodes, input)
			}
			for i, pair := range test.pairs {
				index := indices[i]
				if test.shapeSet == 20 {
					index = -1 - i
				}
				input := orderingEdge{ID: fmt.Sprintf("edge%d", 20-i), From: names[pair[0]], To: names[pair[1]], D2Index: &index, Label: "link", LabelWidth: 30, LabelHeight: 12}
				if (test.shapeSet == 10 || test.shapeSet == 25) && i != 1 {
					input.To = d2sequence.LifelineEndID(objects[input.From].ID)
				}
				if test.shapeSet == 8 && i%2 == 0 {
					input.Label = ""
				}
				edge := &d2graph.Edge{Index: index, Src: objects[input.From], Dst: objects[input.To], DstArrow: true, Attributes: d2graph.Attributes{}}
				if (test.shapeSet == 10 || test.shapeSet == 25) && i != 1 {
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
					sourceShape := []string{"diamond", "", "box", "triangle", "triangle"}[i]
					targetShape := []string{"", "triangle", "circle", "", "diamond"}[i]
					srcFilled := []bool{true, false, true, true, false}[i]
					dstFilled := []bool{false, false, true, false, true}[i]
					if sourceShape != "" {
						input.SourceArrowhead = &sourceShape
						input.SourceArrowheadFilled = &srcFilled
						edge.SrcArrowhead = &d2graph.Attributes{}
						edge.SrcArrowhead.Shape.Value = sourceShape
						edge.SrcArrowhead.Style.Filled = &d2graph.Scalar{Value: strconv.FormatBool(srcFilled)}
					}
					if targetShape != "" {
						input.TargetArrowhead = &targetShape
						input.TargetArrowheadFilled = &dstFilled
						edge.DstArrowhead = &d2graph.Attributes{}
						edge.DstArrowhead.Shape.Value = targetShape
						edge.DstArrowhead.Style.Filled = &d2graph.Scalar{Value: strconv.FormatBool(dstFilled)}
					}
				}
				if test.shapeSet == 27 {
					src := []bool{false, true, false, true, false}[i]
					dst := []bool{true, false, false, true, true}[i]
					input.SourceArrow, input.TargetArrow = &src, &dst
					edge.SrcArrow, edge.DstArrow = src, dst
					empty := ""
					if i != 1 {
						input.SourceArrowhead = &empty
						edge.SrcArrowhead = &d2graph.Attributes{}
					}
					if i != 0 {
						input.TargetArrowhead = &empty
						edge.DstArrowhead = &d2graph.Attributes{}
					}
				}
				if test.shapeSet == 32 {
					src, dst := false, true
					input.SourceArrow, input.TargetArrow = &src, &dst
					input.SourceArrowheadStyle = map[string]string{"filled": []string{"1", "false", "TRUE", "0", "t"}[i], "bold": "TRUE"}
					input.TargetArrowheadStyle = map[string]string{"italic": "False"}
					edge.SrcArrowhead = &d2graph.Attributes{}
					edge.SrcArrowhead.Style.Filled = &d2graph.Scalar{Value: input.SourceArrowheadStyle["filled"]}
					edge.SrcArrowhead.Style.Bold = &d2graph.Scalar{Value: "TRUE"}
					edge.DstArrowhead = &d2graph.Attributes{}
					edge.DstArrowhead.Style.Italic = &d2graph.Scalar{Value: "False"}
					if i%2 == 0 {
						shape := "diamond"
						input.SourceArrowhead = &shape
						edge.SrcArrowhead.Shape.Value = shape
					}
					if i == 3 {
						src, dst := true, false
						input.SourceArrow, input.TargetArrow = &src, &dst
						edge.SrcArrow, edge.DstArrow = src, dst
					}
				}
				if test.shapeSet == 33 && i%2 == 0 {
					input.Style = map[string]string{"stroke": "tranſparent"}
					edge.Style.Stroke = &d2graph.Scalar{Value: "tranſparent"}
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
				if obj.IconPosition != nil {
					record["iconPosition"] = *obj.IconPosition
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
				if test.shapeSet == 10 || test.shapeSet == 25 {
					if edge.Dst == objects[edges[i].From] {
						record["to"] = edges[i].From
					} else {
						record["to"] = edges[i].To
					}
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
			if test.shapeSet == 17 {
				options["rootLevel"] = 2
			}
			if test.shapeSet == 16 {
				options["rootSequence"] = true
			}
			if test.name == "authored-order" {
				delete(options, "inputOrder")
			}
			if direction == "DEFAULT" {
				delete(options, "direction")
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
