// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/d2graph"
)

func TestExportTypeScriptLayoutarrowvalidationFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTARROWVALIDATION_FIXTURES")
	if path == "" {
		t.Skip()
	}
	shapes := []string{"", "none", "arrow", "triangle", "diamond", "circle", "box", "cross", "cf-one", "cf-many", "cf-one-required", "cf-many-required", "bad", "Triangle"}
	out := []any{}
	for _, shape := range shapes {
		attrs := &d2graph.Attributes{}
		attrs.Shape.Value = shape
		out = append(out, map[string]any{"shape": shape, "valid": validateD2Arrowhead(0, "source", attrs) == nil})
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
