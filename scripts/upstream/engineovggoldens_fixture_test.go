// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package engine

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestExportTypeScriptEngineovggoldensFixtures(t *testing.T) {
	path := os.Getenv("TALA_ENGINEOVGGOLDENS_FIXTURES")
	if path == "" {
		t.Skip("set TALA_ENGINEOVGGOLDENS_FIXTURES")
	}
	root := filepath.Join("..", "testdata", "ovg")
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	fixtures := []any{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		dir := filepath.Join(root, entry.Name())
		input, err := os.ReadFile(filepath.Join(dir, "graph.input.json"))
		if err != nil {
			t.Fatal(err)
		}
		goldens, err := filepath.Glob(filepath.Join(dir, "ovg_*.exp.json"))
		if err != nil {
			t.Fatal(err)
		}
		if len(goldens) == 0 {
			t.Fatalf("%s has no OVG golden", entry.Name())
		}
		snapshots := []json.RawMessage{}
		for _, golden := range goldens {
			data, err := os.ReadFile(golden)
			if err != nil {
				t.Fatal(err)
			}
			snapshots = append(snapshots, json.RawMessage(data))
		}
		fixtures = append(fixtures, map[string]any{"name": entry.Name(), "input": json.RawMessage(input), "snapshots": snapshots})
	}
	data, err := json.Marshal(fixtures)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
