window.addEventListener("load", function () {

  function removeContact() {
    document.querySelectorAll('nav a').forEach(el => {
      const href = el.getAttribute("href") || "";

      if (href.includes("contact")) {
        const li = el.closest("li");
        if (li) li.remove();
      }
    });
  }

  function removeFooterContactInfo() {
    const el = document.querySelector(
      "#colophon div.w-full.md\\:w-2\\/5:not(.max-md\\:mt-5)"
    );
    if (el) el.remove();
  }

  function removeFooterPolicies() {
    const el = document.querySelector(
      "#colophon div.w-full.md\\:w-2\\/5.max-md\\:mt-5"
    );
    if (el) el.remove();
  }

  // Run once
  removeContact();
  removeFooterContactInfo();
  removeFooterPolicies();

  // Watch for Alpine rendering / changes
  const observer = new MutationObserver(() => {
    removeContact();
    removeFooterContactInfo();
    removeFooterPolicies();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

});
