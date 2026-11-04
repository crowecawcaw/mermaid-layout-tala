// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package trees

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/lib/geo"
	"github.com/d2lang/d2/lib/label"
	"os"
	"testing"
)

func TestExportTypeScriptTreeplacementFixtures(t *testing.T) {
	path := os.Getenv("TALA_TREEPLACEMENT_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 160; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []any{}
		edges := []any{}
		all := []*layoutgraph.Node{}
		count := 7 + trial%17
		for j := 0; j < count; j++ {
			w := 40 + float64((trial*7+j*13)%60)/2
			h := 30 + float64((trial*11+j*7)%50)/2
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(j+1), w, h))
			g.AddNodeToContainer(nil, n)
			all = append(all, n)
			nodes = append(nodes, map[string]any{"id": j + 1, "width": w, "height": h})
		}
		add := func(a, b int) {
			e := g.Connect(all[a], all[b])
			e.ID = layoutgraph.EntityID(len(g.Edges))
			switch trial % 4 {
			case 0:
				e.TargetArrowhead = "triangle"
			case 1:
				e.SourceArrowhead = "triangle"
			case 2:
				e.SourceArrowhead = "triangle"
				e.TargetArrowhead = "triangle"
			}
			if trial%3 == 0 {
				e.Label = &layoutgraph.Label{Width: float64(10 + (a+b)%30), Height: 12, Position: label.InsideMiddleCenter}
			}
			edges = append(edges, map[string]any{"id": e.ID, "from": a + 1, "to": b + 1, "source": e.SourceArrowhead, "target": e.TargetArrowhead, "label": e.Label})
		}
		start := 1
		if trial%2 == 0 {
			add(0, 1)
			add(1, 2)
			add(2, 0)
			start = 3
		}
		for j := start; j < count; j++ {
			parent := 0
			if j > start+2 {
				parent = start + (j-start-3)/2
			}
			add(parent, j)
		}
		g.Directions[nil] = []geo.Orientation{geo.Bottom, geo.Top, geo.Left, geo.Right}[trial%4]
		if err := Preprocess(context.Background(), g); err != nil {
			t.Fatal(err)
		}
		for j, n := range g.Nodes {
			n.TopLeft = geo.NewPoint(float64(j*230+100), float64(j%2*260+100))
		}
		guard, err := limits.NewWorkGuard(context.Background(), "placement fixture", limits.MaxPlaceTreesWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		if err = placeTrees(context.Background(), g, nil, guard); err != nil {
			t.Fatalf("trial %d: %v", trial, err)
		}
		positions := []any{}
		for _, n := range g.Nodes {
			positions = append(positions, map[string]any{"id": n.ID, "point": n.TopLeft, "width": n.Width, "height": n.Height})
		}
		labels := []any{}
		for _, e := range g.Edges {
			p := label.Unset
			if e.Label != nil {
				p = e.Label.Position
			}
			labels = append(labels, map[string]any{"id": e.ID, "position": p})
		}
		parents := map[string]int{}
		for n, tr := range g.NodeToTree {
			id := 0
			if tr.Parent != nil {
				id = int(tr.Parent.Node.ID)
			}
			parents[fmt.Sprint(n.ID)] = id
		}
		out = append(out, map[string]any{"name": fmt.Sprint(trial), "direction": g.Directions[nil], "nodes": nodes, "edges": edges, "expected": map[string]any{"nodes": positions, "edges": labels, "parents": parents, "work": fmt.Sprint(guard.Used())}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
