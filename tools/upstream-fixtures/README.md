# Placement cost differential fixtures

`main.go` calls the pinned upstream D2 TALA implementation to record ordinary
node placement costs. The browser and published package do not use this harness.

Source revision: `bf33790338b9854cb2a34418e69c17f9abf8de4b`.
Place `main.go` at
`d2layouts/d2talalayout/cmd/ts-fixtures/main.go` within a checkout of that
revision. From the D2 repository root, build the command and run it against
the input files in this directory:

```powershell
go build -o tala-ts-fixtures.exe ./d2layouts/d2talalayout/cmd/ts-fixtures
# Pass cases.json or random-cases.json on stdin and save stdout as the
# corresponding expected.json or random-expected.json file.
```

Run `node random-cases.mjs` to reproduce the varied inputs. The Go program
records the sizeless and sized `NodeEdgeLength` results, `NodeSymmetry`, cell
size, and the halved turn cost seen by sized placement. The TypeScript test
compares those results to the port.
