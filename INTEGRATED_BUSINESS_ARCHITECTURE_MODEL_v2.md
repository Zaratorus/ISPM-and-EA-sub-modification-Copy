# INTEGRATED BUSINESS & ARCHITECTURE MODEL — VERSION 2 (FINAL)

**Gen-Z Digital Storefront — Men's, Boys' Clothing & Perfume Store**
**Project Group: ISE_WE_0201_58**

> This is the corrected, final version of the integrated business/architecture reference model. It supersedes Version 1. DEC-02 and DEC-04 are treated here as **locked project decisions** for the current architecture baseline, not pending items. It remains conceptual — no database schema, API specification, folder structure, or code is included.

---

## 1. Executive Summary

Gen-Z is transitioning from a manual, in-person, phone/WhatsApp-driven retail operation to a web-based digital storefront. The approved system is organised into four epics — Product & Catalogue Management (EP-01), Customer & Order Management (EP-02), Delivery Tracking with Review Management (EP-03), and Store Administration Management (EP-04). This model integrates these four epics into one coherent business and architecture picture, anchored on a single non-negotiable rule: **EP-01 is the sole owner of Product and Inventory/Stock**, and every other module — including EP-02 — interacts with inventory only by *requesting* operations from EP-01, never by owning or mutating it directly. The customer checkout flow (DEC-02, Option B) and the stock-deduction trigger (DEC-04, Option C) are **locked project decisions** for this architecture baseline, alongside the previously confirmed Admin Access Key flow and preserved Staff/RBAC model.

---

## 2. Project Scope

The system digitises: product catalogue browsing and management; customer ordering via a WhatsApp-based checkout; delivery assignment and tracking; customer reviews with moderation; store administration (staff, roles, settings, audit); and stock replenishment through EP-01's audited manual stock adjustment. Out of scope for this phase: online payment gateway, native mobile application, refund/dispute resolution, and advanced delivery logistics beyond status updates.

---

## 3. Approved Epic Structure (Unchanged)

| Epic | Owns |
|---|---|
| **EP-01 — Product & Catalogue Management** | Products, Categories, Product information, Product images, Pricing, Product availability, Inventory/Stock |
| **EP-02 — Customer & Order Management** | Customer browsing (pass-through), Customer accounts, Cart, Checkout, WhatsApp checkout, Orders, Order status, Customer order history |
| **EP-03 — Delivery Tracking with Review Management** | Delivery assignment, Delivery tracking, Delivery status, Delivery completion, Review eligibility, Customer reviews, Review moderation |
| **EP-04 — Store Administration Management** | Store administration, Admin dashboard, Staff accounts, Roles, Permissions/RBAC, Store settings, Activity/audit logs |

These four epics are not renamed, merged, reduced, or redesigned by this model.

---

## 4. Stock Replenishment

Stock is increased or corrected through **EP-01's own manual stock adjustment** — the normal restocking path (revised DEC-05). Only an authorised administrative session may perform it, a reason is mandatory, and every adjustment is recorded in EP-04's central Activity Log. The only other stock increase is EP-02's order-cancellation restoration, which EP-01 performs on EP-02's request (Section 8).

---

## 5. Stakeholder Model

| Stakeholder | Nature | Interacts With |
|---|---|---|
| **Customer** | Primary, external | EP-01 (browse), EP-02 (cart/checkout/orders), EP-03 (delivery tracking/reviews) |
| **Store Owner/Admin** | Primary, internal | All modules — full oversight via Admin Access Key |
| **Sales/Floor Staff** | Secondary, internal | EP-02 (orders), limited EP-01/EP-04 access |
| **Delivery Person** | Primary, external-facing | EP-03 only (assigned deliveries, status updates) |
| **Academic Supervisor/Lecturer** | External, evaluative | No system interaction — governs project scope/grading |

---

## 6. Customer Business Process

```
Customer
  ↓
Browse Storefront (no authentication required)
  ↓
Search / Filter
  ↓
View Product (EP-01 provides product + availability data)
  ↓
Add to Cart (EP-02)
  ↓
Login / Register  ← required here — LOCKED, per DEC-02 Option B
  ↓
Checkout (EP-02)
  ↓
WhatsApp Checkout message generated
  ↓
Order Record Created — Status: Pending (EP-02)
```

