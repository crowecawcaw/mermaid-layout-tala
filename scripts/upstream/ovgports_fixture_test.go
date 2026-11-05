// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptOvgportsFixtures(t *testing.T) {
	path := os.Getenv("TALA_OVGPORTS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	names := []string{"Square", "RealSquare", "Parallelogram", "Document", "Cylinder", "Queue", "Page", "Package", "Step", "Callout", "StoredData", "Person", "C4Person", "Diamond", "Oval", "Circle", "Hexagon", "Cloud", "Table", "Class", "Text", "Code", "Image"}
	for _, shape := range names {
		for trial := 0; trial < 8; trial++ {
			for _, limit := range []uint64{20, 60, 120, 5000} {
				g := layoutgraph.NewGraph()
				a := g.AddNode(layoutgraph.NewNode(1, 100, 120))
				a.TopLeft = geo.NewPoint(0, 0)
				a.SetShape(shape)
				b := g.AddNode(layoutgraph.NewNode(2, 100, 120))
				b.TopLeft = geo.NewPoint(float64(trial%2)*100, 0)
				b.SetShape(shape)
				b.IsInvisible = trial%3 == 0
				for i := 0; i < 1+trial%3; i++ {
					g.Connect(a, b)
				}
				ovg := NewOVG(g.Nodes)
				limits := defaultOVGBuildLimits()
				limits.work = limit
				guard, _ := newOVGBuildGuard(context.Background(), limits)
				err := ovg.addPorts(g, guard)
				if err == nil {
					err = ovg.addTunnels(g, guard)
				}
				if err == nil {
					err = ovg.connectPortsToCenter(guard)
				}
				msg := ""
				if err != nil {
					msg = err.Error()
				}
				ids := map[*OVGNode]int{}
				nodes := []any{}
				for i, n := range ovg.Nodes {
					ids[n] = i
					nodes = append(nodes, map[string]any{"point": n.Point, "center": n.IsNodeCenter, "tunnel": n.IsTunnel, "a": n.isPortOf(a), "b": n.isPortOf(b), "aDirs": n.portDirectionsForObstacle(a), "bDirs": n.portDirectionsForObstacle(b), "aCenter": n.isCenterPortOf(a), "bCenter": n.isCenterPortOf(b)})
				}
				ports := [][]int{}
				for _, owner := range []*layoutgraph.Node{a, b} {
					p := []int{}
					for _, node := range ovg.Ports[owner] {
						p = append(p, ids[node])
					}
					ports = append(ports, p)
				}
				edges := [][]int{}
				for _, edge := range ovg.Edges {
					edges = append(edges, []int{ids[edge.From], ids[edge.To]})
				}
				out = append(out, map[string]any{"shape": shape, "trial": trial, "limit": limit, "error": msg, "work": guard.work, "count": guard.nodes, "nodes": nodes, "ports": ports, "edges": edges})
			}
		}
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
