import {
  CheckoutError,
  quoteItems,
  requireConsent,
  shipping,
} from "../functions/_shared/checkout.ts";
import {
  cartOwner,
  jobAllowed,
} from "../functions/_shared/request-security.ts";

function assert(v: unknown, message = "assertion failed"): asserts v {
  if (!v) throw new Error(message);
}
function equal(a: unknown, b: unknown) {
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    `${JSON.stringify(a)} != ${JSON.stringify(b)}`,
  );
}
function rejects(fn: () => unknown, status?: number) {
  try {
    fn();
  } catch (e) {
    assert(e instanceof CheckoutError);
    if (status) equal(e.status, status);
    return;
  }
  throw new Error("expected rejection");
}
const fixture = (): any => ({
  vat: { mode: "excl", ready: 20, blank: 20, print: 20 },
  a3: 2,
  ship: { fee: 120, free: 2500 },
  products: [{
    id: "p1",
    name: "Tişört",
    type: "TİŞÖRT",
    sizes: "S,M,L",
    price: 100,
    stock: 20,
  }, { id: "mug1", name: "Kupa", price: 150, stock: null }],
  blanks: [{
    id: "tee",
    p: "tee",
    cut: "erkek",
    name: "Erkek tişört",
    price: 200,
    a4: 70,
    logo: 40,
    stock: 100,
  }],
  pf: { a4: 100, logo: 40 },
  ttx: [{ id: "paper", n: "Kağıt", price: 50, min: 10 }],
});
const studio = () => ({
  id: "tasarim",
  q: 10,
  t: 1,
  design: {
    product: "tee",
    cut: "erkek",
    sizes: { S: 0, M: 10 },
    areas: { front: "a4", logo: "logo" },
  },
});
Deno.test("ready prices and stock come from catalog, never n/t/unit/total", () => {
  const q = quoteItems(fixture(), [{
    id: "p1~M",
    n: "forged",
    q: 2,
    t: 0,
    unit: 0,
  }]);
  equal(q.sum, 240);
  equal(q.items[0].n, "Tişört · Beden: M");
});
Deno.test("quantity must be numeric positive bounded integer", () => {
  for (const q of [0, -1, 1.5, "2", null, NaN, Infinity, 100000]) {
    rejects(() => quoteItems(fixture(), [{ id: "p1~M", q }]));
  }
});
Deno.test("hidden, unknown, invalid size, oversold and split-line stock rejected", () => {
  const d = fixture();
  rejects(() => quoteItems(d, [{ id: "missing", q: 1 }]));
  rejects(() => quoteItems(d, [{ id: "p1~XXXL", q: 1 }]));
  rejects(() => quoteItems(d, [{ id: "p1", q: 1 }]));
  rejects(
    () => quoteItems(d, [{ id: "p1~M", q: 11 }, { id: "p1~L", q: 10 }]),
    409,
  );
  d.products[0].show = false;
  rejects(() => quoteItems(d, [{ id: "p1~M", q: 1 }]));
});
Deno.test("invalid catalog prices fail closed and item count is bounded", () => {
  const d = fixture();
  (d.products[0] as any).price = null;
  rejects(() => quoteItems(d, [{ id: "p1~M", q: 1 }]), 503);
  rejects(() => quoteItems(fixture(), Array(41).fill({ id: "mug1", q: 1 })));
  rejects(() => quoteItems(d, []));
});
Deno.test("studio cart: VAT, two charged surfaces, zeros and quantity discount", () => {
  const q = quoteItems(fixture(), [studio()]);
  equal(q.items[0].t, 3876);
  equal((q.items[0] as any).design.bid, "tee");
  const x = studio();
  x.design.sizes.M = 9;
  rejects(() => quoteItems(fixture(), [x]));
});
Deno.test("studio areas/cuts and model ambiguity cannot bypass prices", () => {
  const x = studio();
  x.design.areas.front = "mugw";
  rejects(() => quoteItems(fixture(), [x]));
  x.design.product = "__proto__";
  rejects(() => quoteItems(fixture(), [x]));
  const d = fixture();
  d.blanks.push({ ...d.blanks[0], id: "tee-slim", price: 300 });
  rejects(() => quoteItems(d, [studio()]), 409);
});
Deno.test("all studio product families are priced without changing rendering rules", () => {
  for (
    const [product, cut, areas] of [
      ["hood", "erkek", { front: "a4" }],
      ["zip", "kadin", { front: "logo" }],
      ["polo", "cocuk", { front: "logo" }],
      ["sweat", "erkek", { back: "a3" }],
      ["hat", "std", { front: "hat" }],
      ["mug", "sub", { front: "mugw" }],
      ["mug", "std", { front: "mug", back: "mug" }],
      ["canvas", "c3550", { front: "cv3550" }],
      ["canvas", "c5070", { front: "cv5070" }],
    ] as const
  ) {
    const d: any = fixture();
    d.blanks = [{
      id: "b",
      p: product,
      cut,
      name: "Blank",
      price: 200,
      a4: 100,
      logo: 40,
      hat: 40,
      wrap: 50,
    }];
    const size = cut === "cocuk"
      ? "3-4"
      : cut === "erkek" || cut === "kadin"
      ? "M"
      : "Std";
    const result = quoteItems(d, [{
      id: "tasarim",
      q: 1,
      design: { product, cut, sizes: { [size]: 1 }, areas },
    }]);
    assert(result.sum >= 240);
  }
});
Deno.test("collection pc uses server base/fees and ready VAT", () => {
  const d: any = fixture();
  d.products[0].pc = { b: "tee", f: "a3", logo: true };
  equal(quoteItems(d, [{ id: "p1~M", q: 1 }]).sum, 528);
});
Deno.test("wholesale requires verified approval data, keys/minimum and server tiers", () => {
  const d = fixture(), x = { id: "toptan", key: "x:paper", q: 20, t: 1 };
  rejects(() => quoteItems(d, [x]), 403);
  const ay = { min: 10, tiers: [[10, 20], [20, 30]], ozel: { "x:paper": 32 } };
  equal(quoteItems(d, [x], ay).sum, 560);
  rejects(() => quoteItems(d, [{ ...x, q: 9 }], ay));
  rejects(() => quoteItems(d, [x], { ...ay, hide: ["x:paper"] }));
  rejects(() => quoteItems(d, [{ ...x, key: "nope" }], ay));
  rejects(() => quoteItems(d, [x, { id: "mug1", q: 1 }], ay));
});
Deno.test("shipping uses trusted thresholds, delivery and strict method whitelist", () => {
  const d = fixture();
  equal(shipping(d, 100, "kargo"), 120);
  equal(shipping(d, 2500, "kargo"), 0);
  equal(shipping(d, 100, "elden"), 0);
  equal(shipping(d, 100, undefined, true), 0);
  rejects(() => shipping(d, 100, "free"));
  const bad: any = fixture();
  delete bad.ship;
  rejects(() => shipping(bad, 100, "kargo"), 503);
});
Deno.test("required consents must be true booleans; marketing remains optional", () => {
  for (
    const onay of [
      undefined,
      {},
      { kvkk: true },
      { kvkk: "true", sozlesme: true },
      { kvkk: true, sozlesme: 1 },
      { kvkk: true, sozlesme: true, izin: "false" },
    ]
  ) rejects(() => requireConsent({ onay }));
  requireConsent({ onay: { kvkk: true, sozlesme: true } });
  requireConsent({ onay: { kvkk: true, sozlesme: true, izin: false } });
});
Deno.test("guest cart capability separates same email; user ownership comes from verified uid", async () => {
  const req = (key: string) =>
    new Request("https://local/", { headers: { "x-wf-cart-key": key } });
  const a = await cartOwner(req("a".repeat(64)), null),
    b = await cartOwner(req("b".repeat(64)), null);
  assert(a !== b);
  assert(!a?.includes("a".repeat(64)));
  equal(await cartOwner(req("bad"), null), null);
  equal(await cartOwner(req("bad"), "verified-id"), "u:verified-id");
});
Deno.test("job endpoints require POST and dedicated secret, fail closed if not configured", async () => {
  const secret = "a".repeat(64),
    r = (method: string, key: string) =>
      new Request("https://local/", {
        method,
        headers: { "x-wf-job-token": key, apikey: secret },
      });
  equal(await jobAllowed(r("POST", secret), secret), true);
  for (
    const req of [r("GET", secret), r("POST", ""), r("POST", "b".repeat(64))]
  ) equal(await jobAllowed(req, secret), false);
  equal(await jobAllowed(r("POST", secret), undefined), false);
  equal(await jobAllowed(r("POST", "short"), "short"), false);
});

