import { classifyIncident } from "./incidents.js";
import type { IncidentType } from "./incidents.js";
import { logStepEvent } from "./logger.js";
import type { Pacing } from "./pacing.js";

export type StepRunner = {
  runStep<T>(name: string, step: () => Promise<T>): Promise<T>;
  getStepLogs(): StepExecutionLog[];
};

export type StepExecutionLog = {
  index: number;
  total: number;
  name: string;
  status: "success" | "failed";
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  incidentType?: IncidentType;
  errorMessage?: string;
};

export function createStepRunner(options: {
  totalSteps: number;
  pacing: Pacing;
}): StepRunner {
  let currentStep = 0;
  const stepLogs: StepExecutionLog[] = [];

  return {
    async runStep(name, step) {
      currentStep += 1;
      const index = currentStep;
      const startedAt = new Date();

      logStepEvent({
        index,
        total: options.totalSteps,
        name,
        status: "start"
      });

      try {
        await options.pacing.beforeAction();
        const result = await step();
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();

        stepLogs.push({
          index,
          total: options.totalSteps,
          name,
          status: "success",
          startedAt,
          finishedAt,
          durationMs
        });

        logStepEvent({
          index,
          total: options.totalSteps,
          name,
          status: "success",
          durationMs
        });

        await options.pacing.betweenSteps();
        return result;
      } catch (error) {
        const finishedAt = new Date();
        const durationMs = finishedAt.getTime() - startedAt.getTime();
        const incidentType = classifyIncident(error);
        const errorMessage = error instanceof Error ? error.message : String(error);

        stepLogs.push({
          index,
          total: options.totalSteps,
          name,
          status: "failed",
          startedAt,
          finishedAt,
          durationMs,
          incidentType,
          errorMessage
        });

        logStepEvent({
          index,
          total: options.totalSteps,
          name,
          status: "failed",
          durationMs,
          incidentType,
          errorMessage
        });

        throw error;
      }
    },
    getStepLogs() {
      return [...stepLogs];
    }
  };
}
