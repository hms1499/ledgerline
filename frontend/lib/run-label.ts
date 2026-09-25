/**
 * The name a new run starts with: this month's payroll, in the local calendar.
 * It is editable, and prefilling it is safe: only the same list under the same
 * name is refused a second time, so a different list this month still pays.
 */
export function defaultRunLabel(now: Date): string {
  return `Payroll ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
