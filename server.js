require("dotenv").config();

const express = require("express");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;
const GOOGLE_SHEETS_SECRET = process.env.GOOGLE_SHEETS_SECRET;

// Подключаем существующую базу данных.
// Если файла ещё нет, SQLite создаст его.
const db = new Database(path.join(__dirname, "orders.db"));

db.pragma("journal_mode = WAL");

// Создаём таблицу, если её ещё нет.
// Старые поля postcode и address оставляем,
// чтобы не ломать существующую базу.
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

// Добавляем поле доставки в существующую таблицу,
// только если такого столбца ещё нет.
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

// Отдаём посетителям файлы сайта из папки public.
app.use(express.static(path.join(__dirname, "public")));

// Проверяем работу сервера и базы данных.
app.get("/api/status", (req, res) => {
    res.json({
        message: "Сервер работает!",
        database: "SQLite подключена",
        payment: "Пока не подключена"
    });
});

// Создаём новый заказ.

async function sendOrderToGoogleSheets(order) {
    if (!GOOGLE_SHEETS_URL || !GOOGLE_SHEETS_SECRET) {
        console.error("Google Таблицы не настроены.");
        return;
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

app.post("/api/create-order", (req, res) => {
    console.log("Данные формы:", req.body);

    const {
        fullName,
        phone,
        deliveryMethod,
        social
    } = req.body;

    const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;
    const GOOGLE_SHEETS_SECRET = process.env.GOOGLE_SHEETS_SECRET;
    

    // В твоей HTML-форме поле доставки называется mail.

    // Проверяем данные, пришедшие из HTML-формы.

    // Проверяем данные, пришедшие из HTML-формы.
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
            error: "Заполни ФИО, телефон и способ доставки."
        });
    }



    // Ограничиваем длину введённых данных.
    if (
        fullName.trim().length > 200 ||
        phone.trim().length > 50 ||
        deliveryMethod.trim().length > 200 ||
        (typeof social === "string" && social.length > 500)
    ) {
        return res.status(400).json({
            error: "Некоторые поля слишком длинные."
        });
    }

    const order = {
        orderId: crypto.randomUUID(),
        fullName: fullName.trim(),
        phone: phone.trim(),
        deliveryMethod: deliveryMethod.trim(),
        social: typeof social === "string"
            ? social.trim()
            : "",
        amount: 1500,
        status: "pending",
        createdAt: new Date().toISOString()
    };

    try {
        // Сохраняем заказ в SQLite.
        saveOrder.run(order);

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
    } catch (error) {
        console.error("Ошибка сохранения заказа:", error.message);

        return res.status(500).json({
            error: "Не удалось сохранить заказ. Попробуй позже."
        });
    }
});


/* Запускаем сервер.
   PORT автоматически задаётся хостингом.
   Локально используем порт 3000, если другой не задан. */

// Запускаем сервер.
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сайт запущен на порту ${PORT}`);
});


// Закрываем соединение с базой при остановке сервера.
function shutdown() {
    db.close();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
