// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package labeling

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"sort"
	"testing"
)

func TestExportTypeScriptLabelingsharedFixtures(t *testing.T) {
	path := os.Getenv("TALA_LABELINGSHARED_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		edges := []*layoutgraph.Edge{}
		starts := []float64{0, 20, 80, 110, 180}
		lengths := []float64{200, 30, 20, 50, 60}
		for i := range starts {
			e := layoutgraph.NewEdge(layoutgraph.NewNode(1, 10, 10), layoutgraph.NewNode(2, 10, 10))
			start := starts[i] + float64(trial%7)
			end := start + lengths[i]
			if trial%2 == 0 {
				e.Points = []*geo.Point{geo.NewPoint(start, 10), geo.NewPoint(end, 10)}
			} else {
				e.Points = []*geo.Point{geo.NewPoint(10, start), geo.NewPoint(10, end)}
			}
			if (trial+i)%3 == 0 {
				e.Points[0], e.Points[1] = e.Points[1], e.Points[0]
			}
			edges = append(edges, e)
		}
		steps := 0
		segments, err := findSharedSegmentsChecked(edges, func() error { steps++; return nil })
		if err != nil {
			t.Fatal(err)
		}
		sort.Slice(segments, func(i, j int) bool {
			if segments[i].Start.X != segments[j].Start.X {
				return segments[i].Start.X < segments[j].Start.X
			}
			return segments[i].Start.Y < segments[j].Start.Y
		})
		out = append(out, map[string]any{"trial": trial, "segments": segments, "steps": steps, "edgeScore": scoreEdgeLabelOverlaps(100, 25, trial%3, trial%5, trial%7, trial%4, trial%2), "nodeScore": scoreNodeLabelOverlaps(trial%3, trial%5, trial%4)})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
