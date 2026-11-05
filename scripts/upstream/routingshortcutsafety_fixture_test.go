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

func TestExportTypeScriptRoutingshortcutsafetyFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSHORTCUTSAFETY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 180; trial++ {
		g, e := shortcutTestGraph()
		var boxes []geo.Box
		if trial%3 == 0 {
			n := g.AddNode(layoutgraph.NewNode(3, 40, 40))
			n.TopLeft = geo.NewPoint(280, float64(210+trial%8*10))
		}
		if trial%3 == 1 {
			boxes = append(boxes, geo.Box{TopLeft: geo.NewPoint(280, float64(210+trial%8*10)), Width: 40, Height: 40})
		}
		x := float64(100 + trial%9*50)
		candidate := shortcutTestPoints(100, 250, x, 250, x, 50, 500, 50)
		guard, _ := newRouteWorkGuard(context.Background(), "shortcut", 100000)
		safe, err := shortcutCandidateSafe(g, e, candidate, boxes, guard)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, map[string]any{"trial": trial, "safe": safe, "work": guard.used})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
