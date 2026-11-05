// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptRoutingsortedgeFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSORTEDGE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	flavors := []RouteGenerationFlavor{Default, ShortestToLongest, LongestToShortest, TopDownLeftRight}
	for trial := 0; trial < 180; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		clusters := map[*layoutgraph.Node]struct{}{}
		for i := 0; i < 12; i++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(20+i%4*10), float64(25+i%3*10)))
			n.TopLeft = geo.NewPoint(float64((trial*7+i*31)%5*40), float64((trial*11+i*19)%5*40))
			nodes = append(nodes, n)
			if (trial+i)%7 == 0 {
				clusters[n] = struct{}{}
			}
		}
		edges := []*layoutgraph.Edge{}
		ids := map[*layoutgraph.Edge]int{}
		for i := 0; i < 15+trial%45; i++ {
			a := (trial + i*7) % 12
			b := (trial*3 + i*5 + 1) % 12
			e := g.Connect(nodes[a], nodes[b])
			ids[e] = i
			edges = append(edges, e)
		}
		expected := [][]int{}
		for _, flavor := range flavors {
			ordered := append([]*layoutgraph.Edge(nil), edges...)
			sortEdges(flavor, ordered, clusters)
			order := []int{}
			for _, e := range ordered {
				order = append(order, ids[e])
			}
			expected = append(expected, order)
		}
		out = append(out, map[string]any{"trial": trial, "expected": expected})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
