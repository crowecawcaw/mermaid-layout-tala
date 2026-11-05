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

func TestExportTypeScriptPackingguardFixtures(t *testing.T) {
	path := os.Getenv("TALA_PACKINGGUARD_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 4; i++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(30+i*10), float64(25+i*5)))
			n.TopLeft = geo.NewPoint(float64(i*110+trial%11), float64((i*47+trial*3)%160))
			nodes = append(nodes, n)
		}
		g.Containers[nil] = nodes
		root := layoutgraph.NewNode(10, 500, 500)
		root.TopLeft = geo.NewPoint(0, 0)
		desired := float64(450 + trial%9*20)
		if trial%3 == 0 {
			root.DesiredWidth = &desired
		} else if trial%3 == 1 {
			root.DesiredHeight = &desired
		}
		guard, _ := newWorkGuard(context.Background(), 1000000)
		score, err := binPackScoreGuarded(nodes, root, guard)
		if err != nil {
			t.Fatal(err)
		}
		scoreWork := guard.Used()
		guard, _ = newWorkGuard(context.Background(), 1000000)
		smallX, smallY, err := binPackSmallestDeltas([]layoutgraph.Nodes{nodes[:2], nodes[2:]}, guard)
		if err != nil {
			t.Fatal(err)
		}
		smallWork := guard.Used()
		guard, _ = newWorkGuard(context.Background(), 1000000)
		order := []int{}
		err = binPackReverseDFSWalk(nodes[0], func(n *layoutgraph.Node) error { order = append(order, int(n.ID)); return nil }, guard)
		if err != nil {
			t.Fatal(err)
		}
		walkWork := guard.Used()
		guard, _ = newWorkGuard(context.Background(), 1000000)
		err = binPackMoveNodeWithChildren(nodes[0], float64(trial%4), float64(trial%5), guard)
		if err != nil {
			t.Fatal(err)
		}
		moveWork := guard.Used()
		out = append(out, map[string]any{"trial": trial, "score": score, "scoreWork": scoreWork, "smallX": smallX, "smallY": smallY, "smallWork": smallWork, "order": order, "walkWork": walkWork, "moved": nodes[0].TopLeft, "moveWork": moveWork})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
