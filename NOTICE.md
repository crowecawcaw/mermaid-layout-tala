This project contains a TypeScript port of the TALA DAG ranker from D2.

Upstream: https://github.com/d2lang/d2/tree/bf33790338b9854cb2a34418e69c17f9abf8de4b/d2layouts/d2talalayout

The upstream rank assignment code is copyright Terrastruct Inc. and the TALA
authors listed in UPSTREAM-AUTHORS.md. The port and this package are distributed
under the Mozilla Public License 2.0; see LICENSE. Mermaid is a peer dependency
and is not included in this package.

The Go-compatible random source in src/tala/go-rng.ts and seed table in
src/tala/go-rng-cooked.ts are derived from Go 1.25.1 math/rand, copyright
The Go Authors, under the BSD-style license reproduced in GO-LICENSE.
