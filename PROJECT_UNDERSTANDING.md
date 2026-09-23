# PROJECT_UNDERSTANDING.md

**Gen-Z Digital Storefront — Current Understanding Checkpoint (Revision 2)**

> This document is **not** a new requirements document and introduces **no new requirements, features, epics, or approved decisions**. It restates the current shared understanding across the ISPM Sprint 0 Proposal, the EA Business Architecture Assessment Report, the Phase 1 Requirements Baseline (Revisions 1 & 2), the Phase 2 Architecture Design (Corrected), and the subsequent Decision-Resolution work (DEC-01 through DEC-15, and the DEC-02/DEC-04 Consistency Update). Items marked as **working decisions** are recommendations only and remain pending supervisor and/or team confirmation — they are not approved requirements.

---

## 1. Project Overview

Gen-Z is a men's, boys' clothing and perfume retail store operating in Sri Lanka, currently reliant on a physical outlet and informal, manual processes (phone calls, word-of-mouth, WhatsApp messages) for product information, ordering, and customer communication. The project — **"A Modern Digital Storefront for Gen-Z"** — is a university academic project (Project ID: ISE_WE_0201_58) to digitise this retail operation as a web-based e-commerce platform, delivered over 13 weeks across 5 sprints by a 3-person Scrum team.

## 2. Project Objective

To design and develop a functional, web-based e-commerce platform that digitises Gen-Z's product catalogue management, WhatsApp-based customer ordering, delivery tracking, customer review management, and administrative operations — giving the store owner a centralised self-service dashboard and customers a 24/7 digital shopping experience, within the academic project timeline.

## 3. Approved Technology Stack

- **Frontend:** React.js (v18+)
- **Backend:** Node.js + Express.js, RESTful API
- **Database:** MySQL (relational)
- **Image storage:** Cloudflare R2 (S3-compatible object storage)
- **Authentication:** JWT and RBAC were originally documented in the ISPM proposal for administrator dashboard access generally. This has since been **corrected for Owner/Admin entry specifically** — see Section 16 (Admin Access Key Flow). JWT/RBAC remain in place for **Staff** accounts and for governing what an authenticated session can do (Section 17). The exact technical mechanism for Staff authentication is **not yet defined** — see Section 23, DEC-01.
- **Checkout channel:** WhatsApp-based pre-filled message generation (not a confirmed server-side WhatsApp Business API integration — see Section 24, Assumptions)
- **Hosting:** free-tier PaaS (e.g., Render/Railway/Vercel) and free-tier managed MySQL (e.g., Supabase/Neon)
- Explicitly excluded from Phase 1: online payment gateway, native mobile application, advanced delivery logistics beyond status updates, refund/dispute resolution

## 4. Approved Four Epics

These four epics are the original, approved academic scope and **remain unchanged** throughout all subsequent architecture and decision work:

### EP-01 — Product & Catalogue Management
Product CRUD (with images, description, price, stock), category/tag organisation, customer browsing/search/filter, product detail view, automatic In Stock/Out of Stock status derived from inventory.

### EP-02 — Customer & Order Management
Shopping cart, WhatsApp-based checkout message generation, automatic order record creation, order status workflow (Pending → Confirmed → Processing → Ready for Delivery), customer order history.

### EP-03 — Delivery Tracking with Review Management
Delivery person assignment, delivery status workflow (Assigned → Picked Up → Out for Delivery → Delivered), customer-facing delivery tracking, star rating/written review submission, review moderation (Pending Moderation → Approved/Rejected), static page content management (About/Contact).

### EP-04 — Store Administration Management
Staff/admin account management, role and permission assignment, unified operational dashboard, store-wide settings configuration, activity/audit logging.

## 5. Scope Change — Academic Traceability Note

During development, an additional Supplier & Procurement peer module was reviewed, designed and prototyped alongside the four approved epics. On 2026-09-14 it was **descoped from the final project scope**: its code, database tables, API endpoints, frontend pages, tests and design-document sections were removed. It is **not** a feature of the final system. The final system consists solely of EP-01 to EP-04 (Section 4). Decisions that applied only to that module (DEC-03 and DEC-07 to DEC-15) are withdrawn, and DEC-05 is revised (Section 23).

