// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package label

import (
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/lib/geo"
	"math/rand"
	"os"
	"testing"
)

func TestExportTypeScriptLabelFixtures(t *testing.T) {
	path := os.Getenv("TALA_LABEL_FIXTURES")
	if path == "" {
		t.Skip("set TALA_LABEL_FIXTURES")
	}
	rng := rand.New(rand.NewSource(71))
	out := []any{}
	for trial := 0; trial < 80; trial++ {
		route := geo.Route{geo.NewPoint(float64(rng.Intn(100)-50), float64(rng.Intn(100)-50))}
		for j := 0; j < 4; j++ {
			p := route[len(route)-1].Copy()
			if j%2 == 0 {
				p.X += float64(1 + rng.Intn(100))
			} else {
				p.Y += float64(1 + rng.Intn(100))
			}
			route = append(route, p)
		}
		box := geo.NewBox(geo.NewPoint(float64(rng.Intn(100)-50), float64(rng.Intn(100)-50)), float64(1+rng.Intn(100)), float64(1+rng.Intn(100)))
		w, h := float64(rng.Intn(100))/2, float64(rng.Intn(100))/2
		percent := float64(rng.Intn(151)-25) / 100
		stroke := float64(rng.Intn(10))
		expected := []any{}
		for pos := Unset; pos <= UnlockedBottom; pos++ {
			point, index := pos.GetPointOnRoute(route, stroke, percent, w, h)
			expected = append(expected, map[string]any{"position": pos, "string": pos.String(), "fromString": FromString(pos.String()), "mirrored": pos.Mirrored(), "isShape": pos.IsShapePosition(), "isEdge": pos.IsEdgePosition(), "outside": pos.IsOutside(), "unlocked": pos.IsUnlocked(), "border": pos.IsBorder(), "onEdge": pos.IsOnEdge(), "box": pos.GetPointOnBox(box, 5, w, h), "route": point, "index": index})
		}
		out = append(out, map[string]any{"name": fmt.Sprintf("label-%03d", trial), "route": route, "box": box, "width": w, "height": h, "percent": percent, "stroke": stroke, "expected": expected})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
