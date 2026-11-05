// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placement

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"os"
	"testing"
)

func TestExportTypeScriptChildorderFixtures(t *testing.T) {
	path := os.Getenv("TALA_CHILDORDER_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 200; trial++ {
		count := 1 + trial%10
		nodes := []*layoutgraph.Node{}
		for i := 0; i < count; i++ {
			nodes = append(nodes, layoutgraph.NewNode(layoutgraph.EntityID(i+1), 20, 20))
		}
		pairs := [][2]int{}
		abs := []*layoutgraph.EdgeAbduction{}
		for j := 0; j < trial%17; j++ {
			a := (trial + j*3) % count
			b := (trial/3 + j*7) % count
			pairs = append(pairs, [2]int{a, b})
			abs = append(abs, &layoutgraph.EdgeAbduction{CurrentFrom: nodes[a], CurrentTo: nodes[b]})
		}
		order, err := PlaceChildrenOrder(context.Background(), nodes, abs)
		if err != nil {
			t.Fatal(err)
		}
		ids := []int{}
		for _, n := range order {
			ids = append(ids, int(n.ID))
		}
		out = append(out, map[string]any{"trial": trial, "count": count, "pairs": pairs, "order": ids})
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, b, 0644); err != nil {
		t.Fatal(err)
	}
}
