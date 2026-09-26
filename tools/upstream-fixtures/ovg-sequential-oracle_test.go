package routing

import (
    "context"
    "encoding/json"
    "os"
    "testing"

    "github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
    "github.com/d2lang/d2/lib/geo"
)

type tsSequentialNode struct {
    ID string `json:"id"`
    X float64 `json:"x"`
    Y float64 `json:"y"`
    Width float64 `json:"width"`
    Height float64 `json:"height"`
}
type tsSequentialEdge struct {
    ID string `json:"id"`
    From string `json:"from"`
    To string `json:"to"`
}
type tsSequentialCase struct {
    Name string `json:"name"`
    Nodes []tsSequentialNode `json:"nodes"`
    Edges []tsSequentialEdge `json:"edges"`
}
type tsSequentialRoute struct {
    ID string `json:"id"`
    Cost float64 `json:"cost"`
    Points [][2]float64 `json:"points"`
    Error string `json:"error,omitempty"`
}
type tsSequentialOutput struct {
    Name string `json:"name"`
    Routes []tsSequentialRoute `json:"routes"`
    Generated []tsSequentialRoute `json:"generated"`
    Slingshots []tsSequentialRoute `json:"slingshots"`
    GenerationError string `json:"generationError,omitempty"`
    TotalCost float64 `json:"totalCost"`
}

func TestTSOVGSequentialFixtures(t *testing.T) {
    inputPath, outputPath := os.Getenv("TALA_TS_OVG_SEQUENTIAL_INPUT"), os.Getenv("TALA_TS_OVG_SEQUENTIAL_OUTPUT")
    if inputPath == "" || outputPath == "" { t.Skip("set fixture paths") }
    data, err := os.ReadFile(inputPath)
    if err != nil { t.Fatal(err) }
    var cases []tsSequentialCase
    if err := json.Unmarshal(data, &cases); err != nil { t.Fatal(err) }
    outputs := make([]tsSequentialOutput, 0, len(cases))
    for _, input := range cases {
        g := layoutgraph.NewGraph()
        nodes := map[string]*layoutgraph.Node{}
        for i, item := range input.Nodes {
            n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), item.Width, item.Height)
            n.TopLeft = geo.NewPoint(item.X, item.Y)
            g.AddNodeUnchecked(n)
            g.AddNodeToContainer(nil, n)
            nodes[item.ID] = n
        }
        edgeIDs := map[*layoutgraph.Edge]string{}
        for _, item := range input.Edges {
            edge := g.Connect(nodes[item.From], nodes[item.To])
            edgeIDs[edge] = item.ID
        }
        ovg, err := buildOVGFromGraphWithLimits(context.Background(), g, nil, defaultOVGBuildLimits())
        if err != nil { t.Fatal(err) }
        router, err := newOVGEdgeRouterWithWorkLimit(context.Background(), ShortestToLongest,
            ovg, g, nil, g.Edges, maxRouteSearchWorkUnits)
        if err != nil { t.Fatal(err) }
        output := tsSequentialOutput{Name: input.Name, Routes: make([]tsSequentialRoute, 0)}
        for _, edge := range router.edges {
            path, cost, err := router.search(context.Background(), edge)
            route := tsSequentialRoute{ID: edgeIDs[edge], Cost: cost, Points: make([][2]float64, 0)}
            if err != nil { route.Error = err.Error() }
            for _, point := range path { route.Points = append(route.Points, [2]float64{point.X, point.Y}) }
            output.Routes = append(output.Routes, route)
            if err != nil { break }
            if len(path) < 3 { t.Fatalf("%s: route too short", input.Name) }
            if err := router.addRoute(&Route{GEdge: edge, OVGNodes: path,
                FromPort: *path[1].Point, ToPort: *path[len(path)-2].Point}); err != nil { t.Fatal(err) }
        }
        slingshotRouter, err := newOVGEdgeRouterWithWorkLimit(context.Background(), ShortestToLongest,
            ovg, g, nil, g.Edges, maxRouteSearchWorkUnits)
        if err != nil { t.Fatal(err) }
        output.Slingshots = make([]tsSequentialRoute, 0, len(slingshotRouter.edges))
        for _, edge := range slingshotRouter.edges {
            path, cost, err := slingshotRouter.slingshot(context.Background(), edge)
            item := tsSequentialRoute{ID: edgeIDs[edge], Cost: cost, Points: make([][2]float64, 0)}
            if err != nil { item.Error = err.Error() }
            for _, point := range path {
                item.Points = append(item.Points, [2]float64{point.X, point.Y})
            }
            output.Slingshots = append(output.Slingshots, item)
        }
        generator, err := newOVGEdgeRouterWithWorkLimit(context.Background(), ShortestToLongest,
            ovg, g, nil, g.Edges, maxRouteSearchWorkUnits)
        if err != nil { t.Fatal(err) }
        response := generator.generateRoutes(context.Background(), false)
        output.Generated = make([]tsSequentialRoute, 0, len(response.Routes))
        output.TotalCost = response.Distance
        if response.Err != nil { output.GenerationError = response.Err.Error() }
        for _, route := range response.Routes {
            item := tsSequentialRoute{ID: edgeIDs[route.GEdge], Points: make([][2]float64, 0)}
            for _, point := range route.OVGNodes {
                item.Points = append(item.Points, [2]float64{point.X, point.Y})
            }
            output.Generated = append(output.Generated, item)
        }
        outputs = append(outputs, output)
    }
    encoded, err := json.MarshalIndent(outputs, "", "  ")
    if err != nil { t.Fatal(err) }
    if err := os.WriteFile(outputPath, append(encoded, '\n'), 0644); err != nil { t.Fatal(err) }
}
