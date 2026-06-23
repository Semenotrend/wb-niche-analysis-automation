import type { DoctorCheckResult } from "./types.js";

function labelForStatus(status: DoctorCheckResult["status"]): string {
  if (status === "ok") {
    return "OK  ";
  }

  if (status === "warn") {
    return "WARN";
  }

  return "FAIL";
}

export function formatDoctorResults(options: {
  storageDriver: string;
  results: DoctorCheckResult[];
}): string {
  const lines = [`Doctor check: ${options.storageDriver}`, ""];

  for (const result of options.results) {
    lines.push(`${labelForStatus(result.status)} ${result.label}`);

    if (result.details) {
      lines.push(`     ${result.details}`);
    }

    if (result.fixCommand) {
      lines.push(`     Fix: ${result.fixCommand}`);
    }
  }

  const hasFailures = options.results.some((result) => result.status === "fail");
  lines.push("", `Ready: ${hasFailures ? "no" : "yes"}`);

  return lines.join("\n");
}
