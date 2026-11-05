// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placement

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptClusteralignmentFixtures(t *testing.T) {
	path := os.Getenv("TALA_CLUSTERALIGNMENT_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 200; trial++ {
		g := layoutgraph.NewGraph()
		v := layoutgraph.NewNode(1, 60, 80)
		v.TopLeft = geo.NewPoint(float64(trial%30), float64(trial%20))
		g.AddNode(v)
		member := layoutgraph.NewNode(2, 20, 20)
		member.TopLeft = geo.NewPoint(0, 0)
		g.AddNode(member)
		cluster := &layoutgraph.Cluster{Vessel: v, Nodes: []*layoutgraph.Node{member}, Graph: g}
		ext := []*layoutgraph.Node{}
		for i := 0; i < 3; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+3), 20, 30)
			n.TopLeft = geo.NewPoint(float64((trial*11+i*61)%200-50), float64((trial*7+i*47)%200-50))
			g.AddNode(n)
			if i == 0 && trial%4 == 0 {
				n.FixedTopLeft = geo.NewPoint(0, 0)
			}
			e := g.Connect(n, member)
			cluster.EdgeAbductions = append(cluster.EdgeAbductions, &layoutgraph.EdgeAbduction{Edge: e, CurrentFrom: n, CurrentTo: member, OriginallyTo: member})
			ext = append(ext, n)
		}
		horizontal := trial%2 == 0
		alignConnectedNodes(cluster, horizontal)
		nodes := []any{}
		for _, n := range ext {
			nodes = append(nodes, []float64{n.TopLeft.X, n.TopLeft.Y})
		}
		alignVessel(cluster, horizontal)
		out = append(out, map[string]any{"trial": trial, "external": nodes, "vessel": []float64{v.TopLeft.X, v.TopLeft.Y}})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
