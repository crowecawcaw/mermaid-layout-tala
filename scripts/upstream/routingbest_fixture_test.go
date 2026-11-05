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

func TestExportTypeScriptRoutingbestFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGBEST_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 200; trial++ {
		for _, limit := range []uint64{1, 5, 20, 1000} {
			a := layoutgraph.NewNode(1, 20, 20)
			a.TopLeft = geo.NewPoint(0, 0)
			b := layoutgraph.NewNode(2, 20, 20)
			b.TopLeft = geo.NewPoint(100, 100)
			nodes := []*OVGNode{}
			for i := 0; i < 9; i++ {
				n := NewOVGNode(geo.NewPoint(float64(i%3)*50, float64(i/3)*50))
				n.Index = i
				nodes = append(nodes, n)
			}
			contexts := make([]*searchNodeContext, 9)
			vertical := make([]*OVGNode, 9)
			horizontal := make([]*OVGNode, 9)
			for i := 0; i < 9; i++ {
				contexts[i] = &searchNodeContext{verticalDistance: float64((trial*7 + i*13) % 80), horizontalDistance: float64((trial*11 + i*17) % 80)}
				if i > 0 && ((i+trial)%3 != 0) {
					vertical[i] = nodes[(i-1+trial%2)%9]
				}
				if i > 0 && ((i+trial)%4 != 0) {
					horizontal[i] = nodes[(i+7+trial%3)%9]
				}
			}
			guard, _ := newRouteSearchWorkGuard(context.Background(), Default, limit)
			router := &ovgEdgeRouter{work: guard, turnCost: float64(trial % 20)}
			path, err := router.bestRoute(context.Background(), a, b, nodes[0], nodes[8], contexts, vertical, horizontal)
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			var ids []int
			if path != nil {
				ids = []int{}
				for _, n := range path {
					ids = append(ids, n.Index)
				}
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "error": msg, "used": guard.used, "ids": ids})
		}
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
