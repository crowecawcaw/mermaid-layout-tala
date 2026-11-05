// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/lib/geo"
)

func TestExportTypeScriptRoutingnudgestageFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGNUDGESTAGE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 240; trial++ {
		g, e := channelZGraph()
		x := float64(110 + trial%15*5)
		e.Points[1].X = x
		e.Points[2].X = x
		if trial%4 == 0 {
			e.From.SetShape("diamond")
			e.To.SetShape("diamond")
		}
		if trial%3 == 0 {
			duplicate := g.Connect(e.From, e.To)
			for _, p := range e.Points {
				duplicate.Points = append(duplicate.Points, p.Copy())
			}
		}
		limit := uint64(1 + trial*20)
		if trial >= 120 {
			limit = 50000000
		}
		err := nudgeChannelsWithLimit(context.Background(), g, limit)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		routes := [][]*geo.Point{}
		for _, e := range g.Edges {
			routes = append(routes, e.Points)
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "routes": routes})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
