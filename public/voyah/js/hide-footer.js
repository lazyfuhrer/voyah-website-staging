
window.addEventListener("load", function () {
  document.querySelectorAll("footer *").forEach(el => {
    const text = el.innerText?.trim().toLowerCase();

    // Only match exact heading
    if (text === "policies") {
      const section = el.closest("div"); // go one level up only
      if (section) section.remove();
    }
  });
});