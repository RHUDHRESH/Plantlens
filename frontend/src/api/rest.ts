/** REST read helpers (cold reads + model fetch). Law #1: GET only. */
export async function getModel(name: string): Promise<unknown> {
  const r = await fetch(`/api/models/${name}`);
  return r.json();
}

export async function getScreens(): Promise<unknown> {
  const r = await fetch("/api/screens");
  return r.json();
}

export async function getAudit(): Promise<unknown> {
  const r = await fetch("/api/audit");
  return r.json();
}
