package placement

import (
	"context"
	"fmt"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
)

// Copy into the pinned upstream internal/placement package and run with -v.
// These are ordinary bridge graphs that exercise the two-edge transpose path.
func TestTSTransposeAllBridgeFixtures(t *testing.T) {
	cases := [][3][2]float64{
		{{0, 0}, {0, 100}, {0, 200}},
		{{0, 100}, {0, 0}, {0, 200}},
		{{-200, -200}, {-200, 0}, {-200, -100}},
	}
	for i, positions := range cases {
		graph := layoutgraph.NewGraph()
		nodes := make([]*layoutgraph.Node, 3)
		for index, position := range positions {
			node := layoutgraph.NewNode(layoutgraph.EntityID(index+1), 40, 30)
			node.TopLeft = geo.NewPoint(position[0], position[1])
			graph.AddNewNodeToContainer(nil, node)
			nodes[index] = node
		}
		graph.Connect(nodes[0], nodes[1])
		graph.Connect(nodes[1], nodes[2])
		if err := TransposeAll(context.Background(), graph); err != nil {
			t.Fatal(err)
		}
		fmt.Printf("bridge %d:", i+1)
		for _, node := range nodes {
			fmt.Printf(" (%.0f,%.0f)", node.TopLeft.X, node.TopLeft.Y)
		}
		fmt.Println()
	}
}
