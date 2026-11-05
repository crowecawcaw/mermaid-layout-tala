// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"encoding/json"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

type tsEdgeSetBudget struct{ used uint64 }

func (g *tsEdgeSetBudget) step() error        { g.used++; return nil }
func (g *tsEdgeSetBudget) add(n uint64) error { g.used += n; return nil }
func (g *tsEdgeSetBudget) check() error       { return nil }
func TestExportTypeScriptRoutingedgesetFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGEDGESET_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 160; trial++ {
		set := newOvgEdgeSet()
		guard := &tsEdgeSetBudget{}
		nodes := []*OVGNode{}
		for i := 0; i < 40; i++ {
			nodes = append(nodes, &OVGNode{Point: geo.NewPoint(float64((i*7+trial)%13-6)*10, float64((i*11+trial*3)%11-5)*10), Index: i})
		}
		edges := []*OVGEdge{}
		for i := 0; i < 30; i++ {
			a := nodes[i]
			b := &OVGNode{Point: geo.NewPoint(a.X, a.Y), Index: 40 + i}
			if i%3 == 0 {
				b.X += float64((i%5)-2) * 10
			} else {
				b.Y += float64((i%7)-3) * 10
			}
			e := NewOVGEdge(a, b)
			e.Distance = float64(i % 3)
			edges = append(edges, e)
			if err := set.addGuarded(e, guard); err != nil {
				t.Fatal(err)
			}
			if i%4 == 0 {
				if err := set.addGuarded(e, guard); err != nil {
					t.Fatal(err)
				}
			}
		}
		results := []any{}
		for i := 0; i < 40; i++ {
			a := nodes[i]
			b := &OVGNode{Point: geo.NewPoint(a.X, a.Y), Index: 100 + i}
			if i%2 == 0 {
				b.X += float64(i%9-4) * 10
			} else {
				b.Y += float64(i%9-4) * 10
			}
			query := NewOVGEdge(a, b)
			cross, err := set.intersectsWithGuarded(query, guard)
			if err != nil {
				t.Fatal(err)
			}
			overlap, err := set.overlappingEdgesGuarded(query, guard)
			if err != nil {
				t.Fatal(err)
			}
			ids := []int{}
			for _, e := range overlap {
				ids = append(ids, e.From.Index)
			}
			results = append(results, map[string]any{"cross": cross, "overlap": ids})
		}
		out = append(out, map[string]any{"trial": trial, "used": guard.used, "results": results})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
