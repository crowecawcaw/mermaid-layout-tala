// Copyright Terrastruct Inc. and contributors. SPDX-License-Identifier: MPL-2.0
// Copy into the pinned D2 internal/hierarchy package to regenerate the fixture.
package hierarchy

import (
 "context"
 "encoding/json"
 "fmt"
 "math/rand"
 "os"
 "sort"
 "testing"

 "github.com/d2lang/d2/d2layouts/d2talalayout/internal/layoutgraph"
 "github.com/d2lang/d2/lib/geo"
)

type parityNode struct { ID string `json:"id"`; Level int `json:"level"`; Width float64 `json:"width"`; X float64 `json:"x"`; Dummy bool `json:"dummy"`; LeftPad float64 `json:"leftPad"`; RightPad float64 `json:"rightPad"`; Degree int `json:"degree"` }
type parityFixture struct { Name string `json:"name"`; Nodes []parityNode `json:"nodes"`; Edges [][2]string `json:"edges"`; Order [][]string `json:"order"`; X map[string]float64 `json:"x"` }

func TestExportTypeScriptHierarchyFixtures(t *testing.T) {
 path := os.Getenv("TALA_HIERARCHY_FIXTURES")
 if path == "" { t.Skip("set TALA_HIERARCHY_FIXTURES") }
 rng := rand.New(rand.NewSource(42))
 fixtures := []parityFixture{}
 for trial := 0; trial < 120; trial++ {
  g := layoutgraph.NewGraph()
  levels := 2 + rng.Intn(5)
  byLevel := map[int][]*placementNode{}
  names := map[*placementNode]string{}
  all := []*placementNode{}
  f := parityFixture{Name: fmt.Sprintf("go-seed-42-%03d", trial), X: map[string]float64{}}
  for level := 0; level < levels; level++ {
   count := 1 + rng.Intn(5)
   for i:=0; i<count; i++ {
    id:=len(all)+1
    gn:=g.AddNode(layoutgraph.NewNode(layoutgraph.EntityID(id), float64(20+rng.Intn(100)), 40))
    gn.TopLeft = geo.NewPoint(float64(i*200),float64(level*100))
    pn:=newPlacementNode(level,gn)
    names[pn]=fmt.Sprintf("n%d",id)
    all=append(all,pn)
    byLevel[level]=append(byLevel[level],pn)
   }
  }
  for level:=1;level<levels;level++ {
   for _, below:=range byLevel[level] { for _, above:=range byLevel[level-1] {
    if rng.Intn(3)==0 { below.connect(above); g.Connect(above.graphNode,below.graphNode); f.Edges=append(f.Edges,[2]string{names[above],names[below]}) }
   } }
  }
  if trial%3==0 && levels>2 {
   above,below:=byLevel[0][0],byLevel[levels-1][0]
   below.connect(above);g.Connect(above.graphNode,below.graphNode)
  }
  initializeRanks(byLevel)
  dummies:=breakLongConnections(all,byLevel)
  for i,dummy:=range dummies { dummy.graphNode.TopLeft=geo.NewPoint(0,0);names[dummy]=fmt.Sprintf("d%d",i);all=append(all,dummy) }
  f.Edges=nil
  for _,pn:=range all {
   belows:=[]*placementNode{};for below:=range pn.belows { belows=append(belows,below) }
   sort.Slice(belows,func(i,j int)bool{return names[belows[i]]<names[belows[j]]})
   for _,below:=range belows { f.Edges=append(f.Edges,[2]string{names[pn],names[below]}) }
  }
  for _, pn:=range all { f.Nodes=append(f.Nodes,parityNode{ID:names[pn],Level:pn.level,Width:pn.graphNode.Width,X:pn.graphNode.TopLeft.X,Degree:pn.degree(),Dummy:pn.isDummy}) }
  minimizeHierarchyCrossings(byLevel)
  if err:=globalSifting(byLevel);err!=nil { t.Fatal(err) }
  // Seed the exact ordered initial geometry consumed by Brandes-Kopf.
  for level:=0;level<levels;level++ {
   order:=[]string{}
   for i,pn:=range byLevel[level] { pn.graphNode.TopLeft.X=float64(i*200);order=append(order,names[pn]) }
   f.Order=append(f.Order,order)
  }
  if err:=alignHierarchy(context.Background(),g,byLevel);err!=nil { t.Fatal(err) }
  for _,pn:=range all { f.X[names[pn]]=pn.graphNode.TopLeft.X }
  fixtures=append(fixtures,f)
 }
 data,err:=json.MarshalIndent(fixtures,"","  ");if err!=nil { t.Fatal(err) }
 if err=os.WriteFile(path,append(data,'\n'),0644);err!=nil {t.Fatal(err)}
}