// Import actual Edge entrypoints with serve intercepted. All external requests are mocked;
// run this suite WITHOUT --allow-net so accidental production access is impossible.
const handlers: Record<string, (r: Request) => Promise<Response>> = {};
const envs = {
  SUPABASE_URL: "https://supabase.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "test-only-service-role",
  WF_JOB_TOKEN: "s".repeat(64),
};
for (const [k, v] of Object.entries(envs)) Deno.env.set(k, v);
const deno = Deno as any, serve = deno.serve;
try {
  for (const name of ["order-create", "sepet", "dogum-gunu", "stok-haber"]) {
    deno.serve = (fn: any) => {
      handlers[name] = fn;
      return {};
    };
    await import(`../functions/${name}/index.ts`);
  }
} finally {
  deno.serve = serve;
}
const post = (b: any, key = "a".repeat(64), auth?: string) =>
  new Request("https://local/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-wf-cart-key": key,
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: JSON.stringify(b),
  });
const base = () => ({
  ad: "Test",
  mail: "test@example.invalid",
  tel: "05301234567",
  adres: "Test adresi 123",
  il: "İzmir",
  ilce: "Konak",
  onay: { kvkk: true, sozlesme: true },
  delivery: "kargo",
  items: [{ id: "p1~M", q: 2, t: 1 }],
  total: 360,
  ship: 0,
});
async function withFetch(
  fn: (url: string, init: RequestInit) => Response | Promise<Response>,
  test: () => Promise<void>,
) {
  const old = globalThis.fetch;
  globalThis.fetch =
    ((url: any, init: any) =>
      Promise.resolve(fn(String(url), init || {}))) as any;
  try {
    await test();
  } finally {
    globalThis.fetch = old;
  }
}
const json = (v: unknown, status = 200) => Response.json(v, { status });
Deno.test("actual order handler rejects consent before any network/write", async () => {
  await withFetch(() => {
    throw new Error("unexpected network");
  }, async () => {
    equal(
      (await handlers["order-create"](
        post({ ...base(), onay: { kvkk: true } }),
      )).status,
      400,
    );
  });
});
Deno.test("actual order handler calculates server total, ignores forged line total/shipping and isolates dedup", async () => {
  let saved: any;
  const calls: string[] = [];
  await withFetch((u, i) => {
    calls.push(u);
    if (u.includes("site_content")) return json([{ data: fixture() }]);
    if (i.method === "POST" && u.endsWith("/orders")) {
      saved = JSON.parse(i.body as string);
      return json(null, 201);
    }
    if (i.method === "PATCH") return json(null);
    if (u.includes("/orders?")) {
      assert(u.includes("checkout_owner=eq.g%3A"));
      return json([]);
    }
    throw new Error("unexpected " + u);
  }, async () => {
    const r = await handlers["order-create"](post(base()));
    equal(r.status, 200);
    const j = await r.json();
    equal(j.total, 360);
    equal(saved.items[0].t, 240);
    equal(saved.ship, 120);
    equal(saved.onay.izin, false);
    assert(saved.checkout_owner.startsWith("g:"));
    assert(calls.some((u) => u.includes("carts?owner_key=eq.g%3A")));
  });
});
Deno.test("stale/forged order total cannot write and unknown catalog cannot fail open", async () => {
  await withFetch(
    (u) => {
      assert(u.includes("site_content"));
      return json([{ data: fixture() }]);
    },
    async () =>
      equal(
        (await handlers["order-create"](post({ ...base(), total: 1 }))).status,
        409,
      ),
  );
  await withFetch(
    () => json({ error: "down" }, 503),
    async () =>
      equal((await handlers["order-create"](post(base()))).status, 503),
  );
});
Deno.test("actual order handler rejects spoofed login and unauthorized wholesale", async () => {
  await withFetch(
    () => json({}, 401),
    async () =>
      equal(
        (await handlers["order-create"](post(base(), undefined, "forged")))
          .status,
        401,
      ),
  );
  await withFetch(
    () => json([{ data: fixture() }]),
    async () =>
      equal(
        (await handlers["order-create"](
          post({ ...base(), items: [{ id: "toptan", key: "x:paper", q: 20 }] }),
        )).status,
        403,
      ),
  );
});
Deno.test("actual order handler recomputes special discount and free delivery threshold", async () => {
  let saved: any;
  await withFetch((u, i) => {
    if (u.includes("site_content")) return json([{ data: fixture() }]);
    if (u.includes("/orders?")) return json([]);
    if (u.endsWith("/orders")) saved = JSON.parse(i.body as string);
    return json(null, 201);
  }, async () => {
    const b = base();
    const r = await handlers["order-create"](
      post({
        ...b,
        total: 312,
        special: {
          type: "doktor",
          rate: 1,
          discount: 9999,
          document: "data:image/png;base64,YQ==",
        },
      }),
    );
    // 240 - 10% + 120 = 336. An incorrect expected total is rejected before writes.
    equal(r.status, 409);
    equal(saved, undefined);
    const good = await handlers["order-create"](
      post({
        ...b,
        total: 336,
        special: {
          type: "doktor",
          rate: 1,
          document: "data:image/png;base64,YQ==",
        },
      }),
    );
    equal(good.status, 200);
    equal(saved.special.rate, .1);
    equal(saved.special.discount, 24);
    equal(saved.doc_status, "bekliyor");
  });
});
Deno.test("actual cart handler preserves guest checkout and prevents email-only overwrite", async () => {
  const rows: any[] = [];
  await withFetch((u, i) => {
    assert(u.includes("on_conflict=owner_key"));
    assert(!u.includes("on_conflict=mail"));
    rows.push(JSON.parse(i.body as string));
    return json(null, 201);
  }, async () => {
    const body = {
      mail: "same@example.invalid",
      items: [{ q: 1, t: 50, n: "test" }],
    };
    equal((await handlers.sepet(post(body))).status, 200);
    equal((await handlers.sepet(post(body, "b".repeat(64)))).status, 200);
    assert(rows[0].owner_key !== rows[1].owner_key);
    equal(rows[0].mail, rows[1].mail);
    equal(rows[0].member, false);
    equal((await handlers.sepet(post(body, ""))).status, 400);
    equal(rows.length, 2);
  });
});
Deno.test("member cart ignores body email; invalid login cannot fall back to guest", async () => {
  let saved: any;
  await withFetch((u, i) => {
    if (u.endsWith("/auth/v1/user")) {
      return json({ id: "verified-id", email: "real@example.invalid" });
    }
    saved = JSON.parse(i.body as string);
    return json(null);
  }, async () => {
    equal(
      (await handlers.sepet(
        post({ mail: "victim@example.invalid", items: [] }, undefined, "valid"),
      )).status,
      200,
    );
    equal(saved.mail, "real@example.invalid");
    equal(saved.owner_key, "u:verified-id");
  });
  await withFetch(
    () => json({}, 401),
    async () =>
      equal(
        (await handlers.sepet(
          post({ mail: "victim@example.invalid" }, undefined, "forged"),
        )).status,
        401,
      ),
  );
});
Deno.test("actual scheduled handlers reject unauthorized calls before Supabase/SMTP", async () => {
  await withFetch(() => {
    throw new Error("unauthorized network");
  }, async () => {
    for (const name of ["stok-haber", "dogum-gunu"]) {
      equal((await handlers[name](post({}))).status, 403);
      equal((await handlers[name](new Request("https://local/"))).status, 405);
    }
  });
});

