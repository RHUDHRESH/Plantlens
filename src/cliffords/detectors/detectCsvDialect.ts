export type CsvDialect = {
  delimiter: "," | ";" | "\t" | "|";
  quote: '"';
};

const DELIMITERS: CsvDialect["delimiter"][] = [",", ";", "\t", "|"];

function countDelimiter(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      count += 1;
    }
  }
  return count;
}

export function detectCsvDialect(sample: string): CsvDialect {
  const lines = sample
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 10);
  let bestDelimiter: CsvDialect["delimiter"] = ",";
  let bestScore = -1;

  for (const delimiter of DELIMITERS) {
    const counts = lines.map((line) => countDelimiter(line, delimiter));
    const nonZero = counts.filter((count) => count > 0);
    const consistent =
      nonZero.length > 0 &&
      nonZero.every((count) => count === nonZero[0]);
    const score =
      nonZero.reduce((total, count) => total + count, 0) +
      (consistent ? 100 : 0);
    if (score > bestScore) {
      bestDelimiter = delimiter;
      bestScore = score;
    }
  }

  return { delimiter: bestDelimiter, quote: '"' };
}
