// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"encoding/json"
	"os"
	"testing"
)

type tsQueueBudget struct{ used uint64 }

func (g *tsQueueBudget) step() error        { g.used++; return nil }
func (g *tsQueueBudget) add(n uint64) error { g.used += n; return nil }
func (g *tsQueueBudget) check() error       { return nil }
func TestExportTypeScriptRoutingqueueFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGQUEUE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 160; trial++ {
		q := &priorityQueue{}
		guard := &tsQueueBudget{}
		entries := []*priorityQueueEntry{}
		for i := 0; i < 40+trial%30; i++ {
			p := float64((i*7 + trial*11) % 19)
			entry, err := q.push(p, &OVGNode{Index: i}, i%2 == 0, guard)
			if err != nil {
				t.Fatal(err)
			}
			entries = append(entries, entry)
		}
		for i, e := range entries {
			if (i+trial)%4 == 0 {
				if err := q.decrease(e, e.priority-float64(1+i%7), guard); err != nil {
					t.Fatal(err)
				}
			}
		}
		popped := []any{}
		for !q.empty() {
			e, err := q.pop(guard)
			if err != nil {
				t.Fatal(err)
			}
			popped = append(popped, map[string]any{"node": e.node.Index, "priority": e.priority, "horizontal": e.isHorizontal, "index": e.index})
		}
		out = append(out, map[string]any{"trial": trial, "used": guard.used, "popped": popped})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
