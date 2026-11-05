// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptRoutingstageFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSTAGE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for count := 1; count <= 4; count++ {
		for limit := uint64(0); limit < 120; limit++ {
			g := layoutgraph.NewGraph()
			nodes := []*layoutgraph.Node{}
			for i := 0; i < count+1; i++ {
				n := g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), 80, 60))
				n.SetShape("Diamond")
				n.TopLeft = geo.NewPoint(float64(i*150), float64(i*100))
				nodes = append(nodes, n)
			}
			for i := 0; i < count; i++ {
				e := g.Connect(nodes[i], nodes[i+1])
				e.Points = []*geo.Point{geo.NewPoint(float64(i*150+80), float64(i*100+30)), geo.NewPoint(float64(i*150+100), float64(i*100+30)), geo.NewPoint(float64((i+1)*150), float64((i+1)*100+30))}
			}
			err := traceEdgesToShapeBorderWithWorkLimit(context.Background(), g, limit)
			routes := []any{}
			for _, e := range g.Edges {
				routes = append(routes, e.Points)
			}
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			out = append(out, map[string]any{"count": count, "limit": limit, "error": msg, "routes": routes})
		}
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
