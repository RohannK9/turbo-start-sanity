import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    SANITY_ALGOLIA_WEBHOOK_SECRET: "test-secret-with-at-least-32-characters",
  },
  sync: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@workspace/env/server", () => ({ env: mocks.env }));
vi.mock("@/lib/sync-blog-search", () => ({ syncBlogSearch: mocks.sync }));
vi.mock("@workspace/logger", () => ({
  Logger: class {
    info() {}
    warn() {}
    error = mocks.error;
  },
}));
const { POST } = await import("./route");
const event = { _id: "post-1", _type: "blog" };
function request(
  body: unknown = event,
  auth = `Bearer ${mocks.env.SANITY_ALGOLIA_WEBHOOK_SECRET}`
) {
  return new Request("https://example.com/api/algolia/sync", {
    method: "POST",
    headers: { authorization: auth },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.SANITY_ALGOLIA_WEBHOOK_SECRET =
    "test-secret-with-at-least-32-characters";
  mocks.sync.mockResolvedValue({
    operation: "upsert",
    objectID: "post-1",
    taskID: 7,
  });
});
describe("webhook authentication and work bounds", () => {
  it.each([
    "",
    "Bearer wrong",
    "Bearer test-secret-with-at-least-32-characterz",
    "Basic test",
  ])("rejects invalid authorization %s", async (auth) => {
    expect((await POST(request(event, auth))).status).toBe(401);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("fails closed with no configured secret", async () => {
    const incoming = request();
    mocks.env.SANITY_ALGOLIA_WEBHOOK_SECRET = "";
    expect((await POST(incoming)).status).toBe(401);
  });
  it.each([null, [], {}, { _id: 123, _type: "blog" }])(
    "rejects malformed events %j",
    async (body) => {
      expect((await POST(request(body))).status).toBe(400);
      expect(mocks.sync).not.toHaveBeenCalled();
    }
  );
  it("bounds actual body bytes without Content-Length", async () => {
    expect(
      (await POST(request({ ...event, padding: "x".repeat(4096) }))).status
    ).toBe(413);
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it.each([
    { _id: "drafts.post-1", _type: "blog" },
    { _id: "versions.release.post-1", _type: "blog" },
    { _id: "author-1", _type: "author" },
  ])("ignores irrelevant events %j", async (body) => {
    expect(await (await POST(request(body))).json()).toEqual({ ignored: true });
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("acknowledges accepted indexing with the task ID", async () => {
    expect(await (await POST(request())).json()).toMatchObject({
      queued: true,
      taskID: 7,
    });
    expect(mocks.sync).toHaveBeenCalledWith("post-1");
  });
  it("returns retryable 503 without leaking upstream details", async () => {
    mocks.sync.mockRejectedValue(new Error("private-admin-key"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-admin-key");
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain(
      "private-admin-key"
    );
  });
});
