// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package layoutgraph

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/labelgeom"
	"github.com/d2lang/d2/lib/geo"
	"github.com/d2lang/d2/lib/label"
	"os"
	"testing"
)

func TestExportTypeScriptGraphboundsFixtures(t *testing.T) {
	path := os.Getenv("TALA_GRAPHBOUNDS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	arrows := []string{"", "none", "arrow", "triangle", "unfilled-triangle", "line", "filled-diamond", "diamond", "cross", "filled-circle", "circle", "filled-box", "box", "cf-one", "cf-many", "cf-one-required", "cf-many-required"}
	for trial := 0; trial < 340; trial++ {
		g := NewGraph()
		a := g.AddNode(NewNode(1, 61.5, 43.5))
		b := g.AddNode(NewNode(2, 40.25, 70.25))
		a.TopLeft = geo.NewPoint(-30.5, 45.5)
		b.TopLeft = geo.NewPoint(400.5, -100.5)
		e := g.Connect(a, b)
		e.Points = []*geo.Point{}
		for j := 0; j < 2+trial%5; j++ {
			x := float64((trial*17+j*47)%500) - 250.5
			y := float64((trial*13+j*83)%400) - 200.25
			e.Points = append(e.Points, geo.NewPoint(x, y))
		}
		e.SourceArrowhead = Arrowhead(arrows[trial%len(arrows)])
		e.TargetArrowhead = Arrowhead(arrows[(trial/len(arrows))%len(arrows)])
		e.LabelPercentage = float64(trial%11) / 10
		e.Label = &Label{Width: 35.5, Height: 19.75, Position: []label.Position{label.Unset, label.InsideMiddleLeft, label.InsideMiddleCenter, label.InsideMiddleRight, label.OutsideTopLeft, label.OutsideTopCenter, label.OutsideTopRight, label.OutsideBottomLeft, label.OutsideBottomCenter, label.OutsideBottomRight, label.UnlockedTop, label.UnlockedMiddle, label.UnlockedBottom}[trial%13]}
		e.SourceArrowheadLabel = &Label{Width: float64(trial%50) + 10.75, Height: 13.5}
		e.TargetArrowheadLabel = &Label{Width: float64(trial%40) + 15.25, Height: 18.25}
		stl := labelgeom.ArrowheadTopLeft(e.Points, false, string(e.SourceArrowhead), string(e.TargetArrowhead), e.SourceArrowheadLabel.Width, e.SourceArrowheadLabel.Height)
		ttl := labelgeom.ArrowheadTopLeft(e.Points, true, string(e.SourceArrowhead), string(e.TargetArrowhead), e.TargetArrowheadLabel.Width, e.TargetArrowheadLabel.Height)
		etl, ebr := e.BoundingBox()
		gtl, gbr := g.BoundingBox()
		out = append(out, map[string]any{"trial": trial, "points": e.Points, "source": e.SourceArrowhead, "target": e.TargetArrowhead, "label": e.Label, "percentage": e.LabelPercentage, "sourceLabel": e.SourceArrowheadLabel, "targetLabel": e.TargetArrowheadLabel, "expected": map[string]any{"source": stl, "target": ttl, "edge": []*geo.Point{etl, ebr}, "graph": []*geo.Point{gtl, gbr}}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
