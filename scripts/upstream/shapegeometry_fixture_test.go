// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
package shape
import("encoding/json";"fmt";"math/rand";"os";"testing";"github.com/d2lang/d2/lib/geo";"github.com/d2lang/d2/lib/svg")
func TestExportTypeScriptShapegeometryFixtures(t *testing.T){
 path:=os.Getenv("TALA_SHAPEGEOMETRY_FIXTURES");if path==""{t.Skip("set TALA_SHAPEGEOMETRY_FIXTURES")};rng:=rand.New(rand.NewSource(101));out:=[]any{}
 names:=[]string{"","Square","RealSquare","Parallelogram","Document","Cylinder","Queue","Page","Package","Step","Callout","StoredData","Person","C4Person","Diamond","Oval","Circle","Hexagon","Cloud","Table","Class","Text","Code","Image"}
 for _,name:=range names{for trial:=0;trial<20;trial++{
  box:=geo.NewBox(geo.NewPoint(-15.25,11.75),float64(20+rng.Intn(600))/2,float64(20+rng.Intn(600))/2);s:=NewShape(name,box);width,height:=float64(1+rng.Intn(100)),float64(1+rng.Intn(100));px,py:=s.GetDefaultPadding();fitW,fitH:=s.GetDimensionsToFit(width,height,px,py);inner:=s.GetInnerBox().Copy();content:=s.GetInnerBoxForContent(width,height);inside:=s.GetInsidePlacement(width,height,px,py)
  s.SetInnerBoxAspectRatio(float64(trial%3+1)/2);innerWithAspect:=s.GetInnerBox().Copy();pathData:=s.GetSVGPathData();if pathData==nil{pathData=[]string{}};commands:=GetPathCommands(s);if commands==nil{commands=[][]svg.PathCommand{}}
  intersections:=[]any{};segments:=[][2]*geo.Point{};for j:=0;j<5;j++{a:=geo.NewPoint(box.TopLeft.X-30,float64(j)*box.Height/4+box.TopLeft.Y);b:=geo.NewPoint(box.TopLeft.X+box.Width+30,a.Y);segments=append(segments,[2]*geo.Point{a,b});points:=[]*geo.Point{};for _,part:=range s.Perimeter(){points=append(points,part.Intersections(geo.Segment{Start:a,End:b})...)};intersections=append(intersections,points)}
  border:=geo.NewPoint(box.TopLeft.X,box.TopLeft.Y+box.Height/2);prev:=geo.NewPoint(border.X-40,border.Y);trace:=TraceToShapeBorder(s,border,prev)
  out=append(out,map[string]any{"name":fmt.Sprintf("shapegeometry-%s-%02d",name,trial),"type":name,"box":box,"width":width,"height":height,"aspect":float64(trial%3+1)/2,"segments":segments,"expected":map[string]any{"type":s.GetType(),"square":s.AspectRatio1(),"rectangular":s.IsRectangular(),"inner":inner,"content":content,"inside":inside,"padding":[]float64{px,py},"fit":[]float64{fitW,fitH},"innerWithAspect":innerWithAspect,"paths":pathData,"commands":commands,"intersections":intersections,"trace":trace}})
 }}
 data,err:=json.Marshal(out);if err!=nil{t.Fatal(err)};if err=os.WriteFile(path,append(data,'\n'),0644);err!=nil{t.Fatal(err)}
}
