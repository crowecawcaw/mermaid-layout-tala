// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptRoutingtraceFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGTRACE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	names := []string{"Square", "RealSquare", "Parallelogram", "Document", "Cylinder", "Queue", "Page", "Package", "Step", "Callout", "StoredData", "Person", "C4Person", "Diamond", "Oval", "Circle", "Hexagon", "Cloud", "Table", "Class", "Text", "Code", "Image"}
	out := []any{}
	for _, shape := range names {
		for trial := 0; trial < 24; trial++ {
			a := layoutgraph.NewNode(1, 80, 60)
			a.SetShape(shape)
			a.TopLeft = geo.NewPoint(10, 20)
			a.Is3D = trial%3 == 1
			a.IsMultiple = trial%3 == 2
			b := layoutgraph.NewNode(2, 70, 50)
			b.SetShape(shape)
			b.TopLeft = geo.NewPoint(200, 140)
			b.Is3D = trial%4 == 1
			b.IsMultiple = trial%4 == 2
			self := trial%8 == 0
			if self {
				b = a
			}
			side := trial / 3 % 4
			var start, end *geo.Point
			switch side {
			case 0:
				start = geo.NewPoint(90, 50)
				end = geo.NewPoint(b.TopLeft.X, b.TopLeft.Y+25)
			case 1:
				start = geo.NewPoint(50, 20)
				end = geo.NewPoint(b.TopLeft.X+35, b.TopLeft.Y+b.Height)
			case 2:
				start = geo.NewPoint(10, 50)
				end = geo.NewPoint(b.TopLeft.X+b.Width, b.TopLeft.Y+25)
			default:
				start = geo.NewPoint(50, 80)
				end = geo.NewPoint(b.TopLeft.X+35, b.TopLeft.Y)
			}
			points := []*geo.Point{start, geo.NewPoint(start.X+30, start.Y-35), geo.NewPoint(end.X-25, end.Y+40), end}
			input := make([]*geo.Point, len(points))
			for i, p := range points {
				input[i] = p.Copy()
			}
			e := &layoutgraph.Edge{From: a, To: b, Points: points}
			traceToShapeBorder(e)
			out = append(out, map[string]any{"shape": shape, "trial": trial, "self": self, "input": input, "expected": e.Points, "aPosition": a.TopLeft, "bPosition": b.TopLeft})
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
