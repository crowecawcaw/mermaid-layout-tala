// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"sort"
	"testing"
)

func TestExportTypeScriptRouteportsFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTEPORTS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
		a.TopLeft = geo.NewPoint(0, 0)
		b := g.AddNode(layoutgraph.NewNode(2, 80, 60))
		b.TopLeft = geo.NewPoint(200, 0)
		ovg := NewOVG(g.Nodes)
		setup, _ := newOVGBuildGuard(context.Background(), defaultOVGBuildLimits())
		if err := ovg.addPorts(g, setup); err != nil {
			t.Fatal(err)
		}
		if err := ovg.connectPortsToCenter(setup); err != nil {
			t.Fatal(err)
		}
		work, _ := newRouteSearchWorkGuard(context.Background(), Default, 100000)
		router := &ovgEdgeRouter{ovg: ovg, work: work, edgeSet: newOvgEdgeSet(), pointToRoute: map[geo.Point][]*Route{}, hasNearbyEdge: map[*OVGEdge]struct{}{}, overlappingRoutes: map[*OVGEdge][]*Route{}}
		for i := 0; i < trial%5; i++ {
			edge := g.Connect(a, b)
			pa := ovg.Ports[a][(trial+i)%len(ovg.Ports[a])]
			pb := ovg.Ports[b][(trial*3+i)%len(ovg.Ports[b])]
			route := &Route{GEdge: edge, OVGNodes: []*OVGNode{ovg.Centers[a], pa, pb, ovg.Centers[b]}, FromPort: *pa.Point, ToPort: *pb.Point}
			if err := router.addRoute(route); err != nil {
				t.Fatal(err)
			}
		}
		guard, _ := newRouteSearchWorkGuard(context.Background(), Default, 100000)
		router.work = guard
		sa, sb, da, db, ca, cb, err := router.usedPorts(context.Background(), a, b, ovg.Centers[a], ovg.Centers[b], map[*layoutgraph.Node]bool{a: true}, map[*layoutgraph.Node]bool{b: true}, false)
		if err != nil {
			t.Fatal(err)
		}
		symmetric, err := router.centerSymmetricalPorts(context.Background(), a, b, sa, sb)
		if err != nil {
			t.Fatal(err)
		}
		keys := func(m map[geo.Point]bool) []string {
			out := []string{}
			for p := range m {
				out = append(out, fmt.Sprintf("%g,%g", p.X, p.Y))
			}
			sort.Strings(out)
			return out
		}
		sym := []int{}
		for i, p := range ovg.Nodes {
			if _, ok := symmetric[p]; ok {
				sym = append(sym, i)
			}
		}
		out = append(out, map[string]any{"trial": trial, "maps": [][]string{keys(sa), keys(sb), keys(da), keys(db), keys(ca), keys(cb)}, "sym": sym, "work": guard.used})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
