// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placementcost

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptPlacementgeometryFixtures(t *testing.T) {
	path := os.Getenv("TALA_PLACEMENTGEOMETRY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 400; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = float64(10 + trial%80)
		all := []*layoutgraph.Node{}
		nodes := []any{}
		for j := 0; j < 2+trial%8; j++ {
			w, h := float64(20+(trial*7+j*31)%100)+0.5, float64(15+(trial*11+j*13)%80)+0.25
			n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(j+1), w, h))
			x, y := float64((trial*13+j*71)%900)-450.5, float64((trial*7+j*43)%700)-350.25
			if trial%4 == 0 {
				y = 50 - h/2
			}
			if trial%4 == 1 {
				x = 50 - w/2
			}
			n.TopLeft = geo.NewPoint(x, y)
			all = append(all, n)
			nodes = append(nodes, map[string]any{"width": w, "height": h, "point": n.TopLeft.Copy()})
		}
		s := &edgeScratch{}
		edges := []any{}
		for j := 1; j < len(all); j++ {
			a, b := 0, j
			if j%2 == 0 {
				a, b = b, a
			}
			e := g.Connect(all[a], all[b])
			src, dst := "", "triangle"
			if trial%3 == 0 {
				src, dst = "triangle", ""
			}
			if trial%11 == 0 && j%2 == 0 {
				src, dst = "triangle", "triangle"
			}
			e.SourceArrowhead = layoutgraph.Arrowhead(src)
			e.TargetArrowhead = layoutgraph.Arrowhead(dst)
			e.IsInvisible = trial%9 == 0 && j%3 == 0
			s.nRepl = append(s.nRepl, all[0])
			s.aRepl = append(s.aRepl, all[j])
			edges = append(edges, map[string]any{"from": a, "to": b, "source": src, "target": dst, "invisible": e.IsInvisible})
		}
		if trial%13 == 0 {
			s.aRepl[0] = nil
		}
		if trial%17 == 0 {
			s.nRepl[0] = all[1]
		}
		distances := []float64{distanceToPoint(all[0], geo.NewPoint(17.5, -28.25), false), distanceToPoint(all[0], geo.NewPoint(17.5, -28.25), true), placementDistance(all[0], all[1], false), placementDistance(all[0], all[1], true)}
		flow := flowContinuityCost(all[0], s)
		cluster := &layoutgraph.Cluster{Nodes: []*layoutgraph.Node{all[0]}}
		for _, e := range all[0].Edges {
			ab := &layoutgraph.EdgeAbduction{Edge: e, CurrentFrom: e.From, CurrentTo: e.To}
			if e.From == all[0] {
				ab.OriginallyFrom = all[0]
			} else {
				ab.OriginallyTo = all[0]
			}
			cluster.EdgeAbductions = append(cluster.EdgeAbductions, ab)
		}
		first, second, two := clusterExactlyTwoExternalConnectedNodes(cluster)
		firstID, secondID := 0, 0
		if first != nil {
			firstID = int(first.ID)
		}
		if second != nil {
			secondID = int(second.ID)
		}
		c1, c2 := directionCompass(geo.Orientation(trial%9)), directionCompass(geo.Orientation(trial/9%9))

		out = append(out, map[string]any{"trial": trial, "cell": g.CellSize, "nodes": nodes, "edges": edges, "expected": map[string]any{"cluster": []any{firstID, secondID, two}, "compass": []any{c1, c2, compassDelta(c1, c2), compassAxisDelta(c1, c2)}, "axis": AxisScore(all), "flow": flow, "distance": distances, "orientation": sizelessOrientation(all[0], all[1]), "turn": g.TurnCost(), "crossing": g.CrossingCost(), "nonCenter": g.NonCenterPortCost()}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
