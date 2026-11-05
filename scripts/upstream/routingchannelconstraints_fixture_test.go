// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"os"
	"testing"
)

func TestExportTypeScriptRoutingchannelconstraintsFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGCHANNELCONSTRAINTS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 200; trial++ {
		p := channelProblem{}
		for i := 0; i < 4; i++ {
			group := &channelGroup{lower: float64(i * 12), upper: float64(80 + i*11), position: float64(20 + i*16)}
			if (trial+i)%3 == 0 {
				group.nodeClearance = &Range{start: float64(5 + i*12), end: float64(65 + i*13)}
			}
			p.groups = append(p.groups, group)
		}
		p.arcs = []channelArc{{0, 1, trial%2 == 0}, {1, 2, true}, {0, 3, trial%3 == 0}, {2, 3, true}}
		gap := float64(trial % 38)
		guard, _ := newRouteWorkGuard(context.Background(), "channels", 100000)
		lo, hi, ok, err := solveChannelGap(p, gap, guard)
		if err != nil {
			t.Fatal(err)
		}
		positions := []float64{20, 36, 52, 68}
		out = append(out, map[string]any{"trial": trial, "lo": lo, "hi": hi, "ok": ok, "gap": channelGap(p, positions), "work": guard.used})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
