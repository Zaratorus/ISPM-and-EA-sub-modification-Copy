# Builds the Word document deliverable containing the full-project ERD.
from docx import Document
from docx.shared import Inches, Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from PIL import Image

INK = RGBColor(0x10, 0x18, 0x20)
INK_SOFT = RGBColor(0x55, 0x63, 0x6F)
ACCENT = RGBColor(0x0B, 0x6E, 0x7D)
LINE = RGBColor(0xC7, 0xD2, 0xD9)
WARN = RGBColor(0xB0, 0x59, 0x0A)

ERD_PATH = r"C:\Users\Shasoo\Desktop\ISPM & EA - sub modification\docs\_erd_build\full_erd.png"
OUT_PATH = r"C:\Users\Shasoo\Desktop\ISPM & EA - sub modification\docs\Gen-Z_ERD.docx"

doc = Document()

# ---------- base style ----------
normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(11)
normal.font.color.rgb = INK

for lvl, size, color in [("Heading 1", 22, INK), ("Heading 2", 15, ACCENT), ("Heading 3", 12.5, INK)]:
    st = doc.styles[lvl]
    st.font.name = "Calibri"
    st.font.size = Pt(size)
    st.font.bold = True
    st.font.color.rgb = color

PORTRAIT_W, PORTRAIT_H = Inches(8.5), Inches(11)
LANDSCAPE_W, LANDSCAPE_H = Inches(11), Inches(8.5)

sec = doc.sections[0]
sec.page_width = PORTRAIT_W
sec.page_height = PORTRAIT_H
sec.left_margin = sec.right_margin = Inches(1)
sec.top_margin = sec.bottom_margin = Inches(0.9)


def set_cell_shading(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)


def add_rule(paragraph_before=True):
    p = doc.add_paragraph()
    pPr = p._p.get_or_add_pPr()
    pbdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), "CED6DC")
    pbdr.append(bottom)
    pPr.append(pbdr)
    return p


# ============================================================
# TITLE PAGE
# ============================================================
for _ in range(4):
    doc.add_paragraph()

eyebrow = doc.add_paragraph()
eyebrow.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = eyebrow.add_run("GEN-Z DIGITAL STOREFRONT   ·   ISE_WE_0201_58")
r.font.size = Pt(11)
r.font.color.rgb = ACCENT
r.font.bold = True
r.font.name = "Consolas"

title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = title.add_run("Entity-Relationship Diagram")
r.font.size = Pt(34)
r.font.bold = True
r.font.color.rgb = INK

sub = doc.add_paragraph()
sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = sub.add_run("Full-Project Database Schema  ·  genz_digital_storefront")
r.font.size = Pt(14)
r.font.color.rgb = INK_SOFT

for _ in range(6):
    doc.add_paragraph()

meta_items = [
    ("Project", "A Modern Digital Storefront for Gen-Z"),
    ("Database", "genz_digital_storefront  (MySQL 8, InnoDB, utf8mb4)"),
    ("Scope", "21 tables across 4 modules: EP-01, EP-02, EP-03, EP-04"),
    ("Source of truth", "genz-backend/genz-backend/db/schema.sql"),
    ("Team", "IT24101208 Warnakula S P (Scrum Master) · IT24101437 Sashorinth N · IT24103841 Razni Ahamed B S"),
]
tbl = doc.add_table(rows=len(meta_items), cols=2)
tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
tbl.autofit = False
for i, (k, v) in enumerate(meta_items):
    row = tbl.rows[i]
    row.cells[0].width = Inches(1.6)
    row.cells[1].width = Inches(5.0)
    p0 = row.cells[0].paragraphs[0]
    r0 = p0.add_run(k)
    r0.font.bold = True
    r0.font.size = Pt(10)
    r0.font.color.rgb = INK_SOFT
    p1 = row.cells[1].paragraphs[0]
    r1 = p1.add_run(v)
    r1.font.size = Pt(10.5)
    r1.font.color.rgb = INK
    for c in row.cells:
        c.vertical_alignment = 1

doc.add_page_break()

# ============================================================
# HOW TO READ THIS DIAGRAM
# ============================================================
doc.add_heading("How to Read This Diagram", level=1)

