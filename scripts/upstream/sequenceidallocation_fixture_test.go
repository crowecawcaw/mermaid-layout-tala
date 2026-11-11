// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package grouping

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
)

func TestExportTypeScriptSequenceidallocationFixtures(t *testing.T) {
	path := os.Getenv("TALA_SEQUENCEIDALLOCATION_FIXTURES")
	if path == "" {
		t.Skip()
	}
	type testCase struct {
		name                                         string
		candidate                                    int64
		active, cluster, sequence, tree, unavailable []int64
	}
	cases := []testCase{
		{name: "empty", candidate: 42},
		{name: "active-wrap", candidate: math.MaxInt64, active: []int64{math.MaxInt64, 0}, unavailable: []int64{1}},
		{name: "cluster-wrap", candidate: math.MaxInt64, cluster: []int64{math.MaxInt64, 0}, unavailable: []int64{1}},
		{name: "sequence-tree", candidate: 123, sequence: []int64{123, 124}, tree: []int64{125, 126}, unavailable: []int64{127}},
		{name: "negative-run", candidate: math.MinInt64, active: []int64{math.MinInt64, math.MinInt64 + 1}, unavailable: []int64{math.MinInt64 + 2}},
		{name: "all-owners", candidate: 40, active: []int64{40}, cluster: []int64{41, 42}, sequence: []int64{43, 44}, tree: []int64{45, 46}, unavailable: []int64{47}},
		{name: "deep-tree", candidate: 200, tree: []int64{200, 201, 202, 203, 204}, unavailable: []int64{205}},
	}
	stringify := func(values []int64) []string {
		result := make([]string, 0, len(values))
		for _, value := range values {
			result = append(result, fmt.Sprint(value))
		}
		return result
	}
	fixtures := []any{}
	for _, tc := range cases {
		graph := layoutgraph.NewGraph()
		for _, id := range tc.active {
			graph.AddNode(layoutgraph.NewNode(id, 10, 10))
		}
		if len(tc.cluster) > 0 {
			v := layoutgraph.NewNode(tc.cluster[0], 10, 10)
			group := &layoutgraph.Cluster{}
			for _, id := range tc.cluster[1:] {
				group.Nodes = append(group.Nodes, layoutgraph.NewNode(id, 10, 10))
			}
			graph.Clusters[v] = group
		}
		if len(tc.sequence) > 0 {
			v := layoutgraph.NewNode(tc.sequence[0], 10, 10)
			group := &layoutgraph.Sequence{}
			for _, id := range tc.sequence[1:] {
				group.Nodes = append(group.Nodes, layoutgraph.NewNode(id, 10, 10))
			}
			graph.Sequences[v] = group
		}
		if len(tc.tree) > 0 {
			sentinel := layoutgraph.NewNode(tc.tree[0], 10, 10)
			roots := layoutgraph.Trees{}
			var previous *layoutgraph.Tree
			for _, id := range tc.tree[1:] {
				current := layoutgraph.NewTree(layoutgraph.NewNode(id, 10, 10))
				if previous == nil {
					roots = append(roots, current)
				} else {
					previous.Children = append(previous.Children, current)
					current.Parent = previous
				}
				previous = current
			}
			graph.Trees[sentinel] = roots
		}
		unavailable := map[layoutgraph.EntityID]struct{}{}
		for _, id := range tc.unavailable {
			unavailable[id] = struct{}{}
		}
		result := nextAvailableNodeID(graph, tc.candidate, unavailable)
		fixtures = append(fixtures, map[string]any{"name": tc.name, "candidate": fmt.Sprint(tc.candidate), "active": stringify(tc.active), "cluster": stringify(tc.cluster), "sequence": stringify(tc.sequence), "tree": stringify(tc.tree), "unavailable": stringify(tc.unavailable), "expected": fmt.Sprint(result)})
	}
	data, err := json.MarshalIndent(fixtures, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
