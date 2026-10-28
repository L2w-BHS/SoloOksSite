
require("dotenv").config();

const express = require("express");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

// Google Sheets для книги
const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;
const GOOGLE_SHEETS_SECRET = process.env.GOOGLE_SHEETS_SECRET;

// Отдельная Google Sheets для открыток
const POSTCARD_GOOGLE_SHEETS_URL =
    process.env.POSTCARD_GOOGLE_SHEETS_URL;

const POSTCARD_GOOGLE_SHEETS_SECRET =
    process.env.POSTCARD_GOOGLE_SHEETS_SECRET;

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID;
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY;

const SITE_URL = (process.env.SITE_URL || "https://solooksshop.ru")
    .replace(/\/+$/, "");

const BOOK_AMOUNT = 1500;
const POSTCARD_AMOUNT = 250;
const PAYMENT_TIME_MS = 15 * 60 * 1000;

// Версии документов. Меняй при публикации новой редакции.
const OFFER_VERSION = "2026-10-28";
const PERSONAL_DATA_CONSENT_VERSION = "2026-10-28";

const dbPath =
    process.env.DB_PATH || path.join(__dirname, "orders.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// ==========================================
// 1. ТАБЛИЦЫ SQLITE И МИГРАЦИЯ
// ==========================================

db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        city TEXT NOT NULL DEFAULT '',
        postcode TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        social TEXT,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        delivery_method TEXT NOT NULL DEFAULT '',
        payment_id TEXT,
        expires_at TEXT,
        google_sheets_sent INTEGER NOT NULL DEFAULT 0,

        offer_accepted INTEGER NOT NULL DEFAULT 0,
        personal_data_consent INTEGER NOT NULL DEFAULT 0,
        offer_version TEXT,
        consent_version TEXT,
        consented_at TEXT
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS postcard_orders (
        order_id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        postal_address TEXT NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payment_id TEXT,
        expires_at TEXT,
        google_sheets_sent INTEGER NOT NULL DEFAULT 0,

        offer_accepted INTEGER NOT NULL DEFAULT 0,
        personal_data_consent INTEGER NOT NULL DEFAULT 0,
        offer_version TEXT,
        consent_version TEXT,
        consented_at TEXT
    )
`);

function addMissingColumns(tableName, definitions) {
    // Имена таблиц здесь задаются только самим сервером.
    const columns = db.prepare(
        `PRAGMA table_info(${tableName})`
    ).all();

    const existing = new Set(
        columns.map(column => column.name)
    );

    for (const [name, definition] of definitions) {
        if (!existing.has(name)) {
            db.exec(
                `ALTER TABLE ${tableName} ADD COLUMN ${name} ${definition}`
            );
        }
    }
}

// Обновляем старую базу без удаления существующих заказов.
const orderColumns = [
    ["city", "TEXT NOT NULL DEFAULT ''"],
    ["delivery_method", "TEXT NOT NULL DEFAULT ''"],
    ["payment_id", "TEXT"],
    ["expires_at", "TEXT"],
    ["google_sheets_sent", "INTEGER NOT NULL DEFAULT 0"],
    ["offer_accepted", "INTEGER NOT NULL DEFAULT 0"],
    ["personal_data_consent", "INTEGER NOT NULL DEFAULT 0"],
    ["offer_version", "TEXT"],
    ["consent_version", "TEXT"],
    ["consented_at", "TEXT"]
];

addMissingColumns("orders", orderColumns);

addMissingColumns("postcard_orders", [
    ["payment_id", "TEXT"],
    ["expires_at", "TEXT"],
    ["google_sheets_sent", "INTEGER NOT NULL DEFAULT 0"],
    ["offer_accepted", "INTEGER NOT NULL DEFAULT 0"],
    ["personal_data_consent", "INTEGER NOT NULL DEFAULT 0"],
    ["offer_version", "TEXT"],
    ["consent_version", "TEXT"],
    ["consented_at", "TEXT"]
]);

db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_id
    ON orders(payment_id)
    WHERE payment_id IS NOT NULL
`);

