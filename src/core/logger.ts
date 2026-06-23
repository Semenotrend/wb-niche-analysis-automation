import type { IncidentType } from "./incidents.js";

export type StepLogEvent = {
  index: number;
  total: number;
  name: string;
  status: "start" | "success" | "failed";
  durationMs?: number;
  incidentType?: IncidentType;
  errorMessage?: string;
};

function formatStepIndex(index: number, total: number): string {
  const width = String(total).length;
  return `${String(index).padStart(width, "0")}/${total}`;
}

export function logStepEvent(event: StepLogEvent): void {
  const prefix = `[${formatStepIndex(event.index, event.total)}] ${event.name}`;

  if (event.status === "start") {
    console.log(`${prefix} start`);
    return;
  }

  if (event.status === "success") {
    console.log(`${prefix} success ${event.durationMs ?? 0}ms`);
    return;
  }

  console.log(
    `${prefix} failed incident_type=${event.incidentType ?? "unknown_screen"} error="${event.errorMessage ?? ""}"`
  );
}
