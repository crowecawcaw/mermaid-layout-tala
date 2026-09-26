// Copy into d2layouts/d2talalayout/cmd/ts-full-layout/main.go in the pinned
// upstream checkout, then run with: go run ./d2layouts/d2talalayout/cmd/ts-full-layout
// This is a development oracle. The TypeScript runtime does not use Go or D2.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/engine"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
)

type inputNode struct {
	ID     string  `json:"id"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}
type inputEdge struct {
	ID       string `json:"id"`
	From     string `json:"from"`
	To       string `json:"to"`
	Directed bool   `json:"directed"`
}
type inputCase struct {
	Name      string      `json:"name"`
	Direction string      `json:"direction"`
	Seed      int64       `json:"seed"`
	Nodes     []inputNode `json:"nodes"`
	Edges     []inputEdge `json:"edges"`
}
type outputNode struct {
	ID     string  `json:"id"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}
type outputPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}
type outputEdge struct {
	ID     string        `json:"id"`
	Points []outputPoint `json:"points"`
}
type outputCase struct {
	Name  string       `json:"name"`
	Nodes []outputNode `json:"nodes"`
	Edges []outputEdge `json:"edges"`
}

func direction(name string) geo.Orientation {
	switch name {
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

func run(input inputCase) (outputCase, error) {
	graph := layoutgraph.NewGraph()
	graph.Directions[nil] = direction(input.Direction)
	nodes := make(map[string]*layoutgraph.Node, len(input.Nodes))
	for index, item := range input.Nodes {
		node := layoutgraph.NewNode(layoutgraph.EntityID(index+1), item.Width, item.Height)
		graph.AddNodeUnchecked(node)
		graph.AddNodeToContainer(nil, node)
		nodes[item.ID] = node
	}
	edgeIDs := make(map[string]layoutgraph.EntityID, len(input.Edges))
	for index, item := range input.Edges {
		from, to := nodes[item.From], nodes[item.To]
		if from == nil || to == nil {
			return outputCase{}, fmt.Errorf("missing endpoint for %s", item.ID)
		}
		edge := graph.Connect(from, to)
		edge.ID = layoutgraph.EntityID(index + 1)
		if item.Directed {
			edge.TargetArrowhead = layoutgraph.TriangleArrowhead
		}
		edgeIDs[item.ID] = edge.ID
	}
	result, err := engine.Layout(context.Background(), graph, engine.LayoutOptions{Seed: input.Seed})
	if err != nil {
		return outputCase{}, err
	}
	output := outputCase{Name: input.Name, Nodes: make([]outputNode, 0, len(input.Nodes)), Edges: make([]outputEdge, 0, len(input.Edges))}
	resultNodes := make(map[layoutgraph.EntityID]*layoutgraph.Node, len(result.Nodes))
	resultEdges := make(map[layoutgraph.EntityID]*layoutgraph.Edge, len(result.Edges))
	for _, node := range result.Nodes {
		resultNodes[node.ID] = node
	}
	for _, edge := range result.Edges {
		resultEdges[edge.ID] = edge
	}
	for index, item := range input.Nodes {
		node := resultNodes[layoutgraph.EntityID(index+1)]
		if node == nil || node.TopLeft == nil {
			return outputCase{}, fmt.Errorf("missing result node %s", item.ID)
		}
		output.Nodes = append(output.Nodes, outputNode{ID: item.ID, X: node.TopLeft.X, Y: node.TopLeft.Y, Width: node.Width, Height: node.Height})
	}
	for _, item := range input.Edges {
		edge := resultEdges[edgeIDs[item.ID]]
		if edge == nil {
			return outputCase{}, fmt.Errorf("missing result edge %s", item.ID)
		}
		points := make([]outputPoint, 0, len(edge.Points))
		for _, point := range edge.Points {
			points = append(points, outputPoint{X: point.X, Y: point.Y})
		}
		output.Edges = append(output.Edges, outputEdge{ID: item.ID, Points: points})
	}
	return output, nil
}

func main() {
	var cases []inputCase
	if err := json.NewDecoder(os.Stdin).Decode(&cases); err != nil {
		panic(err)
	}
	results := make([]outputCase, 0, len(cases))
	for _, input := range cases {
		output, err := run(input)
		if err != nil {
			panic(fmt.Errorf("%s: %w", input.Name, err))
		}
		results = append(results, output)
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(results); err != nil {
		panic(err)
	}
}
