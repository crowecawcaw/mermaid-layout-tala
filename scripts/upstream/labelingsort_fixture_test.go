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

func TestExportTypeScriptLabelingsortFixtures(t *testing.T) {
	path := os.Getenv("TALA_LABELINGSORT_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		edges := []*layoutgraph.Edge{}
		for i := 0; i < 7; i++ {
			e := layoutgraph.NewEdge(layoutgraph.NewNode(1, 10, 10), layoutgraph.NewNode(2, 10, 10))
			e.ID = layoutgraph.EntityID(i + 1)
			length := float64(50 + (i*43+trial*13)%180)
			e.Points = []*geo.Point{geo.NewPoint(0, 0), geo.NewPoint(length, 0)}
			if (i+trial)%3 == 0 {
				e.Points = []*geo.Point{geo.NewPoint(0, 0), geo.NewPoint(length, 0), geo.NewPoint(length, 20)}
			}
			edges = append(edges, e)
		}
		guard, _ := newLabelPlacementWorkGuard(context.Background(), "PlaceLabels", 100000)
		sorted, err := sortLabelPlacementEdges(edges, guard)
		if err != nil {
			t.Fatal(err)
		}
		ids := []int{}
		for _, e := range sorted {
			ids = append(ids, int(e.ID))
		}
		out = append(out, map[string]any{"trial": trial, "ids": ids, "work": guard.used})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
