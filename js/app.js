"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("searchInput");
    const alphabet = document.getElementById("alphabet");
    const actressGrid = document.getElementById("actressGrid");
    const resultCount = document.getElementById("resultCount");
    const connectionStatus = document.getElementById("connectionStatus");

    if (!searchInput || !alphabet || !actressGrid || !resultCount) {
        console.error("PrivateGallery: Required HTML elements are missing.");
        return;
    }

    let selectedLetter = "ALL";

    // Temporary sample data for testing the interface.
    // We'll replace this with your private Google Sheets catalogue later.
    const actresses = [
        { id: "demo-1", name: "Example Actress One", imageCount: 12 },
        { id: "demo-2", name: "Example Actress Two", imageCount: 8 },
        { id: "demo-3", name: "Example Actress Three", imageCount: 21 }
    ];

    function renderActresses() {
        const query = searchInput.value.trim().toLocaleLowerCase();

        const filtered = actresses.filter((actress) => {
            const matchesName = actress.name.toLocaleLowerCase().includes(query);
            const matchesLetter =
                selectedLetter === "ALL" ||
                actress.name.toLocaleUpperCase().startsWith(selectedLetter);

            return matchesName && matchesLetter;
        });

        resultCount.textContent =
            `${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}`;

        actressGrid.replaceChildren();

        if (filtered.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-state";

            const heading = document.createElement("h3");
            heading.textContent = "No matching actresses";

            const message = document.createElement("p");
            message.textContent = "Try another name or select a different letter.";

            empty.append(heading, message);
            actressGrid.appendChild(empty);
            return;
        }

        filtered.forEach((actress) => {
            const card = document.createElement("article");
            card.className = "actress-card";

            const initials = actress.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((word) => word[0].toUpperCase())
                .join("");

            const preview = document.createElement("div");
            preview.className = "actress-preview";
            preview.textContent = initials;
            preview.setAttribute("aria-hidden", "true");

            const details = document.createElement("div");
            details.className = "actress-details";

            const name = document.createElement("h3");
            name.textContent = actress.name;

            const count = document.createElement("p");
            count.textContent = `${actress.imageCount} images`;

            details.append(name, count);
            card.append(preview, details);
            actressGrid.appendChild(card);
        });
    }

    alphabet.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-letter]");

        if (!button) return;

        selectedLetter = button.dataset.letter;

        alphabet.querySelectorAll("button[data-letter]").forEach((letterButton) => {
            const active = letterButton === button;
            letterButton.classList.toggle("active", active);
            letterButton.setAttribute("aria-pressed", String(active));
        });

        renderActresses();
    });

    searchInput.addEventListener("input", renderActresses);

    if (connectionStatus) {
        connectionStatus.textContent = "Demo mode";
    }

    renderActresses();
});


    // PIN screen elements
    const pinScreen = document.getElementById("pinScreen");
    const pinForm = document.getElementById("pinForm");
    const pinInput = document.getElementById("pinInput");
    const pinError = document.getElementById("pinError");

    // Temporary interface-only test PIN.
    // This is NOT secure authentication.
    const DEMO_PIN = "123456";

    if (pinInput) {
        pinInput.addEventListener("input", () => {
            pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 6);
            pinError.textContent = "";
        });
    }

    if (pinForm) {
        pinForm.addEventListener("submit", (event) => {
            event.preventDefault();

            if (!/^\d{6}$/.test(pinInput.value)) {
                pinError.textContent = "Please enter all 6 digits.";
                return;
            }

            if (pinInput.value !== DEMO_PIN) {
                pinError.textContent = "Incorrect PIN. Please try again.";
                pinInput.value = "";
                pinInput.focus();
                return;
            }

            // Hide the PIN screen for this page load only.
            pinScreen.hidden = true;
            document.body.style.overflow = "";
            pinInput.value = "";
        });
    }


