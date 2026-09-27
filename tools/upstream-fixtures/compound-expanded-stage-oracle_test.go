package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
)

type tsExpandedNode struct {
	ID        string  `json:"id"`
	ParentID  string  `json:"parentId"`
	Direction string  `json:"dir"`
	Width     float64 `json:"width"`
	Height    float64 `json:"height"`
	IsGroup   bool    `json:"isGroup"`
}
type tsExpandedEdge struct {
	ID, From, To string
	Directed     bool
}
type tsExpandedCase struct {
	Name, Direction string
	Seed            int64
	Nodes           []tsExpandedNode
	Edges           []tsExpandedEdge
}

func tsExpandedDirection(name string) geo.Orientation {
	switch name {
	case "TB":
		return geo.Bottom
	case "BT":
		return geo.Top
	case "LR":
		return geo.Right
	case "RL":
		return geo.Left
	}
	return geo.NONE
}

func TestTSExpandedCompoundTrace(t *testing.T) {
	path := os.Getenv("TALA_TS_COMPOUND_CASES")
	name := os.Getenv("TALA_TS_COMPOUND_NAME")
	if path == "" || name == "" {
		t.Skip("set TALA_TS_COMPOUND_CASES and TALA_TS_COMPOUND_NAME")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var cases []tsExpandedCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	var input *tsExpandedCase
	for i := range cases {
		if cases[i].Name == name {
			input = &cases[i]
			break
		}
	}
	if input == nil {
		t.Fatalf("case %q not found", name)
	}
	g := layoutgraph.NewGraph()
	g.Directions[nil] = tsExpandedDirection(input.Direction)
	byID := make(map[string]*layoutgraph.Node)
	for i, item := range input.Nodes {
		n := layoutgraph.NewNode(layoutgraph.EntityID(i+1), item.Width, item.Height)
		if item.IsGroup {
			n.SetContainer(true)
		}
		g.AddNodeUnchecked(n)
		byID[item.ID] = n
	}
	for _, item := range input.Nodes {
		var parent *layoutgraph.Node
		if item.ParentID != "" {
			parent = byID[item.ParentID]
		}
		g.AddNodeToContainer(parent, byID[item.ID])
		if item.Direction != "" {
			g.Directions[byID[item.ID]] = tsExpandedDirection(item.Direction)
		}
	}
	for _, item := range input.Nodes {
		if item.IsGroup {
			container := byID[item.ID]
			if _, exists := g.Containers[container]; !exists {
				g.Containers[container] = []*layoutgraph.Node{}
			}
		}
	}
	for i, item := range input.Edges {
		e := g.Connect(byID[item.From], byID[item.To])
		e.ID = layoutgraph.EntityID(i + 1)
		if item.Directed {
			e.TargetArrowhead = layoutgraph.TriangleArrowhead
		}
	}
	p := newPipeline(g, input.Seed, false)
	p.stages = make([]pipelineStage, len(defaultPipelineStages))
	for i, stage := range defaultPipelineStages {
		original := stage.run
		index := i
		p.stages[i] = pipelineStage{name: stage.name, run: func(p *pipeline, ctx context.Context) error {
			if err := original(p, ctx); err != nil {
				return err
			}
			if index <= 6 {
				fmt.Printf("PREPROCESS %02d %s", index, stage.name)
				for _, item := range input.Nodes {
					n := byID[item.ID]
					_, tree := g.NodeToTree[n]
					_, sequence := g.Sequences[n]
					fmt.Printf(" %s=[tree:%t hierarchy:%t cluster:%t sequence:%t herd:%t]",
						item.ID, tree, n.Hierarchy != nil, n.Cluster != nil,
						sequence, n.HerdAssignment != nil)
				}
				fmt.Println()
			}
			if index >= 7 {
				fmt.Printf("STAGE %02d %s", index, stage.name)
				for _, item := range input.Nodes {
					n := byID[item.ID]
					if n.TopLeft != nil {
						fmt.Printf(" %s=(%.0f,%.0f %.0fx%.0f)", item.ID,
							n.TopLeft.X, n.TopLeft.Y, n.Width, n.Height)
					}
					if index == 7 && len(n.Nears) > 0 {
						fmt.Printf(" %s.nears=", item.ID)
						for _, near := range n.OrderedNears() {
							for _, named := range input.Nodes {
								if byID[named.ID] == near { fmt.Printf("%s,", named.ID) }
							}
						}
					}
					if index == 7 && n.HerdAssignment != nil { fmt.Printf(" %s.herd=%v", item.ID, n.HerdAssignment) }
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
