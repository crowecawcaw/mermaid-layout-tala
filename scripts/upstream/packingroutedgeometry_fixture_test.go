// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package packing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptPackingroutedgeometryFixtures(t *testing.T) {
	path := os.Getenv("TALA_PACKINGROUTEDGEOMETRY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 240; trial++ {
		original := geo.NewBox(geo.NewPoint(0, 0), 200, 160)
		proposed := geo.NewBox(geo.NewPoint(float64(trial%3*10), float64(trial%5*5)), float64(200-trial%4*10), float64(160-trial%6*5))
		a := geo.NewPoint(float64((trial*47)%300-50), float64((trial*29)%240-40))
		b := geo.NewPoint(float64((trial*83+5)%300-50), float64((trial*53+7)%240-40))
		if trial%4 == 0 {
			a = geo.NewPoint(float64(trial%21*10), 0)
		}
		guard, _ := newWorkGuard(context.Background(), 1000000)
		enter, exit, intersects, valid, err := routedContainerSegmentBoxInterval(original, a, b, guard)
		if err != nil {
			t.Fatal(err)
		}
		intervalWork := guard.Used()
		guard, _ = newWorkGuard(context.Background(), 1000000)
		stays, err := routedContainerSegmentStaysInsideShrink(original, proposed, a, b, guard)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, map[string]any{"trial": trial, "sides": routedContainerPointSides(original, a), "keeps": routedContainerEndpointKeepsSides(original, proposed, a), "covers": routedContainerBoxCovers(original, proposed), "hull": routedContainerControlHullIsPreserved(original, proposed, a, b), "enter": enter, "exit": exit, "intersects": intersects, "valid": valid, "intervalWork": intervalWork, "stays": stays, "stayWork": guard.Used()})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