db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_postcard_orders_payment_id
    ON postcard_orders(payment_id)
    WHERE payment_id IS NOT NULL
`);

// ==========================================
// 2. ПРОВЕРКА ЮРИДИЧЕСКИХ СОГЛАСИЙ
// ==========================================

// HTML-формы отправляют отмеченный checkbox как "on".
// JSON-форма может отправлять true.
// Не принимаем произвольные строки за согласие.
function checkboxIsAccepted(value) {
    return (
        value === true ||
        value === "true" ||
        value === "on" ||
        value === "1"
    );
}

function hasRequiredConsents(body) {
    return (
        checkboxIsAccepted(body?.offerAccepted) &&
        checkboxIsAccepted(body?.personalDataConsent)
    );
}

function consentError(res) {
    return res.status(400).json({
        error:
            "Для оформления заказа необходимо принять оферту " +
            "и отдельно дать согласие на обработку персональных данных.",
        message:
            "Для оформления заказа необходимо принять оферту " +
            "и отдельно дать согласие на обработку персональных данных."
    });
}

// ==========================================
// 3. EXPRESS
// ==========================================

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (req, res) => {
    res.json({
        message: "Сервер работает!",
        database: "SQLite подключена",
        bookGoogleSheets:
            GOOGLE_SHEETS_URL && GOOGLE_SHEETS_SECRET
                ? "Настроена"
                : "Не настроена",
        postcardGoogleSheets:
            POSTCARD_GOOGLE_SHEETS_URL &&
            POSTCARD_GOOGLE_SHEETS_SECRET
                ? "Настроена"
                : "Не настроена",
        payment:
            YOOKASSA_SHOP_ID && YOOKASSA_SECRET_KEY
                ? "Ключи ЮKassa настроены"
                : "Не настроены ключи ЮKassa"
    });
});

// ==========================================
// 4. API ЮKASSA
// ==========================================

async function yookassaRequest(url, options = {}) {
    if (!YOOKASSA_SHOP_ID || !YOOKASSA_SECRET_KEY) {
        throw new Error("Не настроены ключи ЮKassa в .env");
    }

    const auth = Buffer.from(
        `${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`
    ).toString("base64");

    const response = await fetch(
        `https://api.yookassa.ru/v3${url}`,
        {
            ...options,
            headers: {
                Authorization: `Basic ${auth}`,
                ...(options.headers || {})
            },
            signal: AbortSignal.timeout(15000)
        }
    );

    const text = await response.text();
    let result;

    try {
        result = JSON.parse(text);
    } catch {
        throw new Error("ЮKassa вернула непонятный ответ.");
    }

    if (!response.ok) {
        console.error("Ошибка ЮKassa:", response.status, result);
        throw new Error(`Ошибка ЮKassa: HTTP ${response.status}`);
    }

    return result;
}

// ==========================================
// 5. SQLITE: ЗАПРОСЫ
// ==========================================

// Книга
const saveBookOrder = db.prepare(`
    INSERT INTO orders (
        order_id,
        full_name,
        phone,
        city,
        postcode,
        address,
        social,
        amount,
        status,
        created_at,
        delivery_method,
        expires_at,
        offer_accepted,
        personal_data_consent,
        offer_version,
        consent_version,
        consented_at
    )
    VALUES (
        @orderId,
        @fullName,
        @phone,
        @city,
        '',
        '',
        @social,
        @amount,
        @status,
        @createdAt,
        @deliveryMethod,
        @expiresAt,
        @offerAccepted,
        @personalDataConsent,
        @offerVersion,
        @consentVersion,
        @consentedAt
    )
`);

const updateBookPayment = db.prepare(`
    UPDATE orders
    SET payment_id = ?
    WHERE order_id = ?
`);

const findBookOrder = db.prepare(`
    SELECT * FROM orders WHERE order_id = ?
`);

const findBookOrderByPayment = db.prepare(`
    SELECT * FROM orders WHERE payment_id = ?
`);

