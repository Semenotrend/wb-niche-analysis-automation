import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { DoctorCheckResult, DoctorContext } from "../types.js";

const execFileAsync = promisify(execFile);

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  );
}

async function checkImport(packageName: string): Promise<DoctorCheckResult> {
  try {
    await import(packageName);

    return {
      id: `package.${packageName}`,
      label: `Package ${packageName}`,
      status: "ok"
    };
  } catch (error) {
    return {
      id: `package.${packageName}`,
      label: `Package ${packageName}`,
      status: "fail",
      details: error instanceof Error ? error.message : String(error),
      fixCommand: "pnpm install"
    };
  }
}

export async function runPackageChecks(
  context: DoctorContext
): Promise<DoctorCheckResult[]> {
  const results: DoctorCheckResult[] = [
    {
      id: "package.node",
      label: "Node.js",
      status: "ok",
      details: process.version
    }
  ];

  try {
    const { stdout } = await execFileAsync("pnpm", ["--version"], {
      cwd: context.projectRoot
    });

    results.push({
      id: "package.pnpm",
      label: "pnpm",
      status: "ok",
      details: stdout.trim()
    });
  } catch (error) {
    results.push({
      id: "package.pnpm",
      label: "pnpm",
      status: "fail",
      details: error instanceof Error ? error.message : String(error),
      fixCommand: "corepack enable"
    });
  }

  const nodeModulesExists = await exists(join(context.projectRoot, "node_modules"));
  results.push({
    id: "package.node_modules",
    label: "node_modules",
    status: nodeModulesExists ? "ok" : "fail",
    details: nodeModulesExists ? undefined : "Dependencies are not installed.",
    fixCommand: nodeModulesExists ? undefined : "pnpm install"
  });

  results.push(
    await checkImport("playwright"),
    await checkImport("pg")
  );

  return results;
}
