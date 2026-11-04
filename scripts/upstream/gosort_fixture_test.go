// Copyright 2022 The Go Authors. All rights reserved. BSD-style LICENSE-GO.
package grouping

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"sort"
	"testing"
)

func TestExportTypeScriptGosortFixtures(t *testing.T) {
	path := os.Getenv("TALA_GOSORT_FIXTURES")
	if path == "" {
		t.Skip()
	}
	rng := rand.New(rand.NewSource(741))
	out := []any{}
	for trial := 0; trial < 500; trial++ {
		count := trial
		if trial > 100 {
			count = rng.Intn(3000)
		}
		values := []int{}
		order := []int{}
		for j := 0; j < count; j++ {
			v := rng.Intn(20)
			switch trial % 8 {
			case 0:
				v = j
			case 1:
				v = count - j
			case 2:
				v = 1
			case 3:
				v = j % 7
			case 4:
				v = j
				if j%40 == 0 {
					v = rng.Intn(count + 1)
				}
			case 5:
				v = rng.Intn(100000)
			case 6:
				v = j
				if j > count/2 {
					v = count - j
				}
			}
			values = append(values, v)
			order = append(order, j)
		}
		comparisons := 0
		sort.Slice(order, func(i, j int) bool { comparisons++; return values[order[i]] < values[order[j]] })
		out = append(out, map[string]any{"name": fmt.Sprint(trial), "values": values, "order": order, "comparisons": comparisons})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
