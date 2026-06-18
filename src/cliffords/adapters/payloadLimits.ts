export class PayloadLimitError extends Error {
  public constructor(
    public readonly reason_code:
      | "JSON_DEPTH_EXCEEDED"
      | "RECORD_LIMIT_EXCEEDED",
    message: string
  ) {
    super(message);
    this.name = "PayloadLimitError";
  }
}

export function measurePayloadDepth(value: unknown): number {
  if (!value || typeof value !== "object") {
    return 0;
  }
  const seen = new WeakSet<object>();
  const queue: Array<{ value: object; depth: number }> = [
    { value, depth: 1 }
  ];
  let queueIndex = 0;
  let maximum = 1;
  while (queueIndex < queue.length) {
    const current = queue[queueIndex++]!;
    if (seen.has(current.value)) {
      continue;
    }
    seen.add(current.value);
    maximum = Math.max(maximum, current.depth);
    for (const child of Object.values(current.value)) {
      if (child && typeof child === "object") {
        queue.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
  return maximum;
}

export function enforcePayloadDepth(
  value: unknown,
  maximumDepth: number
): void {
  const depth = measurePayloadDepth(value);
  if (depth > maximumDepth) {
    throw new PayloadLimitError(
      "JSON_DEPTH_EXCEEDED",
      `JSON nesting depth ${depth} exceeds configured maximum ${maximumDepth}`
    );
  }
}
