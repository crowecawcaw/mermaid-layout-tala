// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"testing"

	"github.com/d2lang/d2/d2graph"
)

func TestExportTypeScriptLayoutopacityFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTOPACITY_FIXTURES")
	if path == "" {
		t.Skip("set TALA_LAYOUTOPACITY_FIXTURES")
	}
	values := []string{
		"", "0", "-0", "+0", "1", "-1", "+1", "0.5", ".5", "1.",
		"1e-4", "1E+0", "1e-4000", "1e4000", "1.0000000000000001",
		"1.0000000000000002", "0_0", "0.0_1", "0_.0", "1e_0", "_0", "0_",
		" 0", "0 ", "0x0", "0x1", "0x0p0", "0x_0p0", "0x0_p0", "0x.8p0",
		"0x1p-1", "0x1.0p-1", "0x1p+0", "0x1.0000000000001p0", "0x1p-1075",
		"0x1p-1074", "0x1p1024", "0x.0000000000000000000000000001p+0", "0x_.8p0", "NaN", "Inf", "Infinity", "true",
	}
	for _, tail := range []string{"0000000000000000", "0000000000000800", "0000000000000801", "0000000000000fff", "ffffffffffffffff"} {
		for _, exponent := range []int{-1080, -1076, -1075, -1074, -1073, -1023, -1, 0, 1} {
			values = append(values, fmt.Sprintf("0x1.%sp%d", tail, exponent))
		}
	}
	fixtures := []map[string]any{}
	for _, input := range values {
		style := d2graph.Style{Opacity: &d2graph.Scalar{Value: input}}
		valid := validateD2Style("owner", style) == nil
		parsed, err := strconv.ParseFloat(input, 64)
		zero := err == nil && parsed == 0
		fixtures = append(fixtures, map[string]any{"input": input, "valid": valid, "zero": zero})
	}
	data, err := json.MarshalIndent(fixtures, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
