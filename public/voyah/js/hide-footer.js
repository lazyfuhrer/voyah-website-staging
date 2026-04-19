window.addEventListener("load", function () {

  function removeFooterPhone() {
    const contactCol = document.querySelector(
      "#colophon div.w-full.md\\:w-2\\/5:not(.max-md\\:mt-5)"
    );
    if (!contactCol) return;
    const phoneSpan = contactCol.querySelector('span[dir="ltr"]');
    if (!phoneSpan) return;
    const row = phoneSpan.closest("div");
    if (row) row.remove();
  }

  // Run once
  removeFooterPhone();

  // Watch for Alpine rendering / changes
  const observer = new MutationObserver(() => {
    removeFooterPhone();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

});
