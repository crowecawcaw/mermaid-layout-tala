// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package layoutgraph

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"testing"
)

func TestExportTypeScriptAbductionFixtures(t *testing.T) {
	path := os.Getenv("TALA_ABDUCTION_FIXTURES")
	if path == "" {
		t.Skip()
	}
	rng := rand.New(rand.NewSource(841))
	out := []any{}
	for trial := 0; trial < 240; trial++ {
		g := NewGraph()
		all := []*Node{}
		nodes := []any{}
		edges := []any{}
		for j := 0; j < 6+trial%25; j++ {
			n := g.AddNode(NewNode(EntityID(j+1), 60, 40))
			all = append(all, n)
			parent := 0
			if j >= 2 && j%3 != 0 {
				parent = 1 + rng.Intn(j)
			}
			var container *Node
			if parent > 0 {
				container = all[parent-1]
			}
			g.AddNodeToContainer(container, n)
			nodes = append(nodes, map[string]any{"id": j + 1, "parent": parent})
		}
		for j := 0; j < 5+trial%35; j++ {
			a, b := rng.Intn(len(all)), rng.Intn(len(all))
			e := g.Connect(all[a], all[b])
			e.ID = EntityID(j + 1)
			edges = append(edges, []int{a + 1, b + 1})
		}
		var container *Node
		containerID := 0
		if trial%3 == 0 {
			container = all[0]
			containerID = 1
		}
		view := NewGraph()
		view.CopyEntitiesFrom(g)
		for _, n := range g.Containers[container] {
			view.AddNodeUnchecked(n)
		}
		id := func(n *Node) int {
			if n == nil {
				return 0
			}
			return int(n.ID)
		}
		abs := g.AbductEdges(container, view)
		capture := func(remaining []*EdgeAbduction) json.RawMessage {
			ends := []any{}
			for _, e := range g.Edges {
				ends = append(ends, []int{int(e.ID), id(e.From), id(e.To)})
			}
			incidence := map[string][]int{}
			for _, n := range all {
				es := []int{}
				for _, e := range n.Edges {
					es = append(es, int(e.ID))
				}
				incidence[fmt.Sprint(n.ID)] = es
			}
			abductions := []any{}
			for _, a := range abs {
				abductions = append(abductions, []int{int(a.Edge.ID), id(a.OriginallyFrom), id(a.OriginallyTo), id(a.CurrentFrom), id(a.CurrentTo)})
			}
			rest := []int{}
			for _, a := range remaining {
				rest = append(rest, int(a.Edge.ID))
			}
			viewEdges := []int{}
			for _, e := range view.Edges {
				viewEdges = append(viewEdges, int(e.ID))
			}
			data, err := json.Marshal(map[string]any{"edges": ends, "incidence": incidence, "abductions": abductions, "remaining": rest, "viewEdges": viewEdges})
			if err != nil {
				t.Fatal(err)
			}
			return data
		}
		abducted := capture(nil)
		remaining := view.RestoreEdgeAbductions(abs)
		restoredView := capture(remaining)
		g.ApplyEdgeAbductions(abs)
		applied := capture(nil)
		remaining = g.RestoreEdgeAbductions(abs)
		restored := capture(remaining)
		out = append(out, map[string]any{"trial": trial, "nodes": nodes, "edges": edges, "container": containerID, "expected": map[string]any{"abducted": abducted, "restoredView": restoredView, "applied": applied, "restored": restored}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
