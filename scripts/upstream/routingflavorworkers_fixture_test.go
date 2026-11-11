// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"sync/atomic"
	"testing"
)

func TestExportTypeScriptRoutingflavorworkersFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGFLAVORWORKERS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	fixtures := []any{}
	for _, name := range []string{"success", "ordinary-error", "panic-first", "panic-all", "too-many"} {
		routers := []*ovgEdgeRouter{{flavor: ShortestToLongest}, {flavor: LongestToShortest}, {flavor: Default}}
		if name == "too-many" {
			routers = append(routers, &ovgEdgeRouter{flavor: Default})
		}
		var calls atomic.Int32
		worker := func(router *ovgEdgeRouter, _ context.Context, _ bool) GenerateRouteResponse {
			calls.Add(1)
			if name == "panic-all" || (name == "panic-first" && router.flavor == ShortestToLongest) {
				panic("private panic payload")
			}
			if name == "ordinary-error" && router.flavor == ShortestToLongest {
				return GenerateRouteResponse{Err: errors.New("ordinary failure")}
			}
			return GenerateRouteResponse{Flavor: Default, Distance: 42}
		}
		responses, err := generateRouteFlavorResponsesWith(context.Background(), routers, true, worker)
		message := ""
		if err != nil {
			message = err.Error()
		}
		results := []any{}
		for _, response := range responses {
			message := ""
			if response.Err != nil {
				message = response.Err.Error()
			}
			results = append(results, map[string]any{"flavor": response.Flavor, "distance": response.Distance, "error": message})
		}
		fixtures = append(fixtures, map[string]any{"name": name, "error": message, "calls": calls.Load(), "responses": results})
	}
	data, err := json.MarshalIndent(fixtures, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
