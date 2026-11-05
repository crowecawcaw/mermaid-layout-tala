// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package packing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptPackingcandidatesFixtures(t *testing.T) {
	path := os.Getenv("TALA_PACKINGCANDIDATES_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 4; i++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), 40, 30))
			n.TopLeft = geo.NewPoint(float64(i%2*200), float64(i/2*150+trial%7*8))
			nodes = append(nodes, n)
		}
		g.Containers[nil] = nodes
		e := g.Connect(nodes[0], nodes[1])
		g.Connect(nodes[0], nodes[2])
		g.Connect(nodes[0], nodes[3])
		e.Points = []*geo.Point{geo.NewPoint(40, 15), geo.NewPoint(100, 15), geo.NewPoint(100, 45), geo.NewPoint(200, 45)}
		guard, _ := newWorkGuard(context.Background(), 1000000)
		points, err := placementCandidatesGuarded(nodes, nil, trial%2 == 0, trial%3 == 0, guard)
		if err != nil {
			t.Fatal(err)
		}
		pointWork := guard.Used()
		guard, _ = newWorkGuard(context.Background(), 1000000)
		segments, err := estimateRouteSegments(nodes, g, float64(trial%5*50), float64(trial%6*40), guard)
		if err != nil {
			t.Fatal(err)
		}
		segmentWork := guard.Used()
		guard, _ = newWorkGuard(context.Background(), 1000000)
		routed, err := routedEdgeSegments(g.Edges, trial%2 == 0, guard)
		if err != nil {
			t.Fatal(err)
		}
		routes := []*geo.Segment{}
		for _, seg := range routed {
			routes = append(routes, &seg.Segment)
		}
		routedWork := guard.Used()
		guard, _ = newWorkGuard(context.Background(), 1000000)
		blocked, err := blocksRoutesWithDeltasGuarded(g, nodes[:2], []layoutgraph.Nodes{nodes[2:]}, segments, float64(trial%5*50), float64(trial%6*40), guard)
		if err != nil {
			t.Fatal(err)
		}
		blockWork := guard.Used()
		out = append(out, map[string]any{"trial": trial, "points": points, "pointWork": pointWork, "segments": segments, "segmentWork": segmentWork, "routes": routes, "routedWork": routedWork, "blocked": blocked, "blockWork": blockWork})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
