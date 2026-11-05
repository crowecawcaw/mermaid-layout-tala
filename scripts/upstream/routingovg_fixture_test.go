// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptRoutingovgFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGOVG_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 360; trial++ {
		owner := layoutgraph.NewNode(1, float64(5+trial%31), float64(6+trial%29))
		owner.TopLeft = geo.NewPoint(float64(trial%51-25), float64(trial%37-18))
		other := layoutgraph.NewNode(2, 10, 10)
		a := NewOVGNode(geo.NewPoint(float64((trial*11)%101-50), float64((trial*13)%83-41)))
		b := NewOVGNode(geo.NewPoint(float64((trial*17)%101-50), float64((trial*19)%83-41)))
		c := NewOVGNode(geo.NewPoint(float64((trial*23)%101-50), float64((trial*29)%83-41)))
		if trial%3 == 0 {
			b.Point = a.Point.Copy()
		}
		if trial%5 == 0 {
			c.X = a.X
		}
		if trial%7 == 0 {
			c.Y = a.Y
		}
		for i := 0; i < trial%12; i++ {
			a.addPortOwner(owner, geo.Orientation((trial+i)%11-1), i%4 == 0)
		}
		if trial%2 == 0 {
			a.addPortOwner(other, geo.Top, false)
			b.addPortOwner(other, geo.Right, true)
		}
		if trial%4 == 0 {
			a.setCenterPort(owner)
		}
		dirs, ok := a.portDirectionsFor(owner)
		transformed := dirs.transformed(func(d geo.Orientation) geo.Orientation { return geo.Orientation((int(d) + 3) % 9) })
		checks := []bool{}
		for i := 0; i < 9; i++ {
			checks = append(checks, a.hasPortDirection(owner, geo.Orientation(i)))
		}
		e1, e2 := NewOVGEdge(a, b), NewOVGEdge(b, c)
		out = append(out, map[string]any{"trial": trial, "expected": map[string]any{"distance": a.distanceToBoundary(owner), "directions": dirs, "directionsOk": ok, "transformed": transformed, "checks": checks, "center": a.isCenterPortOf(owner), "isPort": a.isPort(), "sharesOwner": a.sharesPortOwner(b), "vertical": e1.isVertical(), "horizontal": e1.isHorizontal(), "sharePoints": e1.sharePoints(*e2)}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
