/**
 * scripts/seed-demo-products.js
 * One-off demo-data seeder: logs in with the Owner/Admin Access Key via the
 * real API (not raw SQL), creates a few categories and products through the
 * normal admin endpoints, and sets stock on each. Safe to re-run.
 *
 * Usage: node scripts/seed-demo-products.js
 */
const BASE = "http://localhost:4000/api/v1";
const ACCESS_KEY = "GenZStoreAdmin2026!";

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  const login = await api("POST", "/admin/access-key/validate", { accessKey: ACCESS_KEY });
  const token = login.token || login.data?.token || login.accessToken;
  if (!token) throw new Error("No token in login response: " + JSON.stringify(login));
  console.log("Logged in as Owner/Admin.");

  const categories = [
    { name: "Men's Clothing", description: "Shirts, tees, and everyday menswear." },
    { name: "Kids' Clothing", description: "Clothing for kids, ages 5 to 15, casual and school-ready." },
    { name: "Perfumes", description: "Signature fragrances for men and boys." },
  ];
  const catIds = {};
  for (const c of categories) {
    const res = await api("POST", "/categories", c, token);
    const cat = res.data || res;
    catIds[c.name] = cat.categoryId || cat.category_id || cat.id;
    console.log("Category created:", c.name, "->", catIds[c.name]);
  }

  const products = [
    { name: "Classic Oxford Shirt", category: "Men's Clothing", brand: "Polo", description: "Crisp cotton oxford shirt, tailored fit.", price: 4500, stock: 25 },
    { name: "Everyday Crew Tee", category: "Men's Clothing", brand: "Calvin Klein", description: "Soft cotton crew-neck t-shirt.", price: 1800, stock: 60 },
    { name: "Slim Fit Chinos", category: "Men's Clothing", brand: "Levi's", description: "Stretch cotton chinos, slim fit.", price: 5200, stock: 18 },
    { name: "Boys' Graphic Tee", category: "Kids' Clothing", brand: "H&M", description: "Printed cotton t-shirt for boys.", price: 1200, stock: 40 },
    { name: "Boys' School Trousers", category: "Kids' Clothing", brand: "Crocodile", description: "Durable school-uniform trousers.", price: 2200, stock: 0 },
    { name: "Gen-Z Signature EDP 100ml", category: "Perfumes", brand: "Park Avenue", description: "Long-lasting eau de parfum, signature scent.", price: 8900, stock: 12 },
    { name: "Midnight Noir Cologne 50ml", category: "Perfumes", brand: "Wild Stone", description: "Woody, spicy evening fragrance.", price: 6200, stock: 15 },
  ];

  for (const p of products) {
    const res = await api("POST", "/products", {
      categoryId: catIds[p.category],
      name: p.name,
      description: p.description,
      price: p.price,
      brand: p.brand,
    }, token);
    const prod = res.data || res;
    const productId = prod.productId || prod.product_id || prod.id;
    await api("PATCH", `/products/${productId}/stock`, {
      newQuantity: p.stock,
      reason: "Initial demo stock seed",
    }, token);
    console.log("Product created:", p.name, "-> id", productId, "stock", p.stock);
  }

  console.log("Demo seed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exitCode = 1;
});
