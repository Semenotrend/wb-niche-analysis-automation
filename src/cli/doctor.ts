import { formatDoctorResults } from "../core/doctor/format.js";
import { runDoctorChecks } from "../core/doctor/runner.js";

async function main(): Promise<void> {
  const report = await runDoctorChecks();
  console.log(formatDoctorResults(report));

  if (report.results.some((result) => result.status === "fail")) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("[doctor] Failed to run doctor checks.");
  console.error(error);
  process.exitCode = 1;
});
