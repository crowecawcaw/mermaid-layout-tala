// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package quality

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"github.com/d2lang/d2/lib/label"
)

func TestExportTypeScriptQualityscoringFixtures(t *testing.T) {
	path := os.Getenv("TALA_QUALITYSCORING_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 160; trial++ {
		g := layoutgraph.NewGraph()
		for i := 0; i < 5; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(30+i*5), float64(20+i*3))
			n.TopLeft = geo.NewPoint(float64((trial*7+i*31)%130), float64((trial*11+i*23)%100))
			if (trial+i)%3 == 0 {
				n.Label = &layoutgraph.Label{Text: "node", Width: 18, Height: 10, Position: label.InsideMiddleCenter}
			}
			if (trial+i)%7 == 0 {
				n.Label = &layoutgraph.Label{Text: "outside", Width: 18, Height: 10, Position: label.OutsideTopCenter}
			}
			if (trial+i)%13 == 0 {
				n.IsInvisible = true
			}
			g.AddNewNodeToContainer(nil, n)
		}
		for i := 0; i < 4; i++ {
			e := g.Connect(g.Nodes[i], g.Nodes[(i+2)%5])
			a, b := e.From.Center(), e.To.Center()
			e.Points = []*geo.Point{a, geo.NewPoint(a.X, b.Y+float64(trial%15)), geo.NewPoint(b.X, b.Y+float64(trial%15)), b}
			if (trial+i)%3 == 0 {
				e.Label = &layoutgraph.Label{Text: "edge", Width: 16, Height: 8, Position: label.InsideMiddleCenter}
				e.LabelPercentage = 0.5
			}
			if (trial+i)%11 == 0 {
				e.IsInvisible = true
			}
		}
		penalty, area, work, err := evaluateWithAreaLimit(context.Background(), g, 50000000)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, map[string]any{"trial": trial, "penalty": penalty, "area": area, "work": work})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