p = doc.add_paragraph()
p.add_run(
    "This diagram uses crow's-foot notation, the standard convention for relational entity-"
    "relationship diagrams. Every entity box, column, key and relationship shown is copied "
    "directly from the live database schema (db/schema.sql) — nothing here is a conceptual "
    "approximation drawn after the fact."
)

doc.add_heading("Reading an entity box", level=2)
for line in [
    "The table name is the header.",
    "PK marks the primary key column(s).",
    "FK marks a foreign key column, with an outline instead of a solid fill.",
    "PK/FK marks a column that is simultaneously the primary key and a foreign key — e.g. "
    "inventory_stock.product_id, a strict one-to-one relationship with products.",
    "A small boxed letter beside a foreign key (e.g. \u201cA\u201d) marks a reference to a table in "
    "a different module — see the Cross-Module References table on page 4.",
    "Italic text beneath the keys summarises the remaining columns and any notable rule.",
]:
    doc.add_paragraph(line, style="List Bullet")

doc.add_heading("Reading a relationship line", level=2)
for line in [
    "A double tick ( \u2225 ) sits at the \u201cone\u201d side of the relationship — the parent table, "
    "whose primary key is being referenced.",
    "A crow's foot ( \u2313 ) sits at the \u201cmany\u201d side — the child table, whose foreign key column "
    "points back to the parent.",
    "A solid line means the foreign key is NOT NULL — every child row must reference a parent.",
    "A dashed line, and a small circle before the crow's foot, mean the foreign key is nullable — "
    "the relationship is optional (e.g. carts.customer_id). The Actor Identity pattern — "
    "moderation_logs.actor_id is NULL precisely when the actor is Owner/Admin rather than a named "
    "Staff account — is a cross-module reference, listed in the Cross-Module References table.",
]:
    doc.add_paragraph(line, style="List Bullet")

doc.add_page_break()

# ============================================================
# LANDSCAPE PAGE — THE ERD
# ============================================================
new_sec = doc.add_section(WD_SECTION.NEW_PAGE)
new_sec.orientation = WD_ORIENT.LANDSCAPE
new_sec.page_width, new_sec.page_height = LANDSCAPE_W, LANDSCAPE_H
new_sec.left_margin = new_sec.right_margin = Inches(0.5)
new_sec.top_margin = new_sec.bottom_margin = Inches(0.45)

im = Image.open(ERD_PATH)
aspect = im.width / im.height
avail_w = new_sec.page_width - new_sec.left_margin - new_sec.right_margin
avail_h = new_sec.page_height - new_sec.top_margin - new_sec.bottom_margin
target_w = avail_w
target_h = int(target_w / aspect)
if target_h > avail_h:
    target_h = avail_h
    target_w = int(target_h * aspect)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run()
run.add_picture(ERD_PATH, width=target_w, height=target_h)

# back to portrait for the pages that follow
port_sec = doc.add_section(WD_SECTION.NEW_PAGE)
port_sec.orientation = WD_ORIENT.PORTRAIT
port_sec.page_width, port_sec.page_height = PORTRAIT_W, PORTRAIT_H
port_sec.left_margin = port_sec.right_margin = Inches(1)
port_sec.top_margin = port_sec.bottom_margin = Inches(0.9)

# ============================================================
# CROSS-MODULE REFERENCES
# ============================================================
doc.add_heading("Cross-Module References", level=1)
p = doc.add_paragraph()
p.add_run(
    "Foreign keys that point at a table drawn in a different module are marked on the diagram "
    "with a small boxed letter rather than a long connecting line, to keep the diagram readable. "
    "They are listed here in full."
)

xrefs = [
    ("products", "A", [
        "cart_items.product_id (B)", "order_items.product_id (B)", "reviews.product_id (C)",
    ]),
    ("customers", "B", ["carts.customer_id (B)", "orders.customer_id (B)", "reviews.customer_id (C)"]),
    ("orders", "B", ["deliveries.order_id (C)", "reviews.order_id (C)"]),
    ("staff_admin_users", "D", ["moderation_logs.actor_id (C)"]),
]

t = doc.add_table(rows=1, cols=2)
t.style = "Light Grid Accent 1"
t.autofit = False
hdr = t.rows[0].cells
hdr[0].width = Inches(2.0)
hdr[1].width = Inches(4.6)
for c, txt in zip(hdr, ["Referenced table", "Referenced by"]):
    c.paragraphs[0].add_run(txt).font.bold = True
    set_cell_shading(c, "101820")
    c.paragraphs[0].runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

