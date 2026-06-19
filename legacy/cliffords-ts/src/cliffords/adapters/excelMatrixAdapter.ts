import * as XLSX from "xlsx";
import {
  fingerprintColumns,
  normalizeTableRows
} from "../parsers/parseStructuredTable.js";
import type {
  AdapterContext,
  AdapterInput,
  AdapterResult
} from "./types.js";

function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

function columnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function sheetCellRange(
  sheetName: string,
  rowNumber: number,
  columnCount: number
): string {
  const escapedName = sheetName.replace(/'/g, "''");
  const lastColumn = columnName(Math.max(columnCount - 1, 0));
  return `'${escapedName}'!A${rowNumber}:${lastColumn}${rowNumber}`;
}

export function parseExcelMatrix(
  input: AdapterInput,
  context: AdapterContext
): AdapterResult {
  const workbook = XLSX.read(input.bytes, {
    type: "array",
    cellDates: true,
    cellText: true
  });
  const records = workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return [];
    }
    const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false
    });
    const [headerValues, ...rowValues] = table;
    if (!headerValues || headerValues.length === 0) {
      return [];
    }
    const headers = headerValues.map(cellText);
    const rows = rowValues.map((row) => row.map(cellText));
    const columnMap = fingerprintColumns(headers, rows);
    if (Object.keys(columnMap).length === 0) {
      return [];
    }
    return normalizeTableRows(
      rows,
      columnMap,
      input.artifact,
      context
    ).map((record) => {
      const rowNumber = record.source_ref.row_number ?? 1;
      return {
        ...record,
        source_ref: {
          ...record.source_ref,
          cell_ref: sheetCellRange(
            sheetName,
            rowNumber,
            headers.length
          )
        },
        fields: {
          ...record.fields,
          source_sheet: sheetName
        }
      };
    });
  });
  return { records };
}
