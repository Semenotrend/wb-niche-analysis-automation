import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { DoctorCheckResult, DoctorContext } from "../types.js";

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  );
}

export async function runProjectChecks(
  context: DoctorContext
): Promise<DoctorCheckResult[]> {
  const cwd = resolve(process.cwd());
  const expectedRoot = resolve(context.projectRoot);
  const results: DoctorCheckResult[] = [];

  results.push({
    id: "project.cwd",
    label: "Project root",
    status: cwd === expectedRoot ? "ok" : "fail",
    details:
      cwd === expectedRoot
        ? expectedRoot
        : `Current directory is ${cwd}; expected ${expectedRoot}.`,
    fixCommand: cwd === expectedRoot
      ? undefined
      : `cd "${expectedRoot}"`
  });

  for (const filePath of [
    "package.json",
    "config/scenario.json",
    "config/runtime.json"
  ]) {
    const absolutePath = join(context.projectRoot, filePath);
    const fileExists = await exists(absolutePath);

    results.push({
      id: `project.${filePath}`,
      label: filePath,
      status: fileExists ? "ok" : "fail",
      details: fileExists ? undefined : `Missing ${absolutePath}.`
    });
  }

  return results;
}
