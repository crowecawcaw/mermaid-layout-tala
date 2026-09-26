// Copy into the pinned upstream internal/engine package as
// ts_node_placement_fixture_test.go. This is a development oracle only.
package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/trees"
	"github.com/d2lang/d2/lib/geo"
)

type tsPlacementNode struct {
	ID     string  `json:"id"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}
type tsPlacementEdge struct {
	From     string `json:"from"`
	To       string `json:"to"`
	Directed bool   `json:"directed"`
}
type tsPlacementCase struct {
	Name      string            `json:"name"`
	Direction string            `json:"direction"`
	Seed      int64             `json:"seed"`
	Nodes     []tsPlacementNode `json:"nodes"`
	Edges     []tsPlacementEdge `json:"edges"`
}
type tsPlacementOutputNode struct {
	ID     string  `json:"id"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}
type tsPlacementOutputCase struct {
	Name  string                  `json:"name"`
	Nodes []tsPlacementOutputNode `json:"nodes"`
}

type tsTreeRecord struct {
	ID       string         `json:"id"`
	Children []tsTreeRecord `json:"children"`
}
type tsTreeRoots struct {
	Sentinel string         `json:"sentinel"`
	Roots    []tsTreeRecord `json:"roots"`
}
type tsTreeExtractionOutput struct {
	Name      string        `json:"name"`
	Remaining []string      `json:"remaining"`
	Trees     []tsTreeRoots `json:"trees"`
}

func tsTreeRecordFor(tree *layoutgraph.Tree, names map[layoutgraph.EntityID]string) tsTreeRecord {
	record := tsTreeRecord{ID: names[tree.Node.ID], Children: make([]tsTreeRecord, 0, len(tree.Children))}
	for _, child := range tree.Children {
		record.Children = append(record.Children, tsTreeRecordFor(child, names))
	}
	return record
}

