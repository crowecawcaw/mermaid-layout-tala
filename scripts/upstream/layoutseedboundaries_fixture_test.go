// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"testing"

	"github.com/d2lang/d2/d2graph"
	"github.com/d2lang/d2/lib/geo"
)

func TestExportTypeScriptLayoutseedboundariesFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTSEEDBOUNDARIES_FIXTURES")
	if path == "" {
		t.Skip()
	}
	cases := []struct {
		name  string
		count int
		pairs [][2]int
	}{
		{"diamond", 4, [][2]int{{0, 1}, {0, 2}, {1, 3}, {2, 3}}},
		{"cycle", 4, [][2]int{{0, 1}, {1, 2}, {2, 3}, {3, 0}, {0, 2}}},
		{"parallel", 3, [][2]int{{0, 1}, {0, 1}, {1, 2}, {2, 0}}},
	}
	seedSets := [][]int64{{0}, {-1}, {math.MinInt64, math.MaxInt64}, {math.MaxInt64, 0, -1, math.MinInt64}, {1, 1, -1, -1}}
	directions := []struct{ api, d2 string }{{"TB", "down"}, {"BT", "up"}, {"LR", "right"}, {"RL", "left"}}
	fixtures := []any{}
	for _, tc := range cases {
		for _, dir := range directions {
			for seedIndex, seeds := range seedSets {
				g := d2graph.NewGraph()
				g.Root.Direction.Value = dir.d2
				nodes := []any{}
				edges := []any{}
				objects := []*d2graph.Object{}
				for i := 0; i < tc.count; i++ {
					id := fmt.Sprintf("n%d", i)
					w, h := float64(60+i*10), float64(30+i*5)
					n := &d2graph.Object{Graph: g, Parent: g.Root, ID: id, IDVal: id, Box: geo.NewBox(geo.NewPoint(0, 0), w, h), Children: map[string]*d2graph.Object{}}
					g.Root.Children[id] = n
					g.Root.ChildrenArray = append(g.Root.ChildrenArray, n)
					g.Objects = append(g.Objects, n)
					objects = append(objects, n)
					nodes = append(nodes, map[string]any{"id": id, "width": w, "height": h})
				}
				for i, pair := range tc.pairs {
					id := fmt.Sprintf("e%d", i)
					from, to := objects[pair[0]], objects[pair[1]]
					g.Edges = append(g.Edges, &d2graph.Edge{Index: i, Src: from, Dst: to, DstArrow: true})
					edges = append(edges, map[string]any{"id": id, "from": from.ID, "to": to.ID, "d2Index": i})
				}
				opts := DefaultOptions()
				opts.Seeds = seeds
				if err := Layout(context.Background(), g, &opts); err != nil {
					t.Fatalf("%s %s seeds %d: %v", tc.name, dir.api, seedIndex, err)
				}
				outNodes := []any{}
				outEdges := []any{}
				seedStrings := []string{}
				for _, seed := range seeds {
					seedStrings = append(seedStrings, fmt.Sprint(seed))
				}
				for _, n := range objects {
					outNodes = append(outNodes, map[string]any{"id": n.ID, "x": n.TopLeft.X + n.Width/2, "y": n.TopLeft.Y + n.Height/2, "width": n.Width, "height": n.Height})
				}
				for i, e := range g.Edges {
					outEdges = append(outEdges, map[string]any{"id": fmt.Sprintf("e%d", i), "points": e.Route})
				}
				fixtures = append(fixtures, map[string]any{"name": fmt.Sprintf("%s-%s-%d", tc.name, dir.api, seedIndex), "nodes": nodes, "edges": edges, "direction": dir.api, "seeds": seedStrings, "expected": map[string]any{"nodes": outNodes, "edges": outEdges}})
			}
		}
	}
	data, err := json.Marshal(fixtures)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
