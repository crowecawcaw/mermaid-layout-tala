package engine

import (
	"context"
	"fmt"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
)

func TestTSNestedContainerTrace(t *testing.T) {
	g := layoutgraph.NewGraph()
	g.Directions[nil] = geo.Bottom
	cloud := layoutgraph.NewNode(1, 260, 210)
	cloud.SetContainer(true)
	api := layoutgraph.NewNode(2, 180, 130)
	api.SetContainer(true)
	gateway := layoutgraph.NewNode(3, 70, 35)
	service := layoutgraph.NewNode(4, 70, 35)
	database := layoutgraph.NewNode(5, 80, 50)
	client := layoutgraph.NewNode(6, 70, 35)
	all := []*layoutgraph.Node{cloud, api, gateway, service, database, client}
	for _, n := range all {
		g.AddNodeUnchecked(n)
	}
	g.AddNodeToContainer(nil, cloud)
	g.AddNodeToContainer(cloud, api)
	g.AddNodeToContainer(api, gateway)
	g.AddNodeToContainer(api, service)
	g.AddNodeToContainer(cloud, database)
	g.AddNodeToContainer(nil, client)
	for i, pair := range [][2]*layoutgraph.Node{{client, gateway}, {gateway, service}, {service, database}} {
		edge := g.Connect(pair[0], pair[1])
		edge.ID = layoutgraph.EntityID(i + 1)
		edge.TargetArrowhead = layoutgraph.TriangleArrowhead
	}
	p := newPipeline(g, 2, false)
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
				for _, n := range all {
					if n.TopLeft != nil {
						fmt.Printf(" %d=(%.6f,%.6f %.6fx%.6f)", n.ID, n.TopLeft.X, n.TopLeft.Y, n.Width, n.Height)
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
