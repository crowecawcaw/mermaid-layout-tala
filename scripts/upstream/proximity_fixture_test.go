// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package proximity

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"sort"
	"testing"
)

func TestExportTypeScriptProximityFixtures(t *testing.T) {
	path := os.Getenv("TALA_PROXIMITY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 200; trial++ {
		g := layoutgraph.NewGraph()
		all := []*layoutgraph.Node{}
		for j := 0; j < 20; j++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(j+1), 60, 40))
			all = append(all, n)
			var parent *layoutgraph.Node
			if j >= 3 && j <= 8 || j == 17 {
				parent = all[0]
			} else if j >= 9 && j <= 12 {
				parent = all[1]
			} else if j >= 13 && j <= 16 {
				parent = all[2]
			} else if j >= 18 {
				parent = all[17]
			}
			g.AddNodeToContainer(parent, n)
			n.TopLeft = geo.NewPoint(float64(j*100), float64(j%3*100))
		}
		all[1].Width = float64(80 + trial%4*80)
		all[1].Height = 120
		all[2].Width = 90
		all[2].Height = float64(60 + trial%4*90)
		for j := 9; j <= 16; j++ {
			if trial%5 != 0 {
				h := layoutgraph.NewHerdAssignment()
				h.Orientation = []geo.Orientation{geo.Top, geo.Right, geo.Bottom, geo.Left}[(trial+j/4)%4]
				if trial%3 == 0 {
					h.PairOppositeSide(all[0])
				}
				all[j].HerdAssignment = h
			}
			if trial%7 == 0 {
				all[j].TopLeft = nil
			}
		}
		add := func(a, b int) *layoutgraph.Edge {
			e := g.Connect(all[a], all[b])
			e.ID = layoutgraph.EntityID(len(g.Edges))
			return e
		}
		add(3, 4)
		add(3, 5)
		add(4, 6)
		if trial%3 == 0 {
			add(3, 7)
		}
		abductions := []*layoutgraph.EdgeAbduction{}
		for j := 0; j < 10+trial%9; j++ {
			a := 3 + (j*3+trial)%6
			if j%7 == 0 {
				a = 18 + j%2
			}
			b := 9 + (j*5+trial)%8
			e := add(a, b)
			uncle := all[1]
			if b >= 13 {
				uncle = all[2]
			}
			ab := &layoutgraph.EdgeAbduction{Edge: e, OriginallyFrom: all[a], OriginallyTo: all[b], CurrentFrom: all[0], CurrentTo: uncle}
			if j%2 == 1 {
				ab.OriginallyFrom, ab.OriginallyTo = ab.OriginallyTo, ab.OriginallyFrom
				ab.CurrentFrom, ab.CurrentTo = ab.CurrentTo, ab.CurrentFrom
			}
			abductions = append(abductions, ab)
		}
		// Direct uncle links exercise common-sibling discovery independently of the abducted cousin edges.
		add(3, 1)
		add(5, 1)
		add(6, 2)
		add(7, 2)
		add(8, 2)
		if err := AddHubs(context.Background(), g); err != nil {
			t.Fatal(err)
		}
		if err := AssignNears(context.Background(), g, all[0], abductions); err != nil {
			t.Fatal(err)
		}
		ids := func(ns []*layoutgraph.Node) []int {
			r := []int{}
			for _, n := range ns {
				r = append(r, int(n.ID))
			}
			return r
		}
		maps := func(m map[*layoutgraph.Node][]*layoutgraph.Node) map[string][]int {
			r := map[string][]int{}
			for n, ns := range m {
				r[fmt.Sprint(n.ID)] = ids(ns)
			}
			return r
		}
		common := map[string][]int{}
		for n, ns := range CommonUncleSiblings(g) {
			common[fmt.Sprint(n.ID)] = ids(ns)
		}
		nears := map[string][]int{}
		for _, n := range all {
			ns := []*layoutgraph.Node{}
			for near := range n.Nears {
				ns = append(ns, near)
			}
			sort.Slice(ns, func(i, j int) bool { return ns[i].ID < ns[j].ID })
			nears[fmt.Sprint(n.ID)] = ids(ns)
		}
		grouped, cousins, err := GroupSheep(context.Background(), g, all[0], abductions)
		if err != nil {
			t.Fatal(err)
		}
		cousinIDs := map[string]any{}
		for uncle, byNode := range cousins {
			cousinIDs[fmt.Sprint(uncle.ID)] = maps(byNode)
		}
		if err = AssignHerds(context.Background(), g, all[0], abductions); err != nil {
			t.Fatal(err)
		}
		for j, n := range all {
			if n.TopLeft == nil {
				n.TopLeft = geo.NewPoint(float64(j*100), float64(j%3*100))
			}
		}
		SyncHerdFences(g)
		herds := map[string]any{}
		for _, n := range all {
			if h := n.HerdAssignment; h != nil {
				herds[fmt.Sprint(n.ID)] = map[string]any{"orientation": h.Orientation, "val": h.Val, "same": h.SameSidePairCount(), "opposite": h.OppositeSidePairCount()}
			}
		}
		out = append(out, map[string]any{"trial": trial, "expected": map[string]any{"hubs": maps(g.Hubs), "nears": nears, "common": common, "grouped": maps(grouped), "cousins": cousinIDs, "herds": herds}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
