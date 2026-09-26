// Copy into pinned upstream internal/layoutgraph as ts_node_gap_fixture_test.go.
// Development oracle only.
package layoutgraph

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/lib/geo"
	"github.com/d2lang/d2/lib/label"
)

type tsGapOffsets struct {
	Top    int `json:"top"`
	Left   int `json:"left"`
	Bottom int `json:"bottom"`
	Right  int `json:"right"`
}
type tsGapBBox struct {
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}
type tsGapNode struct {
	Shape         string        `json:"shape,omitempty"`
	Width         float64       `json:"width"`
	Height        float64       `json:"height"`
	X             float64       `json:"x"`
	Y             float64       `json:"y"`
	LoopOffsets   *tsGapOffsets `json:"loopOffsets,omitempty"`
	LabelBBox     *tsGapBBox    `json:"labelBBox,omitempty"`
	LabelPosition string        `json:"labelPosition,omitempty"`
}
type tsGapEdge struct {
	MinWidth  int `json:"minWidth"`
	MinHeight int `json:"minHeight"`
}
type tsGapCase struct {
	Name      string     `json:"name"`
	First     tsGapNode  `json:"first"`
	Second    tsGapNode  `json:"second"`
	Edge      *tsGapEdge `json:"edge,omitempty"`
	Candidate geo.Point  `json:"candidate"`
}
type tsGapOutput struct {
	Name  string `json:"name"`
	Delta int    `json:"delta"`
}

func TestTSNodeGapFixtures(t *testing.T) {
	inputPath, outputPath := os.Getenv("TALA_TS_NODE_GAP_INPUT"), os.Getenv("TALA_TS_NODE_GAP_OUTPUT")
	if inputPath == "" || outputPath == "" {
		t.Skip("set fixture paths")
	}
	data, err := os.ReadFile(inputPath)
	if err != nil {
		t.Fatal(err)
	}
	var cases []tsGapCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	outputs := make([]tsGapOutput, 0, len(cases))
	for _, item := range cases {
		graph := NewGraph()
		newNode := func(id EntityID, input tsGapNode) *Node {
			node := NewNode(id, input.Width, input.Height)
			node.TopLeft = geo.NewPoint(input.X, input.Y)
			if input.Shape != "" {
				node.SetShape(input.Shape)
			}
			if input.LoopOffsets != nil {
				o := input.LoopOffsets
				node.LoopOffsets = map[geo.Orientation]float64{
					geo.Top: float64(o.Top), geo.Left: float64(o.Left),
					geo.Bottom: float64(o.Bottom), geo.Right: float64(o.Right),
					geo.TopLeft: float64(max(o.Top, o.Left)), geo.TopRight: float64(max(o.Top, o.Right)),
					geo.BottomLeft: float64(max(o.Bottom, o.Left)), geo.BottomRight: float64(max(o.Bottom, o.Right)),
				}
			}
			if input.LabelBBox != nil {
				node.Label = &Label{Width: input.LabelBBox.Width, Height: input.LabelBBox.Height,
					Position: label.FromString(input.LabelPosition)}
				if input.LabelPosition != "" {
					node.Label.FixPosition()
				}
			}
			graph.AddNodeUnchecked(node)
			graph.AddNodeToContainer(nil, node)
			node.UpdateSpacing()
			return node
		}
		first, second := newNode(1, item.First), newNode(2, item.Second)
		if item.Edge != nil {
			edge := graph.Connect(first, second)
			edge.MinWidth, edge.MinHeight = item.Edge.MinWidth, item.Edge.MinHeight
		}
		outputs = append(outputs, tsGapOutput{Name: item.Name, Delta: first.deltaTo(second, &item.Candidate)})
	}
	encoded, err := json.MarshalIndent(outputs, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(outputPath, append(encoded, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
