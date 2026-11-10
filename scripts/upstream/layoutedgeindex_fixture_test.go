// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"strconv"
	"testing"

	"github.com/d2lang/d2/d2graph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
)

func TestExportTypeScriptLayoutedgeindexFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTEDGEINDEX_FIXTURES")
	if path == "" {
		t.Skip()
	}
	g := d2graph.NewGraph()
	objects := []*d2graph.Object{}
	for _, id := range []string{"a", "b"} {
		obj := &d2graph.Object{Graph: g, Parent: g.Root, ID: id, IDVal: id, Box: geo.NewBox(geo.NewPoint(0, 0), 40, 30), Children: map[string]*d2graph.Object{}, Attributes: d2graph.Attributes{}}
		g.Root.Children[id] = obj
		g.Root.ChildrenArray = append(g.Root.ChildrenArray, obj)
		g.Objects = append(g.Objects, obj)
		objects = append(objects, obj)
	}
	indexes := []int{0, -1, 1, math.MinInt64, math.MaxInt64}
	for _, index := range indexes {
		g.Edges = append(g.Edges, &d2graph.Edge{Index: index, Src: objects[0], Dst: objects[1], DstArrow: true})
	}
	internal := layoutgraph.NewGraph()
	bindings, err := translateGraph(context.Background(), g, internal, false)
	if err != nil {
		t.Fatal(err)
	}
	out := []any{}
	for _, edge := range g.Edges {
		out = append(out, map[string]any{"index": strconv.FormatInt(int64(edge.Index), 10), "identity": edge.AbsID(), "entityId": strconv.FormatUint(uint64(bindings.edgeIDs[edge]), 10)})
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
