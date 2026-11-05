// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package labeling

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/label"
	"os"
	"testing"
)

func TestExportTypeScriptLabelmodelFixtures(t *testing.T) {
	path := os.Getenv("TALA_LABELMODEL_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	names := []string{"", "Square", "RealSquare", "Parallelogram", "Document", "Cylinder", "Queue", "Page", "Package", "Step", "Callout", "StoredData", "Person", "C4Person", "Diamond", "Oval", "Circle", "Hexagon", "Cloud", "Table", "Class", "Text", "Code", "Image"}
	for _, name := range names {
		for trial := 0; trial < 4; trial++ {
			g := layoutgraph.NewGraph()
			n := layoutgraph.NewNode(1, 100, 100)
			g.AddNewNodeToContainer(nil, n)
			n.SetShape(name)
			if trial%2 == 1 {
				n.SetContainer(true)
			}
			n.Label = &layoutgraph.Label{}
			n.Icon = &layoutgraph.Icon{}
			if trial >= 2 {
				n.Label.Position = label.OutsideTopCenter
				n.Icon.Position = label.InsideTopLeft
			}
			tranches := labelPositionPreferenceTranches(n)
			Initialize(g)
			out = append(out, map[string]any{"shape": name, "trial": trial, "tranches": tranches, "position": n.Label.Position, "labelFixed": n.Label.PositionFixed(), "iconFixed": n.Icon.PositionFixed()})
		}
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
