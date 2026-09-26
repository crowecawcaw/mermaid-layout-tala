package grouping

import (
    "context"
    "encoding/json"
    "os"
    "testing"

    "github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
    "github.com/d2lang/d2/lib/geo"
)

type tsJoinPoint struct { X float64 `json:"x"`; Y float64 `json:"y"` }
type tsJoinNode struct {
    ID string `json:"id"`
    Width float64 `json:"width"`
    Height float64 `json:"height"`
    X float64 `json:"x"`
    Y float64 `json:"y"`
    FixedTopLeft *tsJoinPoint `json:"fixedTopLeft,omitempty"`
}
type tsJoinEdge struct { From string `json:"from"`; To string `json:"to"`; Directed bool `json:"directed"` }
type tsJoinCase struct {
    Name string `json:"name"`
    Nodes []tsJoinNode `json:"nodes"`
    Edges []tsJoinEdge `json:"edges"`
}
type tsJoinResult struct {
    tsJoinCase
    CellSize float64 `json:"cellSize"`
    Positions map[string]tsJoinPoint `json:"positions"`
}

func TestTSOrdinaryJoinFixtures(t *testing.T) {
    inputPath, outputPath := os.Getenv("TALA_TS_JOIN_INPUT"), os.Getenv("TALA_TS_JOIN_OUTPUT")
    if inputPath == "" || outputPath == "" { t.Skip("fixture paths not supplied") }
    data, err := os.ReadFile(inputPath)
    if err != nil { t.Fatal(err) }
    var cases []tsJoinCase
    if err := json.Unmarshal(data, &cases); err != nil { t.Fatal(err) }
    results := make([]tsJoinResult, 0, len(cases))
    for _, c := range cases {
        graph := layoutgraph.NewGraph()
        byID := make(map[string]*layoutgraph.Node)
        for index, input := range c.Nodes {
            node := layoutgraph.NewNode(layoutgraph.EntityID(index+1), input.Width, input.Height)
            node.TopLeft = geo.NewPoint(input.X, input.Y)
            if input.FixedTopLeft != nil { node.FixedTopLeft = geo.NewPoint(input.FixedTopLeft.X, input.FixedTopLeft.Y) }
            graph.AddNodeUnchecked(node)
            graph.AddNodeToContainer(nil, node)
            byID[input.ID] = node
        }
        for _, input := range c.Edges {
            edge := graph.Connect(byID[input.From], byID[input.To])
            if input.Directed { edge.TargetArrowhead = layoutgraph.TriangleArrowhead }
        }
        graph.ComputeCellSize()
        if err := JoinDistancedClusters(context.Background(), graph); err != nil { t.Fatalf("%s: %v", c.Name, err) }
        out := tsJoinResult{tsJoinCase: c, CellSize: graph.CellSize, Positions: make(map[string]tsJoinPoint)}
        for _, input := range c.Nodes {
            p := byID[input.ID].TopLeft
            out.Positions[input.ID] = tsJoinPoint{p.X, p.Y}
        }
        results = append(results, out)
    }
    output, err := json.MarshalIndent(results, "", "  ")
    if err != nil { t.Fatal(err) }
    if err := os.WriteFile(outputPath, append(output, '\n'), 0644); err != nil { t.Fatal(err) }
}
