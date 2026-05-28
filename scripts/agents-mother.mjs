#!/usr/bin/env node

if (!process.env.PRITHA_SUPPRESS_DEPRECATION_NOTE) {
  console.error("Deprecation notice: Agents Mother is now Pritha. Use `node scripts/pritha.mjs <command>`; this alias remains for compatibility.");
}

import "./agents-mother/index.mjs";
