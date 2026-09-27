package engine

import (
    "context"
    "encoding/json"
    "os"
    "testing"

    "github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
    "github.com/d2lang/d2/lib/geo"
)

type tsRouteStageNode struct {
    ID string `json:"id"`
    ParentID string `json:"parentId"`
    Width float64 `json:"width"`
    Height float64 `json:"height"`
    IsGroup bool `json:"isGroup"`
}
type tsRouteStageEdge struct {
    ID string `json:"id"`
    From string `json:"from"`
    To string `json:"to"`
    Directed bool `json:"directed"`
}
type tsRouteStageCase struct {
    Name string `json:"name"`
    Direction string `json:"direction"`
    Seed int64 `json:"seed"`
    Nodes []tsRouteStageNode `json:"nodes"`
    Edges []tsRouteStageEdge `json:"edges"`
}
type tsRouteStageSnapshot struct {
    Index int `json:"index"`
    Stage string `json:"stage"`
    Nodes map[string][4]float64 `json:"nodes"`
    Features map[string][4]bool `json:"features"`
    Nears map[string][]string `json:"nears"`
    NodeOrder []string `json:"nodeOrder"`
    EdgeOrder []string `json:"edgeOrder"`
    Edges map[string][][2]float64 `json:"edges"`
}
type tsRouteStageOutput struct {
    Name string `json:"name"`
    Stages []tsRouteStageSnapshot `json:"stages"`
}

func TestTSCompoundRouteStages(t *testing.T) {
    inputPath, outputPath := os.Getenv("TALA_TS_COMPOUND_STAGE_INPUT"), os.Getenv("TALA_TS_COMPOUND_STAGE_OUTPUT")
    if inputPath == "" || outputPath == "" { t.Skip("set compound stage paths") }
    data, err := os.ReadFile(inputPath)
    if err != nil { t.Fatal(err) }
    var inputs []tsRouteStageCase
    if err := json.Unmarshal(data, &inputs); err != nil { t.Fatal(err) }
    outputs := make([]tsRouteStageOutput, 0)
    for _, input := range inputs {
        if input.Name != "chain-TB-3" && input.Name != "chain-BT-4" &&
            input.Name != "chain-RL-3" && input.Name != "chain-TB-4" { continue }
        g := layoutgraph.NewGraph()
        switch input.Direction {
        case "TB": g.Directions[nil] = geo.Bottom
        case "BT": g.Directions[nil] = geo.Top
        case "LR": g.Directions[nil] = geo.Right
        case "RL": g.Directions[nil] = geo.Left
        }
        byID := map[string]*layoutgraph.Node{}
        for i, item := range input.Nodes {
            node := layoutgraph.NewNode(layoutgraph.EntityID(i+1), item.Width, item.Height)
            if item.IsGroup { node.SetContainer(true) }
            g.AddNodeUnchecked(node)
            byID[item.ID] = node
        }
        for _, item := range input.Nodes {
            g.AddNodeToContainer(byID[item.ParentID], byID[item.ID])
            if item.IsGroup && g.Containers[byID[item.ID]] == nil {
                g.Containers[byID[item.ID]] = []*layoutgraph.Node{}
            }
        }
        edgeIDs := map[*layoutgraph.Edge]string{}
        for i, item := range input.Edges {
            edge := g.Connect(byID[item.From], byID[item.To])
            edge.ID = layoutgraph.EntityID(i+1)
            if item.Directed { edge.TargetArrowhead = layoutgraph.TriangleArrowhead }
            edgeIDs[edge] = item.ID
        }
        output := tsRouteStageOutput{Name: input.Name}
        p := newPipeline(g, input.Seed, false)
        p.stages = make([]pipelineStage, len(defaultPipelineStages))
        for i, stage := range defaultPipelineStages {
            original, index, name := stage.run, i, stage.name
            p.stages[i] = pipelineStage{name: name, run: func(p *pipeline, ctx context.Context) error {
                if err := original(p, ctx); err != nil { return err }
                if index != 21 && index != 23 && index != 24 && index != 27 &&
                    index != 28 && index != 36 { return nil }
                snapshot := tsRouteStageSnapshot{Index: index, Stage: name,
                    Nodes: make(map[string][4]float64), Features: make(map[string][4]bool),
                    Nears: make(map[string][]string),
                    Edges: make(map[string][][2]float64)}
                for _, item := range input.Nodes {
                    node := byID[item.ID]
                    snapshot.Nodes[item.ID] = [4]float64{node.TopLeft.X, node.TopLeft.Y,
                        node.Width, node.Height}
                    _, tree := g.NodeToTree[node]
                    _, sequence := g.Sequences[node]
                    snapshot.Features[item.ID] = [4]bool{tree, node.Hierarchy != nil,
                        node.Cluster != nil, sequence}
                    for _, near := range node.OrderedNears() {
                        for _, other := range input.Nodes {
                            if near == byID[other.ID] {
                                snapshot.Nears[item.ID] = append(snapshot.Nears[item.ID], other.ID)
                                break
                            }
                        }
                    }
                }
                for _, node := range g.Nodes {
                    for _, item := range input.Nodes {
                        if byID[item.ID] == node { snapshot.NodeOrder = append(snapshot.NodeOrder, item.ID); break }
                    }
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
