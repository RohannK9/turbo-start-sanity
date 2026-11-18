import { beforeEach, describe, expect, it, vi } from "vitest";

const { createIfNotExists, rateLimit, logError } = vi.hoisted(() => ({
  createIfNotExists: vi.fn(),
  rateLimit: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@workspace/env/server", () => ({
  env: { SANITY_API_WRITE_TOKEN: "test-token" },
}));
vi.mock("@workspace/sanity/client", () => ({
  client: { withConfig: () => ({ createIfNotExists }) },
}));
vi.mock("@/lib/newsletter-rate-limit", () => ({
  enforceNewsletterRateLimit: rateLimit,
}));
vi.mock("@workspace/logger", () => ({
  Logger: class {
    error = logError;
  },
}));

const { POST } = await import("./route");
const url = "https://example.com/api/newsletter";
const json = (body: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  createIfNotExists.mockResolvedValue({});
  rateLimit.mockResolvedValue(null);
});

describe("newsletter HTTP boundary", () => {
  it.each([
    null,
    [],
    {},
    { email: 123 },
    { email: ["a@example.com"] },
    { email: "invalid" },
  ])("rejects invalid email input without writing: %j", async (body) => {
    expect((await POST(json(body))).status).toBe(400);
    expect(createIfNotExists).not.toHaveBeenCalled();
  });

  it("accepts URL-encoded forms and normalizes email", async () => {
    const response = await POST(
      new Request(url, {
        method: "POST",
        body: new URLSearchParams({ email: "  Person@Example.com  " }),
      })
    );
    expect(response.status).toBe(200);
    expect(createIfNotExists).toHaveBeenCalledWith(
      expect.objectContaining({
        _type: "subscriber",
        email: "person@example.com",
        signedUpAt: expect.any(String),
      })
    );
  });

  it("accepts the multipart FormData sent by the website", async () => {
    const body = new FormData();
    body.set("email", "person@example.com");
    expect(
      (await POST(new Request(url, { method: "POST", body }))).status
    ).toBe(200);
  });

  it("rejects ambiguous repeated email fields", async () => {
    const body = new URLSearchParams();
    body.append("email", "a@example.com");
    body.append("email", "b@example.com");
    expect(
      (await POST(new Request(url, { method: "POST", body }))).status
    ).toBe(400);
    expect(createIfNotExists).not.toHaveBeenCalled();
  });

  it("rejects file uploads in the email field", async () => {
    const body = new FormData();
    body.set("email", new Blob(["person@example.com"]), "email.txt");
    expect(
      (await POST(new Request(url, { method: "POST", body }))).status
    ).toBe(400);
    expect(createIfNotExists).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await POST(
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    );
    expect(response.status).toBe(400);
  });

  it("bounds actual body bytes even without Content-Length", async () => {
    const request = json({ email: "x".repeat(4096) });
    expect(request.headers.has("content-length")).toBe(false);
    expect((await POST(request)).status).toBe(413);
    expect(createIfNotExists).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin browser POST", async () => {
    const request = json({ email: "person@example.com" });
    request.headers.set("origin", "https://unrelated.example");
    expect((await POST(request)).status).toBe(403);
    expect(createIfNotExists).not.toHaveBeenCalled();
  });

  it("rejects unsupported content types", async () => {
    expect(
      (
        await POST(
          new Request(url, { method: "POST", body: "email=a@example.com" })
        )
      ).status
    ).toBe(415);
  });

  it("uses one non-root ID for concurrent normalized duplicates", async () => {
    const responses = await Promise.all([
      POST(json({ email: " Person@Example.com " })),
      POST(json({ email: "person@example.com" })),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const ids = createIfNotExists.mock.calls.map(([document]) => document._id);
    expect(ids[0]).toMatch(/^subscriber\.[a-f0-9]{64}$/);
    expect(new Set(ids).size).toBe(1);
    expect(await responses[0]?.json()).toEqual(await responses[1]?.json());
  });

  it.each([429, 503])(
    "does not write when rate limiting returns %i",
    async (status) => {
      rateLimit.mockResolvedValue(
        Response.json({ message: "Unavailable" }, { status })
      );
      expect((await POST(json({ email: "person@example.com" }))).status).toBe(
        status
      );
      expect(createIfNotExists).not.toHaveBeenCalled();
    }
  );

  it("does not expose Sanity errors or email addresses in responses or logs", async () => {
    createIfNotExists.mockRejectedValue(
      new Error("secret-token person@example.com")
    );
    const response = await POST(json({ email: "person@example.com" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toMatch(/secret-token|person@example/);
    expect(JSON.stringify(logError.mock.calls)).not.toMatch(
      /secret-token|person@example/
    );
  });
});
