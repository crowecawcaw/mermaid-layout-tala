// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package engine

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/graphjson"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"github.com/d2lang/d2/lib/shape"
)

func corpusID(id int64) string { return fmt.Sprint(id) }

func corpusIDs(ids []int64) []string {
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = corpusID(id)
	}
	return out
}

func corpusAbductions(values []graphjson.SerializedEdgeAbduction) []any {
	out := make([]any, 0, len(values))
	for _, value := range values {
		out = append(out, map[string]string{
			"edge": corpusID(value.Edge), "originallyFrom": corpusID(value.OriginallyFromNode), "originallyTo": corpusID(value.OriginallyToNode),
			"currentFrom": corpusID(value.CurrentFromNode), "currentTo": corpusID(value.CurrentToNode),
		})
	}
	return out
}

func corpusTree(tree graphjson.SerializedTree) map[string]any {
	children := make([]any, 0, len(tree.Children))
	for _, child := range tree.Children {
		children = append(children, corpusTree(child))
	}
	edgeID := tree.SentinelEdge.ID
	if tree.SentinelEdge.OriginalID != nil {
		edgeID = *tree.SentinelEdge.OriginalID
	}
	return map[string]any{"node": corpusID(tree.Node.ID), "edge": corpusID(edgeID), "orientation": tree.Orientation, "children": children}
}

func corpusVessels(values map[int64]graphjson.SerializedNode) map[string]any {
	out := map[string]any{}
	for id, node := range values {
		out[corpusID(id)] = map[string]any{"width": node.Width, "height": node.Height, "topLeft": node.TopLeft,
			"shapeType": node.ShapeType, "fontSize": node.FontSize, "isInvisible": node.IsInvisible,
			"is3D": node.Is3D, "isMultiple": node.IsMultiple, "forceHierarchy": node.ForceHierarchy}
	}
	return out
}

func corpusStructure(graph *graphjson.SerializedGraph) map[string]any {
	containers := map[string][]string{}
	for id, children := range graph.Containers {
		containers[corpusID(id)] = corpusIDs(children)
	}
	hubs := map[string][]string{}
	for id, spokes := range graph.Hubs {
		hubs[corpusID(id)] = corpusIDs(spokes)
	}
	clusters := map[string]any{}
	for id, cluster := range graph.Clusters {
		clusters[corpusID(id)] = map[string]any{"nodes": corpusIDs(cluster.Nodes), "arrangement": cluster.Arrangement,
			"desiredArrangement": cluster.DesiredArrangement, "container": corpusID(cluster.Container), "abductions": corpusAbductions(cluster.EdgeAbductions),
			"padding": cluster.Padding, "fixedSize": cluster.FixedSize}
	}
	sequences := map[string]any{}
	for id, sequence := range graph.Sequences {
		sequences[corpusID(id)] = map[string]any{"nodes": corpusIDs(sequence.Nodes), "container": corpusID(sequence.Container), "abductions": corpusAbductions(sequence.EdgeAbductions)}
	}
	trees := map[string][]any{}
	for id, roots := range graph.Trees {
		values := make([]any, 0, len(roots))
		for _, root := range roots {
			values = append(values, corpusTree(root))
		}
		trees[corpusID(id)] = values
	}
	return map[string]any{"cellSize": graph.CellSize, "containers": containers, "hubs": hubs, "clusters": clusters, "sequences": sequences,
		"clusterVessels": corpusVessels(graph.ClusterVessels), "sequenceVessels": corpusVessels(graph.SequenceVessels),
		"trees": trees, "hierarchies": graph.Hierarchies, "isRootHierarchy": graph.IsRootHierarchy, "directions": graph.Directions,
		"costs": []float64{graph.CrossingCost, graph.TurnCost, graph.NonCenterPortCost}}
}

