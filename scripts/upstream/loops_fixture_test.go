// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package loops

import (
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptLoopsFixtures(t *testing.T) {
	path := os.Getenv("TALA_LOOPS_FIXTURES")
	if path == "" {
		t.Skip("set TALA_LOOPS_FIXTURES")
	}
	out := []any{}
	for _, size := range [][2]float64{{60, 40}, {73, 35}, {100.5, 57.25}} {
		for count := 1; count <= 44; count++ {
			g := layoutgraph.NewGraph()
			node := g.AddNode(layoutgraph.NewNode(1, size[0], size[1]))
			node.TopLeft = geo.NewPoint(10, 20)
			inputs := []map[string]any{}
			expected := map[string]any{}
			ids := map[*layoutgraph.Edge]string{}
			for i := 0; i < count; i++ {
				edge := g.Connect(node, node)
				id := fmt.Sprint(i)
				ids[edge] = id
				source, target := "none", "triangle"
				if i%4 == 1 {
					source = "triangle"
					target = "none"
				}
				if i%4 == 2 {
					source = "triangle"
				}
				if i%4 == 3 {
					target = "none"
				}
				edge.SourceArrowhead = layoutgraph.Arrowhead(source)
				edge.TargetArrowhead = layoutgraph.Arrowhead(target)
				input := map[string]any{"id": id, "from": "node", "to": "node", "sourceArrowhead": source, "targetArrowhead": target}
				if i%3 == 1 {
					edge.Label = &layoutgraph.Label{Width: float64(20 + i*2), Height: float64(10 + i)}
					input["labelWidth"] = edge.Label.Width
					input["labelHeight"] = edge.Label.Height
				}
				inputs = append(inputs, input)
			}
			for _, edge := range Route(node) {
				points := []map[string]float64{}
				for _, p := range edge.Points {
					points = append(points, map[string]float64{"x": p.X, "y": p.Y})
				}
				expected[ids[edge]] = points
			}
			out = append(out, map[string]any{"name": fmt.Sprintf("%v-%d", size, count), "node": map[string]any{"id": "node", "x": 10 + size[0]/2, "y": 20 + size[1]/2, "width": size[0], "height": size[1], "rank": 0, "order": 0}, "edges": inputs, "expected": expected})
		}
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
