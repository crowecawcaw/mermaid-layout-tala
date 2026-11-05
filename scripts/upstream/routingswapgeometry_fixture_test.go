// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptRoutingswapgeometryFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSWAPGEOMETRY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		a := layoutgraph.NewNode(1, 50, 40)
		a.TopLeft = geo.NewPoint(0, 0)
		b := layoutgraph.NewNode(2, 50, 40)
		b.TopLeft = geo.NewPoint(200, 100)
		c := layoutgraph.NewNode(3, 20, 20)
		c.TopLeft = geo.NewPoint(float64(80+trial%5*10), float64(trial%4*20))
		for _, n := range []*layoutgraph.Node{a, b, c} {
			g.AddNewNodeToContainer(nil, n)
		}
		e := g.Connect(a, b)
		e.Points = []*geo.Point{geo.NewPoint(50, 10), geo.NewPoint(100, 10), geo.NewPoint(100, 80), geo.NewPoint(200, float64(80+trial%3*20))}
		if trial%2 == 0 {
			e.Points = e.Points[:3]
		}
		guard, _ := newRouteWorkGuard(context.Background(), "SwapEdgePorts", 100000)
		safe, err := doesNotPassThroughNodesGuarded(g, []*layoutgraph.Node{a, b}, geo.NewPoint(50, 10), geo.NewPoint(200, 10), geo.NewPoint(50, 70), geo.NewPoint(200, 70), guard)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, map[string]any{"trial": trial, "u": isUShaped(e.Points), "s": isSShaped(e.Points), "l": isLShaped(e.Points), "safe": safe, "work": guard.used})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
