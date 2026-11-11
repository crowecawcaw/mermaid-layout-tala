// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/d2lang/d2/d2graph"
	"github.com/d2lang/d2/d2layouts/d2sequence"
	"github.com/d2lang/d2/d2target"
	"github.com/d2lang/d2/lib/geo"
)

type rerouteNode struct {
	ID           string  `json:"id"`
	Width        float64 `json:"width"`
	Height       float64 `json:"height"`
	X            float64 `json:"x"`
	Y            float64 `json:"y"`
	Shape        string  `json:"shape,omitempty"`
	TableColumns *int    `json:"tableColumns,omitempty"`
	ParentID     string  `json:"parentId,omitempty"`
	IsGroup      bool    `json:"isGroup,omitempty"`
	D2ID         *string `json:"d2Id,omitempty"`
}
type reroutePoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}
type rerouteArrowLabel struct {
	Text   string `json:"text"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}
type rerouteEdge struct {
	ID                     string             `json:"id"`
	From                   string             `json:"from"`
	To                     string             `json:"to"`
	D2Index                int                `json:"d2Index"`
	SourceArrow            bool               `json:"sourceArrow"`
	TargetArrow            bool               `json:"targetArrow"`
	Points                 []reroutePoint     `json:"points"`
	IsCurve                bool               `json:"isCurve"`
	Label                  string             `json:"label,omitempty"`
	LabelWidth             int                `json:"labelWidth,omitempty"`
	LabelHeight            int                `json:"labelHeight,omitempty"`
	LabelPosition          *string            `json:"labelPosition,omitempty"`
	LabelPercentage        *float64           `json:"labelPercentage,omitempty"`
	SourceTableColumnIndex *int               `json:"sourceTableColumnIndex,omitempty"`
	SourceArrowhead        string             `json:"sourceArrowhead,omitempty"`
	SourceArrowheadStyle   map[string]string  `json:"sourceArrowheadStyle,omitempty"`
	SourceArrowheadLabel   *rerouteArrowLabel `json:"sourceArrowheadLabel,omitempty"`
	TargetArrowheadLabel   *rerouteArrowLabel `json:"targetArrowheadLabel,omitempty"`
}

func TestExportTypeScriptLayoutrerouteFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTREROUTE_FIXTURES")
	if path == "" {
		t.Skip("set TALA_LAYOUTREROUTE_FIXTURES")
	}
	dirs := map[string]string{"TB": "down", "BT": "up", "LR": "right", "RL": "left"}
	fixtures := []any{}
	failures := []any{}
	for _, direction := range []string{"TB", "BT", "LR", "RL", "DEFAULT"} {
		for trial := 0; trial < 17; trial++ {
			g := d2graph.NewGraph()
			if trial >= 6 && trial < 13 {
				g.Root.Shape.Value = "sequence_diagram"
			}
			g.Root.Direction.Value = dirs[direction]
			nodes := []rerouteNode{{ID: "a", Width: 80, Height: 60, X: 40, Y: 30}, {ID: "b", Width: 80, Height: 60, X: 240, Y: 30}, {ID: "c", Width: 70, Height: 50, X: float64(85 + trial*25), Y: 165}}
			if trial >= 13 {
				shapes := []string{"diamond", "oval", "callout", "cylinder"}
				nodes[0].Shape = shapes[trial-13]
				nodes[1].Shape = shapes[(trial-12)%len(shapes)]
				nodes[2].Shape = shapes[(trial-11)%len(shapes)]
			}
			if trial >= 4 && trial < 8 {
				nodes[0].ParentID, nodes[1].ParentID = "group", "group"
				group := rerouteNode{ID: "group", Width: 400, Height: 160, X: 140, Y: 30, IsGroup: true}
				nodes = append([]rerouteNode{group}, nodes...)
			}
			if trial == 8 {
				nodes[0].ParentID, nodes[1].ParentID = "group-a", "group-b"
				item, other, left, right := "item", "other", "left", "right"
				nodes[0].D2ID, nodes[1].D2ID, nodes[2].D2ID = &item, &item, &other
				a := rerouteNode{ID: "group-a", D2ID: &left, Width: 140, Height: 120, X: 40, Y: 30, IsGroup: true}
				b := rerouteNode{ID: "group-b", D2ID: &right, Width: 140, Height: 120, X: 240, Y: 30, IsGroup: true}
				nodes = append([]rerouteNode{a, b}, nodes...)
			}
			if trial == 3 {
				cols := 3
				nodes[1].Shape = "sql_table"
				nodes[1].TableColumns = &cols
			}
			objects := map[string]*d2graph.Object{}
			for _, n := range nodes {
				parent := g.Root
				if n.ParentID != "" {
					parent = objects[n.ParentID]
				}
				id := n.ID
				if n.D2ID != nil {
					id = *n.D2ID
				}
				o := &d2graph.Object{Graph: g, Parent: parent, ID: id, IDVal: id, Box: geo.NewBox(geo.NewPoint(n.X-n.Width/2, n.Y-n.Height/2), n.Width, n.Height), Children: map[string]*d2graph.Object{}, Attributes: d2graph.Attributes{}}
				o.Shape.Value = n.Shape
				if n.TableColumns != nil {
					o.SQLTable = &d2target.SQLTable{Columns: make([]d2target.SQLColumn, *n.TableColumns)}
				}
				parent.Children[id] = o
				parent.ChildrenArray = append(parent.ChildrenArray, o)
				g.Objects = append(g.Objects, o)
				objects[n.ID] = o
			}
			inputs := []rerouteEdge{
				{ID: "e0", From: "a", To: "b", D2Index: 0, TargetArrow: true, Points: []reroutePoint{{80, 30}, {200, 30}}, IsCurve: true, Label: "existing", LabelWidth: 30, LabelHeight: 10},
				{ID: "e1", From: "a", To: "c", D2Index: 1, TargetArrow: true, Points: []reroutePoint{}, IsCurve: true, Label: "selected", LabelWidth: 24, LabelHeight: 12},
				{ID: "e2", From: "b", To: "c", D2Index: 2, SourceArrow: true, Points: []reroutePoint{{240, 60}, {objects["c"].TopLeft.X + objects["c"].Width/2, 140}}, IsCurve: true},
			}
			if trial == 9 {
				inputs[1].To = d2sequence.LifelineEndID("a")
				inputs[1].TargetArrow = false
			}
			if trial == 10 {
				inputs[0].To = d2sequence.LifelineEndID("a")
				inputs[0].TargetArrow = false
			}
			if trial == 11 || trial == 12 {
				inputs[1].SourceArrowhead = "diamond"
				inputs[1].SourceArrowheadStyle = map[string]string{"filled": "TRUE"}
				inputs[1].SourceArrowheadLabel = &rerouteArrowLabel{Text: "source", Width: 28, Height: 12}
				inputs[1].TargetArrowheadLabel = &rerouteArrowLabel{Text: "target", Width: 30, Height: 14}
			}
			position := "OUTSIDE_TOP_CENTER"
			percent := 0.5
			inputs[0].LabelPosition = &position
			inputs[0].LabelPercentage = &percent
			if trial%2 == 0 {
				p := 0.25
				inputs[1].LabelPosition = &position
				inputs[1].LabelPercentage = &p
			}
			if trial%2 == 1 {
				p := 0.25
				pos := "UNLOCKED_TOP"
				inputs[2].Label = "reversed"
				inputs[2].LabelWidth = 25
				inputs[2].LabelHeight = 10
				inputs[2].LabelPosition = &pos
				inputs[2].LabelPercentage = &p
			}
			if trial == 3 {
				column := 1
				inputs[2].SourceTableColumnIndex = &column
			}
			selected := []*d2graph.Edge{}
			selectedIDs := []string{"e1"}
			for i, in := range inputs {
				e := &d2graph.Edge{Index: in.D2Index, Src: objects[in.From], Dst: objects[in.To], SrcArrow: in.SourceArrow, DstArrow: in.TargetArrow, IsCurve: in.IsCurve, Attributes: d2graph.Attributes{}}
				if e.Dst == nil {
					e.Dst = &d2graph.Object{ID: in.To}
				}
				if in.SourceArrowhead != "" || in.SourceArrowheadLabel != nil || in.SourceArrowheadStyle != nil {
					e.SrcArrowhead = &d2graph.Attributes{}
					e.SrcArrowhead.Shape.Value = in.SourceArrowhead
					if v, ok := in.SourceArrowheadStyle["filled"]; ok {
						e.SrcArrowhead.Style.Filled = &d2graph.Scalar{Value: v}
					}
					if label := in.SourceArrowheadLabel; label != nil {
						e.SrcArrowhead.Label.Value = label.Text
						e.SrcArrowhead.LabelDimensions = *d2target.NewTextDimensions(label.Width, label.Height)
					}
				}
				if label := in.TargetArrowheadLabel; label != nil {
					e.DstArrowhead = &d2graph.Attributes{}
					e.DstArrowhead.Label.Value = label.Text
					e.DstArrowhead.LabelDimensions = *d2target.NewTextDimensions(label.Width, label.Height)
				}
				e.SrcTableColumnIndex = in.SourceTableColumnIndex
				e.Label.Value = in.Label
				e.LabelDimensions = *d2target.NewTextDimensions(in.LabelWidth, in.LabelHeight)
				e.LabelPosition = in.LabelPosition
				e.LabelPercentage = in.LabelPercentage
				for _, p := range in.Points {
					e.Route = append(e.Route, geo.NewPoint(p.X, p.Y))
				}
				g.Edges = append(g.Edges, e)
				if i == 1 || (i == 2 && trial%2 == 1) {
					selected = append(selected, e)
					if i == 2 {
						selectedIDs = append(selectedIDs, in.ID)
					}
				}
			}
			options := map[string]any{"direction": direction}
			if trial >= 6 && trial < 13 {
				options["rootSequence"] = true
			}
			if direction == "DEFAULT" {
				delete(options, "direction")
			}
			if err := RouteEdges(context.Background(), g, selected); err != nil {
				failures = append(failures, map[string]any{"name": fmt.Sprintf("%s-%d", direction, trial), "nodes": nodes, "edges": inputs, "selected": selectedIDs, "options": options, "error": err.Error()})
				continue
			}
			out := []map[string]any{}
			for i, e := range g.Edges {
				points := []reroutePoint{}
				for _, p := range e.Route {
					points = append(points, reroutePoint{p.X, p.Y})
				}
				to := inputs[i].To
				if e.Dst == e.Src {
					to = inputs[i].From
				}
				record := map[string]any{"id": inputs[i].ID, "points": points, "isCurve": e.IsCurve, "to": to}
				if e.LabelPosition != nil {
					record["labelPosition"] = *e.LabelPosition
				}
				if e.LabelPercentage != nil {
					record["labelPercentage"] = *e.LabelPercentage
				}
				out = append(out, record)
			}
			fixtures = append(fixtures, map[string]any{"name": fmt.Sprintf("%s-%d", direction, trial), "nodes": nodes, "edges": inputs, "selected": selectedIDs, "options": options, "expected": out})
		}
	}
	data, err := json.MarshalIndent(fixtures, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
	data, err = json.MarshalIndent(failures, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(strings.TrimSuffix(path, ".json")+"-errors.json", append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
