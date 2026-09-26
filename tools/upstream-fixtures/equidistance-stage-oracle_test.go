package placement

import (
	"context"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/lib/geo"
	"testing"
)

func TestTSEquidistanceTrace(t *testing.T) {
	g := layoutgraph.NewGraph()
	g.Directions[nil] = geo.Right
	left := layoutgraph.NewNode(1, 330, 155)
	left.SetContainer(true)
	a := layoutgraph.NewNode(2, 70, 35)
	b := layoutgraph.NewNode(3, 70, 35)
	right := layoutgraph.NewNode(4, 410, 155)
	right.SetContainer(true)
	c := layoutgraph.NewNode(5, 70, 35)
	d := layoutgraph.NewNode(6, 70, 35)
	nodes := []*layoutgraph.Node{left, a, b, right, c, d}
	for _, n := range nodes {
		g.AddNodeUnchecked(n)
	}
	g.AddNodeToContainer(nil, left)
	g.AddNodeToContainer(left, a)
	g.AddNodeToContainer(left, b)
	g.AddNodeToContainer(nil, right)
	g.AddNodeToContainer(right, c)
	g.AddNodeToContainer(right, d)
	for i, p := range [][2]float64{{180, 0}, {240, 60}, {380, 60}, {660, 0}, {720, 60}, {940, 60}} {
		nodes[i].TopLeft = geo.NewPoint(p[0], p[1])
	}
	for i, p := range [][2]*layoutgraph.Node{{a, b}, {b, c}, {c, d}} {
		e := g.Connect(p[0], p[1])
		e.ID = layoutgraph.EntityID(i + 1)
		e.TargetArrowhead = layoutgraph.TriangleArrowhead
	}
	g.ComputeCellSize()
	guard, err := limits.NewWorkGuard(context.Background(), "EquidistanceReachability", limits.MaxEngineWorkUnits)
	if err != nil {
		t.Fatal(err)
	}
	for pass := 0; pass < 6; pass++ {
		for _, n := range nodes {
			changed, err := equidistanceNodeGuarded(context.Background(), n, g, true, guard)
			if err != nil {
				t.Fatal(err)
			}
			if changed {
				fmt.Printf("PASS %d node %d", pass, n.ID)
				for _, m := range nodes {
					fmt.Printf(" %d=(%.0f,%.0f %.0fx%.0f)", m.ID, m.TopLeft.X, m.TopLeft.Y, m.Width, m.Height)
				}
				fmt.Println()
			}
		}
	}
}
