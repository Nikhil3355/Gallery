"use strict";

document.addEventListener("DOMContentLoaded", () => {
const searchInput = document.getElementById("searchInput");
const alphabet = document.getElementById("alphabet");
const actressGrid = document.getElementById("actressGrid");
const resultCount = document.getElementById("resultCount");
const connectionStatus = document.getElementById("connectionStatus");
const pinScreen = document.getElementById("pinScreen");
const pinForm = document.getElementById("pinForm");
const pinInput = document.getElementById("pinInput");
const pinError = document.getElementById("pinError");

if (!searchInput || !alphabet || !actressGrid || !resultCount) {
    console.error("PrivateGallery: Required HTML elements are missing.");
    return;
}

let selectedLetter = "ALL";
let actresses = [];

// Temporary interface test only. Not secure authentication.
const DEMO_PIN = "123456";

function renderActresses() {
    const query = searchInput.value.trim().toLocaleLowerCase();

    const filtered = actresses.filter((actress) => {
        const name = String(actress.name || "");

        const matchesName = name.toLocaleLowerCase().includes(query);
        const matchesLetter =
            selectedLetter === "ALL" ||
            name.toLocaleUpperCase().startsWith(selectedLetter);

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
        message.textContent = actresses.length === 0
            ? "Your catalogue has not been loaded yet."
            : "Try another name or select a different letter.";

        empty.append(heading, message);
        actressGrid.appendChild(empty);
        return;
    }

    filtered.forEach((actress) => {
        const card = document.createElement("article");
        card.className = "actress-card";

        const initials = String(actress.name || "")
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
        count.textContent = `${Number(actress.imageCount) || 0} images`;

        details.append(name, count);
        card.append(preview, details);
        actressGrid.appendChild(card);
    });
}

alphabet.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-letter]");
    if (!button) return;

    selectedLetter = button.dataset.letter;

    alphabet.querySelectorAll("button[data-letter]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
    });

    renderActresses();
});

searchInput.addEventListener("input", renderActresses);

if (pinInput && pinError) {
    pinInput.addEventListener("input", () => {
        pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 6);
        pinError.textContent = "";
    });
}

if (pinForm && pinInput && pinError && pinScreen) {
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

        pinScreen.hidden = true;
        document.body.style.overflow = "";
        pinInput.value = "";
    });
}

if (connectionStatus) {
    connectionStatus.textContent = "Backend not connected";
}

renderActresses();


});
