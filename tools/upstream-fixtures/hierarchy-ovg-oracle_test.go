package routing

import (
    "encoding/json"
    "fmt"
    "os"
    "testing"

    "github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
    "github.com/d2lang/d2/lib/geo"
)

type tsHierarchyOVGCase struct {
    Name string `json:"name"`
    Direction string `json:"direction"`
    Edges []struct { From string `json:"from"`; To string `json:"to"` } `json:"edges"`
}
type tsHierarchyOVGStage struct {
    Name string `json:"name"`
    Nodes []struct {
        ID string `json:"id"`; X float64 `json:"x"`; Y float64 `json:"y"`
        Width float64 `json:"width"`; Height float64 `json:"height"`
    } `json:"nodes"`
}
type tsHierarchyOVGOutput struct {
    Name string `json:"name"`
    Vertices [][2]float64 `json:"vertices"`
}

func TestTSHierarchyOVGVertices(t *testing.T) {
    casesPath := os.Getenv("TALA_TS_HIERARCHY_CASES")
    stagePath := os.Getenv("TALA_TS_HIERARCHY_STAGE")
    outputPath := os.Getenv("TALA_TS_HIERARCHY_OVG_OUTPUT")
    if casesPath == "" || stagePath == "" || outputPath == "" { t.Skip("set hierarchy OVG fixture paths") }
    caseBytes, err := os.ReadFile(casesPath)
    if err != nil { t.Fatal(err) }
    stageBytes, err := os.ReadFile(stagePath)
    if err != nil { t.Fatal(err) }
    var cases []tsHierarchyOVGCase
    var stages []tsHierarchyOVGStage
    if err := json.Unmarshal(caseBytes, &cases); err != nil { t.Fatal(err) }
    if err := json.Unmarshal(stageBytes, &stages); err != nil { t.Fatal(err) }
    outputs := make([]tsHierarchyOVGOutput, 0, len(cases))
    for _, input := range cases {
        stage := tsHierarchyOVGStage{}
        for _, candidate := range stages { if candidate.Name == input.Name { stage = candidate; break } }
        if stage.Name == "" { t.Fatalf("missing stage for %s", input.Name) }
        g := layoutgraph.NewGraph()
        switch input.Direction {
        case "TB": g.Directions[nil] = geo.Bottom
        case "BT": g.Directions[nil] = geo.Top
        case "LR": g.Directions[nil] = geo.Right
        case "RL": g.Directions[nil] = geo.Left
        }
        h := layoutgraph.NewHierarchy()
        byID := make(map[string]*layoutgraph.Node)
        for i, item := range stage.Nodes {
            n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), item.Width, item.Height))
            n.TopLeft = geo.NewPoint(item.X, item.Y)
            n.Hierarchy = h
            var level, index int
            if _, err := fmt.Sscanf(item.ID, "L%d_%d", &level, &index); err != nil { t.Fatal(err) }
            h.Levels()[n] = level
            if level + 1 > h.LevelCount { h.LevelCount = level + 1 }
            byID[item.ID] = n
        }
        for _, item := range input.Edges { g.Connect(byID[item.From], byID[item.To]) }
        g.ComputeCellSize()
        ovg, err := newOVGForHierarchy(g, h, newBackgroundOVGBuildGuardForTest(t))
        if err != nil { t.Fatalf("%s: %v", input.Name, err) }
        out := tsHierarchyOVGOutput{Name: input.Name, Vertices: make([][2]float64, 0, len(ovg.Nodes))}
        for _, n := range ovg.Nodes { out.Vertices = append(out.Vertices, [2]float64{n.X, n.Y}) }
        outputs = append(outputs, out)
    }
    encoded, err := json.MarshalIndent(outputs, "", "  ")
    if err != nil { t.Fatal(err) }
    if err := os.WriteFile(outputPath, append(encoded, '\n'), 0644); err != nil { t.Fatal(err) }
}
