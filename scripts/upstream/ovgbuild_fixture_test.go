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

func TestExportTypeScriptOvgbuildFixtures(t *testing.T) {
	path := os.Getenv("TALA_OVGBUILD_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	shapes := []string{"Square", "Parallelogram", "Cylinder", "Step", "Diamond", "Oval", "Cloud", "Table"}
	for trial := 0; trial < 32; trial++ {
		for _, limit := range []uint64{100, 500, 1500, 50000} {
			g := layoutgraph.NewGraph()
			n := g.AddNode(layoutgraph.NewNode(1, 80+float64(trial%3)*10, 60+float64(trial%5)*10))
			n.SetShape(shapes[trial%len(shapes)])
			n.TopLeft = geo.NewPoint(float64(trial%7*10), float64(trial%9*10))
			n.IsInvisible = trial%7 == 0
			limits := defaultOVGBuildLimits()
			limits.work = limit
			guard, _ := newOVGBuildGuard(context.Background(), limits)
			ovg, err := buildOVGFromGraphWithGuard(g, nil, guard)
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			var nodes, edges []any
			if ovg != nil {
				nodes = []any{}
				edges = []any{}
				for _, v := range ovg.Nodes {
					_, near := v.IsNearPort[n]
					nodes = append(nodes, map[string]any{"point": v.Point, "port": v.isPortOf(n), "direction": v.portDirectionsForObstacle(n), "center": v.IsNodeCenter, "near": near})
				}
				for _, e := range ovg.Edges {
					edges = append(edges, []int{e.From.Index, e.To.Index})
				}
			}
			out = append(out, map[string]any{"trial": trial, "shape": shapes[trial%len(shapes)], "limit": limit, "error": msg, "work": guard.work, "count": guard.nodes, "edgeCount": guard.edges, "candidates": guard.candidates, "nodes": nodes, "edges": edges})
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
