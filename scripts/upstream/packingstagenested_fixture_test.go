// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package packing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptPackingstagenestedFixtures(t *testing.T) {
	path := os.Getenv("TALA_PACKINGSTAGENESTED_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 80; trial++ {
		g := layoutgraph.NewGraph()
		root := layoutgraph.NewNode(1, 800, 600)
		root.SetContainer(true)
		root.TopLeft = geo.NewPoint(0, 0)
		g.AddNewNodeToContainer(nil, root)
		nodes := []*layoutgraph.Node{root}
		for i := 0; i < 4; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(i+2), 40, 30)
			n.TopLeft = geo.NewPoint(float64(100+i*140+trial%7*4), float64(100+(i*83+trial*9)%300))
			g.AddNewNodeToContainer(root, n)
			nodes = append(nodes, n)
		}
		ext := layoutgraph.NewNode(6, 40, 30)
		ext.TopLeft = geo.NewPoint(1000, 200)
		g.AddNewNodeToContainer(nil, ext)
		nodes = append(nodes, ext)
		if trial%2 == 0 {
			g.Connect(nodes[1], nodes[2])
		}
		if trial%3 == 0 {
			g.Connect(nodes[3], ext)
		}
		if trial%5 == 0 {
			nodes[2].FixedTopLeft = nodes[2].TopLeft.Copy()
		}
		guard, _ := newWorkGuard(context.Background(), 10000000)
		err := packAtomic(context.Background(), g, nil, guard)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		geometry := [][]float64{}
		for _, n := range nodes {
			geometry = append(geometry, []float64{n.TopLeft.X, n.TopLeft.Y, n.Width, n.Height})
		}
		out = append(out, map[string]any{"trial": trial, "geometry": geometry, "error": msg, "work": guard.Used()})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
