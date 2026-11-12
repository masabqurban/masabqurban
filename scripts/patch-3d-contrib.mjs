// Patches yoshi389111/github-profile-3d-contrib (dist/index.js, pinned version)
// 1. Drop the grey "other" pie slice (commits in private repos whose languages
//    the default token cannot see), so only real language names are shown.
// 2. Hide the fork counter next to the star count.
//
// Usage: node scripts/patch-3d-contrib.mjs <path/to/dist/index.js>

import { readFile, writeFile } from "node:fs/promises";

const file = process.argv[2];
let src = await readFile(file, "utf8");

const patches = [
  ["if (0 < otherContributions) {", "if (false && 0 < otherContributions) {"],
  [".attr('d', 'M5 3.25a", ".attr('display', 'none').attr('d', 'M5 3.25a"],
  [".text(util.toScale(userInfo.totalForkCount))", ".text('').attr('display', 'none')"],
];

for (const [from, to] of patches) {
  const count = src.split(from).length - 1;
  if (count !== 1) throw new Error(`expected exactly one match for: ${from} (found ${count})`);
  src = src.replace(from, to);
}
await writeFile(file, src);
console.log(`patched ${patches.length} spots in ${file}`);