for table_name, mod, refs in xrefs:
    row = t.add_row().cells
    row[0].width = Inches(2.0)
    row[1].width = Inches(4.6)
    rp = row[0].paragraphs[0]
    rr = rp.add_run(f"{table_name}  ")
    rr.font.name = "Consolas"
    rr.font.bold = True
    rr.font.size = Pt(10)
    rr2 = rp.add_run(f"[{mod}]")
    rr2.font.size = Pt(8.5)
    rr2.font.color.rgb = INK_SOFT
    cellp = row[1].paragraphs[0]
    cellp.text = ""
    for i, ref in enumerate(refs):
        rp2 = row[1].add_paragraph() if i > 0 else cellp
        rr3 = rp2.add_run(ref)
        rr3.font.name = "Consolas"
        rr3.font.size = Pt(9.5)

doc.add_paragraph()

# ============================================================
# FULL ENTITY LIST
# ============================================================
doc.add_heading("All 21 Tables", level=1)

ENTITIES = [
    ("A", "categories", "Product categories (men's clothing, boys' clothing, perfumes)"),
    ("A", "products", "The product catalogue"),
    ("A", "inventory_stock", "Per-product stock quantity; availability_status is a generated column"),
    ("A", "product_images", "Image references attached to a product"),
    ("D", "roles", "Named roles assignable to Staff accounts"),
    ("D", "permissions", "Named permissions checked by requirePermission()"),
    ("D", "role_permissions", "Junction table: which permissions each role has"),
    ("D", "staff_admin_users", "Staff/Admin accounts (login not yet implemented)"),
    ("D", "store_settings", "Singleton row: store name, contact info, WhatsApp number"),
    ("D", "admin_access_key", "Singleton row: hashed Owner/Admin access key"),
    ("D", "activity_log", "Central audit trail written by every module"),
    ("B", "customers", "Customer accounts"),
    ("B", "carts", "One active cart per customer"),
    ("B", "cart_items", "Line items in a cart"),
    ("B", "orders", "Customer orders, Pending through Cancelled"),
    ("B", "order_items", "Line items in an order; price frozen at checkout"),
    ("B", "order_status_history", "Audit trail of order status transitions"),
    ("C", "deliveries", "One delivery per order, tracked through 6 statuses"),
    ("C", "delivery_status_history", "Audit trail of delivery status transitions"),
    ("C", "reviews", "Verified-purchase star ratings and written reviews"),
    ("C", "moderation_logs", "Audit trail of review approve/reject/delete actions"),
]

t2 = doc.add_table(rows=1, cols=3)
t2.style = "Light Grid Accent 1"
t2.autofit = False
h = t2.rows[0].cells
h[0].width = Inches(0.55)
h[1].width = Inches(1.9)
h[2].width = Inches(4.15)
for c, txt in zip(h, ["Mod", "Table", "Purpose"]):
    c.paragraphs[0].add_run(txt).font.bold = True
    set_cell_shading(c, "101820")
    c.paragraphs[0].runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

for mod, name, purpose in ENTITIES:
    row = t2.add_row().cells
    row[0].width = Inches(0.55)
    row[1].width = Inches(1.9)
    row[2].width = Inches(4.15)
    rc = row[0].paragraphs[0].add_run(mod)
    rc.font.bold = True
    rc.font.size = Pt(9.5)
    rc.font.color.rgb = ACCENT
    rn = row[1].paragraphs[0].add_run(name)
    rn.font.name = "Consolas"
    rn.font.size = Pt(9.5)
    rp = row[2].paragraphs[0].add_run(purpose)
    rp.font.size = Pt(9.5)
    rp.font.color.rgb = INK_SOFT

foot = doc.add_paragraph()
foot.add_run(
    "\nSource: genz-backend/genz-backend/db/schema.sql. Columns beyond primary/foreign keys are "
    "summarised on the diagram rather than fully enumerated, to keep each entity box readable; "
    "the complete column list, data types and constraint definitions for every table are in the "
    "schema file itself."
).font.size = Pt(9)
foot.runs[0].font.color.rgb = INK_SOFT
foot.runs[0].italic = True

doc.save(OUT_PATH)
print("saved", OUT_PATH)
