// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package engine

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
)

func TestExportTypeScriptEnginepipelineFixtures(t *testing.T) {
	path := os.Getenv("TALA_ENGINEPIPELINE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 18; trial++ {
		g := layoutgraph.NewGraph()
		count := 1 + trial%4
		for i := 0; i < count; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(40+i*10), float64(30+i*5))
			g.AddNewNodeToContainer(nil, n)
		}
		for i := 0; i < count-1; i++ {
			g.Connect(g.Nodes[i], g.Nodes[i+1])
		}
		if trial%3 == 2 && count > 2 {
			g.Connect(g.Nodes[0], g.Nodes[count-1])
		}
		result, err := Layout(context.Background(), g, LayoutOptions{Seed: int64(trial % 3)})
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		nodes := []any{}
		routes := [][]*geo.Point{}
		if err == nil {
			for _, n := range result.Nodes {
				nodes = append(nodes, map[string]any{"id": n.IDValue(), "x": n.TopLeft.X, "y": n.TopLeft.Y, "width": n.Width, "height": n.Height})
			}
			for _, e := range result.Edges {
				routes = append(routes, e.Points)
			}
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "nodes": nodes, "routes": routes})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
