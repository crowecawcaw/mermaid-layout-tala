// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package hierarchy

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/lib/geo"
	"math/rand"
	"os"
	"testing"
)

func TestExportTypeScriptHierarchycompoundFixtures(t *testing.T) {
	path := os.Getenv("TALA_HIERARCHYCOMPOUND_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	directions := []geo.Orientation{geo.Top, geo.Bottom, geo.Left, geo.Right}
	for trial := 0; trial < 80; trial++ {
		g, outer, children := compoundTestGraph()
		g.Directions[nil] = directions[trial%4]
		if trial%11 == 0 {
			children[0].FixedTopLeft = children[0].TopLeft.Copy()
		}
		changed, err := PlaceCompound(context.Background(), g, rand.New(rand.NewSource(int64(trial+1))))
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		geometry := [][]float64{}
		levels := []int{}
		for _, n := range append(outer, children...) {
			geometry = append(geometry, []float64{n.TopLeft.X, n.TopLeft.Y, n.Width, n.Height})
			if n.Hierarchy == nil {
				levels = append(levels, -1)
			} else {
				levels = append(levels, n.Hierarchy.Levels()[n])
			}
		}
		out = append(out, map[string]any{"trial": trial, "changed": changed, "error": msg, "geometry": geometry, "levels": levels})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
