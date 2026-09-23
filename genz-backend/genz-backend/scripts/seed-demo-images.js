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

const IMAGES = {
  "Classic Oxford Shirt": "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=800&h=800&fit=crop",
  "Everyday Crew Tee": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&h=800&fit=crop",
  "Slim Fit Chinos": "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800&h=800&fit=crop",
  "Boys' Graphic Tee": "https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=800&h=800&fit=crop",
  "Boys' School Trousers": "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=800&h=800&fit=crop",
  "Gen-Z Signature EDP 100ml": "https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&h=800&fit=crop",
  "Midnight Noir Cologne 50ml": "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=800&h=800&fit=crop",
};

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
