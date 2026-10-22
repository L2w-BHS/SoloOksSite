
require("dotenv").config();

const express = require("express");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;
const GOOGLE_SHEETS_SECRET = process.env.GOOGLE_SHEETS_SECRET;
const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID;
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY;
const SITE_URL = (process.env.SITE_URL || "https://solooksshop.ru")
    .replace(/\/+$/, "");

const ORDER_AMOUNT = 1500;
const PAYMENT_TIME_MS = 15 * 60 * 1000;

const dbPath =
    process.env.DB_PATH || path.join(__dirname, "orders.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        postcode TEXT NOT NULL DEFAULT '',
        address TEXT NOT NULL DEFAULT '',
        social TEXT,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        delivery_method TEXT NOT NULL DEFAULT '',
        payment_id TEXT,
        expires_at TEXT,
        google_sheets_sent INTEGER NOT NULL DEFAULT 0
    )
`);

// Миграция: добавляем столбцы в существующую базу.
const columns = db.prepare("PRAGMA table_info(orders)").all();
const existingColumns = new Set(columns.map(column => column.name));

const newColumns = [
    ["delivery_method", "TEXT NOT NULL DEFAULT ''"],
    ["payment_id", "TEXT"],
    ["expires_at", "TEXT"],
    ["google_sheets_sent", "INTEGER NOT NULL DEFAULT 0"]
];

for (const [name, definition] of newColumns) {
    if (!existingColumns.has(name)) {
        db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
    }
}

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (req, res) => {
    res.json({
        message: "Сервер работает!",
        database: "SQLite подключена",
        payment: YOOKASSA_SHOP_ID && YOOKASSA_SECRET_KEY
            ? "Ключи ЮKassa настроены"
            : "Не настроены ключи ЮKassa"
    });
});

// Запрос к API ЮKassa.
async function yookassaRequest(url, options = {}) {
    if (!YOOKASSA_SHOP_ID || !YOOKASSA_SECRET_KEY) {
        throw new Error("Не настроены ключи ЮKassa в .env");
    }

    const auth = Buffer.from(
        `${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`
    ).toString("base64");

    const response = await fetch(`https://api.yookassa.ru/v3${url}`, {
        ...options,
        headers: {
            "Authorization": `Basic ${auth}`,
            ...(options.headers || {})
        },
        signal: AbortSignal.timeout(15000)
    });

    const text = await response.text();
    let result = {};

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

// Сохранение нового заказа.
const saveOrder = db.prepare(`
    INSERT INTO orders (
        order_id, full_name, phone, postcode, address, social,
        amount, status, created_at, delivery_method, expires_at
    )
    VALUES (
        @orderId, @fullName, @phone, '', '', @social,
        @amount, @status, @createdAt, @deliveryMethod, @expiresAt
    )
`);

const updatePayment = db.prepare(`
    UPDATE orders
    SET payment_id = ?
    WHERE order_id = ?
`);

const findOrder = db.prepare(`
    SELECT * FROM orders WHERE order_id = ?
`);

// Передаём в Google только подтверждённые оплаты.
async function sendOrderToGoogleSheets(order) {
    if (!GOOGLE_SHEETS_URL || !GOOGLE_SHEETS_SECRET) {
        throw new Error("Google Таблицы не настроены.");
    }

    const response = await fetch(GOOGLE_SHEETS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            orderId: order.order_id,
            fullName: order.full_name,
            phone: order.phone,
            deliveryMethod: order.delivery_method,
            social: order.social || "",
            amount: order.amount,
            status: "paid",
            createdAt: order.created_at,
            secret: GOOGLE_SHEETS_SECRET
        }),
        signal: AbortSignal.timeout(10000)
    });

    const text = await response.text();
    let result;

    try {
        result = JSON.parse(text);
    } catch {
        throw new Error("Google Таблицы вернули непонятный ответ.");
    }

    if (!response.ok || result.ok !== true) {
        throw new Error("Не удалось записать заказ в Google Таблицу.");
    }
}

// Повторяем отправку, если Google временно не работал.
async function sendPaidOrdersToSheets() {
    const orders = db.prepare(`
        SELECT * FROM orders
        WHERE status = 'paid' AND google_sheets_sent = 0
    `).all();

    for (const order of orders) {
        try {
            await sendOrderToGoogleSheets(order);

            db.prepare(`
                UPDATE orders
                SET google_sheets_sent = 1
                WHERE order_id = ? AND status = 'paid'
            `).run(order.order_id);

            console.log("Оплаченный заказ отправлен в Google:", order.order_id);
        } catch (error) {
            console.error("Ошибка Google Таблиц:", error.message);
        }
    }
}

// Проверяем срок неоплаченных заказов.
// Строку из базы не удаляем: она нужна для проверки возможной поздней оплаты.
function expireUnpaidOrders() {
    const result = db.prepare(`
        UPDATE orders
        SET status = 'expired'
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at <= ?
    `).run(new Date().toISOString());

    if (result.changes > 0) {
        console.log("Истёк срок оплаты заказов:", result.changes);
    }
}