Deno.test("authorized scheduled handlers pass the gate without calling live services", async () => {
  await withFetch(() => json([]), async () => {
    const req = () =>
      new Request("https://local/", {
        method: "POST",
        headers: { "x-wf-job-token": "s".repeat(64) },
      });
    equal((await handlers["stok-haber"](req())).status, 200);
    // No SMTP credentials are provisioned in the isolated test process.
    equal((await handlers["dogum-gunu"](req())).status, 503);
  });
});
Deno.test("special type prototype names and consent strings are rejected by actual order handler", async () => {
  await withFetch(() => json([{ data: fixture() }]), async () => {
    equal(
      (await handlers["order-create"](
        post({ ...base(), special: { type: "__proto__" } }),
      )).status,
      400,
    );
    equal(
      (await handlers["order-create"](
        post({ ...base(), onay: { kvkk: "true", sozlesme: true } }),
      )).status,
      400,
    );
  });
});

Deno.test("actual wholesale handler uses verified approval and private pricing settings", async () => {
  let saved: any;
  await withFetch((u, i) => {
    if (u.endsWith("/auth/v1/user")) {
      return json({ id: "11111111-1111-4111-8111-111111111111" });
    }
    if (u.includes("site_content")) return json([{ data: fixture() }]);
    if (u.includes("toptan_basvuru")) return json([{ status: "onaylandı" }]);
    if (u.includes("toptan_ayar")) {
      return json([{ data: { min: 10, tiers: [[10, 20], [20, 30]] } }]);
    }
    if (u.includes("/orders?")) return json([]);
    if (u.endsWith("/orders")) saved = JSON.parse(i.body as string);
    return json(null, 201);
  }, async () => {
    const r = await handlers["order-create"](
      post(
        {
          ...base(),
          items: [{ id: "toptan", key: "x:paper", q: 20, t: 0 }],
          total: 700,
        },
        undefined,
        "verified",
      ),
    );
    equal(r.status, 200);
    equal(saved.total, 700);
    equal(saved.ship, 0);
    equal(saved.user_id, "11111111-1111-4111-8111-111111111111");
  });
});

