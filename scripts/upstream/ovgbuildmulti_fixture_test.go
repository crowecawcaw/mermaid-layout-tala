// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"sort"
	"testing"
)

func TestExportTypeScriptOvgbuildmultiFixtures(t *testing.T) {
	path := os.Getenv("TALA_OVGBUILDMULTI_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	shapes := []string{"Square", "Diamond", "Oval", "Cylinder"}
	for trial := 0; trial < 80; trial++ {
		g := layoutgraph.NewGraph()
		a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
		a.SetShape(shapes[trial%4])
		a.TopLeft = geo.NewPoint(0, 0)
		b := g.AddNode(layoutgraph.NewNode(2, 70, 50))
		b.SetShape(shapes[trial/4%4])
		b.TopLeft = geo.NewPoint(float64(150+trial%3*30), float64(trial%5*50-100))
		g.Connect(a, b)
		guard, _ := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
		ovg, err := buildOVGFromGraphWithGuard(g, nil, guard)
		if err != nil {
			t.Fatal(err)
		}
		key := func(p *geo.Point) string { return fmt.Sprintf("%g,%g", p.X, p.Y) }
		nodes := []string{}
		edges := []string{}
		for _, n := range ovg.Nodes {
			nodes = append(nodes, key(n.Point))
		}
		sort.Strings(nodes)
		for _, e := range ovg.Edges {
			x, y := key(e.From.Point), key(e.To.Point)
			if x > y {
				x, y = y, x
			}
			edges = append(edges, x+"|"+y)
		}
		sort.Strings(edges)
		out = append(out, map[string]any{"trial": trial, "shapeA": shapes[trial%4], "shapeB": shapes[trial/4%4], "nodes": nodes, "edges": edges})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
