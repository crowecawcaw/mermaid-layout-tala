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

func TestExportTypeScriptNodegeometryFixtures(t *testing.T) {
	path := os.Getenv("TALA_NODEGEOMETRY_FIXTURES")
	if path == "" {
		t.Skip("set TALA_NODEGEOMETRY_FIXTURES")
	}
	rng := rand.New(rand.NewSource(139))
	out := []any{}
	spacing := func(s Spacing) []float64 { return []float64{s.top, s.right, s.bottom, s.left} }
	for trial := 0; trial < 230; trial++ {
		g := NewGraph()
		g.CellSize = float64(1 + rng.Intn(200))
		nodes := []*Node{}
		inputs := []any{}
		for j := 0; j < 3; j++ {
			n := NewNode(EntityID(j+1), float64(1+rng.Intn(300))/3, float64(1+rng.Intn(250))/3)
			n.TopLeft = geo.NewPoint(float64(rng.Intn(600)-300)/3, float64(rng.Intn(600)-300)/3)
			n.Graph = g
			typ := []string{"Square", "RealSquare", "Parallelogram", "Document", "Cylinder", "Queue", "Page", "Package", "Step", "Callout", "StoredData", "Person", "C4Person", "Diamond", "Oval", "Circle", "Hexagon", "Cloud", "Table", "Class", "Text", "Code", "Image"}[(trial+j)%23]
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
			inputs = append(inputs, map[string]any{"box": n.Box.Copy(), "shape": typ, "margin": spacing(n.margin), "padding": spacing(n.padding), "loops": loops, "label": []any{n.Label.Position, n.Label.Width, n.Label.Height, n.Label.PositionFixed()}, "icon": []any{n.Icon.Position, n.Icon.PositionFixed()}, "threeD": n.Is3D, "multiple": n.IsMultiple})
			n.UpdateSpacing()
			nodes = append(nodes, n)
		}
		g.Nodes = nodes
		g.Containers[nil] = []*Node{nodes[0]}
		g.Containers[nodes[0]] = nodes[1:]
		nodes[0].isContainer = true
		nodes[1].Container = nodes[0]
		nodes[2].Container = nodes[0]
		if trial%5 == 0 {
			nodes[1].FixedTopLeft = geo.NewPoint(10, 20)
		}
		guard, err := limits.NewWorkGuard(context.Background(), "node geometry fixture", limits.MaxEngineWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		tl, br, err := Nodes(nodes).boundsWithWorkGuard(guard)
		if err != nil {
			t.Fatal(err)
		}
		u1, u2 := Nodes(nodes).unroundedBounds()
		f1, f2 := Nodes(nodes).fixedBounds()
		c1, c2 := Nodes(nodes[1:]).fixedBounds()
		perNode := []any{}
		for _, n := range nodes {
			a, b := n.boundingBoxValues(nodes, true)
			x, y := n.boundingBoxValues(nil, false)
			labels := []any{}
			icons := []float64{}
			for pos := 0; pos < 37; pos++ {
				labels = append(labels, n.LabelTopLeft(label.Position(pos), 55, 25))
				icons = append(icons, n.IconSize(label.Position(pos)))
			}
			perNode = append(perNode, map[string]any{"bounds": []geo.Point{a, b}, "raw": []geo.Point{x, y}, "inner": n.InnerBox(), "inside": n.InsidePlacement(50, 40, n.padding), "labels": labels, "icons": icons, "contain": n.CanContain()})
		}
		padFalse, padTrue := g.containerPadding(nodes[0], false), g.containerPadding(nodes[0], true)
		nodes[0].wrapChildren()
		wrapped := nodes[0].Box.Copy()
		nodes[0].positionContainerChildren(true)
		after := []any{}
		for _, n := range nodes {
			after = append(after, n.Box.Copy())
		}
		for _, n := range nodes {
			n.mirror(trial%2 == 0, trial%3 == 0)
		}
		mirrored := []any{}
		for _, n := range nodes {
			mirrored = append(mirrored, n.Box.Copy())
		}
		out = append(out, map[string]any{"trial": trial, "nodes": inputs, "cell": g.CellSize, "expected": map[string]any{"bounds": []*geo.Point{tl, br}, "unrounded": []*geo.Point{u1, u2}, "fixed": []*geo.Point{f1, f2}, "childFixed": []*geo.Point{c1, c2}, "perNode": perNode, "paddingFalse": spacing(padFalse), "paddingTrue": spacing(padTrue), "wrapped": wrapped, "after": after, "mirrored": mirrored, "work": fmt.Sprint(guard.Used())}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
