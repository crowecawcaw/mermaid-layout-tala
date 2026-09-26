// Copy into the pinned upstream internal/engine package as
// ts_cluster_geometry_fixture_test.go. Development oracle only.
package engine

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
)

type tsClusterGeometryNode struct {
	ID     string  `json:"id"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	X      float64 `json:"x,omitempty"`
	Y      float64 `json:"y,omitempty"`
}
type tsClusterGeometryCase struct {
	Name        string                         `json:"name"`
	Arrangement layoutgraph.ClusterArrangement `json:"arrangement"`
	FixedSize   bool                           `json:"fixedSize"`
	Padding     float64                        `json:"padding"`
	X           float64                        `json:"x"`
	Y           float64                        `json:"y"`
	Nodes       []tsClusterGeometryNode        `json:"nodes"`
}
type tsClusterGeometryOutput struct {
	Name      string                  `json:"name"`
	Vessel    tsClusterGeometryNode   `json:"vessel"`
	Nodes     []tsClusterGeometryNode `json:"nodes"`
	AfterSync []tsClusterGeometryNode `json:"afterSync"`
}

func TestTSClusterGeometryFixtures(t *testing.T) {
	inputPath, outputPath := os.Getenv("TALA_TS_CLUSTER_GEOMETRY_INPUT"), os.Getenv("TALA_TS_CLUSTER_GEOMETRY_OUTPUT")
	if inputPath == "" || outputPath == "" {
		t.Skip("set fixture paths")
	}
	data, err := os.ReadFile(inputPath)
	if err != nil {
		t.Fatal(err)
	}
	var cases []tsClusterGeometryCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	outputs := make([]tsClusterGeometryOutput, 0, len(cases))
	for _, input := range cases {
		graph := layoutgraph.NewGraph()
		nodes := make([]*layoutgraph.Node, 0, len(input.Nodes))
		for index, item := range input.Nodes {
			node := layoutgraph.NewNode(layoutgraph.EntityID(index+1), item.Width, item.Height)
			graph.AddNodeUnchecked(node)
			graph.AddNodeToContainer(nil, node)
			nodes = append(nodes, node)
		}
		vessel := layoutgraph.NewNode(layoutgraph.EntityID(len(nodes)+1), 1, 1)
		graph.AddNodeUnchecked(vessel)
		graph.AddNodeToContainer(nil, vessel)
		cluster := &layoutgraph.Cluster{Vessel: vessel, Nodes: nodes, Arrangement: input.Arrangement,
			Padding: input.Padding, FixedSize: input.FixedSize}
		cluster.Resize(vessel)
		vessel.TopLeft = geo.NewPoint(input.X, input.Y)
		cluster.ArrangeClusterNodes()
		output := tsClusterGeometryOutput{Name: input.Name,
			Vessel: tsClusterGeometryNode{ID: "vessel", Width: vessel.Width, Height: vessel.Height,
				X: vessel.TopLeft.X, Y: vessel.TopLeft.Y},
			Nodes: make([]tsClusterGeometryNode, 0, len(nodes))}
		for index, node := range nodes {
			output.Nodes = append(output.Nodes, tsClusterGeometryNode{ID: input.Nodes[index].ID,
				Width: node.Width, Height: node.Height, X: node.TopLeft.X, Y: node.TopLeft.Y})
		}
		cluster.SyncGeometry()
		output.AfterSync = make([]tsClusterGeometryNode, 0, len(nodes))
		for index, node := range nodes {
			output.AfterSync = append(output.AfterSync, tsClusterGeometryNode{ID: input.Nodes[index].ID,
				Width: node.Width, Height: node.Height, X: node.TopLeft.X, Y: node.TopLeft.Y})
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
