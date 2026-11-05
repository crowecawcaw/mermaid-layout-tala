// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placement

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptPlacementalignFixtures(t *testing.T) {
	path := os.Getenv("TALA_PLACEMENTALIGN_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 100; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = 50
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 4; i++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(30+i*5), float64(25+i*4)))
			n.TopLeft = geo.NewPoint(float64(i%2*170+trial%5*7), float64(i/2*170+(trial*i)%7*8))
			nodes = append(nodes, n)
		}
		g.Containers[nil] = nodes
		g.Connect(nodes[0], nodes[1])
		g.Connect(nodes[1], nodes[2])
		g.Connect(nodes[2], nodes[3])
		if trial%7 == 0 {
			nodes[0].FixedTopLeft = nodes[0].TopLeft.Copy()
		}
		ctx, _, err := layoutgraph.EnsureTransactionWorkGuard(context.Background(), "AlignAxesTransactions")
		if err != nil {
			t.Fatal(err)
		}
		txn, err := g.NewRequestTransaction(ctx, layoutgraph.TransactionOptions{AffectContainers: true})
		if err != nil {
			t.Fatal(err)
		}
		changed, err := alignAxes(ctx, g, txn)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		after := []*geo.Point{}
		for _, n := range nodes {
			after = append(after, n.TopLeft.Copy())
		}
		if err == nil {
			err = Align(context.Background(), g)
			if err != nil {
				msg = err.Error()
			}
		}
		final := []*geo.Point{}
		for _, n := range nodes {
			final = append(final, n.TopLeft.Copy())
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "changed": changed, "after": after, "final": final})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
