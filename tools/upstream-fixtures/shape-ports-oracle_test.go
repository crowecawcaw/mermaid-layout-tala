// Copy into pinned upstream internal/nodeshape as ts_shape_ports_fixture_test.go.
// Development oracle only.
package nodeshape

import (
	"encoding/json"
	"math"
	"os"
	"testing"

	"github.com/d2lang/d2/lib/geo"
)

type tsPortPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}
type tsShapePortPolicy struct {
	Shape        string           `json:"shape"`
	NumColumns   int              `json:"numColumns"`
	Groups       [][]tsPortPoint  `json:"groups"`
	Ports        []tsPortPoint    `json:"ports"`
	Indices      map[string][]int `json:"indices"`
	Centers      []int            `json:"centers"`
	CenterBySide map[string]int   `json:"centerBySide"`
	Mirrors      map[int]int      `json:"mirrors"`
}

func TestTSShapePortPolicies(t *testing.T) {
	outputPath := os.Getenv("TALA_TS_SHAPE_PORTS_OUTPUT")
	if outputPath == "" {
		t.Skip("set output path")
	}
	var output []tsShapePortPolicy
	for kind := Square; kind <= Image; kind++ {
		columnsList := []int{0}
		if kind == Table {
			columnsList = []int{0, 1, 3, 5}
		}
		for _, columns := range columnsList {
			box := geo.NewBox(geo.NewPoint(37, 29), 101, 83)
			shape, _, ok := New(kind.String(), box)
			if !ok {
				t.Fatalf("unknown shape %s", kind.String())
			}
			SetNumColumns(shape, columns)
			result := tsShapePortPolicy{Shape: kind.String(), NumColumns: columns,
				Groups: make([][]tsPortPoint, 0), Ports: make([]tsPortPoint, 0),
				Indices: make(map[string][]int), CenterBySide: make(map[string]int), Mirrors: shape.MirroredPortIndices()}
			for _, group := range shape.SnapPointPercentages() {
				points := make([]tsPortPoint, 0, len(group))
				for _, relative := range group {
					points = append(points, tsPortPoint{relative.XPercentage, relative.YPercentage})
					result.Ports = append(result.Ports, tsPortPoint{
						37 + math.Round(101*relative.XPercentage),
						29 + math.Round(83*relative.YPercentage),
					})
				}
				result.Groups = append(result.Groups, points)
			}
			for _, side := range []struct {
				name        string
				orientation geo.Orientation
			}{
				{"top", geo.Top}, {"left", geo.Left}, {"bottom", geo.Bottom}, {"right", geo.Right},
				{"topLeft", geo.TopLeft}, {"topRight", geo.TopRight},
				{"bottomLeft", geo.BottomLeft}, {"bottomRight", geo.BottomRight},
			} {
				result.Indices[side.name] = shape.PortIndices(side.orientation)
				result.CenterBySide[side.name] = shape.CenterPortIndex(side.orientation)
			}
			result.Centers = shape.CenterPortIndices()
			output = append(output, result)
		}
	}
	encoded, err := json.MarshalIndent(output, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(outputPath, append(encoded, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
