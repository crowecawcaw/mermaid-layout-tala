// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"testing"
)

func TestExportTypeScriptLayoutseednormalizeFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTSEEDNORMALIZE_FIXTURES")
	if path == "" {
		t.Skip()
	}
	cases := [][]int64{{}, {0}, {1, 2, 3}, {3, 2, 3, 1, 2}, {math.MinInt64, 0, math.MaxInt64, math.MinInt64}}
	for _, n := range []int{16, 17, 64, 65} {
		unique := make([]int64, n)
		repeated := make([]int64, n)
		for i := range unique {
			unique[i] = int64(i)
			repeated[i] = int64(i % 4)
		}
		cases = append(cases, unique, repeated)
	}
	fixtures := []any{}
	for _, seeds := range cases {
		values := []string{}
		for _, seed := range seeds {
			values = append(values, fmt.Sprint(seed))
		}
		normalized, err := normalizeSeeds(seeds)
		message := ""
		if err != nil {
			message = err.Error()
		}
		result := []string{}
		for _, seed := range normalized {
			result = append(result, fmt.Sprint(seed))
		}
		fixtures = append(fixtures, map[string]any{"input": values, "output": result, "error": message})
	}
	data, err := json.MarshalIndent(fixtures, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
