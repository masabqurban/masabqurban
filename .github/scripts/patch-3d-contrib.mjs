// Patches yoshi389111/github-profile-3d-contrib (dist/index.js, pinned version)
// 1. Hides the fork counter next to the star count.
// 2. Leaves commits to the profile repo (<user>/<user>: README and config edits)
//    out of the language slices, so they are counted as "other" in the pie.
//
// Usage: node .github/scripts/patch-3d-contrib.mjs <path/to/dist/index.js>

import { readFile, writeFile } from "node:fs/promises";

const file = process.argv[2];
let src = await readFile(file, "utf8");

const patches = [
  [".attr('d', 'M5 3.25a", ".attr('display', 'none').attr('d', 'M5 3.25a"],
  [".text(util.toScale(userInfo.totalForkCount))", ".text('').attr('display', 'none')"],
  [/repository \{(\s+)primaryLanguage \{/, "repository {$1nameWithOwner$1primaryLanguage {"],
  [
    ".filter((repo) => repo.repository.primaryLanguage)",
    ".filter((repo) => repo.repository.primaryLanguage && repo.repository.nameWithOwner.toLowerCase() !== `${process.env.USERNAME}/${process.env.USERNAME}`.toLowerCase())",
  ],
];

for (const [from, to] of patches) {
  const count = typeof from === "string" ? src.split(from).length - 1 : (src.match(new RegExp(from, "g")) || []).length;
  if (count !== 1) throw new Error(`expected exactly one match for: ${from} (found ${count})`);
  src = src.replace(from, to);
}
await writeFile(file, src);
console.log(`patched ${patches.length} spots in ${file}`);
