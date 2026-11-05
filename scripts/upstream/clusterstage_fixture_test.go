// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placement

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/grouping"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptClusterstageFixtures(t *testing.T) {
	path := os.Getenv("TALA_CLUSTERSTAGE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = 60
		a := layoutgraph.NewNode(1, 40, 40)
		a.TopLeft = geo.NewPoint(float64(100+trial%30), 0)
		b := layoutgraph.NewNode(2, 40, 40)
		b.TopLeft = geo.NewPoint(float64(100+trial%30), 400)
		c := layoutgraph.NewNode(3, 40, 40)
		c.TopLeft = geo.NewPoint(100, 140)
		d := layoutgraph.NewNode(4, 40, 40)
		d.TopLeft = geo.NewPoint(100, 240)
		for _, n := range []*layoutgraph.Node{a, b, c, d} {
			g.AddNewNodeToContainer(nil, n)
		}
		g.Connect(a, c)
		g.Connect(a, d)
		g.Connect(c, b)
		g.Connect(d, b)
		vessel := layoutgraph.NewNode(5, 40, 140)
		vessel.TopLeft = geo.NewPoint(100, 140)
		vessel.SetClusterVessel(true)
		cluster := &layoutgraph.Cluster{Nodes: []*layoutgraph.Node{c, d}, Graph: g, Arrangement: layoutgraph.Column, DesiredArrangement: layoutgraph.Row, Vessel: vessel}
		grouping.AddCluster(g, cluster)
		abductClusterEdgesForOptimizationFixture(cluster)
		changed, err := OptimizeClusters(context.Background(), g)
		if err != nil {
			t.Fatal(err)
		}
		nodes := []any{}
		for _, n := range []*layoutgraph.Node{a, b, c, d, vessel} {
			nodes = append(nodes, []float64{n.TopLeft.X, n.TopLeft.Y, n.Width, n.Height})
		}
		out = append(out, map[string]any{"trial": trial, "changed": changed, "arrangement": cluster.Arrangement, "desired": cluster.DesiredArrangement, "padding": cluster.Padding, "nodes": nodes})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
