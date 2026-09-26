package engine

import (
	"context"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"testing"
)

func TestTSCompoundTrace(t *testing.T) {
	g := layoutgraph.NewGraph()
	g.Directions[nil] = geo.Bottom
	group := layoutgraph.NewNode(1, 160, 110)
	group.SetContainer(true)
	a := layoutgraph.NewNode(2, 80, 40)
	b := layoutgraph.NewNode(3, 80, 40)
	x := layoutgraph.NewNode(4, 80, 40)
	for _, n := range []*layoutgraph.Node{group, a, b, x} {
		g.AddNodeUnchecked(n)
	}
	g.AddNodeToContainer(nil, group)
	g.AddNodeToContainer(group, a)
	g.AddNodeToContainer(group, b)
	g.AddNodeToContainer(nil, x)
	ab := g.Connect(a, b)
	ab.ID = 1
	ab.TargetArrowhead = layoutgraph.TriangleArrowhead
	bx := g.Connect(b, x)
	bx.ID = 2
	bx.TargetArrowhead = layoutgraph.TriangleArrowhead
	p := newPipeline(g, 1, false)
	p.stages = make([]pipelineStage, len(defaultPipelineStages))
	for i, stage := range defaultPipelineStages {
		original := stage.run
		index := i
		p.stages[i] = pipelineStage{name: stage.name, run: func(p *pipeline, ctx context.Context) error {
			if err := original(p, ctx); err != nil {
				return err
			}
			fmt.Printf("STAGE %02d %s", index, stage.name)
			for _, n := range []*layoutgraph.Node{group, a, b, x} {
				if n.TopLeft == nil {
					fmt.Printf(" %d=nil %.0fx%.0f", n.ID, n.Width, n.Height)
				} else {
					fmt.Printf(" %d=(%.0f,%.0f %.0fx%.0f)", n.ID, n.TopLeft.X, n.TopLeft.Y, n.Width, n.Height)
				}
			}
			fmt.Println()
			return nil
		}}
	}
	if err := p.runAllStages(context.Background()); err != nil {
		t.Fatal(err)
	}
}
