// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package loops

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptLoopoffsetsFixtures(t *testing.T) {
	path := os.Getenv("TALA_LOOPOFFSETS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	names := []string{"Square", "RealSquare", "Parallelogram", "Document", "Cylinder", "Queue", "Page", "Package", "Step", "Callout", "StoredData", "Person", "C4Person", "Diamond", "Oval", "Circle", "Hexagon", "Cloud", "Table", "Class", "Text", "Code", "Image"}
	for _, shape := range names {
		for count := 0; count < 8; count++ {
			g := layoutgraph.NewGraph()
			n := layoutgraph.NewNode(1, 80.5, 50.25)
			g.AddNode(n)
			n.SetShape(shape)
			if count%2 == 1 {
				n.TopLeft = geo.NewPoint(10, 20)
			}
			for i := 0; i < count; i++ {
				e := g.Connect(n, n)
				if i%2 == 0 {
					e.TargetArrowhead = "triangle"
				} else {
					e.SourceArrowhead = "triangle"
				}
				if i%3 == 1 {
					e.Label = &layoutgraph.Label{Width: float64(20 + i*2), Height: float64(10 + i)}
				}
			}
			UpdateOffsets(n)
			offsets := n.LoopOffsets
			wasNil := n.TopLeft == nil
			n.TopLeft = geo.NewPoint(10, 20)
			routed := Route(n)
			routes := []any{}
			for _, e := range routed {
				pts := []any{}
				for _, p := range e.Points {
					pts = append(pts, []float64{p.X, p.Y})
				}
				routes = append(routes, pts)
			}
			out = append(out, map[string]any{"shape": shape, "count": count, "offsets": offsets, "wasNil": wasNil, "routes": routes})
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
