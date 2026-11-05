// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placement

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptPlacementgapgeometryFixtures(t *testing.T) {
	path := os.Getenv("TALA_PLACEMENTGAPGEOMETRY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 8; i++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(30+i%3*10), float64(25+i%2*15)))
			n.TopLeft = geo.NewPoint(float64((i*73+trial*19)%410-50), float64((i*41+trial*13)%250-60))
			nodes = append(nodes, n)
		}
		g.Containers[nil] = nodes
		for i := 1; i < len(nodes); i++ {
			if (i+trial)%3 != 0 {
				g.Connect(nodes[0], nodes[i])
			}
		}
		for _, horizontal := range []bool{false, true} {
			for _, forward := range []bool{false, true} {
				between := []bool{}
				for _, n := range nodes {
					between = append(between, isBetween(n, nodes[0], nodes[1], horizontal, forward))
				}
				id := func(n *layoutgraph.Node) int {
					if n == nil {
						return 0
					}
					return int(n.ID)
				}
				out = append(out, map[string]any{"trial": trial, "horizontal": horizontal, "forward": forward, "between": between, "nearest": id(nearestBetween(nodes, nodes[0], nodes[1], nil, horizontal, forward)), "connected": id(nearestConnectedAhead(nodes[0], horizontal, forward))})
			}
		}
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
