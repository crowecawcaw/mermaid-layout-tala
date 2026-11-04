// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package placementcost

import (
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/nodeshape"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

func TestExportTypeScriptPortsFixtures(t *testing.T) {
	path := os.Getenv("TALA_PORTS_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 460; trial++ {
		g := layoutgraph.NewGraph()
		g.CellSize = 40
		shape := nodeshape.Kind(trial % 23).String()
		a := g.AddNode(layoutgraph.NewNode(1, float64(60+trial%51)+0.5, float64(70+trial%37)+0.25))
		a.SetShape(shape)
		a.SetNumColumns(trial % 7)
		a.TopLeft = geo.NewPoint(-20.5, 30.25)
		b := g.AddNode(layoutgraph.NewNode(2, 90.75, 130.25))
		b.SetShape("Table")
		b.SetNumColumns(4)
		b.TopLeft = geo.NewPoint(float64(trial%5*140)-280.5, float64(trial%7*80)-210.25)
		e := g.Connect(a, b)
		if trial%2 == 0 {
			i := trial % 3
			e.ToTableColumnIndex = &i
		}
		if shape == "Table" && trial%3 == 0 {
			i := 0
			if a.NumColumns() > 0 {
				i = trial % a.NumColumns()
			}
			e.FromTableColumnIndex = &i
		}
		ps := a.Ports()
		orientations := []geo.Orientation{}
		for _, p := range ps {
			orientations = append(orientations, a.PortOrientation(&p))
		}
		sides := []any{}
		for _, o := range []geo.Orientation{geo.Top, geo.Right, geo.Left, geo.Bottom} {
			sides = append(sides, a.PortsByOrientation(o))
		}
		from, to, hasFrom, hasTo, o := e.FacingTablePortValues(a, b)
		out = append(out, map[string]any{"trial": trial, "shape": shape, "width": a.Width, "height": a.Height, "columns": a.NumColumns(), "other": b.TopLeft, "fromColumn": e.FromTableColumnIndex, "toColumn": e.ToTableColumnIndex, "expected": map[string]any{"ports": ps, "centers": a.CenterPorts(), "sides": sides, "orientations": orientations, "facing": map[string]any{"from": from, "to": to, "hasFrom": hasFrom, "hasTo": hasTo, "orientation": o}, "aligned": e.IsAxisAligned(), "distance": distanceBetweenTableColumns(g, e, a, b)}})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
