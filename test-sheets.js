require("dotenv").config();

async function main() {
  const url = process.env.GOOGLE_SHEETS_URL;
  const secret = process.env.GOOGLE_SHEETS_SECRET;

  if (!url || !secret) {
    throw new Error("Не найдены настройки Google Таблиц в .env");
  }

  const orderId = `TEST-${Date.now()}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId,
      fullName: "ТЕСТОВЫЙ ЗАКАЗ — УДАЛИТЬ",
      phone: "+70000000000",
      deliveryMethod: "ТЕСТ — НЕ ОТПРАВЛЯТЬ",
      social: "",
      amount: 1500,
      status: "paid",
      createdAt: new Date().toISOString(),
      secret
    }),
    signal: AbortSignal.timeout(20000)
  });

  const text = await response.text();

  console.log("Номер теста:", orderId);
  console.log("HTTP:", response.status);
  console.log("Ответ Google:", text);

  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("Google вернул ответ не в формате JSON");
  }

  if (!response.ok || result.ok !== true) {
    throw new Error(result.error || "Google не принял тестовый заказ");
  }

  console.log("УСПЕХ: тестовый заказ отправлен в таблицу");
}

main().catch(error => {
  console.error("ОШИБКА:", error.message);
  process.exitCode = 1;
});