func TestExportTypeScriptEngineupstreamcorpusFixtures(t *testing.T) {
	path := os.Getenv("TALA_ENGINEUPSTREAMCORPUS_FIXTURES")
	if path == "" {
		t.Skip("set TALA_ENGINEUPSTREAMCORPUS_FIXTURES")
	}
	cases := []struct{ name, path string }{}
	benchmarks, err := os.ReadDir(filepath.Join("..", "testdata", "benchmark"))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range benchmarks {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".json") {
			continue
		}
		cases = append(cases, struct{ name, path string }{strings.TrimSuffix(name, ".json"), filepath.Join("benchmark", name)})
	}
	entries, err := os.ReadDir(filepath.Join("..", "testdata", "layout"))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		input := filepath.Join("layout", entry.Name(), "graph.input.json")
		if _, err := os.Stat(filepath.Join("..", "testdata", input)); err != nil {
			if os.IsNotExist(err) {
				continue
			}
			t.Fatal(err)
		}
		cases = append(cases, struct{ name, path string }{entry.Name(), input})
	}
	fuzzInputs := map[string][]byte{}
	fuzzSeeds := map[string]int64{}
	regressions := []struct {
		name string
		seed int64
	}{
		{"container_escape_1", 4397197029139916149}, {"container_escape_2", 2314505960588799500},
		{"container_escape_3", 5902913841169428614}, {"container_escape_4", 3171783035589032342},
		{"container_escape_5", 7778691377623283929}, {"container_escape_6", 1636470363569335365},
		{"container_escape_7", 139599530801109251}, {"node_placement_shift_1", 1654996031387964605},
		{"node_placement_shift_2", 2432142976454602351}, {"clustering_near", 4970705388244523053},
		{"cloud_port_index", 1475938678302850746}, {"edge_balance_never_ending", 123},
		{"edge_balance_1", 9034163656351675339}, {"edge_balance_2", 4429140665999086830},
		{"edge_balance_3", 8661428079105679616}, {"cluster_overlap", 2029887799644317101},
		{"cluster_overlap_2", 4483618397761874234}, {"path_not_found", 562018869481995924},
	}
	for _, regression := range regressions {
		name := "regression-" + regression.name
		fuzzSeeds[name] = regression.seed
		cases = append(cases, struct{ name, path string }{name, filepath.Join("regression", regression.name+".json")})
	}
	fuzzCases := []struct {
		name                                                                   string
		seed                                                                   int64
		maxNodes, iterations, compaction, subset, minConnection, maxConnection uint8
	}{
		{"fuzz-default-1", 1, 10, 2, 50, 40, 10, 40},
		{"fuzz-default-2", 2, 15, 4, 60, 60, 25, 65},
		{"fuzz-default-3", 3, 20, 5, 40, 80, 45, 80},
		{"fuzz-17640421aa66af00", 65, 80, 49, 118, 240, 9, 106},
		{"fuzz-41c61ccd88c1b87f", 11, 23, 2, 81, 110, 13, 66},
		{"fuzz-5e5764be2ee6224a", 46, 11, 5, 4, 110, 39, 91},
		{"fuzz-extra-01", 101, 9, 3, 35, 55, 8, 35},
		{"fuzz-extra-02", 102, 12, 4, 65, 75, 18, 55},
		{"fuzz-extra-03", 103, 15, 5, 45, 45, 25, 60},
		{"fuzz-extra-04", 104, 11, 2, 75, 70, 30, 45},
		{"fuzz-extra-05", 105, 14, 3, 20, 80, 12, 75},
		{"fuzz-extra-06", 106, 13, 4, 55, 35, 22, 50},
		{"fuzz-extra-07", 107, 16, 5, 40, 60, 15, 65},
		{"fuzz-extra-08", 108, 10, 4, 80, 50, 35, 40},
		{"fuzz-extra-09", 109, 12, 3, 30, 85, 5, 70},
		{"fuzz-extra-10", 110, 15, 2, 60, 65, 28, 55},
		{"fuzz-extra-11", 111, 8, 5, 70, 75, 20, 60},
		{"fuzz-extra-12", 112, 14, 4, 50, 40, 32, 50},
	}
	for _, f := range fuzzCases {
		config := normalizeFuzzerConfig(f.seed, f.maxNodes, f.iterations, f.compaction, f.subset, f.minConnection, f.maxConnection)
		graph := createRandomGraph(withTestLogger(context.Background(), t), config)
		data, err := graphjson.Marshal(context.Background(), graph)
		if err != nil {
			t.Fatalf("%s: %v", f.name, err)
		}
		fuzzInputs[f.name], fuzzSeeds[f.name] = data, f.seed
		cases = append(cases, struct{ name, path string }{f.name, ""})
	}
	for variant := 0; variant < 9; variant++ {
		name := fmt.Sprintf("dense-cycle-%d", variant)
		if variant >= 4 {
			name = fmt.Sprintf("dense-shape-%d", variant-4)
		}
		if variant == 8 {
			name = "stress-mixed-cycle"
		}
		graph := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		count := 8
		if variant >= 4 {
			count = 10
		}
		if variant == 8 {
			count = 16
		}
		for i := 0; i < count; i++ {
			node := layoutgraph.NewNode(int64(i+1), float64(45+i*5), float64(30+(i%4)*7))
			if variant >= 4 {
				shapes := []string{shape.SQUARE_TYPE, shape.DIAMOND_TYPE, shape.CIRCLE_TYPE, shape.HEXAGON_TYPE, shape.CLOUD_TYPE}
				node.SetShape(shapes[(i+variant)%len(shapes)])
			}
			if (i+variant)%3 == 0 {
				node.Label = &layoutgraph.Label{Text: fmt.Sprintf("node-%d", i), Width: 24, Height: 12}
			}
			graph.AddNewNodeToContainer(nil, node)
			nodes = append(nodes, node)
		}
		for i := 0; i < count; i++ {
			for _, shift := range []int{1, 2 + variant%3} {
				edge := graph.Connect(nodes[i], nodes[(i+shift)%len(nodes)])
				edge.ID = int64(len(graph.Edges))
				if (i+shift+variant)%4 == 0 {
					edge.Label = &layoutgraph.Label{Text: fmt.Sprintf("edge-%d", i), Width: 20, Height: 10}
				}
			}
		}
		data, err := graphjson.Marshal(context.Background(), graph)
		if err != nil {
			t.Fatal(err)
		}
		fuzzInputs[name] = data
		cases = append(cases, struct{ name, path string }{name, ""})
	}
	for variant := 0; variant < 4; variant++ {
		name := fmt.Sprintf("dense-nested-%d", variant)
		graph := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 11; i++ {
			node := layoutgraph.NewNode(int64(i+1), float64(55+i*4), float64(35+(i%3)*8))
			if variant >= 2 && i < 3 {
				width, height := 700.0, 500.0
				if i == 1 {
					width, height = 300, 200
				}
				node.DesiredWidth = &width
				if variant == 2 || i == 1 {
					node.DesiredHeight = &height
				}
			}
			if i >= 3 && (i+variant)%3 == 0 {
				node.Label = &layoutgraph.Label{Text: fmt.Sprintf("nested-%d", i), Width: 30, Height: 12}
			}
			var parent *layoutgraph.Node
			switch i {
			case 1, 5, 6:
				parent = nodes[0]
			case 3, 4:
				parent = nodes[1]
			case 7, 8:
				parent = nodes[2]
			}
			graph.AddNewNodeToContainer(parent, node)
			nodes = append(nodes, node)
		}
		for i := 3; i < len(nodes); i++ {
			for _, shift := range []int{1, 3 + variant} {
				target := 3 + (i-3+shift)%(len(nodes)-3)
				edge := graph.Connect(nodes[i], nodes[target])
				edge.ID = int64(len(graph.Edges))
				if (i+shift)%5 == 0 {
					edge.Label = &layoutgraph.Label{Text: fmt.Sprintf("cross-%d", i), Width: 22, Height: 10}
				}
			}
		}
		data, err := graphjson.Marshal(context.Background(), graph)
		if err != nil {
			t.Fatal(err)
		}
		fuzzInputs[name] = data
		cases = append(cases, struct{ name, path string }{name, ""})
	}
	for variant := 0; variant < 2; variant++ {
		name := fmt.Sprintf("fixed-flags-%d", variant)
		graph := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 6; i++ {
			node := layoutgraph.NewNode(int64(i+1), float64(50+i*5), float64(35+i*3))
			if i == 0 || (variant == 1 && i == 3) {
				node.TopLeft = geo.NewPoint(float64(i*100), float64(i*40))
				node.FixedTopLeft = node.TopLeft.Copy()
			}
			node.Is3D = i == 1
			node.IsMultiple = i == 2
			node.IsInvisible = i == 4
			graph.AddNewNodeToContainer(nil, node)
			nodes = append(nodes, node)
		}
		for i := 0; i < len(nodes)-1; i++ {
			edge := graph.Connect(nodes[i], nodes[i+1])
			edge.ID = int64(len(graph.Edges))
		}
		if variant == 1 {
			edge := graph.Connect(nodes[5], nodes[1])
			edge.ID = int64(len(graph.Edges))
		}
		data, err := graphjson.Marshal(context.Background(), graph)
		if err != nil {
			t.Fatal(err)
		}
		fuzzInputs[name] = data
		cases = append(cases, struct{ name, path string }{name, ""})
	}
	for variant := 0; variant < 2; variant++ {
		name := fmt.Sprintf("arrow-labels-%d", variant)
		graph := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 7; i++ {
			node := layoutgraph.NewNode(int64(i+1), float64(60+i*5), float64(40+i*2))
			graph.AddNewNodeToContainer(nil, node)
			nodes = append(nodes, node)
		}
		for i := 0; i < 7; i++ {
			for _, shift := range []int{1, 2 + variant} {
				edge := graph.Connect(nodes[i], nodes[(i+shift)%len(nodes)])
				edge.ID = int64(len(graph.Edges))
				edge.TargetArrowhead = "triangle"
				if (i+shift)%2 == 0 {
					edge.SourceArrowheadLabel = &layoutgraph.Label{Text: fmt.Sprintf("source-%d", i), Width: 24, Height: 10}
				}
				if (i+shift+variant)%3 == 0 {
					edge.TargetArrowheadLabel = &layoutgraph.Label{Text: fmt.Sprintf("target-%d", i), Width: 28, Height: 12}
				}
			}
		}
		data, err := graphjson.Marshal(context.Background(), graph)
		if err != nil {
			t.Fatal(err)
		}
		fuzzInputs[name] = data
		cases = append(cases, struct{ name, path string }{name, ""})
	}
	for variant := 0; variant < 2; variant++ {
		name := fmt.Sprintf("styled-edges-%d", variant)
		graph := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 7; i++ {
			node := layoutgraph.NewNode(int64(i+1), float64(60+i*5), float64(40+i*2))
			graph.AddNewNodeToContainer(nil, node)
			nodes = append(nodes, node)
		}
		for i := 0; i < 7; i++ {
			for _, shift := range []int{1, 2 + variant} {
				edge := graph.Connect(nodes[i], nodes[(i+shift)%len(nodes)])
				edge.ID = int64(len(graph.Edges))
				edge.TargetArrowhead = "triangle"
				edge.Style.Stroke = &layoutgraph.StyleScalar{Value: []string{"red", "blue", "green"}[(i+shift)%3]}
				edge.Style.StrokeDash = &layoutgraph.StyleScalar{Value: fmt.Sprint((i + variant) % 4)}
				if i%3 == 0 {
					edge.Style.Animated = &layoutgraph.StyleScalar{Value: "true"}
				}
				if i == 5 && shift == 1 {
					edge.IsInvisible = true
				}
			}
		}
		data, err := graphjson.Marshal(context.Background(), graph)
		if err != nil {
			t.Fatal(err)
		}
		fuzzInputs[name] = data
		cases = append(cases, struct{ name, path string }{name, ""})
	}
	random := rand.New(rand.NewSource(8675309))
	for trial := 0; trial < 20; trial++ {
		name := fmt.Sprintf("random-connected-%02d", trial)
		graph := layoutgraph.NewGraph()
		count := 8 + random.Intn(7)
		nodes := make([]*layoutgraph.Node, 0, count)
		shapes := []string{shape.SQUARE_TYPE, shape.DIAMOND_TYPE, shape.CIRCLE_TYPE, shape.HEXAGON_TYPE, shape.CLOUD_TYPE}
		for i := 0; i < count; i++ {
			node := layoutgraph.NewNode(int64(i+1), float64(40+random.Intn(65)), float64(30+random.Intn(45)))
			node.SetShape(shapes[random.Intn(len(shapes))])
			if random.Intn(4) == 0 {
				node.Label = &layoutgraph.Label{Text: fmt.Sprintf("node-%d", i), Width: 25, Height: 10}
			}
			graph.AddNewNodeToContainer(nil, node)
			nodes = append(nodes, node)
		}
		for i := 0; i < count*2; i++ {
			from := i % count
			to := (from + 1 + random.Intn(count-1)) % count
			if i < count {
				to = (from + 1) % count
			}
			edge := graph.Connect(nodes[from], nodes[to])
			edge.ID = int64(len(graph.Edges))
			edge.TargetArrowhead = "triangle"
			if random.Intn(5) == 0 {
				edge.Label = &layoutgraph.Label{Text: fmt.Sprintf("edge-%d", i), Width: 20, Height: 10}
			}
			if random.Intn(5) == 0 {
				edge.Style.Stroke = &layoutgraph.StyleScalar{Value: []string{"red", "blue"}[random.Intn(2)]}
			}
		}
		data, err := graphjson.Marshal(context.Background(), graph)
		if err != nil {
			t.Fatal(err)
		}
		fuzzInputs[name], fuzzSeeds[name] = data, int64(2001+trial)
		cases = append(cases, struct{ name, path string }{name, ""})
	}
	fixtures := []any{}
	seedGoldens := map[string]string{
		"clusters":                   "4f742ab0d3199a66b716e873fdba4c8bb9313d62c0a7a0102d710b7e82faf60f",
		"hierarchy_subgraphs":        "c3566b4aac683d5571016b8db25bac771dd1e038199d55cd6a70bf8f6747efff",
		"simple_container_hierarchy": "d7e4ef56bef99c4ae854a5a44d45dcffd93513a09b1b88719a5c5cb261101485",
		"tree-n-seq":                 "68f40e15b4794a5b6704dccf6fd93a9de446780bb2195ada80192919b6ddf0a9",
	}
	for _, c := range cases {
		data := fuzzInputs[c.name]
		if c.path != "" {
			var err error
			data, err = os.ReadFile(filepath.Join("..", "testdata", c.path))
			if err != nil {
				t.Fatal(err)
			}
		}
		seeds := []int64{1, 123}
		if seed, ok := fuzzSeeds[c.name]; ok {
			seeds = []int64{seed}
		} else if _, ok := seedGoldens[c.name]; ok && strings.HasPrefix(c.path, "layout/") {
			seeds = append(seeds, 8675309, 0, -1, math.MinInt64, math.MaxInt64)
		}
		for _, seed := range seeds {
			graph := layoutgraph.NewGraph()
			if err := graphjson.Unmarshal(context.Background(), data, graph); err != nil {
				t.Fatal(err)
			}
			result, err := Layout(context.Background(), graph, LayoutOptions{Seed: seed})
			if err != nil {
				t.Fatalf("%s seed %d: %v", c.name, seed, err)
			}
			if seed == 123 && strings.HasPrefix(c.path, "layout/") {
				goldenPath := filepath.Join("..", "testdata", strings.TrimSuffix(c.path, "graph.input.json"), "graph.exp.json")
				goldenData, err := os.ReadFile(goldenPath)
				if err != nil {
					t.Fatal(err)
				}
				var golden struct {
					Nodes []struct {
						ID            int64 `json:"id"`
						Width, Height float64
						TopLeft       *struct{ X, Y float64 } `json:"topLeft"`
					} `json:"nodes"`
					Edges []struct {
						ID     int64                    `json:"id"`
						Points []struct{ X, Y float64 } `json:"points"`
					} `json:"edges"`
				}
				if err := json.Unmarshal(goldenData, &golden); err != nil {
					t.Fatal(err)
				}
				if len(golden.Nodes) != len(result.Nodes) || len(golden.Edges) != len(result.Edges) {
					t.Fatalf("%s seed %d: upstream golden topology differs", c.name, seed)
				}
				goldenNodes := map[int64]int{}
				for i, n := range golden.Nodes {
					goldenNodes[n.ID] = i
				}
				for _, n := range result.Nodes {
					i, ok := goldenNodes[n.IDValue()]
					if !ok || golden.Nodes[i].TopLeft == nil {
						t.Fatalf("%s: node %d missing from upstream golden", c.name, n.IDValue())
					}
					g := golden.Nodes[i]
					if math.Abs(n.TopLeft.X-g.TopLeft.X) > 1e-7 || math.Abs(n.TopLeft.Y-g.TopLeft.Y) > 1e-7 || math.Abs(n.Width-g.Width) > 1e-7 || math.Abs(n.Height-g.Height) > 1e-7 {
						t.Fatalf("%s: node %d differs from upstream golden", c.name, n.IDValue())
					}
				}
				goldenEdges := map[int64]int{}
				for i, e := range golden.Edges {
					goldenEdges[e.ID] = i
				}
				for _, e := range result.Edges {
					i, ok := goldenEdges[int64(e.ID)]
					if !ok || len(e.Points) != len(golden.Edges[i].Points) {
						t.Fatalf("%s: edge %d differs from upstream golden", c.name, e.ID)
					}
					for j, p := range e.Points {
						g := golden.Edges[i].Points[j]
						if math.Abs(p.X-g.X) > 1e-7 || math.Abs(p.Y-g.Y) > 1e-7 {
							t.Fatalf("%s: edge %d vertex %d differs from upstream golden", c.name, e.ID, j)
						}
					}
				}
			}
			nodes := []any{}
			edges := []any{}
			for _, n := range result.Nodes {
				nears := []string{}
				for _, near := range layoutgraph.OrderedNearsForSerialization(n) {
					nears = append(nears, fmt.Sprint(near.IDValue()))
				}
				record := map[string]any{"id": n.IDValue(), "x": n.TopLeft.X, "y": n.TopLeft.Y, "width": n.Width, "height": n.Height,
					"d2id": n.D2ID, "fontSize": n.FontSize, "shapeType": n.ShapeType(), "numColumns": n.NumColumns(),
					"isInvisible": n.IsInvisible, "is3D": n.Is3D, "isMultiple": n.IsMultiple, "forceHierarchy": n.ForceHierarchy, "isContainer": n.IsContainer(), "nears": nears}
				if n.FixedTopLeft != nil {
					record["fixedTopLeft"] = n.FixedTopLeft
				}
				if n.DesiredWidth != nil {
					record["desiredWidth"] = *n.DesiredWidth
				}
				if n.DesiredHeight != nil {
					record["desiredHeight"] = *n.DesiredHeight
				}
				if n.Label != nil {
					record["label"] = map[string]any{"text": n.Label.Text, "position": n.Label.Position.String(), "width": n.Label.Width, "height": n.Label.Height}
				}
				if n.Icon != nil {
					record["iconPosition"] = n.Icon.Position.String()
				}
				nodes = append(nodes, record)
			}
			for _, e := range result.Edges {
				record := map[string]any{"id": e.ID, "points": e.Points, "isCurve": e.IsCurve, "d2id": e.D2ID,
					"from": e.From.IDValue(), "to": e.To.IDValue(), "sourceArrowhead": e.SourceArrowhead,
					"targetArrowhead": e.TargetArrowhead, "minWidth": e.MinWidth, "minHeight": e.MinHeight,
					"fromTableColumnIndex": e.FromTableColumnIndex, "toTableColumnIndex": e.ToTableColumnIndex, "isInvisible": e.IsInvisible}
				if e.Label != nil {
					record["label"] = map[string]any{"text": e.Label.Text, "position": e.Label.Position.String(), "percentage": e.LabelPercentage, "width": e.Label.Width, "height": e.Label.Height}
				}
				if e.SourceArrowheadLabel != nil {
					record["sourceArrowheadLabel"] = map[string]any{"text": e.SourceArrowheadLabel.Text, "position": e.SourceArrowheadLabel.Position.String(), "width": e.SourceArrowheadLabel.Width, "height": e.SourceArrowheadLabel.Height}
				}
				if e.TargetArrowheadLabel != nil {
					record["targetArrowheadLabel"] = map[string]any{"text": e.TargetArrowheadLabel.Text, "position": e.TargetArrowheadLabel.Position.String(), "width": e.TargetArrowheadLabel.Width, "height": e.TargetArrowheadLabel.Height}
				}
				style := map[string]string{}
				if e.Style.Stroke != nil {
					style["stroke"] = e.Style.Stroke.Value
				}
				if e.Style.StrokeDash != nil {
					style["strokeDash"] = e.Style.StrokeDash.Value
				}
				if e.Style.Animated != nil {
					style["animated"] = e.Style.Animated.Value
				}
				if len(style) > 0 {
					record["style"] = style
				}
				edges = append(edges, record)
			}
			serialized, err := graphjson.Serialize(context.Background(), result)
			if err != nil {
				t.Fatalf("%s seed %d serialize: %v", c.name, seed, err)
			}
			if seed == 8675309 {
				data, err := json.Marshal(serialized)
				if err != nil {
					t.Fatal(err)
				}
				if got, want := fmt.Sprintf("%x", sha256.Sum256(data)), seedGoldens[c.name]; got != want {
					t.Fatalf("%s seed %d: upstream fingerprint %s, want %s", c.name, seed, got, want)
				}
			}
			structure := corpusStructure(serialized)
			fixtures = append(fixtures, map[string]any{"name": fmt.Sprintf("upstream-%s-seed-%d", c.name, seed), "seed": fmt.Sprint(seed), "input": json.RawMessage(data), "nodes": nodes, "edges": edges, "structure": structure})
		}
	}
	data, err := json.MarshalIndent(fixtures, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
