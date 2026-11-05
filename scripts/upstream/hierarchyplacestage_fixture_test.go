// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package hierarchy

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptHierarchyplacestageFixtures(t *testing.T) {
	path := os.Getenv("TALA_HIERARCHYPLACESTAGE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		h := layoutgraph.NewHierarchy()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 6; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(40+i*5), float64(30+i%3*10))
			n.TopLeft = geo.NewPoint(float64(i*100), 0)
			g.AddNewNodeToContainer(nil, n)
			nodes = append(nodes, n)
			n.Hierarchy = h
			h.Levels()[n] = i % 4
		}
		h.LevelCount = 4
		pairs := [][2]int{{0, 1}, {0, 3}, {1, 2}, {2, 3}, {0, 5}}
		if trial%2 == 0 {
			pairs = append(pairs, [2]int{4, 3})
		}
		if trial%3 == 0 {
			pairs = append(pairs, [2]int{1, 5})
		}
		for _, p := range pairs {
			g.Connect(nodes[p[0]], nodes[p[1]])
		}
		directions := []geo.Orientation{geo.Top, geo.Bottom, geo.Left, geo.Right, geo.NONE}
		g.Directions[nil] = directions[trial%len(directions)]
		if trial%11 == 0 {
			nodes[0].FixedTopLeft = nodes[0].TopLeft.Copy()
		}
		err := Place(context.Background(), g, nil, nil)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		geometry := [][]float64{}
		for _, n := range nodes {
			geometry = append(geometry, []float64{n.TopLeft.X, n.TopLeft.Y, n.Width, n.Height})
		}
		out = append(out, map[string]any{"trial": trial, "geometry": geometry, "error": msg})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