// Открытки
const savePostcardOrder = db.prepare(`
    INSERT INTO postcard_orders (
        order_id,
        phone,
        postal_address,
        amount,
        status,
        created_at,
        expires_at,
        offer_accepted,
        personal_data_consent,
        offer_version,
        consent_version,
        consented_at
    )
    VALUES (
        @orderId,
        @phone,
        @postalAddress,
        @amount,
        @status,
        @createdAt,
        @expiresAt,
        @offerAccepted,
        @personalDataConsent,
        @offerVersion,
        @consentVersion,
        @consentedAt
    )
`);

const updatePostcardPayment = db.prepare(`
    UPDATE postcard_orders
    SET payment_id = ?
    WHERE order_id = ?
`);

const findPostcardOrder = db.prepare(`
    SELECT * FROM postcard_orders WHERE order_id = ?
`);

const findPostcardOrderByPayment = db.prepare(`
    SELECT * FROM postcard_orders WHERE payment_id = ?
`);

// ==========================================
// 6. GOOGLE SHEETS
// ==========================================

async function postToGoogleSheets(url, secret, payload) {
    if (!url || !secret) {
        throw new Error(
            "Google Sheets для этого типа заказа не настроена."
        );
    }

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            ...payload,
            secret
        }),
        signal: AbortSignal.timeout(20000)
    });

    const text = await response.text();

    console.log("Google Sheets HTTP:", response.status);
    console.log("Google Sheets ответ:", text.slice(0, 500));

    let result;

    try {
        result = JSON.parse(text);
    } catch {
        throw new Error(
            `Google Sheets вернула не JSON. HTTP ${response.status}`
        );
    }

    if (!response.ok || result.ok !== true) {
        throw new Error(
            `Google Sheets HTTP ${response.status}: ${
                result.error || "неизвестная ошибка"
            }`
        );
    }

    return result;
}

async function sendBookToGoogleSheets(order) {
    return postToGoogleSheets(
        GOOGLE_SHEETS_URL,
        GOOGLE_SHEETS_SECRET,
        {
            orderType: "book",
            orderId: order.order_id,
            fullName: order.full_name,
            phone: order.phone,
            city: order.city || "",
            deliveryMethod: order.delivery_method,
            postcode: order.postcode || "",
            address: order.address || "",
            social: order.social || "",
            amount: order.amount,
            status: "paid",
            createdAt: order.created_at
        }
    );
}

async function sendPostcardToGoogleSheets(order) {
    return postToGoogleSheets(
        POSTCARD_GOOGLE_SHEETS_URL,
        POSTCARD_GOOGLE_SHEETS_SECRET,
        {
            orderType: "postcard",
            orderId: order.order_id,
            phone: order.phone,
            postalAddress: order.postal_address,
            amount: order.amount,
            status: "paid",
            createdAt: order.created_at
        }
    );
}

// ==========================================
// 7. ПОВТОРНАЯ ОТПРАВКА ОПЛАЧЕННЫХ ЗАКАЗОВ
// ==========================================

async function sendPaidOrdersToSheets() {
    const books = db.prepare(`
        SELECT * FROM orders
        WHERE status = 'paid' AND google_sheets_sent = 0
    `).all();

    const postcards = db.prepare(`
        SELECT * FROM postcard_orders
        WHERE status = 'paid' AND google_sheets_sent = 0
    `).all();

    for (const order of books) {
        try {
            await sendBookToGoogleSheets(order);

            db.prepare(`
                UPDATE orders
                SET google_sheets_sent = 1
                WHERE order_id = ? AND status = 'paid'
            `).run(order.order_id);

            console.log(
                "Заказ книги отправлен в Google:",
                order.order_id
            );
        } catch (error) {
            console.error(
                "Ошибка отправки книги в Google:",
                error.message
            );
        }
    }

    for (const order of postcards) {
        try {
            await sendPostcardToGoogleSheets(order);

            db.prepare(`
                UPDATE postcard_orders
                SET google_sheets_sent = 1
                WHERE order_id = ? AND status = 'paid'
            `).run(order.order_id);

            console.log(
                "Заказ открытки отправлен в отдельную таблицу:",
                order.order_id
            );
        } catch (error) {
            console.error(
                "Ошибка отправки открытки в Google:",
                error.message
            );
        }
    }
}

