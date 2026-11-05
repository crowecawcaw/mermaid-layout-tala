// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placement

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptPlacementstagesFixtures(t *testing.T) {
	path := os.Getenv("TALA_PLACEMENTSTAGES_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 200; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		shape := []string{"Square", "Circle", "Diamond", "Table", "Class"}[trial%5]
		for j := 0; j < 3; j++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(j+1), float64(20+trial%50+j*7), float64(30+trial%30+j*5))
			g.AddNewNodeToContainer(nil, n)
			n.TopLeft = geo.NewPoint(float64(j*100-trial), float64(j*40+trial))
			nodes = append(nodes, n)
		}
		nodes[0].SetShape(shape)
		size := []int{13, 14, 16, 20, 24, 28, 32}[trial%7]
		nodes[0].FontSize = &size
		if trial%9 == 0 {
			nodes[0].FixedTopLeft = geo.NewPoint(0, 0)
		}
		count := trial % 9
		for j := 0; j < count; j++ {
			other := nodes[1+j%2]
			if trial%11 == 0 {
				other = nodes[0]
			}
			g.Connect(nodes[0], other)
		}
		Prescale(g)
		dims := []any{}
		for _, n := range nodes {
			dims = append(dims, []float64{n.Width, n.Height})
		}
		font := *nodes[0].FontSize
		Pad(g)
		Normalize(g)
		positions := []any{}
		for _, n := range nodes {
			positions = append(positions, []float64{n.TopLeft.X, n.TopLeft.Y})
		}
		out = append(out, map[string]any{"trial": trial, "shape": shape, "dims": dims, "font": font, "positions": positions})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
