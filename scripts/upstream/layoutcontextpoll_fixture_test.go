// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"context"
	"encoding/json"
	"os"
	"sync/atomic"
	"testing"

	"github.com/d2lang/d2/d2graph"
	"github.com/d2lang/d2/lib/geo"
)

type layoutPollContext struct {
	context.Context
	checks atomic.Int64
	limit  int64
}

func (c *layoutPollContext) Err() error {
	if c.checks.Add(1) > c.limit {
		return context.Canceled
	}
	return nil
}

func TestExportTypeScriptLayoutcontextpollFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTCONTEXTPOLL_FIXTURES")
	if path == "" {
		t.Skip()
	}
	fixtures := []any{}
	for _, operation := range []string{"layout", "route"} {
		for _, limit := range []int64{0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 16, 17, 18, 19, 20, 30, 50, 100, 1000} {
			graph := d2graph.NewGraph()
			graph.Root.Direction.Value = "down"
			nodes := []*d2graph.Object{}
			for _, id := range []string{"a", "b"} {
				n := &d2graph.Object{Graph: graph, Parent: graph.Root, ID: id, IDVal: id, Box: geo.NewBox(geo.NewPoint(0, 0), 40, 30), Children: map[string]*d2graph.Object{}}
				graph.Root.Children[id] = n
				graph.Root.ChildrenArray = append(graph.Root.ChildrenArray, n)
				graph.Objects = append(graph.Objects, n)
				nodes = append(nodes, n)
			}
			graph.Edges = append(graph.Edges, &d2graph.Edge{Index: 0, Src: nodes[0], Dst: nodes[1], DstArrow: true})
			if operation == "route" {
				nodes[1].TopLeft = geo.NewPoint(200, 0)
			}
			ctx := &layoutPollContext{Context: context.Background(), limit: limit}
			options := DefaultOptions()
			options.Seeds = []int64{1}
			options.MaxConcurrency = 1
			var err error
			if operation == "layout" {
				err = Layout(ctx, graph, &options)
			} else {
				err = RouteEdges(ctx, graph, graph.Edges)
			}
			message := ""
			if err != nil {
				message = err.Error()
			}
			fixtures = append(fixtures, map[string]any{"operation": operation, "limit": limit, "checks": ctx.checks.Load(), "error": message})
		}
	}
	data, err := json.MarshalIndent(fixtures, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
