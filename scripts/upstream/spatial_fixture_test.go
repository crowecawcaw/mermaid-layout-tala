// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package layoutgraph

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/lib/geo"
	"github.com/d2lang/d2/lib/label"
	"math/rand"
	"os"
	"testing"
)

func TestExportTypeScriptSpatialFixtures(t *testing.T) {
	path := os.Getenv("TALA_SPATIAL_FIXTURES")
	if path == "" {
		t.Skip("set TALA_SPATIAL_FIXTURES")
	}
	rng := rand.New(rand.NewSource(139))
	out := []any{}
	spacing := func(s Spacing) []float64 { return []float64{s.top, s.right, s.bottom, s.left} }
	for trial := 0; trial < 500; trial++ {
		g := NewGraph()
		g.CellSize = float64(1 + rng.Intn(200))
		nodes := []*Node{}
		inputs := []any{}
		edgeInputs := []any{}
		for j := 0; j < 3; j++ {
			n := NewNode(EntityID(j+1), float64(1+rng.Intn(300))/3, float64(1+rng.Intn(250))/3)
			n.TopLeft = geo.NewPoint(float64(rng.Intn(600)-300)/3, float64(rng.Intn(600)-300)/3)
			n.Graph = g
			typ := []string{"Square", "Table", "Hexagon"}[(trial+j)%3]
			n.SetShape(typ)
			n.margin = Spacing{top: float64(rng.Intn(100)) / 3, right: float64(rng.Intn(100)) / 3, bottom: float64(rng.Intn(100)) / 3, left: float64(rng.Intn(100)) / 3}
			n.padding = Spacing{top: 1, right: 2, bottom: 3, left: 4}
			loops := []float64{}
			n.LoopOffsets = map[geo.Orientation]float64{}
			for o := 0; o < 9; o++ {
				v := float64(rng.Intn(200)) / 3
				loops = append(loops, v)
				if trial%4 != 0 {
					n.LoopOffsets[geo.Orientation(o)] = v
				}
			}
			n.Label = &Label{Position: label.Position((trial + j) % 37), Width: float64(5 + rng.Intn(200)), Height: float64(5 + rng.Intn(100))}
			if trial%2 == 0 {
				n.Label.FixPosition()
			}
			n.Icon = &Icon{Position: label.Position((trial*3 + j) % 37)}
			if trial%3 == 0 {
				n.Icon.FixPosition()
			}
			n.Is3D = trial%5 == 0
			n.IsMultiple = trial%7 == 0
			inputs = append(inputs, map[string]any{"box": n.Box, "shape": typ, "margin": spacing(n.margin), "padding": spacing(n.padding), "loops": loops, "label": []any{n.Label.Position, n.Label.Width, n.Label.Height, n.Label.PositionFixed()}, "icon": []any{n.Icon.Position, n.Icon.PositionFixed()}, "threeD": n.Is3D, "multiple": n.IsMultiple})
			n.UpdateSpacing()
			nodes = append(nodes, n)
		}
		for j := 0; j < trial%5; j++ {
			target := 1 + j%2
			e := g.Connect(nodes[0], nodes[target])
			e.MinWidth = rng.Intn(180)
			e.MinHeight = rng.Intn(140)
			edgeInputs = append(edgeInputs, []int{target, e.MinWidth, e.MinHeight})
		}
		a, b, c := nodes[0], nodes[1], nodes[2]
		p := geo.NewPoint(float64(rng.Intn(600)-300)/3, float64(rng.Intn(600)-300)/3)
		q := geo.NewPoint(float64(rng.Intn(600)-300)/3, float64(rng.Intn(600)-300)/3)
		delta := float64(rng.Intn(60) - 10)
		guard, err := limits.NewWorkGuard(context.Background(), "spatial fixture", limits.MaxEngineWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		clearance, err := a.deltaToGuarded(b, p, guard)
		if err != nil {
			t.Fatal(err)
		}
		x, y := a.orthogonalDistanceTo(b)
		dx, dy := a.modifierElementAdjustments()
		variants := []any{}
		for _, sized := range []bool{false, true} {
			for _, horizontal := range []bool{false, true} {
				variants = append(variants, []any{a.distanceTo(b, sized), a.isAdjacentTo(b, sized), a.distanceBetweenCenters(b, sized), a.distance(b, sized), c.IsBlocked(a, b, sized, horizontal), a.overlapsAlongDimension(b, horizontal, sized), a.isVisibilityGraphCandidate(horizontal, false, sized, b, delta), a.isVisibilityGraphCandidate(horizontal, true, sized, b, delta)})
			}
		}
		margins := []any{}
		paddings := []any{}
		for _, n := range nodes {
			margins = append(margins, spacing(n.margin))
			paddings = append(paddings, spacing(n.padding))
		}
		expected := map[string]any{"clearance": clearance, "work": fmt.Sprint(guard.Used()), "margins": margins, "paddings": paddings, "variants": variants, "orthogonal": []float64{x, y}, "modifier": []float64{dx, dy}, "covers": a.Covers(b), "exact": a.DoesOverlapExact(b), "overlapAt": a.doesOverlapAt(b, p), "overlap": a.doesOverlap(b), "padded": a.doesOverlapCalc(b, delta), "area": a.overlapArea(b), "near": a.isPointNear(p), "on": a.isPointOnNode(p), "within": a.isWithinBounds(p, q), "passes": a.passesThrough(p, q), "intersects": intersects(p, q, a.TopLeft, b.TopLeft), "contains": a.containsPoint(p, delta), "line": a.overlapsLine(p, q, delta), "surrounds": a.Surrounds(b, delta), "orientation": a.orientation(b), "orientationAt": a.orientationAtPoint(b, p)}
		out = append(out, map[string]any{"trial": trial, "nodes": inputs, "edges": edgeInputs, "p": p, "q": q, "delta": delta, "cell": g.CellSize, "expected": expected})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
