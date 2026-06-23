import { getStorageDriver } from "../storage.js";
import { PROJECT_ROOT } from "./paths.js";
import type { DoctorCheck, DoctorCheckResult } from "./types.js";
import { runAuthChecks } from "./checks/authChecks.js";
import { runBrowserChecks } from "./checks/browserChecks.js";
import { runConfigChecks } from "./checks/configChecks.js";
import { runPackageChecks } from "./checks/packageChecks.js";
import { runProjectChecks } from "./checks/projectChecks.js";
import { runStorageChecks } from "./checks/storageChecks.js";

const CHECKS: DoctorCheck[] = [
  runProjectChecks,
  runPackageChecks,
  runConfigChecks,
  runBrowserChecks,
  runAuthChecks,
  runStorageChecks
];

export async function runDoctorChecks(): Promise<{
  storageDriver: string;
  results: DoctorCheckResult[];
}> {
  const context = {
    projectRoot: PROJECT_ROOT,
    storageDriver: getStorageDriver()
  };
  const results: DoctorCheckResult[] = [];

  for (const check of CHECKS) {
    results.push(...await check(context));
  }

  return {
    storageDriver: context.storageDriver,
    results
  };
}
