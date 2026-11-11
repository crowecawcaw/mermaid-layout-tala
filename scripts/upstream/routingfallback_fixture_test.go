// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package routing

import (
	"context"
	"encoding/json"
	"github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
	"github.com/d2lang/d2/lib/geo"
	"os"
	"testing"
)

type fallbackCountingContext struct {
	context.Context
	checks int
}

func (ctx *fallbackCountingContext) Err() error {
	ctx.checks++
	return nil
}

func TestExportTypeScriptRoutingfallbackFixtures(t *testing.T) {
	path := os.Getenv("TALA_ROUTINGFALLBACK_FIXTURES")
	if path == "" {
		t.Skip()
	}
	out := []any{}
	for trial := 0; trial < 200; trial++ {
		g := layoutgraph.NewGraph()
		a := g.AddNode(layoutgraph.NewNode(1, 80, 60))
		a.TopLeft = geo.NewPoint(0, 0)
		b := g.AddNode(layoutgraph.NewNode(2, 70, 50))
		b.TopLeft = geo.NewPoint(float64(200+trial%4*50), float64(trial%6*30))
		e := g.Connect(a, b)
		e.Points = []*geo.Point{geo.NewPoint(80, 30), geo.NewPoint(130, 30), geo.NewPoint(130, b.TopLeft.Y+25), geo.NewPoint(b.TopLeft.X, b.TopLeft.Y+25)}
		if trial%3 == 0 {
			c := g.AddNode(layoutgraph.NewNode(3, 30, 30))
			c.TopLeft = geo.NewPoint(140, float64(trial%5*40-50))
		}
		if trial%7 == 0 {
			e.TargetArrowheadLabel = &layoutgraph.Label{Text: "arrow", Width: 20, Height: 10}
		}
		if trial%11 == 0 {
			e.FromTableColumnIndex = new(int)
		}
		if trial >= 160 {
			c := g.AddNode(layoutgraph.NewNode(10, 40, 40))
			c.TopLeft = geo.NewPoint(20+float64(trial%4)*30, 200)
			d := g.AddNode(layoutgraph.NewNode(11, 40, 40))
			d.TopLeft = geo.NewPoint(280, 200+float64(trial%3)*30)
			g.Connect(a, c).Points = []*geo.Point{geo.NewPoint(40, 60), geo.NewPoint(c.TopLeft.X+20, c.TopLeft.Y)}
			g.Connect(c, d).Points = []*geo.Point{geo.NewPoint(c.TopLeft.X+40, c.TopLeft.Y+20), geo.NewPoint(d.TopLeft.X, d.TopLeft.Y+20)}
			g.Connect(d, b).Points = []*geo.Point{geo.NewPoint(d.TopLeft.X+20, d.TopLeft.Y), geo.NewPoint(b.TopLeft.X+35, b.TopLeft.Y+50)}
		}
		ctx := &fallbackCountingContext{Context: context.Background()}
		err := StraightEdgesFallback(ctx, g)
		msg := ""
		if err != nil {
			msg = err.Error()
		}
		routes := make([][]*geo.Point, 0, len(g.Edges))
		for _, edge := range g.Edges {
			routes = append(routes, edge.Points)
		}
		out = append(out, map[string]any{"trial": trial, "error": msg, "route": e.Points, "routes": routes, "crossing": g.RoutingCosts(), "checks": ctx.checks})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
}
