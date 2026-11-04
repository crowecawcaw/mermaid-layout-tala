// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package layoutgraph

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

type tsGroupWork struct{ *limits.WorkGuard }

func (w tsGroupWork) MoveNodeWithChildren(n *Node, dx, dy float64) error {
	n.moveNodeWithChildren(dx, dy)
	return nil
}
func (w tsGroupWork) PositionContainerChildren(n *Node) error {
	n.positionContainerChildren(false)
	return nil
}
func TestExportTypeScriptGroupgeometryFixtures(t *testing.T) {
	path := os.Getenv("TALA_GROUPGEOMETRY_FIXTURES")
	if path == "" {
		t.Skip("set TALA_GROUPGEOMETRY_FIXTURES")
	}
	out := []any{}
	copyBox := func(n *Node) geo.Box {
		b := n.Box
		if b.TopLeft != nil {
			b.TopLeft = b.TopLeft.Copy()
		}
		return b
	}
	for trial := 0; trial < 240; trial++ {
		g := NewGraph()
		v := NewNode(1000, 80, 60)
		v.Graph = g
		v.isClusterVessel = true
		if trial%7 != 0 {
			v.TopLeft = geo.NewPoint(-15.25, 27.75)
		}
		g.Nodes = []*Node{v}
		g.Containers[nil] = []*Node{v}
		c := &Cluster{Vessel: v, Graph: g, Padding: float64(trial%17) / 2, FixedSize: trial%3 == 0, Arrangement: Row}
		if trial%2 == 0 {
			c.Arrangement = Column
		}
		g.Clusters[v] = c
		all := []*Node{v}
		for j := 0; j < 1+trial%18; j++ {
			n := NewNode(EntityID(j+1), float64(5+(trial+j*11)%140)/2, float64(5+(trial+j*17)%100)/2)
			n.Graph = g
			n.Cluster = c
			if (trial+j)%3 != 0 {
				n.TopLeft = geo.NewPoint(float64(j*31), float64(j*47))
			}
			c.Nodes = append(c.Nodes, n)
			all = append(all, n)
			if j%3 == 0 {
				n.isContainer = true
				child := NewNode(EntityID(2000+j), 7, 5)
				child.TopLeft = geo.NewPoint(float64(j+1), float64(j+2))
				child.Graph = g
				child.Container = n
				g.Containers[n] = []*Node{child}
				all = append(all, child)
			}
		}
		guard, err := limits.NewWorkGuard(context.Background(), "group fixture", limits.MaxEngineWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		work := tsGroupWork{guard}
		if err = c.SyncGeometryWithWork(work); err != nil {
			t.Fatal(err)
		}
		boxes := func() map[string]any {
			result := map[string]any{}
			for _, n := range all {
				result[fmt.Sprint(n.ID)] = copyBox(n)
			}
			return result
		}
		first := boxes()
		if err = c.SyncGeometryWithWork(work); err != nil {
			t.Fatal(err)
		}
		second := boxes()
		desc := []any{}
		for _, include := range []bool{false, true} {
			ns, err := g.allDescendantNodesGuarded(v, include, guard)
			if err != nil {
				t.Fatal(err)
			}
			ids := []EntityID{}
			for _, n := range ns {
				ids = append(ids, n.ID)
			}
			desc = append(desc, ids)
		}
		sv := NewNode(3000, 50, 50)
		sv.Graph = g
		if trial%7 != 0 {
			sv.TopLeft = geo.NewPoint(4.5, -2.5)
		}
		seq := &Sequence{Vessel: sv, Graph: g}
		for j := 0; j < 1+trial%18; j++ {
			n := NewNode(EntityID(4000+j), float64((trial+j*13)%100-10)/2, float64((trial+j*19)%60-10)/2)
			n.Graph = g
			seq.Nodes = append(seq.Nodes, n)
		}
		if err = seq.SyncGeometryWithWork(guard); err != nil {
			t.Fatal(err)
		}
		seqBoxes := []any{copyBox(sv)}
		for _, n := range seq.Nodes {
			seqBoxes = append(seqBoxes, copyBox(n))
		}
		seq.PlaceVessel()
		placed := sv.TopLeft
		out = append(out, map[string]any{"trial": trial, "expected": map[string]any{"first": first, "second": second, "descendants": desc, "sequence": seqBoxes, "placed": placed, "work": fmt.Sprint(guard.Used())}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
