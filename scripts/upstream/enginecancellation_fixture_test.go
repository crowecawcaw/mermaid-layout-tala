// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package engine

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/graphjson"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
)

type corpusCancelContext struct {
	context.Context
	remaining int
	checks    int
	done      chan struct{}
}

func (c *corpusCancelContext) Done() <-chan struct{} { return c.done }
func (c *corpusCancelContext) Err() error {
	c.checks++
	if c.remaining == 0 {
		return context.Canceled
	}
	c.remaining--
	return nil
}

func TestExportTypeScriptEnginecancellationFixtures(t *testing.T) {
	path := os.Getenv("TALA_ENGINECANCELLATION_FIXTURES")
	if path == "" {
		t.Skip()
	}
	results := []any{}
	cases := []struct{ size, limit int }{}
	for _, limit := range []int{0, 1, 2, 3, 5, 10, 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240} {
		cases = append(cases, struct{ size, limit int }{6, limit})
	}
	for _, limit := range []int{0, 1, 2, 3} {
		cases = append(cases, struct{ size, limit int }{0, limit})
	}
	for _, tc := range cases {
		limit := tc.limit
		graph := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < tc.size; i++ {
			n := layoutgraph.NewNode(int64(i+1), 40, 30)
			graph.AddNewNodeToContainer(nil, n)
			nodes = append(nodes, n)
		}
		for i := 1; i < len(nodes); i++ {
			graph.Connect(nodes[i-1], nodes[i])
		}
		before, err := graphjson.Marshal(context.Background(), graph)
		if err != nil {
			t.Fatal(err)
		}
		ctx := &corpusCancelContext{Context: context.Background(), remaining: limit, done: make(chan struct{})}
		result, layoutErr := Layout(ctx, graph, LayoutOptions{Seed: 1})
		after, err := graphjson.Marshal(context.Background(), graph)
		if err != nil {
			t.Fatal(err)
		}
		if string(before) != string(after) {
			t.Fatalf("input changed at limit %d", limit)
		}
		message := ""
		if layoutErr != nil {
			message = layoutErr.Error()
		}
		results = append(results, map[string]any{"size": tc.size, "limit": limit, "checks": ctx.checks, "error": message, "hasResult": result != nil})
	}
	data, err := json.MarshalIndent(results, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
