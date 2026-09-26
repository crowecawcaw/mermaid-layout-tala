package engine

import (
	"context"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/placementcost"
	"github.com/d2lang/d2/lib/geo"
	"testing"
)

func TestTSAlignmentCostOracle(t *testing.T) {
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
		index := i
		original := stage.run
		p.stages[i] = pipelineStage{name: stage.name, run: func(p *pipeline, ctx context.Context) error {
			if err := original(p, ctx); err != nil {
				return err
			}
			if index == 7 || index == 10 {
				length, err := placementcost.EdgeLength(ctx, g, placementcost.EdgeLengthOptions{IncludeNodeSizes: true, PenalizeDirection: true})
				if err != nil {
					return err
				}
				align, err := placementcost.ContainerAlignmentCost(ctx, g)
				if err != nil {
					return err
				}
				fmt.Printf("COST stage%d %.12f %.12f total %.12f\n", index, length, align, length+align)
				fmt.Printf("META cell %.12f turn %.12f crossing %.12f\n", g.CellSize, g.TurnCost(), g.CrossingCost())
				for _, n := range []*layoutgraph.Node{group, a, b, x} {
					nl, err := placementcost.NodeEdgeLength(ctx, n, placementcost.EdgeLengthOptions{IncludeNodeSizes: true, PenalizeDirection: true})
					if err != nil {
						return err
					}
					fmt.Printf("NODE %d %.12f\n", n.ID, nl)
				}
			}
			return nil
		}}
	}
	if err := p.runAllStages(context.Background()); err != nil {
		t.Fatal(err)
	}
}
