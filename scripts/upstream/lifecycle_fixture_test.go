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

func TestExportTypeScriptLifecycleFixtures(t *testing.T) {
	path := os.Getenv("TALA_LIFECYCLE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 100; trial++ {
		g := layoutgraph.NewGraph()
		all := []*layoutgraph.Node{}
		for j := 0; j < 6+trial%24; j++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(j+1), float64(40+j%3*10), 40))
			all = append(all, n)
			g.AddNodeToContainer(nil, n)
			n.TopLeft = geo.NewPoint(float64(j*100), float64(j%3*100))
		}
		for j := 2; j < len(all); j++ {
			e := g.Connect(all[j%2], all[j])
			e.ID = layoutgraph.EntityID(len(g.Edges))
			e.TargetArrowhead = "triangle"
		}
		if err := AddClusters(context.Background(), g, int64(trial+1), rand.New(rand.NewSource(int64(trial+1)))); err != nil {
			t.Fatal(err)
		}
		vessels := g.ClusterOrder()
		if len(vessels) > 0 {
			vessels[0].AddNear(all[0])
			if len(vessels) > 1 {
				vessels[0].AddNear(vessels[1])
			}
		}
		id := func(n *layoutgraph.Node) string {
			if n == nil {
				return "0"
			}
			return fmt.Sprint(n.ID)
		}
		capture := func() json.RawMessage {
			ns := []string{}
			for _, n := range g.Nodes {
				ns = append(ns, id(n))
			}
			cs := map[string][]string{}
			for n, children := range g.Containers {
				vs := []string{}
				for _, child := range children {
					vs = append(vs, id(child))
				}
				cs[id(n)] = vs
			}
			records := map[string]any{}
			for _, n := range append(all, vessels...) {
				near := []string{}
				for v := range n.Nears {
					near = append(near, id(v))
				}
				sort.Strings(near)
				es := []string{}
				for _, e := range n.Edges {
					es = append(es, fmt.Sprint(e.ID))
				}
				cluster := "0"
				if n.Cluster != nil {
					cluster = id(n.Cluster.Vessel)
				}
				records[id(n)] = map[string]any{"point": n.TopLeft, "width": n.Width, "height": n.Height, "graph": n.Graph == g, "container": id(n.Container), "cluster": cluster, "vessel": n.IsClusterVessel(), "nears": near, "edges": es}
			}
			edges := []any{}
			for _, e := range g.Edges {
				edges = append(edges, []string{fmt.Sprint(e.ID), id(e.From), id(e.To)})
			}
			data, err := json.Marshal(map[string]any{"nodes": ns, "containers": cs, "records": records, "edges": edges, "clusters": len(g.Clusters)})
			if err != nil {
				t.Fatal(err)
			}
			return data
		}
		Cleanup(g)
		clean := capture()
		ResetClusters(g)
		reset := capture()
		ResetClusters(g)
		twice := capture()
		out = append(out, map[string]any{"trial": trial, "expected": map[string]any{"clean": clean, "reset": reset, "twice": twice}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
