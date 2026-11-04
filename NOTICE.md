This project contains a TypeScript port of the TALA DAG ranker from D2.

Upstream: https://github.com/d2lang/d2/tree/bf33790338b9854cb2a34418e69c17f9abf8de4b/d2layouts/d2talalayout

The upstream rank assignment code is copyright Terrastruct Inc. and the TALA
authors listed in UPSTREAM-AUTHORS.md. The port and this package are distributed
under the Mozilla Public License 2.0; see LICENSE. Mermaid is a peer dependency
and is not included in this package.

The deterministic random number generator in `src/random.ts` and its seed
table in `src/random-cooked.ts` are adapted from Go 1.27.1 `math/rand`,
copyright The Go Authors, under the BSD license reproduced in `LICENSE-GO`.
