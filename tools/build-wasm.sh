#!/bin/sh
set -eu
: "${WASI_SDK_PATH:?Set WASI_SDK_PATH to the unpacked official WASI SDK 34 directory}"
cd "$(dirname "$0")/.."
"$WASI_SDK_PATH/bin/clang" src/duel.c -O3 -nostartfiles -Wl,--no-entry -Wl,--export-memory -Wl,-z,stack-size=2097152 -o src/duel.wasm