## 6. Stock Replenishment in the Final System (Revised DEC-05)

With no procurement module, stock is increased or corrected through EP-01's own **manual stock adjustment** (`PATCH /products/:id/stock`). This is the normal restocking path. It is restricted to an authenticated Admin session holding `PRODUCT_MANAGE`, requires a mandatory reason, and every adjustment is written to the central Activity Log. The only other stock increase is EP-02's order-cancellation restoration, which EP-01 performs on EP-02's request.

## 7. Product Ownership

**EP-01 is the sole owner of the Product entity.** No other module — including EP-02 — may own, duplicate, or maintain a separate Product record. Other modules reference EP-01's Product by identity (read access) and interact with it only through EP-01's exposed interfaces.

## 8. Inventory/Stock Ownership

**EP-01 is the sole owner of Inventory/Stock.** There must be **ONE** inventory system for the entire application:

- EP-02 (Customer & Order) **requests** stock decreases (and cancellation restorations) through EP-01's ownership — it never writes to inventory data directly.
- Restocking and corrections are EP-01's own manual stock adjustment (revised DEC-05, Section 6).
- No module writes directly to Inventory/Stock data except EP-01 itself.

## 9. Availability Logic

Product availability (In Stock / Out of Stock) is derived automatically from the Inventory/Stock quantity, and this logic exists in exactly **one place**, owned by EP-01. Whether stock changes because of a customer order (decrease), an order cancellation (restoration) or a manual stock adjustment (increase/correction), the same single availability rule recalculates the result — there is no second, order-specific availability engine.

## 10. Customer/Guest Flow

- A **guest** (unauthenticated visitor) can browse the storefront, search, filter, view product details, prices, and availability, and build a cart — **no login required** for any of this.
- **Working decision (DEC-02, Option B — pending supervisor confirmation):** login or registration is required **at the point the customer proceeds to complete checkout**, not merely for browsing or cart-building. Guest checkout is **not** supported under this working decision.
- Authentication is also required for other account-specific functions: viewing one's own order history, one's own profile, and submitting/viewing one's own reviews.
- The resulting order must be associated with the authenticated customer account so it can later appear in that customer's order history (US-13).
- **Open gap (not resolved by DEC-02):** whether an already-built guest cart persists across the login/registration step, or must be rebuilt afterward, is not addressed by any source document — flagged in Section 23/26, not decided here.

## 11. Order Flow

```
Customer/Guest → Product Catalogue → Product Availability → Cart → Login/Register (DEC-02) → WhatsApp Checkout → Order (Pending) → Admin Stock Verification → Order (Confirmed) → Stock Deduction (DEC-04) → Processing → Ready for Delivery → Delivery → Review
```

