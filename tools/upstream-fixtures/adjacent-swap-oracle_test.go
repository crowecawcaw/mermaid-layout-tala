package routing

import (
  "context"
  "testing"

  "github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
  "github.com/d2lang/d2/lib/geo"
)

func TestTSAdjacentSwapOracle(t *testing.T) {
  g := layoutgraph.NewGraph()
  n := g.AddNode(layoutgraph.NewNode(1, 100, 100))
  n.TopLeft = geo.NewPoint(0, 0)
  aTarget := g.AddNode(layoutgraph.NewNode(2, 100, 100))
  aTarget.TopLeft = geo.NewPoint(200, -150)
  bTarget := g.AddNode(layoutgraph.NewNode(3, 60, 70))
  bTarget.TopLeft = geo.NewPoint(170, -250)
  for _, item := range []*layoutgraph.Node{n, aTarget, bTarget} { g.AddNodeToContainer(nil, item) }
  a := g.Connect(n, aTarget)
  a.Points = []*geo.Point{geo.NewPoint(50, 0), geo.NewPoint(50, -50), geo.NewPoint(200, -50), geo.NewPoint(200, -100)}
  b := g.Connect(n, bTarget)
  b.Points = []*geo.Point{geo.NewPoint(100, 50), geo.NewPoint(150, 50), geo.NewPoint(150, -100), geo.NewPoint(200, -100), geo.NewPoint(200, -180)}
  if err := SwapAllEdgePorts(context.Background(), g); err != nil { t.Fatal(err) }
  for i, item := range []struct { edge *layoutgraph.Edge; want [][2]float64 }{
    {a, [][2]float64{{100, 50}, {200, 50}, {200, -100}}},
    {b, [][2]float64{{50, 0}, {50, -100}, {200, -100}, {200, -180}}},
  } {
    if len(item.edge.Points) != len(item.want) { t.Fatalf("edge %d has %d points", i, len(item.edge.Points)) }
    for j, point := range item.edge.Points {
      if point.X != item.want[j][0] || point.Y != item.want[j][1] {
        t.Fatalf("edge %d point %d = (%v,%v), want %v", i, j, point.X, point.Y, item.want[j])
      }
    }
  }
}
