// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package layoutgraph

import (
	"encoding/json"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"sort"
	"testing"
)

func TestExportTypeScriptConnectedsetFixtures(t *testing.T) {
	path := os.Getenv("TALA_CONNECTEDSET_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 160; trial++ {
		g := NewGraph()
		nodes := []*Node{}
		count := 12
		if trial%2 == 0 {
			count = 40
		}
		for i := 0; i < count; i++ {
			n := g.AddNode(NewNode(EntityID(i+1), 20, 20))
			n.TopLeft = geo.NewPoint(float64(i*50), 0)
			nodes = append(nodes, n)
		}
		for i := 1; i < count; i++ {
			if (i+trial)%5 != 0 {
				g.Connect(nodes[i-1], nodes[i])
			}
		}
		g.Containers[nil] = nodes[:2]
		for i := 2; i < count; i++ {
			container := nodes[i%2]
			container.SetContainer(true)
			g.Containers[container] = append(g.Containers[container], nodes[i])
			nodes[i].Container = container
		}
		start := nodes[(trial*7)%count]
		excluded := []*Node{nodes[(trial*11+3)%count]}
		if trial%3 == 0 {
			excluded = append(excluded, nodes[(trial*13+1)%count])
		}
		results := nodeIDs(start.ConnectedNodeSet(excluded, g))
		sort.Ints(results)
		out = append(out, map[string]any{"trial": trial, "result": results})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
func nodeIDs(nodes []*Node) []int {
	out := []int{}
	for _, n := range nodes {
		out = append(out, int(n.ID))
	}
	return out
}
