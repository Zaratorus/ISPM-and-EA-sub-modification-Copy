/**
 * scripts/seed-demo-images.js
 * Attaches a real, publicly-hosted product photo to each existing demo
 * product via the normal admin endpoint (POST /products/:id/images).
 * Since imageReference is used as-is when it's already an absolute URL
 * (see genz-frontend/src/utils/format.js resolveImageUrl), no Cloudflare
 * R2 setup is needed for this to render.
 */
const BASE = "http://localhost:4000/api/v1";
const ACCESS_KEY = "GenZStoreAdmin2026!";

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const IMAGES = {};

async function main() {
  const login = await api("POST", "/admin/access-key/validate", { accessKey: ACCESS_KEY });
  const token = login.data?.token;
  if (!token) throw new Error("No token: " + JSON.stringify(login));
  console.log("Logged in as Owner/Admin.");

  const list = await api("GET", "/products?limit=100", null, token);
  const products = list.data || list;
  for (const p of products) {
    const name = p.name;
    const url = IMAGES[name];
    if (!url) { console.log("Skip (no image mapped):", name); continue; }
    const productId = p.productId || p.product_id;
    await api("POST", `/products/${productId}/images`, { imageReference: url, sortOrder: 0 }, token);
    console.log("Image attached:", name, "-> id", productId);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exitCode = 1;
});
