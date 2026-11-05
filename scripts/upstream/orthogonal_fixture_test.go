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

func TestExportTypeScriptOrthogonalFixtures(t *testing.T) {
	path := os.Getenv("TALA_ORTHOGONAL_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 48; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = 40
		count := 2 + trial%4
		nodes := []*layoutgraph.Node{}
		for i := 0; i < count; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), 40, 40)
			g.AddNewNodeToContainer(nil, n)
			nodes = append(nodes, n)
		}
		if trial%7 == 0 {
			nodes[0].FixedTopLeft = geo.NewPoint(20, 35)
		}
		for i := 1; i < count; i++ {
			from := i - 1
			if trial%3 == 1 {
				from = 0
			}
			e := g.Connect(nodes[from], nodes[i])
			e.TargetArrowhead = "triangle"
		}
		seed := int64(trial + 1)
		rng := rand.New(rand.NewSource(seed))
		if err := placeNodesOrthogonally(context.Background(), nil, g, nil, rng, nil, seed); err != nil {
			t.Fatal(err)
		}
		points := []any{}
		for _, n := range nodes {
			points = append(points, []float64{n.TopLeft.X, n.TopLeft.Y})
		}
		out = append(out, map[string]any{"trial": trial, "count": count, "points": points, "next": fmt.Sprint(rng.Int63()), "turn": g.RoutingCosts().Turn})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
