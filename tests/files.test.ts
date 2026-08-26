// What the file layer decides before anything is stored: which types are
// allowed in, how big they may be, and what the page should render. All of it
// is read at upload time, when getting it wrong means either rejecting a deck
// someone needs or accepting a file the Repo can't hold.

import { describe, it, expect } from "vitest";
import { ALLOWED_UPLOAD_TYPES, MAX_DB_UPLOAD_BYTES, MAX_UPLOAD_BYTES, isAllowedType, mediaKind } from "@/lib/files";

describe("what the Repo accepts", () => {
  it("takes the formats the work actually arrives in", () => {
    for (const type of [
      "video/mp4",
      "video/quicktime",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "image/jpeg",
      "audio/mpeg",
    ]) {
      expect(isAllowedType(type), type).toBe(true);
    }
  });

  it("turns away an executable however it is labelled", () => {
    for (const type of ["application/x-msdownload", "application/x-sh", "text/html"]) {
      expect(isAllowedType(type), type).toBe(false);
    }
  });

  it("lets through a file the browser could not identify", () => {
    // Browsers report an empty type for plenty of ordinary files; rejecting on
    // that alone would block real uploads for no gain.
    expect(isAllowedType("")).toBe(true);
    expect(isAllowedType(null)).toBe(true);
  });

  it("keeps the database fallback far below the blob limit", () => {
    expect(MAX_DB_UPLOAD_BYTES).toBeLessThan(MAX_UPLOAD_BYTES / 100);
    // Int columns stop at ~2.1GB; the cap has to stay under that.
    expect(MAX_UPLOAD_BYTES).toBeLessThan(2_147_483_647);
  });

  it("offers every allowed type to the upload token, with no duplicates", () => {
    expect(new Set(ALLOWED_UPLOAD_TYPES).size).toBe(ALLOWED_UPLOAD_TYPES.length);
  });
});

describe("how a file gets rendered", () => {
  it("reads the content type first", () => {
    expect(mediaKind("video/mp4")).toBe("video");
    expect(mediaKind("audio/mpeg")).toBe("audio");
    expect(mediaKind("application/pdf")).toBe("pdf");
    expect(mediaKind("image/png")).toBe("image");
    expect(mediaKind("application/zip")).toBe("file");
  });

  it("falls back to the filename, because uploads often arrive without one", () => {
    expect(mediaKind(null, "rough-cut-v3.mp4")).toBe("video");
    expect(mediaKind("", "SIZZLE.MOV")).toBe("video");
    expect(mediaKind(undefined, "deck.pdf")).toBe("pdf");
    expect(mediaKind("", "notes.txt")).toBe("file");
  });

  it("does not mistake a name for a type when the type is known", () => {
    // A .mp4 served as a PDF is a PDF; trusting the extension over the
    // declared type is how a file plays as the wrong thing.
    expect(mediaKind("application/pdf", "trailer.mp4")).toBe("pdf");
  });
});