**Module responsibilities in this process:**
- **EP-01** supplies product data and authoritative availability at every browsing/detail step; owns nothing about the customer's cart or identity.
- **EP-02** owns the cart, the login/registration gate at checkout, the WhatsApp message generation, and the resulting Order record.
- No inventory mutation occurs anywhere in this process — browsing, cart-building, and Pending-order creation are all inventory-neutral, per the locked DEC-04 decision.

---

## 7. Order Lifecycle

```
Order Record Created — Pending
        ↓
Admin Reviews Order (EP-04 dashboard surfaces it; EP-02 owns the data)
        ↓
Admin Verifies Stock (reads EP-01's availability data)
        ↓
Admin Confirms Order — Status: Confirmed  ← LOCKED trigger point, per DEC-04 Option C
        ↓
EP-02 requests EP-01: decreaseStock(orderQuantity)
        ↓
EP-01 validates and decreases inventory
        ↓
Status: Processing
        ↓
Status: Ready for Delivery
        ↓
Handover to EP-03
        ↓
Assigned → Picked Up → Out for Delivery → Delivered
        ↓
Review Eligibility unlocked (EP-03)
        ↓
Customer Review submitted (EP-03)
```

**Cancellation branch:**

| Order state at cancellation | Stock effect | Requesting module |
|---|---|---|
| Pending → Cancelled | None — stock was never deducted | N/A |
| Confirmed (or later) → Cancelled | EP-02 requests EP-01: `increaseStock(orderQuantity)` — deducted quantity restored | EP-02 → EP-01 |

**Module responsibilities:** EP-02 owns the order lifecycle **up to the Ready for Delivery handover** — every status transition from Pending through Confirmed, Processing, to Ready for Delivery — and decides *when* to request a stock change; EP-01 is the only module that actually performs the change; EP-04 only reads/displays order data on its dashboard, never owns it. EP-03's role in this lifecycle begins only at the handover point (see Section 10).

---

## 8. Inventory Lifecycle

```
Available Stock (EP-01, authoritative)
        ↓
Customer creates Pending Order (EP-02)
        ↓
NO stock deduction  ← LOCKED, DEC-04 Option C
        ↓
Admin verifies order
        ↓
Order Confirmed
        ↓
EP-02 requests EP-01: decreaseStock()
        ↓
Available Stock decreases (EP-01 performs the mutation)
        ↓
Processing → Ready for Delivery → Delivery → Delivered
```

**Cancellation:**

```
Pending → Cancelled → No inventory change

Confirmed → [stock already deducted] → Cancelled
    → EP-02 requests EP-01: increaseStock()
    → Stock restored (EP-01 performs the mutation)
```

**EP-01 remains the sole inventory authority throughout** — every arrow into "Available Stock" in this lifecycle passes through EP-01, regardless of whether the trigger came from a customer order or cancellation (EP-02) or a manual stock adjustment (EP-01, Section 9).

---

## 9. Stock Replenishment Lifecycle

```
Owner/Admin (authorised administrative session)
        ↓
Manual Stock Adjustment — new quantity + mandatory reason (EP-01)
        ↓
EP-01 updates Inventory/Stock (single transaction)
        ↓
Updated Product Availability (EP-01's single, existing availability rule)
        ↓
Activity Log entry recorded, including the reason (EP-04)
```

**Revised DEC-05 (accepted):** manual stock adjustment is the normal way to increase or correct stock. It is independent of the Customer Order Lifecycle (Sections 7/8); both converge only at EP-01's inventory data, which only EP-01 mutates.

---

## 10. Delivery & Review Lifecycle

```
Order reaches "Ready for Delivery" — handover from EP-02
        ↓
Delivery Person Assigned (EP-03, by Admin/Owner)
        ↓
Assigned → Picked Up → Out for Delivery → Delivered
        ↓
Review Eligibility unlocked (tied to a Delivered, verified purchase)
        ↓
Customer submits star rating + written review
        ↓
Review held as "Pending Moderation"
        ↓
Admin approves/rejects/deletes (EP-03, moderation log recorded)
        ↓
Approved review becomes publicly visible; aggregate rating updates
```

