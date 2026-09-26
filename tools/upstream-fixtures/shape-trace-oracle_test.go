package routing

import (
  "encoding/json"
  "os"
  "testing"

  "github.com/d2lang/d2/lib/geo"
  "github.com/d2lang/d2/lib/shape"
)

type tsShapeTraceCase struct {
  Shape string `json:"shape"`
  TopLeft [2]float64 `json:"topLeft"`
  Width float64 `json:"width"`
  Height float64 `json:"height"`
  Rect [2]float64 `json:"rect"`
  Prev [2]float64 `json:"prev"`
  Trace [2]float64 `json:"trace"`
}

func TestTSShapeTraceFixtures(t *testing.T) {
  outputPath := os.Getenv("TALA_TS_SHAPE_TRACE_OUTPUT")
  if outputPath == "" { t.Skip("set fixture output path") }
  names := []string{
    shape.SQUARE_TYPE, shape.REAL_SQUARE_TYPE, shape.PARALLELOGRAM_TYPE,
    shape.DOCUMENT_TYPE, shape.CYLINDER_TYPE, shape.QUEUE_TYPE,
    shape.PAGE_TYPE, shape.PACKAGE_TYPE, shape.STEP_TYPE, shape.CALLOUT_TYPE,
    shape.STORED_DATA_TYPE, shape.PERSON_TYPE, shape.C4_PERSON_TYPE,
    shape.DIAMOND_TYPE, shape.OVAL_TYPE, shape.CIRCLE_TYPE,
    shape.HEXAGON_TYPE, shape.CLOUD_TYPE, shape.TABLE_TYPE,
    shape.CLASS_TYPE, shape.TEXT_TYPE, shape.CODE_TYPE, shape.IMAGE_TYPE,
  }
  sizes := [][2]float64{{120,80},{40,30},{200,160}}
  result := make([]tsShapeTraceCase,0,len(names)*len(sizes)*16)
  for _, name := range names {
    for _, size := range sizes {
      w,h := size[0],size[1]
      x,y := 10.,20.
      locations := [][2][2]float64{
        {{x+w/2,y},{x+w/2,y-50}}, {{x+w/6,y},{x+w/6-15,y-50}}, {{x+w*5/6,y},{x+w*5/6+15,y-50}},
        {{x,y+h/2},{x-50,y+h/2}}, {{x,y+h/5},{x-50,y+h/5-16}}, {{x,y+h*4/5},{x-50,y+h*4/5+16}},
        {{x+w,y+h/2},{x+w+50,y+h/2}}, {{x+w,y+h/5},{x+w+50,y+h/5-16}}, {{x+w,y+h*4/5},{x+w+50,y+h*4/5+16}},
        {{x+w/2,y+h},{x+w/2,y+h+50}}, {{x+w/6,y+h},{x+w/6-15,y+h+50}}, {{x+w*5/6,y+h},{x+w*5/6+15,y+h+50}},
        {{x,y},{x-40,y-40}}, {{x+w,y},{x+w+40,y-40}},
        {{x,y+h},{x-40,y+h+40}}, {{x+w,y+h},{x+w+40,y+h+40}},
      }
      box := geo.NewBox(geo.NewPoint(x,y),w,h)
      object := shape.NewShape(name,box)
      for _, location := range locations {
        rect,prev := location[0],location[1]
        point := shape.TraceToShapeBorder(object,geo.NewPoint(rect[0],rect[1]),geo.NewPoint(prev[0],prev[1]))
        result = append(result,tsShapeTraceCase{Shape:name,TopLeft:[2]float64{x,y},
          Width:w,Height:h,Rect:rect,Prev:prev,Trace:[2]float64{point.X,point.Y}})
      }
    }
  }
  encoded,err:=json.MarshalIndent(result,"","  ");if err!=nil{t.Fatal(err)}
  if err:=os.WriteFile(outputPath,append(encoded,'\n'),0644);err!=nil{t.Fatal(err)}
}
