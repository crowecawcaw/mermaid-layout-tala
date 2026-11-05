// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptRoutingrouteFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGROUTE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 1200; trial++ {
		a := layoutgraph.NewNode(1, 20, 20)
		a.TopLeft = geo.NewPoint(0, 0)
		b := layoutgraph.NewNode(2, 20, 20)
		b.TopLeft = geo.NewPoint(100, float64(trial%3)*100)
		edge := &layoutgraph.Edge{From: a, To: b}
		if trial%2 == 0 {
			edge.TargetArrowhead = "triangle"
		}
		points := []*OVGNode{}
		x, y := float64((trial%7)*10), float64((trial%5)*10)
		for i := 0; i < 4+trial%8; i++ {
			if (i+trial)%2 == 0 {
				x += float64((i*3+trial)%7-3) * 10
			} else {
				y += float64((i*5+trial)%7-3) * 10
			}
			points = append(points, NewOVGNode(geo.NewPoint(x, y)))
		}
		from := NewOVGNode(geo.NewPoint(float64((trial*3)%9-4)*10, float64((trial*7)%7-3)*10))
		to := NewOVGNode(from.Point.Copy())
		if trial%3 == 0 {
			to.X += float64(trial%9-4) * 10
		} else {
			to.Y += float64(trial%9-4) * 10
		}
		route := &Route{GEdge: edge, OVGNodes: points, FromPort: geo.Point{X: 10, Y: 20}, ToPort: geo.Point{X: 100, Y: 20}}
		second := &Route{GEdge: &layoutgraph.Edge{From: a, To: b}, FromPort: geo.Point{X: float64(10 + trial%2*5), Y: 20}, ToPort: geo.Point{X: 100, Y: float64(20 + trial%4*5)}}
		third := &Route{FromPort: geo.Point{X: float64(100 + trial%5), Y: 20}, ToPort: geo.Point{X: 200, Y: 200}}
		guard := &tsRouteWorkCount{}
		swap, err := route.canSwapEdgesGuarded(second, []*Route{route, second, third}, guard)
		if err != nil {
			t.Fatal(err)
		}
		raw := []*geo.Point{}
		for _, p := range points {
			raw = append(raw, p.Point)
		}
		out = append(out, map[string]any{"trial": trial, "points": raw, "from": from.Point, "to": to.Point, "expected": map[string]any{"segments": route.createSegmentEndpoints(), "entire": route.isEntireColinear(from, to), "opposing": route.isOpposingColinear(from, to), "swap": swap, "work": guard.used}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}

type tsRouteWorkCount struct{ used uint64 }

func (g *tsRouteWorkCount) step() error        { g.used++; return nil }
func (g *tsRouteWorkCount) add(n uint64) error { g.used += n; return nil }
func (g *tsRouteWorkCount) check() error       { return nil }
