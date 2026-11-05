// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placement

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptOptimizerindexFixtures(t *testing.T) {
	path := os.Getenv("TALA_OPTIMIZERINDEX_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = 30
		count := 80 + trial%61
		for i := 0; i < count; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(10+i%12), float64(12+i%7))
			g.AddNewNodeToContainer(nil, n)
			n.TopLeft = geo.NewPoint(float64((i%15)*150), float64((i/15)*150))
		}
		guard, err := limits.NewOptimizationWorkGuard(context.Background(), "index", limits.MaxOptimizationWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		index := optimizerSpatialIndex{}
		if err = index.rebuild(g, guard); err != nil {
			t.Fatal(err)
		}
		rebuildWork := fmt.Sprint(guard.Used())
		point := geo.NewPoint(float64((trial%15)*150+trial%3), float64((trial%9)*150))
		found, yes, err := index.isOccupied(g, point, guard)
		if err != nil {
			t.Fatal(err)
		}
		id := 0
		if yes {
			id = int(found.ID)
		}
		overlap, err := index.doesOverlap(g.Nodes[0], point, nil, guard)
		if err != nil {
			t.Fatal(err)
		}
		can, err := (&sizedOptimizer{g: g, spatialIndex: index}).indexedCanMove(g.Nodes[0], point, guard)
		if err != nil {
			t.Fatal(err)
		}
		sized, err := newSizedOptimizer(context.Background(), g, nil, nil, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		searchGuard, err := limits.NewOptimizationWorkGuard(context.Background(), "search", limits.MaxOptimizationWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		if err = sized.rebuildSpatialIndex(searchGuard); err != nil {
			t.Fatal(err)
		}
		distance, err := sized.findClosestUnoccupiedDistanceGuarded(g.Nodes[0], point, trial%2 == 0, nil, searchGuard)
		if err != nil {
			t.Fatal(err)
		}
		scratch := placementPointsScratch{}
		placements, err := sized.fillPlacementPointsGuarded(g.Nodes[0], point, distance, trial%2 == 0, &scratch, searchGuard)
		if err != nil {
			t.Fatal(err)
		}
		values := []any{}
		for _, v := range placements {
			values = append(values, []float64{v.X, v.Y})
		}
		searchWork := fmt.Sprint(searchGuard.Used())
		moved, err := sized.moveNodeToBestGuarded(context.Background(), g.Nodes[0], placements, trial%2 == 0, searchGuard)
		if err != nil {
			t.Fatal(err)
		}
		movePosition := []float64{g.Nodes[0].TopLeft.X, g.Nodes[0].TopLeft.Y}
		moveWork := fmt.Sprint(searchGuard.Used())
		out = append(out, map[string]any{"moved": moved, "movePosition": movePosition, "moveWork": moveWork, "distance": distance, "placements": values, "searchWork": searchWork, "trial": trial, "count": count, "x": point.X, "y": point.Y, "id": id, "overlap": overlap, "can": can, "rebuildWork": rebuildWork, "work": fmt.Sprint(guard.Used())})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
