package engine

import (
	"context"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"testing"
)

func TestTSTwoContainerTrace(t *testing.T) {
	g := layoutgraph.NewGraph()
	g.Directions[nil] = geo.Right
	left := layoutgraph.NewNode(1, 180, 130)
	left.SetContainer(true)
	a := layoutgraph.NewNode(2, 70, 35)
	b := layoutgraph.NewNode(3, 70, 35)
	right := layoutgraph.NewNode(4, 180, 130)
	right.SetContainer(true)
	c := layoutgraph.NewNode(5, 70, 35)
	d := layoutgraph.NewNode(6, 70, 35)
	for _, n := range []*layoutgraph.Node{left, a, b, right, c, d} {
		g.AddNodeUnchecked(n)
	}
	g.AddNodeToContainer(nil, left)
	g.AddNodeToContainer(left, a)
	g.AddNodeToContainer(left, b)
	g.AddNodeToContainer(nil, right)
	g.AddNodeToContainer(right, c)
	g.AddNodeToContainer(right, d)
	ab := g.Connect(a, b)
	ab.ID = 1
	ab.TargetArrowhead = layoutgraph.TriangleArrowhead
	bc := g.Connect(b, c)
	bc.ID = 2
	bc.TargetArrowhead = layoutgraph.TriangleArrowhead
	cd := g.Connect(c, d)
	cd.ID = 3
	cd.TargetArrowhead = layoutgraph.TriangleArrowhead
	p := newPipeline(g, 1, false)
	p.stages = make([]pipelineStage, len(defaultPipelineStages))
	for i, stage := range defaultPipelineStages {
		original := stage.run
		index := i
		p.stages[i] = pipelineStage{name: stage.name, run: func(p *pipeline, ctx context.Context) error {
			if err := original(p, ctx); err != nil {
				return err
			}
			if index >= 7 {
				fmt.Printf("STAGE %02d %s", index, stage.name)
				for _, n := range []*layoutgraph.Node{left, a, b, right, c, d} {
					if n.TopLeft != nil {
						fmt.Printf(" %d=(%.0f,%.0f %.0fx%.0f)", n.ID, n.TopLeft.X, n.TopLeft.Y, n.Width, n.Height)
					}
				}
				fmt.Println()
			}
			return nil
		}}
	}
	if err := p.runAllStages(context.Background()); err != nil {
		t.Fatal(err)
	}
}
