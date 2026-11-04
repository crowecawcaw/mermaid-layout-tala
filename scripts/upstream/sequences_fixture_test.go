// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package grouping

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"math/rand"
	"os"
	"sort"
	"testing"
)

func TestExportTypeScriptSequencesFixtures(t *testing.T) {
	path := os.Getenv("TALA_SEQUENCES_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 180; trial++ {
		g := layoutgraph.NewGraph()
		all := []*layoutgraph.Node{}
		nodes := []any{}
		edges := []any{}
		count := 6 + trial%25
		for j := 0; j < count; j++ {
			w := float64(10 + j%7*13)
			h := float64(20 + j%4*11)
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(j+1), w, h))
			all = append(all, n)
			parent := 0
			if trial%3 == 0 && j > 0 {
				parent = 1
				g.AddNodeToContainer(all[0], n)
			} else {
				g.AddNodeToContainer(nil, n)
			}
			shape := "Step"
			if j%5 == 0 {
				shape = "Rectangle"
			}
			n.SetShape(shape)
			if trial%7 != 0 {
				n.TopLeft = geo.NewPoint(float64(j*100), float64(j%3*100))
			}
			if trial%11 == 0 && j%7 == 0 {
				n.FixedTopLeft = geo.NewPoint(float64(j*100), float64(j%3*100))
			}
			nodes = append(nodes, map[string]any{"id": j + 1, "width": w, "height": h, "parent": parent, "shape": shape, "point": n.TopLeft, "fixed": n.FixedTopLeft})
		}
		add := func(a, b int) {
			e := g.Connect(all[a], all[b])
			e.ID = layoutgraph.EntityID(len(g.Edges))
			e.TargetArrowhead = "triangle"
			edges = append(edges, map[string]any{"id": e.ID, "from": a + 1, "to": b + 1})
		}
		for j := 1; j < count; j++ {
			if j%7 != 0 {
				add(j-1, j)
			}
			if trial%5 == 0 && j%3 == 0 {
				add(j-1, j)
			}
			if trial%4 == 0 && j > 2 {
				add(j-2, j)
			}
		}
		id := func(n *layoutgraph.Node) string {
			if n == nil {
				return "0"
			}
			return fmt.Sprint(n.ID)
		}
		ids := func(ns []*layoutgraph.Node) []string {
			r := []string{}
			for _, n := range ns {
				r = append(r, id(n))
			}
			return r
		}
		capture := func() any {
			containers := map[string][]string{}
			for n, ns := range g.Containers {
				containers[id(n)] = ids(ns)
			}
			geometry := map[string]any{}
			for _, n := range append(all, g.Nodes...) {
				es := []string{}
				for _, e := range n.Edges {
					es = append(es, fmt.Sprint(e.ID))
				}
				geometry[id(n)] = map[string]any{"point": n.TopLeft, "width": n.Width, "height": n.Height, "container": id(n.Container), "edges": es}
			}
			ends := []any{}
			for _, e := range g.Edges {
				ends = append(ends, []string{fmt.Sprint(e.ID), id(e.From), id(e.To)})
			}
			sequences := []any{}
			for _, v := range g.SequenceOrder() {
				s := g.Sequences[v]
				abs := []any{}
				for _, a := range s.EdgeAbductions {
					abs = append(abs, []string{fmt.Sprint(a.Edge.ID), id(a.OriginallyFrom), id(a.OriginallyTo), id(a.CurrentFrom), id(a.CurrentTo)})
				}
				sequences = append(sequences, map[string]any{"id": id(v), "nodes": ids(s.Nodes), "container": id(s.Container), "active": s.IsActive(), "abductions": abs})
			}
			return map[string]any{"nodes": ids(g.Nodes), "containers": containers, "geometry": geometry, "edges": ends, "sequences": sequences}
		}
		defining, err := SequenceDefiningEdges(context.Background(), g)
		if err != nil {
			t.Fatal(err)
		}
		defined := []int{}
		for e := range defining {
			defined = append(defined, int(e))
		}
		sort.Ints(defined)
		seed := int64(trial + 1)
		random := rand.New(rand.NewSource(seed))
		if err := AddSequences(context.Background(), g, random); err != nil {
			t.Fatal(err)
		}
		active := capture()
		for j, n := range g.Nodes {
			if n.TopLeft == nil {
				n.TopLeft = geo.NewPoint(float64(j*200+50), float64(j%3*200+50))
			}
		}
		Cleanup(g)
		clean := capture()
		ResetClusters(g)
		if err := AddSequences(context.Background(), g, rand.New(rand.NewSource(seed))); err != nil {
			t.Fatalf("trial %d repeat: %v", trial, err)
		}
		repeated := capture()
		out = append(out, map[string]any{"trial": trial, "seed": seed, "nodes": nodes, "edges": edges, "expected": map[string]any{"defined": defined, "active": active, "clean": clean, "repeated": repeated, "random": fmt.Sprint(random.Int63())}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
