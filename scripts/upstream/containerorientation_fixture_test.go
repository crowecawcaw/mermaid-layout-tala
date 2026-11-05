// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placement

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptContainerorientationFixtures(t *testing.T) {
	path := os.Getenv("TALA_CONTAINERORIENTATION_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 32; trial++ {
		direction := geo.Bottom
		if trial%2 == 0 {
			direction = geo.Top
		}
		reverse := trial%4 >= 2
		points := []geo.Point{{X: 0, Y: 0}, {X: 400, Y: 0}, {X: 800, Y: 0}}
		if trial%8 >= 4 {
			points = []geo.Point{{X: 0, Y: 0}, {X: 0, Y: 400}, {X: 0, Y: 800}}
		}
		f := newContainerOrientationFixture(t, direction, points, reverse)
		if trial%11 == 0 {
			f.nodes[0].FixedTopLeft = f.nodes[0].TopLeft.Copy()
		}
		if err := orientSourceInterior(context.Background(), f.graph, f.root, nil); err != nil {
			t.Fatal(err)
		}
		positions := []any{}
		for _, n := range f.nodes {
			positions = append(positions, []float64{n.TopLeft.X, n.TopLeft.Y, n.Width, n.Height})
		}
		out = append(out, map[string]any{"trial": trial, "direction": direction, "reverse": reverse, "positions": positions, "cell": f.graph.CellSize, "root": []float64{f.root.Width, f.root.Height}})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
