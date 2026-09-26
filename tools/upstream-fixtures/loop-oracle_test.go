// Copy into pinned upstream internal/loops as ts_loop_fixture_test.go.
// Development oracle only.
package loops

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
)

type tsLoopBBox struct {
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}
type tsLoopNode struct {
	Shape      string  `json:"shape"`
	NumColumns int     `json:"numColumns,omitempty"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	Width      float64 `json:"width"`
	Height     float64 `json:"height"`
}
type tsLoopEdge struct {
	ID              string      `json:"id"`
	SourceArrowhead string      `json:"sourceArrowhead,omitempty"`
	TargetArrowhead string      `json:"targetArrowhead,omitempty"`
	LabelBBox       *tsLoopBBox `json:"labelBBox,omitempty"`
}
type tsLoopCase struct {
	Name  string       `json:"name"`
	Node  tsLoopNode   `json:"node"`
	Edges []tsLoopEdge `json:"edges"`
}
type tsLoopRoute struct {
	ID           string      `json:"id"`
	Points       []geo.Point `json:"points"`
	LabelTopLeft *geo.Point  `json:"labelTopLeft,omitempty"`
}
type tsLoopOutput struct {
	Name    string             `json:"name"`
	Routes  []tsLoopRoute      `json:"routes"`
	Offsets map[string]float64 `json:"offsets"`
}

func TestTSLoopRoutes(t *testing.T) {
	inputPath, outputPath := os.Getenv("TALA_TS_LOOP_INPUT"), os.Getenv("TALA_TS_LOOP_OUTPUT")
	if inputPath == "" || outputPath == "" {
		t.Skip("set fixture paths")
	}
	data, err := os.ReadFile(inputPath)
	if err != nil {
		t.Fatal(err)
	}
	var cases []tsLoopCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	outputs := make([]tsLoopOutput, 0, len(cases))
	for _, item := range cases {
		graph := layoutgraph.NewGraph()
		node := layoutgraph.NewNode(1, item.Node.Width, item.Node.Height)
		node.TopLeft = geo.NewPoint(item.Node.X, item.Node.Y)
		node.SetShape(item.Node.Shape)
		node.SetNumColumns(item.Node.NumColumns)
		graph.AddNodeUnchecked(node)
		graph.AddNodeToContainer(nil, node)
		edges := make(map[string]*layoutgraph.Edge)
		for _, entry := range item.Edges {
			edge := graph.Connect(node, node)
			edge.SourceArrowhead = layoutgraph.Arrowhead(entry.SourceArrowhead)
			edge.TargetArrowhead = layoutgraph.Arrowhead(entry.TargetArrowhead)
			if entry.LabelBBox != nil {
				edge.Label = &layoutgraph.Label{Width: entry.LabelBBox.Width, Height: entry.LabelBBox.Height}
			}
			edges[entry.ID] = edge
		}
		Route(node)
		output := tsLoopOutput{Name: item.Name, Routes: make([]tsLoopRoute, 0, len(item.Edges))}
		for _, entry := range item.Edges {
			route := tsLoopRoute{ID: entry.ID, Points: make([]geo.Point, 0)}
			for _, point := range edges[entry.ID].Points {
				route.Points = append(route.Points, *point)
			}
			if label := edges[entry.ID].Label; label != nil {
				route.LabelTopLeft = edges[entry.ID].LabelTopLeft(label.Position, label.Width, label.Height)
			}
			output.Routes = append(output.Routes, route)
		}
		UpdateOffsets(node)
		output.Offsets = map[string]float64{
			"top": node.LoopOffsets[geo.Top], "left": node.LoopOffsets[geo.Left],
			"bottom": node.LoopOffsets[geo.Bottom], "right": node.LoopOffsets[geo.Right],
			"topLeft": node.LoopOffsets[geo.TopLeft], "topRight": node.LoopOffsets[geo.TopRight],
			"bottomLeft": node.LoopOffsets[geo.BottomLeft], "bottomRight": node.LoopOffsets[geo.BottomRight],
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
