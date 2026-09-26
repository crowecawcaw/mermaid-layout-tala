// Run from the pinned D2 checkout after copying this file to
// d2layouts/d2talalayout/cmd/ts-fixtures/main.go. This is a development-only
// differential oracle; the TypeScript package never invokes Go.
package main

import (
    "context"
    "encoding/json"
    "fmt"
    "os"

    "github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
    "github.com/d2lang/d2/d2layouts/d2talalayout/internal/placementcost"
    "github.com/d2lang/d2/lib/geo"
)

type inputNode struct {
    ID string `json:"id"`
    Width float64 `json:"width"`
    Height float64 `json:"height"`
    X float64 `json:"x"`
    Y float64 `json:"y"`
}
type inputEdge struct {
    From string `json:"from"`
    To string `json:"to"`
    Directed bool `json:"directed"`
}
type inputCase struct {
    Name string `json:"name"`
    Direction string `json:"direction"`
    Nodes []inputNode `json:"nodes"`
    Edges []inputEdge `json:"edges"`
}
type outputNode struct {
    ID string `json:"id"`
    SizelessCost float64 `json:"sizelessCost"`
    SizedCost float64 `json:"sizedCost"`
    Symmetry float64 `json:"symmetry"`
}
type outputCase struct {
    inputCase
    CellSize float64 `json:"cellSize"`
    TurnCost float64 `json:"turnCost"`
    Results []outputNode `json:"results"`
}

func orientation(name string) geo.Orientation {
    switch name {
    case "TB": return geo.Bottom
    case "BT": return geo.Top
    case "LR": return geo.Right
    case "RL": return geo.Left
    default: return geo.NONE
    }
}

func evaluate(c inputCase) (outputCase, error) {
    g := layoutgraph.NewGraph()
    byID := make(map[string]*layoutgraph.Node)
    for i, input := range c.Nodes {
        n := layoutgraph.NewNode(layoutgraph.EntityID(i + 1), input.Width, input.Height)
        n.TopLeft = geo.NewPoint(input.X, input.Y)
        g.AddNodeUnchecked(n)
        g.AddNodeToContainer(nil, n)
        byID[input.ID] = n
    }
    for _, input := range c.Edges {
        from, to := byID[input.From], byID[input.To]
        if from == nil || to == nil { return outputCase{}, fmt.Errorf("unknown edge endpoint") }
        edge := g.Connect(from, to)
        if input.Directed { edge.TargetArrowhead = layoutgraph.TriangleArrowhead }
    }
    if c.Direction != "" { g.Directions[nil] = orientation(c.Direction) }
    g.ComputeCellSize()
    // The sized optimizer sees the halved turn cost after the sizeless phase.
    g.TurnCost()
    g.HalveTurnCost()
    out := outputCase{inputCase: c, CellSize: g.CellSize, TurnCost: g.TurnCost()}
    for _, input := range c.Nodes {
        node := byID[input.ID]
        sizeless, err := placementcost.NodeEdgeLength(context.Background(), node, placementcost.EdgeLengthOptions{PenalizeDirection: true})
        if err != nil { return outputCase{}, err }
        sized, err := placementcost.NodeEdgeLength(context.Background(), node, placementcost.EdgeLengthOptions{IncludeNodeSizes: true, PenalizeDirection: true})
        if err != nil { return outputCase{}, err }
        symmetry, err := placementcost.NodeSymmetry(context.Background(), node, nil)
        if err != nil { return outputCase{}, err }
        out.Results = append(out.Results, outputNode{ID: input.ID, SizelessCost: sizeless, SizedCost: sized, Symmetry: symmetry})
    }
    return out, nil
}

func main() {
    var cases []inputCase
    if err := json.NewDecoder(os.Stdin).Decode(&cases); err != nil { panic(err) }
    outputs := make([]outputCase, 0, len(cases))
    for _, c := range cases {
        output, err := evaluate(c)
        if err != nil { panic(fmt.Errorf("%s: %w", c.Name, err)) }
        outputs = append(outputs, output)
    }
    encoder := json.NewEncoder(os.Stdout)
    encoder.SetIndent("", "  ")
    if err := encoder.Encode(outputs); err != nil { panic(err) }
}
