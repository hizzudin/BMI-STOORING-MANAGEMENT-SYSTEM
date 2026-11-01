/** Role display helpers. `Warehouse_Manager` → `Warehouse Manager`. */
export function humanizeRole(role: string): string {
  return role.replace(/_/g, ' ');
}
