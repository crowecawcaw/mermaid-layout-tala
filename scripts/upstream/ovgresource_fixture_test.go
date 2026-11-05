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

func TestExportTypeScriptOvgresourceFixtures(t *testing.T) {
	path := os.Getenv("TALA_OVGRESOURCE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 180; trial++ {
		limits := ovgBuildLimits{intersectionCandidates: uint64(trial % 15), nodes: uint64(trial % 11), edges: uint64(trial % 9), work: uint64(trial % 45)}
		guard, err := newOVGBuildGuard(context.Background(), limits)
		if err != nil {
			t.Fatal(err)
		}
		ovg := NewOVG(nil)
		owner := layoutgraph.NewNode(1, 20, 20)
		nodes := []*OVGNode{}
		events := []string{}
		capture := func(err error) {
			if err != nil {
				events = append(events, err.Error())
			} else {
				events = append(events, "")
			}
		}
		for i := 0; i < 10; i++ {
			node := NewOVGNode(geo.NewPoint(float64((i*3+trial)%7), float64((i*5+trial)%6)))
			node.Index = i
			node.IsNodeCenter = i%5 == 0
			if i%3 == 0 {
				node.addPortOwner(owner, geo.Top, false)
			}
			actual, e := guard.addNode(ovg, node)
			capture(e)
			if e == nil {
				nodes = append(nodes, actual)
			}
		}
		for i := 1; i < len(nodes); i++ {
			_, e := guard.connect(ovg, nodes[i-1], nodes[i])
			capture(e)
		}
		capture(guard.reserveCandidates(uint64(trial % 8)))
		capture(guard.reserveSortWork(trial % 8))
		ids := []int{}
		for _, node := range ovg.Nodes {
			ids = append(ids, node.Index)
		}
		edges := []any{}
		for _, e := range ovg.Edges {
			edges = append(edges, map[string]any{"from": e.From.Index, "to": e.To.Index, "distance": e.Distance})
		}
		out = append(out, map[string]any{"trial": trial, "events": events, "ids": ids, "edges": edges, "work": guard.work, "nodes": guard.nodes, "edgeCount": guard.edges, "candidates": guard.candidates})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
