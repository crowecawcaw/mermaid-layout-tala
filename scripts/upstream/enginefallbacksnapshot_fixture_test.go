// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package engine

import (
	"context"
	"encoding/json"
	"os"
	"sync/atomic"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
)

type snapshotCountingContext struct {
	context.Context
	checks atomic.Int64
	done   chan struct{}
}

func (c *snapshotCountingContext) Done() <-chan struct{} { return c.done }
func (c *snapshotCountingContext) Err() error            { c.checks.Add(1); return nil }

func TestExportTypeScriptEnginefallbacksnapshotFixtures(t *testing.T) {
	path := os.Getenv("TALA_ENGINEFALLBACKSNAPSHOT_FIXTURES")
	if path == "" {
		t.Skip()
	}
	graph := layoutgraph.NewGraph()
	nodes := []*layoutgraph.Node{}
	for i := 0; i < 6; i++ {
		n := layoutgraph.NewNode(int64(i+1), 40, 30)
		graph.AddNewNodeToContainer(nil, n)
		nodes = append(nodes, n)
	}
	for i := 1; i < len(nodes); i++ {
		graph.Connect(nodes[i-1], nodes[i])
	}
	counter := &snapshotCountingContext{Context: context.Background(), done: make(chan struct{})}
	p := newPipeline(graph, 1, false)
	p.stages = append([]pipelineStage(nil), defaultPipelineStages[:]...)
	result := map[string]any{}
	snapshot := func() map[string]any {
		ns := []any{}
		es := []any{}
		for _, n := range graph.Nodes {
			ns = append(ns, map[string]any{"id": n.IDValue(), "topLeft": n.TopLeft, "width": n.Width, "height": n.Height})
		}
		for _, e := range graph.Edges {
			es = append(es, map[string]any{"id": e.ID, "from": e.From.IDValue(), "to": e.To.IDValue(), "points": e.Points})
		}
		return map[string]any{"nodes": ns, "edges": es}
	}
	for i, stage := range p.stages {
		if stage.name == "StraightEdgesFallback" {
			original := stage.run
			p.stages[i].run = func(p *pipeline, ctx context.Context) error {
				before, err := json.Marshal(snapshot())
				if err != nil {
					return err
				}
				result["before"] = json.RawMessage(before)
				result["beforeChecks"] = counter.checks.Load()
				err = original(p, ctx)
				after, marshalErr := json.Marshal(snapshot())
				if marshalErr != nil {
					return marshalErr
				}
				result["after"] = json.RawMessage(after)
				result["afterChecks"] = counter.checks.Load()
				return err
			}
		}
	}
	counts := []any{}
	for i, stage := range p.stages {
		original, name := stage.run, stage.name
		p.stages[i].run = func(p *pipeline, ctx context.Context) error {
			before := counter.checks.Load()
			err := original(p, ctx)
			counts = append(counts, map[string]any{"name": name, "before": before, "after": counter.checks.Load()})
			return err
		}
	}
	if err := p.runAllStages(counter); err != nil {
		t.Fatal(err)
	}
	result["counts"] = counts
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
