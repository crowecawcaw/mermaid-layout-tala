// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptRoutingswapstageFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSWAPSTAGE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 180; trial++ {
		g, _ := swapMutationGraph()
		err := swapAllEdgePortsWithWorkLimit(context.Background(), g, uint64(1+trial*10))
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		routes := [][]*geo.Point{}
		for _, edge := range g.Edges {
			routes = append(routes, edge.Points)
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
