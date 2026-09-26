// Copy into pinned upstream internal/nodeshape as ts_shape_port_dimensions_fixture_test.go.
// Development oracle only.
package nodeshape

import (
	"encoding/json"
	"math"
	"os"
	"testing"

	"github.com/d2lang/d2/lib/geo"
)

type dimensionPortPoint struct { X float64 `json:"x"`; Y float64 `json:"y"` }

func TestTSShapePortDimensions(t *testing.T) {
	outputPath := os.Getenv("TALA_TS_SHAPE_PORT_DIMENSIONS_OUTPUT")
	if outputPath == "" { t.Skip("set output path") }
	type fixture struct {
		Shape string `json:"shape"`
		Width float64 `json:"width"`
		Height float64 `json:"height"`
		Groups [][]dimensionPortPoint `json:"groups"`
		Ports []dimensionPortPoint `json:"ports"`
	}
	var out []fixture
	for _, name := range []string{"Parallelogram", "Step", "Callout", "Package", "Cylinder", "Queue", "StoredData"} {
		for _, size := range [][2]float64{{8, 12}, {40, 30}, {101, 83}, {120, 80}, {200, 160}, {400, 250}} {
			box := geo.NewBox(geo.NewPoint(37, 29), size[0], size[1])
			shape, _, ok := New(name, box)
			if !ok { t.Fatalf("unknown shape %s", name) }
			f := fixture{Shape: name, Width: size[0], Height: size[1], Groups: make([][]dimensionPortPoint, 0), Ports: make([]dimensionPortPoint, 0)}
			for _, group := range shape.SnapPointPercentages() {
				points := make([]dimensionPortPoint, 0, len(group))
				for _, p := range group {
					points = append(points, dimensionPortPoint{p.XPercentage, p.YPercentage})
					f.Ports = append(f.Ports, dimensionPortPoint{37 + math.Round(size[0]*p.XPercentage), 29 + math.Round(size[1]*p.YPercentage)})
				}
				f.Groups = append(f.Groups, points)
			}
			out = append(out, f)
		}
	}
	encoded, err := json.MarshalIndent(out, "", "  ")
	if err != nil { t.Fatal(err) }
	if err := os.WriteFile(outputPath, append(encoded, '\n'), 0644); err != nil { t.Fatal(err) }
}
