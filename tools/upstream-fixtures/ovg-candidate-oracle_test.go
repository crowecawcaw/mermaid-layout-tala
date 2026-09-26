package routing

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
)

type tsOVGCandidateNode struct {
	ID     string  `json:"id"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}
type tsOVGCandidateCase struct {
	Name  string               `json:"name"`
	Nodes []tsOVGCandidateNode `json:"nodes"`
}
type tsOVGCandidateOutput struct {
	Name          string                 `json:"name"`
	Ports         map[string][]geo.Point `json:"ports"`
	Perimeter     []geo.Point            `json:"perimeter"`
	Halfway       []geo.Point            `json:"halfway"`
	Intersections []geo.Point            `json:"intersections"`
}

func TestTSOVGCandidateFixtures(t *testing.T) {
	inputPath, outputPath := os.Getenv("TALA_TS_OVG_CANDIDATE_INPUT"), os.Getenv("TALA_TS_OVG_CANDIDATE_OUTPUT")
	if inputPath == "" || outputPath == "" {
		t.Skip("set TALA_TS_OVG_CANDIDATE_INPUT and TALA_TS_OVG_CANDIDATE_OUTPUT")
	}
	data, err := os.ReadFile(inputPath)
	if err != nil {
		t.Fatal(err)
	}
	var cases []tsOVGCandidateCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	outputs := make([]tsOVGCandidateOutput, 0, len(cases))
	for _, input := range cases {
		g := layoutgraph.NewGraph()
		var nodes []*layoutgraph.Node
		for i, item := range input.Nodes {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), item.Width, item.Height)
			n.TopLeft = geo.NewPoint(item.X, item.Y)
			g.AddNodeUnchecked(n)
			g.AddNodeToContainer(nil, n)
			nodes = append(nodes, n)
		}
		if len(nodes) < 2 {
			t.Fatalf("%s: expected at least 2 nodes", input.Name)
		}
		g.Connect(nodes[0], nodes[1])
		guard, err := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
		if err != nil {
			t.Fatal(err)
		}
		ovg := newBuildOVG(nodes, guard)
		if err := ovg.addPorts(g, guard); err != nil {
			t.Fatal(err)
		}
		perimeter, err := ovg.perimeterPoints(nodes[0], nodes[1], guard)
		if err != nil {
			t.Fatal(err)
		}
		halfway, err := ovg.halfwayPoints(nodes[0], nodes[1], guard)
		if err != nil {
			t.Fatal(err)
		}
		output := tsOVGCandidateOutput{Name: input.Name, Ports: map[string][]geo.Point{}, Perimeter: make([]geo.Point, 0, len(perimeter)), Halfway: make([]geo.Point, 0, len(halfway))}
		for i, node := range nodes {
			points := make([]geo.Point, 0, len(ovg.Ports[node]))
			for _, port := range ovg.Ports[node] {
				points = append(points, *port.Point)
			}
			output.Ports[input.Nodes[i].ID] = points
		}
		for _, point := range perimeter {
			output.Perimeter = append(output.Perimeter, *point)
		}
		for _, point := range halfway {
			output.Halfway = append(output.Halfway, *point)
		}
		portCount := len(ovg.Nodes)
		if err := ovg.addNodesIntersections(g, guard); err != nil {
			t.Fatal(err)
		}
		output.Intersections = make([]geo.Point, 0, len(ovg.Nodes)-portCount)
		for _, candidate := range ovg.Nodes[portCount:] {
			output.Intersections = append(output.Intersections, *candidate.Point)
		}
		outputs = append(outputs, output)
	}
	encoded, err := json.MarshalIndent(outputs, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(outputPath, append(encoded, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
