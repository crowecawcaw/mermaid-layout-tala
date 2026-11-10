// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package d2talalayout

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"github.com/d2lang/d2/d2graph"
)

func TestExportTypeScriptLayoutcancellationFixtures(t *testing.T) {
	path := os.Getenv("TALA_LAYOUTCANCELLATION_FIXTURES")
	if path == "" {
		t.Skip()
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	graph := d2graph.NewGraph()
	noLayoutContext := Layout(nil, graph, nil)
	noRouteContext := RouteEdges(nil, graph, nil)
	layoutErr := Layout(ctx, graph, nil)
	routeErr := RouteEdges(ctx, graph, nil)
	_, seedErr := coordinateLocalSeeds(ctx, []int64{1, 2}, 2, func(index int, seed int64) localSeedAttempt {
		return localSeedAttempt{index: index, seed: seed, result: seedResult{score: layoutScore{penalty: float64(index)}}}
	})
	parent, cancelParent := context.WithCancel(context.WithValue(context.Background(), "key", "value"))
	child, cancelChild := context.WithCancel(parent)
	childBefore := fmt.Sprint(child.Err())
	childValue := fmt.Sprint(child.Value("key"))
	cancelParent()
	childAfterParent := fmt.Sprint(child.Err())
	cancelChild()
	parent2, cancelParent2 := context.WithCancel(context.Background())
	child2, cancelChild2 := context.WithCancel(parent2)
	cancelChild2()
	parentAfterChild := fmt.Sprint(parent2.Err())
	childAfterSelf := fmt.Sprint(child2.Err())
	cancelParent2()
	out := map[string]string{"layout": layoutErr.Error(), "route": routeErr.Error(), "seeds": seedErr.Error(), "nilLayout": noLayoutContext.Error(), "nilRoute": noRouteContext.Error(), "childBefore": childBefore, "childValue": childValue, "childAfterParent": childAfterParent, "parentAfterChild": parentAfterChild, "childAfterSelf": childAfterSelf}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
