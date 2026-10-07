import { stringify } from "yaml";
export function toYaml(value: unknown): string {
  try { return stringify(value, { indent: 2, lineWidth: 0 }).trimEnd() + "\n"; }
  catch { return JSON.stringify(value, null, 2) + "\n"; }
}
