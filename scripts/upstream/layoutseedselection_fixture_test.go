// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
)

type seedFixtureAttempt struct {
	Penalty float64 `json:"penalty"`
	Area    float64 `json:"area"`
	Error   string  `json:"error,omitempty"`
}

func TestExportTypeScriptLayoutseedselectionFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTSEEDSELECTION_FIXTURES")
	if path == "" {
		t.Skip()
	}
	cases := [][]seedFixtureAttempt{
		{{Penalty: 2, Area: 10}, {Penalty: 1, Area: 20}, {Penalty: 3, Area: 1}},
		{{Penalty: 1, Area: 20}, {Penalty: 1, Area: 10}, {Penalty: 1, Area: 15}},
		{{Penalty: 1, Area: 10}, {Penalty: 1, Area: 10}, {Penalty: 1, Area: 10}},
		{{Error: "first failed"}, {Penalty: 2, Area: 3}, {Error: "third failed"}},
		{{Error: "first failed"}, {Error: "second failed"}, {Error: "third failed"}},
	}
	out := []any{}
	for trial, attempts := range cases {
		seeds := []int64{1, 2, 3}
		graphs := []*layoutgraph.Graph{layoutgraph.NewGraph(), layoutgraph.NewGraph(), layoutgraph.NewGraph()}
		result, err := coordinateLocalSeeds(context.Background(), seeds, 3, func(index int, seed int64) localSeedAttempt {
			a := attempts[index]
			attempt := localSeedAttempt{index: index, seed: seed}
			if a.Error != "" {
				attempt.err = errors.New(a.Error)
			} else {
				attempt.result = seedResult{graph: graphs[index], score: layoutScore{penalty: a.Penalty, area: a.Area}}
			}
			return attempt
		})
		winner := -1
		for i, g := range graphs {
			if result.graph == g {
				winner = i
			}
		}
		message := ""
		if err != nil {
			message = err.Error()
		}
		out = append(out, map[string]any{"trial": trial, "attempts": attempts, "winner": winner, "error": message})
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
