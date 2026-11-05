// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package labeling

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"github.com/d2lang/d2/lib/label"
	"os"
	"testing"
)

func TestExportTypeScriptLabelingedgeFixtures(t *testing.T) {
	path := os.Getenv("TALA_LABELINGEDGE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		a := layoutgraph.NewNode(1, 50, 40)
		a.TopLeft = geo.NewPoint(0, 0)
		b := layoutgraph.NewNode(2, 50, 40)
		b.TopLeft = geo.NewPoint(300, 120)
		g.AddNewNodeToContainer(nil, a)
		g.AddNewNodeToContainer(nil, b)
		if trial%3 == 0 {
			n := layoutgraph.NewNode(3, 60, 50)
			n.TopLeft = geo.NewPoint(120, float64(trial%5*20))
			g.AddNewNodeToContainer(nil, n)
		}
		e := g.Connect(a, b)
		e.Points = []*geo.Point{geo.NewPoint(50, 20), geo.NewPoint(170, 20), geo.NewPoint(170, 140), geo.NewPoint(300, 140)}
		e.Label = &layoutgraph.Label{Width: float64(30 + trial%5*10), Height: 20}
		if trial%4 == 0 {
			e.Label.Position = label.UnlockedTop
		}
		if trial%7 == 0 {
			e.LabelPercentage = 0.25
		}
		guard, _ := newLabelPlacementWorkGuard(context.Background(), "PlaceLabels", 1000000)
		fake, pos, percentage, err := findBestEdgeLabelPosition(e, g, nil, nil, guard)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		var box []float64
		if fake != nil {
			box = []float64{fake.TopLeft.X, fake.TopLeft.Y, fake.Width, fake.Height}
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "position": pos, "percentage": percentage, "remaining": e.LabelPercentage, "box": box, "work": guard.used})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
