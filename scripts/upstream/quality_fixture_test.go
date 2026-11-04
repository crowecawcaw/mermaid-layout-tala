// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package quality

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"github.com/d2lang/d2/lib/label"
	"math/rand"
	"os"
	"testing"
)

func TestExportTypeScriptQualityFixtures(t *testing.T) {
	path := os.Getenv("TALA_QUALITY_FIXTURES")
	if path == "" {
		t.Skip("set TALA_QUALITY_FIXTURES")
	}
	rng := rand.New(rand.NewSource(17))
	fixtures := []any{}
	for trial := 0; trial < 100; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []map[string]any{}
		edges := []map[string]any{}
		for i := 0; i < 5; i++ {
			node := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(20+rng.Intn(60)), float64(20+rng.Intn(60))))
			g.AddNodeToContainer(nil, node)
			node.TopLeft = geo.NewPoint(float64(rng.Intn(300)), float64(rng.Intn(300)))
			out := map[string]any{"id": fmt.Sprint(i), "x": node.Center().X, "y": node.Center().Y, "width": node.Width, "height": node.Height, "rank": 0, "order": i}
			if trial%3 == 0 {
				node.Label = &layoutgraph.Label{Text: "node", Width: 30, Height: 15, Position: label.InsideMiddleCenter}
				tl := node.LabelTopLeft(node.Label.Position, 30, 15)
				out["labelWidth"] = 30
				out["labelHeight"] = 15
				out["labelX"] = tl.X + 15
				out["labelY"] = tl.Y + 7.5
			}
			nodes = append(nodes, out)
		}
		if trial%4 == 0 {
			g.Containers[nil] = []*layoutgraph.Node{g.Nodes[0], g.Nodes[4]}
			nodes[0]["isGroup"] = true
			for i := 1; i < 4; i++ {
				g.AddNodeToContainer(g.Nodes[0], g.Nodes[i])
				nodes[i]["parentId"] = "0"
			}
		}
		for i := 0; i < 7; i++ {
			from, to := rng.Intn(5), rng.Intn(5)
			edge := g.Connect(g.Nodes[from], g.Nodes[to])
			a, b := edge.From.Center(), edge.To.Center()
			edge.Points = []*geo.Point{a, geo.NewPoint(a.X, b.Y), b}
			if trial%5 == 0 {
				edge.Points = []*geo.Point{a, b}
			}
			if from == to {
				edge.Points = []*geo.Point{a, geo.NewPoint(a.X+50, a.Y), geo.NewPoint(a.X+50, a.Y+50), geo.NewPoint(a.X, a.Y+50), a}
			}
			out := map[string]any{"id": fmt.Sprint(i), "from": fmt.Sprint(from), "to": fmt.Sprint(to), "x": 0, "y": 0}
			points := []map[string]float64{}
			for _, p := range edge.Points {
				points = append(points, map[string]float64{"x": p.X, "y": p.Y})
			}
			out["points"] = points
			if trial%2 == 0 {
				edge.Label = &layoutgraph.Label{Text: "edge", Width: 40, Height: 20, Position: label.InsideMiddleCenter}
				edge.LabelPercentage = 0.5
				tl := edge.LabelTopLeft(edge.Label.Position, 40, 20)
				out["labelWidth"] = 40
				out["labelHeight"] = 20
				out["x"] = tl.X + 20
				out["y"] = tl.Y + 10
			}
			edges = append(edges, out)
		}
		penalty, area, err := EvaluateWithArea(context.Background(), g)
		if err != nil {
			t.Fatal(err)
		}
		fixtures = append(fixtures, map[string]any{"name": fmt.Sprintf("quality-%03d", trial), "layout": map[string]any{"nodes": nodes, "edges": edges}, "score": map[string]float64{"penalty": penalty, "area": area}})
	}
	data, err := json.Marshal(fixtures)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
