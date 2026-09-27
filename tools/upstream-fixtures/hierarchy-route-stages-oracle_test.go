package engine

import (
    "context"
    "encoding/json"
    "os"
    "testing"

    "github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
    "github.com/d2lang/d2/lib/geo"
)

type tsHierarchyRouteCase struct {
    Name string `json:"name"`
    Direction string `json:"direction"`
    Seed int64 `json:"seed"`
    Nodes []struct {
        ID string `json:"id"`; Width float64 `json:"width"`; Height float64 `json:"height"`
    } `json:"nodes"`
    Edges []struct {
        ID string `json:"id"`; From string `json:"from"`; To string `json:"to"`
        Directed bool `json:"directed"`
    } `json:"edges"`
}
type tsHierarchyRouteSnapshot struct {
    Index int `json:"index"`
    Stage string `json:"stage"`
    Nodes map[string][4]float64 `json:"nodes"`
    Levels map[string]int `json:"levels"`
    EdgeOrder []string `json:"edgeOrder"`
    Edges map[string][][2]float64 `json:"edges"`
}
type tsHierarchyRouteOutput struct {
    Name string `json:"name"`
    Stages []tsHierarchyRouteSnapshot `json:"stages"`
}

func TestTSHierarchyRouteStages(t *testing.T) {
    inputPath, outputPath := os.Getenv("TALA_TS_HIERARCHY_ROUTE_INPUT"), os.Getenv("TALA_TS_HIERARCHY_ROUTE_OUTPUT")
    if inputPath == "" || outputPath == "" { t.Skip("set hierarchy route paths") }
    data, err := os.ReadFile(inputPath)
    if err != nil { t.Fatal(err) }
    var cases []tsHierarchyRouteCase
    if err := json.Unmarshal(data, &cases); err != nil { t.Fatal(err) }
    outputs := make([]tsHierarchyRouteOutput, 0, len(cases))
    for _, input := range cases {
        g := layoutgraph.NewGraph()
        switch input.Direction {
        case "TB": g.Directions[nil] = geo.Bottom
        case "BT": g.Directions[nil] = geo.Top
        case "LR": g.Directions[nil] = geo.Right
        case "RL": g.Directions[nil] = geo.Left
        }
        byID := make(map[string]*layoutgraph.Node)
        for i, item := range input.Nodes {
            n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), item.Width, item.Height))
            g.AddNodeToContainer(nil, n)
            byID[item.ID] = n
        }
        edgeIDs := make(map[*layoutgraph.Edge]string)
        for i, item := range input.Edges {
            edge := g.Connect(byID[item.From], byID[item.To])
            edge.ID = layoutgraph.EntityID(i+1)
            if item.Directed { edge.TargetArrowhead = layoutgraph.TriangleArrowhead }
            edgeIDs[edge] = item.ID
        }
        output := tsHierarchyRouteOutput{Name: input.Name}
        p := newPipeline(g, input.Seed, false)
        p.stages = make([]pipelineStage, len(defaultPipelineStages))
        for i, stage := range defaultPipelineStages {
            original, index, name := stage.run, i, stage.name
            p.stages[i] = pipelineStage{name: name, run: func(p *pipeline, ctx context.Context) error {
                if err := original(p, ctx); err != nil { return err }
                if index != 20 && index != 21 && index != 23 && index != 24 &&
                    index != 28 && index != 30 && index != 31 && index != 34 &&
                    index != 35 && index != 36 { return nil }
                snapshot := tsHierarchyRouteSnapshot{Index: index, Stage: name,
                    Nodes: make(map[string][4]float64), Levels: make(map[string]int),
                    Edges: make(map[string][][2]float64)}
                for _, item := range input.Nodes {
                    node := byID[item.ID]
                    snapshot.Nodes[item.ID] = [4]float64{node.TopLeft.X, node.TopLeft.Y,
                        node.Width, node.Height}
                    if node.Hierarchy != nil { snapshot.Levels[item.ID] = node.HierarchyLevel() }
                }
                for _, edge := range g.Edges {
                    snapshot.EdgeOrder = append(snapshot.EdgeOrder, edgeIDs[edge])
                    points := make([][2]float64, 0, len(edge.Points))
                    for _, point := range edge.Points { points = append(points, [2]float64{point.X, point.Y}) }
                    snapshot.Edges[edgeIDs[edge]] = points
                }
                output.Stages = append(output.Stages, snapshot)
                return nil
            }}
        }
        if err := p.runAllStages(context.Background()); err != nil { t.Fatal(err) }
        outputs = append(outputs, output)
    }
    encoded, err := json.MarshalIndent(outputs, "", "  ")
    if err != nil { t.Fatal(err) }
    if err := os.WriteFile(outputPath, append(encoded, '\n'), 0644); err != nil { t.Fatal(err) }
}
