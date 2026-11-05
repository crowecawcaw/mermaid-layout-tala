// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptResultmetadataFixtures(t *testing.T) {
	path := os.Getenv("TALA_RESULTMETADATA_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 160; trial++ {
		g := layoutgraph.NewGraph()
		a := layoutgraph.NewNode(1, 40, 30)
		a.TopLeft = geo.NewPoint(0, 0)
		g.AddNewNodeToContainer(nil, a)
		b := layoutgraph.NewNode(2, 40, 30)
		b.TopLeft = geo.NewPoint(100, 0)
		g.AddNewNodeToContainer(nil, b)
		g.Directions[nil] = geo.Bottom
		e := g.Connect(a, b)
		e.ID = 10
		e.Points = []*geo.Point{geo.NewPoint(40, 15), geo.NewPoint(100, 15)}
		e.Label = &layoutgraph.Label{Text: "edge", Width: 20, Height: 10}
		a.Label = &layoutgraph.Label{Text: "node", Width: 20, Height: 10}
		font := 16
		a.FontSize = &font
		candidate, err := layoutgraph.Clone(context.Background(), g)
		if err != nil {
			t.Fatal(err)
		}
		n := candidate.Nodes[0]
		ce := candidate.Edges[0]
		switch trial % 16 {
		case 1:
			candidate.IsRootHierarchy = true
		case 2:
			candidate.Directions[nil] = geo.Top
		case 3:
			n.SetShape("Diamond")
		case 4:
			n.Is3D = true
		case 5:
			n.IsMultiple = true
		case 6:
			n.IsInvisible = true
		case 7:
			n.FixedTopLeft = geo.NewPoint(1, 2)
		case 8:
			v := 42.0
			n.DesiredWidth = &v
		case 9:
			n.ForceHierarchy = true
		case 10:
			n.Label.Text = "changed"
		case 11:
			n.InitIcon()
		case 12:
			v := 17
			n.FontSize = &v
		case 13:
			ce.TargetArrowhead = "triangle"
		case 14:
			ce.MinWidth = 99
		case 15:
			ce.Label.Width = 99
		}
		err = validateLayoutResultMetadata(context.Background(), g, candidate, nil)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		out = append(out, map[string]any{"trial": trial, "error": msg})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
