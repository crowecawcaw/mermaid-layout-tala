// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptRoutingcrosshatchFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGCROSSHATCH_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 150; trial++ {
		g, a, b := crosshatchMutationGraph()
		limit := uint64(1 + trial*8)
		err := crosshatchWithWorkLimit(context.Background(), g, limit)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		routes := [][]*geo.Point{a.Points, b.Points}
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
