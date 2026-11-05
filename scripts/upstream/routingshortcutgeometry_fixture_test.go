// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/lib/geo"
)

func TestExportTypeScriptRoutingshortcutgeometryFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSHORTCUTGEOMETRY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 160; trial++ {
		x := float64(40 + trial%10*5)
		before := []*geo.Point{geo.NewPoint(0, 0), geo.NewPoint(x, 0), geo.NewPoint(x, 60), geo.NewPoint(120, 60), geo.NewPoint(120, 120), geo.NewPoint(200, 120)}
		other := []*geo.Point{geo.NewPoint(float64(trial%8*25), -20), geo.NewPoint(float64(trial%8*25), 140)}
		candidate := shortcutCandidate(before, trial%2, 4, trial%3 == 0)
		guard, _ := newRouteWorkGuard(context.Background(), "shortcut", 100000)
		safe, err := shortcutContactsPreserved(before, candidate, other, guard)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, map[string]any{"trial": trial, "candidate": candidate, "orthogonal": shortcutOrthogonal(candidate), "bends": shortcutBends(candidate), "length": shortcutLength(candidate), "contacts": safe, "work": guard.used})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
