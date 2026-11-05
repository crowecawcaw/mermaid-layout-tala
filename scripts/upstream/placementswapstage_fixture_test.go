// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placement

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptPlacementswapstageFixtures(t *testing.T) {
	path := os.Getenv("TALA_PLACEMENTSWAPSTAGE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 80; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = 50
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 5; i++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(30+i*4), float64(25+i*5)))
			j := (i*2 + trial) % 5
			n.TopLeft = geo.NewPoint(float64(j%3*150), float64(j/3*150))
			nodes = append(nodes, n)
		}
		g.Containers[nil] = nodes
		for i := 1; i < 5; i++ {
			e := g.Connect(nodes[(trial+i*3)%5], nodes[(trial+i*3+1)%5])
			if i%2 == 0 {
				e.TargetArrowhead = "triangle"
			}
		}
		if trial%7 == 0 {
			nodes[0].FixedTopLeft = nodes[0].TopLeft.Copy()
		}
		changed, err := swapOptimize(context.Background(), nodes, g)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		after := []*geo.Point{}
		for _, n := range nodes {
			after = append(after, n.TopLeft.Copy())
		}
		if err == nil {
			err = Swap(context.Background(), g)
			if err != nil {
				msg = err.Error()
			}
		}
		final := []*geo.Point{}
		for _, n := range nodes {
			final = append(final, n.TopLeft.Copy())
		}
		out = append(out, map[string]any{"trial": trial, "changed": changed, "error": msg, "after": after, "final": final, "cell": g.CellSize})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