// ==========================================
// 8. ИСТЕЧЕНИЕ СРОКА ОПЛАТЫ
// ==========================================

function expireUnpaidOrders() {
    const now = new Date().toISOString();

    const books = db.prepare(`
        UPDATE orders
        SET status = 'expired'
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at <= ?
    `).run(now);

    const postcards = db.prepare(`
        UPDATE postcard_orders
        SET status = 'expired'
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at <= ?
    `).run(now);

    const total = books.changes + postcards.changes;

    if (total > 0) {
        console.log("Истёк срок оплаты заказов:", total);
    }
}

// ==========================================
// 9. СОЗДАНИЕ ЗАКАЗА КНИГИ — 1500 ₽
// ==========================================

app.post("/api/create-order", async (req, res) => {
    const {
        fullName,
        phone,
        city,
        deliveryMethod,
        social
    } = req.body || {};

    // Проверяем согласия на стороне сервера.
    if (!hasRequiredConsents(req.body)) {
        return consentError(res);
    }

    if (
        typeof fullName !== "string" || !fullName.trim() ||
        typeof phone !== "string" || !phone.trim() ||
        typeof city !== "string" || !city.trim() ||
        typeof deliveryMethod !== "string" ||
        !deliveryMethod.trim() ||
        (social !== undefined && typeof social !== "string")
    ) {
        return res.status(400).json({
            message:
                "Заполни ФИО, телефон, город и способ доставки."
        });
    }

    if (
        fullName.trim().length > 200 ||
        phone.trim().length > 50 ||
        city.trim().length > 100 ||
        deliveryMethod.trim().length > 200 ||
        (typeof social === "string" && social.length > 500)
    ) {
        return res.status(400).json({
            message: "Некоторые поля слишком длинные."
        });
    }

    if (!YOOKASSA_SHOP_ID || !YOOKASSA_SECRET_KEY) {
        return res.status(503).json({
            message: "Оплата временно недоступна. Попробуй позже."
        });
    }

    const now = new Date();

    const order = {
        orderId: crypto.randomUUID(),
        fullName: fullName.trim(),
        phone: phone.trim(),
        city: city.trim(),
        deliveryMethod: deliveryMethod.trim(),
        social: typeof social === "string" ? social.trim() : "",
        amount: BOOK_AMOUNT,
        status: "pending",
        createdAt: now.toISOString(),
        expiresAt: new Date(
            now.getTime() + PAYMENT_TIME_MS
        ).toISOString(),

        offerAccepted: 1,
        personalDataConsent: 1,
        offerVersion: OFFER_VERSION,
        consentVersion: PERSONAL_DATA_CONSENT_VERSION,
        consentedAt: now.toISOString()
    };

    try {
        saveBookOrder.run(order);

        const payment = await yookassaRequest("/payments", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Idempotence-Key": order.orderId
            },
            body: JSON.stringify({
                amount: {
                    value: BOOK_AMOUNT.toFixed(2),
                    currency: "RUB"
                },
                capture: true,
                confirmation: {
                    type: "redirect",
                    return_url: `${SITE_URL}/?payment=return`
                },
                description:
                    `Предзаказ книги. Заказ ${order.orderId}`,
                metadata: {
                    order_id: order.orderId,
                    order_type: "book"
                }
            })
        });

        if (
            !payment.id ||
            !payment.confirmation ||
            !payment.confirmation.confirmation_url
        ) {
            throw new Error(
                "ЮKassa не вернула ссылку для оплаты."
            );
        }

        updateBookPayment.run(payment.id, order.orderId);

        console.log("Создан заказ книги:", order.orderId);
        console.log("Город:", order.city);
        console.log("Создан платёж:", payment.id);
        console.log(
            "Согласия записаны для заказа книги:",
            order.orderId,
            order.consentedAt
        );

        return res.status(201).json({
            orderId: order.orderId,
            amount: order.amount,
            status: "pending",
            paymentUrl: payment.confirmation.confirmation_url,
            expiresAt: order.expiresAt,
            message:
                "Заказ создан. Оплатите его в течение 15 минут."
        });
    } catch (error) {
        console.error(
            "Ошибка создания заказа книги:",
            error.message
        );

        db.prepare(`
            UPDATE orders
            SET status = 'payment_error'
            WHERE order_id = ? AND status = 'pending'
        `).run(order.orderId);

        return res.status(502).json({
            message:
                "Не удалось создать платёж. Попробуй позже."
        });
    }
});

