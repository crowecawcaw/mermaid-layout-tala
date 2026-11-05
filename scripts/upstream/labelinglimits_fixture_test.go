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

func TestExportTypeScriptLabelinglimitsFixtures(t *testing.T) {
	path := os.Getenv("TALA_LABELINGLIMITS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 160; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 3; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(100+i*10), float64(70+i*10))
			n.TopLeft = geo.NewPoint(float64(i*220), float64(i%2*140))
			g.AddNewNodeToContainer(nil, n)
			nodes = append(nodes, n)
		}
		nodes[0].Label = &layoutgraph.Label{Text: "alpha", Width: float64(40 + trial%4*15), Height: 20}
		nodes[1].Label = &layoutgraph.Label{Text: "beta", Width: 70, Height: 25}
		if trial%3 == 0 {
			nodes[0].Icon = &layoutgraph.Icon{}
		}
		if trial%5 == 0 {
			nodes[1].Label.Position = label.InsideTopCenter
			nodes[1].Label.FixPosition()
		}
		e := g.Connect(nodes[0], nodes[1])
		e.Points = []*geo.Point{geo.NewPoint(100, 35), geo.NewPoint(160, 35), geo.NewPoint(160, 180), geo.NewPoint(220, 180)}
		e.Label = &layoutgraph.Label{Text: "edge", Width: float64(40 + trial%5*5), Height: 20}
		if trial%4 == 0 {
			e.Label.Position = label.UnlockedTop
		}
		if trial%7 == 0 {
			e.LabelPercentage = .25
		}
		other := g.Connect(nodes[1], nodes[2])
		other.Points = []*geo.Point{geo.NewPoint(330, 180), geo.NewPoint(380, 180), geo.NewPoint(380, 35), geo.NewPoint(440, 35)}
		if trial%2 == 0 {
			other.Label = &layoutgraph.Label{Text: "other", Width: 60, Height: 20}
		}
		err := place(context.Background(), g, int64(5+trial*7))
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		positions := []int{}
		icons := []int{}
		for _, n := range nodes {
			if n.Label == nil {
				positions = append(positions, -1)
			} else {
				positions = append(positions, int(n.Label.Position))
			}
			if n.Icon == nil {
				icons = append(icons, -1)
			} else {
				icons = append(icons, int(n.Icon.Position))
			}
		}
		edgePositions := []int{}
		percentages := []float64{}
		for _, edge := range g.Edges {
			if edge.Label == nil {
				edgePositions = append(edgePositions, -1)
			} else {
				edgePositions = append(edgePositions, int(edge.Label.Position))
			}
			percentages = append(percentages, edge.LabelPercentage)
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "positions": positions, "icons": icons, "edgePositions": edgePositions, "percentages": percentages})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
