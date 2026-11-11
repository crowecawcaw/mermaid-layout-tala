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

	"github.com/d2lang/d2/d2compiler"
	"github.com/d2lang/d2/d2graph"
	"github.com/d2lang/d2/lib/textmeasure"
)

func compiledStyle(style d2graph.Style) map[string]string {
	out := map[string]string{}
	for key, value := range map[string]*d2graph.Scalar{
		"opacity": style.Opacity, "stroke": style.Stroke, "fill": style.Fill, "fillPattern": style.FillPattern,
		"strokeWidth": style.StrokeWidth, "strokeDash": style.StrokeDash, "borderRadius": style.BorderRadius,
		"shadow": style.Shadow, "threeDee": style.ThreeDee, "multiple": style.Multiple, "font": style.Font,
		"fontSize": style.FontSize, "fontColor": style.FontColor, "animated": style.Animated, "bold": style.Bold,
		"italic": style.Italic, "underline": style.Underline, "filled": style.Filled, "doubleBorder": style.DoubleBorder,
		"textTransform": style.TextTransform,
	} {
		if value != nil {
			out[key] = value.Value
		}
	}
	return out
}

func TestExportTypeScriptLayoutcompiledFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTCOMPILED_FIXTURES")
	if path == "" {
		t.Skip()
	}
	cases := []struct{ name, script string }{
		{"basic", "a -> b: request\na -> c: event\nb -> d\nc -> d\n"},
		{"nested", "service: {\n  api -> worker: enqueue\n  worker -> cache: read\n}\nservice.api -> database: query\n"},
		{"scoped", "zoneA: { item }\nzoneB: { item }\nzoneA.item -> zoneB.item: transfer\nzoneB.item -> zoneA.item: reply\n"},
		{"shapes", "start: {shape: oval}\ndecision: {shape: diamond}\ndb: {shape: cylinder}\nstart -> decision\ndecision -> db: yes\ndecision -> start: retry\n"},
		{"styles", "a: {style.fill: transparent; style.stroke: transparent}\nb: {style.opacity: 0.5; style.font-size: 22}\na -> b: link\nb -> c\n"},
		{"table", "users: {\n shape: sql_table\n id: int\n email: string\n}\norders: {\n shape: sql_table\n id: int\n user_id: int\n}\nusers.id -> orders.user_id\n"},
		{"parallel", "a -> b: first\na -> b: second\nb <- a: third\na -> a: self\n"},
		{"local-direction", "box: {\n direction: right\n a -> b -> c\n}\nbox.c -> outside\n"},
		{"near", "a -> b\nc: {near: a}\nc -> b\n"},
		{"class", "User: {\n shape: class\n name: string\n save(): void\n}\nUser -> Store: writes\n"},
		{"arrowheads", "a <-> b: route {\n source-arrowhead.shape: diamond\n source-arrowhead.style.filled: true\n source-arrowhead.label: source\n target-arrowhead.shape: circle\n target-arrowhead.label: target\n}\nb -> c\n"},
	}
	directions := []struct{ api, d2 string }{{"TB", "down"}, {"BT", "up"}, {"LR", "right"}, {"RL", "left"}}
	out := []any{}
	for _, c := range cases {
		for _, direction := range directions {
			g, _, err := d2compiler.Compile("fixture.d2", strings.NewReader(c.script), nil)
			if err != nil {
				t.Fatalf("%s compile: %v", c.name, err)
			}
			ruler, err := textmeasure.NewRuler()
			if err != nil {
				t.Fatal(err)
			}
			if err := g.SetDimensions(nil, ruler, nil, nil); err != nil {
				t.Fatalf("%s measure: %v", c.name, err)
			}
			g.Root.Direction.Value = direction.d2
			nodes := []map[string]any{}
			edges := []map[string]any{}
			for _, obj := range g.Objects {
				n := map[string]any{"id": obj.AbsID(), "d2Id": obj.ID, "width": obj.Width, "height": obj.Height, "label": obj.Label.Value, "labelWidth": obj.LabelDimensions.Width, "labelHeight": obj.LabelDimensions.Height}
				if obj.Shape.Value != "" {
					n["shape"] = obj.Shape.Value
				}
				if len(obj.ChildrenArray) != 0 {
					n["isGroup"] = true
				}
				if obj.Parent != g.Root {
					n["parentId"] = obj.Parent.AbsID()
				}
				if obj.SQLTable != nil {
					n["tableColumns"] = len(obj.SQLTable.Columns)
				}
				if obj.Class != nil {
					n["hasClassData"] = true
				}
				if obj.IsGridDiagram() {
					n["isGrid"] = true
				}
				if d := map[string]string{"up": "BT", "down": "TB", "left": "RL", "right": "LR"}[obj.Direction.Value]; d != "" {
					n["direction"] = d
				}
				if style := compiledStyle(obj.Style); len(style) != 0 {
					n["style"] = style
				}
				if obj.NearKey != nil {
					n["nearPath"] = d2graph.Key(obj.NearKey)
				}
				if obj.Icon != nil {
					n["icon"] = obj.Icon.String()
				}
				if obj.LabelPosition != nil {
					n["labelPosition"] = *obj.LabelPosition
				}
				if obj.IconPosition != nil {
					n["iconPosition"] = *obj.IconPosition
				}
				if obj.WidthAttr != nil {
					value, _ := strconv.Atoi(obj.WidthAttr.Value)
					n["desiredWidth"] = value
				}
				if obj.HeightAttr != nil {
					value, _ := strconv.Atoi(obj.HeightAttr.Value)
					n["desiredHeight"] = value
				}
				nodes = append(nodes, n)
			}
			for i, edge := range g.Edges {
				e := map[string]any{"id": fmt.Sprintf("e%d", i), "from": edge.Src.AbsID(), "to": edge.Dst.AbsID(), "d2Index": edge.Index,
					"sourceArrow": edge.SrcArrow, "targetArrow": edge.DstArrow, "label": edge.Label.Value,
					"labelWidth": edge.LabelDimensions.Width, "labelHeight": edge.LabelDimensions.Height}
				if edge.SrcTableColumnIndex != nil {
					e["sourceTableColumnIndex"] = *edge.SrcTableColumnIndex
				}
				if edge.DstTableColumnIndex != nil {
					e["targetTableColumnIndex"] = *edge.DstTableColumnIndex
				}
				if edge.SrcArrowhead != nil {
					e["sourceArrowhead"] = edge.SrcArrowhead.Shape.Value
					if edge.SrcArrowhead.Label.Value != "" {
						e["sourceArrowheadLabel"] = map[string]any{"text": edge.SrcArrowhead.Label.Value, "width": edge.SrcArrowhead.LabelDimensions.Width, "height": edge.SrcArrowhead.LabelDimensions.Height}
					}
					if style := compiledStyle(edge.SrcArrowhead.Style); len(style) != 0 {
						e["sourceArrowheadStyle"] = style
					}
				}
				if edge.DstArrowhead != nil {
					e["targetArrowhead"] = edge.DstArrowhead.Shape.Value
					if edge.DstArrowhead.Label.Value != "" {
						e["targetArrowheadLabel"] = map[string]any{"text": edge.DstArrowhead.Label.Value, "width": edge.DstArrowhead.LabelDimensions.Width, "height": edge.DstArrowhead.LabelDimensions.Height}
					}
					if style := compiledStyle(edge.DstArrowhead.Style); len(style) != 0 {
						e["targetArrowheadStyle"] = style
					}
				}
				if style := compiledStyle(edge.Style); len(style) != 0 {
					e["style"] = style
				}
				edges = append(edges, e)
			}
			opts := DefaultOptions()
			opts.Seeds = []int64{1, 2, 3}
			if err := Layout(context.Background(), g, &opts); err != nil {
				t.Fatalf("%s %s layout: %v", c.name, direction.api, err)
			}
			outNodes := []any{}
			outEdges := []any{}
			for _, obj := range g.Objects {
				n := map[string]any{"id": obj.AbsID(), "x": obj.TopLeft.X + obj.Width/2, "y": obj.TopLeft.Y + obj.Height/2, "width": obj.Width, "height": obj.Height}
				if obj.Style.FontSize != nil {
					value, err := strconv.Atoi(obj.Style.FontSize.Value)
					if err != nil {
						t.Fatal(err)
					}
					n["fontSize"] = value
				}
				outNodes = append(outNodes, n)
			}
			for i, edge := range g.Edges {
				points := []any{}
				for _, p := range edge.Route {
					points = append(points, map[string]float64{"x": p.X, "y": p.Y})
				}
				e := map[string]any{"id": edges[i]["id"], "points": points, "isCurve": edge.IsCurve}
				if edge.LabelPosition != nil {
					e["labelPosition"] = *edge.LabelPosition
				}
				if edge.LabelPercentage != nil {
					e["labelPercentage"] = *edge.LabelPercentage
				}
				outEdges = append(outEdges, e)
			}
			out = append(out, map[string]any{"name": fmt.Sprintf("compiled-%s-%s", c.name, direction.api), "nodes": nodes, "edges": edges,
				"options": map[string]any{"direction": direction.api, "seeds": []int{1, 2, 3}}, "expected": map[string]any{"nodes": outNodes, "edges": outEdges}})
		}
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
