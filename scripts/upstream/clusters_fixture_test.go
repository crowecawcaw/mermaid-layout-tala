// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package grouping

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/lib/geo"
	"github.com/d2lang/d2/lib/label"
	"math/rand"
	"os"
	"testing"
)

func TestExportTypeScriptClustersFixtures(t *testing.T) {
	path := os.Getenv("TALA_CLUSTERS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 240; trial++ {
		g := layoutgraph.NewGraph()
		all := []*layoutgraph.Node{}
		nodes := []any{}
		edges := []any{}
		count := 4 + trial%40
		for j := 0; j < count; j++ {
			w := float64(40 + (j%3)*10)
			h := float64(40 + (trial%3)*10)
			if trial%11 == 0 {
				w = 40
			}
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(j+1), w, h))
			all = append(all, n)
			parent := 0
			if trial%3 == 0 && j > 0 {
				g.AddNodeToContainer(all[0], n)
				parent = 1
			} else {
				g.AddNodeToContainer(nil, n)
			}
			shape := "Rectangle"
			if trial%5 == 0 && j%3 == 0 {
				shape = "Circle"
			}
			if trial%13 == 0 && j == 3 {
				shape = "Table"
			}
			n.SetShape(shape)
			if trial%7 != 0 {
				n.TopLeft = geo.NewPoint(float64(j%4*100), float64(j%5*80))
			}
			if trial%9 == 0 && j%7 == 0 {
				n.FixedTopLeft = geo.NewPoint(float64(j%4*100), float64(j%5*80))
			}
			if trial%4 == 0 {
				n.Label = &layoutgraph.Label{Width: float64(j*4 + 20), Height: 20, Position: label.InsideMiddleCenter}
				if j%2 == 0 {
					n.Icon = &layoutgraph.Icon{Position: label.InsideTopCenter}
				}
			}
			nodes = append(nodes, map[string]any{"id": j + 1, "width": w, "height": h, "parent": parent, "shape": shape, "point": n.TopLeft, "fixed": n.FixedTopLeft, "label": n.Label, "icon": n.Icon})
		}
		add := func(a, b int) {
			e := g.Connect(all[a], all[b])
			e.ID = layoutgraph.EntityID(len(g.Edges))
			if trial%4 != 0 {
				e.TargetArrowhead = "triangle"
			}
			if trial%8 == 0 {
				e.SourceArrowhead = "diamond"
				e.TargetArrowhead = "diamond"
			}
			if trial%17 == 0 && b%3 == 0 {
				idx := 1
				e.ToTableColumnIndex = &idx
			}
			edges = append(edges, map[string]any{"id": e.ID, "from": a + 1, "to": b + 1, "source": e.SourceArrowhead, "target": e.TargetArrowhead, "column": e.ToTableColumnIndex})
		}
		for j := 2; j < count; j++ {
			add(0, j)
			if j%5 == 0 {
				add(1, j)
			}
			if trial%10 == 0 {
				add(0, j)
			}
		}
		if trial%12 == 0 {
			add(2, 2)
		}
		seed := int64(trial + 1)
		random := rand.New(rand.NewSource(seed))
		guard, err := limits.NewWorkGuard(context.Background(), "cluster fixture", limits.MaxTransactionWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		ctx := layoutgraph.ContextWithTransactionWorkGuard(context.Background(), guard)
		if err := AddClusters(ctx, g, seed, random); err != nil {
			t.Fatalf("trial %d: %v", trial, err)
		}
		ids := func(ns []*layoutgraph.Node) []string {
			r := []string{}
			for _, n := range ns {
				r = append(r, fmt.Sprint(n.ID))
			}
			return r
		}
		id := func(n *layoutgraph.Node) string {
			if n == nil {
				return "0"
			}
			return fmt.Sprint(n.ID)
		}
		clusters := []any{}
		for _, v := range g.ClusterOrder() {
			c := g.Clusters[v]
			abs := []any{}
			for _, a := range c.EdgeAbductions {
				abs = append(abs, []string{fmt.Sprint(a.Edge.ID), id(a.OriginallyFrom), id(a.OriginallyTo), id(a.CurrentFrom), id(a.CurrentTo)})
			}
			clusters = append(clusters, map[string]any{"id": id(v), "members": ids(c.Nodes), "arrangement": c.Arrangement, "desired": c.DesiredArrangement, "padding": c.Padding, "fixed": c.FixedSize, "container": id(c.Container), "point": v.TopLeft, "width": v.Width, "height": v.Height, "abductions": abs})
		}
		incidence := map[string][]string{}
		geometry := []any{}
		for _, n := range append(all, g.Nodes...) {
			es := []string{}
			for _, e := range n.Edges {
				es = append(es, fmt.Sprint(e.ID))
			}
			incidence[id(n)] = es
		}
		for _, n := range all {
			geometry = append(geometry, map[string]any{"id": id(n), "point": n.TopLeft, "width": n.Width, "height": n.Height, "container": id(n.Container)})
		}
		containers := map[string][]string{}
		for n, ns := range g.Containers {
			containers[id(n)] = ids(ns)
		}
		ends := []any{}
		for _, e := range g.Edges {
			ends = append(ends, []string{fmt.Sprint(e.ID), id(e.From), id(e.To)})
		}
		out = append(out, map[string]any{"trial": trial, "seed": seed, "nodes": nodes, "edges": edges, "expected": map[string]any{"nodes": ids(g.Nodes), "clusters": clusters, "incidence": incidence, "geometry": geometry, "containers": containers, "edges": ends, "work": fmt.Sprint(guard.Used()), "random": fmt.Sprint(random.Int63())}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
