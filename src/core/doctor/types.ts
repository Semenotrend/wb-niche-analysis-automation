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
};

export type DoctorCheck = (
  context: DoctorContext
) => Promise<DoctorCheckResult[]>;
