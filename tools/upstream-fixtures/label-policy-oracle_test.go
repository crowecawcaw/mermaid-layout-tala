// Copy into pinned upstream internal/labeling as ts_label_policy_fixture_test.go.
// Development oracle only.
package labeling

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/nodeshape"
)

type tsLabelPolicy struct {
	Shape     string     `json:"shape"`
	Container bool       `json:"container"`
	Tranches  [][]string `json:"tranches"`
	Default   string     `json:"default"`
}

func TestTSLabelPolicies(t *testing.T) {
	outputPath := os.Getenv("TALA_TS_LABEL_POLICY_OUTPUT")
	if outputPath == "" {
		t.Skip("set output path")
	}
	var policies []tsLabelPolicy
	for kind := nodeshape.Square; kind <= nodeshape.Image; kind++ {
		for _, container := range []bool{false, true} {
			node := layoutgraph.NewNode(1, 100, 50)
			if kind != nodeshape.Square {
				node.SetShape(kind.String())
			}
			node.SetContainer(container)
			tranches := labelPositionPreferenceTranches(node)
			result := tsLabelPolicy{Shape: kind.String(), Container: container, Tranches: make([][]string, 0, len(tranches))}
			for _, tranche := range tranches {
				positions := make([]string, 0, len(tranche))
				for _, position := range tranche {
					positions = append(positions, position.String())
				}
				result.Tranches = append(result.Tranches, positions)
			}
			preferences := labelPositionPreferences(node)
			if len(preferences) > 0 {
				result.Default = preferences[0].String()
			}
			policies = append(policies, result)
		}
	}
	encoded, err := json.MarshalIndent(policies, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(outputPath, append(encoded, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
