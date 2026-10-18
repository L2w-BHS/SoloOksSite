
/* Плавная прокрутка к разделам сайта */
document.addEventListener("click", function (event) {
    const link = event.target.closest('a[href^="#"]');

    if (!link) return;

    const targetId = link.getAttribute("href");

    if (!targetId || targetId === "#") return;

    const target = document.querySelector(targetId);

    if (!target) return;

    event.preventDefault();

    target.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    // Обновляем адрес страницы без резкого перехода
    history.replaceState(null, "", targetId);
});
