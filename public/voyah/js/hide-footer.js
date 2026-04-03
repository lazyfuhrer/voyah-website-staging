window.addEventListener("load", function () {
    document.querySelectorAll("footer *").forEach(el => {
      const text = el.innerText?.trim().toLowerCase();
  
      if (text === "policies") {
        const section = el.closest("div, section, footer > div");
        if (section) section.remove();
      }
    });
  });