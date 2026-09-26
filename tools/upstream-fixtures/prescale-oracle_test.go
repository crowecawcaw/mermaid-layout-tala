// Copy into the pinned upstream internal/engine package as
// ts_prescale_fixture_test.go. Development oracle only.
package engine

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/placement"
	"github.com/d2lang/d2/lib/geo"
)

type tsPrescaleBBox struct {
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}
type tsPrescaleNode struct {
	ID            string          `json:"id"`
	Width         float64         `json:"width"`
	Height        float64         `json:"height"`
	Shape         string          `json:"shape,omitempty"`
	FontSize      *int            `json:"fontSize,omitempty"`
	LabelBBox     *tsPrescaleBBox `json:"labelBBox,omitempty"`
	DesiredWidth  *float64        `json:"desiredWidth,omitempty"`
	DesiredHeight *float64        `json:"desiredHeight,omitempty"`
	FixedTopLeft  *geo.Point      `json:"fixedTopLeft,omitempty"`
}
type tsPrescaleEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
}
type tsPrescaleCase struct {
	Name  string           `json:"name"`
	Nodes []tsPrescaleNode `json:"nodes"`
	Edges []tsPrescaleEdge `json:"edges"`
}
type tsPrescaleOutput struct {
	Name  string           `json:"name"`
	Nodes []tsPrescaleNode `json:"nodes"`
}

func TestTSPrescaleFixtures(t *testing.T) {
	inputPath, outputPath := os.Getenv("TALA_TS_PRESCALE_INPUT"), os.Getenv("TALA_TS_PRESCALE_OUTPUT")
	if inputPath == "" || outputPath == "" {
		t.Skip("set fixture paths")
	}
	data, err := os.ReadFile(inputPath)
	if err != nil {
		t.Fatal(err)
	}
	var cases []tsPrescaleCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	outputs := make([]tsPrescaleOutput, 0, len(cases))
	for _, input := range cases {
		graph := layoutgraph.NewGraph()
		nodes := make(map[string]*layoutgraph.Node)
		for index, item := range input.Nodes {
			node := layoutgraph.NewNode(layoutgraph.EntityID(index+1), item.Width, item.Height)
			if item.Shape != "" {
				shapeName := item.Shape
				switch shapeName {
				case "circle":
					shapeName = "Circle"
				case "real_square":
					shapeName = "RealSquare"
				case "table":
					shapeName = "Table"
				case "class":
					shapeName = "Class"
				}
				node.SetShape(shapeName)
			}
			if item.FontSize != nil {
				value := *item.FontSize
				node.FontSize = &value
			}
			if item.LabelBBox != nil {
				node.Label = &layoutgraph.Label{Width: item.LabelBBox.Width, Height: item.LabelBBox.Height}
			}
			node.DesiredWidth, node.DesiredHeight = item.DesiredWidth, item.DesiredHeight
			node.FixedTopLeft = item.FixedTopLeft
			graph.AddNodeUnchecked(node)
			graph.AddNodeToContainer(nil, node)
			nodes[item.ID] = node
		}
		for _, item := range input.Edges {
			graph.Connect(nodes[item.From], nodes[item.To])
		}
		placement.Prescale(graph)
		output := tsPrescaleOutput{Name: input.Name, Nodes: make([]tsPrescaleNode, 0, len(input.Nodes))}
		for _, item := range input.Nodes {
			node := nodes[item.ID]
			record := tsPrescaleNode{ID: item.ID, Width: node.Width, Height: node.Height, Shape: item.Shape,
				FontSize: node.FontSize, DesiredWidth: item.DesiredWidth, DesiredHeight: item.DesiredHeight,
				FixedTopLeft: item.FixedTopLeft}
			if node.Label != nil {
				record.LabelBBox = &tsPrescaleBBox{Width: node.Label.Width, Height: node.Label.Height}
			}
			output.Nodes = append(output.Nodes, record)
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
