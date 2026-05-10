export const env = {
  PORT: parseInt(process.env["PORT"] ?? "3000", 10),
  LOG_LEVEL: (process.env["LOG_LEVEL"] ?? "info") as
    | "trace"
    | "debug"
    | "info"
    | "warn"
    | "error",
};
