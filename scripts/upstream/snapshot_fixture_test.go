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

func TestExportTypeScriptSnapshotFixtures(t *testing.T) {
	path := os.Getenv("TALA_SNAPSHOT_FIXTURES")
	if path == "" {
		t.Skip("set TALA_SNAPSHOT_FIXTURES")
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
		guard, err := limits.NewWorkGuard(context.Background(), "snapshot fixture", limits.MaxEngineWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		topology := trial%2 == 0
		state := NewGraphStateSnapshot(GraphStateSnapshotOptions{CaptureTopology: topology, CaptureEdgeRoutes: trial%3 != 0})
		if err := state.UpdateWithWorkGuard(g, guard); err != nil {
			t.Fatal(err)
		}
		work := fmt.Sprint(guard.Used())
		objects, err := collectRuntimeObjectsContext(g, guard, "fixture")
		if err != nil {
			t.Fatal(err)
		}
		runtimeWork := fmt.Sprint(guard.Used())
		originalNodes := g.Nodes
		originalEdges := g.Edges
		originalContainers := g.Containers
		pointRefs := map[*Node]*geo.Point{}
		labelRefs := map[*Node]*Label{}
		for n := range objects.nodes {
			pointRefs[n] = n.TopLeft
			labelRefs[n] = n.Label
			if n.TopLeft != nil {
				n.TopLeft.X += 17
				n.TopLeft.Y -= 9
			}
			n.TopLeft = geo.NewPoint(999, 888)
			n.Width += 51
			n.Height += 31
			if n.Label != nil {
				n.Label.Text = "mutated"
				n.Label.Width += 10
			}
			n.Label = &Label{Text: "replacement"}
			n.Edges = nil
			n.Nears = map[*Node]struct{}{}
			n.LoopOffsets = map[geo.Orientation]float64{geo.Bottom: 99}
		}
		routeRefs := map[*Edge][]*geo.Point{}
		pointCopies := map[*Edge][]*geo.Point{}
		for e := range objects.edges {
			routeRefs[e] = e.Points
			pointCopies[e] = append([]*geo.Point{}, e.Points...)
			for _, p := range e.Points {
				p.X += 55
			}
			e.Points = []*geo.Point{geo.NewPoint(101, 202)}
			e.MinWidth += 3
			if e.Label != nil {
				e.Label.Text = "changed edge"
			}
		}
		cluster.Arrangement = Column
		cluster.DesiredArrangement = Row
		cluster.Padding = 88
		tree.Orientation = geo.Top
		g.Nodes = []*Node{NewNode(9999, 1, 1)}
		if topology {
			g.Edges = nil
			g.Containers = map[*Node][]*Node{}
			g.Clusters = map[*Node]*Cluster{}
			g.Sequences = map[*Node]*Sequence{}
			g.Trees = map[*Node][]*Tree{}
		}
		(&Transaction{Graph: g, PriorGraphState: state}).Rollback()
		nodeOut := map[string]any{}
		edgeOut := map[string]any{}
		for n := range objects.nodes {
			var lab any
			if n.Label != nil {
				lab = []any{n.Label.Text, n.Label.Width, n.Label.PositionFixed()}
			}
			// Compare map contents; JavaScript Maps do not encode Go nil headers.
			loops := map[geo.Orientation]float64{}
			for side, offset := range n.LoopOffsets {
				loops[side] = offset
			}
			nodeOut[fmt.Sprint(n.ID)] = map[string]any{"position": n.TopLeft, "width": n.Width, "height": n.Height, "label": lab, "samePoint": n.TopLeft == pointRefs[n], "sameLabel": n.Label == labelRefs[n], "incidence": len(n.Edges), "nears": len(n.Nears), "loops": loops}
		}
		for e := range objects.edges {
			sameRoute := len(e.Points) == len(routeRefs[e])
			if sameRoute && len(e.Points) > 0 {
				sameRoute = &e.Points[0] == &routeRefs[e][0]
			}
			samePoints := len(e.Points) == len(pointCopies[e])
			if samePoints {
				for i, p := range e.Points {
					if p != pointCopies[e][i] {
						samePoints = false
					}
				}
			}
			var lab any
			if e.Label != nil {
				lab = e.Label.Text
			}
			edgeOut[fmt.Sprint(e.ID)] = map[string]any{"points": e.Points, "width": e.MinWidth, "label": lab, "sameRoute": sameRoute, "samePoints": samePoints}
		}
		nodeIDs := []EntityID{}
		for _, n := range g.Nodes {
			nodeIDs = append(nodeIDs, n.ID)
		}
		sameNodes := len(g.Nodes) == len(originalNodes) && &g.Nodes[0] == &originalNodes[0]
		sameEdges := len(g.Edges) == len(originalEdges) && &g.Edges[0] == &originalEdges[0]
		out = append(out, map[string]any{"trial": trial, "expected": map[string]any{"nodes": nodeOut, "edges": edgeOut, "order": nodeIDs, "sameNodes": sameNodes, "sameEdges": sameEdges, "containers": len(g.Containers) == len(originalContainers), "policy": []any{cluster.Arrangement, cluster.DesiredArrangement, cluster.Padding}, "orientation": tree.Orientation, "work": work, "runtimeWork": runtimeWork}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
