// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package labeling

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptLabelingguardFixtures(t *testing.T) {
	path := os.Getenv("TALA_LABELINGGUARD_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 4; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(30+i*10), float64(30+i*5))
			n.TopLeft = geo.NewPoint(float64(i*20+trial%5*5), float64(i*13))
			g.AddNewNodeToContainer(nil, n)
			nodes = append(nodes, n)
		}
		e := g.Connect(nodes[0], nodes[3])
		e.Points = []*geo.Point{geo.NewPoint(-50, float64(trial%5*10)), geo.NewPoint(200, float64(trial%5*10))}
		guard, _ := newLabelPlacementWorkGuard(context.Background(), "PlaceLabels", 100000)
		count, _ := nodeOverlapCount(nodes[0], nodes[1:], float64(trial%3*10), guard)
		partial, _ := partialNodeOverlapCount(nodes[0], nodes[1:], float64(trial%3*10), guard)
		area, areaCount, _ := nodeOverlapArea(nodes[0], nodes[1:], float64(trial%3*10), trial%2 == 0, guard)
		edgeCount, _ := edgeOverlapCount(nodes[1], g.Edges, 0, guard)
		ancestors, _ := collectLabelPlacementAncestors(nodes[1], guard)
		desc, _ := isLabelPlacementDescendantOf(nodes[1], nodes[0], guard)
		ids := []int{}
		for _, n := range ancestors {
			ids = append(ids, int(n.ID))
		}
		out = append(out, map[string]any{"trial": trial, "count": count, "partial": partial, "area": area, "areaCount": areaCount, "edgeCount": edgeCount, "ancestors": ids, "desc": desc, "work": guard.used})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
