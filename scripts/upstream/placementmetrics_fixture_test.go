// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placement

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/lib/geo"
	"math/rand"
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
		placements := []any{}
		iterPlacementsAroundPoint(ns[0], 1, 2, trial%2 == 0, func(x, y float64) bool { placements = append(placements, []float64{x, y}); return false })
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
		gx, gy, err := optimizerMedian(guarded, true, guard)
		if err != nil {
			t.Fatal(err)
		}
		move, err := optimizerCanMove(ns[0], geo.NewPoint(float64(trial%100), float64(trial*3%100)), true, guard)
		if err != nil {
			t.Fatal(err)
		}
		if err = chargeOptimizerScoring(ns[0], nil, true, guard); err != nil {
			t.Fatal(err)
		}
		metricWork := fmt.Sprint(guard.Used())
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
		rng := rand.New(rand.NewSource(int64(trial + 1)))
		sized, err := newSizedOptimizer(context.Background(), g, nil, nil, rng, nil)
		if err != nil {
			t.Fatal(err)
		}
		sizedGuard, err := limits.NewOptimizationWorkGuard(context.Background(), "sized", limits.MaxOptimizationWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		sizedMedian, err := sized.medianPointGuarded(ns[0], 1.5, nil, sizedGuard)
		if err != nil {
			t.Fatal(err)
		}
		sizedNext := fmt.Sprint(rng.Int63())
		sizedWork := fmt.Sprint(sizedGuard.Used())
		compaction := []any{}
		for mask := 0; mask < 4; mask++ {
			horizontal := mask&1 != 0
			include := mask&2 != 0
			vedges, err := visibilityEdges(context.Background(), g, horizontal, include)
			if err != nil {
				t.Fatal(err)
			}
			pairs := []any{}
			for _, e := range vedges {
				pairs = append(pairs, []int{int(e.From.ID), int(e.To.ID)})
			}
			ordered := orderedAlongAxis(g, horizontal)
			ids := []int{}
			for _, n := range ordered {
				ids = append(ids, int(n.ID))
			}
			moves, err := candidateMoves(context.Background(), g, ns[0], 2, horizontal, include, 0, vedges)
			if err != nil {
				t.Fatal(err)
			}
			points := []any{}
			for _, p := range moves {
				points = append(points, []float64{p.X, p.Y})
			}
			compaction = append(compaction, map[string]any{"edges": pairs, "order": ids, "points": points})
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
		moveGuard, err := limits.NewOptimizationWorkGuard(context.Background(), "move", limits.MaxOptimizationWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		point := ns[0].TopLeft.Copy()
		candidates := []*geo.Point{point, geo.NewPoint(point.X+100, point.Y), geo.NewPoint(point.X, point.Y+100)}
		moved, err := moveNodeToBest(context.Background(), g, ns[0], candidates, nil, trial%2 == 0, moveGuard)
		if err != nil {
			t.Fatal(err)
		}
		movePosition := []float64{ns[0].TopLeft.X, ns[0].TopLeft.Y}
		moveWork := fmt.Sprint(moveGuard.Used())
		optim, err := newSizelessOptimizer(context.Background(), g, nil)
		if err != nil {
			t.Fatal(err)
		}
		candidateGuard, err := limits.NewOptimizationWorkGuard(context.Background(), "candidate", limits.MaxOptimizationWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		center := geo.NewPoint(float64(trial%100), float64(trial*3%100))
		distance, err := optim.findClosestUnoccupiedDistanceGuarded(ns[0], center, candidateGuard)
		if err != nil {
			t.Fatal(err)
		}
		points, err := optim.placementPointsGuarded(ns[0], center, distance, candidateGuard)
		if err != nil {
			t.Fatal(err)
		}
		pointValues := []any{}
		for _, p := range points {
			pointValues = append(pointValues, []float64{p.X, p.Y})
		}
		candidateWork := fmt.Sprint(candidateGuard.Used())
		initial, err := nodeCandidatePositions(context.Background(), ns[0], g, optim)
		if err != nil {
			t.Fatal(err)
		}
		initialPoints := []any{}
		for _, p := range initial {
			initialPoints = append(initialPoints, []float64{p.X, p.Y})
		}
		sizeGuard, err := limits.NewOptimizationWorkGuard(context.Background(), "sizeless", limits.MaxOptimizationWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		sizeMoved, err := optim.moveNodeToBestGuarded(context.Background(), ns[0], points, sizeGuard)
		if err != nil {
			t.Fatal(err)
		}
		sizePosition := []float64{ns[0].TopLeft.X, ns[0].TopLeft.Y}
		sizeWork := fmt.Sprint(sizeGuard.Used())
		rotateAround(ns[0], g, ns[1], 1+trial%3, trial%2 == 0)
		rotation := []float64{ns[0].TopLeft.X, ns[0].TopLeft.Y}
		out = append(out, map[string]any{"compaction": compaction, "rotation": rotation, "sizedMedian": []float64{sizedMedian.X, sizedMedian.Y}, "sizedNext": sizedNext, "sizedWork": sizedWork, "placements": placements, "sizeMoved": sizeMoved, "sizePosition": sizePosition, "sizeWork": sizeWork, "initialPoints": initialPoints, "candidates": pointValues, "candidateDistance": distance, "candidateWork": candidateWork, "movePosition": movePosition, "moved": moved, "moveWork": moveWork, "guardedMedian": []float64{gx, gy}, "guardedMove": move, "metricWork": metricWork, "guardedIDs": guardedIDs, "guardedWork": work, "directed": directed, "mirrored": positions, "transforms": transforms, "trial": trial, "cell": g.CellSize, "nodes": records, "neighbors": ids, "median": []float64{x, y, sx, sy}, "intersection": intersection, "fits": fits})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
