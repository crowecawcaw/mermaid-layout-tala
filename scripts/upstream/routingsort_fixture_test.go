// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"os"
	"testing"
)

type tsRouteSortItem struct {
	Key   int `json:"key"`
	Index int `json:"index"`
}

func TestExportTypeScriptRoutingsortFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGSORT_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		for limit := uint64(0); limit <= 240; limit += 20 {
			guard, err := newRouteWorkGuard(context.Background(), "test", limit)
			if err != nil {
				t.Fatal(err)
			}
			items := []tsRouteSortItem{}
			for i := 0; i < trial%25; i++ {
				items = append(items, tsRouteSortItem{(i*7 + trial*3) % 9, i})
			}
			err = stableSortRouteValues(items, func(a, b tsRouteSortItem) bool { return a.Key < b.Key }, guard)
			msg := ""
			if err != nil {
				msg = err.Error()
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "used": guard.used, "error": msg, "items": items})
		}
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
