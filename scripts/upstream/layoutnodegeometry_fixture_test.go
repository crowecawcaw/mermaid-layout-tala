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

type nodeGeometryInput struct {
	ID     string   `json:"id"`
	Width  float64  `json:"width"`
	Height float64  `json:"height"`
	X      *float64 `json:"x,omitempty"`
	Y      *float64 `json:"y,omitempty"`
}

func TestExportTypeScriptLayoutnodegeometryFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTNODEGEOMETRY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	point := func(v float64) *float64 { return &v }
	cases := []nodeGeometryInput{
		{ID: "a", Width: 40, Height: 30},
		{ID: "a", Width: 40, Height: 30, X: point(100), Y: point(-100)},
		{ID: "a", Width: 40, Height: 30, X: point(999999980), Y: point(0)},
		{ID: "a", Width: 40, Height: 30, X: point(999999981), Y: point(0)},
		{ID: "a", Width: 40, Height: 30, X: point(-999999981), Y: point(0)},
		{ID: "a", Width: 40, Height: 30, X: point(0), Y: point(999999986)},
	}
	out := []any{}
	for i, input := range cases {
		g := d2graph.NewGraph()
		var pos *geo.Point
		if input.X != nil && input.Y != nil {
			pos = geo.NewPoint(*input.X-input.Width/2, *input.Y-input.Height/2)
		}
		obj := &d2graph.Object{Graph: g, Parent: g.Root, ID: input.ID, IDVal: input.ID, Box: geo.NewBox(pos, input.Width, input.Height), Children: map[string]*d2graph.Object{}}
		g.Root.Children[input.ID] = obj
		g.Root.ChildrenArray = append(g.Root.ChildrenArray, obj)
		g.Objects = append(g.Objects, obj)
		_, err := translateGraph(context.Background(), g, layoutgraph.NewGraph(), false)
		out = append(out, map[string]any{"name": fmt.Sprintf("node-geometry-%d", i), "node": input, "valid": err == nil})
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
