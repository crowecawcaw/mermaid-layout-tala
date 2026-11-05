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

func TestExportTypeScriptRoutingsharingFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSHARING_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	arrows := []layoutgraph.Arrowhead{"", "none", "triangle", "diamond"}
	for trial := 0; trial < 600; trial++ {
		g := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 6; i++ {
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), 20, 20))
			n.TopLeft = geo.NewPoint(float64(i*30), float64(i%2*30))
			nodes = append(nodes, n)
		}
		all := []*layoutgraph.Edge{}
		for i := 0; i < 5; i++ {
			e := g.Connect(nodes[(trial+i*3)%6], nodes[(trial/3+i*5+1)%6])
			e.SourceArrowhead = arrows[(trial+i)%4]
			e.TargetArrowhead = arrows[(trial/4+i*3)%4]
			if (trial+i)%19 == 0 {
				e.SourceArrowheadLabel = &layoutgraph.Label{}
			}
			e.Points = []*geo.Point{geo.NewPoint(float64((trial+i)%7)*10, float64(i%3)*10), geo.NewPoint(float64((trial+i)%7)*10, float64(i%3*10+30))}
			all = append(all, e)
		}
		others := all[1 : 1+trial%5]
		source := map[*layoutgraph.Node]bool{}
		target := map[*layoutgraph.Node]bool{}
		for i, n := range nodes {
			if (i+trial)%3 == 0 {
				source[n] = true
			}
			if (i+trial)%4 == 0 {
				target[n] = true
			}
		}
		guard, _ := newRouteSearchWorkGuard(context.Background(), Default, 1000)
		allowed, err := edgeCanOverlapEdgesGuarded(all[0], others, source, target, guard)
		if err != nil {
			t.Fatal(err)
		}
		overlap, err := overlappingEdgesGuarded(geo.NewPoint(10, 0), geo.NewPoint(10, 30), others, guard)
		if err != nil {
			t.Fatal(err)
		}
		ids := []int{}
		for _, e := range overlap {
			for i, x := range all {
				if e == x {
					ids = append(ids, i)
				}
			}
		}
		cross, err := routeIntersectsNodeGuarded(nodes, all[0], guard)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, map[string]any{"trial": trial, "allowed": allowed, "overlap": ids, "cross": cross, "work": guard.used})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
