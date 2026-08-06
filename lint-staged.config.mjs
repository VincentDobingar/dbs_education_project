import path from "node:path";

// ESLint's flat config is resolved from the current working directory, and
// each workspace has its own eslint.config.js (different tsconfig per
// package). So staged files are grouped by workspace and eslint runs with
// `pnpm --dir <workspace>`, matching exactly what `pnpm lint` runs in CI.
function groupByWorkspace(files) {
  const groups = new Map();

  for (const file of files) {
    const relative = path.relative(process.cwd(), file).replaceAll("\\", "/");
    const match = /^(apps|packages)\/([^/]+)\//.exec(relative);
    const workspaceDir = match ? `${match[1]}/${match[2]}` : null;

    if (!workspaceDir) continue; // root-level config files: not eslint-checked pre-commit

    const list = groups.get(workspaceDir) ?? [];
    list.push(path.relative(path.resolve(workspaceDir), file));
    groups.set(workspaceDir, list);
  }

  return groups;
}

export default {
  "*.{ts,tsx,js,jsx}": (files) => {
    const groups = groupByWorkspace(files);

    return [...groups.entries()].map(
      ([workspaceDir, relativeFiles]) =>
        `pnpm --dir ${workspaceDir} exec eslint --fix ${relativeFiles.map((f) => JSON.stringify(f)).join(" ")}`,
    );
  },
  "*.{ts,tsx,js,jsx,json,md}": "prettier --write",
};
