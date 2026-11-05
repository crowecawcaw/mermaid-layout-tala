// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package hierarchy

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"sort"
	"testing"
)

func TestExportTypeScriptHierarchyplacementnodesFixtures(t *testing.T) {
	path := os.Getenv("TALA_HIERARCHYPLACEMENTNODES_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		h := layoutgraph.NewHierarchy()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 6; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), 40, 30)
			n.TopLeft = geo.NewPoint(float64(i*100), 0)
			g.AddNewNodeToContainer(nil, n)
			nodes = append(nodes, n)
			n.Hierarchy = h
			h.Levels()[n] = i % 4
		}
		h.LevelCount = 4
		pairs := [][2]int{{0, 1}, {0, 3}, {1, 2}, {2, 3}, {0, 5}}
		if trial%2 == 0 {
			pairs = append(pairs, [2]int{4, 3})
		}
		if trial%3 == 0 {
			pairs = append(pairs, [2]int{1, 5})
		}
		for _, p := range pairs {
			g.Connect(nodes[p[0]], nodes[p[1]])
		}
		placement := createPlacementNodes(g, g.Nodes, nil)
		connectPlacementNodes(g, placement)
		byLevel := groupPlacementNodesByLevel(placement)
		initializeRanks(byLevel)
		dummies := breakLongConnections(placement, byLevel)
		records := []any{}
		for i := 0; i < len(byLevel); i++ {
			for _, pn := range byLevel[i] {
				above := []int{}
				below := []int{}
				for n := range pn.aboves {
					above = append(above, int(n.graphNode.ID))
				}
				for n := range pn.belows {
					below = append(below, int(n.graphNode.ID))
				}
				sort.Ints(above)
				sort.Ints(below)
				records = append(records, map[string]any{"id": int(pn.graphNode.ID), "level": pn.level, "rank": pn.rank, "dummy": pn.isDummy, "above": above, "below": below})
			}
		}
		out = append(out, map[string]any{"trial": trial, "dummyCount": len(dummies), "records": records})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