Deno.test("hidden studio blank is still a valid price reference for a visible collection item", () => {
  const d = fixture();
  d.products[0].pc = { b: "tee", f: "a4" };
  d.blanks[0].show = false;
  equal(quoteItems(d, [{ id: "p1~M", q: 1 }]).sum, 360);
  rejects(() => quoteItems(d, [studio()]), 409);
});

Deno.test("studio requote gives the current unit price and labels nonempty sizes", async () => {
  const item = studio();
  item.design.sizes = { S: 3, M: 7 };
  await withFetch((u) => {
    assert(u.includes("site_content"));
    return json([{ data: fixture() }]);
  }, async () => {
    const r = await handlers["order-create"](post({ ...base(), items: [item] }));
    equal(r.status, 409);
    const data = await r.json();
    equal(data.items, [{
      id: "tasarim", n: "Tasarım: Erkek tişört (S × 3, M × 7)",
      q: 10, t: 3876, unit: 408,
    }]);
    equal(data.total, 3876);
  });
});

Deno.test("zero-price wholesale is an approved-firm request with a bounded note", async () => {
  const d = fixture();
  d.ttx[0].price = 0;
  const items = [{ id: "toptan", key: "x:paper", q: 10, n: "forged", itemNote: "M".repeat(500) }];
  let saved: any;
  await withFetch((u, i) => {
    if (u.endsWith("/auth/v1/user")) return json({ id: "verified-id" });
    if (u.includes("site_content")) return json([{ data: d }]);
    if (u.includes("toptan_basvuru")) return json([{ status: "onaylandı" }]);
    if (u.includes("toptan_ayar")) return json([{ data: { min: 10, tiers: [[10, 20]] } }]);
    if (u.includes("/orders?")) return json([]);
    if (i.method === "POST" && u.endsWith("/orders")) saved = JSON.parse(i.body as string);
    return json(null, 201);
  }, async () => {
    const body = { ...base(), items, total: 0 };
    equal((await handlers["order-create"](post(body, undefined, "valid"))).status, 409);
    equal(saved, undefined);
    equal((await handlers["order-create"](post({ ...body, wholesaleRequest: true }, undefined, "valid"))).status, 200);
    equal(saved.onay.delivery, "toptan");
    equal(saved.items[0], {
      id: "toptan", n: "TOPTAN · Kağıt", q: 10, t: 0, key: "x:paper",
      itemNote: "M".repeat(300), pricePending: true,
    });
  });
});

Deno.test("duplicate studio order matches nested JSONB despite object key ordering", async () => {
  const item = studio();
  const b = { ...base(), items: [item], total: 3876 };
  const quoted = quoteItems(fixture(), [item]);
  const reverseKeys = (value: any): any => {
    if (Array.isArray(value)) return value.map(reverseKeys);
    return value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseKeys(entry)]))
      : value;
  };
  let inserts = 0;
  await withFetch((u) => {
    if (u.includes("site_content")) return json([{ data: fixture() }]);
    if (u.includes("/orders?")) return json([{
      code: "WLF-OLD", items: reverseKeys(quoted.items), adres: b.adres,
      il: b.il, ilce: b.ilce, special: null, onay: { delivery: b.delivery },
    }]);
    inserts++;
    return json(null, 201);
  }, async () => {
    const r = await handlers["order-create"](post(b));
    equal(r.status, 200);
    const result = await r.json();
    equal(result.code, "WLF-OLD");
    equal(result.dup, true);
    equal(inserts, 0);
  });
});
