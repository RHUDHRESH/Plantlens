export function normalizedSimilarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }
  const a = left.toUpperCase();
  const b = right.toUpperCase();
  const matrix = Array.from({ length: a.length + 1 }, () =>
    Array<number>(b.length + 1).fill(0)
  );
  for (let index = 0; index <= a.length; index += 1) {
    matrix[index]![0] = index;
  }
  for (let index = 0; index <= b.length; index += 1) {
    matrix[0]![index] = index;
  }
  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      matrix[row]![column] = Math.min(
        matrix[row - 1]![column]! + 1,
        matrix[row]![column - 1]! + 1,
        matrix[row - 1]![column - 1]! + cost
      );
    }
  }
  return 1 - matrix[a.length]![b.length]! / Math.max(a.length, b.length);
}