**Ownership boundary (corrected):** EP-02 owns the order lifecycle up to the Ready for Delivery handover; EP-03 owns the delivery lifecycle from that handover onward (Assigned → Picked Up → Out for Delivery → Delivered), plus delivery records, delivery status, delivery assignment, review eligibility, customer reviews, and review moderation. EP-03 **may read required order information from EP-02** (e.g., order items and delivery address at handover, and order/delivery-completion status to determine review eligibility) — this is a legitimate read dependency, not full independence. EP-03 does **not** own the main order lifecycle (Pending/Confirmed/Processing remain EP-02's) and does not own or touch Product/Inventory data.

**Product detail page and reviews:** Product information is owned by EP-01; reviews and ratings are owned by EP-03. The customer-facing product detail experience may display both product information and rating/review information together. **The exact technical mechanism for combining this data (e.g., frontend composition, a backend read, or another approach) is not decided at this business-architecture level** and will be defined during detailed API/system architecture design.

---

## 11. Administration & Staff Access

**Owner/Admin entry flow (locked, unchanged):**

```
Customer-facing Storefront
  ↓
Footer
  ↓
Small Shop Logo
  ↓
Admin Access Key input
  ↓
Server-side validation
  ↓
Correct key → Admin Dashboard
Incorrect key → Access denied
```

There is **no username/password Admin Login page** for Owner/Admin access; the key is exclusive to the Owner/Admin and is never shared with Staff.

**Staff access (preserved, not removed):** Staff accounts, JWT, and RBAC remain part of EP-04's architecture, exactly as originally documented in the ISPM proposal. Staff are role-based system users with permissions scoped to their assigned responsibilities. **The exact technical entry mechanism for Staff (as distinct from the Owner/Admin's Access Key) is not invented here** — it remains an open item for future clarification (see Section 12).

---

## 12. RBAC Model (Conceptual)

| Role | Product/Inventory | Orders | Delivery | Reviews | Admin/Staff Mgmt | Store Settings |
|---|---|---|---|---|---|---|
| **Owner/Admin** | Full (via EP-01) | Full | Full | Moderate | Full | Full |
| **Sales/Floor Staff** | View only | Full (operational) | — | — | — | — |
| **Delivery Person** | — | View own assigned | Update own assignment | — | — | — |
| **Customer** | Browse/view | Own orders only | View own delivery | Submit own (eligible) | — | — |

This matrix is conceptual and business-level, not a technical authorization design.

---

## 13. Module Responsibility Matrix

| Actor/Module | Main Responsibility | Owns | Can Modify | Can Only Request/Read | Key Restrictions |
|---|---|---|---|---|---|
| **Customer** | Browse, order, review | Own profile, own cart (session) | Own cart, own profile, own review content | Order creation (via EP-02), stock/availability check (via EP-01) | Cannot access admin functions; cannot complete checkout without login (locked, DEC-02) |
| **EP-01 Product & Catalogue** | Sole product/inventory authority | Product, Category, Inventory/Stock, Availability logic | Its own owned data, in response to valid requests | N/A — it is the terminus of inventory requests, not a requester | Must not be bypassed by direct writes from any other module |
| **EP-02 Customer & Order** | Order lifecycle management (up to handover) | Customer account, Cart, Order, Order status | Its own owned data | Stock decrease/increase (via EP-01) | Must NOT directly modify inventory |
| **EP-03 Delivery & Reviews** | Delivery lifecycle (post-handover) & trust | Delivery, DeliveryStatus, Review, ModerationLog | Its own owned data | Order information (read, from EP-02) | Must NOT own the main order lifecycle or touch Product/Inventory |
| **EP-04 Store Administration** | Admin oversight & shared services | StaffUser, Role/Permission, StoreSettings, ActivityLog | Its own owned data; defines Auth/RBAC/Audit rules | Summary reads from all other modules | Must NOT own other modules' business logic |
| **Delivery Person** | Fulfil assigned deliveries | Nothing (acts on EP-03 data) | Own assigned delivery's status | N/A | No admin access |
| **Store Owner/Admin** | Full oversight | N/A (cross-cutting) | Anything within RBAC-permitted scope | N/A | Enters via Access Key only |
| **Sales/Floor Staff** | Operational support | N/A | Order-related operational data (per RBAC) | N/A | No unrestricted admin; no direct inventory mutation outside authorised system functions |

