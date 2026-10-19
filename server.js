
require("dotenv").config();

const express = require("express");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;
const GOOGLE_SHEETS_SECRET = process.env.GOOGLE_SHEETS_SECRET;

// Подключаем существующую базу заказов.
const dbPath =
    process.env.DB_PATH || path.join(__dirname, "orders.db");

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

// Создаём таблицу, только если её ещё нет.
// Старые поля сохраняем для совместимости с базой.
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
        created_at TEXT NOT NULL
    )
`);

// Добавляем поле способа доставки, если его ещё нет.
const columns = db.prepare("PRAGMA table_info(orders)").all();

if (!columns.some(column => column.name === "delivery_method")) {
    db.exec(`
        ALTER TABLE orders
        ADD COLUMN delivery_method TEXT NOT NULL DEFAULT ''
    `);
}

// Подготавливаем сохранение заказа.
const saveOrder = db.prepare(`
    INSERT INTO orders (
        order_id,
        full_name,
        phone,
        postcode,
        address,
        social,
        amount,
        status,
        created_at,
        delivery_method
    )
    VALUES (
        @orderId,
        @fullName,
        @phone,
        '',
        '',
        @social,
        @amount,
        @status,
        @createdAt,
        @deliveryMethod
    )
`);

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));

// Показываем посетителям файлы из папки public.
app.use(express.static(path.join(__dirname, "public")));

// Проверка сервера.
app.get("/api/status", (req, res) => {
    res.json({
        message: "Сервер работает!",
        database: "SQLite подключена",
        payment: "Пока не подключена"
    });
});

// Отправка заказа в Google Sheets.
// Если Google недоступен, заказ останется в SQLite.
async function sendOrderToGoogleSheets(order) {
    if (!GOOGLE_SHEETS_URL || !GOOGLE_SHEETS_SECRET) {
        throw new Error("Google Таблицы не настроены.");
    }

    const response = await fetch(GOOGLE_SHEETS_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            ...order,
            secret: GOOGLE_SHEETS_SECRET
        }),
        signal: AbortSignal.timeout(10000)
    });

    const result = await response.text();

    if (!response.ok) {
        throw new Error(
            `Google Таблицы ответили HTTP ${response.status}: ${result}`
        );
    }

    console.log("Ответ Google Таблиц:", result);
}

// Создание заказа из HTML-формы.
app.post("/api/create-order", (req, res) => {
    // Получаем значения, отправленные формой.
    const {
        fullName,
        phone,
        deliveryMethod,
        social
    } = req.body || {};

    // Проверяем обязательные поля.
    if (
        typeof fullName !== "string" ||
        !fullName.trim() ||
        typeof phone !== "string" ||
        !phone.trim() ||
        typeof deliveryMethod !== "string" ||
        !deliveryMethod.trim() ||
        (social !== undefined && typeof social !== "string")
    ) {
        return res.status(400).json({
            error: "Заполни ФИО, телефон и способ доставки.",
            message: "Заполни ФИО, телефон и способ доставки."
        });
    }

    // Ограничиваем длину данных.
    if (
        fullName.trim().length > 200 ||
        phone.trim().length > 50 ||
        deliveryMethod.trim().length > 200 ||
        (typeof social === "string" && social.length > 500)
    ) {
        return res.status(400).json({
            error: "Некоторые поля слишком длинные.",
            message: "Некоторые поля слишком длинные."
        });
    }

    // Создаём данные заказа.
    const order = {
        orderId: crypto.randomUUID(),
        fullName: fullName.trim(),
        phone: phone.trim(),
        deliveryMethod: deliveryMethod.trim(),
        social: typeof social === "string" ? social.trim() : "",
        amount: 1500,
        status: "pending",
        createdAt: new Date().toISOString()
    };

    try {
        // Сначала надёжно сохраняем заказ в SQLite.
        saveOrder.run(order);
    } catch (error) {
        console.error("Ошибка сохранения заказа:", error.message);

        return res.status(500).json({
            error: "Не удалось сохранить заказ. Попробуй позже.",
            message: "Не удалось сохранить заказ. Попробуй позже."
        });
    }

    // Отправляем заказ в Google Sheets отдельно.
    // Ошибка Google не отменяет сохранённый заказ.
    sendOrderToGoogleSheets(order).catch(error => {
        console.error(
            "Не удалось отправить заказ в Google Таблицы:",
            error.message
        );
    });

    console.log(`Создан заказ: ${order.orderId}`);

    return res.status(201).json({
        orderId: order.orderId,
        amount: order.amount,
        status: order.status,
        message: "Заказ сохранён. Оплата пока не подключена."
    });
});

// На сервере с Nginx приложение слушает только localhost.
app.listen(PORT, "127.0.0.1", () => {
    console.log(`Сайт запущен на порту ${PORT}`);
});

// Корректно закрываем базу при остановке.
function shutdown() {
    db.close();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
