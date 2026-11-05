// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package hierarchy

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptHierarchyeligibilityFixtures(t *testing.T) {
	path := os.Getenv("TALA_HIERARCHYELIGIBILITY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	shapes := []string{"", "Square", "Package", "StoredData", "Queue", "Step", "Circle", "Diamond", "RealSquare", "Table"}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		root := layoutgraph.NewNode(1, 500, 400)
		root.TopLeft = geo.NewPoint(0, 0)
		root.SetContainer(true)
		root.SetShape(shapes[trial%len(shapes)])
		g.AddNewNodeToContainer(nil, root)
		a := layoutgraph.NewNode(2, 40, 30)
		a.TopLeft = geo.NewPoint(40, 40)
		b := layoutgraph.NewNode(3, 40, 30)
		b.TopLeft = geo.NewPoint(150, 40)
		g.AddNewNodeToContainer(root, a)
		g.AddNewNodeToContainer(root, b)
		ext := layoutgraph.NewNode(4, 40, 30)
		ext.TopLeft = geo.NewPoint(700, 40)
		g.AddNewNodeToContainer(nil, ext)
		switch trial % 4 {
		case 0:
			g.Connect(a, b)
		case 1:
			g.Connect(a, a)
		case 2:
			g.Connect(a, ext)
		}
		if trial%7 == 0 {
			a.FixedTopLeft = a.TopLeft.Copy()
		}
		if trial%11 == 0 {
			root.FixedTopLeft = root.TopLeft.Copy()
		}
		candidates := Candidates(g)
		ids := []int{}
		for _, n := range g.Nodes {
			if _, ok := candidates[n]; ok {
				ids = append(ids, int(n.ID))
			}
		}
		out = append(out, map[string]any{"trial": trial, "ids": ids, "eligible": isEligibleContainer(g, root), "shape": shapeCanBeContainer(root.Shape), "structural": countHierarchyStructuralEdges(a)})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
