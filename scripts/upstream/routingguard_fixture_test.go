// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"os"
	"testing"
)

func TestExportTypeScriptRoutingguardFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGGUARD_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 120; trial++ {
		for limit := uint64(0); limit < 140; limit += 7 {
			g, err := newRouteSearchWorkGuard(context.Background(), Default, limit)
			if err != nil {
				t.Fatal(err)
			}
			errors := []string{}
			for i := 0; i < 20; i++ {
				switch (i + trial) % 4 {
				case 0:
					err = g.step()
				case 1:
					err = g.add(uint64((i + trial) % 10))
				case 2:
					err = g.reserveSort((i + trial) % 12)
				case 3:
					err = g.reserveProduct(uint64((i+trial)%5), uint64(i%4))
				}
				msg := ""
				if err != nil {
					msg = err.Error()
				}
				errors = append(errors, msg)
			}
			err = g.finish()
			if err != nil {
				t.Fatal(err)
			}
			out = append(out, map[string]any{"trial": trial, "limit": limit, "used": g.used, "errors": errors})
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
