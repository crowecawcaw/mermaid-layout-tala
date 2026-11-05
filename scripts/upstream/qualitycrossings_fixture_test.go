// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package quality

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/lib/geo"
)

func TestExportTypeScriptQualitycrossingsFixtures(t *testing.T) {
	path := os.Getenv("TALA_QUALITYCROSSINGS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		g := layoutgraph.NewGraph()
		for i := 0; i < 5; i++ {
			n := layoutgraph.NewNode(layoutgraph.EntityID(2*i+1), 10, 10)
			g.AddNewNodeToContainer(nil, n)
			m := layoutgraph.NewNode(layoutgraph.EntityID(2*i+2), 10, 10)
			g.AddNewNodeToContainer(nil, m)
			e := g.Connect(n, m)
			for j := 0; j < (trial+i)%5; j++ {
				e.Points = append(e.Points, geo.NewPoint(float64((trial+i*17+j*13)%70), float64((trial*3+i*23+j*11)%70)))
			}
		}
		guard, _ := limits.NewWorkGuard(context.Background(), "quality crossings", 10000)
		count, err := countNonSharedCrossings(g.Edges, guard)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, map[string]any{"trial": trial, "count": count, "work": guard.Used()})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
