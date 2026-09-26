package routing

import (
    "context"
    "encoding/json"
    "os"
    "sort"
    "testing"

    "github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
    "github.com/d2lang/d2/lib/geo"
)

type tsSweepObstacle struct {
    ID string `json:"id"`
    X, Y, Width, Height float64
    Container bool `json:"container"`
}
type tsSweepOwner struct {
    Node string `json:"node"`
    Directions []string `json:"directions"`
}
type tsSweepVertex struct {
    X, Y float64
    Owners []tsSweepOwner `json:"owners"`
    Center bool `json:"center"`
    Tunnel bool `json:"tunnel"`
}
type tsSweepCase struct {
    Name string `json:"name"`
    Obstacles []tsSweepObstacle `json:"obstacles"`
    Vertices []tsSweepVertex `json:"vertices"`
}
type tsSweepOutput struct {
    Name string `json:"name"`
    Edges [][4]float64 `json:"edges"`
}

func tsSweepDirection(s string) geo.Orientation {
    switch s {
    case "top": return geo.Top
    case "bottom": return geo.Bottom
    case "left": return geo.Left
    case "right": return geo.Right
    default: return geo.NONE
    }
}

func TestTSOVGSweepFixtures(t *testing.T) {
    inputPath, outputPath := os.Getenv("TALA_TS_OVG_SWEEP_INPUT"), os.Getenv("TALA_TS_OVG_SWEEP_OUTPUT")
    if inputPath == "" || outputPath == "" {
        t.Skip("set TALA_TS_OVG_SWEEP_INPUT and TALA_TS_OVG_SWEEP_OUTPUT")
    }
    data, err := os.ReadFile(inputPath)
    if err != nil { t.Fatal(err) }
    var cases []tsSweepCase
    if err := json.Unmarshal(data, &cases); err != nil { t.Fatal(err) }
    outputs := make([]tsSweepOutput, 0, len(cases))
    for _, input := range cases {
        g := layoutgraph.NewGraph()
        owners := map[string]*layoutgraph.Node{}
        var nodes []*layoutgraph.Node
        for i, item := range input.Obstacles {
            n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), item.Width, item.Height)
            n.TopLeft = geo.NewPoint(item.X, item.Y)
            g.AddNodeUnchecked(n)
            g.AddNodeToContainer(nil, n)
            owners[item.ID] = n
            nodes = append(nodes, n)
        }
        guard, err := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
        if err != nil { t.Fatal(err) }
        ovg := newBuildOVG(nodes, guard)
        for _, item := range input.Vertices {
            v := NewOVGNode(geo.NewPoint(item.X, item.Y))
            v.IsNodeCenter = item.Center
            v.IsTunnel = item.Tunnel
            for _, owner := range item.Owners {
                node := owners[owner.Node]
                if node == nil { t.Fatalf("%s: unknown owner %s", input.Name, owner.Node) }
                for _, direction := range owner.Directions {
                    v.addPortOwner(node, tsSweepDirection(direction), false)
                }
                ovg.Ports[node] = append(ovg.Ports[node], v)
            }
            ovg.AddNode(v)
        }
        if err := ovg.connectNodes(g, guard); err != nil { t.Fatal(err) }
        output := tsSweepOutput{Name: input.Name, Edges: make([][4]float64, 0, len(ovg.Edges))}
        for _, edge := range ovg.Edges {
            a, b := edge.From.Point, edge.To.Point
            if a.X > b.X || (a.X == b.X && a.Y > b.Y) { a, b = b, a }
            output.Edges = append(output.Edges, [4]float64{a.X, a.Y, b.X, b.Y})
        }
        sort.Slice(output.Edges, func(i,j int) bool {
            for k := 0; k < 4; k++ {
                if output.Edges[i][k] != output.Edges[j][k] { return output.Edges[i][k] < output.Edges[j][k] }
            }
            return false
        })
        outputs = append(outputs, output)
    }
    encoded, err := json.MarshalIndent(outputs, "", "  ")
    if err != nil { t.Fatal(err) }
    if err := os.WriteFile(outputPath, append(encoded, '\n'), 0644); err != nil { t.Fatal(err) }
}
