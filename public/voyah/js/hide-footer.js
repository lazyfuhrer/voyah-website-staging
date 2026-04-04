window.addEventListener("load", function () {

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
  removeFooterContactInfo();
  removeFooterPolicies();

  // Watch for Alpine rendering / changes
  const observer = new MutationObserver(() => {
    removeFooterContactInfo();
    removeFooterPolicies();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

});
