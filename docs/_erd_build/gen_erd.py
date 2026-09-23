# Generates the full-project Entity-Relationship Diagram (crow's-foot notation)
# for the Gen-Z Digital Storefront schema, straight from db/schema.sql.
from PIL import Image, ImageDraw, ImageFont
import math

SCALE = 2.2

def S(v):
    return int(round(v * SCALE))

# ---------- palette ----------
INK        = (16, 24, 32)
INK_SOFT   = (90, 104, 116)
LINE       = (206, 216, 224)
LINE_STR   = (168, 186, 198)
SURFACE    = (255, 255, 255)
SURFACE2   = (243, 247, 249)
ACCENT     = (11, 110, 125)
ACCENT_SOFT= (222, 239, 241)
WARN       = (176, 88, 11)
BG         = (237, 241, 245)
MODTAB_BG  = (16, 24, 32)

# ---------- fonts ----------
FD = "C:/Windows/Fonts/"
def F(name, size):
    return ImageFont.truetype(FD + name, S(size))

mono_b  = lambda s: F("consolab.ttf", s)
mono_r  = lambda s: F("consola.ttf", s)
mono_i  = lambda s: F("consolai.ttf", s)
sans_b  = lambda s: F("calibrib.ttf", s)
sans_r  = lambda s: F("calibri.ttf", s)
sans_bi = lambda s: F("calibriz.ttf", s)

# ======================================================================
# TABLE DEFINITIONS  (name -> box spec)
# rows: list of (kind, label, extra)   kind in {pk, fk, pkfk}
#   extra for fk/pkfk: dict(nullable=bool, external=modtag-or-None)
# note: list of small italic lines shown under the rows
# pos: (x, y, w, h)  -- LOCAL coordinates within its module cluster
# ======================================================================

MODULES = {
    "A": {"title": "Product & Catalogue Management", "epic": "EP-01", "origin": (40, 190)},
    "D": {"title": "Store Administration Management", "epic": "EP-04", "origin": (1080, 190)},
    "B": {"title": "Customer & Order Management",     "epic": "EP-02", "origin": (40, 470)},
    "C": {"title": "Delivery Tracking & Reviews",      "epic": "EP-03", "origin": (860, 470)},
}

TABLES = {}

def T(name, module, pos, rows, note):
    TABLES[name] = dict(module=module, pos=pos, rows=rows, note=note)

# ---- MODULE A ----
T("categories", "A", (20, 30, 210, 96),
  [("pk", "category_id", {})],
  ["name (UNIQUE), description, timestamps"])

T("products", "A", (270, 30, 210, 118),
  [("pk", "product_id", {}),
   ("fk", "category_id", {"target": "categories"})],
  ["name, price (>0), status, timestamps"])

T("inventory_stock", "A", (520, 30, 210, 118),
  [("pkfk", "product_id", {"target": "products"})],
  ["quantity (>=0)", "availability_status  GENERATED"])

T("product_images", "A", (770, 30, 210, 118),
  [("pk", "product_image_id", {}),
   ("fk", "product_id", {"target": "products"})],
  ["image_reference, sort_order"])

# ---- MODULE D ----
T("roles", "D", (20, 30, 210, 96),
  [("pk", "role_id", {})], ["name (UNIQUE)"])

T("permissions", "D", (520, 30, 210, 96),
  [("pk", "permission_id", {})], ["name (UNIQUE)"])

T("role_permissions", "D", (270, 30, 210, 118),
  [("pkfk", "role_id", {"target": "roles"}),
   ("pkfk", "permission_id", {"target": "permissions"})],
  ["composite PK (role_id, permission_id)"])

T("staff_admin_users", "D", (20, 168, 210, 118),
  [("pk", "staff_admin_user_id", {}),
   ("fk", "role_id", {"target": "roles"})],
  ["name, credentials_reference, status"])

T("store_settings", "D", (520, 168, 210, 96),
  [("pk", "store_settings_id = 1", {})],
  ["singleton row  (CHECK id = 1)"])

T("admin_access_key", "D", (770, 30, 210, 96),
  [("pk", "admin_access_key_id = 1", {})],
  ["singleton row  (CHECK id = 1)"])

T("activity_log", "D", (770, 168, 210, 118),
  [("pk", "activity_log_id", {})],
  ["actor_id / affected_entity_id are", "deliberately unenforced (polymorphic)"])

# ---- MODULE B ----
T("customers", "B", (20, 30, 210, 96),
  [("pk", "customer_id", {})],
  ["name, contact_info, credentials, status"])

