// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
)

func TestExportTypeScriptRoutingshortcutstageFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSHORTCUTSTAGE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 240; trial++ {
		g, e := shortcutTestGraph()
		if trial%3 == 0 {
			n := g.AddNode(layoutgraph.NewNode(3, 40, 40))
			n.TopLeft = geo.NewPoint(280, float64(210+trial%8*20))
		}
		if trial%2 == 0 {
			for _, n := range g.Nodes {
				n.TopLeft.X, n.TopLeft.Y = n.TopLeft.Y, n.TopLeft.X
			}
			for _, p := range e.Points {
				p.X, p.Y = p.Y, p.X
			}
		}
		limit := uint64(1 + trial*20)
		if trial >= 120 {
			limit = 50000000
		}
		err := shortcutRoutesWithLimit(context.Background(), g, limit)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "route": e.Points})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
