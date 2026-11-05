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

func TestExportTypeScriptPlacementsymmetrystageFixtures(t *testing.T) {
	path := os.Getenv("TALA_PLACEMENTSYMMETRYSTAGE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 160; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = 50
		n := g.AddNode(layoutgraph.NewNode(1, 50, 40))
		n.TopLeft = geo.NewPoint(float64(trial%9*10-40), 0)
		for i := 0; i < 2+trial%3; i++ {
			w := float64(30 + (i+trial)%3*5)
			child := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+2), w, 30))
			child.TopLeft = geo.NewPoint(float64(i*100-100), float64(100+trial%3*30))
			g.Connect(n, child)
		}
		if trial%7 == 0 {
			n.FixedTopLeft = n.TopLeft.Copy()
		}
		err := BalanceSymmetry(context.Background(), g)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		after := []*geo.Point{}
		for _, node := range g.Nodes {
			after = append(after, node.TopLeft.Copy())
		}
		if err == nil {
			err = TransposeAll(context.Background(), g)
			if err != nil {
				msg = err.Error()
			}
		}
		final := []*geo.Point{}
		for _, node := range g.Nodes {
			final = append(final, node.TopLeft.Copy())
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "after": after, "final": final, "cell": g.CellSize})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
