// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package trees

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

func TestExportTypeScriptDiscoveryFixtures(t *testing.T) {
	path := os.Getenv("TALA_DISCOVERY_FIXTURES")
	if path == "" {
		t.Skip("set TALA_DISCOVERY_FIXTURES")
	}
	rng := rand.New(rand.NewSource(83))
	out := []any{}
	for trial := 0; trial < 200; trial++ {
		g := layoutgraph.NewGraph()
		all := []*layoutgraph.Node{}
		nodes := []any{}
		edges := []any{}
		count := 2 + rng.Intn(44)
		for j := 0; j < count; j++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(j+1), 60, 40))
			all = append(all, n)
			var parent *layoutgraph.Node
			parentID := 0
			if trial%5 == 0 && j > 0 && j%2 == 0 {
				parent = all[0]
				parentID = 1
			}
			g.AddNodeToContainer(parent, n)
			fixed := trial%7 == 0 && j%8 == 0
			near := trial%11 == 0 && j%9 == 0
			table := trial%13 == 0 && j == 1
			if fixed {
				n.FixedTopLeft = geo.NewPoint(0, 0)
			}
			if near {
				n.Nears[all[0]] = struct{}{}
			}
			if table {
				n.SetShape("Table")
			}
			nodes = append(nodes, map[string]any{"id": j + 1, "parent": parentID, "fixed": fixed, "near": near, "table": table})
		}
		add := func(a, b int, src, dst string) {
			e := g.Connect(all[a], all[b])
			e.ID = layoutgraph.EntityID(len(g.Edges))
			e.SourceArrowhead = layoutgraph.Arrowhead(src)
			e.TargetArrowhead = layoutgraph.Arrowhead(dst)
			edges = append(edges, map[string]any{"id": e.ID, "from": a + 1, "to": b + 1, "source": src, "target": dst})
		}
		for j := 1; j < count; j++ {
			src, dst := "", "triangle"
			switch trial % 6 {
			case 1:
				src, dst = "triangle", ""
			case 2:
				src, dst = "triangle", "triangle"
			case 3:
				src, dst = "", ""
			case 4:
				if rng.Intn(2) == 0 {
					src, dst = "triangle", ""
				}
			case 5:
				dst = []string{"", "triangle", "diamond"}[rng.Intn(3)]
			}
			add(rng.Intn(j), j, src, dst)
		}
		if trial%4 == 0 {
			for j := 0; j < count/5; j++ {
				add(rng.Intn(count), rng.Intn(count), "", "triangle")
			}
		}
		guard, err := limits.NewWorkGuard(context.Background(), "discovery fixture", limits.MaxEngineWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		trees, err := extractTrees(g, guard)
		if err != nil {
			t.Fatal(err)
		}
		g.Trees = trees
		if err := guard.Step(); err != nil {
			t.Fatal(err)
		}
		if err := guard.Check(); err != nil {
			t.Fatal(err)
		}
		if err := putBackNonBranchingTrees(g, guard); err != nil {
			t.Fatal(err)
		}
		if err := buildNodeToTreeGuarded(g, guard); err != nil {
			t.Fatal(err)
		}
		if err := guard.Finish(); err != nil {
			t.Fatal(err)
		}
		nodeIDs := []int64{}
		edgeIDs := []int64{}
		incidence := map[string]any{}
		containers := map[string]any{}
		members := map[string]any{}
		roots := map[string]any{}
		for _, n := range g.Nodes {
			nodeIDs = append(nodeIDs, int64(n.ID))
		}
		for _, e := range g.Edges {
			edgeIDs = append(edgeIDs, int64(e.ID))
		}
		for _, n := range all {
			ids := []int64{}
			for _, e := range n.Edges {
				ids = append(ids, int64(e.ID))
			}
			incidence[fmt.Sprint(n.ID)] = ids
		}
		for c, children := range g.Containers {
			key := "0"
			if c != nil {
				key = fmt.Sprint(c.ID)
			}
			ids := []int64{}
			for _, n := range children {
				ids = append(ids, int64(n.ID))
			}
			containers[key] = ids
		}
		var encodeTree func(*layoutgraph.Tree) any
		encodeTree = func(tree *layoutgraph.Tree) any {
			children := []any{}
			for _, child := range tree.Children {
				children = append(children, encodeTree(child))
			}
			parentID := int64(0)
			if tree.Parent != nil {
				parentID = int64(tree.Parent.Node.ID)
			}
			edgeID := int64(0)
			if tree.SentinelEdge != nil {
				edgeID = int64(tree.SentinelEdge.ID)
			}
			return map[string]any{"node": tree.Node.ID, "parent": parentID, "edge": edgeID, "children": children}
		}
		for n, ts := range g.Trees {
			encoded := []any{}
			for _, tree := range ts {
				encoded = append(encoded, encodeTree(tree))
			}
			roots[fmt.Sprint(n.ID)] = encoded
		}
		for n, tree := range g.NodeToTree {
			members[fmt.Sprint(n.ID)] = tree.Node.ID
		}
		out = append(out, map[string]any{"name": fmt.Sprintf("discovery-%03d", trial), "nodes": nodes, "edges": edges, "expected": map[string]any{"nodes": nodeIDs, "edges": edgeIDs, "incidence": incidence, "containers": containers, "roots": roots, "members": members, "work": fmt.Sprint(guard.Used())}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
