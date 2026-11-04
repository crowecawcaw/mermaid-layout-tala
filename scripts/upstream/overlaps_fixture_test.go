// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package layoutgraph

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/lib/geo"
	"math/rand"
	"os"
	"sort"
	"testing"
)

func TestExportTypeScriptOverlapsFixtures(t *testing.T) {
	path := os.Getenv("TALA_OVERLAPS_FIXTURES")
	if path == "" {
		t.Skip("set TALA_OVERLAPS_FIXTURES")
	}
	rng := rand.New(rand.NewSource(173))
	out := []any{}
	for trial := 0; trial < 200; trial++ {
		g := NewGraph()
		all := []*Node{}
		nodes := []any{}
		edges := []any{}
		for j := 0; j < 5+rng.Intn(40); j++ {
			n := NewNode(EntityID(j+1), float64(1+rng.Intn(180)), float64(1+rng.Intn(140)))
			n.TopLeft = geo.NewPoint(float64(rng.Intn(1800)-900), float64(rng.Intn(1200)-600))
			n.Graph = g
			if trial%13 == 0 && j == 2 {
				n.TopLeft = nil
			}
			if j%7 == 0 {
				n.SetShape("Table")
			}
			n.margin = Spacing{top: float64(rng.Intn(50)), right: float64(rng.Intn(50)), bottom: float64(rng.Intn(50)), left: float64(rng.Intn(50))}
			n.LoopOffsets = map[geo.Orientation]float64{geo.Top: float64(rng.Intn(90)), geo.Right: float64(rng.Intn(90))}
			all = append(all, n)
			g.Nodes = append(g.Nodes, n)
			nodes = append(nodes, map[string]any{"box": n.Box, "table": j%7 == 0, "margin": []float64{n.margin.top, n.margin.right, n.margin.bottom, n.margin.left}, "loops": []float64{n.LoopOffsets[geo.Top], n.LoopOffsets[geo.Right]}})
		}
		for j := 0; j < len(all)*2; j++ {
			a, b := rng.Intn(len(all)), rng.Intn(len(all))
			e := g.Connect(all[a], all[b])
			e.MinWidth = rng.Intn(220)
			e.MinHeight = rng.Intn(180)
			edges = append(edges, []int{a, b, e.MinWidth, e.MinHeight})
		}
		if trial%7 == 0 {
			g.Nodes = append(g.Nodes, all[0])
		}
		if trial%11 == 0 {
			all[0].Edges = nil
		}
		limit := int64(4000000)
		if trial%5 == 0 {
			limit = int64(rng.Intn(50))
		}
		guard, err := limits.NewWorkGuard(context.Background(), "overlap fixture", limits.MaxEngineWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		overlaps, exact, err := buildTransactionOverlapsWithReferenceLimit(g, guard, limit)
		message := ""
		if err != nil {
			message = err.Error()
		}
		encode := func(m map[*Node]map[*Node]struct{}) any {
			if m == nil {
				return nil
			}
			result := map[string]any{}
			for n, others := range m {
				ids := []int{}
				for other := range others {
					ids = append(ids, int(other.ID))
				}
				sort.Ints(ids)
				result[fmt.Sprint(n.ID)] = ids
			}
			return result
		}
		out = append(out, map[string]any{"trial": trial, "nodes": nodes, "edges": edges, "limit": fmt.Sprint(limit), "expected": map[string]any{"overlaps": encode(overlaps), "exact": encode(exact), "error": message, "work": fmt.Sprint(guard.Used())}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
