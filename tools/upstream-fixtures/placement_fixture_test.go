package placement

import (
    "context"
    "encoding/json"
    "math/rand"
    "os"
    "testing"

    "github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
    "github.com/d2lang/d2/lib/geo"
)

// Development-only oracle for the ordinary placeNodesOrthogonally stage.
type tsPlacementNode struct { ID string `json:"id"`; Width float64 `json:"width"`; Height float64 `json:"height"` }
type tsPlacementEdge struct { From string `json:"from"`; To string `json:"to"`; Directed bool `json:"directed"` }
type tsPlacementCase struct {
    Name string `json:"name"`
    Seed int64 `json:"seed"`
    Direction string `json:"direction"`
    Nodes []tsPlacementNode `json:"nodes"`
    Edges []tsPlacementEdge `json:"edges"`
}
type tsPlacementPoint struct { X float64 `json:"x"`; Y float64 `json:"y"` }
type tsPlacementResult struct {
    tsPlacementCase
    CellSize float64 `json:"cellSize"`
    Initial map[string]tsPlacementPoint `json:"initial,omitempty"`
    Positions map[string]tsPlacementPoint `json:"positions,omitempty"`
    Error string `json:"error,omitempty"`
}

func TestTSOrdinaryPlacementFixtures(t *testing.T) {
    inputPath, outputPath := os.Getenv("TALA_TS_PLACEMENT_INPUT"), os.Getenv("TALA_TS_PLACEMENT_OUTPUT")
    if inputPath == "" || outputPath == "" { t.Skip("fixture paths not supplied") }
    data, err := os.ReadFile(inputPath)
    if err != nil { t.Fatal(err) }
    var cases []tsPlacementCase
    if err := json.Unmarshal(data, &cases); err != nil { t.Fatal(err) }
    results := make([]tsPlacementResult, 0, len(cases))
    for _, c := range cases {
        g := layoutgraph.NewGraph()
        nodes := make(map[string]*layoutgraph.Node)
        for i, input := range c.Nodes {
            n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), input.Width, input.Height)
            g.AddNodeUnchecked(n)
            g.AddNodeToContainer(nil, n)
            nodes[input.ID] = n
        }
        for _, input := range c.Edges {
            e := g.Connect(nodes[input.From], nodes[input.To])
            if input.Directed { e.TargetArrowhead = layoutgraph.TriangleArrowhead }
        }
        switch c.Direction {
        case "TB": g.Directions[nil] = geo.Bottom
        case "BT": g.Directions[nil] = geo.Top
        case "LR": g.Directions[nil] = geo.Right
        case "RL": g.Directions[nil] = geo.Left
        }
        g.ComputeCellSize()
        out := tsPlacementResult{tsPlacementCase: c, CellSize: g.CellSize}
        initialized := false
        if c.Seed%2 == 0 {
            initialized, err = initializeByGraphDistance(context.Background(), g)
            if err != nil { t.Fatalf("%s initialization: %v", c.Name, err) }
        }
        if !initialized {
            if err := initializeNodes(context.Background(), g); err != nil { t.Fatalf("%s initialization: %v", c.Name, err) }
        }
        out.Initial = make(map[string]tsPlacementPoint)
        for _, input := range c.Nodes {
            p := nodes[input.ID].TopLeft
            out.Initial[input.ID] = tsPlacementPoint{p.X, p.Y}
            nodes[input.ID].TopLeft = nil
        }
        rng := rand.New(rand.NewSource(c.Seed))
        if err := placeNodesOrthogonally(context.Background(), nil, g, nil, rng, nil, c.Seed); err != nil {
            out.Error = err.Error()
        } else {
            out.Positions = make(map[string]tsPlacementPoint)
            for _, input := range c.Nodes {
                p := nodes[input.ID].TopLeft
                out.Positions[input.ID] = tsPlacementPoint{p.X, p.Y}
            }
        }
        results = append(results, out)
    }
    output, err := json.MarshalIndent(results, "", "  ")
    if err != nil { t.Fatal(err) }
    if err := os.WriteFile(outputPath, append(output, '\n'), 0644); err != nil { t.Fatal(err) }
}
