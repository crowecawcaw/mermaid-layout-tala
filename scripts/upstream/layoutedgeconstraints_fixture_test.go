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

type constraintLabel struct {
	Text   string `json:"text"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}
type constraintEdge struct {
	ID                   string            `json:"id"`
	From                 string            `json:"from"`
	To                   string            `json:"to"`
	LabelWidth           int               `json:"labelWidth,omitempty"`
	LabelHeight          int               `json:"labelHeight,omitempty"`
	SourceArrowheadLabel *constraintLabel  `json:"sourceArrowheadLabel,omitempty"`
	TargetArrowheadLabel *constraintLabel  `json:"targetArrowheadLabel,omitempty"`
	Style                map[string]string `json:"style,omitempty"`
}

func TestExportTypeScriptLayoutedgeconstraintsFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTEDGECONSTRAINTS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	labels := func(w, h int) *constraintLabel { return &constraintLabel{Text: "tip", Width: w, Height: h} }
	cases := []constraintEdge{
		{ID: "e", From: "a", To: "b"},
		{ID: "e", From: "a", To: "b", LabelWidth: 999999990},
		{ID: "e", From: "a", To: "b", LabelWidth: 999999991},
		{ID: "e", From: "a", To: "b", LabelHeight: 999999991},
		{ID: "e", From: "a", To: "b", SourceArrowheadLabel: labels(999999985, 1)},
		{ID: "e", From: "a", To: "b", SourceArrowheadLabel: labels(999999986, 1)},
		{ID: "e", From: "a", To: "b", SourceArrowheadLabel: labels(499999990, 1), TargetArrowheadLabel: labels(499999990, 1)},
		{ID: "e", From: "a", To: "b", LabelWidth: 999999991, Style: map[string]string{"opacity": "0"}},
		{ID: "e", From: "a", To: "b", LabelWidth: 25, Style: map[string]string{"opacity": "0"}},
	}
	out := []any{}
	for trial, input := range cases {
		g := d2graph.NewGraph()
		objects := []*d2graph.Object{}
		for _, id := range []string{"a", "b"} {
			obj := &d2graph.Object{Graph: g, Parent: g.Root, ID: id, IDVal: id, Box: geo.NewBox(geo.NewPoint(0, 0), 40, 30), Children: map[string]*d2graph.Object{}, Attributes: d2graph.Attributes{}}
			g.Root.Children[id] = obj
			g.Root.ChildrenArray = append(g.Root.ChildrenArray, obj)
			g.Objects = append(g.Objects, obj)
			objects = append(objects, obj)
		}
		edge := &d2graph.Edge{Src: objects[0], Dst: objects[1], DstArrow: true}
		if input.LabelWidth > 0 || input.LabelHeight > 0 {
			edge.Label.Value = "label"
		}
		edge.LabelDimensions = *d2target.NewTextDimensions(input.LabelWidth, input.LabelHeight)
		if input.SourceArrowheadLabel != nil {
			edge.SrcArrowhead = &d2graph.Attributes{}
			edge.SrcArrowhead.Label.Value = input.SourceArrowheadLabel.Text
			edge.SrcArrowhead.LabelDimensions = *d2target.NewTextDimensions(input.SourceArrowheadLabel.Width, input.SourceArrowheadLabel.Height)
		}
		if input.TargetArrowheadLabel != nil {
			edge.DstArrowhead = &d2graph.Attributes{}
			edge.DstArrowhead.Label.Value = input.TargetArrowheadLabel.Text
			edge.DstArrowhead.LabelDimensions = *d2target.NewTextDimensions(input.TargetArrowheadLabel.Width, input.TargetArrowheadLabel.Height)
		}
		if value, ok := input.Style["opacity"]; ok {
			edge.Style.Opacity = &d2graph.Scalar{Value: value}
		}
		g.Edges = append(g.Edges, edge)
		translated := layoutgraph.NewGraph()
		_, err := translateGraph(context.Background(), g, translated, false)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		minimum := []int{}
		if err == nil {
			minimum = []int{translated.Edges[0].MinWidth, translated.Edges[0].MinHeight}
		}
		out = append(out, map[string]any{"name": fmt.Sprintf("constraint-%d", trial), "edge": input, "error": msg, "minimum": minimum})
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
