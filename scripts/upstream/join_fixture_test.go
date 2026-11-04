// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package grouping

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

func TestExportTypeScriptJoinFixtures(t *testing.T) {
	path := os.Getenv("TALA_JOIN_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 180; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = float64(10 + trial%7*10)
		all := []*layoutgraph.Node{}
		nodes := []any{}
		count := 2 + trial%18
		for j := 0; j < count; j++ {
			w := float64(40 + j%3*15)
			h := float64(30 + j%4*10)
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(j+1), w, h))
			all = append(all, n)
			g.AddNodeToContainer(nil, n)
			n.TopLeft = geo.NewPoint(float64(j*470+(trial%5)*110), float64((j*trial+7)%9*230))
			if trial%4 == 0 && j == 0 {
				n.FixedTopLeft = n.TopLeft.Copy()
			}
			nodes = append(nodes, map[string]any{"id": j + 1, "width": w, "height": h, "point": n.TopLeft.Copy(), "fixed": n.FixedTopLeft})
		}
		for j := 1; j < count; j++ {
			if trial%6 < 4 {
				e := g.Connect(all[j-1], all[j])
				e.ID = layoutgraph.EntityID(j)
				e.TargetArrowhead = "triangle"
			} else if trial%6 == 4 {
				all[j-1].AddNear(all[j])
			}
		}
		guard, err := limits.NewWorkGuard(context.Background(), "join fixture", limits.MaxTransactionWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		clusters, err := layoutgraph.Nodes(g.Nodes).DistanceClustersWithWorkGuard(3*g.CellSize, guard)
		if err != nil {
			t.Fatal(err)
		}
		ids := []any{}
		for _, c := range clusters {
			ns := []int{}
			for _, n := range c {
				ns = append(ns, int(n.ID))
			}
			ids = append(ids, ns)
		}
		clusterWork := fmt.Sprint(guard.Used())
		ctx := layoutgraph.ContextWithTransactionWorkGuard(context.Background(), guard)
		if err := JoinDistancedClusters(ctx, g); err != nil {
			t.Fatalf("trial %d: %v", trial, err)
		}
		positions := []*geo.Point{}
		for _, n := range g.Nodes {
			positions = append(positions, n.TopLeft)
		}
		out = append(out, map[string]any{"trial": trial, "cell": g.CellSize, "nodes": nodes, "expected": map[string]any{"clusters": ids, "clusterWork": clusterWork, "positions": positions, "work": fmt.Sprint(guard.Used())}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
