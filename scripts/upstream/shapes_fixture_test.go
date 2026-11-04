// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package nodeshape

import (
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/lib/geo"
	"github.com/d2lang/d2/lib/label"
	"math/rand"
	"os"
	"sort"
	"testing"
)

func TestExportTypeScriptShapesFixtures(t *testing.T) {
	path := os.Getenv("TALA_SHAPES_FIXTURES")
	if path == "" {
		t.Skip("set TALA_SHAPES_FIXTURES")
	}
	rng := rand.New(rand.NewSource(97))
	out := []any{}
	for kind := Square; kind <= Image; kind++ {
		for trial := 0; trial < 20; trial++ {
			w, h := float64(1+rng.Intn(600))/2, float64(1+rng.Intn(600))/2
			box := geo.NewBox(geo.NewPoint(-3.25, 17.5), w, h)
			s, k, ok := New(kind.String(), box)
			if !ok {
				t.Fatal(kind)
			}
			SetNumColumns(s, trial%10)
			preferences := [][]int{}
			for tier := Good; tier <= Bad; tier++ {
				positions := []int{}
				for pos := range s.LabelPositionPreferences(tier) {
					positions = append(positions, int(pos))
				}
				sort.Ints(positions)
				preferences = append(preferences, positions)
			}
			portIndices := [][]int{}
			centerIndices := []int{}
			for o := geo.TopLeft; o <= geo.NONE; o++ {
				indices := s.PortIndices(o)
				if indices == nil {
					indices = []int{}
				}
				portIndices = append(portIndices, indices)
				centerIndices = append(centerIndices, s.CenterPortIndex(o))
			}
			centerPorts := s.CenterPortIndices()
			if centerPorts == nil {
				centerPorts = []int{}
			}
			mirrored := s.MirroredPortIndices()
			if mirrored == nil {
				mirrored = map[int]int{}
			}
			columns := []any{}
			if kind == Table {
				count := NumColumns(s)
				if count == 0 {
					count = 1
				}
				for column := 0; column < count; column++ {
					for _, o := range []geo.Orientation{geo.Left, geo.Right} {
						index, valid := TablePortIndex(s, o, column)
						point, validPoint := TableColumnPortValue(s, o, column)
						columns = append(columns, map[string]any{"column": column, "orientation": o, "index": index, "valid": valid, "point": point, "validPoint": validPoint})
					}
				}
			}
			_ = label.Unset
			out = append(out, map[string]any{"name": fmt.Sprintf("shape-%s-%02d", kind.String(), trial), "type": kind.String(), "width": w, "height": h, "columns": trial % 10, "expected": map[string]any{"kind": k, "preferences": preferences, "points": s.SnapPointPercentages(), "portIndices": portIndices, "centerIndices": centerIndices, "centerPorts": centerPorts, "mirrored": mirrored, "numColumns": NumColumns(s), "columns": columns}})
		}
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