func TestTSTreeExtractionFixtures(t *testing.T) {
	inputPath, outputPath := os.Getenv("TALA_TS_TREE_EXTRACTION_INPUT"), os.Getenv("TALA_TS_TREE_EXTRACTION_OUTPUT")
	if inputPath == "" || outputPath == "" {
		t.Skip("set fixture paths")
	}
	data, err := os.ReadFile(inputPath)
	if err != nil {
		t.Fatal(err)
	}
	var cases []tsPlacementCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	outputs := make([]tsTreeExtractionOutput, 0, len(cases))
	for _, input := range cases {
		graph := layoutgraph.NewGraph()
		graph.Directions[nil] = tsPlacementDirection(input.Direction)
		nodes := make(map[string]*layoutgraph.Node, len(input.Nodes))
		names := make(map[layoutgraph.EntityID]string, len(input.Nodes))
		for index, item := range input.Nodes {
			id := layoutgraph.EntityID(index + 1)
			node := layoutgraph.NewNode(id, item.Width, item.Height)
			graph.AddNodeUnchecked(node)
			graph.AddNodeToContainer(nil, node)
			nodes[item.ID], names[id] = node, item.ID
		}
		for index, item := range input.Edges {
			edge := graph.Connect(nodes[item.From], nodes[item.To])
			edge.ID = layoutgraph.EntityID(index + 1)
			if item.Directed {
				edge.TargetArrowhead = layoutgraph.TriangleArrowhead
			}
		}
		pipeline := newPipeline(graph, input.Seed, false)
		pipeline.stages = defaultPipelineStages[:4]
		if err := pipeline.runAllStages(context.Background()); err != nil {
			t.Fatalf("%s: %v", input.Name, err)
		}
		output := tsTreeExtractionOutput{Name: input.Name, Remaining: make([]string, 0, len(graph.Nodes)), Trees: []tsTreeRoots{}}
		for _, node := range graph.Nodes {
			output.Remaining = append(output.Remaining, names[node.ID])
		}
		for _, item := range input.Nodes {
			sentinel := nodes[item.ID]
			roots, has := graph.Trees[sentinel]
			if !has {
				continue
			}
			entry := tsTreeRoots{Sentinel: item.ID, Roots: make([]tsTreeRecord, 0, len(roots))}
			for _, root := range roots {
				entry.Roots = append(entry.Roots, tsTreeRecordFor(root, names))
			}
			output.Trees = append(output.Trees, entry)
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

// Captures the tree geometry before placement.direct mirrors the full graph.
func TestTSTreeRawPlacementFixtures(t *testing.T) {
	inputPath, outputPath := os.Getenv("TALA_TS_TREE_RAW_INPUT"), os.Getenv("TALA_TS_TREE_RAW_OUTPUT")
	if inputPath == "" || outputPath == "" {
		t.Skip("set fixture paths")
	}
	data, err := os.ReadFile(inputPath)
	if err != nil {
		t.Fatal(err)
	}
	var cases []tsPlacementCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	outputs := make([]tsPlacementOutputCase, 0, len(cases))
	for _, input := range cases {
		graph := layoutgraph.NewGraph()
		graph.Directions[nil] = tsPlacementDirection(input.Direction)
		nodes := make(map[string]*layoutgraph.Node, len(input.Nodes))
		for index, item := range input.Nodes {
			node := layoutgraph.NewNode(layoutgraph.EntityID(index+1), item.Width, item.Height)
			graph.AddNodeUnchecked(node)
			graph.AddNodeToContainer(nil, node)
			nodes[item.ID] = node
		}
		for index, item := range input.Edges {
			edge := graph.Connect(nodes[item.From], nodes[item.To])
			edge.ID = layoutgraph.EntityID(index + 1)
			if item.Directed {
				edge.TargetArrowhead = layoutgraph.TriangleArrowhead
			}
		}
		pipeline := newPipeline(graph, input.Seed, false)
		pipeline.stages = defaultPipelineStages[:4]
		if err := pipeline.runAllStages(context.Background()); err != nil {
			t.Fatalf("%s: %v", input.Name, err)
		}
		for _, node := range graph.Nodes {
			node.TopLeft = geo.NewPoint(0, 0)
		}
		if err := trees.Place(context.Background(), graph, nil); err != nil {
			t.Fatalf("%s: %v", input.Name, err)
		}
		output := tsPlacementOutputCase{Name: input.Name, Nodes: make([]tsPlacementOutputNode, 0, len(input.Nodes))}
		for _, item := range input.Nodes {
			node := nodes[item.ID]
			output.Nodes = append(output.Nodes, tsPlacementOutputNode{ID: item.ID, X: node.TopLeft.X, Y: node.TopLeft.Y, Width: node.Width, Height: node.Height})
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

func tsPlacementDirection(value string) geo.Orientation {
	switch value {
	case "TB":
		return geo.Bottom
	case "BT":
		return geo.Top
	case "LR":
		return geo.Right
	case "RL":
		return geo.Left
	}
	return geo.Bottom
}

func TestTSNodePlacementFixtures(t *testing.T) {
	inputPath, outputPath := os.Getenv("TALA_TS_NODE_PLACEMENT_INPUT"), os.Getenv("TALA_TS_NODE_PLACEMENT_OUTPUT")
	if inputPath == "" || outputPath == "" {
		t.Skip("set fixture paths")
	}
	data, err := os.ReadFile(inputPath)
	if err != nil {
		t.Fatal(err)
	}
	var cases []tsPlacementCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	outputs := make([]tsPlacementOutputCase, 0, len(cases))
	for _, input := range cases {
		graph := layoutgraph.NewGraph()
		graph.Directions[nil] = tsPlacementDirection(input.Direction)
		nodes := make(map[string]*layoutgraph.Node, len(input.Nodes))
		for index, item := range input.Nodes {
			node := layoutgraph.NewNode(layoutgraph.EntityID(index+1), item.Width, item.Height)
			graph.AddNodeUnchecked(node)
			graph.AddNodeToContainer(nil, node)
			nodes[item.ID] = node
		}
		for index, item := range input.Edges {
			from, to := nodes[item.From], nodes[item.To]
			if from == nil || to == nil {
				t.Fatalf("%s: missing edge endpoint", input.Name)
			}
			edge := graph.Connect(from, to)
			edge.ID = layoutgraph.EntityID(index + 1)
			if item.Directed {
				edge.TargetArrowhead = layoutgraph.TriangleArrowhead
			}
		}
		pipeline := newPipeline(graph, input.Seed, false)
		pipeline.stages = defaultPipelineStages[:8]
		if err := pipeline.runAllStages(context.Background()); err != nil {
			t.Fatalf("%s: %v", input.Name, err)
		}
		byID := make(map[layoutgraph.EntityID]*layoutgraph.Node, len(graph.Nodes))
		for _, node := range graph.Nodes {
			byID[node.ID] = node
		}
		output := tsPlacementOutputCase{Name: input.Name, Nodes: make([]tsPlacementOutputNode, 0, len(input.Nodes))}
		for index, item := range input.Nodes {
			node := byID[layoutgraph.EntityID(index+1)]
			if node == nil || node.TopLeft == nil {
				t.Fatalf("%s: missing placed node %s", input.Name, item.ID)
			}
			output.Nodes = append(output.Nodes, tsPlacementOutputNode{ID: item.ID, X: node.TopLeft.X, Y: node.TopLeft.Y, Width: node.Width, Height: node.Height})
		}
		outputs = append(outputs, output)
	}
	encoded, err := json.MarshalIndent(outputs, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(outputPath, append(encoded, '\n'), 0644); err != nil {
		t.Fatal(fmt.Errorf("write fixture: %w", err))
	}
}
