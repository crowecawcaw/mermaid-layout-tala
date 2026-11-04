// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package geo

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"os"
	"reflect"
	"testing"
)

// JSON has no nonfinite floats. Preserve them explicitly in the oracle.
func fixtureValue(v any) any {
	if v == nil {
		return nil
	}
	r := reflect.ValueOf(v)
	if r.Kind() == reflect.Pointer {
		if r.IsNil() {
			return nil
		}
		return fixtureValue(r.Elem().Interface())
	}
	if r.Kind() == reflect.Float64 {
		f := r.Float()
		if math.IsNaN(f) {
			return "NaN"
		}
		if math.IsInf(f, 1) {
			return "+Inf"
		}
		if math.IsInf(f, -1) {
			return "-Inf"
		}
		return f
	}
	if r.Kind() == reflect.Slice || r.Kind() == reflect.Array {
		out := []any{}
		for i := 0; i < r.Len(); i++ {
			out = append(out, fixtureValue(r.Index(i).Interface()))
		}
		return out
	}
	if r.Kind() == reflect.Struct {
		out := map[string]any{}
		for i := 0; i < r.NumField(); i++ {
			name := r.Type().Field(i).Name
			if tag := r.Type().Field(i).Tag.Get("json"); tag != "" {
				name = tag
			}
			out[name] = fixtureValue(r.Field(i).Interface())
		}
		return out
	}
	if r.Kind() == reflect.Map {
		out := map[string]any{}
		iter := r.MapRange()
		for iter.Next() {
			out[iter.Key().String()] = fixtureValue(iter.Value().Interface())
		}
		return out
	}
	return v
}
func TestExportTypeScriptGeoFixtures(t *testing.T) {
	path := os.Getenv("TALA_GEO_FIXTURES")
	if path == "" {
		t.Skip("set TALA_GEO_FIXTURES")
	}
	rng := rand.New(rand.NewSource(31))
	out := []any{}
	for trial := 0; trial < 400; trial++ {
		points := []*Point{}
		for j := 0; j < 6; j++ {
			points = append(points, NewPoint(float64(rng.Intn(401)-200)/4, float64(rng.Intn(401)-200)/4))
		}
		if trial%10 == 0 {
			points[1] = points[0].Copy()
		}
		if trial%10 == 1 {
			points[1].X = points[0].X
		}
		if trial%10 == 2 {
			points[1].Y = points[0].Y
		}
		a, b, c, d := points[0], points[1], points[2], points[3]
		s := NewSegment(a, b)
		other := NewSegment(c, d)
		box := NewBox(points[4], float64(rng.Intn(100)), float64(rng.Intn(100)))
		ellipse := NewEllipse(points[5], box.Width/2, box.Height/2)
		curve := NewBezierCurve(points[:4])
		route := Route(points)
		distance := float64(rng.Intn(501) - 100)
		at, index := route.GetPointAtDistance(distance)
		tl, br := route.GetBoundingBox()
		floor, ceil := s.GetBounds([]*Segment{other, NewSegment(points[4], points[5])}, 3.5)
		vector := a.VectorTo(b)
		normalX, normalY := GetUnitNormalVector(a.X, a.Y, b.X, b.Y)
		f32 := a.Copy()
		f32.TruncateFloat32()
		trunc := a.Copy()
		trunc.TruncateDecimals()
		expected := map[string]any{
			"orientation": a.GetOrientation(b), "compare": a.Compare(b), "distance": a.DistanceToLine(c, d), "onSegment": a.OnOrthogonalSegment(c, d), "intersection": IntersectionPoint(a, b, c, d), "median": Points(points).GetMedian(), "vector": []float64(vector), "unit": []float64(vector.Unit()), "radians": vector.Radians(), "degrees": vector.Degrees(), "addLength": []float64(vector.AddLength(7.5)), "normal": []float64{normalX, normalY}, "float32": f32, "truncate": trunc,
			"segmentOverlaps": s.Overlaps(*other, true, 3.5), "segmentOverlapsVertical": s.Overlaps(*other, false, 3.5), "segmentBounds": []float64{floor, ceil}, "segmentLength": s.Length(), "boxIntersects": box.Intersects(*s, 3.5), "boxIntersections": box.Intersections(*s), "boxContains": box.Contains(a), "boxOverlaps": box.Overlaps(*NewBox(c, 15, 20)), "ellipse": ellipse.Intersections(*s), "curveAt": curve.At(0.37), "curveIntersections": curve.Intersections(*NewSegment(points[4], points[5])), "routeLength": route.Length(), "routeAt": at, "routeIndex": index, "routeBounds": []*Point{tl, br},
		}
		out = append(out, map[string]any{"name": fmt.Sprintf("geo-%03d", trial), "points": points, "width": box.Width, "height": box.Height, "distance": distance, "expected": fixtureValue(expected)})
	}
	data, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatal(err)
	}
}
