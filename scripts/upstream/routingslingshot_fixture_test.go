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

func TestExportTypeScriptRoutingslingshotFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSLINGSHOT_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	shapes := []string{"Square", "Diamond", "Oval", "Cylinder"}
	for trial := 0; trial < 100; trial++ {
		g := layoutgraph.NewGraph()
		a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
		a.SetShape(shapes[trial%4])
		a.TopLeft = geo.NewPoint(0, 0)
		b := g.AddNode(layoutgraph.NewNode(2, 70, 50))
		b.SetShape(shapes[trial/4%4])
		b.TopLeft = geo.NewPoint(float64(150+trial%3*30), float64(trial%5*50-100))
		edge := g.Connect(a, b)
		edge.TargetArrowhead = "triangle"
		if trial%7 == 0 {
			edge.TargetArrowheadLabel = &layoutgraph.Label{Text: "label", Width: 20, Height: 10}
		}
		guard, _ := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
		ovg, err := buildOVGFromGraphWithGuard(g, nil, guard)
		if err != nil {
			t.Fatal(err)
		}
		router, err := newOVGEdgeRouterWithWorkLimit(context.Background(), Default, ovg, g, nil, []*layoutgraph.Edge{edge}, maxRouteSearchWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		path, cost, err := router.slingshot(context.Background(), edge)
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
		out = append(out, map[string]any{"trial": trial, "shapeA": shapes[trial%4], "shapeB": shapes[trial/4%4], "error": msg, "points": points, "cost": cost})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