**Special emphasis — Inventory:** across this entire matrix, exactly one cell ("EP-01 → Can Modify → Its own owned data") represents actual inventory mutation. Every other module touching inventory does so only through the "Can Only Request/Read" column.

---

## 14. Business Capability Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    GEN-Z DIGITAL STOREFRONT                      │
├─────────────────┬─────────────────┬─────────────────┬───────────┤
│  Catalogue &     │  Ordering &      │  Fulfilment &    │  Store    │
│  Inventory       │  Customer Mgmt   │  Trust           │  Admin    │
│  (EP-01)         │  (EP-02)         │  (EP-03)         │  (EP-04)  │
└─────────────────┴─────────────────┴─────────────────┴───────────┘
```

Four core customer-facing/operational capabilities, unchanged; restocking is part of EP-01's Catalogue & Inventory capability.

---

## 15. Data Ownership Model

| Data Object | Owning Module |
|---|---|
| Product | EP-01 |
| Category | EP-01 |
| Inventory/Stock | EP-01 |
| Customer (account) | EP-02 |
| Cart | EP-02 |
| Order | EP-02 |
| Order Item | EP-02 |
| Delivery | EP-03 |
| Review | EP-03 |
| User (Staff/Admin account) | EP-04 |
| Role | EP-04 |
| Permission | EP-04 |
| Store Settings | EP-04 |
| Activity Log | EP-04 |

No object appears twice in this list under two different owners — this is the conceptual guarantee behind "no duplicate Product or Inventory system." No database schema is implied by this table; it records ownership only.

---

## 16. Cross-Module Interaction Model

**Order confirmation**
```
EP-02 → verifies order → requests EP-01.decreaseStock(qty)
     → EP-01 validates and changes inventory
     → EP-02 continues order lifecycle (status → Confirmed → Processing)
```

**Order cancellation**
```
EP-02 → determines whether stock was previously deducted (i.e., was order ≥ Confirmed?)
     → if yes: requests EP-01.increaseStock(qty)
     → if no (still Pending): no request made
```

**Stock replenishment (EP-01 internal)**
```
Owner/Admin → EP-01 manual stock adjustment (new quantity + mandatory reason)
           → EP-01 updates inventory
           → EP-04 Activity Log records the adjustment
```

**Product availability (read path)**
```
Customer → EP-02/Storefront (cart, browsing UI)
        → requests availability from EP-01.getAvailability(productId)
        → EP-01 provides authoritative availability
```

**Order handover to delivery**
```
EP-02 → order status reaches "Ready for Delivery"
      → hands over order/customer/address information to EP-03
EP-03 → reads required order information from EP-02 as needed
      → owns delivery assignment and status from this point forward
```

**Product detail + rating (integration mechanism deferred)**
```
Product Detail Experience → displays EP-01 product data AND EP-03 rating/review data together
                           → exact technical integration mechanism (frontend composition, backend
                             read, or otherwise) is NOT decided at this business-architecture level;
                             to be defined during detailed API/system architecture design
```

**Distinction maintained throughout:** *requesting or reading* from another module's data (EP-02, relative to EP-01; EP-03, relative to EP-02) is architecturally separate from *owning/modifying* that data, which remains exclusively with the owning module in every case above.

---

## 17. High-Level Architecture

```
                         GEN-Z DIGITAL STOREFRONT
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
        CUSTOMER-FACING                             ADMINISTRATIVE
        SIDE (Public,                               SIDE (Protected,
        no-login browsing)                          Access-Key gated)
              │                                           │
              ▼                                           ▼
            EP-02                                       EP-04
        (Customer &                                 (Store Admin,
         Order Mgmt,                                 shared Auth/
         up to handover)                             RBAC/Audit)
              │                                           │
              └───────────────→ EP-01 ←───────────────────┘
                        Product & Inventory
                      (SOLE OWNER — all requests
                       converge here; only EP-01
                       performs mutations)
                               │
                               │ (read, for rating display —
                               │  mechanism TBD)
                               ▼
                             EP-03
                     Delivery + Reviews
               (owns delivery lifecycle from
                "Ready for Delivery" handover;
                reads order info from EP-02;
                independent of Product/Inventory
                ownership)
