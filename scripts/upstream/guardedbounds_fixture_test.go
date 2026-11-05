// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package graphbounds

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"github.com/d2lang/d2/lib/label"
	"os"
	"testing"
)

type fixtureBoundsGuard struct{ used int }

func (g *fixtureBoundsGuard) Step() error   { g.used++; return nil }
func (g *fixtureBoundsGuard) Finish() error { return nil }
func TestExportTypeScriptGuardedboundsFixtures(t *testing.T) {
	path := os.Getenv("TALA_GUARDEDBOUNDS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 300; trial++ {
		graph := layoutgraph.NewGraph()
		nodes := []*layoutgraph.Node{}
		for i := 0; i < 1+trial%5; i++ {
			n := graph.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(i+1), float64(40+i*10)+.5, float64(30+i*7)+.25))
			n.TopLeft = geo.NewPoint(float64((trial*7+i*31)%120)-.5, float64((trial*11+i*23)%90)+.25)
			if (trial+i)%3 == 0 {
				n.Label = &layoutgraph.Label{Position: label.Position(1 + (trial+i)%12), Width: float64(30 + i*4), Height: float64(15 + i*3)}
			}
			if (trial+i)%7 == 0 {
				n.Icon = &layoutgraph.Icon{Position: label.OutsideTopCenter}
			}
			if (trial+i)%5 == 0 {
				n.FixedTopLeft = geo.NewPoint(float64(i), float64(i*2))
			}
			n.Is3D = (trial+i)%9 == 0
			n.IsMultiple = (trial+i)%11 == 0
			nodes = append(nodes, n)
		}
		guard := &fixtureBoundsGuard{}
		tl, br, err := FixedBoundingBox(nodes, guard)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, map[string]any{"trial": trial, "tl": tl, "br": br, "work": guard.used})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
