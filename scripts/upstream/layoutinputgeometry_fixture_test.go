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
	"github.com/d2lang/d2/lib/geo"
)

type geometryInput struct {
	ID              string       `json:"id"`
	From            string       `json:"from"`
	To              string       `json:"to"`
	Points          []*geo.Point `json:"points,omitempty"`
	LabelPosition   *string      `json:"labelPosition,omitempty"`
	LabelPercentage *float64     `json:"labelPercentage,omitempty"`
}

func TestExportTypeScriptLayoutinputgeometryFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTINPUTGEOMETRY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	position, invalidPosition := "UNLOCKED_TOP", "INSIDE_TOP_LEFT"
	percentage, invalidPercentage := 0.25, 1.1
	cases := []geometryInput{
		{ID: "e", From: "a", To: "b"},
		{ID: "e", From: "a", To: "b", Points: []*geo.Point{geo.NewPoint(0, 0), geo.NewPoint(30, 20)}, LabelPosition: &position, LabelPercentage: &percentage},
		{ID: "e", From: "a", To: "b", Points: []*geo.Point{geo.NewPoint(0, 0)}},
		{ID: "e", From: "a", To: "b", Points: []*geo.Point{geo.NewPoint(0, 0), geo.NewPoint(0, 0)}},
		{ID: "e", From: "a", To: "b", Points: []*geo.Point{geo.NewPoint(0, 0), geo.NewPoint(1000000001, 0)}},
		{ID: "e", From: "a", To: "b", Points: []*geo.Point{nil, geo.NewPoint(30, 20)}},
		{ID: "e", From: "a", To: "b", LabelPosition: &invalidPosition},
		{ID: "e", From: "a", To: "b", LabelPercentage: &invalidPercentage},
	}
	out := []any{}
	for i, input := range cases {
		g := d2graph.NewGraph()
		objects := []*d2graph.Object{}
		for _, id := range []string{"a", "b"} {
			obj := &d2graph.Object{Graph: g, Parent: g.Root, ID: id, IDVal: id, Box: geo.NewBox(geo.NewPoint(0, 0), 40, 30), Children: map[string]*d2graph.Object{}}
			g.Root.Children[id] = obj
			g.Root.ChildrenArray = append(g.Root.ChildrenArray, obj)
			g.Objects = append(g.Objects, obj)
			objects = append(objects, obj)
		}
		edge := &d2graph.Edge{Src: objects[0], Dst: objects[1], DstArrow: true, Route: input.Points, LabelPosition: input.LabelPosition, LabelPercentage: input.LabelPercentage}
		g.Edges = append(g.Edges, edge)
		translated := layoutgraph.NewGraph()
		_, err := translateGraph(context.Background(), g, translated, false)
		out = append(out, map[string]any{"name": fmt.Sprintf("input-geometry-%d", i), "edge": input, "valid": err == nil})
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
