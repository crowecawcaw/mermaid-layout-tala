// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package layoutgraph

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/limits"
	"github.com/d2lang/d2/lib/geo"
	"math/rand"
	"os"
	"testing"
)

func TestExportTypeScriptTransactionFixtures(t *testing.T) {
	path := os.Getenv("TALA_TRANSACTION_FIXTURES")
	if path == "" {
		t.Skip("set TALA_TRANSACTION_FIXTURES")
	}
	rng := rand.New(rand.NewSource(191))
	out := []any{}
	for trial := 0; trial < 300; trial++ {
		g := NewGraph()
		all := []*Node{}
		count := 4 + trial%16
		for j := 0; j < count; j++ {
			n := NewNode(EntityID(j+1), float64(20+j%5), float64(20+j%7))
			n.TopLeft = geo.NewPoint(float64(j*400), 0)
			g.AddNewNodeToContainer(nil, n)
			all = append(all, n)
		}
		nested := trial%3 == 0
		if nested {
			all[0].Width = 900
			all[0].Height = 300
			all[1].TopLeft = geo.NewPoint(100, 100)
			all[2].TopLeft = geo.NewPoint(500, 100)
			g.Containers[nil] = append([]*Node{all[0]}, all[3:]...)
			g.Containers[all[0]] = all[1:3]
			all[0].isContainer = true
			all[1].Container = all[0]
			all[2].Container = all[0]
		}
		if trial%9 == 0 {
			all[count-1].FixedTopLeft = all[count-1].TopLeft.Copy()
		}
		for j := 1; j < count; j++ {
			e := g.Connect(all[j-1], all[j])
			e.ID = EntityID(j)
			e.Points = []*geo.Point{all[j-1].TopLeft.Copy(), all[j].TopLeft.Copy()}
		}
		options := TransactionOptions{AffectContainers: trial%6 == 0, IgnoreContainerEscape: trial%7 == 0, AffectEdgeRoutes: trial%2 == 0}
		guard, err := limits.NewWorkGuard(context.Background(), "transaction fixture", limits.MaxTransactionWorkUnits)
		if err != nil {
			t.Fatal(err)
		}
		txn, err := g.newTransactionWithOptionsContext(context.Background(), options, guard)
		if err != nil {
			t.Fatal(err)
		}
		constructionWork := fmt.Sprint(guard.Used())
		attempts := []any{}
		for attempt := 0; attempt < 8; attempt++ {
			index := rng.Intn(count)
			dx, dy := float64(rng.Intn(401)-200), float64(rng.Intn(201)-100)
			if attempt%3 == 0 {
				target := all[(index+1)%count]
				dx = target.TopLeft.X - all[index].TopLeft.X
				dy = target.TopLeft.Y - all[index].TopLeft.Y
			}
			widthDelta := 0.0
			if attempt%4 == 0 {
				widthDelta = 12
			}
			txn.Clear()
			txn.AddOp(func() error { all[index].translate(dx, dy); all[index].Width += widthDelta; return nil })
			err := txn.Commit(context.Background())
			message := ""
			if err != nil {
				message = err.Error()
			}
			committed := []any{}
			for _, n := range all {
				committed = append(committed, n.Box.Copy())
			}
			updated := err == nil && attempt%3 == 1
			if updated {
				if err := txn.UpdateState(); err != nil {
					t.Fatal(err)
				}
			} else {
				txn.Rollback()
			}
			restored := []any{}
			for _, n := range all {
				restored = append(restored, n.Box.Copy())
			}
			// A rejected container check can stop before the nil map key.
			// Go map iteration changes that work count between identical runs.
			attemptWork := fmt.Sprint(guard.Used())
			if options.AffectContainers {
				attemptWork = ""
			}
			attempts = append(attempts, map[string]any{"index": index, "dx": dx, "dy": dy, "widthDelta": widthDelta, "updated": updated, "error": message, "committed": committed, "restored": restored, "work": attemptWork})
		}
		out = append(out, map[string]any{"trial": trial, "constructionWork": constructionWork, "attempts": attempts})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
