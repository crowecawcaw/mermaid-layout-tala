// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"encoding/json"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptRoutingsentinelFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSENTINEL_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 80; trial++ {
		o := geo.Orientation(4 + trial%4)
		points := []*geo.Point{geo.NewPoint(0, 0), geo.NewPoint(0, 15), geo.NewPoint(0, 30), geo.NewPoint(20, 30), geo.NewPoint(40, 30), geo.NewPoint(40, 45), geo.NewPoint(40, 60)}
		for _, p := range points {
			switch o {
			case geo.Bottom:
				p.Y = -p.Y
			case geo.Left:
				p.X, p.Y = p.Y, p.X
			case geo.Right:
				p.X, p.Y = -p.Y, p.X
			}
		}
		nodes := []*OVGNode{}
		for i, p := range points {
			n := NewOVGNode(p)
			n.Index = i
			nodes = append(nodes, n)
		}
		for i := 0; i < len(nodes)-1; i++ {
			if trial%5 != 0 || i != trial/5%6 {
				e := NewOVGEdge(nodes[i], nodes[i+1])
				nodes[i].addEdge(e)
				nodes[i+1].addEdge(e)
			}
		}
		treePath := TreeEdgePath{SourcePortNode: nodes[0], TargetPortNode: nodes[6], SourceMidpoint: nodes[2].Point, TargetMidpoint: nodes[4].Point, SourceOrientationToTarget: o}
		route, err := routeInSShape(treePath)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		var ids []int
		if route != nil {
			ids = []int{}
			for _, n := range route {
				ids = append(ids, n.Index)
			}
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "ids": ids})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
