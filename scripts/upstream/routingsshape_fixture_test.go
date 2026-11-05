// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"math"
	"os"
	"testing"
)

func TestExportTypeScriptRoutingsshapeFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSSHAPE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 80; trial++ {
		g := layoutgraph.NewGraph()
		a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
		a.TopLeft = geo.NewPoint(0, 0)
		b := g.AddNode(layoutgraph.NewNode(2, 70, 50))
		b.TopLeft = geo.NewPoint(float64(160+trial%4*20), float64(130+trial%5*20))
		c := g.AddNode(layoutgraph.NewNode(3, 30, 30))
		c.TopLeft = geo.NewPoint(float64(60+trial%6*20), float64(70+trial%4*20))
		edge := g.Connect(a, b)
		edge.TargetArrowhead = "triangle"
		guard, _ := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
		ovg, err := buildOVGFromGraphWithGuard(g, nil, guard)
		if err != nil {
			t.Fatal(err)
		}
		router, err := newOVGEdgeRouterWithWorkLimit(context.Background(), Default, ovg, g, nil, []*layoutgraph.Edge{edge}, maxRouteSearchWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		orientation := a.Orientation(b)
		vertical, strong := preferLaunchingVertically(a, b, orientation)
		order := []bool{false, true}
		if vertical {
			order = []bool{true, false}
		}
		checker := func() *RouteChecker {
			return newFallibleRouteChecker(func(a, b *OVGNode) (bool, error) { return false, nil })
		}
		path, cost, err := router.findSShapedRoute(context.Background(), order, vertical, strong, edge, orientation, checker(), checker())
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		if math.IsInf(cost, 1) {
			cost = -1
		}
		var points []*geo.Point
		if path != nil {
			points = []*geo.Point{}
			for _, n := range path {
				points = append(points, n.Point)
			}
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "points": points, "cost": cost})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
