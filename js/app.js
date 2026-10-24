"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("searchInput");
    const alphabet = document.getElementById("alphabet");
    const actressGrid = document.getElementById("actressGrid");
    const resultCount = document.getElementById("resultCount");
    const connectionStatus = document.getElementById("connectionStatus");
    const uploadForm = document.getElementById("uploadForm");
    const uploadActress = document.getElementById("uploadActress");
    const toggleNewActress = document.getElementById("toggleNewActress");
    const newActressFields = document.getElementById("newActressFields");
    const newActressName = document.getElementById("newActressName");
    const encryptedFiles = document.getElementById("encryptedFiles");
    const clearUpload = document.getElementById("clearUpload");
    const uploadMessage = document.getElementById("uploadMessage");
    const uploadProgressWrap = document.getElementById("uploadProgressWrap");
    const themeToggle = document.getElementById("themeToggle");
    const googleSignInButton = document.getElementById("googleSignInButton");
    const uploadSubmit = document.getElementById("uploadSubmit");
    const uploadStatus = document.getElementById("uploadStatus");
    const uploadPercent = document.getElementById("uploadPercent");
    const uploadProgress = document.getElementById("uploadProgress");
    const pinScreen = document.getElementById("pinScreen");
    const pinForm = document.getElementById("pinForm");
    const pinInput = document.getElementById("pinInput");
    const pinError = document.getElementById("pinError");

    if (!searchInput || !alphabet || !actressGrid || !resultCount) {
        console.error("Gallery: Required HTML elements are missing.");
        return;
    }

    let selectedLetter = "ALL";
    let actresses = [];

    // Existing demo PIN retained. This is a UI-only gate, not secure authentication.
    const DEMO_PIN = "123456";

    // Main navigation: keep gallery and uploader as separate tabs.
    const tabButtons = [...document.querySelectorAll(".main-tab[data-tab]")];
    const galleryPanels = [...document.querySelectorAll('[data-panel="gallery"]')];
    const uploaderPanel = document.querySelector('[data-panel="uploader"]');
    tabButtons.forEach((button) => button.addEventListener("click", () => {
        const target = button.dataset.tab;
        tabButtons.forEach((item) => {
            const active = item === button;
            item.classList.toggle("active", active);
            item.setAttribute("aria-selected", String(active));
        });
        galleryPanels.forEach((panel) => {
            panel.hidden = target !== "gallery";
            panel.classList.toggle("active", target === "gallery");
        });
        if (uploaderPanel) {
            uploaderPanel.hidden = target !== "uploader";
            uploaderPanel.classList.toggle("active", target === "uploader");
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
    }));

    // Dark/light theme preference is stored locally in this browser only.
    function setTheme(theme) {
        document.documentElement.dataset.theme = theme;
        const light = theme === "light";
        if (themeToggle) {
            themeToggle.textContent = light ? "🌙 Dark" : "☀️ Light";
            themeToggle.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
            themeToggle.title = light ? "Switch to dark mode" : "Switch to light mode";
        }
        try { localStorage.setItem("gallery-theme", theme); } catch (_) {}
    }
    let savedTheme = "dark";
    try { savedTheme = localStorage.getItem("gallery-theme") || "dark"; } catch (_) {}
    setTheme(savedTheme === "light" ? "light" : "dark");
    themeToggle?.addEventListener("click", () => {
        setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
    });

    function setUploadMessage(message, type = "") {
        if (!uploadMessage) return;
        uploadMessage.textContent = message;
        uploadMessage.className = `upload-message ${type}`.trim();
    }

    function populateUploadActresses() {
        if (!uploadActress) return;
        const previousValue = uploadActress.value;
        uploadActress.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = actresses.length ? "Choose an actress" : "Catalogue not loaded yet";
        uploadActress.appendChild(placeholder);
        actresses.forEach((actress) => {
            const option = document.createElement("option");
            option.value = actress.id || actress.actressId || actress.ActressID || actress.name;
            option.textContent = actress.name || actress.actressName || actress.ActressName || "Unnamed actress";
            uploadActress.appendChild(option);
        });
        if (previousValue) uploadActress.value = previousValue;
    }

    function renderActresses() {
        const query = searchInput.value.trim().toLocaleLowerCase();
        const filtered = actresses.filter((actress) => {
            const name = String(actress.name || actress.actressName || actress.ActressName || "");
            return name.toLocaleLowerCase().includes(query) &&
                (selectedLetter === "ALL" || name.toLocaleUpperCase().startsWith(selectedLetter));
        });
        resultCount.textContent = `${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}`;
        populateUploadActresses();
        actressGrid.replaceChildren();
        if (!filtered.length) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            const heading = document.createElement("h3");
            heading.textContent = "Your collection will appear here";
            const message = document.createElement("p");
            message.textContent = "The catalogue has not loaded yet. Connect the authorised Google backend to display your collection.";
            empty.append(heading, message);
            actressGrid.appendChild(empty);
            return;
        }
        filtered.forEach((actress) => {
            const nameText = String(actress.name || actress.actressName || actress.ActressName || "Unnamed actress");
            const card = document.createElement("article"); card.className = "actress-card";
            const preview = document.createElement("div"); preview.className = "actress-preview";
            preview.textContent = nameText.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
            preview.setAttribute("aria-hidden", "true");
            const details = document.createElement("div"); details.className = "actress-details";
            const name = document.createElement("h3"); name.textContent = nameText;
            const count = document.createElement("p"); count.textContent = `${Number(actress.imageCount) || 0} images`;
            details.append(name, count); card.append(preview, details); actressGrid.appendChild(card);
        });
    }

    alphabet.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-letter]"); if (!button) return;
        selectedLetter = button.dataset.letter;
        alphabet.querySelectorAll("button[data-letter]").forEach((item) => {
            const active = item === button; item.classList.toggle("active", active); item.setAttribute("aria-pressed", String(active));
        });
        renderActresses();
    });
    searchInput.addEventListener("input", renderActresses);

    toggleNewActress?.addEventListener("click", () => {
        if (!newActressFields) return;
        newActressFields.hidden = !newActressFields.hidden;
        toggleNewActress.textContent = newActressFields.hidden ? "Add new actress" : "Use existing actress";
        if (uploadActress) uploadActress.required = newActressFields.hidden;
        if (newActressName) newActressName.required = !newActressFields.hidden;
        if (!newActressFields.hidden) newActressName?.focus();
    });

    encryptedFiles?.addEventListener("change", () => {
        const files = [...encryptedFiles.files];
        if (files.some((file) => !file.name.toLowerCase().endsWith(".enc"))) {
            setUploadMessage("Please select only .enc encrypted files.", "error");
            encryptedFiles.value = "";
            return;
        }
        setUploadMessage(files.length ? `${files.length} encrypted file(s) selected.` : "");
    });

    clearUpload?.addEventListener("click", () => {
        if (uploadForm) uploadForm.reset();
        if (uploadProgressWrap) uploadProgressWrap.hidden = true;
        setUploadMessage("");
    });

    uploadForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const files = [...(encryptedFiles?.files || [])];
        if (!window.GalleryAPI?.isSignedIn()) return setUploadMessage("Sign in with Google first using the button at the top of the page.", "error");
        if (!files.length) return setUploadMessage("Select one or more .enc files first.", "error");
        const isNew = newActressFields && !newActressFields.hidden;
        if (isNew && !newActressName?.value.trim()) return setUploadMessage("Enter a name for the new actress.", "error");
        if (!isNew && !uploadActress?.value) return setUploadMessage("Choose an actress first.", "error");
        if (uploadProgressWrap) uploadProgressWrap.hidden = false;
        if (uploadSubmit) uploadSubmit.disabled = true;
        if (clearUpload) clearUpload.disabled = true;
        try {
            setUploadMessage("Starting upload. Keep this tab open until it finishes.");
            const uploaded = await window.GalleryAPI.uploadEncryptedFiles(
                files,
                uploadActress?.value,
                isNew ? newActressName.value.trim() : "",
                (progress) => {
                    if (uploadStatus) uploadStatus.textContent = `${progress.stage}: ${progress.fileName} (${progress.current}/${progress.total})`;
                    if (uploadPercent) uploadPercent.textContent = `${progress.percent}%`;
                    if (uploadProgress) uploadProgress.value = progress.percent;
                }
            );
            setUploadMessage(`Success! ${uploaded.length} encrypted file(s) saved to Google Drive and registered in Google Sheets.`, "success");
            if (uploadProgress) uploadProgress.value = 100;
            if (uploadPercent) uploadPercent.textContent = "100%";
            if (newActressName) newActressName.value = "";
            if (encryptedFiles) encryptedFiles.value = "";
            actresses = await window.GalleryAPI.getCatalogue();
            renderActresses();
        } catch (error) {
            console.error("Gallery upload failed:", error);
            setUploadMessage(error.message || "Upload failed. Check the browser console for details.", "error");
        } finally {
            if (uploadSubmit) uploadSubmit.disabled = false;
            if (clearUpload) clearUpload.disabled = false;
        }
    });

    if (pinInput && pinError) pinInput.addEventListener("input", () => {
        pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 6); pinError.textContent = "";
    });
    if (pinForm && pinInput && pinError && pinScreen) pinForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!/^\d{6}$/.test(pinInput.value)) { pinError.textContent = "Please enter all 6 digits."; return; }
        if (pinInput.value !== DEMO_PIN) { pinError.textContent = "Incorrect PIN. Please try again."; pinInput.value = ""; pinInput.focus(); return; }
        pinScreen.hidden = true; document.body.style.overflow = ""; pinInput.value = "";
    });

    async function refreshCatalogue() {
        const rows = await window.GalleryAPI.getCatalogue();
        actresses = rows.map(row => ({ id: row.id, name: row.name, imageCount: row.imageCount || 0 }));
        renderActresses();
    }

    googleSignInButton?.addEventListener("click", async () => {
        googleSignInButton.disabled = true;
        try {
            if (connectionStatus) connectionStatus.textContent = "Connecting…";
            setUploadMessage("Opening Google sign-in…");
            await window.GalleryAPI.signIn();
            if (connectionStatus) connectionStatus.textContent = "Google connected";
            googleSignInButton.textContent = "Google connected ✓";
            await refreshCatalogue();
            setUploadMessage("Google connected. Your catalogue is loaded and the uploader is ready.", "success");
        } catch (error) {
            console.error("Google connection failed:", error);
            if (connectionStatus) connectionStatus.textContent = "Connection failed";
            setUploadMessage(error.message || "Google sign-in failed. Check the browser console.", "error");
        } finally {
            googleSignInButton.disabled = false;
        }
    });

    if (connectionStatus) connectionStatus.textContent = "Sign in required";
    renderActresses();
});
