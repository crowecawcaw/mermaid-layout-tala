// Copyright 2009 The Go Authors. All rights reserved. See LICENSE-GO.
package main

import (
	"encoding/json"
	"math/rand"
	"os"
	"strconv"
)

func main() {
	out := []any{}
	for _, seed := range []int64{0, 1, 2, 3, -1, -42, 9223372036854775807, -9223372036854775808} {
		rng := rand.New(rand.NewSource(seed))
		values := []string{}
		for i := 0; i < 1000; i++ {
			values = append(values, strconv.FormatInt(rng.Int63(), 10))
		}
		floats := []float64{}
		for i := 0; i < 30; i++ {
			floats = append(floats, rng.Float64())
		}
		ints := []int{}
		for i := 0; i < 30; i++ {
			ints = append(ints, rng.Intn(1001))
		}
		shuffled := make([]int, 100)
		for i := range shuffled {
			shuffled[i] = i
		}
		rng.Shuffle(len(shuffled), func(i, j int) { shuffled[i], shuffled[j] = shuffled[j], shuffled[i] })
		out = append(out, map[string]any{"seed": strconv.FormatInt(seed, 10), "int63": values, "float64": floats, "intn": ints, "shuffle": shuffled})
	}
	json.NewEncoder(os.Stdout).Encode(out)
}