// Создание заказа и платежа.
app.post("/api/create-order", async (req, res) => {
    const { fullName, phone, deliveryMethod, social } = req.body || {};

    if (
        typeof fullName !== "string" || !fullName.trim() ||
        typeof phone !== "string" || !phone.trim() ||
        typeof deliveryMethod !== "string" || !deliveryMethod.trim() ||
        (social !== undefined && typeof social !== "string")
    ) {
        return res.status(400).json({
            message: "Заполни ФИО, телефон и способ доставки."
        });
    }

    if (
        fullName.trim().length > 200 ||
        phone.trim().length > 50 ||
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

    const order = {
        orderId: crypto.randomUUID(),
        fullName: fullName.trim(),
        phone: phone.trim(),
        deliveryMethod: deliveryMethod.trim(),
        social: typeof social === "string" ? social.trim() : "",
        amount: ORDER_AMOUNT,
        status: "pending",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + PAYMENT_TIME_MS).toISOString()
    };

    try {
        saveOrder.run(order);

        const payment = await yookassaRequest("/payments", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Idempotence-Key": order.orderId
            },
            body: JSON.stringify({
                amount: {
                    value: `${ORDER_AMOUNT.toFixed(2)}`,
                    currency: "RUB"
                },
                capture: true,
                confirmation: {
                    type: "redirect",
                    return_url: `${SITE_URL}/?payment=return`
                },
                description: `Предзаказ книги. Заказ ${order.orderId}`,
                metadata: {
                    order_id: order.orderId
                }
            })
        });

        if (
            !payment.id ||
            !payment.confirmation ||
            !payment.confirmation.confirmation_url
        ) {
            throw new Error("ЮKassa не вернула ссылку для оплаты.");
        }

        updatePayment.run(payment.id, order.orderId);

        console.log("Создан заказ:", order.orderId);
        console.log("Создан платёж:", payment.id);

        return res.status(201).json({
            orderId: order.orderId,
            amount: order.amount,
            status: "pending",
            paymentUrl: payment.confirmation.confirmation_url,
            expiresAt: order.expiresAt,
            message: "Заказ создан. Оплатите его в течение 15 минут."
        });
    } catch (error) {
        console.error("Ошибка создания заказа/платежа:", error.message);

        db.prepare(`
            UPDATE orders
            SET status = 'payment_error'
            WHERE order_id = ? AND status = 'pending'
        `).run(order.orderId);

        return res.status(502).json({
            message: "Не удалось создать платёж. Попробуй оформить заказ позже."
        });
    }
});

// Уведомление от ЮKassa.
// Не доверяем одному только телу уведомления — запрашиваем платёж у ЮKassa.
app.post("/api/yookassa-webhook", async (req, res) => {
    try {
        const notification = req.body || {};
        const paymentId = notification.object && notification.object.id;

        if (!paymentId) {
            return res.sendStatus(200);
        }

        const payment = await yookassaRequest(
            `/payments/${encodeURIComponent(paymentId)}`
        );

        if (payment.status !== "succeeded" || payment.paid !== true) {
            return res.sendStatus(200);
        }

        const orderId = payment.metadata && payment.metadata.order_id;
        if (!orderId) {
            console.error("У платежа нет order_id:", paymentId);
            return res.sendStatus(200);
        }

        const order = findOrder.get(orderId);

        if (!order) {
            console.error("Заказ не найден для платежа:", paymentId);
            return res.sendStatus(200);
        }

        const paidAmount = Math.round(Number(payment.amount?.value) * 100);
        const expectedAmount = order.amount * 100;

        if (
            order.payment_id !== paymentId ||
            paidAmount !== expectedAmount
        ) {
            console.error("Не совпали ID или сумма платежа:", paymentId);
            return res.sendStatus(200);
        }

        // Даже если срок истёк, подтверждённую оплату не игнорируем.
        // Поздний платёж потребует отдельной проверки заказа.
        if (order.status !== "paid") {
            db.prepare(`
                UPDATE orders
                SET status = 'paid'
                WHERE order_id = ? AND payment_id = ?
            `).run(orderId, paymentId);

            console.log("Оплата подтверждена:", orderId);
        }

        await sendPaidOrdersToSheets();
        return res.sendStatus(200);
    } catch (error) {
        console.error("Ошибка обработки уведомления ЮKassa:", error.message);

        // Ошибка сервера позволит ЮKassa повторить уведомление.
        return res.sendStatus(500);
    }
});

// Периодически обрабатываем истёкшие заказы и повторяем отправку оплат.
expireUnpaidOrders();
sendPaidOrdersToSheets().catch(console.error);

const expiryTimer = setInterval(expireUnpaidOrders, 30000);
const sheetsTimer = setInterval(() => {
    sendPaidOrdersToSheets().catch(console.error);
}, 60000);

app.listen(PORT, "127.0.0.1", () => {
    console.log(`Сайт запущен на порту ${PORT}`);
});

function shutdown() {
    clearInterval(expiryTimer);
    clearInterval(sheetsTimer);
    db.close();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
