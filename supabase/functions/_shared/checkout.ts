// Pure checkout rules. Only catalog/wholesale data loaded by the server is authoritative.
export class CheckoutError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
type Row = Record<string, any>;
export const money = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;
export function quantity(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1 || v > 99999) {
    throw new CheckoutError("Adet 1–99999 arasında tam sayı olmalı.");
  }
  return v;
}
function amount(v: unknown): number {
  if (
    v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ||
    Number(v) < 0 || Number(v) >= 10_000_000
  ) throw new CheckoutError("Ürün fiyatı yapılandırılmamış.", 503);
  return Number(v);
}
function vat(d: Row, n: number, group: string) {
  const v = d.vat || {}, rate = v[group] == null ? 20 : amount(v[group]);
  return money(n * (v.mode === "incl" ? 1 : 1 + rate / 100));
}
function find(list: Row[], id: string) {
  const p = (list || []).find((p) => p.id === id && p.show !== false);
  if (!p) throw new CheckoutError("Ürün artık satışta değil.");
  return p;
}
function stock(p: Row, q: number) {
  if (
    p.stock !== null && p.stock !== undefined && p.stock !== "" &&
    (!Number.isFinite(+p.stock) || +p.stock < q)
  ) throw new CheckoutError("Ürün stoğu yetersiz.", 409);
}
function fee(d: Row, b: Row, area: string) {
  if (/^cv/.test(area)) return 0;
  const key = ["logo", "logo2"].includes(area)
    ? "logo"
    : ["mug", "mugw"].includes(area)
    ? "wrap"
    : area;
  const pf = d.pf || {};
  let value = pf[key] ?? b[key];
  if (key === "a3" && pf.a3 == null) {
    value = amount(pf.a4 ?? b.a4) * amount(d.a3 ?? 2);
  }
  if (key === "wrap" && value == null) value = 0;
  return vat(d, amount(value), "print");
}
function readyPrice(d: Row, p: Row) {
  if (!p.pc) return vat(d, amount(p.price), "ready");
  // Match pcCalc/pcApply: collection pc totals are net, then ready VAT applies once.
  const pc = p.pc, pf = d.pf || {};
  // The collection item is for sale even when its blank is hidden from the studio.
  const b = (d.blanks || []).find((b: Row) => b.id === pc.b);
  if (!b) throw new CheckoutError("Ürünün fiyat referansı bulunamadı.", 503);
  const rawFee = (area: string) => {
    const key = ["logo", "logo2"].includes(area)
      ? "logo"
      : ["mug", "mugw"].includes(area)
      ? "wrap"
      : area;
    if (key === "a3") {
      return amount(
        pf.a3 ?? (amount(pf.a4 ?? b.a4 ?? 150) * amount(d.a3 ?? 2)),
      );
    }
    return amount(
      pf[key] ?? b[key] ??
        ({ a4: 150, logo: 100, hat: 150, wrap: 0 } as Row)[key],
    );
  };
  let n = amount(b.price);
  if (pc.logo) n += rawFee("logo");
  if (pc.logo2) n += rawFee("logo2");
  if (pc.f) n += rawFee(pc.f);
  if (pc.bk) n += rawFee(pc.bk);
  return vat(d, money(n), "ready");
}
const ADULT = ["XS", "S", "M", "L", "XL", "XXL"];
const KID = ["3-4", "5-6", "7-8", "9-10", "11-12", "13-14"];
function readySizes(p: Row) {
  const s = String(p.sizes ?? "").trim();
  if (s === "-") return [];
  if (s) return s.split(",").map((s) => s.trim()).filter(Boolean);
  const t = `${p.type || ""} ${p.name || ""}`.toLocaleLowerCase("tr"),
    cats = p.cat || [];
  const kid = !cats.some((c: string) => /^(erkek|kadin|kadın)$/.test(c)) &&
    cats.some((c: string) => /cocuk|çocuk/.test(c));
  if (
    /kupa|şapka|sapka|aksesuar|çanta|canta|bardak|termos|anahtar|canvas|kanvas|tablo/
      .test(t)
  ) return [];
  if (/ayakkab/.test(t)) {
    return kid
      ? ["28", "29", "30", "31", "32", "33", "34", "35"]
      : cats.includes("kadin") && !cats.includes("erkek")
      ? ["36", "37", "38", "39", "40", "41"]
      : ["39", "40", "41", "42", "43", "44", "45"];
  }
  if (/jean|pantolon/.test(t)) {
    return kid
      ? KID.map((z) => z + " yaş")
      : ["28", "29", "30", "31", "32", "33", "34", "36", "38"];
  }
  return kid ? KID.map((z) => z + " yaş") : ADULT;
}
const CUT_SIZES: Row = {
  erkek: ["S", "M", "L", "XL", "2XL", "3XL"],
  kadin: ["XS", "S", "M", "L", "XL", "2XL"],
  cocuk: KID,
  std: ["Std"],
  sub: ["Std"],
  c3550: ["Std"],
  c5070: ["Std"],
};
const SIDES: Row = {
  tee: {
    front: ["a4", "a3"],
    logo: ["logo"],
    logo2: ["logo2"],
    back: ["a4", "a3"],
  },
  sweat: {
    front: ["a4", "a3"],
    logo: ["logo"],
    logo2: ["logo2"],
    back: ["a4", "a3"],
  },
  hood: { front: ["a4"], logo: ["logo"], logo2: ["logo2"], back: ["a4", "a3"] },
  zip: { front: ["logo"], logo2: ["logo2"], back: ["a4", "a3"] },
  polo: { front: ["logo"], logo2: ["logo2"], back: ["a4", "a3"] },
  hat: { front: ["hat"] },
  mug: { front: ["mug"], back: ["mug"] },
  canvas: { front: ["cv3550", "cv5070"] },
};
function studio(d: Row, x: Row) {
  const v = x.design;
  if (
    !v || !Object.hasOwn(SIDES, v.product) || !Object.hasOwn(CUT_SIZES, v.cut)
  ) throw new CheckoutError("Tasarım ürün bilgisi eksik.");
  const matches = (d.blanks || []).filter((b: Row) =>
    b.show !== false && (b.p || b.id) === v.product &&
    (!b.cut || b.cut === v.cut)
  );
  // Older studio carts omit the model id. Never guess among multiple models.
  const exact = matches.filter((b: Row) => b.cut === v.cut);
  const candidates = exact.length ? exact : matches;
  const b = v.bid
    ? matches.find((b: Row) => b.id === v.bid)
    : candidates.length === 1
    ? candidates[0]
    : null;
  if (!b) {
    throw new CheckoutError(
      "Tasarımın ürün modeli doğrulanamadı; ürünü yeniden seç.",
      409,
    );
  }
  const allowedCuts =
    ["tee", "sweat", "hood", "zip", "polo"].includes(v.product)
      ? ["erkek", "kadin", "cocuk"]
      : v.product === "mug"
      ? ["std", "sub"]
      : v.product === "canvas"
      ? ["c3550", "c5070"]
      : ["std"];
  if (!allowedCuts.includes(v.cut)) {
    throw new CheckoutError("Geçersiz ürün kesimi.");
  }
  const sizes = v.sizes;
  if (
    !sizes || Array.isArray(sizes) || typeof sizes !== "object" ||
    !Object.keys(sizes).length
  ) throw new CheckoutError("Beden/adet seç.");
  let q = 0;
  for (const [z, n] of Object.entries(sizes)) {
    if (!CUT_SIZES[v.cut].includes(z)) {
      throw new CheckoutError("Geçersiz beden.");
    }
    // Studio persists zero-count sizes too.
    if (n === 0) continue;
    q += quantity(n);
  }
  if (quantity(q) !== quantity(x.q)) {
    throw new CheckoutError("Beden adetleri siparişle uyuşmuyor.");
  }
  let unit = vat(d, amount(b.price), "blank");
  const areas = v.areas;
  if (!areas || typeof areas !== "object" || Array.isArray(areas)) {
    throw new CheckoutError("Baskı alanı bilgisi eksik.");
  }
  const rules = v.product === "mug" && v.cut === "sub"
    ? { front: ["mugw"] }
    : SIDES[v.product];
  for (const [side, area] of Object.entries(areas)) {
    if (
      typeof area !== "string" ||
      (!Object.hasOwn(rules, side) || !rules[side]?.includes(area)) ||
      v.product === "canvas" && area !== "cv" + v.cut.slice(1)
    ) throw new CheckoutError("Geçersiz baskı alanı.");
    unit += fee(d, b, area);
  }
  // Match the existing store cart's per-design quantity tiers.
  const tiers = [[50, 15], [25, 10], [10, 5]],
    discount = tiers.find((t) => q >= t[0])?.[1] || 0;
  return {
    b,
    q,
    unit: money(unit),
    t: money(q * money(unit) * (1 - discount / 100)),
    sizes,
    areas,
  };
}
function wholesale(d: Row, x: Row, ay: Row | null) {
  if (!ay) {
    throw new CheckoutError(
      "Toptan sipariş için onaylı firma girişi gerekli.",
      403,
    );
  }
  const key = x.key;
  if (typeof key !== "string" || (ay.hide || []).includes(key)) {
    throw new CheckoutError("Toptan ürün seçimi geçersiz.");
  }
  let p: Row, base: number;
  if (key.startsWith("x:")) {
    p = find(d.ttx, key.slice(2));
    base = amount(p.price);
  } else if (key.startsWith("b:") && ay.blanks !== false) {
    p = find(d.blanks, key.slice(2));
    base = vat(d, amount(p.price), "blank");
  } else if (key.startsWith("p:") && ay.products !== false) {
    p = (d.products || []).find((p: Row) =>
      p.show !== false && p.name === key.slice(2)
    );
    if (!p) throw new CheckoutError("Ürün yok.");
    base = readyPrice(d, p);
  } else throw new CheckoutError("Toptan ürün seçimi geçersiz.");
  const q = quantity(x.q),
    tiers = (ay.tiers || []).slice().sort((a: number[], b: number[]) =>
      a[0] - b[0]
    );
  const min = p.min != null ? amount(p.min) : amount(ay.min ?? 0);
  if (q < min) throw new CheckoutError("Toptan en az adet koşulu sağlanmıyor.");
  if (!tiers.length) throw new CheckoutError("Toptan fiyat ayarı eksik.", 503);
  let percent = amount(tiers[0][1]);
  for (const t of tiers) if (q >= amount(t[0])) percent = amount(t[1]);
  const first = amount(tiers[0][1]);
  if (percent >= 100 || first >= 100) {
    throw new CheckoutError("Toptan indirim ayarı geçersiz.", 503);
  }
  const custom = ay.ozel?.[key];
  const unit = money(
    custom > 0
      ? amount(custom) * (1 - percent / 100) / (1 - first / 100)
      : base * (1 - percent / 100),
  );
  return { p, q, t: money(unit * q), key, pricePending: unit === 0 && base === 0 && !(custom > 0) };
}
export function quoteItems(d: Row, input: unknown, ay: Row | null = null) {
  if (!Array.isArray(input) || !input.length || input.length > 40) {
    throw new CheckoutError("Sepet 1–40 kalem içermeli.");
  }
  const demands = new Map<Row, number>();
  const studioUnits: Record<number, number> = {};
  let pricePending = false;
  const items = input.map((x, i) => {
    if (!x || typeof x.id !== "string") {
      throw new CheckoutError("Geçersiz ürün.");
    }
    let p: Row, q = quantity(x.q), t: number, extra: Row = {}, name: string;
    if (x.id === "tasarim") {
      const v = studio(d, x);
      p = v.b;
      t = v.t;
      studioUnits[i] = v.unit;
      const sizeLabel = Object.entries(v.sizes).filter(([, n]) => Number(n) > 0)
        .map(([size, n]) => `${size} × ${n}`).join(", ");
      name = "Tasarım: " + p.name + " (" + sizeLabel + ")";
      extra = {
        design: {
          bid: p.id,
          product: x.design.product,
          cut: x.design.cut,
          sizes: v.sizes,
          areas: v.areas,
        },
        r: x.r,
      };
    } else if (x.id === "toptan") {
      const v = wholesale(d, x, ay);
      p = v.p;
      t = v.t;
      name = "TOPTAN · " + (p.name || p.n);
      pricePending ||= v.pricePending;
      const itemNote = typeof x.itemNote === "string" ? x.itemNote.trim().slice(0, 300) : "";
      extra = { key: v.key, ...(itemNote ? { itemNote } : {}), ...(v.pricePending ? { pricePending: true } : {}) };
    } else {
      const [id, size, ...rest] = x.id.split("~");
      if (rest.length) throw new CheckoutError("Geçersiz ürün kodu.");
      p = find(d.products, id);
      const zs = readySizes(p);
      if (zs.length ? !zs.includes(size) : !!size) {
        throw new CheckoutError("Geçerli beden seç.");
      }
      t = money(readyPrice(d, p) * q);
      name = p.name + (size ? " · Beden: " + size : "");
    }
    if ((t <= 0 && !extra.pricePending) || t >= 10_000_000) {
      throw new CheckoutError("Ürün fiyatı geçersiz.", 409);
    }
    demands.set(p, (demands.get(p) || 0) + q);
    return { id: x.id, n: name, q, t, ...extra };
  });
  for (const [p, q] of demands) stock(p, q);
  if (
    items.some((x) => x.id === "toptan") && items.some((x) => x.id !== "toptan")
  ) throw new CheckoutError("Toptan sepeti ayrı gönder.");
  const sum = money(items.reduce((n, x) => n + x.t, 0));
  if (sum >= 10_000_000) {
    throw new CheckoutError("Sipariş tutarı sınırı aşıldı.");
  }
  return {
    items,
    studioUnits,
    pricePending,
    sum,
    qty: items.reduce((n, x) => n + x.q, 0),
    wholesale: items.every((x) => x.id === "toptan"),
  };
}
export function shipping(
  d: Row,
  sum: number,
  method: unknown,
  wholesale = false,
) {
  if (wholesale) return 0; // Wholesale remains an unfulfilled order request, as before.
  if (method === "elden") return 0;
  if (method !== undefined && method !== "kargo") {
    throw new CheckoutError("Teslimat yöntemi geçersiz.");
  }
  const fee = amount(d.ship?.fee), free = amount(d.ship?.free);
  return free > 0 && sum >= free ? 0 : money(fee);
}
export function requireConsent(body: Row) {
  if (body.onay?.kvkk !== true || body.onay?.sozlesme !== true) {
    throw new CheckoutError(
      "KVKK aydınlatması ve satış sözleşmesi onayı gerekli.",
    );
  }
  if (body.onay.izin !== undefined && typeof body.onay.izin !== "boolean") {
    throw new CheckoutError("Pazarlama tercihi geçersiz.");
  }
}
