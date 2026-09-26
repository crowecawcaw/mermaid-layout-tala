package layoutgraph

import (
	"fmt"
	"testing"
)

func TestTSContainerProjectionTrace(t *testing.T) {
	g := NewGraph()
	outer := NewNode(1, 200, 150)
	inner := NewNode(2, 120, 100)
	leaf := NewNode(3, 40, 30)
	peer := NewNode(4, 40, 30)
	outer.SetContainer(true)
	inner.SetContainer(true)
	for _, n := range []*Node{outer, inner, leaf, peer} {
		g.AddNodeUnchecked(n)
	}
	g.AddNodeToContainer(nil, outer)
	g.AddNodeToContainer(outer, inner)
	g.AddNodeToContainer(inner, leaf)
	g.AddNodeToContainer(outer, peer)
	inside := g.Connect(inner, leaf)
	inside.ID = 1
	cross := g.Connect(leaf, peer)
	cross.ID = 2
	scope := NewGraph()
	scope.CopyEntitiesFrom(g)
	for _, n := range g.Containers[outer] {
		scope.AddNodeUnchecked(n)
	}
	abductions := g.AbductEdges(outer, scope)
	for _, e := range scope.Edges {
		fmt.Printf("EDGE %d %d>%d\n", e.ID, e.From.ID, e.To.ID)
	}
	id := func(n *Node) int64 {
		if n == nil {
			return 0
		}
		return int64(n.ID)
	}
	for _, a := range abductions {
		fmt.Printf("ABDUCT %d original=%d>%d current=%d>%d\n", a.Edge.ID, id(a.OriginallyFrom), id(a.OriginallyTo), id(a.CurrentFrom), id(a.CurrentTo))
	}
}