// ==========================================
// 10. СОЗДАНИЕ ЗАКАЗА ОТКРЫТКИ — 250 ₽
// ==========================================

app.post("/api/postcard/create-payment", async (req, res) => {
    const { phone, postalAddress } = req.body || {};

    // Проверяем согласия на стороне сервера.
    if (!hasRequiredConsents(req.body)) {
        return consentError(res);
    }

    if (
        typeof phone !== "string" || !phone.trim() ||
        typeof postalAddress !== "string" ||
        !postalAddress.trim()
    ) {
        return res.status(400).json({
            error:
                "Укажи номер телефона и адрес почтового отделения."
        });
    }

    const cleanPhone = phone.trim();
    const cleanAddress = postalAddress.trim();
    const digits = cleanPhone.replace(/\D/g, "");

    if (digits.length < 10 || digits.length > 15) {
        return res.status(400).json({
            error: "Проверь номер телефона."
        });
    }

    if (
        cleanPhone.length > 50 ||
        cleanAddress.length > 1000 ||
        cleanAddress.length < 5
    ) {
        return res.status(400).json({
            error:
                "Проверь телефон и адрес почтового отделения."
        });
    }

    if (
        !YOOKASSA_SHOP_ID ||
        !YOOKASSA_SECRET_KEY ||
        !POSTCARD_GOOGLE_SHEETS_URL ||
        !POSTCARD_GOOGLE_SHEETS_SECRET
    ) {
        return res.status(503).json({
            error:
                "Оплата или таблица открыток не настроена на сервере."
        });
    }

    const now = new Date();

    const order = {
        orderId: crypto.randomUUID(),
        phone: cleanPhone,
        postalAddress: cleanAddress,
        amount: POSTCARD_AMOUNT,
        status: "pending",
        createdAt: now.toISOString(),
        expiresAt: new Date(
            now.getTime() + PAYMENT_TIME_MS
        ).toISOString(),

        offerAccepted: 1,
        personalDataConsent: 1,
        offerVersion: OFFER_VERSION,
        consentVersion: PERSONAL_DATA_CONSENT_VERSION,
        consentedAt: now.toISOString()
    };

    try {
        savePostcardOrder.run(order);

        const payment = await yookassaRequest("/payments", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Idempotence-Key": order.orderId
            },
            body: JSON.stringify({
                amount: {
                    value: POSTCARD_AMOUNT.toFixed(2),
                    currency: "RUB"
                },
                capture: true,
                confirmation: {
                    type: "redirect",
                    return_url:
                        `${SITE_URL}/?postcard_payment=return`
                },
                description:
                    `Открытка. Заказ ${order.orderId}`,
                metadata: {
                    order_id: order.orderId,
                    order_type: "postcard"
                }
            })
        });

        if (
            !payment.id ||
            !payment.confirmation ||
            !payment.confirmation.confirmation_url
        ) {
            throw new Error(
                "ЮKassa не вернула ссылку для оплаты."
            );
        }

        updatePostcardPayment.run(
            payment.id,
            order.orderId
        );

        console.log(
            "Создан заказ открытки:",
            order.orderId
        );
        console.log(
            "Создан платёж открытки:",
            payment.id
        );
        console.log(
            "Согласия записаны для заказа открытки:",
            order.orderId,
            order.consentedAt
        );

        return res.status(201).json({
            orderId: order.orderId,
            amount: order.amount,
            status: "pending",
            paymentUrl: payment.confirmation.confirmation_url,
            expiresAt: order.expiresAt,
            message:
                "Заказ создан. Оплатите его в течение 15 минут."
        });
    } catch (error) {
        console.error(
            "Ошибка создания заказа открытки:",
            error.message
        );

        db.prepare(`
            UPDATE postcard_orders
            SET status = 'payment_error'
            WHERE order_id = ? AND status = 'pending'
        `).run(order.orderId);

        return res.status(502).json({
            error:
                "Не удалось создать платёж. Попробуй позже."
        });
    }
});

