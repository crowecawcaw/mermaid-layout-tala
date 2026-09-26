package engine

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
)

type tsHierarchyNode struct {
	ID     string  `json:"id"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}
type tsHierarchyEdge struct {
	From     string `json:"from"`
	To       string `json:"to"`
	Directed bool   `json:"directed"`
}
type tsHierarchyCase struct {
	Name      string            `json:"name"`
	Direction string            `json:"direction"`
	Seed      int64             `json:"seed"`
	Nodes     []tsHierarchyNode `json:"nodes"`
	Edges     []tsHierarchyEdge `json:"edges"`
}
type tsHierarchyPosition struct {
	ID     string  `json:"id"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}
type tsHierarchyOutput struct {
	Name  string                `json:"name"`
	Nodes []tsHierarchyPosition `json:"nodes"`
}

func TestTSHierarchyStageFixtures(t *testing.T) {
	inputPath, outputPath := os.Getenv("TALA_TS_HIERARCHY_INPUT"), os.Getenv("TALA_TS_HIERARCHY_OUTPUT")
	if inputPath == "" || outputPath == "" {
		t.Skip("set TALA_TS_HIERARCHY_INPUT and TALA_TS_HIERARCHY_OUTPUT")
	}
	data, err := os.ReadFile(inputPath)
	if err != nil {
		t.Fatal(err)
	}
	var cases []tsHierarchyCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	outputs := make([]tsHierarchyOutput, 0, len(cases))
	for _, input := range cases {
		graph := layoutgraph.NewGraph()
		switch input.Direction {
		case "TB":
			graph.Directions[nil] = geo.Bottom
		case "BT":
			graph.Directions[nil] = geo.Top
		case "LR":
			graph.Directions[nil] = geo.Right
		case "RL":
			graph.Directions[nil] = geo.Left
		}
		byID := make(map[string]*layoutgraph.Node)
		for index, item := range input.Nodes {
			node := layoutgraph.NewNode(layoutgraph.EntityID(index+1), item.Width, item.Height)
			graph.AddNodeUnchecked(node)
			graph.AddNodeToContainer(nil, node)
			byID[item.ID] = node
		}
		for index, item := range input.Edges {
			edge := graph.Connect(byID[item.From], byID[item.To])
			edge.ID = layoutgraph.EntityID(index + 1)
			if item.Directed {
				edge.TargetArrowhead = layoutgraph.TriangleArrowhead
			}
		}
		pipeline := newPipeline(graph, input.Seed, false)
		pipeline.stages = append([]pipelineStage(nil), defaultPipelineStages[:5]...)
		if err := pipeline.runAllStages(context.Background()); err != nil {
			t.Fatalf("%s: %v", input.Name, err)
		}
		output := tsHierarchyOutput{Name: input.Name, Nodes: make([]tsHierarchyPosition, 0, len(input.Nodes))}
		for _, item := range input.Nodes {
			node := byID[item.ID]
			if node.TopLeft == nil {
				continue
			}
			output.Nodes = append(output.Nodes, tsHierarchyPosition{ID: item.ID,
				X: node.TopLeft.X, Y: node.TopLeft.Y, Width: node.Width, Height: node.Height})
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
