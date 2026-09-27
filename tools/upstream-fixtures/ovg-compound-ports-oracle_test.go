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

type tsCompoundPortNode struct {
    ID string `json:"id"`
    ParentID string `json:"parentId"`
    IsGroup bool `json:"isGroup"`
    X float64 `json:"x"`
    Y float64 `json:"y"`
    Width float64 `json:"width"`
    Height float64 `json:"height"`
}
type tsCompoundPortEdge struct { From string `json:"from"`; To string `json:"to"`; Directed bool `json:"directed"` }
type tsCompoundPortCase struct {
    Name string `json:"name"`
    Nodes []tsCompoundPortNode `json:"nodes"`
    Edges []tsCompoundPortEdge `json:"edges"`
}
type tsCompoundPortOutput struct {
    Name string `json:"name"`
    Ports [][2]float64 `json:"ports"`
    Intersections [][2]float64 `json:"intersections"`
    AfterEdges [][2]float64 `json:"afterEdges"`
    AfterCorners [][2]float64 `json:"afterCorners"`
    SweepEdges [][4]float64 `json:"sweepEdges"`
    TunnelEdges [][4]float64 `json:"tunnelEdges"`
    AfterTunnels [][2]float64 `json:"afterTunnels"`
    FullVertexCount int `json:"fullVertexCount"`
    FullEdgeCount int `json:"fullEdgeCount"`
    RouteFlavors []tsCompoundRouteFlavor `json:"routeFlavors"`
    FinalRoutes []tsCompoundRoute `json:"finalRoutes"`
}
type tsCompoundRouteFlavor struct {
    Name string `json:"name"`
    Cost float64 `json:"cost"`
    Routes []tsCompoundRoute `json:"routes"`
    Error string `json:"error,omitempty"`
}
type tsCompoundRoute struct {
    Index int `json:"index"`
    Points [][2]float64 `json:"points"`
}

