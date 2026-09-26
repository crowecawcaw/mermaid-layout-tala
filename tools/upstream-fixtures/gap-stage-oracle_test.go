package placement

import (
	"context"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/lib/geo"
	"testing"
)

func TestTSGapTrace(t *testing.T) {
	g := layoutgraph.NewGraph()
	g.Directions[nil] = geo.Right
	left := layoutgraph.NewNode(1, 330, 155)
	left.SetContainer(true)
	a := layoutgraph.NewNode(2, 70, 35)
	b := layoutgraph.NewNode(3, 70, 35)
	right := layoutgraph.NewNode(4, 330, 155)
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
	for i, p := range [][2]float64{{0, 0}, {60, 60}, {200, 60}, {660, 0}, {720, 60}, {860, 60}} {
		nodes[i].TopLeft = geo.NewPoint(p[0], p[1])
	}
	for i, p := range [][2]*layoutgraph.Node{{a, b}, {b, c}, {c, d}} {
		e := g.Connect(p[0], p[1])
		e.ID = layoutgraph.EntityID(i + 1)
		e.TargetArrowhead = layoutgraph.TriangleArrowhead
	}
	g.ComputeCellSize()
	fmt.Println("CELL", g.CellSize)
	ctx := context.Background()
	guard, err := limits.NewWorkGuard(ctx, "GapNormalizationTransactions", limits.MaxEngineWorkUnits)
	if err != nil {
		t.Fatal(err)
	}
	txn, err := g.NewRequestTransaction(ctx, layoutgraph.TransactionOptions{AffectContainers: true})
	if err != nil {
		t.Fatal(err)
	}
	containers, err := g.ContainerRDFSOrder(nil, guard)
	if err != nil {
		t.Fatal(err)
	}
	fmt.Print("CONTAINERS")
	for _, n := range containers {
		fmt.Printf(" %d", n.ID)
	}
	fmt.Println()
	scopes := make([]layoutgraph.Nodes, 0, len(containers)+1)
	for _, container := range containers {
		scopes = append(scopes, layoutgraph.Nodes(g.AllDescendantNodes(container, false)))
	}
	scopes = append(scopes, layoutgraph.Nodes(g.Nodes))
	for scopeIndex, scope := range scopes {
		for _, axis := range []layoutAxis{horizontalAxis, verticalAxis} {
			for _, direction := range []traversalDirection{forwardDirection, backwardDirection} {
				changed, err := gapNormalization(ctx, scope, txn, g, gapNormalizationOptions{axis: axis, direction: direction, costTxn: txn})
				if err != nil {
					t.Fatal(err)
				}
				if changed {
					fmt.Printf("SCOPE %d AXIS %v DIR %v", scopeIndex, axis, direction)
					for _, n := range nodes {
						fmt.Printf(" %d=(%.0f,%.0f %.0fx%.0f)", n.ID, n.TopLeft.X, n.TopLeft.Y, n.Width, n.Height)
					}
					fmt.Println()
				}
			}
		}
	}
	for _, n := range nodes {
		fmt.Printf("%d=(%.0f,%.0f %.0fx%.0f) ", n.ID, n.TopLeft.X, n.TopLeft.Y, n.Width, n.Height)
	}
	fmt.Println()
}
