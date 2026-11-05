// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/lib/geo"
)

func TestExportTypeScriptRoutingchannelsafetyFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGCHANNELSAFETY_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 180; trial++ {
		g, e := channelZGraph()
		if trial%3 == 0 {
			other := g.Connect(e.From, e.To)
			other.Points = []*geo.Point{geo.NewPoint(200, 150), geo.NewPoint(250, 150)}
		}
		x := float64(100 + (trial%45)*5)
		proposal := map[*geo.Point]*geo.Point{e.Points[1]: geo.NewPoint(x, 50), e.Points[2]: geo.NewPoint(x, 250)}
		guard, _ := newRouteWorkGuard(context.Background(), "channel test", 10000)
		safe, err := channelProposalSafe(g, proposal, guard)
		if err != nil {
			t.Fatal(err)
		}
		length, err := channelWireLength(g, proposal, guard)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, map[string]any{"trial": trial, "safe": safe, "length": length, "work": guard.used})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
