// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package engine

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptEnginecompoundFixtures(t *testing.T) {
	path := os.Getenv("TALA_ENGINECOMPOUND_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	directions := []geo.Orientation{geo.Top, geo.Right, geo.Bottom, geo.Left}
	for trial := 0; trial < 12; trial++ {
		g, _, child := selectedCompoundTestGraph()
		g.Directions[nil] = directions[trial%4]
		if trial%5 == 0 {
			child.FixedTopLeft = child.TopLeft.Copy()
		}
		detours := compoundCrossAxisDetours(g)
		candidate, err := CompoundCandidate(context.Background(), g)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		nodes := []any{}
		routes := [][]*geo.Point{}
		if err == nil {
			for _, n := range candidate.Nodes {
				nodes = append(nodes, []float64{n.TopLeft.X, n.TopLeft.Y, n.Width, n.Height})
			}
			for _, e := range candidate.Edges {
				routes = append(routes, e.Points)
			}
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "changed": candidate != g, "detours": detours, "nodes": nodes, "routes": routes})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
