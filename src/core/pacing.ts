import type { DelayRange, RuntimeConfig } from "./config.js";

function randomInt([min, max]: DelayRange): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type Pacing = {
  beforeAction(): Promise<void>;
  betweenSteps(): Promise<void>;
  afterNavigation(): Promise<void>;
  typingDelay(): number;
};

export function createPacing(runtime: RuntimeConfig): Pacing {
  return {
    beforeAction: () => sleep(randomInt(runtime.delays.beforeActionMs)),
    betweenSteps: () => sleep(randomInt(runtime.delays.betweenStepsMs)),
    afterNavigation: () => sleep(randomInt(runtime.delays.afterNavigationMs)),
    typingDelay: () => randomInt(runtime.delays.typingDelayMs)
  };
}
