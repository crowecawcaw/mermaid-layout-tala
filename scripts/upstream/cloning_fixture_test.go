// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package layoutgraph

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/lib/geo"
	"github.com/d2lang/d2/lib/label"
	"os"
	"testing"
)

func TestExportTypeScriptCloningFixtures(t *testing.T) {
	path := os.Getenv("TALA_CLONING_FIXTURES")
	if path == "" {
		t.Skip("set TALA_CLONING_FIXTURES")
	}
	out := []any{}
	for trial := 0; trial < 80; trial++ {
		g := NewGraph()
		all := []*Node{}
		count := 8 + trial%17
		for j := 0; j < count; j++ {
			n := NewNode(EntityID(j+1), float64(60+j), float64(40+j))
			n.TopLeft = geo.NewPoint(float64(j*100), float64(trial))
			n.Graph = g
			n.SetShape([]string{"Square", "Diamond", "Table", "Cloud"}[j%4])
			n.SetNumColumns(j % 5)
			text := fmt.Sprintf("node-%d", j)
			n.D2ID = &text
			size := 12 + j
			n.FontSize = &size
			n.Label = &Label{Text: text, Position: label.Position(j % 37), Width: float64(j + 20), Height: 12}
			n.Label.FixPosition()
			n.Icon = &Icon{Position: label.InsideMiddleCenter}
			n.Icon.FixPosition()
			n.LoopOffsets = map[geo.Orientation]float64{geo.Top: 5}
			n.Is3D = j%2 == 0
			n.IsMultiple = j%3 == 0
			n.ForceHierarchy = j%4 == 0
			all = append(all, n)
		}
		active := trial%2 == 0
		cv := NewNode(1000, 80, 60)
		sv := NewNode(1001, 90, 70)
		if active {
			cv.Graph = g
			sv.Graph = g
		}
		cv.isClusterVessel = true
		cluster := &Cluster{Vessel: cv, Nodes: all[4:6], Graph: g, Padding: 7, FixedSize: trial%3 == 0, Arrangement: Row, DesiredArrangement: Column}
		sequence := &Sequence{Vessel: sv, Nodes: all[2:4], Graph: g}
		for _, n := range cluster.Nodes {
			n.Cluster = cluster
		}
		for _, n := range sequence.Nodes {
			n.Sequence = sequence
		}
		g.Clusters[cv] = cluster
		g.Sequences[sv] = sequence
		for j, n := range all {
			if active && j >= 2 && j < 6 {
				continue
			}
			g.Nodes = append(g.Nodes, n)
		}
		if active {
			g.Nodes = append(g.Nodes, cv, sv)
		}
		g.Containers[nil] = append([]*Node{}, g.Nodes...)
		for _, n := range g.Nodes {
			n.Container = nil
		}
		for j := 1; j < count; j++ {
			e := g.Connect(all[j-1], all[j])
			e.ID = EntityID(j)
			e.Points = []*geo.Point{geo.NewPoint(float64(j), float64(trial)), geo.NewPoint(float64(j+10), float64(trial+20))}
			e.Label = &Label{Text: "edge", Position: label.UnlockedMiddle, Width: 20, Height: 10}
			e.Label.FixPosition()
			e.LabelPercentage = .3
			e.TargetArrowhead = TriangleArrowhead
			e.IsCurve = true
			e.MinWidth = 30
			e.MinHeight = 10
		}
		cluster.EdgeAbductions = []*EdgeAbduction{{Edge: g.Edges[0], OriginallyFrom: all[0], OriginallyTo: all[1], CurrentFrom: cv, CurrentTo: all[1]}}
		sequence.EdgeAbductions = []*EdgeAbduction{{Edge: g.Edges[1], OriginallyFrom: all[1], OriginallyTo: all[2], CurrentFrom: all[1], CurrentTo: sv}}
		all[0].AddNear(all[count-1])
		g.Hubs[all[0]] = []*Node{all[1], all[count-1]}
		h := &Hierarchy{level: map[*Node]int{all[0]: 0, all[1]: 1}, LevelCount: 2}
		all[0].Hierarchy = h
		all[1].Hierarchy = h
		tn := NewNode(2000, 30, 20)
		tn.TopLeft = geo.NewPoint(1, 2)
		tn.Graph = g
		te := NewEdge(all[0], tn)
		te.ID = 3000
		tree := &Tree{Node: tn, SentinelEdge: te, Orientation: geo.Left}
		child := NewNode(2001, 35, 25)
		child.Graph = g
		child.TopLeft = geo.NewPoint(3, 4)
		ce := NewEdge(tn, child)
		ce.ID = 3001
		tree.Children = []*Tree{{Node: child, SentinelEdge: ce, Parent: tree, Orientation: geo.Right}}
		tn.AddNear(all[0])
		g.Trees[all[0]] = []*Tree{tree}
		g.Directions[nil] = geo.Orientation(trial % 9)
		g.Directions[all[0]] = geo.Bottom
		g.CellSize = float64(20 + trial)
		g.IsRootHierarchy = trial%3 == 0
		g.crossingCost = 3
		g.turnCost = 4
		g.nonCenterPortCost = 5
		guard, err := limits.NewWorkGuard(context.Background(), "clone fixture", limits.MaxEngineWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		state := graphCloneState{source: g, clone: NewGraph(), guard: guard, nodesByID: map[EntityID]*Node{}, nodeRecordsByID: map[EntityID]*Node{}, topLevelNodeIDs: map[EntityID]struct{}{}, nodesBySource: map[*Node]*Node{}, edgesBySource: map[*Edge]*Edge{}, edgesByID: map[EntityID]*Edge{}, clustersBySource: map[*Cluster]*Cluster{}, sequencesBySource: map[*Sequence]*Sequence{}}
		if err := state.copy(); err != nil {
			t.Fatal(err)
		}
		cloned := state.clone
		id := func(n *Node) EntityID {
			if n == nil {
				return 0
			}
			return n.ID
		}
		ids := func(nodes []*Node) []EntityID {
			v := []EntityID{}
			for _, n := range nodes {
				v = append(v, id(n))
			}
			return v
		}
		nodes := map[string]any{}
		edges := map[string]any{}
		containers := map[string]any{}
		directions := map[string]any{}
		for nid, n := range state.nodesByID {
			incident := []EntityID{}
			for _, e := range n.Edges {
				incident = append(incident, e.ID)
			}
			var lp, ip any
			if n.Label != nil {
				lp = []any{n.Label.Text, n.Label.Position, n.Label.Width, n.Label.Height, n.Label.PositionFixed()}
			}
			if n.Icon != nil {
				ip = []any{n.Icon.Position, n.Icon.PositionFixed()}
			}
			levels := map[string]int{}
			if n.Hierarchy != nil {
				for m, l := range n.Hierarchy.level {
					levels[fmt.Sprint(m.ID)] = l
				}
			}
			var cid, sid EntityID
			if n.Cluster != nil {
				cid = id(n.Cluster.Vessel)
			}
			if n.Sequence != nil {
				sid = id(n.Sequence.Vessel)
			}
			nodes[fmt.Sprint(nid)] = map[string]any{"position": n.TopLeft, "width": n.Width, "height": n.Height, "owner": n.Graph == cloned, "shape": n.ShapeType(), "columns": n.NumColumns(), "container": id(n.Container), "cluster": cid, "sequence": sid, "incidence": incident, "nears": ids(n.orderedNears()), "label": lp, "icon": ip, "levels": levels, "loopOffsets": len(n.LoopOffsets), "is3D": n.Is3D, "isMultiple": n.IsMultiple, "forceHierarchy": n.ForceHierarchy, "vessel": n.isClusterVessel, "d2id": n.D2ID, "fontSize": n.FontSize}
		}
		for eid, e := range state.edgesByID {
			edges[fmt.Sprint(eid)] = map[string]any{"from": id(e.From), "to": id(e.To), "points": e.Points, "curve": e.IsCurve, "percentage": e.LabelPercentage, "minWidth": e.MinWidth, "minHeight": e.MinHeight, "target": e.TargetArrowhead}
		}
		for c, ns := range cloned.Containers {
			containers[fmt.Sprint(id(c))] = ids(ns)
		}
		for c, d := range cloned.Directions {
			directions[fmt.Sprint(id(c))] = d
		}
		treeOwners := map[string]any{}
		for n, tr := range cloned.NodeToTree {
			parent := EntityID(0)
			if tr.Parent != nil {
				parent = tr.Parent.Node.ID
			}
			treeOwners[fmt.Sprint(n.ID)] = []any{parent, tr.SentinelEdge.ID, tr.Orientation}
		}
		abductions := []any{}
		for _, a := range append(cloned.Clusters[state.nodesByID[1000]].EdgeAbductions, cloned.Sequences[state.nodesByID[1001]].EdgeAbductions...) {
			abductions = append(abductions, []any{a.Edge.ID, id(a.OriginallyFrom), id(a.OriginallyTo), id(a.CurrentFrom), id(a.CurrentTo)})
		}
		out = append(out, map[string]any{"trial": trial, "expected": map[string]any{"nodes": nodes, "edges": edges, "order": ids(cloned.Nodes), "containers": containers, "directions": directions, "trees": treeOwners, "abductions": abductions, "work": fmt.Sprint(guard.Used()), "cell": cloned.CellSize, "root": cloned.IsRootHierarchy, "costs": []float64{cloned.crossingCost, cloned.turnCost, cloned.nonCenterPortCost}}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
