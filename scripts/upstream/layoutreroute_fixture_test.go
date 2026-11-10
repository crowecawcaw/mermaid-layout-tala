// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"github.com/d2lang/d2/d2graph"
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
}
type reroutePoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}
type rerouteEdge struct {
	ID                     string         `json:"id"`
	From                   string         `json:"from"`
	To                     string         `json:"to"`
	D2Index                int            `json:"d2Index"`
	SourceArrow            bool           `json:"sourceArrow"`
	TargetArrow            bool           `json:"targetArrow"`
	Points                 []reroutePoint `json:"points"`
	IsCurve                bool           `json:"isCurve"`
	Label                  string         `json:"label,omitempty"`
	LabelWidth             int            `json:"labelWidth,omitempty"`
	LabelHeight            int            `json:"labelHeight,omitempty"`
	LabelPosition          *string        `json:"labelPosition,omitempty"`
	LabelPercentage        *float64       `json:"labelPercentage,omitempty"`
	SourceTableColumnIndex *int           `json:"sourceTableColumnIndex,omitempty"`
}

func TestExportTypeScriptLayoutrerouteFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTREROUTE_FIXTURES")
	if path == "" {
		t.Skip("set TALA_LAYOUTREROUTE_FIXTURES")
	}
	dirs := map[string]string{"TB": "down", "BT": "up", "LR": "right", "RL": "left"}
	fixtures := []any{}
	for _, direction := range []string{"TB", "BT", "LR", "RL"} {
		for trial := 0; trial < 4; trial++ {
			g := d2graph.NewGraph()
			g.Root.Direction.Value = dirs[direction]
			nodes := []rerouteNode{{ID: "a", Width: 80, Height: 60, X: 40, Y: 30}, {ID: "b", Width: 80, Height: 60, X: 240, Y: 30}, {ID: "c", Width: 70, Height: 50, X: float64(85 + trial*25), Y: 165}}
			if trial == 3 {
				cols := 3
				nodes[1].Shape = "sql_table"
				nodes[1].TableColumns = &cols
			}
			objects := map[string]*d2graph.Object{}
			for _, n := range nodes {
				o := &d2graph.Object{Graph: g, Parent: g.Root, ID: n.ID, IDVal: n.ID, Box: geo.NewBox(geo.NewPoint(n.X-n.Width/2, n.Y-n.Height/2), n.Width, n.Height), Children: map[string]*d2graph.Object{}, Attributes: d2graph.Attributes{}}
				o.Shape.Value = n.Shape
				if n.TableColumns != nil {
					o.SQLTable = &d2target.SQLTable{Columns: make([]d2target.SQLColumn, *n.TableColumns)}
				}
				g.Root.Children[n.ID] = o
				g.Root.ChildrenArray = append(g.Root.ChildrenArray, o)
				g.Objects = append(g.Objects, o)
				objects[n.ID] = o
			}
			inputs := []rerouteEdge{
				{ID: "e0", From: "a", To: "b", D2Index: 0, TargetArrow: true, Points: []reroutePoint{{80, 30}, {200, 30}}, IsCurve: true, Label: "existing", LabelWidth: 30, LabelHeight: 10},
				{ID: "e1", From: "a", To: "c", D2Index: 1, TargetArrow: true, Points: []reroutePoint{}, IsCurve: true, Label: "selected", LabelWidth: 24, LabelHeight: 12},
				{ID: "e2", From: "b", To: "c", D2Index: 2, SourceArrow: true, Points: []reroutePoint{{240, 60}, {nodes[2].X, 140}}, IsCurve: true},
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
			if err := RouteEdges(context.Background(), g, selected); err != nil {
				t.Fatalf("%s %d: %v", direction, trial, err)
			}
			out := []map[string]any{}
			for i, e := range g.Edges {
				points := []reroutePoint{}
				for _, p := range e.Route {
					points = append(points, reroutePoint{p.X, p.Y})
				}
				record := map[string]any{"id": inputs[i].ID, "points": points, "isCurve": e.IsCurve, "to": e.Dst.ID}
				if e.LabelPosition != nil {
					record["labelPosition"] = *e.LabelPosition
				}
				if e.LabelPercentage != nil {
					record["labelPercentage"] = *e.LabelPercentage
				}
				out = append(out, record)
			}
			fixtures = append(fixtures, map[string]any{"name": fmt.Sprintf("%s-%d", direction, trial), "nodes": nodes, "edges": inputs, "selected": selectedIDs, "options": map[string]any{"direction": direction}, "expected": out})
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
