import { describe, expect, it } from "vitest";
import {
  HttpError,
  parseIntakeRequest,
  toCliffordInput
} from "../../app/server.js";

describe("server request boundary", () => {
  it("rejects malformed file base64 before running the pipeline", () => {
    const request = parseIntakeRequest({
      input: {
        kind: "file",
        filename: "alarm.csv",
        bytes_base64: "not base64!"
      }
    });

    expect(() => toCliffordInput(request.input)).toThrowError(HttpError);
    try {
      toCliffordInput(request.input);
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(400);
    }
  });

  it("decodes valid unpadded base64 upload bodies", () => {
    const request = parseIntakeRequest({
      input: {
        kind: "file",
        filename: "note.txt",
        bytes_base64: "SGVsbG8"
      }
    });

    const input = toCliffordInput(request.input);

    expect(input.kind).toBe("file");
    if (input.kind !== "file") {
      throw new Error("Expected file input");
    }
    expect(input.filename).toBe("note.txt");
    expect(Buffer.from(input.bytes).toString("utf8")).toBe("Hello");
  });
});
