// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker, { storePrices, GEMINI_MODEL } from "../../worker.js";

const SECRET = "test_secret";
const env = (extra = {}) => ({
  RAZORPAY_KEY_ID: "rzp_key_id_from_env",
  RAZORPAY_KEY_SECRET: SECRET,
  TURNSTILE_SECRET_KEY: "ts_secret",
  FIREBASE_API_KEY: "fb_key",
  GEMINI_API_KEY: "gem_key",
  BANNED_USERS: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) },
  ...extra
});

const post = (path, body, headers = {}) =>
  new Request(`https://api.test${path}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body)
  });

const call = (path, body, e = env(), headers) => worker.fetch(post(path, body, headers), e);
const jsonOf = (res) => res.json();

// Build a fetch mock routing by URL, with per-test overrides.
function routeFetch(overrides = {}) {
  const handlers = {
    razorpay: async () => ({ ok: true, json: async () => ({ id: "order_1", amount: 40400, currency: "INR" }) }),
    turnstile: async () => ({ json: async () => ({ success: true }) }),
    lookup: async () => ({ ok: true, json: async () => ({ users: [{ localId: "uid1" }] }) }),
    gemini: async () => ({ json: async () => ({ candidates: [{ content: { parts: [{ text: "Hello there" }] } }] }) }),
    ...overrides
  };
  const fn = vi.fn(async (url, init) => {
    if (url.includes("api.razorpay.com")) return handlers.razorpay(url, init);
    if (url.includes("siteverify")) return handlers.turnstile(url, init);
    if (url.includes("accounts:lookup")) return handlers.lookup(url, init);
    return handlers.gemini(url, init);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  routeFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("storePrices", () => {
  it("has the expected products including Cocoa PB and Kimchi", () => {
    expect(Object.keys(storePrices)).toHaveLength(27);
    expect(storePrices["250g Sweetened - Smooth | Monk Fruit"]).toBe(404);
    expect(storePrices["1kg Unsweetened - Crunchy"]).toBe(819);
  });
});

describe("HTTP methods and CORS", () => {
  it("answers OPTIONS preflight with 200 and security headers", async () => {
    const res = await worker.fetch(new Request("https://api.test/", { method: "OPTIONS" }), env());
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://yogkota1-source.github.io");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("rejects non-POST requests with 405", async () => {
    const res = await worker.fetch(new Request("https://api.test/", { method: "GET" }), env());
    expect(res.status).toBe(405);
  });

  it("returns 404 for an unknown POST route", async () => {
    const res = await call("/unknown", {});
    expect(res.status).toBe(404);
    expect((await jsonOf(res)).error).toBe("Not found.");
  });
});

describe("/create-order", () => {
  it("returns 400 for missing, non-array and empty carts", async () => {
    for (const body of [{}, { cart: "x" }, { cart: [] }]) {
      const res = await call("/create-order", body);
      expect(res.status).toBe(400);
    }
  });

  it("returns 400 for an unrecognized itemId", async () => {
    const res = await call("/create-order", { cart: [{ itemId: "Hacked - Item", quantity: 1 }] });
    expect(res.status).toBe(400);
    expect((await jsonOf(res)).error).toMatch(/Unrecognized/);
  });

  it("returns 400 when the total is zero or negative", async () => {
    const res = await call("/create-order", { cart: [{ itemId: "250g Unsweetened - Smooth", quantity: -1 }] });
    expect(res.status).toBe(400);
    expect((await jsonOf(res)).error).toMatch(/Invalid order total/);
  });

  it("prices a single item without quantity and calls Razorpay with Basic Auth", async () => {
    const f = routeFetch();
    const res = await call("/create-order", { cart: [{ itemId: "250g Sweetened - Smooth | Monk Fruit" }] });
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({
      key_id: "rzp_key_id_from_env",
      amount: 40400,
      currency: "INR",
      order_id: "order_1"
    });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(init.headers.Authorization).toBe(`Basic ${btoa(`rzp_key_id_from_env:${SECRET}`)}`);
    const sent = JSON.parse(init.body);
    expect(sent.amount).toBe(40400);
    expect(sent.currency).toBe("INR");
    expect(sent.receipt).toMatch(/^rcpt_/);
  });

  it("prices a multi-item cart with quantities in exact paise", async () => {
    const f = routeFetch();
    await call("/create-order", {
      cart: [
        { itemId: "500g Sweetened - Smooth | Date Powder", quantity: 2 },
        { itemId: "1kg Unsweetened - Crunchy" }
      ]
    });
    expect(JSON.parse(f.mock.calls[0][1].body).amount).toBe((499 * 2 + 819) * 100);
  });

  it("returns 500 when Razorpay fails, with and without an error description", async () => {
    routeFetch({ razorpay: async () => ({ ok: false, json: async () => ({ error: { description: "Bad key" } }) }) });
    let res = await call("/create-order", { cart: [{ itemId: "250g Unsweetened - Smooth" }] });
    expect(res.status).toBe(500);
    expect((await jsonOf(res)).error).toBe("Bad key");

    routeFetch({ razorpay: async () => ({ ok: false, json: async () => ({ error: {} }) }) });
    res = await call("/create-order", { cart: [{ itemId: "250g Unsweetened - Smooth" }] });
    expect((await jsonOf(res)).error).toBe("Could not create order.");

    routeFetch({ razorpay: async () => ({ ok: false, json: async () => ({}) }) });
    res = await call("/create-order", { cart: [{ itemId: "250g Unsweetened - Smooth" }] });
    expect((await jsonOf(res)).error).toBe("Could not create order.");
  });

  it("returns 500 on unexpected exceptions", async () => {
    const res = await call("/create-order", "not json");
    expect(res.status).toBe(500);
  });
});

async function sign(orderId, paymentId, secret = SECRET) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${orderId}|${paymentId}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("/verify-payment", () => {
  it("returns 400 when any field is missing", async () => {
    const full = { razorpay_order_id: "o", razorpay_payment_id: "p", razorpay_signature: "s" };
    for (const missing of Object.keys(full)) {
      const body = { ...full };
      delete body[missing];
      const res = await call("/verify-payment", body);
      expect(res.status).toBe(400);
      expect((await jsonOf(res)).status).toBe("failed");
    }
  });

  it("accepts a valid signature", async () => {
    const signature = await sign("order_1", "pay_1");
    const res = await call("/verify-payment", { razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: signature });
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({ status: "success" });
  });

  it("rejects a mismatched signature", async () => {
    const signature = await sign("order_1", "pay_1", "other_secret");
    const res = await call("/verify-payment", { razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: signature });
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ status: "failed" });
  });

  it("returns 500 on unexpected exceptions", async () => {
    const res = await call("/verify-payment", "not json");
    expect(res.status).toBe(500);
    expect((await jsonOf(res)).status).toBe("failed");
  });
});

const chatBody = (extra = {}) => ({ message: "hello", turnstileToken: "ts", token: "fb", persona: "curator", ...extra });
const chat = (body, e = env(), headers) => call("/chat", body, e, headers);

describe("chatbot route", () => {
  it("returns 400 for malformed JSON", async () => {
    expect((await chat("{bad")).status).toBe(400);
  });

  it("validates the message", async () => {
    for (const message of [undefined, 5, "", "x".repeat(1001)]) {
      const res = await chat(chatBody({ message }));
      expect(res.status).toBe(400);
    }
  });

  it("selects personas and strips HTML tags", async () => {
    const f = routeFetch();
    await chat(chatBody({ persona: "roaster", message: "  hi <b>there</b> <script>x</script> " }));
    let payload = JSON.parse(f.mock.calls.at(-1)[1].body);
    expect(payload.systemInstruction.parts[0].text).toContain("TR (The Roaster)");
    expect(payload.contents[0].parts[0].text).toBe("hi there x");

    await chat(chatBody({ persona: "curator" }));
    payload = JSON.parse(f.mock.calls.at(-1)[1].body);
    expect(payload.systemInstruction.parts[0].text).toContain("TC (The Curator)");

    await chat(chatBody({ persona: "something-else" }));
    payload = JSON.parse(f.mock.calls.at(-1)[1].body);
    expect(payload.systemInstruction.parts[0].text).toContain("TC (The Curator)");
    expect(f.mock.calls.at(-1)[0]).toContain(GEMINI_MODEL);
  });

  it("returns 403 when the Turnstile token or secret is missing", async () => {
    expect((await chat(chatBody({ turnstileToken: "" }))).status).toBe(403);
    expect((await chat(chatBody(), env({ TURNSTILE_SECRET_KEY: undefined }))).status).toBe(403);
  });

  it("sends remoteip to Turnstile only when CF-Connecting-IP exists", async () => {
    const f = routeFetch();
    await chat(chatBody(), env(), { "CF-Connecting-IP": "1.2.3.4" });
    expect(f.mock.calls[0][1].body.get("remoteip")).toBe("1.2.3.4");
    expect(f.mock.calls[0][1].body.get("secret")).toBe("ts_secret");

    await chat(chatBody());
    const siteverifyCalls = f.mock.calls.filter((c) => c[0].includes("siteverify"));
    expect(siteverifyCalls.at(-1)[1].body.has("remoteip")).toBe(false);
  });

  it("returns 403 when Turnstile verification fails", async () => {
    routeFetch({ turnstile: async () => ({ json: async () => ({ success: false }) }) });
    expect((await chat(chatBody())).status).toBe(403);
  });

  it("returns 500 when Firebase or Gemini keys are missing", async () => {
    expect((await chat(chatBody(), env({ FIREBASE_API_KEY: undefined }))).status).toBe(500);
    expect((await chat(chatBody(), env({ GEMINI_API_KEY: undefined }))).status).toBe(500);
  });

  it("returns 401 when the user token is missing", async () => {
    expect((await chat(chatBody({ token: undefined }))).status).toBe(401);
  });

  it("returns 401 when the Firebase lookup fails or has no user id", async () => {
    routeFetch({ lookup: async () => ({ ok: false }) });
    expect((await chat(chatBody())).status).toBe(401);

    for (const payload of [{}, { users: [] }, { users: [{}] }]) {
      routeFetch({ lookup: async () => ({ ok: true, json: async () => payload }) });
      const res = await chat(chatBody());
      expect(res.status).toBe(401);
      expect((await jsonOf(res)).error).toMatch(/Security Error/);
    }
  });

  it("returns 500 when the BANNED_USERS KV binding is missing", async () => {
    expect((await chat(chatBody(), env({ BANNED_USERS: undefined }))).status).toBe(500);
  });

  describe("rate limiting and strikes", () => {
    const NOW = 1_700_000_000_000;
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
    });
    const withRecord = (record) => env({ BANNED_USERS: { get: vi.fn().mockResolvedValue(record), put: vi.fn().mockResolvedValue(undefined) } });

    it("creates a fresh record for a new user and answers", async () => {
      const e = env();
      const res = await chat(chatBody(), e);
      expect(res.status).toBe(200);
      expect((await jsonOf(res)).reply).toBe("Hello there");
      expect(JSON.parse(e.BANNED_USERS.put.mock.calls[0][1])).toEqual({ time: NOW, count: 1, strikes: 0 });
    });

    it("permanently blocks users with 3 strikes", async () => {
      const res = await chat(chatBody(), withRecord({ time: NOW, count: 0, strikes: 3 }));
      expect(res.status).toBe(403);
    });

    it("counts a rapid message below the threshold", async () => {
      const e = withRecord({ time: NOW - 1000, count: 1, strikes: 0 });
      const res = await chat(chatBody(), e);
      expect(res.status).toBe(200);
      expect(JSON.parse(e.BANNED_USERS.put.mock.calls[0][1]).count).toBe(2);
    });

    it("adds a strike and warns when the rapid count reaches 4", async () => {
      const e = withRecord({ time: NOW - 1000, count: 3, strikes: 1 });
      const res = await chat(chatBody(), e);
      expect((await jsonOf(res)).reply).toMatch(/Warning 2\/3/);
      expect(JSON.parse(e.BANNED_USERS.put.mock.calls[0][1])).toEqual({ time: NOW, count: 0, strikes: 2 });
    });

    it("resets the window after 10 seconds", async () => {
      const e = withRecord({ time: NOW - 20000, count: 3, strikes: 1 });
      const res = await chat(chatBody(), e);
      expect(res.status).toBe(200);
      expect(JSON.parse(e.BANNED_USERS.put.mock.calls[0][1])).toEqual({ time: NOW, count: 1, strikes: 1 });
    });
  });

  it("falls back to 'No response.' for every missing part of the Gemini response", async () => {
    const shapes = [{}, { candidates: [] }, { candidates: [{}] }, { candidates: [{ content: {} }] }, { candidates: [{ content: { parts: [] } }] }];
    for (const shape of shapes) {
      routeFetch({ gemini: async () => ({ json: async () => shape }) });
      expect((await jsonOf(await chat(chatBody()))).reply).toBe("No response.");
    }
  });

  it("returns 500 from the outer catch when Gemini throws", async () => {
    routeFetch({ gemini: async () => { throw new Error("boom"); } });
    const res = await chat(chatBody());
    expect(res.status).toBe(500);
    expect((await jsonOf(res)).error).toMatch(/hiccup/);
  });
});