T("carts", "B", (20, 168, 210, 118),
  [("pk", "cart_id", {}),
   ("fk", "customer_id", {"target": "customers", "nullable": True})],
  ["status (ACTIVE / CONVERTED / ABANDONED)"])

T("orders", "B", (270, 168, 210, 118),
  [("pk", "order_id", {}),
   ("fk", "customer_id", {"target": "customers"})],
  ["status  Pending -> ... -> Cancelled"])

T("cart_items", "B", (20, 328, 210, 140),
  [("pk", "cart_item_id", {}),
   ("fk", "cart_id", {"target": "carts"}),
   ("fk", "product_id", {"target": "products", "external": "A"})],
  ["UNIQUE(cart_id, product_id)"])

T("order_items", "B", (270, 328, 210, 140),
  [("pk", "order_item_id", {}),
   ("fk", "order_id", {"target": "orders"}),
   ("fk", "product_id", {"target": "products", "external": "A"})],
  ["price_snapshot  (frozen at checkout)"])

T("order_status_history", "B", (520, 328, 210, 118),
  [("pk", "order_status_history_id", {}),
   ("fk", "order_id", {"target": "orders"})],
  ["from_status, to_status, changed_at"])

# ---- MODULE C ----
T("deliveries", "C", (20, 30, 210, 118),
  [("pk", "delivery_id", {}),
   ("fk", "order_id", {"target": "orders", "external": "B"})],
  ["UNIQUE(order_id)  ·  status x6"])

T("delivery_status_history", "C", (20, 188, 210, 118),
  [("pk", "delivery_status_history_id", {}),
   ("fk", "delivery_id", {"target": "deliveries"})],
  ["from_status, to_status"])

T("reviews", "C", (270, 30, 210, 162),
  [("pk", "review_id", {}),
   ("fk", "customer_id", {"target": "customers", "external": "B"}),
   ("fk", "product_id", {"target": "products", "external": "A"}),
   ("fk", "order_id", {"target": "orders", "external": "B"})],
  ["rating (1-5), moderation_status"])

T("moderation_logs", "C", (270, 232, 210, 140),
  [("pk", "moderation_log_id", {}),
   ("fk", "review_id", {"target": "reviews"}),
   ("fk", "actor_id", {"target": "staff_admin_users", "external": "D", "nullable": True})],
  ["actor_type/actor_id pairing (CHECK)"])

# ======================================================================
# geometry helpers
# ======================================================================

def abs_box(name):
    t = TABLES[name]
    ox, oy = MODULES[t["module"]]["origin"]
    x, y, w, h = t["pos"]
    return (ox + x, oy + y, w, h)

def row_y(box_y, idx):
    return box_y + 44 + idx * 24

def row_anchor(name, column, side):
    """Return (x,y) at the given row's edge. side in l/r/t/b."""
    t = TABLES[name]
    bx, by, w, h = abs_box(name)
    idx = None
    for i, (kind, label, extra) in enumerate(t["rows"]):
        if label.split(" ")[0].rstrip(",") == column or label == column:
            idx = i
            break
    if idx is None:
        idx = 0
    ry = row_y(by, idx) + 7
    if side == "l":
        return (bx, ry)
    if side == "r":
        return (bx + w, ry)
    if side == "t":
        return (bx + w * 0.5, by)
    if side == "b":
        return (bx + w * 0.5, by + h)

def pk_anchor(name, side="auto", ref_point=None):
    bx, by, w, h = abs_box(name)
    idx = 0  # PK is always first row in every table here
    ry = row_y(by, idx) + 7
    if side == "auto":
        cx = bx + w / 2
        if ref_point[0] < bx:
            return (bx, ry)
        elif ref_point[0] > bx + w:
            return (bx + w, ry)
        elif ref_point[1] < by:
            return (cx, by)
        else:
            return (cx, by + h)
    return (bx, ry)

# ======================================================================
# canvas
# ======================================================================

CANVAS_W, CANVAS_H = 2160, 1060
img = Image.new("RGB", (S(CANVAS_W), S(CANVAS_H)), BG)
d = ImageDraw.Draw(img)

def rrect(xy, radius, fill=None, outline=None, width=1):
    d.rounded_rectangle([S(xy[0]), S(xy[1]), S(xy[2]), S(xy[3])], radius=S(radius),
                         fill=fill, outline=outline, width=max(1, S(width)))

