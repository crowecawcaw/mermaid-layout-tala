package routing

import (
    "context"
    "encoding/json"
    "math"
    "os"
    "testing"

    "github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
    "github.com/d2lang/d2/lib/geo"
)

type tsBalanceNode struct {
    ID string `json:"id"`
    ParentID string `json:"parentId,omitempty"`
    X, Y, Width, Height float64
}
type tsBalanceEdge struct {
    ID string `json:"id"`
    From string `json:"from"`
    To string `json:"to"`
    Points [][2]float64 `json:"points"`
}
type tsBalanceOutput struct {
    Name string `json:"name"`
    Nodes []tsBalanceNode `json:"nodes"`
    Before []tsBalanceEdge `json:"before"`
    After []tsBalanceEdge `json:"after"`
}

func TestTSBalanceOrderOracle(t *testing.T) {
    outputPath := os.Getenv("TALA_TS_BALANCE_ORDER_OUTPUT")
    if outputPath == "" { t.Skip("set balance-order output path") }
    outputs := make([]tsBalanceOutput, 0, 8)
    for _, orientation := range []string{"down", "up", "right", "left"} {
        for _, reverse := range []bool{false, true} {
            g, _, _ := containerBalanceOrderGraph()
            transform := func(p *geo.Point) {
                switch orientation {
                case "up": p.Y = 810-p.Y
                case "right": p.X, p.Y = p.Y, p.X
                case "left": p.X, p.Y = 810-p.Y, p.X
                }
            }
            for _, node := range g.Nodes {
                br := geo.NewPoint(node.TopLeft.X+node.Width, node.TopLeft.Y+node.Height)
                transform(node.TopLeft)
                transform(br)
                node.Width, node.Height = math.Abs(br.X-node.TopLeft.X), math.Abs(br.Y-node.TopLeft.Y)
                node.TopLeft.X, node.TopLeft.Y = math.Min(node.TopLeft.X, br.X), math.Min(node.TopLeft.Y, br.Y)
            }
            for _, edge := range g.Edges {
                for _, point := range edge.Points { transform(point) }
                if reverse {
                    edge.From, edge.To = edge.To, edge.From
                    for i, j := 0, len(edge.Points)-1; i < j; i, j = i+1, j-1 {
                        edge.Points[i], edge.Points[j] = edge.Points[j], edge.Points[i]
                    }
                }
            }
            name := orientation
            if reverse { name += "-reversed" }
            output := tsBalanceOutput{Name: name}
            names := map[*layoutgraph.Node]string{}
            for i, node := range g.Nodes {
                id := string(rune('a'+i))
                names[node] = id
            }
            for _, node := range g.Nodes {
                item := tsBalanceNode{ID: names[node], X: node.TopLeft.X, Y: node.TopLeft.Y,
                    Width: node.Width, Height: node.Height}
                if node.Container != nil { item.ParentID = names[node.Container] }
                output.Nodes = append(output.Nodes, item)
            }
            snapshot := func() []tsBalanceEdge {
                routes := make([]tsBalanceEdge, 0, len(g.Edges))
                for i, edge := range g.Edges {
                    item := tsBalanceEdge{ID: string(rune('0'+i)), From: names[edge.From],
                        To: names[edge.To], Points: make([][2]float64, 0, len(edge.Points))}
                    for _, point := range edge.Points { item.Points = append(item.Points, [2]float64{point.X, point.Y}) }
                    routes = append(routes, item)
                }
                return routes
            }
            output.Before = snapshot()
            if err := BalanceEdgeSegments(context.Background(), g); err != nil { t.Fatal(err) }
            output.After = snapshot()
            outputs = append(outputs, output)
        }
    }
    {
        g := layoutgraph.NewGraph()
        source := layoutgraph.NewNode(1, 80, 40)
        source.TopLeft = geo.NewPoint(80, 80)
        sink := layoutgraph.NewNode(2, 60, 40)
        sink.TopLeft = geo.NewPoint(0, 200)
        remote := layoutgraph.NewNode(3, 80, 40)
        remote.TopLeft = geo.NewPoint(180, 300)
        for _, node := range []*layoutgraph.Node{source, sink, remote} { g.AddNewNodeToContainer(nil, node) }
        for _, x := range []float64{100, 140} {
            edge := g.Connect(source, sink)
            edge.Points = []*geo.Point{geo.NewPoint(x, 80), geo.NewPoint(x, 40),
                geo.NewPoint(30, 40), geo.NewPoint(30, 200)}
        }
        edge := g.Connect(remote, sink)
        edge.Points = []*geo.Point{geo.NewPoint(260, 320), geo.NewPoint(300, 320),
            geo.NewPoint(300, 60), geo.NewPoint(30, 60), geo.NewPoint(30, 200)}
        output := tsBalanceOutput{Name: "uncross-reversal"}
        for i, node := range g.Nodes {
            output.Nodes = append(output.Nodes, tsBalanceNode{ID: string(rune('a'+i)),
                X: node.TopLeft.X, Y: node.TopLeft.Y, Width: node.Width, Height: node.Height})
        }
        snapshot := func() []tsBalanceEdge {
            routes := make([]tsBalanceEdge, 0, len(g.Edges))
            for i, edge := range g.Edges {
                item := tsBalanceEdge{ID: string(rune('0'+i)),
                    From: string(rune('a'+edge.From.ID-1)), To: string(rune('a'+edge.To.ID-1)),
                    Points: make([][2]float64, 0, len(edge.Points))}
                for _, point := range edge.Points { item.Points = append(item.Points, [2]float64{point.X, point.Y}) }
                routes = append(routes, item)
            }
            return routes
        }
        output.Before = snapshot()
        if err := BalanceEdgeSegments(context.Background(), g); err != nil { t.Fatal(err) }
        output.After = snapshot()
        outputs = append(outputs, output)
    }
    encoded, err := json.MarshalIndent(outputs, "", "  ")
    if err != nil { t.Fatal(err) }
    if err := os.WriteFile(outputPath, append(encoded, '\n'), 0644); err != nil { t.Fatal(err) }
}
