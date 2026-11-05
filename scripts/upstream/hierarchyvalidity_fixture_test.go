// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package hierarchy

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptHierarchyvalidityFixtures(t *testing.T) {
	path := os.Getenv("TALA_HIERARCHYVALIDITY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 160; trial++ {
		g := layoutgraph.NewGraph()
		h := layoutgraph.NewHierarchy()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 6; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(40+i*10), float64(30+i*5))
			n.TopLeft = geo.NewPoint(float64(i*100), 0)
			g.AddNewNodeToContainer(nil, n)
			nodes = append(nodes, n)
			level := i % 3
			if trial%4 == 0 {
				level = i % 4
			}
			h.Levels()[n] = level
		}
		h.LevelCount = 3
		if trial%4 == 0 {
			h.LevelCount = 4
		}
		pairs := [][2]int{{0, 1}, {0, 4}, {1, 2}, {4, 2}, {3, 4}, {4, 5}}
		for i, p := range pairs {
			if (trial+i)%5 == 0 {
				continue
			}
			e := g.Connect(nodes[p[0]], nodes[p[1]])
			if (trial+i)%4 != 0 {
				e.TargetArrowhead = layoutgraph.TriangleArrowhead
			}
			if (trial+i)%9 == 0 {
				e.SourceArrowhead = layoutgraph.TriangleArrowhead
			}
		}
		if trial%3 == 0 {
			g.Connect(nodes[1], nodes[1])
		}
		if trial%6 == 0 {
			g.Directions[nil] = geo.Right
		}
		forward, back := countEdgeDirection(h, g)
		source := 1 + trial%2
		sink := 1 + trial%3
		out = append(out, map[string]any{"trial": trial, "horizontal": IsHorizontal(g.Nodes), "forward": forward, "back": back, "extent": minimumWorkflowExtentFits(h, g), "oneNOne": is1N1(h, nil), "valid": isValid(h, g, nil, source, sink)})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
