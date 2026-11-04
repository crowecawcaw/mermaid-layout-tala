// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package layoutgraph

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptPreflightFixtures(t *testing.T) {
	path := os.Getenv("TALA_PREFLIGHT_FIXTURES")
	if path == "" {
		t.Skip("set TALA_PREFLIGHT_FIXTURES")
	}
	out := []any{}
	for trial := 0; trial < 42; trial++ {
		g := NewGraph()
		g.NodeToTree = make(map[*Node]*Tree)
		n := NewNode(1, 40, 30)
		n.Graph = g
		g.Nodes = []*Node{n}
		tr := &Tree{Node: n}
		c := &Tree{Node: NewNode(2, 30, 20), Parent: tr}
		tr.Children = []*Tree{c}
		switch trial {
		case 0:
			g = NewGraph()
		case 1:
			g.Nodes = []*Node{nil}
		case 2:
			g.Edges = []*Edge{nil}
		case 3:
			g.Edges = []*Edge{NewEdge(n, nil)}
		case 4:
			g.Containers[nil] = []*Node{nil}
		case 5:
			g.Clusters[n] = nil
		case 6:
			g.Sequences[n] = nil
		case 7:
			g.Trees[nil] = []*Tree{nil}
		case 8:
			n.Nears[nil] = struct{}{}
		case 9:
			e := g.Connect(n, n)
			e.Points = []*geo.Point{nil}
		case 10:
			n.Cluster = &Cluster{}
		case 11:
			n.isClusterVessel = true
		case 12:
			n.Container = n
		case 13:
			v := NewNode(2, 20, 20)
			v.Graph = g
			v.Container = n
			n.Cluster = &Cluster{Vessel: v}
		case 14:
			n.Cluster = &Cluster{Vessel: n}
		case 15:
			n.isContainer = true
			g.Containers[n] = []*Node{n}
		case 16:
			tr.Children = []*Tree{tr}
			g.Trees[nil] = []*Tree{tr}
		case 17:
			tr.Children = nil
			tr.Parent = tr
			g.Trees[nil] = []*Tree{tr}
		case 18:
			g.Trees[nil] = []*Tree{tr, tr}
		case 19:
			tr.Children = []*Tree{c, c}
			g.Trees[nil] = []*Tree{tr}
		case 20:
			c.Parent = nil
			g.Trees[nil] = []*Tree{tr}
		case 21:
			g.Trees[nil] = []*Tree{{Node: n}, {Node: n}}
		case 22:
			tr.Parent = &Tree{Node: NewNode(3, 20, 20)}
			g.Trees[nil] = []*Tree{tr}
		case 23:
			p := &Tree{Node: NewNode(3, 20, 20), Children: []*Tree{tr}}
			tr.Parent = p
			g.Trees[nil] = []*Tree{tr}
		case 24:
			g.NodeToTree[n] = c
		case 25:
			g.Trees[nil] = []*Tree{tr}
			g.NodeToTree[n] = tr
		case 26:
			g.Trees[nil] = []*Tree{tr}
			other := &Tree{Node: NewNode(4, 20, 20)}
			g.NodeToTree[other.Node] = other
		case 27:
			g.Nodes = make([]*Node, 0, 1000001)
		case 28:
			e := g.Connect(n, n)
			e.Points = make([]*geo.Point, 0, 1000001)
		case 29, 30, 31:
			depth := 255 + trial - 29
			prev := n
			for j := 1; j < depth; j++ {
				p := NewNode(EntityID(j+1), 20, 20)
				prev.Container = p
				prev = p
			}
		case 32, 33, 34:
			depth := 255 + trial - 32
			prev := n
			for j := 1; j < depth; j++ {
				p := NewNode(EntityID(j+1), 20, 20)
				prev.isContainer = true
				g.Containers[prev] = []*Node{p}
				prev = p
			}
		case 35, 36, 37:
			depth := 255 + trial - 35
			tr.Children = nil
			prev := tr
			for j := 1; j < depth; j++ {
				p := &Tree{Node: NewNode(EntityID(j+1), 20, 20), Parent: prev}
				prev.Children = []*Tree{p}
				prev = p
			}
			g.Trees[nil] = []*Tree{tr}
		case 38:
			g.Trees[nil] = []*Tree{tr}
			g.NodeToTree[n] = tr
			g.NodeToTree[c.Node] = c
		case 39:
			n.Hierarchy = &Hierarchy{level: map[*Node]int{nil: 0}}
		case 40:
			n.HerdAssignment = &HerdAssignment{sameSidePaired: map[*Node]struct{}{nil: {}}}
		case 41:
			g.Hubs[n] = []*Node{nil}
		}
		err := validateEngineGraph(context.Background(), "fixture", g)
		message := ""
		if err != nil {
			message = err.Error()
		}
		out = append(out, map[string]any{"trial": trial, "error": message})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