def line(pts, fill, width=1.6, dash=False):
    ptsS = [(S(x), S(y)) for x, y in pts]
    if not dash:
        d.line(ptsS, fill=fill, width=max(1, round(S(width))), joint="curve")
        return
    # dashed polyline
    for i in range(len(ptsS) - 1):
        x1, y1 = ptsS[i]; x2, y2 = ptsS[i + 1]
        seglen = math.hypot(x2 - x1, y2 - y1)
        if seglen == 0:
            continue
        dashlen, gaplen = S(7), S(5)
        n = max(1, int(seglen // (dashlen + gaplen)))
        ux, uy = (x2 - x1) / seglen, (y2 - y1) / seglen
        pos = 0
        while pos < seglen:
            a = pos
            b = min(pos + dashlen, seglen)
            d.line([(x1 + ux * a, y1 + uy * a), (x1 + ux * b, y1 + uy * b)],
                   fill=fill, width=max(1, round(S(width))))
            pos += dashlen + gaplen

def text(xy, s, font, fill, anchor="la"):
    d.text((S(xy[0]), S(xy[1])), s, font=font, fill=fill, anchor=anchor)

def text_w(s, font):
    return d.textlength(s, font=font) / SCALE

# ---- crow's-foot end markers ----
def draw_one_tick(x, y, orient, color):
    # orient: 'h' line approaches horizontally, 'v' vertically
    L = 7
    if orient == "h":
        d.line([(S(x - 3), S(y - L)), (S(x - 3), S(y + L))], fill=color, width=max(1, round(S(1.6))))
        d.line([(S(x + 2), S(y - L)), (S(x + 2), S(y + L))], fill=color, width=max(1, round(S(1.6))))
    else:
        d.line([(S(x - L), S(y - 3)), (S(x + L), S(y - 3))], fill=color, width=max(1, round(S(1.6))))
        d.line([(S(x - L), S(y + 2)), (S(x + L), S(y + 2))], fill=color, width=max(1, round(S(1.6))))

def draw_many_crowsfoot(x, y, orient, incoming_dir, nullable, color):
    """incoming_dir: direction the line comes FROM, e.g. 'left' means line approaches from the left,
    so the crow's foot fans out to the LEFT of (x,y) and the point sits at the entity edge (x,y)."""
    spread = 9
    reach = 13
    if incoming_dir in ("left", "right"):
        sign = -1 if incoming_dir == "left" else 1
        tip = (x, y)
        top = (x + sign * reach, y - spread)
        bot = (x + sign * reach, y + spread)
        d.line([S(tip[0]), S(tip[1]), S(top[0]), S(top[1])], fill=color, width=max(1, round(S(1.6))))
        d.line([S(tip[0]), S(tip[1]), S(bot[0]), S(bot[1])], fill=color, width=max(1, round(S(1.6))))
        d.line([S(tip[0]), S(tip[1]), S(x + sign * reach), S(y)], fill=color, width=max(1, round(S(1.6))))
        if nullable:
            cx = x + sign * (reach + 9)
            d.ellipse([S(cx - 5), S(y - 5), S(cx + 5), S(y + 5)], outline=color, width=max(1, round(S(1.6))), fill=BG)
    else:
        sign = -1 if incoming_dir == "up" else 1
        tip = (x, y)
        left = (x - spread, y + sign * reach)
        right = (x + spread, y + sign * reach)
        d.line([S(tip[0]), S(tip[1]), S(left[0]), S(left[1])], fill=color, width=max(1, round(S(1.6))))
        d.line([S(tip[0]), S(tip[1]), S(right[0]), S(right[1])], fill=color, width=max(1, round(S(1.6))))
        d.line([S(tip[0]), S(tip[1]), S(x), S(y + sign * reach)], fill=color, width=max(1, round(S(1.6))))
        if nullable:
            cy = y + sign * (reach + 9)
            d.ellipse([S(x - 5), S(cy - 5), S(x + 5), S(cy + 5)], outline=color, width=max(1, round(S(1.6))), fill=BG)

# ======================================================================
# module cluster panels
# ======================================================================

MOD_COLOR = {
    "A": (11, 110, 125), "D": (16, 24, 32), "B": (11, 110, 125),
    "C": (16, 24, 32),
}
CLUSTER_SIZE = {
    "A": (960, 200), "D": (980, 316), "B": (740, 486),
    "C": (500, 396),
}

for m, meta in MODULES.items():
    ox, oy = meta["origin"]
    cw, ch = CLUSTER_SIZE[m]
    px, py = ox - 20, oy - 60
    pw, ph = cw + 40, ch + 80
    rrect((px, py, px + pw, py + ph), 16, fill=SURFACE2, outline=LINE, width=1.3)
    # tab
    tabw = 40 + text_w(f"MODULE {m}   {meta['title']}", sans_b(15))
    rrect((px, py, px + tabw, py + 34), 10, fill=MODTAB_BG)
    text((px + 14, py + 8), f"MODULE {m}", mono_b(13), SURFACE)
    text((px + 14 + text_w(f'MODULE {m}', mono_b(13)) + 10, py + 8), meta["title"], sans_b(14), SURFACE)
    text((px + 14, py + ph - 26), meta["epic"], mono_r(11), INK_SOFT)

# ======================================================================
# draw entity boxes
# ======================================================================

def draw_table(name):
    t = TABLES[name]
    bx, by, w, h = abs_box(name)
    rrect((bx, by, bx + w, by + h), 8, fill=SURFACE, outline=LINE_STR, width=1.4)
    text((bx + 12, by + 9), name, mono_b(14.5), INK)
    line([(bx, by + 30), (bx + w, by + 30)], LINE, width=1.1)
    for i, (kind, label, extra) in enumerate(t["rows"]):
        ry = row_y(by, i)
        chip_fill = ACCENT if kind in ("pk", "pkfk") else None
        chip_txt = {"pk": "PK", "fk": "FK", "pkfk": "PK/FK"}[kind]
        chip_w = 22 if kind != "pkfk" else 40
        if kind == "fk":
            rrect((bx + 12, ry, bx + 12 + chip_w, ry + 15), 4, fill=None, outline=ACCENT, width=1.4)
            text((bx + 12 + chip_w / 2, ry + 7.5), chip_txt, mono_b(9), ACCENT, anchor="mm")
        else:
            rrect((bx + 12, ry, bx + 12 + chip_w, ry + 15), 4, fill=ACCENT)
            text((bx + 12 + chip_w / 2, ry + 7.5), chip_txt, mono_b(9), SURFACE, anchor="mm")
        lbl = label
        if extra.get("nullable"):
            lbl += "  (null?)"
        text((bx + 12 + chip_w + 10, ry + 1), lbl, mono_r(12.5), INK)
        if extra.get("external"):
            tag = extra["external"]
            tagw = 20
            tx = bx + w - 12 - tagw
            rrect((tx, ry, tx + tagw, ry + 15), 4, fill=SURFACE2, outline=LINE_STR, width=1)
            text((tx + tagw / 2, ry + 7.5), tag, mono_b(9), INK_SOFT, anchor="mm")
    ny = row_y(by, len(t["rows"])) + 2
    for nline in t["note"]:
        text((bx + 12, ny), nline, mono_i(10.5), INK_SOFT)
        ny += 15

for name in TABLES:
    draw_table(name)

# ======================================================================
# connectors  (parent 'one' tick  ->  child crow's-foot 'many')
# each entry: (parent_table, child_table, child_fk_column, orientation-hint)
# orientation-hint tells which side of parent/child to leave from, and the
# path is drawn as an orthogonal polyline computed from the boxes' geometry.
# ======================================================================

def connect(parent, child, fk_col, nullable, route=None, label=None):
    px, py, pw, ph = abs_box(parent)
    cx, cy, cw, ch = abs_box(child)
    p_anchor = pk_anchor(parent, "auto", ref_point=(cx + cw / 2, cy + ch / 2))
    c_anchor = row_anchor(child, fk_col, "l" if p_anchor[0] <= cx else "r")
    color = ACCENT
    if route:
        pts = route(p_anchor, c_anchor)
    else:
        pts = [p_anchor, c_anchor]
    line(pts, color, width=1.7, dash=nullable)
    # determine incoming direction at child for crow's foot
    last_seg = (pts[-2], pts[-1])
    dx = last_seg[1][0] - last_seg[0][0]
    dy = last_seg[1][1] - last_seg[0][1]
    if abs(dx) >= abs(dy):
        indir = "right" if dx > 0 else "left"
    else:
        indir = "down" if dy > 0 else "up"
    draw_many_crowsfoot(pts[-1][0], pts[-1][1], "h" if indir in ("left", "right") else "v", indir, nullable, color)
    # one-tick at parent end
    first_seg = (pts[0], pts[1])
    fdx = first_seg[1][0] - first_seg[0][0]
    fdy = first_seg[1][1] - first_seg[0][1]
    orient = "h" if abs(fdx) >= abs(fdy) else "v"
    draw_one_tick(pts[0][0], pts[0][1], orient, color)
    if label:
        mx = sum(p[0] for p in pts[1:-1]) / max(1, len(pts) - 2) if len(pts) > 2 else (pts[0][0] + pts[-1][0]) / 2
        my = min(p[1] for p in pts) - 9
        text((mx, my), label, mono_r(10.5), INK_SOFT, anchor="mm")

def L(*pts):
    return lambda a, b: [a, *pts, b]

# ---- Module A intra ----
connect("categories", "products", "category_id", False)
connect("products", "inventory_stock", "product_id", False)
connect("products", "product_images", "product_id", False)

# ---- Module D intra ----
connect("roles", "role_permissions", "role_id", False)
connect("permissions", "role_permissions", "permission_id", False)
connect("roles", "staff_admin_users", "role_id", False,
        route=lambda a, b: [a, (a[0]-18, a[1]), (a[0]-18, b[1]), b])

# ---- Module B intra ----
connect("customers", "carts", "customer_id", True,
        route=lambda a, b: [a, (a[0]-18, a[1]), (a[0]-18, b[1]), b])
connect("customers", "orders", "customer_id", False)
connect("carts", "cart_items", "cart_id", False,
        route=lambda a, b: [a, (a[0]-18, a[1]), (a[0]-18, b[1]), b])
connect("orders", "order_items", "order_id", False,
        route=lambda a, b: [a, (a[0]-18, a[1]), (a[0]-18, b[1]), b])
connect("orders", "order_status_history", "order_id", False)

# ---- Module C intra ----
connect("deliveries", "delivery_status_history", "delivery_id", False,
        route=lambda a, b: [a, (a[0]-18, a[1]), (a[0]-18, b[1]), b])
connect("reviews", "moderation_logs", "review_id", False,
        route=lambda a, b: [a, (a[0]-18, a[1]), (a[0]-18, b[1]), b])

# Cross-module foreign keys (e.g. cart_items.product_id -> products in
# Module A) are intentionally NOT drawn as long lines here -- routing all 7
# of them across module clusters would clutter the diagram.
# Each cross-module FK row instead carries a small boxed module tag (drawn in
# draw_table() above, e.g. the "A" beside cart_items.product_id); the full
# list is enumerated in the companion "Cross-Module References" table.

# ======================================================================
# title block + legend
# ======================================================================

text((40, 26), "Gen-Z Digital Storefront — Full-Project Entity-Relationship Diagram", sans_b(25), INK)
text((40, 64), "genz_digital_storefront   ·   MySQL 8, InnoDB, utf8mb4   ·   21 tables across 4 modules (EP-01 to EP-04)   ·   crow's-foot notation", mono_r(12.5), INK_SOFT)
text((40, 88), "A boxed letter beside an FK (e.g. \"A\") marks a reference to a table in another module — see the Cross-Module References table.", sans_r(12.5), INK_SOFT)

leg_y = CANVAS_H - 34
leg_x = 40
def legend_item(x, y, kind, label):
    if kind == "one":
        draw_one_tick(x, y, "h", INK)
        text((x + 16, y - 7), label, sans_r(11.5), INK_SOFT)
    elif kind == "many":
        draw_many_crowsfoot(x, y, "h", "right", False, INK)
        text((x + 22, y - 7), label, sans_r(11.5), INK_SOFT)
    elif kind == "manyopt":
        draw_many_crowsfoot(x, y, "h", "right", True, INK)
        text((x + 32, y - 7), label, sans_r(11.5), INK_SOFT)
    elif kind == "dash":
        line([(x - 10, y), (x + 10, y)], ACCENT, width=1.7, dash=True)
        text((x + 16, y - 7), label, sans_r(11.5), INK_SOFT)
    elif kind == "pk":
        rrect((x - 11, y - 7, x + 11, y + 8), 4, fill=ACCENT)
        text((x - 6, y - 5.5), "PK", mono_b(9), SURFACE)
        text((x + 20, y - 7), label, sans_r(11.5), INK_SOFT)
    elif kind == "fk":
        rrect((x - 11, y - 7, x + 11, y + 8), 4, outline=ACCENT, width=1.4)
        text((x - 6, y - 5.5), "FK", mono_b(9), ACCENT)
        text((x + 20, y - 7), label, sans_r(11.5), INK_SOFT)

legend_item(leg_x, leg_y, "pk", "Primary key")
legend_item(leg_x + 190, leg_y, "fk", "Foreign key")
legend_item(leg_x + 380, leg_y, "one", "\"one\" side")
legend_item(leg_x + 560, leg_y, "many", "\"many\" side (mandatory)")
legend_item(leg_x + 900, leg_y, "manyopt", "\"many\" side (optional / nullable FK)")
legend_item(leg_x + 1320, leg_y, "dash", "nullable FK line")

img.save(r"C:\Users\Shasoo\Desktop\ISPM & EA - sub modification\docs\_erd_build\full_erd.png", "PNG")
print("saved", img.size)
