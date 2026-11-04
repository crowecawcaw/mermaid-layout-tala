// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package packing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"github.com/d2lang/d2/lib/label"
	"os"
	"testing"
)

func TestExportTypeScriptCombineFixtures(t *testing.T) {
	path := os.Getenv("TALA_COMBINE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 180; trial++ {
		master := layoutgraph.NewGraph()
		graphs := []*layoutgraph.Graph{}
		nodes := []any{}
		edges := []any{}
		id := 0
		for i := 0; i < 2+trial%17; i++ {
			g := layoutgraph.NewGraph()
			g.CopyEntitiesFrom(master)
			for j := 0; j < 1+(i+trial)%3; j++ {
				id++
				w, h := float64(40+(i+j)%4*15)+0.25, float64(30+(i*3+j)%5*10)+0.75
				if trial%9 == 0 {
					w = 50
					h = 50
				}
				n := layoutgraph.NewNode(layoutgraph.EntityID(id), w, h)
				master.AddNodeUnchecked(n)
				g.AddNodeUnchecked(n)
				g.AddNodeToContainer(nil, n)
				n.TopLeft = geo.NewPoint(float64(j*110+i%3*17)-20.5, float64(j*90+i%4*23)-10.25)
				if i == 0 && j == 0 && trial%5 == 0 {
					n.FixedTopLeft = n.TopLeft.Copy()
				}
				if trial%4 == 0 {
					n.Label = &layoutgraph.Label{Width: 75.5, Height: 20.25, Position: label.OutsideTopCenter}
				}
				nodes = append(nodes, map[string]any{"id": id, "group": i, "width": w, "height": h, "point": n.TopLeft.Copy(), "fixed": n.FixedTopLeft, "label": n.Label, "parent": 0})
				if j > 0 {
					e := g.Connect(g.Nodes[j-1], n)
					e.ID = layoutgraph.EntityID(len(master.Edges) + 1)
					master.AddEdge(e)
					e.Points = []*geo.Point{g.Nodes[j-1].Center(), geo.NewPoint(n.TopLeft.X-50, n.TopLeft.Y+20), n.Center()}
					e.TargetArrowhead = "triangle"
					if trial%3 == 0 {
						e.Label = &layoutgraph.Label{Width: 65.75, Height: 15.5, Position: label.InsideMiddleCenter}
					}
					route := []*geo.Point{}
					for _, p := range e.Points {
						route = append(route, p.Copy())
					}
					edges = append(edges, map[string]any{"id": e.ID, "group": i, "from": e.From.ID, "to": e.To.ID, "points": route, "label": e.Label})
				}
			}

			if trial%6 == 0 {
				id++
				parent := g.Nodes[0]
				child := layoutgraph.NewNode(layoutgraph.EntityID(id), 10, 10)
				master.AddNodeUnchecked(child)
				child.Graph = g
				g.AddNodeToContainer(parent, child)
				child.TopLeft = geo.NewPoint(parent.TopLeft.X+10, parent.TopLeft.Y+10)
				nodes = append(nodes, map[string]any{"id": id, "group": i, "width": 10, "height": 10, "point": child.TopLeft.Copy(), "fixed": nil, "label": nil, "parent": parent.ID})
			}
			graphs = append(graphs, g)
		}
		obstacles := []geo.Box{}
		if trial%2 == 0 {
			obstacles = append(obstacles, *geo.NewBox(geo.NewPoint(100, 150), 230, 170), *geo.NewBox(geo.NewPoint(-layoutgraph.ContainerPadding, -layoutgraph.ContainerPadding), 400, 300))
		}
		combined, err := CombineSubgraphs(context.Background(), master, graphs, obstacles)
		if err != nil {
			t.Fatalf("trial %d: %v", trial, err)
		}
		positions := []any{}
		for _, n := range combined.Nodes {
			positions = append(positions, map[string]any{"id": n.ID, "point": n.TopLeft, "owner": n.Graph == combined})
		}
		routes := []any{}
		for _, e := range combined.Edges {
			routes = append(routes, map[string]any{"id": e.ID, "points": e.Points})
		}
		out = append(out, map[string]any{"trial": trial, "nodes": nodes, "edges": edges, "obstacles": obstacles, "expected": map[string]any{"nodes": positions, "edges": routes}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
