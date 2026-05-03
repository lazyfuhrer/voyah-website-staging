(() => {
  "use strict";

  const DESKTOP_MQ = "(min-width: 1024px) and (pointer: fine)";
  const PLACEHOLDER = "dd/mm/yyyy";

  function isDesktop() {
    try {
      if (typeof window === "undefined") return false;
      // Be strict: desktop means both media query + actual viewport width.
      // This also handles cases where pointer is fine but viewport is narrow (resized window).
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
      // IE11-style fallback (not expected, but harmless)
      const evt = document.createEvent("Event");
      evt.initEvent(type, true, true);
      el.dispatchEvent(evt);
    }
  }

  function getHtmlLang() {
    const html = document.documentElement;
    return (html && (html.getAttribute("lang") || "")).toLowerCase();
  }

  function pickLocale() {
    // Keep the calendar UI in English for all pages (including Arabic),
    // per requirement to match EN calendar wording.
    return "default";
  }

  function lockFlatpickrYear(instance) {
    const yearEl = instance && instance.currentYearElement;
    if (!yearEl) return;

    yearEl.setAttribute("readonly", "readonly");
    yearEl.setAttribute("tabindex", "-1");
    yearEl.removeAttribute("disabled");

    // Block direct edits (typing, spin buttons, wheel) while keeping the value visible.
    yearEl.style.cursor = "default";
    yearEl.style.pointerEvents = "none";

    if (yearEl.dataset && yearEl.dataset.voyahYearLockBound === "1") return;
    if (yearEl.dataset) yearEl.dataset.voyahYearLockBound = "1";

    yearEl.addEventListener(
      "keydown",
      (e) => {
        const k = e.key;
        if (k === "Tab" || k === "Escape") return;
        e.preventDefault();
      },
      true
    );

    yearEl.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
      },
      { passive: false, capture: true }
    );
  }

  function initOnce() {
    const dateInput = document.getElementById("date");
    if (!dateInput) return;
    if (!window.flatpickr) return;
    if (!isDesktop()) return;
    if (dateInput.dataset && dateInput.dataset.voyahFpInit === "1") return;

    // Use flatpickr only on desktop. Keep mobile `type="date"` OS picker.
    // On desktop we need `type="text"` so browsers don't force native UIs.
    if (!dateInput.getAttribute("placeholder")) dateInput.setAttribute("placeholder", PLACEHOLDER);
    dateInput.setAttribute("type", "text");
    dateInput.setAttribute("inputmode", "none");
    dateInput.setAttribute("autocomplete", "off");
    dateInput.setAttribute("readonly", "readonly");
    dateInput.classList.add("voyah-date-flatpickr");
    if (dateInput.dataset) dateInput.dataset.voyahFpInit = "1";

    const minDate = dateInput.getAttribute("min") || undefined;
    const maxDate = dateInput.getAttribute("max") || undefined;
    const locale = pickLocale();

    const instance = window.flatpickr(dateInput, {
      allowInput: false,
      clickOpens: true,
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "d/m/Y",
      minDate,
      maxDate,
      disableMobile: true,
      locale,
      onReady: (_selectedDates, _dateStr, instance) => {
        // Ensure the visible alt input receives our custom styling.
        if (instance && instance.altInput) {
          instance.altInput.classList.add("voyah-date-flatpickr");
          if (!instance.altInput.getAttribute("placeholder")) instance.altInput.setAttribute("placeholder", PLACEHOLDER);
        }

        lockFlatpickrYear(instance);

        // Keep the calendar aligned with text direction on RTL pages.
        const isRtl = document.documentElement.getAttribute("dir") === "rtl";
        if (isRtl) instance.calendarContainer.classList.add("voyah-flatpickr-rtl");
      },
      onOpen: (_selectedDates, _dateStr, instance) => {
        lockFlatpickrYear(instance);
      },
      onMonthChange: (_selectedDates, _dateStr, instance) => {
        lockFlatpickrYear(instance);
      },
      onYearChange: (_selectedDates, _dateStr, instance) => {
        lockFlatpickrYear(instance);
      },
      onChange: () => {
        // Ensure existing listeners (min-time sync, validation) run.
        dispatch(dateInput, "input");
        dispatch(dateInput, "change");
      },
      onClose: () => {
        dispatch(dateInput, "blur");
      },
    });

    // Keep a handle for teardown when leaving desktop.
    dateInput._voyahFlatpickr = instance;
  }

  function teardownIfNeeded() {
    const dateInput = document.getElementById("date");
    if (!dateInput) return;

    // Only teardown if we previously initialized.
    if (!(dateInput.dataset && dateInput.dataset.voyahFpInit === "1")) return;
    if (isDesktop()) return;

    try {
      if (dateInput._voyahFlatpickr && typeof dateInput._voyahFlatpickr.destroy === "function") {
        dateInput._voyahFlatpickr.destroy();
      }
    } catch {}

    try {
      delete dateInput._voyahFlatpickr;
    } catch {}

    // Restore native date input for non-desktop (mobile/tablet/resized window).
    if (!dateInput.getAttribute("placeholder")) dateInput.setAttribute("placeholder", PLACEHOLDER);
    dateInput.setAttribute("type", "date");
    dateInput.removeAttribute("readonly");
    dateInput.removeAttribute("inputmode");
    dateInput.classList.remove("voyah-date-flatpickr");
    if (dateInput.dataset) dateInput.dataset.voyahFpInit = "0";
  }

  function boot() {
    // Defer until the page's inline script has a chance to set min/max on #date.
    // We retry briefly in case scripts load/execute out of order.
    let tries = 0;
    const maxTries = 20;

    const tick = () => {
      tries += 1;
      try {
        // If the page was loaded on desktop then resized smaller (or devtools emulation
        // changes viewport), ensure we revert to native input.
        teardownIfNeeded();
        initOnce();
      } catch {
        // ignore; we'll retry a few times
      }
      if (tries < maxTries && (!window.flatpickr || !isDesktop() || (document.getElementById("date") && document.getElementById("date").dataset?.voyahFpInit !== "1"))) {
        window.setTimeout(tick, 100);
      }
    };

    tick();

    // If user resizes across breakpoint, reload init when entering desktop.
    if (window.matchMedia) {
      const mq = window.matchMedia(DESKTOP_MQ);
      const onMq = () => {
        // If leaving desktop, restore native field.
        teardownIfNeeded();

        if (mq.matches && typeof window.innerWidth === "number" && window.innerWidth >= 1024) {
          // Wait a beat for layout to settle, then init if needed.
          window.setTimeout(() => {
            try {
              initOnce();
            } catch {}
          }, 50);
        }
      };
      if (mq.addEventListener) mq.addEventListener("change", onMq);
      else if (mq.addListener) mq.addListener(onMq);
    }

    // Extra safety: some viewport changes (e.g. DevTools device emulation) may not
    // reliably trigger matchMedia change events in all environments.
    let resizeT = 0;
    window.addEventListener(
      "resize",
      () => {
        window.clearTimeout(resizeT);
        resizeT = window.setTimeout(() => {
          try {
            teardownIfNeeded();
            initOnce();
          } catch {}
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

