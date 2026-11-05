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

func TestExportTypeScriptPlacementmetricsFixtures(t *testing.T) {
	path := os.Getenv("TALA_PLACEMENTMETRICS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 240; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = float64(10 + trial%30)
		ns := []*layoutgraph.Node{}
		records := []any{}
		for j := 0; j < 6; j++ {
			w, h := float64(10+(trial+j*7)%40), float64(10+(trial*3+j*11)%50)
			n := layoutgraph.NewNode(layoutgraph.EntityID(j+1), w, h)
			g.AddNewNodeToContainer(nil, n)
			x, y := float64((trial*13+j*29)%300), float64((trial*17+j*37)%300)
			n.TopLeft = geo.NewPoint(x, y)
			ns = append(ns, n)
			records = append(records, map[string]any{"x": x, "y": y, "w": w, "h": h})
		}
		for j := 1; j < 6; j++ {
			if j <= 1+trial%5 {
				edge := g.Connect(ns[0], ns[j])
				if j%2 == 0 {
					edge.SourceArrowhead = "triangle"
				} else {
					edge.TargetArrowhead = "triangle"
				}
			}
		}
		guard, err := limits.NewOptimizationWorkGuard(context.Background(), "test", limits.MaxOptimizationWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		guarded, err := optimizerAdjacents(ns[0], nil, guard)
		if err != nil {
			t.Fatal(err)
		}
		guardedIDs := []int{}
		for _, n := range guarded {
			guardedIDs = append(guardedIDs, int(n.ID))
		}
		work := fmt.Sprint(guard.Used())
		neighbors := adjacents(ns[0], nil)
		ids := []int{}
		for _, n := range neighbors {
			ids = append(ids, int(n.ID))
		}
		x, y := median(neighbors, false)
		sx, sy := median(neighbors, true)
		counts := directionCounts{left: trial % 5, right: trial / 5 % 5, top: trial / 25 % 5, bottom: trial / 125 % 5}
		transforms := []any{}
		for d := 0; d < 9; d++ {
			v := counts.transformsTo(geo.Orientation(d))
			transforms = append(transforms, []bool{v.mirrorX, v.mirrorY})
		}
		intersection, fits := intersectsOtherNode(g, ns[0], ns[1]), withinMaxSize(g)
		if err := mirrorAxes(context.Background(), g, trial%2 == 0, trial%3 == 0); err != nil {
			t.Fatal(err)
		}
		positions := []any{}
		for _, n := range ns {
			positions = append(positions, []float64{n.TopLeft.X, n.TopLeft.Y})
		}
		if err := direct(context.Background(), g, ns, nil, directOptions{checkEdgeLength: trial%2 == 0}); err != nil {
			t.Fatal(err)
		}
		directed := []any{}
		for _, n := range ns {
			directed = append(directed, []float64{n.TopLeft.X, n.TopLeft.Y})
		}
		out = append(out, map[string]any{"guardedIDs": guardedIDs, "guardedWork": work, "directed": directed, "mirrored": positions, "transforms": transforms, "trial": trial, "cell": g.CellSize, "nodes": records, "neighbors": ids, "median": []float64{x, y, sx, sy}, "intersection": intersection, "fits": fits})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
