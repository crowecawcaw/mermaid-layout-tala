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

type tsRealSweepNode struct {
    ID string `json:"id"`
    X float64 `json:"x"`
    Y float64 `json:"y"`
    Width float64 `json:"width"`
    Height float64 `json:"height"`
}
type tsRealSweepCase struct {
    Name string `json:"name"`
    Nodes []tsRealSweepNode `json:"nodes"`
}
type tsRealSweepOwner struct {
    Node string `json:"node"`
    Directions []string `json:"directions"`
}
type tsRealSweepVertex struct {
    X float64 `json:"x"`
    Y float64 `json:"y"`
    Owners []tsRealSweepOwner `json:"owners,omitempty"`
    Center bool `json:"center,omitempty"`
    Tunnel bool `json:"tunnel,omitempty"`
}
type tsRealSweepOutput struct {
    Name string `json:"name"`
    Obstacles []tsRealSweepNode `json:"obstacles"`
    Vertices []tsRealSweepVertex `json:"vertices"`
    PreTunnelCount int `json:"preTunnelCount"`
    Edges [][4]float64 `json:"edges"`
}

func TestTSOVGRealSweepFixtures(t *testing.T) {
    inputPath, outputPath := os.Getenv("TALA_TS_OVG_REAL_SWEEP_INPUT"), os.Getenv("TALA_TS_OVG_REAL_SWEEP_OUTPUT")
    if inputPath == "" || outputPath == "" { t.Skip("set fixture paths") }
    data, err := os.ReadFile(inputPath)
    if err != nil { t.Fatal(err) }
    var cases []tsRealSweepCase
    if err := json.Unmarshal(data, &cases); err != nil { t.Fatal(err) }
    outputs := make([]tsRealSweepOutput, 0, len(cases))
    for _, input := range cases {
        g := layoutgraph.NewGraph()
        var nodes []*layoutgraph.Node
        ids := map[*layoutgraph.Node]string{}
        for i, item := range input.Nodes {
            n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), item.Width, item.Height)
            n.TopLeft = geo.NewPoint(item.X, item.Y)
            g.AddNodeUnchecked(n)
            g.AddNodeToContainer(nil, n)
            nodes = append(nodes, n)
            ids[n] = item.ID
        }
        if len(nodes) < 2 { t.Fatalf("%s: need two nodes", input.Name) }
        g.Connect(nodes[0], nodes[1])
        guard, err := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
        if err != nil { t.Fatal(err) }
        ovg := newBuildOVG(nodes, guard)
        if err := ovg.addPorts(g, guard); err != nil { t.Fatal(err) }
        if err := ovg.addNodesIntersections(g, guard); err != nil { t.Fatal(err) }
        if err := ovg.addEdgesNodes(g, guard); err != nil { t.Fatal(err) }
        tl, br, err := guard.tightBoundingBox(layoutgraph.Nodes(ovg.NodesInsideBoundingBox))
        if err != nil { t.Fatal(err) }
        if err := ovg.addNewBoundaryLayers(g, tl, br, guard); err != nil { t.Fatal(err) }
        if err := ovg.addPortConnectionNodesAtBoundaries(g, tl, br, guard); err != nil { t.Fatal(err) }
        if err := ovg.addCornerNodes(g, tl, br, guard); err != nil { t.Fatal(err) }
        preTunnelCount := len(ovg.Nodes)
        if err := ovg.addTunnels(g, guard); err != nil { t.Fatal(err) }
        output := tsRealSweepOutput{Name: input.Name, Obstacles: input.Nodes,
            Vertices: make([]tsRealSweepVertex, 0, len(ovg.Nodes)),
            PreTunnelCount: preTunnelCount, Edges: make([][4]float64, 0)}
        for _, vertex := range ovg.Nodes {
            item := tsRealSweepVertex{X: vertex.X, Y: vertex.Y, Center: vertex.IsNodeCenter,
                Tunnel: vertex.IsTunnel}
            for owner, metadata := range vertex.portOwners() {
                o := tsRealSweepOwner{Node: ids[owner], Directions: make([]string, 0)}
                for _, direction := range []struct{ value geo.Orientation; label string }{
                    {geo.Top, "top"}, {geo.Bottom, "bottom"}, {geo.Left, "left"},
                    {geo.Right, "right"}, {geo.NONE, "none"},
                } {
                    if metadata.directions.has(direction.value) { o.Directions = append(o.Directions, direction.label) }
                }
                item.Owners = append(item.Owners, o)
            }
            sort.Slice(item.Owners, func(i, j int) bool { return item.Owners[i].Node < item.Owners[j].Node })
            output.Vertices = append(output.Vertices, item)
        }
        preexistingEdges := len(ovg.Edges) // addTunnels connects its entries before the sweep
        if err := ovg.connectNodes(g, guard); err != nil { t.Fatal(err) }
        for _, edge := range ovg.Edges[preexistingEdges:] {
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
