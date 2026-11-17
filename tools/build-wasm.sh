#!/bin/sh
set -eu
: "${WASI_SDK_PATH:?Set WASI_SDK_PATH to the unpacked official WASI SDK 34 directory}"
cd "$(dirname "$0")/.."
snake_build_dir=$(mktemp -d "${TMPDIR:-/tmp}/hill-serpent-wasm.XXXXXX")
trap 'rm -rf "$snake_build_dir"' EXIT
# Keep the module's debug name stable so the binary is reproducible.
"$WASI_SDK_PATH/bin/clang" src/duel.c -O3 -nostartfiles -Wl,--no-entry -Wl,--export-memory -Wl,-z,stack-size=2097152 -o "$snake_build_dir/engine.wasm"
mv "$snake_build_dir/engine.wasm" src/duel.wasm