- Order status progression: **Pending → Confirmed → Processing → Ready for Delivery** (this is where EP-02's responsibility ends) — unchanged from original scope.
- **Working decision (DEC-04, Option C — pending supervisor confirmation):** stock is decremented **only** when Admin confirms the order (Pending → Confirmed transition), not at cart-add, checkout-initiation, or order creation. A Pending order causes no stock change.
- **Cancellation behaviour tied to DEC-04:** if a **Pending** order is cancelled/rejected, no stock restoration occurs (nothing was deducted). If a **Confirmed** (or later) order is cancelled, EP-01 restores the previously deducted quantity on EP-02's request.

## 12. Delivery Flow

Once an order reaches "Ready for Delivery," EP-03 takes over, unchanged by any decision work:

```
Order Ready for Delivery → Delivery Person Assigned → Assigned → Picked Up → Out for Delivery → Delivered
```

Customers can track delivery status once logged in (delivery tracking is treated as an account-specific function per Section 10).

## 13. Review and Moderation Flow

A customer can submit a star rating and written review, tied to a completed (Delivered) purchase (a "verified-purchase" pattern, per the EP-03 Definition of Done). Submitted reviews are held as **Pending Moderation** and only become publicly visible after explicit admin approval; the aggregate rating updates automatically upon publication. All moderation actions (approve/reject/delete) must be logged, recording either the Staff/Admin User or the Owner/Admin who acted (Actor Identity Decision, added 2026-09-08 — Physical Schema V1.0 §5b). Otherwise unchanged by any decision work.

## 14. Stock Replenishment Flow

```
Owner/Admin (PRODUCT_MANAGE) → Manual Stock Adjustment (new quantity + mandatory reason) → EP-01 Inventory/Stock update (transactional) → Product Availability recalculated (EP-01) → Activity Log entry (EP-04)
```

- This is the normal way to increase or correct stock in the final system (revised DEC-05).
- It is independent of, and unaffected by, DEC-02 and DEC-04, which concern the customer-order side only.

## 15. Admin Dashboard and Administration Responsibilities

EP-04 owns: staff/admin account management, role/permission assignment, store-wide settings, and activity/audit logging. Its unified dashboard is understood to summarise operational data (product counts, pending orders, delivery statuses, pending reviews) drawn read-only from other modules. EP-04 does not take ownership of the business logic it summarises.

## 16. Admin Access Key Flow

There is **no conventional username/password Admin Login page for Owner/Admin access**. The approved flow is:

```
Customer-facing Storefront
→ Footer
→ Small Shop Logo
→ Admin Access Key input
→ Validate specific key (server-side)
→ Correct key → direct access to Admin Dashboard
→ Incorrect key → access denied
```

- The logo is a discreet entry point, not a labelled "Admin Login" link.
- The key itself is the access mechanism — there is no second authentication step after it.
- The key must never be exposed on the public storefront or hardcoded into frontend-visible material; validation occurs server-side only.
- Every admin page and protected admin operation must be unreachable without successful key validation.
- **The Access Key is exclusive to the Shop Owner/Admin.** Staff do **not** receive or share this key.

## 17. Authentication / Authorization / RBAC Understanding

- **Owner/Admin access** is governed by the single Access Key flow above — no username/password page exists for this entry point.
- **Staff accounts, JWT, and RBAC remain in place**, as explicitly stated in the original ISPM proposal — these were **not** removed by the Access Key correction, only reinterpreted to apply to Owner/Admin entry differently than originally assumed.
- **A conflict was identified and resolved by interpretation, not by silent modification:** the ISPM proposal's generic wording — *"a protected administrator dashboard accessible exclusively to authorized store personnel"*, backed by JWT/RBAC — conflicts with the later Access Key correction if read as applying identically to all administrator access. The resolution adopted: **the Access Key flow supersedes the generic wording specifically for Owner/Admin entry; the JWT/RBAC/staff-account model remains valid and unremoved for Staff.**
- **The exact technical mechanism by which Staff authenticate is not yet defined** by any source document and has not been invented — this is DEC-01, pending supervisor confirmation (Section 23).
- RBAC is understood to govern what an authenticated session (Owner/Admin or Staff) can do once inside the Admin Dashboard, and is understood to apply uniformly across every admin-facing endpoint in every module (EP-01–EP-04) via a shared authorization mechanism, not a separate check per module.
- **Customer authentication** is separate from admin authentication. Per the DEC-02 working decision, it is required at checkout (not merely for browsing) and for other account-specific functions (Section 10).

## 18. Audit Logging

EP-04 owns activity/audit logging (US-25, original scope). A single central log records auditable actions from all four epics — including every manual stock adjustment, together with its mandatory reason.

## 19. External Services and Integrations

- **Cloudflare R2** — object storage for product images (EP-01).
- **WhatsApp** — customer checkout communication channel via a pre-filled message (EP-02); the precise technical mechanism (simple client-side link vs. a formal WhatsApp Business API integration) remains unresolved and flagged under Assumptions (Section 24), not settled here.

## 20. Important Architectural Boundaries

- **ONE Product system, ONE Inventory/Stock system** — both owned exclusively by EP-01.
- EP-02 interacts with Product/Inventory only through EP-01's owned interfaces (conceptually: `decreaseStock`, `increaseStock`, `getAvailability`, `getProduct`) — never through direct data ownership or duplicate storage.
- EP-01's product detail page may display an aggregate rating sourced from EP-03; this is handled as **frontend-level composition** (the page calls both EP-01's and EP-03's APIs independently and combines the results) — not a backend-level dependency. EP-01's core Product/Inventory logic remains fully independent.
- A single shared Auth/RBAC/Audit layer is understood to implement the business rules EP-04 defines, consumed by all modules — this is a shared, cross-cutting implementation, not logic owned exclusively inside EP-04's own module code.
- A shared UI/UX design system is expected to span all modules so the application built by three separate developers reads as one cohesive product.

## 21. Explicitly Prohibited/Rejected Approaches

- A conventional username/password Admin Login page for Owner/Admin access — **rejected**, replaced by the Access Key flow.
- A separate/duplicate Product or Inventory system in any module — **rejected**; single ownership by EP-01 only.
- Requiring login for basic storefront browsing (catalogue, search, filter, product detail/price/availability) — **rejected**; these must remain guest-accessible.
- Guest checkout (order completion without an account) — **rejected under the DEC-02 working decision** (pending supervisor confirmation).
- Removing Staff accounts, RBAC, or JWT as a consequence of the Admin Access Key correction — **rejected**; these remain in place for Staff.

## 22. Decisions Already Confirmed

*(Structural/architectural rules established with high confidence from source documents — distinct from the working business-rule decisions in Section 23.)*

- Product and Inventory are owned exclusively by EP-01.
- Admin/Owner access is via a single Access Key (footer logo entry point), not username/password.
- Staff accounts, JWT, and RBAC remain in place and are not removed by the Access Key correction.
- Guest browsing requires no login.
- The final system scope is exactly the four approved epics, EP-01 to EP-04 (scope change recorded in Section 5).
- The four-epic structure, single Product/Inventory ownership, current developer assignments, and a shared UI/UX design system are preserved in the architecture.
- Developer ownership: Dev 1 → EP-01; Dev 2 → EP-02; You → EP-03, EP-04, and shared architecture/integration.
- EP-01's product detail page composes EP-03 rating data at the frontend level only; no backend dependency exists between them.
- **DEC-16 — Actor Identity (Owner/Admin vs. Staff/Admin User), resolved 2026-09-08.** Owner/Admin and Staff/Admin User remain distinct identity models; Owner/Admin never receives a `staff_admin_users` row. Moderation Log's Actor gains a paired `actor_type` (Staff/Admin User vs. Owner/Admin) attribute so Owner/Admin can exercise its already-granted RBAC authority over review moderation without an invalid Staff FK; Owner/Admin actions are audited via the existing Activity Log. Full detail: Physical Schema V1.0 §5b, Logical Database Design V1.1 §C4, Database Architecture V1.1 §21a. Unlike DEC-01 through DEC-15, this is a formally approved architecture decision by the project owner, not a working recommendation.

## 23. DECISION REQUIRED Items

### Flagged for Supervisor Confirmation

- **DEC-01 — Admin Access Key vs. Staff authentication mechanism.** Working direction: Access Key exclusive to Owner/Admin; Staff retain existing accounts/RBAC; exact Staff authentication mechanism not yet defined. **Pending supervisor confirmation** — this reconciles a post-submission correction with the originally graded ISPM document's wording.
- **DEC-02 — Guest checkout.** Working decision: **Option B** — login/registration required at checkout, not at browsing. **Pending supervisor confirmation.**
- **DEC-04 — Stock deduction trigger.** Working decision: **Option C** — stock decreases only at Admin confirmation (Pending → Confirmed). **Pending supervisor confirmation**, given its impact on both EP-01 and EP-02's core logic.

### Team-Level Working Decisions (recommended, not yet formally approved)

- **DEC-05 (revised 2026-09-14, accepted)** — Manual stock adjustment, with a mandatory reason and Activity Log entry, is the normal way to increase or correct stock (Section 6).
- **DEC-06** — Confirmed-order cancellation restores stock; Pending-order cancellation does not (Option A, contingent on DEC-04).
- **DEC-03, DEC-07 to DEC-15** — Withdrawn: they applied only to the descoped module recorded in Section 5.

### Additional Open Gap (not a numbered DEC item)

- Whether a guest-built cart persists through the DEC-02 login/registration step, or must be rebuilt afterward — not addressed by any source document.

**None of the above — including the three flagged for supervisor confirmation — should be treated as finalized, approved requirements.** They are working recommendations only.

## 24. Assumptions

*(Included only where an assumption was explicitly identified as such in prior analysis — not new assumptions.)*

- It was previously noted that the WhatsApp checkout mechanism described (a pre-filled message) is most consistent with a simple client-side link approach rather than a formal WhatsApp Business API integration, based on the LKR 0 budget line for this item — but this was flagged as needing confirmation, not treated as settled. **NEEDS CLARIFICATION.**
- It was previously inferred that "Staff/Admin User" (ISPM, EP-04) and "Sales/Floor Staff" (EA report) may refer to the same real-world actor described in two different framings — this was flagged as an inference, not confirmed by either source document. **NEEDS CLARIFICATION.**

## 25. Current Project Status

The project has completed:
- Sprint 0 requirements deliverables (ISPM proposal, EA Business Architecture Assessment Report) for the original four-epic scope.
- Phase 1 Requirements Baseline, Revisions 1 and 2 (traceability matrix, scope classification, business rules, actor/permission matrix, functional requirements, acceptance criteria, workflows, integration requirements, NFRs, developer ownership, risk assessment, decision log).
- Phase 2 Architecture Design, including a Corrected version addressing seven validation findings (EP-01/EP-03 dependency disclosure, PO-editing decision status, Goods Receiving quantity decision status, expanded decision log, EP-04/shared-service clarification, permission-matrix caveat).
- A full Decision-Resolution exercise (DEC-01 through DEC-15) cross-checking all fifteen unresolved items against every source document, distinguishing explicit requirements from inference, team decisions, and supervisor-confirmation items, and identifying/resolving-by-interpretation (not silently) the ISPM/Access-Key conflict.
- A Consistency Update confirming that the DEC-02 (Option B) and DEC-04 (Option C) working decisions integrate cleanly with the four approved epics and EP-01's inventory ownership, with no new conflicts introduced.

No database schema, API design, folder/project structure, or code has been created at any point.

## 26. Recommended Next Step

Obtain supervisor confirmation on **DEC-01, DEC-02, and DEC-04** — these are the items with academic-traceability or high architectural impact. In parallel or afterward, the team can confirm the twelve team-level working decisions (DEC-03, DEC-05–DEC-15). The unaddressed cart-persistence-through-login gap (Section 23) should also be settled before Phase 3. Once these are resolved, the project can proceed to Phase 3 (Database & API Design) with a fully confirmed requirements and decision baseline.

---

## UNDERSTANDING CHECKPOINT

A concise checklist to verify before proceeding — please confirm or correct each item:

- [ ] The four approved epics (EP-01–EP-04) remain exactly as originally scoped and form the entire final system — nothing added, removed, or redesigned within them.
- [ ] EP-01 is the **sole owner** of both Product and Inventory/Stock — no other module stores, duplicates, or directly writes to this data.
- [ ] EP-02 requests stock decreases/restorations **only through EP-01's ownership**; restocking is EP-01's manual stock adjustment with a mandatory reason (revised DEC-05).
- [ ] There is **no** conventional username/password Owner/Admin Login — only the Footer → Shop Logo → Access Key → Dashboard/Denied flow, and the key is exclusive to the Owner/Admin.
- [ ] Staff accounts, JWT, and RBAC **remain in place** — the Access Key correction did not remove them; the exact Staff authentication mechanism is still undefined (DEC-01).
- [ ] Guests can browse, search, filter, and view product detail/price/availability **without logging in**; under the working DEC-02 decision, login/registration is required **at checkout**, not before.
- [ ] Under the working DEC-04 decision, stock is deducted **only at Admin confirmation**, not at Pending order creation; Confirmed-order cancellation restores stock, Pending-order cancellation does not.
- [ ] Developer ownership is: Dev 1 → EP-01; Dev 2 → EP-02; You → EP-03, EP-04, and shared architecture/integration.
- [ ] **DEC-01, DEC-02, and DEC-04 are working recommendations pending supervisor confirmation** — not yet approved requirements.
- [ ] **DEC-05 (revised) is accepted; DEC-06 is a working team-level recommendation; DEC-03 and DEC-07 to DEC-15 are withdrawn.**
- [ ] No database schema, API design, folder structure, or code exists yet — the project remains at the requirements/architecture understanding stage.

---

*This document is a checkpoint of existing understanding only, incorporating working decisions pending confirmation. No new requirements, features, epics, or approved decisions have been introduced.*
