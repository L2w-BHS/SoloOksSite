

document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // 1. КАРУСЕЛЬ ЦЕЛЫХ ТОВАРОВ
    // ==========================================

    const productsCarousel = document.querySelector(".products-carousel");
    const productsTrack = document.querySelector(".products-carousel-track");
    const productsDotsContainer = document.querySelector(".products-carousel-dots");
    const productsPrev = document.querySelector(".products-arrow-prev");
    const productsNext = document.querySelector(".products-arrow-next");

    if (productsCarousel && productsTrack && productsDotsContainer) {
        const products = Array.from(productsTrack.querySelectorAll(".products-slide"));
        let currentProduct = 0;

        productsDotsContainer.innerHTML = "";

        const productDots = products.map((product, index) => {
            const dot = document.createElement("button");

            dot.type = "button";
            dot.className = "products-dot";
            dot.setAttribute(
                "aria-label",
                index === 0 ? "Открытки" : "Браслет Solo"
            );

            dot.addEventListener("click", () => showProduct(index));

            productsDotsContainer.appendChild(dot);
            return dot;
        });

        function showProduct(index) {
            if (!products.length) return;

            currentProduct = (index + products.length) % products.length;

            productsTrack.style.transform =
                `translateX(-${currentProduct * 100}%)`;

            productDots.forEach((dot, i) => {
                dot.classList.toggle("active", i === currentProduct);
                dot.setAttribute(
                    "aria-current",
                    i === currentProduct ? "true" : "false"
                );
            });

            products.forEach((product, i) => {
                product.setAttribute(
                    "aria-hidden",
                    i === currentProduct ? "false" : "true"
                );
            });
        }

        productsPrev?.addEventListener("click", () => {
            showProduct(currentProduct - 1);
        });

        productsNext?.addEventListener("click", () => {
            showProduct(currentProduct + 1);
        });

        // Поддержка свайпа пальцем и мышью
        let startX = 0;
        let startY = 0;
        let isDragging = false;

        productsCarousel.addEventListener("touchstart", event => {
            startX = event.touches[0].clientX;
            startY = event.touches[0].clientY;
        }, { passive: true });

        productsCarousel.addEventListener("touchend", event => {
            const endX = event.changedTouches[0].clientX;
            const endY = event.changedTouches[0].clientY;
            const deltaX = endX - startX;
            const deltaY = endY - startY;

            // Не мешаем вертикальной прокрутке страницы
            if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY)) {
                showProduct(currentProduct + (deltaX < 0 ? 1 : -1));
            }
        }, { passive: true });

        productsCarousel.addEventListener("keydown", event => {
            if (event.key === "ArrowLeft") {
                showProduct(currentProduct - 1);
            }

            if (event.key === "ArrowRight") {
                showProduct(currentProduct + 1);
            }
        });

        showProduct(0);
    }


    // ==========================================
    // КАРУСЕЛЬ ЦИФРОВЫХ ВЕРСИЙ КНИГИ
    // ==========================================
    const digitalCarousel = document.querySelector(".digital-carousel");
    const digitalTrack = document.querySelector(".digital-carousel-track");
    const digitalDotsBox = document.querySelector(".digital-carousel-dots");
    const digitalPrev = document.querySelector(".digital-arrow-prev");
    const digitalNext = document.querySelector(".digital-arrow-next");

    if (digitalCarousel && digitalTrack && digitalDotsBox) {
        const slides = Array.from(digitalTrack.querySelectorAll(".digital-slide"));
        let activeSlide = 0;
        let pointerStartX = 0;
        let pointerStartY = 0;
        let dragging = false;
        digitalDotsBox.innerHTML = "";

        const dots = slides.map((slide, index) => {
            const dot = document.createElement("button");
            dot.type = "button";
            dot.className = "digital-dot";
            dot.setAttribute("aria-label", `Показать формат ${index + 1}`);
            dot.addEventListener("click", () => showDigitalSlide(index));
            digitalDotsBox.appendChild(dot);
            return dot;
        });

        function showDigitalSlide(index) {
            if (!slides.length) return;
            activeSlide = (index + slides.length) % slides.length;
            digitalTrack.style.transform = `translateX(-${activeSlide * 100}%)`;
            dots.forEach((dot, i) => {
                dot.classList.toggle("active", i === activeSlide);
                dot.setAttribute("aria-current", i === activeSlide ? "true" : "false");
            });
            slides.forEach((slide, i) => slide.setAttribute("aria-hidden", i === activeSlide ? "false" : "true"));
        }

        digitalPrev?.addEventListener("click", () => showDigitalSlide(activeSlide - 1));
        digitalNext?.addEventListener("click", () => showDigitalSlide(activeSlide + 1));
        digitalCarousel.addEventListener("keydown", event => {
            if (event.key === "ArrowLeft") showDigitalSlide(activeSlide - 1);
            if (event.key === "ArrowRight") showDigitalSlide(activeSlide + 1);
        });
        digitalTrack.addEventListener("pointerdown", event => {
            if (event.pointerType === "mouse" && event.button !== 0) return;
            pointerStartX = event.clientX;
            pointerStartY = event.clientY;
            dragging = true;
            digitalTrack.classList.add("is-dragging");
        });
        digitalTrack.addEventListener("pointerup", event => {
            if (!dragging) return;
            dragging = false;
            digitalTrack.classList.remove("is-dragging");
            const dx = event.clientX - pointerStartX;
            const dy = event.clientY - pointerStartY;
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) showDigitalSlide(activeSlide + (dx < 0 ? 1 : -1));
        });
        digitalTrack.addEventListener("pointercancel", () => { dragging = false; digitalTrack.classList.remove("is-dragging"); });
        showDigitalSlide(0);
    }


    // ==========================================
    // ОПЛАТА ЭЛЕКТРОННОЙ И АУДИОКНИГИ
    // ==========================================
    // ==========================================
    // 2. КАРУСЕЛЬ ФОТОГРАФИЙ ОТКРЫТОК
    // ==========================================

    // Ищем карусель только внутри карточки открыток.
    const postcardProduct = document.querySelector(
        '.products-slide .postcards-gallery:not(.bracelet-gallery)'
    );

    const postcardCarousel = postcardProduct?.querySelector(".postcards-carousel");
    const postcardTrack = postcardProduct?.querySelector(".postcards-carousel-track");
    const postcardDotsContainer = postcardProduct?.querySelector(".postcards-dots");
    const postcardPrev = postcardProduct?.querySelector(".postcards-arrow-prev");
    const postcardNext = postcardProduct?.querySelector(".postcards-arrow-next");
    const postcardNumberLabel = postcardProduct?.querySelector(".postcards-number");
    const postcardNumberInput = document.getElementById("postcard-number");

    if (postcardCarousel && postcardTrack && postcardDotsContainer) {
        const images = Array.from(postcardTrack.querySelectorAll("img"));
        let currentImage = 0;

        postcardDotsContainer.innerHTML = "";

        const imageDots = images.map((image, index) => {
            const dot = document.createElement("button");

            dot.type = "button";
            dot.className = "postcards-dot";
            dot.setAttribute("aria-label", `Открытка ${index + 1}`);

            dot.addEventListener("click", () => showImage(index));

            postcardDotsContainer.appendChild(dot);
            return dot;
        });

        function showImage(index) {
            if (!images.length) return;

            currentImage = (index + images.length) % images.length;

            if (postcardNumberLabel) {
                postcardNumberLabel.textContent =
                    `Открытка № ${currentImage + 1} из ${images.length}`;
            }

            if (postcardNumberInput) {
                postcardNumberInput.value = String(currentImage + 1);
            }

            postcardTrack.style.transform =
                `translateX(-${currentImage * 100}%)`;

            imageDots.forEach((dot, i) => {
                dot.classList.toggle("active", i === currentImage);
                dot.setAttribute(
                    "aria-current",
                    i === currentImage ? "true" : "false"
                );
            });

            images.forEach((image, i) => {
                image.setAttribute(
                    "aria-hidden",
                    i === currentImage ? "false" : "true"
                );
            });
        }

        postcardNumberInput?.addEventListener("change", () => {
            const selectedNumber = Number(postcardNumberInput.value);
            if (Number.isInteger(selectedNumber) && selectedNumber >= 1 && selectedNumber <= images.length) {
                showImage(selectedNumber - 1);
            } else {
                postcardNumberInput.value = String(currentImage + 1);
                alert(`Введи номер от 1 до ${images.length}.`);
            }
        });

        postcardPrev?.addEventListener("click", () => {
            showImage(currentImage - 1);
        });

        postcardNext?.addEventListener("click", () => {
            showImage(currentImage + 1);
        });

        postcardCarousel.addEventListener("keydown", event => {
            if (event.key === "ArrowLeft") {
                showImage(currentImage - 1);
            }

            if (event.key === "ArrowRight") {
                showImage(currentImage + 1);
            }
        });

        showImage(0);
    }


    // ==========================================
    // 3. МОДАЛЬНОЕ ОКНО ЗАКАЗА ОТКРЫТОК
    // ==========================================

    const modal = document.getElementById("postcard-order-modal");
    const form = document.getElementById("postcard-order-form");

    // Только кнопка внутри карточки открыток открывает форму.
    const openButton = document.querySelector(
        '.products-slide:first-child .postcards-order-button'
    );

    const closeButton = modal?.querySelector(".modal-close");

    function openModal() {
        if (!modal) return;

        modal.style.display = "flex";
        document.body.style.overflow = "hidden";

        if (postcardNumberInput && postcardProduct) {
            const activeDot = postcardDotsContainer?.querySelector('.postcards-dot.active');
            const selectedIndex = activeDot ? Array.from(postcardDotsContainer.children).indexOf(activeDot) : 0;
            postcardNumberInput.value = String(selectedIndex + 1);
        }

        postcardNumberInput?.focus();
    }

    function closeModal() {
        if (!modal) return;

        modal.style.display = "none";
        document.body.style.overflow = "";
    }

    openButton?.addEventListener("click", openModal);
    closeButton?.addEventListener("click", closeModal);

    modal?.addEventListener("click", event => {
        if (event.target === modal) {
            closeModal();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && modal?.style.display === "flex") {
            closeModal();
        }
    });


    // ==========================================
    // 4. ОТПРАВКА ЗАКАЗА ОТКРЫТОК НА СЕРВЕР
    // ==========================================

    if (form) {
        form.addEventListener("submit", async event => {
            event.preventDefault();

            const postcardNumberInput = form.querySelector('[name="postcardNumber"]');
            const phoneInput = form.querySelector('[name="phone"]');
            const addressInput = form.querySelector('[name="postalAddress"]');
            const submitButton = form.querySelector('button[type="submit"]');
            const offerCheckbox = form.querySelector('[name="offerAccepted"]');
            const consentCheckbox = form.querySelector('[name="personalDataConsent"]');

            const postcardNumber = Number(postcardNumberInput?.value);
            const phone = phoneInput?.value.trim() || "";
            const postalAddress = addressInput?.value.trim() || "";

            if (!Number.isInteger(postcardNumber) || postcardNumber < 1 || postcardNumber > 6) {
                alert("Укажи номер открытки от 1 до 6.");
                postcardNumberInput?.focus();
                return;
            }

            const digits = phone.replace(/\D/g, "");

            if (digits.length < 10 || digits.length > 15) {
                alert("Проверь номер телефона и попробуй ещё раз.");
                phoneInput?.focus();
                return;
            }

            if (postalAddress.length < 5) {
                alert(
                    "Укажи город, почтовый индекс и адрес отделения Почты России."
                );
                addressInput?.focus();
                return;
            }

            if (!offerCheckbox?.checked || !consentCheckbox?.checked) {
                alert(
                    "Для оформления заказа необходимо принять оферту " +
                    "и отдельно дать согласие на обработку персональных данных."
                );
                return;
            }

            const originalButtonText = submitButton?.textContent;

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = "Подготавливаем оплату...";
            }

            try {
                const response = await fetch("/api/postcard/create-payment", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        postcardNumber,
                        phone,
                        postalAddress,
                        offerAccepted: offerCheckbox.checked,
                        personalDataConsent: consentCheckbox.checked,
                        consentVersion: "2026-10-28"
                    })
                });

                const result = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(
                        result.error ||
                        "Не удалось создать заказ. Попробуй позже."
                    );
                }

                if (!result.paymentUrl) {
                    throw new Error(
                        "Сервер пока не вернул ссылку на оплату. " +
                        "Возможно, обработчик оплаты ещё не настроен."
                    );
                }

                window.location.assign(result.paymentUrl);

            } catch (error) {
                console.error("Ошибка заказа открытки:", error);

                alert(
                    error.message ||
                    "Не удалось отправить заказ. Проверь соединение и попробуй ещё раз."
                );

                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent =
                        originalButtonText || "Перейти к оплате — 250 ₽";
                }
            }
        });
    }

});
