// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package trees

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/lib/geo"
	"math/rand"
	"os"
	"testing"
)

func TestExportTypeScriptTreesFixtures(t *testing.T) {
	path := os.Getenv("TALA_TREES_FIXTURES")
	if path == "" {
		t.Skip("set TALA_TREES_FIXTURES")
	}
	out := []any{}
	for trial := 0; trial < 80; trial++ {
		for _, o := range []geo.Orientation{geo.Top, geo.Right, geo.Bottom, geo.Left} {
			rng := rand.New(rand.NewSource(int64(79 + trial)))
			g := layoutgraph.NewGraph()
			ts := []*layoutgraph.Tree{}
			nodes := []any{}
			edges := []any{}
			count := 2 + rng.Intn(30)
			for j := 0; j < count; j++ {
				n := layoutgraph.NewNode(layoutgraph.EntityID(j+1), float64(20+rng.Intn(80))+0.25, float64(20+rng.Intn(80))+0.5)
				g.AddNode(n)
				n.TopLeft = geo.NewPoint(-50, -40)
				tree := layoutgraph.NewTree(n)
				ts = append(ts, tree)
				parent := -1
				if j > 0 {
					parent = rng.Intn(j)
					tree.Parent = ts[parent]
					tree.Parent.Children = append(tree.Parent.Children, tree)
					var e *layoutgraph.Edge
					if j%3 == 0 {
						e = g.Connect(n, ts[parent].Node)
					} else {
						e = g.Connect(ts[parent].Node, n)
					}
					e.ID = layoutgraph.EntityID(j)
					e.TargetArrowhead = layoutgraph.TriangleArrowhead
					e.MinWidth = rng.Intn(180)
					e.MinHeight = rng.Intn(180)
					if j%2 == 0 {
						e.Label = &layoutgraph.Label{Text: "label", Width: float64(e.MinWidth), Height: float64(e.MinHeight)}
					}
					tree.SentinelEdge = e
					edges = append(edges, map[string]any{"id": j, "from": e.From.ID, "to": e.To.ID, "minWidth": e.MinWidth, "minHeight": e.MinHeight, "label": e.Label != nil})
				}
				nodes = append(nodes, map[string]any{"id": n.ID, "width": n.Width, "height": n.Height, "x": n.TopLeft.X, "y": n.TopLeft.Y, "parent": parent, "container": 0})
				if j%7 == 0 {
					child := layoutgraph.NewNode(layoutgraph.EntityID(1000+j), 10, 15)
					g.AddNode(child)
					child.TopLeft = geo.NewPoint(-35, -25)
					g.AddNodeToContainer(n, child)
					nodes = append(nodes, map[string]any{"id": child.ID, "width": child.Width, "height": child.Height, "x": child.TopLeft.X, "y": child.TopLeft.Y, "parent": -2, "container": n.ID})
				}
			}
			guard, err := limits.NewWorkGuard(context.Background(), "tree fixture", limits.MaxEngineWorkUnits)
			if err != nil {
				t.Fatal(err)
			}
			if err := constructToOrientation(ts[0], o, guard); err != nil {
				t.Fatal(err)
			}
			if err := positionTreeEdgeLabels(ts[0], true, guard); err != nil {
				t.Fatal(err)
			}
			expected := map[string]any{}
			for _, n := range g.Nodes {
				expected[fmt.Sprint(n.ID)] = map[string]float64{"x": n.TopLeft.X, "y": n.TopLeft.Y, "width": n.Width, "height": n.Height}
			}
			expectedEdges := map[string]any{}
			for _, e := range g.Edges {
				pos := 0
				if e.Label != nil {
					pos = int(e.Label.Position)
				}
				expectedEdges[fmt.Sprint(e.ID)] = map[string]any{"position": pos, "percentage": e.LabelPercentage}
			}
			out = append(out, map[string]any{"name": fmt.Sprintf("tree-%03d-%s", trial, o.ToString()), "orientation": o, "nodes": nodes, "edges": edges, "expected": expected, "expectedEdges": expectedEdges, "work": fmt.Sprint(guard.Used())})
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
