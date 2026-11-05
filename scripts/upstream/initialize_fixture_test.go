// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placement

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"math/rand"
	"os"
	"testing"
)

func TestExportTypeScriptInitializeFixtures(t *testing.T) {
	path := os.Getenv("TALA_INITIALIZE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = float64(20 + trial%20)
		count := 2 + trial%5
		nodes := []*layoutgraph.Node{}
		edges := []any{}
		for j := 0; j < count; j++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(j+1), float64(20+j*5), float64(20+j*3))
			g.AddNewNodeToContainer(nil, n)
			nodes = append(nodes, n)
		}
		if trial%4 == 0 {
			nodes[0].FixedTopLeft = geo.NewPoint(float64(trial%60), float64(trial%45))
		}
		for j := 1; j < count; j++ {
			e := g.Connect(nodes[j-1], nodes[j])
			if (trial+j)%3 == 0 {
				e.SourceArrowhead = "triangle"
			} else {
				e.TargetArrowhead = "triangle"
			}
			edges = append(edges, map[string]any{"source": string(e.SourceArrowhead), "target": string(e.TargetArrowhead)})
		}
		stress, err := initializeByGraphDistance(context.Background(), g)
		if err != nil {
			t.Fatal(err)
		}
		stressPositions := []any{}
		if stress {
			for _, n := range nodes {
				stressPositions = append(stressPositions, []float64{n.TopLeft.X, n.TopLeft.Y})
				n.TopLeft = nil
			}
		}
		if err := initializeNodes(context.Background(), g); err != nil {
			t.Fatal(err)
		}
		positions := []any{}
		for _, n := range nodes {
			positions = append(positions, []float64{n.TopLeft.X, n.TopLeft.Y})
		}
		rng := rand.New(rand.NewSource(int64(trial + 1)))
		optim, err := newSizelessOptimizer(context.Background(), g, rng)
		if err != nil {
			t.Fatal(err)
		}
		if err = optim.optimize(context.Background(), 1.5); err != nil {
			t.Fatal(err)
		}
		optimized := []any{}
		for _, n := range nodes {
			optimized = append(optimized, []float64{n.TopLeft.X, n.TopLeft.Y})
		}
		nextRandom := fmt.Sprint(rng.Int63())
		for _, n := range nodes {
			n.TopLeft.X *= g.CellSize * 3
			n.TopLeft.Y *= g.CellSize * 3
		}
		sizedRng := rand.New(rand.NewSource(int64(trial + 101)))
		sized, err := newSizedOptimizer(context.Background(), g, nil, nil, sizedRng, nil)
		if err != nil {
			t.Fatal(err)
		}
		sizedChanged, err := sized.optimize(context.Background(), 0.5)
		if err != nil {
			t.Fatal(err)
		}
		sizedPositions := []any{}
		for _, n := range nodes {
			sizedPositions = append(sizedPositions, []float64{n.TopLeft.X, n.TopLeft.Y})
		}
		sizedNext := fmt.Sprint(sizedRng.Int63())
		out = append(out, map[string]any{"sizedChanged": sizedChanged, "sizedPositions": sizedPositions, "sizedNext": sizedNext, "optimized": optimized, "nextRandom": nextRandom, "stress": stress, "stressPositions": stressPositions, "trial": trial, "cell": g.CellSize, "count": count, "fixed": trial%4 == 0, "edges": edges, "positions": positions})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
