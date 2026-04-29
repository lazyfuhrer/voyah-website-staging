(() => {
  "use strict";

  const DESKTOP_MQ = "(min-width: 1024px) and (pointer: fine)";
  const SLOT_START_H = 10;
  const SLOT_END_H = 20; // inclusive
  const SLOT_STEP_MIN = 60;
  const PLACEHOLDER = "--:-- --";

  function isDesktop() {
    try {
      if (typeof window === "undefined") return false;
      const mqOk = window.matchMedia && window.matchMedia(DESKTOP_MQ).matches;
      const wOk = typeof window.innerWidth === "number" ? window.innerWidth >= 1024 : true;
      return Boolean(mqOk && wOk);
    } catch {
      return false;
    }
  }

  function dispatch(el, type) {
    if (!el) return;
    try {
      el.dispatchEvent(new Event(type, { bubbles: true }));
    } catch {
      const evt = document.createEvent("Event");
      evt.initEvent(type, true, true);
      el.dispatchEvent(evt);
    }
  }

  function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
  }

  function buildSlots() {
    const slots = [];
    for (let h = SLOT_START_H; h <= SLOT_END_H; h += 1) {
      for (let m = 0; m < 60; m += SLOT_STEP_MIN) {
        slots.push(`${pad2(h)}:${pad2(m)}`);
      }
    }
    return slots;
  }

  function parseHm(str) {
    const m = /^(\d{2}):(\d{2})$/.exec((str || "").trim());
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return hh * 60 + mm;
  }

  function getTimeFieldRow(timeInput) {
    if (!timeInput) return null;
    return timeInput.closest(".jet-form-builder-row.field-type-time-field");
  }

  function setActiveOption(ui, idx) {
    const options = ui.menu.querySelectorAll('[role="option"]');
    const max = options.length - 1;
    const next = Math.max(0, Math.min(max, idx));
    ui.activeIndex = next;
    options.forEach((el, i) => el.classList.toggle("is-active", i === next));
    const el = options[next];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }

  function closeMenu(ui) {
    if (!ui || !ui.menu || !ui.trigger) return;
    ui.menu.hidden = true;
    ui.trigger.setAttribute("aria-expanded", "false");
  }

  function openMenu(ui) {
    if (!ui || !ui.menu || !ui.trigger) return;
    ui.menu.hidden = false;
    ui.trigger.setAttribute("aria-expanded", "true");

    // Align active index to selected if present, else first enabled option.
    const options = Array.from(ui.menu.querySelectorAll('[role="option"]'));
    const selectedIdx = options.findIndex((el) => el.getAttribute("aria-selected") === "true");
    if (selectedIdx >= 0) {
      setActiveOption(ui, selectedIdx);
      return;
    }
    const firstEnabled = options.findIndex((el) => el.getAttribute("aria-disabled") !== "true");
    setActiveOption(ui, firstEnabled >= 0 ? firstEnabled : 0);
  }

  function toggleMenu(ui) {
    if (!ui || !ui.menu) return;
    if (ui.menu.hidden) openMenu(ui);
    else closeMenu(ui);
  }

  function renderTriggerText(ui, value) {
    const v = (value || "").trim();
    ui.valueEl.textContent = v || PLACEHOLDER;
    ui.trigger.classList.toggle("has-value", Boolean(v));
  }

  function markSelected(ui, value) {
    const v = (value || "").trim();
    const options = Array.from(ui.menu.querySelectorAll('[role="option"]'));
    options.forEach((el) => {
      const isSel = el.dataset.value === v && v;
      el.setAttribute("aria-selected", isSel ? "true" : "false");
      el.classList.toggle("is-selected", Boolean(isSel));
    });
    renderTriggerText(ui, v);
  }

  function ensureUi(timeInput) {
    const row = getTimeFieldRow(timeInput);
    if (!row) return null;

    let wrap = row.querySelector(".voyah-time-slot-wrap");
    let trigger = row.querySelector(".voyah-time-combobox");
    let menu = row.querySelector(".voyah-time-menu");
    if (wrap && trigger && menu) {
      return {
        row,
        wrap,
        trigger,
        valueEl: trigger.querySelector(".voyah-time-value"),
        menu,
        activeIndex: 0,
      };
    }

    wrap = document.createElement("div");
    wrap.className = "voyah-time-slot-wrap";

    trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "voyah-time-combobox";
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-label", "Preferred Time");

    const valueEl = document.createElement("span");
    valueEl.className = "voyah-time-value";
    valueEl.textContent = PLACEHOLDER;
    trigger.appendChild(valueEl);

    menu = document.createElement("div");
    menu.className = "voyah-time-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;

    for (const t of buildSlots()) {
      const opt = document.createElement("div");
      opt.className = "voyah-time-option";
      opt.setAttribute("role", "option");
      opt.setAttribute("aria-selected", "false");
      opt.dataset.value = t;
      opt.textContent = t;
      menu.appendChild(opt);
    }

    wrap.appendChild(trigger);
    wrap.appendChild(menu);

    // Insert after label; keep layout consistent.
    const label = row.querySelector(".jet-form-builder__label");
    if (label && label.nextSibling) row.insertBefore(wrap, label.nextSibling);
    else row.appendChild(wrap);

    return { row, wrap, trigger, valueEl, menu, activeIndex: 0 };
  }

  function applyMinFiltering(timeInput, ui) {
    const min = (timeInput && timeInput.getAttribute("min")) || "";
    const minMins = parseHm(min);
    const hasMin = typeof minMins === "number";

    const currentVal = (timeInput.value || "").trim();
    let currentValid = true;

    const options = Array.from(ui.menu.querySelectorAll('[role="option"]'));
    options.forEach((el) => {
      const v = el.dataset.value || "";
      const vMins = parseHm(v);
      const disabled = hasMin && typeof vMins === "number" ? vMins < minMins : false;
      el.setAttribute("aria-disabled", disabled ? "true" : "false");
      el.classList.toggle("is-disabled", disabled);
      if (v && v === currentVal && disabled) currentValid = false;
    });

    if (currentVal && !currentValid) {
      timeInput.value = "";
      markSelected(ui, "");
      dispatch(timeInput, "input");
      dispatch(timeInput, "change");
    }
  }

  function syncFromNative(timeInput, ui) {
    const v = (timeInput.value || "").trim();
    // If native has a time like 10:30, it won't exist; show placeholder in that case.
    const exists = Array.from(ui.menu.querySelectorAll('[role="option"]')).some((el) => el.dataset.value === v);
    markSelected(ui, exists ? v : "");
  }

  function initDesktop() {
    const timeInput = document.getElementById("time");
    if (!timeInput) return;
    if (!isDesktop()) return;
    if (timeInput.dataset && timeInput.dataset.voyahTimeSlotInit === "1") return;

    const ui = ensureUi(timeInput);
    if (!ui) return;

    // Hide native input but keep it in DOM for submission/validation.
    // Also switch away from `type="time"` so the browser can't open a native picker.
    timeInput.setAttribute("type", "text");
    timeInput.setAttribute("readonly", "readonly");
    timeInput.setAttribute("inputmode", "none");
    timeInput.classList.add("voyah-time-native-hidden");
    if (timeInput.dataset) timeInput.dataset.voyahTimeSlotInit = "1";

    syncFromNative(timeInput, ui);
    applyMinFiltering(timeInput, ui);

    const onOptionPick = (v) => {
      const val = (v || "").trim();
      // Do not allow selecting disabled options.
      const el = ui.menu.querySelector(`[role="option"][data-value="${CSS.escape(val)}"]`);
      if (el && el.getAttribute("aria-disabled") === "true") return;
      timeInput.value = val;
      markSelected(ui, val);
      closeMenu(ui);
      dispatch(timeInput, "input");
      dispatch(timeInput, "change");
    };

    ui.trigger.addEventListener("click", () => toggleMenu(ui));

    ui.menu.addEventListener("click", (e) => {
      const target = e.target && e.target.closest ? e.target.closest('[role="option"]') : null;
      if (!target) return;
      const v = target.dataset.value || "";
      onOptionPick(v);
    });

    ui.trigger.addEventListener("keydown", (e) => {
      const key = e.key;
      if (key === "Enter" || key === " ") {
        e.preventDefault();
        toggleMenu(ui);
        return;
      }
      if (key === "Escape") {
        e.preventDefault();
        closeMenu(ui);
        return;
      }
      if (key === "ArrowDown" || key === "ArrowUp") {
        e.preventDefault();
        if (ui.menu.hidden) openMenu(ui);
        const delta = key === "ArrowDown" ? 1 : -1;
        setActiveOption(ui, ui.activeIndex + delta);
        return;
      }
    });

    ui.menu.addEventListener("keydown", (e) => {
      const key = e.key;
      if (key === "Escape") {
        e.preventDefault();
        closeMenu(ui);
        ui.trigger.focus();
        return;
      }
      if (key === "ArrowDown" || key === "ArrowUp") {
        e.preventDefault();
        const delta = key === "ArrowDown" ? 1 : -1;
        setActiveOption(ui, ui.activeIndex + delta);
        return;
      }
      if (key === "Enter") {
        e.preventDefault();
        const options = ui.menu.querySelectorAll('[role="option"]');
        const el = options[ui.activeIndex];
        if (!el) return;
        onOptionPick(el.dataset.value || "");
      }
    });

    // Click outside closes.
    const onDocDown = (e) => {
      if (!ui.wrap.contains(e.target)) closeMenu(ui);
    };
    document.addEventListener("pointerdown", onDocDown);

    // Keep for teardown.
    timeInput._voyahTimeUi = { ui, onDocDown };

    // Keep select in sync if other code mutates time/min.
    const onRecalc = () => {
      syncFromNative(timeInput, ui);
      applyMinFiltering(timeInput, ui);
    };
    timeInput.addEventListener("input", onRecalc);
    timeInput.addEventListener("change", onRecalc);

    const dateInput = document.getElementById("date");
    if (dateInput) {
      dateInput.addEventListener("input", () => setTimeout(onRecalc, 0));
      dateInput.addEventListener("change", () => setTimeout(onRecalc, 0));
    }
  }

  function teardownIfNeeded() {
    const timeInput = document.getElementById("time");
    if (!timeInput) return;
    if (!(timeInput.dataset && timeInput.dataset.voyahTimeSlotInit === "1")) return;
    if (isDesktop()) return;

    try {
      const saved = timeInput._voyahTimeUi;
      if (saved && saved.onDocDown) document.removeEventListener("pointerdown", saved.onDocDown);
      delete timeInput._voyahTimeUi;
    } catch {}

    const row = getTimeFieldRow(timeInput);
    if (row) {
      const wrap = row.querySelector(".voyah-time-slot-wrap");
      if (wrap) wrap.remove();
    }

    timeInput.setAttribute("type", "time");
    timeInput.removeAttribute("readonly");
    timeInput.removeAttribute("inputmode");
    timeInput.classList.remove("voyah-time-native-hidden");
    if (timeInput.dataset) timeInput.dataset.voyahTimeSlotInit = "0";
  }

  function boot() {
    initDesktop();

    if (window.matchMedia) {
      const mq = window.matchMedia(DESKTOP_MQ);
      const onMq = () => {
        teardownIfNeeded();
        initDesktop();
      };
      if (mq.addEventListener) mq.addEventListener("change", onMq);
      else if (mq.addListener) mq.addListener(onMq);
    }

    let resizeT = 0;
    window.addEventListener(
      "resize",
      () => {
        window.clearTimeout(resizeT);
        resizeT = window.setTimeout(() => {
          teardownIfNeeded();
          initDesktop();
        }, 60);
      },
      { passive: true }
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