```

**Trust/security boundaries:**
- **Public boundary:** guest/customer browsing — no authentication.
- **Customer account boundary:** login required at checkout and for account-specific functions (order history, reviews) — locked, DEC-02.
- **Admin/Owner boundary:** Access Key gate — separate from, and stricter than, the customer boundary.
- **Staff boundary:** existing JWT/RBAC-based authentication, operating inside the administrative side once past whatever staff-specific entry mechanism is eventually defined (open item, Section 12/18).

**Module communication:** EP-02 communicates with EP-01 for product and stock operations; EP-03 communicates with EP-02 (reads order information at and after handover) and, for rating display, with EP-01 via a mechanism to be defined later; EP-04 communicates read-only with all other modules for dashboard aggregation and provides the shared Auth/RBAC/Audit layer consumed by all.

---

## 18. Three-Tier Architecture Mapping

### Presentation Layer (React.js)
- **Customer interfaces:** storefront (guest-accessible), cart, checkout/login gate, order history, delivery tracking, review submission.
- **Admin/staff interfaces:** Access-Key entry screen, admin dashboard, product/stock/order/delivery/review management screens, staff/role management, store settings, activity log.

### Application/API Layer (Node.js + Express.js)
- REST APIs organised internally by module (EP-01, EP-02, EP-03, EP-04 route groups).
- Business rules enforced per module (e.g., EP-02's Confirmed-transition triggers a call to EP-01's inventory logic).
- Shared cross-cutting concerns: Authentication (Access Key validation + Staff JWT/RBAC), Authorization middleware, Audit logging, Notification/validation/error-handling conventions.

### Data Layer (MySQL)
- One schema, internally organised by the ownership model in Section 15 — not multiple databases or duplicate stores.

### External Services
- **WhatsApp** — checkout/order communication (pre-filled message).
- **Cloudflare R2** — product/image storage.

The four modules remain **internal organisational boundaries within one application**, not separate deployed applications — this is a deliberate architectural choice consistent with the three-person team's need to work in parallel on one cohesive product rather than genuinely distributed services.

---

## 19. External Services

| Service | Used By | Purpose |
|---|---|---|
| **WhatsApp** | EP-02 | Pre-filled checkout message; customer-to-store order communication channel |
| **Cloudflare R2** | EP-01 | Product image storage and delivery |

No other external systems are introduced by this model.

---

## 20. Key Business Rules (Centralized)

1. EP-01 owns Product and Inventory — sole owner, no exceptions.
2. Pending orders do not deduct stock — **locked (DEC-04)**.
3. Admin confirmation triggers stock deduction — **locked (DEC-04)**.
4. Confirmed/later cancellation restores deducted stock — **locked (DEC-04)**, restoration mechanics per working decision DEC-06.
5. Pending cancellation does not restore stock — nothing was deducted — **locked (DEC-04)**.
6. Stock is increased or corrected through EP-01's manual stock adjustment, which requires a reason and is recorded in the Activity Log — accepted (revised DEC-05).
7. Customers may browse without authentication — locked.
8. Login/registration is required before checkout/order creation — **locked (DEC-02)**.
9. Owner/Admin uses the Admin Access Key — no username/password page — locked.
10. Staff retain accounts/RBAC — not removed by the Access Key correction — locked.
11. Protected administrative functions require authorization (uniformly, across all modules) — locked.
12. EP-02 does not directly modify inventory — it requests operations from EP-01 — locked.

---

## 21. Integration Points

| # | Source | Target | Trigger | Data Exchanged |
|---|---|---|---|---|
| 1 | EP-02 | EP-01 | Order confirmed | productId, quantity → decreaseStock |
| 2 | EP-02 | EP-01 | Confirmed order cancelled | productId, quantity → increaseStock |
| 3 | EP-02/Storefront | EP-01 | Any browsing/cart action | productId → getAvailability |
| 4 | EP-02 | EP-03 | Order reaches "Ready for Delivery" | orderId, items, delivery address — handover |
| 5 | EP-03 | EP-02 | Review eligibility check | orderId, delivery-completion status (read) |
| 6 | Product Detail Experience | EP-01 + EP-03 | Product detail page render | product data (EP-01) + rating/review data (EP-03) — integration mechanism TBD |
| 7 | EP-04 (shared) | All modules | Every admin-facing request | Access-Key/RBAC session validation |
| 8 | All modules | EP-04 (Audit Log) | Any admin-relevant action, including manual stock adjustments | actor, action, timestamp, entity, reason/context |
| 9 | EP-04 dashboard | EP-01, EP-02, EP-03 | Dashboard load | Read-only summary counts/statuses |

---

## 22. Consistency / Conflict Check

A review was performed across epic ownership, inventory ownership, customer/order flow, stock replenishment, admin/staff access, RBAC, stock deduction, delivery, and review areas. Findings:

| Area | Result |
|---|---|
| Epic ownership | No conflict — EP-01–EP-04 boundaries unchanged and consistently applied throughout this model |
| Inventory ownership | No conflict — EP-01 sole owner in every section (6–17) |
| Customer/order flow | No conflict — DEC-02 (login-at-checkout) consistently applied and correctly stated as locked throughout |
| Stock replenishment | No conflict — manual stock adjustment (revised DEC-05) is EP-01-internal, reason-mandatory and audited |
| EP-02/EP-03 boundary | Corrected — EP-03 is no longer described as fully independent of EP-02; the handover and read-dependency are now explicit |
| Admin/staff access | No conflict in structure; the *exact* staff entry mechanism remains undefined — correctly listed as an open item, not a locked decision |
| RBAC | Conceptually consistent (Section 12) |
| Stock deduction | No conflict — DEC-04 applied identically and correctly stated as locked in Sections 6, 7, 8, 17, 20 |
| Delivery | No conflict — EP-03's corrected boundary (owns delivery/review, reads order info) applied consistently |
| Review | No conflict — verified-purchase/moderation pattern unchanged; rating-integration mechanism correctly left open rather than assumed |

---

## 23. Status Classification

### LOCKED PROJECT DECISIONS
- DEC-02 — Option B (login/registration required before checkout; browsing remains open to guests)
- DEC-04 — Option C (stock deducted only at Admin confirmation)
- Admin Access Key flow (Owner/Admin entry)
- Four approved epics remain unchanged and form the complete final scope
- EP-01 is the sole Product/Inventory owner
- DEC-05 (revised) — manual stock adjustment, with a mandatory reason and Activity Log entry, is the normal restocking path

### WORKING TEAM DECISIONS
(Can guide architecture and downstream design unless later changed by the team)
- DEC-06 — Stock restoration mechanics on cancellation

### OPEN / NEEDS FUTURE CLARIFICATION
- Exact Staff authentication entry mechanism (distinct from the Owner/Admin Access Key)
- Guest cart persistence through the login/register step
- Exact WhatsApp integration mechanism (client-side link vs. formal API)
- Exact technical mechanism for combining EP-01 product data with EP-03 rating/review data on the product detail page
- Any other genuinely unresolved technical decision surfaced during detailed architecture/API design

---

## 24. Final Integrated Architecture Summary

The Gen-Z Digital Storefront is organised as **one cohesive application** internally divided into four approved epics, all converging on a single, non-duplicated Product/Inventory system owned exclusively by EP-01. Customer ordering (EP-02) requests stock changes through EP-01's inventory interface, and restocking is EP-01's own audited manual stock adjustment; the same availability logic applies regardless of what triggered a stock change. Delivery and review (EP-03) begin at the "Ready for Delivery" handover from EP-02 and own the fulfilment and trust experience from that point forward, reading order information from EP-02 as needed. Administration (EP-04) provides both the operational oversight dashboard and the shared Auth/RBAC/Audit foundation every other module relies on, while preserving the Owner/Admin Access Key as the sole administrative entry mechanism and retaining the originally documented Staff/JWT/RBAC model beneath it.

**DEC-02 and DEC-04 are locked project decisions for the current architecture baseline.** Guest browsing with login required only at checkout (DEC-02), and stock deduction occurring only at Admin order confirmation (DEC-04), govern the customer-facing side of this model and are treated as settled for the purposes of proceeding into detailed architecture, database design, and API design. A small number of genuinely open items (Section 23) remain for future clarification and do not block progression to the next stage.

---

*No database schema, API specification, folder structure, or code has been created in this task. This document is a conceptual business/architecture reference model only.*
