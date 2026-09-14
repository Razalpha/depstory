#!/usr/bin/env node

import { run } from "../src/cli.mjs";

run(process.argv.slice(2)).catch((error) => {
  console.error(`depstory: ${error.message}`);
  process.exitCode = 1;
});
