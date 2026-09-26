package placement

import (
    "context"
    "encoding/json"
    "os"
    "testing"

    "github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
    "github.com/d2lang/d2/lib/geo"
)

// Development-only differential oracle. Copy this file into upstream's
// internal/placement package and supply absolute input/output paths by env.
type tsCompactionNode struct {
    ID string `json:"id"`
    Width float64 `json:"width"`
    Height float64 `json:"height"`
    X float64 `json:"x"`
    Y float64 `json:"y"`
    Fixed bool `json:"fixed"`
}
type tsCompactionEdge struct { From string `json:"from"`; To string `json:"to"` }
type tsCompactionCase struct {
    Name string `json:"name"`
    Axis string `json:"axis"`
    IncludeSizes bool `json:"includeSizes"`
    Transition bool `json:"transition"`
    Factor float64 `json:"factor"`
    Nodes []tsCompactionNode `json:"nodes"`
    Edges []tsCompactionEdge `json:"edges"`
}
type tsCompactionPoint struct { X float64 `json:"x"`; Y float64 `json:"y"` }
type tsCompactionResult struct {
    tsCompactionCase
    CellSize float64 `json:"cellSize"`
    Visibility []tsCompactionEdge `json:"visibility"`
    Candidates map[string][]tsCompactionPoint `json:"candidates"`
    Inflated map[string]tsCompactionPoint `json:"inflated"`
}

func TestTSCompactionFixtures(t *testing.T) {
    inputPath, outputPath := os.Getenv("TALA_TS_COMPACTION_INPUT"), os.Getenv("TALA_TS_COMPACTION_OUTPUT")
    if inputPath == "" || outputPath == "" { t.Skip("fixture paths not supplied") }
    data, err := os.ReadFile(inputPath)
    if err != nil { t.Fatal(err) }
    var cases []tsCompactionCase
    if err := json.Unmarshal(data, &cases); err != nil { t.Fatal(err) }
    results := make([]tsCompactionResult, 0, len(cases))
    for _, c := range cases {
        g := layoutgraph.NewGraph()
        byID := make(map[string]*layoutgraph.Node)
        reverse := make(map[*layoutgraph.Node]string)
        for i, input := range c.Nodes {
            n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), input.Width, input.Height)
            n.TopLeft = geo.NewPoint(input.X, input.Y)
            if input.Fixed { n.FixedTopLeft = n.TopLeft.Copy() }
            g.AddNodeUnchecked(n)
            g.AddNodeToContainer(nil, n)
            byID[input.ID] = n
            reverse[n] = input.ID
        }
        for _, e := range c.Edges { g.Connect(byID[e.From], byID[e.To]) }
        g.ComputeCellSize()
        horizontal := c.Axis == "x"
        visible, err := visibilityEdges(context.Background(), g, horizontal, c.IncludeSizes)
        if err != nil { t.Fatalf("%s: %v", c.Name, err) }
        out := tsCompactionResult{tsCompactionCase: c, CellSize: g.CellSize,
            Visibility: make([]tsCompactionEdge, 0, len(visible)),
            Candidates: make(map[string][]tsCompactionPoint), Inflated: make(map[string]tsCompactionPoint)}
        for _, e := range visible { out.Visibility = append(out.Visibility, tsCompactionEdge{reverse[e.From], reverse[e.To]}) }
        for _, input := range c.Nodes {
            n := byID[input.ID]
            points, err := candidateMoves(context.Background(), g, n, c.Factor, horizontal, c.IncludeSizes, 0, visible)
            if err != nil { t.Fatalf("%s candidates: %v", c.Name, err) }
            out.Candidates[input.ID] = make([]tsCompactionPoint, 0, len(points))
            for _, p := range points { out.Candidates[input.ID] = append(out.Candidates[input.ID], tsCompactionPoint{p.X, p.Y}) }
        }
        inflateAlongAxis(g, horizontal, c.IncludeSizes, c.Factor, visible, c.Transition)
        for _, input := range c.Nodes {
            p := byID[input.ID].TopLeft
            out.Inflated[input.ID] = tsCompactionPoint{p.X, p.Y}
        }
        results = append(results, out)
    }
    output, err := json.MarshalIndent(results, "", "  ")
    if err != nil { t.Fatal(err) }
    if err := os.WriteFile(outputPath, append(output, '\n'), 0644); err != nil { t.Fatal(err) }
}
