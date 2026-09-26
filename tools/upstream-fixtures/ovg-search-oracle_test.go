package routing

import (
    "context"
    "encoding/json"
    "os"
    "testing"

    "github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
    "github.com/d2lang/d2/lib/geo"
)

type tsSearchNode struct {
    ID string `json:"id"`
    X float64 `json:"x"`
    Y float64 `json:"y"`
    Width float64 `json:"width"`
    Height float64 `json:"height"`
}
type tsSearchCase struct {
    Name string `json:"name"`
    Nodes []tsSearchNode `json:"nodes"`
}
type tsSearchOutput struct {
    Name string `json:"name"`
    Cost float64 `json:"cost"`
    Points [][2]float64 `json:"points"`
    Error string `json:"error,omitempty"`
    GeneratedPoints [][2]float64 `json:"generatedPoints"`
    GeneratedCost float64 `json:"generatedCost"`
    GenerationError string `json:"generationError,omitempty"`
}

func TestTSOVGSearchFixtures(t *testing.T) {
    inputPath, outputPath := os.Getenv("TALA_TS_OVG_SEARCH_INPUT"), os.Getenv("TALA_TS_OVG_SEARCH_OUTPUT")
    if inputPath == "" || outputPath == "" { t.Skip("set fixture paths") }
    data, err := os.ReadFile(inputPath)
    if err != nil { t.Fatal(err) }
    var cases []tsSearchCase
    if err := json.Unmarshal(data, &cases); err != nil { t.Fatal(err) }
    outputs := make([]tsSearchOutput, 0, len(cases))
    for _, input := range cases {
        g := layoutgraph.NewGraph()
        var nodes []*layoutgraph.Node
        for i, item := range input.Nodes {
            n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), item.Width, item.Height)
            n.TopLeft = geo.NewPoint(item.X, item.Y)
            g.AddNodeUnchecked(n)
            g.AddNodeToContainer(nil, n)
            nodes = append(nodes, n)
        }
        if len(nodes) < 2 { t.Fatalf("%s: need two nodes", input.Name) }
        edge := g.Connect(nodes[0], nodes[1])
        ovg, err := buildOVGFromGraphWithLimits(context.Background(), g, nil, defaultOVGBuildLimits())
        if err != nil { t.Fatal(err) }
        router, err := newOVGEdgeRouterWithWorkLimit(context.Background(), ShortestToLongest,
            ovg, g, nil, []*layoutgraph.Edge{edge}, maxRouteSearchWorkUnits)
        if err != nil { t.Fatal(err) }
        path, cost, err := router.search(context.Background(), edge)
        output := tsSearchOutput{Name: input.Name, Cost: cost, Points: make([][2]float64, 0)}
        if err != nil { output.Error = err.Error() }
        for _, point := range path {
            output.Points = append(output.Points, [2]float64{point.X, point.Y})
        }
        generator, err := newOVGEdgeRouterWithWorkLimit(context.Background(), ShortestToLongest,
            ovg, g, nil, []*layoutgraph.Edge{edge}, maxRouteSearchWorkUnits)
        if err != nil { t.Fatal(err) }
        response := generator.generateRoutes(context.Background(), false)
        output.GeneratedPoints = make([][2]float64, 0)
        output.GeneratedCost = response.Distance
        if response.Err != nil { output.GenerationError = response.Err.Error() }
        for _, route := range response.Routes {
            for _, point := range route.OVGNodes {
                output.GeneratedPoints = append(output.GeneratedPoints, [2]float64{point.X, point.Y})
            }
        }
        outputs = append(outputs, output)
    }
    encoded, err := json.MarshalIndent(outputs, "", "  ")
    if err != nil { t.Fatal(err) }
    if err := os.WriteFile(outputPath, append(encoded, '\n'), 0644); err != nil { t.Fatal(err) }
}