func TestTSCompoundOVGPorts(t *testing.T) {
    inputPath, outputPath := os.Getenv("TALA_TS_COMPOUND_OVG_INPUT"), os.Getenv("TALA_TS_COMPOUND_OVG_OUTPUT")
    if inputPath == "" || outputPath == "" { t.Skip("set compound OVG paths") }
    data, err := os.ReadFile(inputPath)
    if err != nil { t.Fatal(err) }
    var inputs []tsCompoundPortCase
    if err := json.Unmarshal(data, &inputs); err != nil { t.Fatal(err) }
    outputs := make([]tsCompoundPortOutput, 0, len(inputs))
    for _, input := range inputs {
        g := layoutgraph.NewGraph()
        byID := map[string]*layoutgraph.Node{}
        for i, item := range input.Nodes {
            n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), item.Width, item.Height)
            n.TopLeft = geo.NewPoint(item.X, item.Y)
            if item.IsGroup { n.SetContainer(true) }
            g.AddNodeUnchecked(n)
            byID[item.ID] = n
        }
        for _, item := range input.Nodes { g.AddNodeToContainer(byID[item.ParentID], byID[item.ID]) }
        for _, item := range input.Nodes {
            if item.IsGroup && g.Containers[byID[item.ID]] == nil {
                g.Containers[byID[item.ID]] = []*layoutgraph.Node{}
            }
        }
        for _, item := range input.Edges {
            edge := g.Connect(byID[item.From], byID[item.To])
            if item.Directed { edge.TargetArrowhead = layoutgraph.TriangleArrowhead }
        }
        guard, err := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
        if err != nil { t.Fatal(err) }
        ovg := newBuildOVG(g.Nodes, guard)
        if err := ovg.addPorts(g, guard); err != nil { t.Fatal(err) }
        output := tsCompoundPortOutput{Name: input.Name, Ports: make([][2]float64, 0), Intersections: make([][2]float64, 0), AfterEdges: make([][2]float64, 0), AfterCorners: make([][2]float64, 0)}
        for _, node := range ovg.Nodes { output.Ports = append(output.Ports, [2]float64{node.X, node.Y}) }
        portCount := len(ovg.Nodes)
        if err := ovg.addNodesIntersections(g, guard); err != nil { t.Fatal(err) }
        for _, node := range ovg.Nodes[portCount:] { output.Intersections = append(output.Intersections, [2]float64{node.X, node.Y}) }
        if err := ovg.addEdgesNodes(g, guard); err != nil { t.Fatal(err) }
        for _, node := range ovg.Nodes { output.AfterEdges = append(output.AfterEdges, [2]float64{node.X, node.Y}) }
        tl, br, err := guard.tightBoundingBox(layoutgraph.Nodes(ovg.NodesInsideBoundingBox))
        if err != nil { t.Fatal(err) }
        if err := ovg.addNewBoundaryLayers(g, tl, br, guard); err != nil { t.Fatal(err) }
        if err := ovg.addPortConnectionNodesAtBoundaries(g, tl, br, guard); err != nil { t.Fatal(err) }
        if err := ovg.addCornerNodes(g, tl, br, guard); err != nil { t.Fatal(err) }
        for _, node := range ovg.Nodes { output.AfterCorners = append(output.AfterCorners, [2]float64{node.X, node.Y}) }
        if err := ovg.connectNodes(g, guard); err != nil { t.Fatal(err) }
        output.SweepEdges = make([][4]float64, 0, len(ovg.Edges))
        for _, edge := range ovg.Edges {
            a, b := edge.From.Point, edge.To.Point
            if a.X > b.X || a.X == b.X && a.Y > b.Y { a, b = b, a }
            output.SweepEdges = append(output.SweepEdges, [4]float64{a.X, a.Y, b.X, b.Y})
        }
        sort.Slice(output.SweepEdges, func(i,j int) bool {
            for k := 0; k < 4; k++ { if output.SweepEdges[i][k] != output.SweepEdges[j][k] { return output.SweepEdges[i][k] < output.SweepEdges[j][k] } }
            return false
        })
        edgeCount := len(ovg.Edges)
        if err := ovg.addTunnels(g, guard); err != nil { t.Fatal(err) }
        output.TunnelEdges = make([][4]float64, 0, len(ovg.Edges)-edgeCount)
        for _, edge := range ovg.Edges[edgeCount:] {
            a, b := edge.From.Point, edge.To.Point
            if a.X > b.X || a.X == b.X && a.Y > b.Y { a, b = b, a }
            output.TunnelEdges = append(output.TunnelEdges, [4]float64{a.X, a.Y, b.X, b.Y})
        }
        for _, node := range ovg.Nodes { output.AfterTunnels = append(output.AfterTunnels, [2]float64{node.X, node.Y}) }
        sort.Slice(output.TunnelEdges, func(i,j int) bool {
            for k := 0; k < 4; k++ { if output.TunnelEdges[i][k] != output.TunnelEdges[j][k] { return output.TunnelEdges[i][k] < output.TunnelEdges[j][k] } }
            return false
        })
        sortPoints := func(points [][2]float64) {
            sort.Slice(points, func(i,j int) bool {
                if points[i][0] != points[j][0] { return points[i][0] < points[j][0] }
                return points[i][1] < points[j][1]
            })
        }
        sortPoints(output.Ports)
        sortPoints(output.Intersections)
        sortPoints(output.AfterEdges)
        sortPoints(output.AfterCorners)
        sortPoints(output.AfterTunnels)
        full, err := buildOVGFromGraphWithLimits(context.Background(), g, nil, defaultOVGBuildLimits())
        if err != nil { t.Fatal(err) }
        output.FullVertexCount, output.FullEdgeCount = len(full.Nodes), len(full.Edges)
        edgeIndex := map[*layoutgraph.Edge]int{}
        for i, edge := range g.Edges { edgeIndex[edge] = i }
        for _, flavor := range []RouteGenerationFlavor{ShortestToLongest, LongestToShortest, Default} {
            router, err := newOVGEdgeRouterWithWorkLimit(context.Background(), flavor,
                full, g, nil, g.Edges, maxRouteSearchWorkUnits)
            if err != nil { t.Fatal(err) }
            response := router.generateRoutes(context.Background(), false)
            item := tsCompoundRouteFlavor{Name: string(flavor), Cost: response.Distance,
                Routes: make([]tsCompoundRoute, 0, len(response.Routes))}
            if response.Err != nil { item.Error = response.Err.Error() }
            for _, route := range response.Routes {
                path := tsCompoundRoute{Index: edgeIndex[route.GEdge], Points: make([][2]float64, 0)}
                for _, point := range route.createSegmentEndpoints() {
                    path.Points = append(path.Points, [2]float64{point.X, point.Y})
                }
                item.Routes = append(item.Routes, path)
            }
            output.RouteFlavors = append(output.RouteFlavors, item)
        }
        if _, err := routeEdges(context.Background(), g, nil); err != nil { t.Fatal(err) }
        for i, edge := range g.Edges {
            route := tsCompoundRoute{Index: i, Points: make([][2]float64, 0)}
            for _, point := range edge.Points { route.Points = append(route.Points, [2]float64{point.X, point.Y}) }
            output.FinalRoutes = append(output.FinalRoutes, route)
        }
        outputs = append(outputs, output)
    }
    encoded, err := json.MarshalIndent(outputs, "", "  ")
    if err != nil { t.Fatal(err) }
    if err := os.WriteFile(outputPath, append(encoded, '\n'), 0644); err != nil { t.Fatal(err) }
}
