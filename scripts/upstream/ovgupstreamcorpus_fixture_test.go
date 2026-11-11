// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/graphjson"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
)

type corpusPoint struct{ X, Y float64 }
type corpusSegment struct {
	A, B     corpusPoint
	Distance float64
}
type corpusPortOwner struct {
	ID         string `json:"id"`
	Directions uint16 `json:"directions"`
	Center     bool   `json:"center"`
}
type corpusOVGNode struct {
	corpusPoint
	Center    bool              `json:"center"`
	Tunnel    bool              `json:"tunnel"`
	Container string            `json:"container"`
	Nears     []string          `json:"nears"`
	Owners    []corpusPortOwner `json:"owners"`
}

func corpusPointLess(a, b corpusPoint) bool { return a.X < b.X || (a.X == b.X && a.Y < b.Y) }

func TestExportTypeScriptOvgupstreamcorpusFixtures(t *testing.T) {
	path := os.Getenv("TALA_OVGUPSTREAMCORPUS_FIXTURES")
	if path == "" {
		t.Skip("set TALA_OVGUPSTREAMCORPUS_FIXTURES")
	}
	fixtures := []any{}
	for _, name := range []string{"basic_tree", "dense", "larger_tree", "all_shapes", "sql_tables", "cluster_edge_balance", "hierarchy_4_levels_1_source", "clusters", "hierarchy_subgraphs", "large_hierarchy"} {
		data, err := os.ReadFile(filepath.Join("..", "testdata", "ovg", name, "graph.input.json"))
		if err != nil {
			t.Fatal(err)
		}
		graph := layoutgraph.NewGraph()
		if err := graphjson.Unmarshal(context.Background(), data, graph); err != nil {
			t.Fatal(err)
		}
		for i, node := range graph.Nodes {
			if node.TopLeft == nil {
				node.TopLeft = geo.NewPoint(float64((i%5)*700), float64((i/5)*700))
			}
		}
		graph.ComputeCellSize()
		guard, err := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
		if err != nil {
			t.Fatal(err)
		}
		ovg, err := buildOVGFromGraphWithGuard(graph, nil, guard)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		nodes := []corpusOVGNode{}
		edges := []corpusSegment{}
		for _, node := range ovg.Nodes {
			container := "0"
			if node.Container != nil {
				container = fmt.Sprint(node.Container.IDValue())
			}
			nears := []string{}
			for near := range node.IsNearPort {
				nears = append(nears, fmt.Sprint(near.IDValue()))
			}
			sort.Strings(nears)
			owners := []corpusPortOwner{}
			for owner, meta := range node.portOwnersByNode {
				owners = append(owners, corpusPortOwner{fmt.Sprint(owner.IDValue()), uint16(meta.directions), meta.isCenterPort})
			}
			sort.Slice(owners, func(i, j int) bool { return owners[i].ID < owners[j].ID })
			nodes = append(nodes, corpusOVGNode{corpusPoint{node.Point.X, node.Point.Y}, node.IsNodeCenter, node.IsTunnel, container, nears, owners})
		}
		sort.Slice(nodes, func(i, j int) bool { return corpusPointLess(nodes[i].corpusPoint, nodes[j].corpusPoint) })
		for _, edge := range ovg.Edges {
			a, b := corpusPoint{edge.From.Point.X, edge.From.Point.Y}, corpusPoint{edge.To.Point.X, edge.To.Point.Y}
			if corpusPointLess(b, a) {
				a, b = b, a
			}
			edges = append(edges, corpusSegment{a, b, edge.Distance})
		}
		sort.Slice(edges, func(i, j int) bool {
			if edges[i].A != edges[j].A {
				return corpusPointLess(edges[i].A, edges[j].A)
			}
			return corpusPointLess(edges[i].B, edges[j].B)
		})
		fixtures = append(fixtures, map[string]any{"name": name, "input": json.RawMessage(data), "nodes": nodes, "edges": edges})
	}
	data, err := json.Marshal(fixtures)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