// ==========================================
// 11. УВЕДОМЛЕНИЯ ЮKASSA
// ==========================================

app.post("/api/yookassa-webhook", async (req, res) => {
    try {
        const notification = req.body || {};
        const paymentId = notification.object?.id;

        if (!paymentId) {
            return res.sendStatus(200);
        }

        // Получаем реальное состояние платежа от ЮKassa.
        const payment = await yookassaRequest(
            `/payments/${encodeURIComponent(paymentId)}`
        );

        if (
            payment.status !== "succeeded" ||
            payment.paid !== true
        ) {
            return res.sendStatus(200);
        }

        const orderId = payment.metadata?.order_id;
        const orderType = payment.metadata?.order_type;

        if (
            !orderId ||
            !["book", "postcard"].includes(orderType)
        ) {
            console.error(
                "Нет корректных метаданных платежа:",
                paymentId
            );
            return res.sendStatus(200);
        }

        let order;

        if (orderType === "postcard") {
            order = findPostcardOrder.get(orderId);
        } else {
            order = findBookOrder.get(orderId);
        }

        if (!order) {
            console.error("Заказ не найден:", orderId);
            return res.sendStatus(200);
        }

        const paidAmount = Math.round(
            Number(payment.amount?.value) * 100
        );

        const expectedAmount = order.amount * 100;

        if (
            order.payment_id !== paymentId ||
            paidAmount !== expectedAmount
        ) {
            console.error(
                "Не совпали ID или сумма платежа:",
                paymentId
            );
            return res.sendStatus(200);
        }

        // Обновляем только заказ с проверенным платежом.
        if (orderType === "postcard") {
            db.prepare(`
                UPDATE postcard_orders
                SET status = 'paid'
                WHERE order_id = ?
                  AND payment_id = ?
                  AND status != 'paid'
            `).run(orderId, paymentId);
        } else {
            db.prepare(`
                UPDATE orders
                SET status = 'paid'
                WHERE order_id = ?
                  AND payment_id = ?
                  AND status != 'paid'
            `).run(orderId, paymentId);
        }

        console.log(
            `Оплата подтверждена (${orderType}):`,
            orderId
        );

        await sendPaidOrdersToSheets();

        return res.sendStatus(200);
    } catch (error) {
        console.error(
            "Ошибка обработки уведомления ЮKassa:",
            error.message
        );

        return res.sendStatus(500);
    }
});

// ==========================================
// 12. ФОНОВЫЕ ЗАДАЧИ
// ==========================================

expireUnpaidOrders();

sendPaidOrdersToSheets().catch(error => {
    console.error(
        "Стартовая отправка в Google:",
        error.message
    );
});

const expiryTimer = setInterval(
    expireUnpaidOrders,
    30000
);

const sheetsTimer = setInterval(() => {
    sendPaidOrdersToSheets().catch(error => {
        console.error(
            "Ошибка фоновой отправки:",
            error.message
        );
    });
}, 60000);

// ==========================================
// 13. ЗАПУСК И ЗАВЕРШЕНИЕ
// ==========================================

const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`Сайт запущен на порту ${PORT}`);
});

function shutdown() {
    clearInterval(expiryTimer);
    clearInterval(sheetsTimer);

    server.close(() => {
        db.close();
        process.exit(0);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
