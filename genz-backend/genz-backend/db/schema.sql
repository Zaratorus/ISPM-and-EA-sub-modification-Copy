-- =====================================================================
-- GEN-Z DIGITAL STOREFRONT — PHYSICAL MYSQL SCHEMA — VERSION 1.0
-- Generated from Physical MySQL Database Schema Design V1.0
-- Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_0900_ai_ci
-- =====================================================================

CREATE DATABASE IF NOT EXISTS genz_digital_storefront
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE genz_digital_storefront;

-- =====================================================================
-- MODULE A — EP-01 PRODUCT & CATALOGUE MANAGEMENT
-- =====================================================================

CREATE TABLE categories (
    category_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE,
    description     VARCHAR(500) NULL,
    -- Which fixed chip set (if any) PDP/the shop filter bar render for
    -- products in this category — NONE for anything that isn't sized
    -- (e.g. Perfumes). The label sets themselves are fixed constants
    -- (shared/constants/variants.js), not stored per-category/product.
    variant_type    ENUM('NONE','SIZE','AGE') NOT NULL DEFAULT 'NONE',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE products (
    product_id      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id     BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(150) NOT NULL,
    description     TEXT NULL,
    price           DECIMAL(10,2) NOT NULL,
    -- Free-text brand label (e.g. "Polo", "Wild Stone") — not a separate
    -- Brand entity/table, since the catalogue has no other brand-owned data
    -- (logo, description, etc.) to justify one. Nullable: existing products
    -- predate this field and older/undecided items may simply have none.
    brand           VARCHAR(100) NULL,
    status          ENUM('ACTIVE','DISCONTINUED') NOT NULL DEFAULT 'ACTIVE',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_products_price_positive CHECK (price > 0),
    CONSTRAINT fk_products_category
        FOREIGN KEY (category_id) REFERENCES categories(category_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    INDEX idx_products_category_status (category_id, status),
    INDEX idx_products_name (name),
    INDEX idx_products_brand (brand)
) ENGINE=InnoDB;

CREATE TABLE product_images (
    product_image_id   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id         BIGINT UNSIGNED NOT NULL,
    image_reference     VARCHAR(500) NOT NULL,
    sort_order          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_images_product
        FOREIGN KEY (product_id) REFERENCES products(product_id)
        ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- Deliberately NOT a full per-variant inventory ledger (no quantity column):
-- the chip selector only needs to know which of the category's fixed
-- labels are unavailable for a given product. Presence of a row means
-- that label is out of stock; everything else is assumed available.
CREATE TABLE product_out_of_stock_variants (
    product_id      BIGINT UNSIGNED NOT NULL,
    variant_label   VARCHAR(20) NOT NULL,
    PRIMARY KEY (product_id, variant_label),
    CONSTRAINT fk_oos_variants_product
        FOREIGN KEY (product_id) REFERENCES products(product_id)
        ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE inventory_stock (
    product_id          BIGINT UNSIGNED PRIMARY KEY,
    quantity            INT UNSIGNED NOT NULL DEFAULT 0,
    availability_status ENUM('IN_STOCK','OUT_OF_STOCK')
        GENERATED ALWAYS AS (IF(quantity > 0, 'IN_STOCK', 'OUT_OF_STOCK')) STORED,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_inventory_quantity_nonnegative CHECK (quantity >= 0),
    CONSTRAINT fk_inventory_stock_product
        FOREIGN KEY (product_id) REFERENCES products(product_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    INDEX idx_inventory_stock_availability (availability_status)
) ENGINE=InnoDB;

-- =====================================================================
-- MODULE D — EP-04 STORE ADMINISTRATION (created before B/C, which reference it)
-- =====================================================================

CREATE TABLE roles (
    role_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE permissions (
    permission_id   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
    role_id         BIGINT UNSIGNED NOT NULL,
    permission_id   BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_role_permissions_role
        FOREIGN KEY (role_id) REFERENCES roles(role_id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_role_permissions_permission
        FOREIGN KEY (permission_id) REFERENCES permissions(permission_id)
        ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE staff_admin_users (
    staff_admin_user_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    role_id                 BIGINT UNSIGNED NOT NULL,
    name                    VARCHAR(150) NOT NULL,
    credentials_reference   VARCHAR(255) NULL,           -- OPEN: staff auth mechanism (see Section 8, item 1)
    status                  ENUM('ACTIVE','DEACTIVATED') NOT NULL DEFAULT 'ACTIVE',
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_staff_admin_users_role
        FOREIGN KEY (role_id) REFERENCES roles(role_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE store_settings (
    store_settings_id   TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
    store_name           VARCHAR(150) NOT NULL,
    contact_info          VARCHAR(255) NOT NULL,
    whatsapp_number        VARCHAR(30) NOT NULL,
    updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_store_settings_singleton CHECK (store_settings_id = 1)
) ENGINE=InnoDB;

CREATE TABLE admin_access_key (
    admin_access_key_id   TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
    access_key_hash        VARCHAR(255) NOT NULL,        -- OPEN: hashing mechanism (see Section 8, item 7)
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_admin_access_key_singleton CHECK (admin_access_key_id = 1)
) ENGINE=InnoDB;

CREATE TABLE activity_log (
    activity_log_id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_type              ENUM('STAFF_ADMIN_USER','OWNER_ADMIN','SYSTEM') NULL,
    actor_id                 BIGINT UNSIGNED NULL,        -- intentionally unenforced (polymorphic) — see Section 3/9
    action_type              VARCHAR(100) NOT NULL,
    affected_entity_type      VARCHAR(100) NOT NULL,
    affected_entity_id        BIGINT UNSIGNED NOT NULL,   -- intentionally unenforced (polymorphic) — see Section 3/9
    originating_module        ENUM('A','B','C','D','E') NOT NULL,  -- 'E' retained for historical compatibility only;
                                                             -- the application writes A-D (EP-01..EP-04)
    context_note               VARCHAR(500) NULL,
    `timestamp`                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_activity_log_timestamp (`timestamp`),
    INDEX idx_activity_log_module (originating_module),
    INDEX idx_activity_log_entity (affected_entity_type, affected_entity_id)
) ENGINE=InnoDB;

-- =====================================================================
-- MODULE B — EP-02 CUSTOMER & ORDER MANAGEMENT
-- =====================================================================

CREATE TABLE customers (
    customer_id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name                     VARCHAR(150) NOT NULL,
    contact_info              VARCHAR(255) NOT NULL,      -- NOT unique (see Section 3 note; DEC removed in Logical Design V1.1)
    credentials_reference      VARCHAR(255) NOT NULL,
    status                     ENUM('ACTIVE','DEACTIVATED') NOT NULL DEFAULT 'ACTIVE',
    created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_customers_contact_info (contact_info)
) ENGINE=InnoDB;

-- Customer self-service password reset (emailed one-time code). Physical-only
-- support structure for the Customer entity: stores only the bcrypt hash of
-- each code, never the code. A newer code ends older unused ones by setting
-- expires_at = NOW(); used_at marks the single successful use. Rows are kept
-- as history (the per-hour request limit is counted from them).
CREATE TABLE IF NOT EXISTS customer_password_resets (
    password_reset_id     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id            BIGINT UNSIGNED NOT NULL,
    otp_hash                VARCHAR(255) NOT NULL,
    expires_at               DATETIME NOT NULL,
    failed_attempts           TINYINT UNSIGNED NOT NULL DEFAULT 0,
    used_at                    DATETIME NULL,
    created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_customer_password_resets_customer
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    INDEX idx_customer_password_resets_customer_created (customer_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE carts (
    cart_id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id     BIGINT UNSIGNED NULL,                 -- OPEN: guest cart persistence (see Section 8, item 2)
    status          ENUM('ACTIVE','CONVERTED','ABANDONED') NOT NULL DEFAULT 'ACTIVE',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_carts_customer
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
        ON DELETE SET NULL ON UPDATE RESTRICT,
    INDEX idx_carts_customer_status (customer_id, status)
) ENGINE=InnoDB;

CREATE TABLE cart_items (
    cart_item_id    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cart_id         BIGINT UNSIGNED NOT NULL,
    product_id      BIGINT UNSIGNED NOT NULL,
    quantity        INT UNSIGNED NOT NULL,
    -- '' (not NULL) for products with no size/age selector (variant_type
    -- NONE) — kept NOT NULL so the uniqueness rule below behaves
    -- predictably: MySQL treats NULL as distinct-from-itself in a unique
    -- key, which would silently defeat the "one row per product" rule for
    -- every unsized product. '' collapses to the same row every time, same
    -- as before this column existed.
    variant_label   VARCHAR(20) NOT NULL DEFAULT '',
    CONSTRAINT chk_cart_items_quantity_positive CHECK (quantity > 0),
    CONSTRAINT fk_cart_items_cart
        FOREIGN KEY (cart_id) REFERENCES carts(cart_id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_cart_items_product
        FOREIGN KEY (product_id) REFERENCES products(product_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    -- Different sizes of the same product are now separate lines; same
    -- product + same size (or both unsized) still accumulates onto one row.
    UNIQUE KEY uq_cart_items_cart_product_variant (cart_id, product_id, variant_label)
) ENGINE=InnoDB;

CREATE TABLE orders (
    order_id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id                  BIGINT UNSIGNED NOT NULL,
    delivery_address              VARCHAR(500) NOT NULL,  -- project-owner amendment: captured at checkout,
                                                            -- snapshotted into deliveries.delivery_address at
                                                            -- handover (POST /deliveries) — never a live
                                                            -- Customer link. Resolves the EP-03 delivery-address
                                                            -- schema gap found during Module C implementation.
    whatsapp_checkout_reference   VARCHAR(255) NULL,      -- OPEN: WhatsApp mechanism (see Section 8, item 3)
    status                        ENUM('PENDING','CONFIRMED','PROCESSING','READY_FOR_DELIVERY','CANCELLED')
                                     NOT NULL DEFAULT 'PENDING',
    created_at                    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_orders_customer
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    INDEX idx_orders_customer_status (customer_id, status),
    INDEX idx_orders_created_at (created_at)
) ENGINE=InnoDB;

CREATE TABLE order_items (
    order_item_id    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id          BIGINT UNSIGNED NOT NULL,
    product_id         BIGINT UNSIGNED NOT NULL,
    quantity            INT UNSIGNED NOT NULL,
    price_snapshot       DECIMAL(10,2) NOT NULL,          -- immutable historical value (Section 11)
    CONSTRAINT chk_order_items_quantity_positive CHECK (quantity > 0),
    CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id) REFERENCES orders(order_id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_order_items_product
        FOREIGN KEY (product_id) REFERENCES products(product_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    UNIQUE KEY uq_order_items_order_product (order_id, product_id)
) ENGINE=InnoDB;

CREATE TABLE order_status_history (
    order_status_history_id   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id                    BIGINT UNSIGNED NOT NULL,
    from_status                  VARCHAR(30) NOT NULL,
    to_status                     VARCHAR(30) NOT NULL,
    actor_type                     ENUM('STAFF_ADMIN_USER','CUSTOMER','SYSTEM') NULL,  -- OPEN item 5
    actor_id                        BIGINT UNSIGNED NULL,                              -- OPEN item 5, polymorphic
    changed_at                       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_order_status_history_order
        FOREIGN KEY (order_id) REFERENCES orders(order_id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    INDEX idx_order_status_history_order (order_id),
    INDEX idx_order_status_history_changed_at (changed_at)
) ENGINE=InnoDB;

-- =====================================================================
-- MODULE C — EP-03 DELIVERY TRACKING WITH REVIEW MANAGEMENT
-- =====================================================================

CREATE TABLE deliveries (
    delivery_id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id                     BIGINT UNSIGNED NOT NULL,
    delivery_address              VARCHAR(500) NOT NULL,
    delivery_person_reference       VARCHAR(150) NULL,    -- RESOLVED (project-owner decision, 2026-09-12):
                                                            -- Delivery Person is unauthenticated — knowledge of
                                                            -- the delivery_id is sufficient to act on it via the
                                                            -- public /deliveries/:id/courier endpoints. This
                                                            -- column is the free-text name/contact the Admin
                                                            -- records at assignment; see delivery.service.js.
    status                          ENUM('ASSIGNED','HEADING_TO_STORE','PICKED_UP','OUT_FOR_DELIVERY','ARRIVED','DELIVERED')
                                       NOT NULL DEFAULT 'ASSIGNED',
    assigned_at                      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_deliveries_order
        FOREIGN KEY (order_id) REFERENCES orders(order_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    UNIQUE KEY uq_deliveries_order (order_id),
    INDEX idx_deliveries_status (status)
) ENGINE=InnoDB;

CREATE TABLE delivery_status_history (
    delivery_status_history_id   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    delivery_id                    BIGINT UNSIGNED NOT NULL,
    from_status                     VARCHAR(30) NOT NULL,
    to_status                        VARCHAR(30) NOT NULL,
    actor_reference                   VARCHAR(150) NULL,  -- OPEN item 10
    changed_at                         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_delivery_status_history_delivery
        FOREIGN KEY (delivery_id) REFERENCES deliveries(delivery_id)
        ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE reviews (
    review_id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id            BIGINT UNSIGNED NOT NULL,
    product_id               BIGINT UNSIGNED NOT NULL,
    order_id                   BIGINT UNSIGNED NOT NULL,
    rating                       TINYINT UNSIGNED NOT NULL,
    review_text                   TEXT NULL,
    moderation_status               ENUM('PENDING_MODERATION','APPROVED','REJECTED','DELETED')
                                       NOT NULL DEFAULT 'PENDING_MODERATION',
    created_at                        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_reviews_rating_range CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT fk_reviews_customer
        FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_reviews_product
        FOREIGN KEY (product_id) REFERENCES products(product_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_reviews_order
        FOREIGN KEY (order_id) REFERENCES orders(order_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    -- No UNIQUE on (customer_id, product_id, order_id): duplicate-review rule is OPEN (Section 8, item 6)
    INDEX idx_reviews_product_moderation (product_id, moderation_status),
    INDEX idx_reviews_customer (customer_id)
) ENGINE=InnoDB;

CREATE TABLE moderation_logs (
    moderation_log_id   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    review_id              BIGINT UNSIGNED NOT NULL,
    actor_type                ENUM('STAFF_ADMIN_USER','OWNER_ADMIN') NOT NULL,   -- Actor Identity Decision, see Section 5b
    actor_id                     BIGINT UNSIGNED NULL,        -- NULL when actor_type = 'OWNER_ADMIN'
    action                          ENUM('APPROVE','REJECT','DELETE') NOT NULL,
    action_at                          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_moderation_logs_actor_pairing
        CHECK ((actor_type = 'STAFF_ADMIN_USER' AND actor_id IS NOT NULL)
            OR (actor_type = 'OWNER_ADMIN' AND actor_id IS NULL)),
    CONSTRAINT fk_moderation_logs_review
        FOREIGN KEY (review_id) REFERENCES reviews(review_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_moderation_logs_actor
        FOREIGN KEY (actor_id) REFERENCES staff_admin_users(staff_admin_user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- =====================================================================
-- END OF SCHEMA — 18 conceptual entities across EP-01..EP-04, plus
-- role_permissions, product_images, admin_access_key, and
-- customer_password_resets as disclosed physical-only structures
-- (Sections 3, 7, 14) — 22 tables in total.
-- No further tables are created.
-- =====================================================================
