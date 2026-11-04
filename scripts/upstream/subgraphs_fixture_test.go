// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package layoutgraph_test

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/trees"
	"github.com/d2lang/d2/lib/geo"
	"math/rand"
	"os"
	"testing"
)

func TestExportTypeScriptSubgraphsFixtures(t *testing.T) {
	path := os.Getenv("TALA_SUBGRAPHS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	rng := rand.New(rand.NewSource(831))
	out := []any{}
	for trial := 0; trial < 240; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = 123.25
		g.IsRootHierarchy = trial%2 == 0
		all := []*layoutgraph.Node{}
		nodes := []any{}
		edges := []any{}
		nears := []any{}
		for j := 0; j < 4+trial%25; j++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(j+1), 60, 40))
			all = append(all, n)
			parent := 0
			if j > 0 && trial%4 == 0 && j%3 == 0 {
				parent = 1
			}
			var container *layoutgraph.Node
			if parent > 0 {
				container = all[parent-1]
			}
			g.AddNodeToContainer(container, n)
			fixed := trial%5 == 0 && j%6 == 0
			if fixed {
				n.FixedTopLeft = geo.NewPoint(0, 0)
			}
			nodes = append(nodes, map[string]any{"id": j + 1, "parent": parent, "fixed": fixed})
		}
		for j := 1; j < len(all); j++ {
			if rng.Intn(3) != 0 {
				a := rng.Intn(j)
				e := g.Connect(all[a], all[j])
				e.ID = layoutgraph.EntityID(len(g.Edges))
				e.TargetArrowhead = "triangle"
				edges = append(edges, []int{a + 1, j + 1})
			}
			if rng.Intn(4) == 0 {
				a := rng.Intn(j)
				all[a].AddNear(all[j])
				nears = append(nears, []int{a + 1, j + 1})
			}
		}
		var external *layoutgraph.Node
		if trial%7 == 0 {
			external = layoutgraph.NewNode(999, 30, 20)
			external.Graph = g
			all[0].AddNear(external)
		}
		if trial%3 == 0 {
			if err := trees.Preprocess(context.Background(), g); err != nil {
				t.Fatal(err)
			}
		}
		options := layoutgraph.SplitOptions{IncludeContainers: trial&1 != 0, IncludeNears: trial&2 != 0, TraverseTrees: trial&4 != 0}
		guard, err := limits.NewWorkGuard(context.Background(), "split fixture", limits.MaxEngineWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		ids := func(ns []*layoutgraph.Node) []int {
			r := []int{}
			for _, n := range ns {
				r = append(r, int(n.ID))
			}
			return r
		}
		ignore := map[*layoutgraph.Node]struct{}{all[len(all)-1]: {}}
		reachable, err := g.Nodes[0].ReachableNodesContext(func(n *layoutgraph.Node) bool { return n.ID%5 != 0 }, options.IncludeContainers, options.IncludeNears, options.TraverseTrees, ignore, guard)
		if err != nil {
			t.Fatal(err)
		}
		reachWork := fmt.Sprint(guard.Used())
		graphs, journal, err := g.SplitSubgraphsTracked(context.Background(), options, guard)
		if err != nil {
			t.Fatal(err)
		}
		subs := []any{}
		owners := map[string]int{}
		for i, sub := range graphs {
			es := []int{}
			for _, e := range sub.Edges {
				es = append(es, int(e.ID))
			}
			subs = append(subs, map[string]any{"nodes": ids(sub.Nodes), "edges": es, "cell": sub.CellSize, "root": sub.IsRootHierarchy})
			for _, n := range sub.Nodes {
				owners[fmt.Sprint(n.ID)] = i + 1
				original, captured := journal.OriginalGraph(n)
				if !captured || original != g {
					t.Fatal("bad original graph")
				}
			}
		}
		journal.Restore()
		for _, n := range all {
			if n.Graph != g {
				t.Fatal("restore failed")
			}
		}
		if external != nil && external.Graph != g {
			t.Fatal("external restore failed")
		}
		out = append(out, map[string]any{"trial": trial, "nodes": nodes, "edges": edges, "nears": nears, "expected": map[string]any{"reachable": ids(reachable), "reachWork": reachWork, "graphs": subs, "owners": owners, "work": fmt.Sprint(guard.Used())}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
