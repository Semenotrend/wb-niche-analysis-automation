import type { StorageDriver } from "../storage.js";

export type DoctorStatus = "ok" | "warn" | "fail";

export type DoctorCheckResult = {
  id: string;
  label: string;
  status: DoctorStatus;
  details?: string;
  fixCommand?: string;
};

export type DoctorContext = {
  projectRoot: string;
  storageDriver: StorageDriver;
};

export type DoctorCheck = (
  context: DoctorContext
) => Promise<DoctorCheckResult[]>;
