(() => {
  "use strict";

  const config = window.PEPPER_CONFIG || {};
  const params = new URLSearchParams(window.location.search);
  const attributionKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "yclid", "gclid"];
  const attribution = Object.fromEntries(attributionKeys.map((key) => [key, params.get(key) || ""]));
  const device = matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop";
  const pageUrl = location.href;

  const emit = (name, detail = {}) => {
    const event = { event: name, ...detail, attribution, device, pageUrl, timestamp: new Date().toISOString() };
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(event);
    const counterId = Number(config.analytics?.yandexCounterId);
    if (counterId && typeof window.ym === "function") window.ym(counterId, "reachGoal", name, detail);
    window.dispatchEvent(new CustomEvent("pepper:event", { detail: event }));
  };

  const menuButton = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".site-nav");
  menuButton?.addEventListener("click", () => {
    const open = !nav.classList.contains("is-open");
    nav.classList.toggle("is-open", open);
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
  });
  nav?.addEventListener("click", (event) => {
    if (!event.target.closest("a")) return;
    nav.classList.remove("is-open");
    menuButton?.setAttribute("aria-expanded", "false");
  });

  const slides = [...document.querySelectorAll(".slide")];
  const dotsRoot = document.querySelector(".slider-dots");
  const slider = document.querySelector(".slider");
  let slideIndex = 0;
  let slideTimer;
  let pointerStartX = null;

  slides.forEach((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "slider-dot";
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-label", `Показать баннер ${index + 1}`);
    dot.addEventListener("click", () => showSlide(index, true));
    dotsRoot.append(dot);
  });
  const dots = [...document.querySelectorAll(".slider-dot")];

  function showSlide(index, userInitiated = false) {
    slideIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, itemIndex) => slide.classList.toggle("is-active", itemIndex === slideIndex));
    dots.forEach((dot, itemIndex) => dot.setAttribute("aria-selected", String(itemIndex === slideIndex)));
    if (userInitiated) emit("banner_change", { bannerIndex: slideIndex + 1 });
    restartSlider();
  }
  function restartSlider() {
    clearInterval(slideTimer);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) slideTimer = setInterval(() => showSlide(slideIndex + 1), 6000);
  }
  document.querySelector(".slider-prev")?.addEventListener("click", () => showSlide(slideIndex - 1, true));
  document.querySelector(".slider-next")?.addEventListener("click", () => showSlide(slideIndex + 1, true));
  slider?.addEventListener("mouseenter", () => clearInterval(slideTimer));
  slider?.addEventListener("mouseleave", restartSlider);
  slider?.addEventListener("focusin", () => clearInterval(slideTimer));
  slider?.addEventListener("focusout", restartSlider);
  slider?.addEventListener("pointerdown", (event) => { pointerStartX = event.clientX; });
  slider?.addEventListener("pointerup", (event) => {
    if (pointerStartX === null) return;
    const distance = event.clientX - pointerStartX;
    if (Math.abs(distance) > 45) showSlide(slideIndex + (distance < 0 ? 1 : -1), true);
    pointerStartX = null;
  });
  showSlide(0);

  const seenSections = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting || seenSections.has(entry.target.id)) return;
      seenSections.add(entry.target.id);
      emit("section_view", { section: entry.target.id });
    });
  }, { threshold: 0.45 });
  document.querySelectorAll("main section[id]").forEach((section) => observer.observe(section));

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.14, rootMargin: "0px 0px -5% 0px" });
  document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

  const dialog = document.querySelector("#quiz-dialog");
  const quizContent = document.querySelector("#quiz-content");
  const progressBar = document.querySelector("#progress-bar");
  const progressLabel = document.querySelector("#progress-label");
  const progressCount = document.querySelector("#progress-count");
  const answers = {};
  const history = [];
  let currentQuestionId = "budget";
  let openedAt = 0;

  const questions = {
    budget: {
      title: "Какой бюджет планируете?",
      copy: "Можно выбрать ориентир — точную сумму уточним при расчёте.",
      options: [["до 3 млн ₽", "up_to_3"], ["3–5 млн ₽", "3_to_5"], ["Более 5 млн ₽", "over_5"], ["Пока не определился", "unknown"]],
      next: () => "origin"
    },
    origin: {
      title: "Откуда рассматриваете автомобиль?",
      copy: "Маршрут влияет на выбор моделей, сроки и состав платежей.",
      options: [["Китай", "china"], ["Европа", "europe"], ["Сравнить оба варианта", "compare"], ["Нужна рекомендация", "unknown"]],
      next: (value) => value === "europe" ? "diesel" : value === "china" ? "body" : "priority"
    },
    diesel: {
      title: "Рассматриваете дизель?",
      copy: "Это поможет точнее подобрать доступные варианты из Европы.",
      options: [["Да, только дизель", "diesel_only"], ["Можно бензин", "petrol_ok"], ["Рассмотрю гибрид", "hybrid_ok"], ["Не принципиально", "any"]],
      next: () => "timeline"
    },
    body: {
      title: "Какой кузов предпочтительнее?",
      copy: "Если вариантов несколько, выберите основной.",
      options: [["Кроссовер", "suv"], ["Седан", "sedan"], ["Минивэн", "minivan"], ["Не принципиально", "any"]],
      next: () => "timeline"
    },
    priority: {
      title: "Что важнее при выборе?",
      copy: "Покажем варианты с учётом главного приоритета.",
      options: [["Минимальная цена", "price"], ["Срок доставки", "speed"], ["Комплектация", "features"], ["Надёжность", "reliability"]],
      next: () => "timeline"
    },
    timeline: {
      title: "Когда планируете покупку?",
      copy: "Это поможет оценить доступные маршруты и сроки.",
      options: [["В ближайший месяц", "month"], ["В течение 2–3 месяцев", "quarter"], ["Позже", "later"], ["Сначала хочу расчёт", "estimate"]],
      next: () => "contact"
    }
  };

  function pathTotal() { return 5; }
  function currentStepNumber() { return Math.min(history.length + 1, pathTotal()); }
  function setProgress(step) {
    const total = pathTotal();
    progressLabel.textContent = step === total ? "Контактные данные" : `Шаг ${step}`;
    progressCount.textContent = `${step} из ${total}`;
    progressBar.style.width = `${Math.round(step / total * 100)}%`;
  }
  function renderQuestion(id) {
    currentQuestionId = id;
    const question = questions[id];
    setProgress(currentStepNumber());
    quizContent.innerHTML = `
      <section class="quiz-step">
        <p class="quiz-kicker">Подбор автомобиля</p>
        <h2 id="quiz-title">${question.title}</h2>
        <p class="quiz-copy">${question.copy}</p>
        <div class="answer-grid">
          ${question.options.map(([label, value]) => `<button class="answer-button${answers[id] === value ? " is-selected" : ""}" type="button" data-value="${value}">${label}</button>`).join("")}
        </div>
        <div class="quiz-actions">${history.length ? '<button class="secondary-button js-quiz-back" type="button">Назад</button>' : '<span></span>'}</div>
      </section>`;
    quizContent.querySelectorAll(".answer-button").forEach((button) => button.addEventListener("click", () => chooseAnswer(button.dataset.value)));
    quizContent.querySelector(".js-quiz-back")?.addEventListener("click", goBack);
    quizContent.querySelector(".answer-button")?.focus();
  }
  function chooseAnswer(value) {
    answers[currentQuestionId] = value;
    emit("quiz_step", { question: currentQuestionId, answer: value, completedSteps: history.length + 1 });
    quizContent.querySelectorAll(".answer-button").forEach((button) => button.classList.toggle("is-selected", button.dataset.value === value));
    const next = questions[currentQuestionId].next(value);
    history.push(currentQuestionId);
    setTimeout(() => next === "contact" ? renderContact() : renderQuestion(next), 160);
  }
  function goBack() {
    const previous = history.pop();
    if (previous) renderQuestion(previous);
  }
  function renderContact() {
    currentQuestionId = "contact";
    setProgress(pathTotal());
    const template = document.querySelector("#quiz-contact-template");
    quizContent.replaceChildren(template.content.cloneNode(true));
    const form = quizContent.querySelector("#lead-form");
    const phone = form.elements.phone;
    const geo = getPhoneProfile();
    phone.placeholder = geo.placeholder;
    phone.addEventListener("input", () => {
      phone.value = formatPhone(phone.value, geo);
      validatePhone(phone, geo, false);
    });
    form.querySelector(".js-quiz-back").addEventListener("click", goBack);
    form.addEventListener("submit", (event) => submitLead(event, form, geo));
    form.elements.name.focus();
  }

  function getPhoneProfile() {
    const geo = (params.get("geo") || params.get("country") || "ru").toLowerCase();
    if (geo === "by") return { key: "by", code: "375", digits: 12, placeholder: "+375 (__) ___-__-__" };
    if (geo === "kz") return { key: "kz", code: "7", digits: 11, placeholder: "+7 (___) ___-__-__" };
    return { key: "ru", code: "7", digits: 11, placeholder: "+7 (___) ___-__-__" };
  }
  function normalizePhone(value, profile) {
    let digits = value.replace(/\D/g, "");
    if ((profile.key === "ru" || profile.key === "kz") && digits.length === 10) digits = `7${digits}`;
    if (profile.key === "ru" && digits.startsWith("8") && digits.length === 11) digits = `7${digits.slice(1)}`;
    if (profile.key === "by" && digits.length === 9) digits = `375${digits}`;
    return digits.slice(0, profile.digits);
  }
  function formatPhone(value, profile) {
    const digits = normalizePhone(value, profile);
    if (profile.key === "by") {
      const local = digits.startsWith("375") ? digits.slice(3) : digits;
      return `+375${local.length ? ` (${local.slice(0,2)}` : ""}${local.length >= 2 ? ") " : ""}${local.slice(2,5)}${local.length > 5 ? `-${local.slice(5,7)}` : ""}${local.length > 7 ? `-${local.slice(7,9)}` : ""}`;
    }
    const local = digits.startsWith("7") ? digits.slice(1) : digits;
    return `+7${local.length ? ` (${local.slice(0,3)}` : ""}${local.length >= 3 ? ") " : ""}${local.slice(3,6)}${local.length > 6 ? `-${local.slice(6,8)}` : ""}${local.length > 8 ? `-${local.slice(8,10)}` : ""}`;
  }
  function validatePhone(input, profile, announce = true) {
    const digits = normalizePhone(input.value, profile);
    const valid = digits.length === profile.digits && digits.startsWith(profile.code);
    const message = valid || !input.value ? "" : `Введите номер полностью: ${profile.placeholder}`;
    input.setCustomValidity(message);
    if (announce) document.querySelector("#phone-error").textContent = message;
    else if (valid) document.querySelector("#phone-error").textContent = "";
    return valid;
  }
  function submitLead(event, form, profile) {
    event.preventDefault();
    const phoneValid = validatePhone(form.elements.phone, profile);
    const channelValid = Boolean(form.elements.channel.value);
    const consentValid = form.elements.consent.checked;
    document.querySelector("#channel-error").textContent = channelValid ? "" : "Выберите удобный канал связи.";
    document.querySelector("#consent-error").textContent = consentValid ? "" : "Подтвердите согласие на обработку данных.";
    if (!form.elements.name.value.trim()) form.elements.name.setCustomValidity("Укажите имя."); else form.elements.name.setCustomValidity("");
    if (!phoneValid || !channelValid || !consentValid || !form.reportValidity()) return;

    const payload = {
      name: form.elements.name.value.trim(),
      phone: normalizePhone(form.elements.phone.value, profile),
      channel: form.elements.channel.value,
      consent: true,
      answers: { ...answers },
      attribution,
      metadata: { device, pageUrl, referrer: document.referrer, quizDurationSeconds: Math.round((Date.now() - openedAt) / 1000) }
    };
    renderSuccess();
    emit("lead_accepted", { channel: payload.channel, answers: payload.answers });
    void deliverLead(payload);
  }
  async function deliverLead(payload) {
    const endpoint = config.leadEndpoint;
    if (!endpoint) {
      queueLead(payload, "demo_no_endpoint");
      return;
    }
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      emit("lead_delivered", { channel: payload.channel });
    } catch (error) {
      queueLead(payload, "delivery_failed");
      emit("lead_delivery_failed", { message: String(error) });
    }
  }
  function queueLead(payload, reason) {
    const key = "pepperPendingLeads";
    const queue = JSON.parse(localStorage.getItem(key) || "[]");
    queue.push({ ...payload, queuedAt: new Date().toISOString(), reason });
    localStorage.setItem(key, JSON.stringify(queue.slice(-20)));
  }
  function renderSuccess() {
    setProgress(pathTotal());
    quizContent.innerHTML = `<section class="success-state" aria-live="polite"><div class="success-icon">✓</div><h2 id="quiz-title">Заявка принята</h2><p>Спасибо. Мы подготовим расчёт и свяжемся с вами через выбранный канал.</p><button class="secondary-button js-success-close" type="button">Закрыть</button></section>`;
    quizContent.querySelector(".js-success-close").addEventListener("click", closeQuiz);
    quizContent.querySelector(".js-success-close").focus();
  }
  function openQuiz() {
    Object.keys(answers).forEach((key) => delete answers[key]);
    history.splice(0);
    openedAt = Date.now();
    renderQuestion("budget");
    if (!dialog.open) dialog.showModal();
    document.body.classList.add("is-locked");
    emit("quiz_started");
  }
  function closeQuiz() {
    if (dialog.open) dialog.close();
    document.body.classList.remove("is-locked");
  }
  document.querySelectorAll(".js-open-quiz").forEach((button) => button.addEventListener("click", openQuiz));
  document.querySelector(".quiz-close")?.addEventListener("click", closeQuiz);
  dialog?.addEventListener("click", (event) => { if (event.target === dialog) closeQuiz(); });
  dialog?.addEventListener("cancel", () => document.body.classList.remove("is-locked"));

  function registerWebMcp() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const report = (error) => console.warn("WebMCP registration failed", error);
    try {
      Promise.resolve(context.registerTool({
        name: "start_vehicle_quote",
        title: "Начать подбор автомобиля",
        description: "Открывает квиз подбора автомобиля без отправки персональных данных.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute() { openQuiz(); return { status: "quiz_opened", step: "budget" }; }
      })).catch(report);
      Promise.resolve(context.registerTool({
        name: "prepare_vehicle_quote",
        title: "Подготовить параметры подбора",
        description: "Заполняет неперсональные параметры подбора и открывает экран контактных данных. Ничего не отправляет.",
        inputSchema: {
          type: "object",
          properties: {
            budget: { type: "string", enum: ["up_to_3", "3_to_5", "over_5", "unknown"] },
            origin: { type: "string", enum: ["china", "europe", "compare", "unknown"] },
            timeline: { type: "string", enum: ["month", "quarter", "later", "estimate"] }
          },
          required: ["budget", "origin", "timeline"],
          additionalProperties: false
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (!input || typeof input !== "object") throw new Error("Параметры не переданы");
          answers.budget = input.budget;
          answers.origin = input.origin;
          answers.timeline = input.timeline;
          history.splice(0, history.length, "budget", "origin", input.origin === "europe" ? "diesel" : input.origin === "china" ? "body" : "priority", "timeline");
          openedAt = Date.now();
          if (!dialog.open) dialog.showModal();
          document.body.classList.add("is-locked");
          renderContact();
          return { status: "prepared", next: "contact_details", transmitted: false };
        }
      })).catch(report);
    } catch (error) { report(error); }
  }
  registerWebMcp();
})();
