import { describe, expect, it } from "bun:test";
import { DataUnavailableError, dataUnavailable, noStoreOnServerError } from "./dataError";

describe("dataUnavailable", () => {
  it("names the read but keeps the database's reason out of the page", () => {
    // The thrown error is serialized into the HTML for hydration.
    const e = dataUnavailable("[calendar] query failed", {
      message: 'relation "media" column "raw_omdb" does not exist',
    });
    expect(e).toBeInstanceOf(DataUnavailableError);
    expect(e.name).toBe("DataUnavailableError");
    expect(e.message).toBe("[calendar] query failed");
  });
});

describe("noStoreOnServerError", () => {
  it("marks a 500 no-store", () => {
    const r = noStoreOnServerError(new Response("x", { status: 500 }));
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.status).toBe(500);
  });

  it("overrides a cache header a 503 arrived with", () => {
    const r = noStoreOnServerError(
      new Response("x", { status: 503, headers: { "cache-control": "public, s-maxage=21600" } }),
    );
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("leaves a cached 200 and a 404 alone", () => {
    const ok = noStoreOnServerError(
      new Response("x", { status: 200, headers: { "cache-control": "public, s-maxage=21600" } }),
    );
    expect(ok.headers.get("cache-control")).toBe("public, s-maxage=21600");
    expect(
      noStoreOnServerError(new Response("x", { status: 404 })).headers.get("cache-control"),
    ).toBeNull();
  });
});
