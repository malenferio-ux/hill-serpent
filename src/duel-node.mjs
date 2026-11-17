import { readFile } from 'node:fs/promises';
import { makeEngine } from './duel-engine.mjs';
export const duelEngine = makeEngine(new WebAssembly.Module(await readFile(new URL('./duel.wasm', import.meta.url))));
