"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const searchInput = $("searchInput"), alphabet = $("alphabet"), actressGrid = $("actressGrid"), resultCount = $("resultCount");
  const connectionStatus = $("connectionStatus"), uploadForm = $("uploadForm"), uploadActress = $("uploadActress");
  const toggleNewActress = $("toggleNewActress"), newActressFields = $("newActressFields"), newActressName = $("newActressName");
  const encryptedFiles = $("encryptedFiles"), clearUpload = $("clearUpload"), uploadMessage = $("uploadMessage");
  const uploadProgressWrap = $("uploadProgressWrap"), themeToggle = $("themeToggle"), googleSignInButton = $("googleSignInButton");
  const uploadSubmit = $("uploadSubmit"), uploadStatus = $("uploadStatus"), uploadPercent = $("uploadPercent"), uploadProgress = $("uploadProgress");
  const pinScreen = $("pinScreen"), pinForm = $("pinForm"), pinInput = $("pinInput"), pinError = $("pinError");
  const sortSelect = $("sortSelect"), actressPager = $("actressPager"), detail = $("actressDetail"), backToActresses = $("backToActresses");
  const refreshGalleryButton = $("refreshGalleryButton"), lastSynced = $("lastSynced"), lockGalleryButton = $("lockGalleryButton");
  const photoGrid = $("photoGrid"), photoPager = $("photoPager"), detailMessage = $("detailMessage"), detailActressName = $("detailActressName"), detailActressCount = $("detailActressCount");
  const viewer = $("imageViewer"), viewerImage = $("viewerImage"), viewerCaption = $("viewerCaption");
  const PAGE_SIZE = 24, PHOTO_PAGE_SIZE = 30, DEMO_PIN = "123456";
  let selectedLetter = "ALL", actresses = [], actressPage = 1, selectedActress = null, photoRecords = [], photoPage = 1, viewerIndex = 0;
  const imageUrlCache = new Map(), coverUrlCache = new Map();
  let favoriteKeys = new Set();
  let favoritesLoaded = false;
  let viewCounts = {};
  try { viewCounts = JSON.parse(localStorage.getItem("gallery-view-counts") || "{}"); } catch (_) { viewCounts = {}; }
  const viewedKey = id => `actress:${String(id)}`;
  const favoriteKey = (type, id) => `${type}:${String(id)}`;
  function markViewed(key) { viewCounts[key] = (Number(viewCounts[key]) || 0) + 1; try { localStorage.setItem("gallery-view-counts", JSON.stringify(viewCounts)); } catch (_) {} }

  const tabButtons = [...document.querySelectorAll(".main-tab[data-tab]")];
  const galleryPanels = [...document.querySelectorAll('[data-panel="gallery"]')], uploaderPanel = document.querySelector('[data-panel="uploader"]');
  tabButtons.forEach(button => button.addEventListener("click", () => {
    const target = button.dataset.tab;
    tabButtons.forEach(item => { const active = item === button; item.classList.toggle("active", active); item.setAttribute("aria-selected", String(active)); });
    galleryPanels.forEach(panel => { panel.hidden = target !== "gallery"; panel.classList.toggle("active", target === "gallery"); });
    if (uploaderPanel) { uploaderPanel.hidden = target !== "uploader"; uploaderPanel.classList.toggle("active", target === "uploader"); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const light = theme === "light";
    if (themeToggle) { themeToggle.textContent = light ? "🌙 Dark" : "☀️ Light"; themeToggle.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode"); themeToggle.title = light ? "Switch to dark mode" : "Switch to light mode"; }
    try { localStorage.setItem("gallery-theme", theme); } catch (_) {}
  }
  let savedTheme = "dark"; try { savedTheme = localStorage.getItem("gallery-theme") || "dark"; } catch (_) {}
  setTheme(savedTheme === "light" ? "light" : "dark");
  themeToggle?.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"));

  function setUploadMessage(message, type = "") { if (uploadMessage) { uploadMessage.textContent = message; uploadMessage.className = `upload-message ${type}`.trim(); } }
  function populateUploadActresses() {
    if (!uploadActress) return;
    const old = uploadActress.value; uploadActress.replaceChildren();
    const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = actresses.length ? "Choose an actress" : "Catalogue not loaded yet"; uploadActress.appendChild(placeholder);
    actresses.forEach(a => { const o = document.createElement("option"); o.value = a.id || a.name; o.textContent = a.name; uploadActress.appendChild(o); });
    if (old) uploadActress.value = old;
  }

  async function decryptPG02(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 48) throw new Error("Encrypted file is too short to be PG02.");
    if (new TextDecoder().decode(bytes.slice(0, 4)) !== "PG02") throw new Error("PG02 marker was not found.");
    const salt = bytes.slice(4, 20), iv = bytes.slice(20, 32), ciphertext = bytes.slice(32);
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(windowGalleryPassword), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new Blob([plain]);
  }
  let windowGalleryPassword = "";
  async function getDecryptedUrl(record, forCover = false) {
    const cache = forCover ? coverUrlCache : imageUrlCache;
    if (cache.has(record.driveFileId)) return cache.get(record.driveFileId);
    if (!windowGalleryPassword) throw new Error("Enter your encryption password to view images.");
    const encrypted = await window.GalleryAPI.getEncryptedFile(record.driveFileId);
    const blob = await decryptPG02(encrypted);
    const url = URL.createObjectURL(blob); cache.set(record.driveFileId, url); return url;
  }
  function revokeCache(cache) { for (const url of cache.values()) URL.revokeObjectURL(url); cache.clear(); }

  function createPager(container, page, pageCount, onPage) {
    container.replaceChildren(); if (pageCount <= 1) return;
    const add = (label, target, disabled = false, active = false) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.disabled = disabled; if (active) b.classList.add("active"); b.addEventListener("click", () => onPage(target)); container.appendChild(b); };
    add("Previous", page - 1, page <= 1);
    let pages = new Set([1, pageCount, page - 1, page, page + 1]);
    [...pages].filter(n => n >= 1 && n <= pageCount).sort((a,b)=>a-b).forEach((n, i, arr) => { if (i && n - arr[i-1] > 1) { const dots = document.createElement("span"); dots.className = "pager-info"; dots.textContent = "…"; container.appendChild(dots); } add(String(n), n, false, n === page); });
    add("Next", page + 1, page >= pageCount);
    const info = document.createElement("span"); info.className = "pager-info"; info.textContent = `Page ${page} of ${pageCount}`; container.appendChild(info);
  }

  function filteredSortedActresses() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const rows = actresses.filter(a => a.name.toLocaleLowerCase().includes(query) && (selectedLetter === "ALL" || a.name.toLocaleUpperCase().startsWith(selectedLetter)));
    const sort = sortSelect?.value || "most";
    rows.sort((a,b) => {
      if (sort === "most") return b.imageCount - a.imageCount || a.name.localeCompare(b.name);
      if (sort === "viewed") return (Number(viewCounts[viewedKey(b.id)]) || 0) - (Number(viewCounts[viewedKey(a.id)]) || 0) || a.name.localeCompare(b.name);
      if (sort === "favorites") return Number(favoriteKeys.has(favoriteKey("actress", b.id))) - Number(favoriteKeys.has(favoriteKey("actress", a.id))) || a.name.localeCompare(b.name);
      if (sort === "least") return a.imageCount - b.imageCount || a.name.localeCompare(b.name);
      if (sort === "za") return b.name.localeCompare(a.name);
      if (sort === "recent") return String(b.dateAdded || "").localeCompare(String(a.dateAdded || "")) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return rows;
  }

  function renderActresses() {
    if (detail && !detail.hidden) { detail.hidden = true; actressGrid.closest(".collection").hidden = false; }
    const filtered = filteredSortedActresses();
    resultCount.textContent = `${filtered.length.toLocaleString()} ${filtered.length === 1 ? "entry" : "entries"}`;
    populateUploadActresses(); actressGrid.replaceChildren();
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)); actressPage = Math.min(actressPage, pageCount);
    const pageRows = filtered.slice((actressPage - 1) * PAGE_SIZE, actressPage * PAGE_SIZE);
    if (!pageRows.length) {
      const empty = document.createElement("div"); empty.className = "empty-state";
      const h = document.createElement("h3"); h.textContent = actresses.length ? "No matching actresses" : "Sign in to load your gallery";
      const p = document.createElement("p"); p.textContent = actresses.length ? "Try another name or letter." : "Use Sign in with Google to load your collection."; empty.append(h,p); actressGrid.appendChild(empty);
    }
    pageRows.forEach(a => {
      const card = document.createElement("article"); card.className = "actress-card"; card.tabIndex = 0; card.setAttribute("role", "button"); card.setAttribute("aria-label", `Open ${a.name}, ${a.imageCount} images`);
      const preview = document.createElement("div"); preview.className = "actress-preview";
      const initials = a.name.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("");
      const placeholder = document.createElement("span"); placeholder.className = "cover-placeholder"; placeholder.textContent = initials; preview.appendChild(placeholder);
      const fav = document.createElement("button"); fav.type = "button"; fav.className = "favorite-toggle"; fav.textContent = favoriteKeys.has(favoriteKey("actress", a.id)) ? "★" : "☆"; fav.setAttribute("aria-label", favoriteKeys.has(favoriteKey("actress", a.id)) ? `Remove ${a.name} from favourites` : `Add ${a.name} to favourites`); fav.setAttribute("aria-pressed", String(favoriteKeys.has(favoriteKey("actress", a.id)))); fav.addEventListener("click", async e => { e.stopPropagation(); await toggleFavorite("actress", a.id, a.name, fav); }); card.appendChild(fav);
      const details = document.createElement("div"); details.className = "actress-details";
      const name = document.createElement("h3"); name.textContent = a.name;
      const count = document.createElement("p"); count.textContent = `${Number(a.imageCount)||0} images`; details.append(name,count); card.append(preview,details);
      const open = () => openActress(a); card.addEventListener("click", open); card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }); actressGrid.appendChild(card);
      // Covers load only when the card enters view. Requires an authenticated session and the password.
      card.dataset.actressId = a.id;
    });
    createPager(actressPager, actressPage, pageCount, p => { actressPage = p; renderActresses(); window.scrollTo({top: 0, behavior: "smooth"}); });
    loadVisibleCovers();
  }

  let coverObserver = null;
  function loadVisibleCovers() {
    coverObserver?.disconnect();
    if (!window.GalleryAPI?.isSignedIn() || !windowGalleryPassword) return;
    const cards = [...actressGrid.querySelectorAll(".actress-card")];
    const load = async card => {
      if (card.dataset.coverLoaded) return; card.dataset.coverLoaded = "1";
      const a = actresses.find(x => String(x.id) === String(card.dataset.actressId)); if (!a || !a.imageCount) return;
      const preview = card.querySelector(".actress-preview");
      try {
        const records = await window.GalleryAPI.getImagesForActress(a.id); if (!records.length) return;
        const url = await getDecryptedUrl(records[0], true); const img = document.createElement("img"); img.alt = `${a.name} cover`; img.loading = "lazy"; img.src = url; preview.replaceChildren(img);
      } catch (err) { const note = document.createElement("span"); note.className = "cover-loading"; note.textContent = err.message.includes("password") ? "Unlock images" : "Cover unavailable"; preview.replaceChildren(note); }
    };
    if ("IntersectionObserver" in window) {
      coverObserver = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { coverObserver.unobserve(entry.target); load(entry.target); } }), { rootMargin: "180px" });
      cards.forEach(card => coverObserver.observe(card));
    } else cards.forEach(load);
  }

  async function openActress(actress) {
    markViewed(viewedKey(actress.id));
    if (!window.GalleryAPI?.isSignedIn()) { alert("Please sign in with Google first."); return; }
    if (!windowGalleryPassword) {
      const pw = window.prompt("Enter your photo-encryption password. It will be used in this tab only and will not be saved.");
      if (pw === null || !pw) return;
      if (pw.length < 12) { alert("The encryption password must contain at least 12 characters."); return; }
      windowGalleryPassword = pw;
    }
    selectedActress = actress; photoPage = 1; photoGrid.replaceChildren(); detail.hidden = false;
    actressGrid.closest(".collection").hidden = true; $("galleryToolbarExtra").hidden = true; alphabet.hidden = true; $("galleryControls").querySelector(".toolbar").hidden = true;
    detailActressName.textContent = actress.name; detailActressCount.textContent = `${actress.imageCount.toLocaleString()} images`; detailMessage.hidden = false; detailMessage.textContent = "Loading image records…"; photoPager.replaceChildren();
    window.scrollTo({top:0,behavior:"smooth"});
    try { photoRecords = await window.GalleryAPI.getImagesForActress(actress.id); detailActressCount.textContent = `${photoRecords.length.toLocaleString()} images`; renderPhotos(); }
    catch (e) { detailMessage.textContent = `Could not load image records: ${e.message}`; }
  }
  function showActressList() {
    selectedActress = null; detail.hidden = true; actressGrid.closest(".collection").hidden = false; $("galleryToolbarExtra").hidden = false; alphabet.hidden = false; $("galleryControls").querySelector(".toolbar").hidden = false;
    photoGrid.replaceChildren(); photoPager.replaceChildren(); renderActresses();
  }
  backToActresses?.addEventListener("click", showActressList);

  function renderPhotos() {
    photoGrid.replaceChildren(); const count = photoRecords.length, pageCount = Math.max(1, Math.ceil(count / PHOTO_PAGE_SIZE)); photoPage = Math.min(photoPage,pageCount);
    detailMessage.hidden = count > 0; detailMessage.textContent = count ? "" : "No image records found for this actress.";
    const rows = photoRecords.slice((photoPage-1)*PHOTO_PAGE_SIZE, photoPage*PHOTO_PAGE_SIZE);
    rows.forEach((record, localIndex) => {
      const globalIndex = (photoPage-1)*PHOTO_PAGE_SIZE + localIndex;
      const wrap = document.createElement("div"); wrap.className = "photo-card-wrap";
      const tile = document.createElement("button"); tile.type = "button"; tile.className = "photo-tile"; tile.setAttribute("aria-label", `Open photo ${globalIndex+1}`);
      const placeholder = document.createElement("span"); placeholder.className = "photo-placeholder"; placeholder.textContent = "Loading encrypted photo…"; tile.appendChild(placeholder);
      tile.addEventListener("click", () => openViewer(globalIndex));
      const photoFav = document.createElement("button"); photoFav.type = "button"; photoFav.className = "favorite-toggle photo-favorite-toggle";
      const isFav = favoriteKeys.has(favoriteKey("photo", record.id)); photoFav.textContent = isFav ? "★" : "☆"; photoFav.setAttribute("aria-pressed", String(isFav)); photoFav.setAttribute("aria-label", isFav ? "Remove photo from favourites" : "Add photo to favourites");
      photoFav.addEventListener("click", e => { e.stopPropagation(); toggleFavorite("photo", record.id, `${selectedActress?.name || "Photo"} · ${globalIndex+1}`, photoFav); });
      wrap.append(tile, photoFav); photoGrid.appendChild(wrap);
      if ("IntersectionObserver" in window) photoObserver.observe(tile); else loadPhotoTile(tile, record);
      tile.dataset.recordIndex = String(globalIndex);
    });
    createPager(photoPager, photoPage, pageCount, p => { photoPage=p; renderPhotos(); window.scrollTo({top:0,behavior:"smooth"}); });
  }
  const photoObserver = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { photoObserver.unobserve(entry.target); const i = Number(entry.target.dataset.recordIndex); loadPhotoTile(entry.target, photoRecords[i]); } }), {rootMargin:"220px"});
  async function loadPhotoTile(tile, record) {
    if (!record || tile.dataset.loading) return; tile.dataset.loading="1";
    try { const url = await getDecryptedUrl(record); const img = document.createElement("img"); img.loading="lazy"; img.alt = `${selectedActress?.name || "Gallery"} photo`; img.src=url; tile.replaceChildren(img); }
    catch (e) { const placeholder = document.createElement("span"); placeholder.className="photo-placeholder"; placeholder.textContent = e.message.includes("decrypt") || e.name === "OperationError" ? "Password incorrect or file damaged" : e.message; tile.replaceChildren(placeholder); }
  }

  async function openViewer(index) {
    viewerIndex = index;
    const currentRecord = photoRecords[index]; if (currentRecord) markViewed(`photo:${currentRecord.id}`); await updateViewer(); viewer.hidden = false; document.body.style.overflow = "hidden";
  }
  async function updateViewer() {
    const record = photoRecords[viewerIndex]; if (!record) return;
    viewerImage.removeAttribute("src"); viewerCaption.textContent = `Loading photo ${viewerIndex+1} of ${photoRecords.length}…`;
    try { viewerImage.src = await getDecryptedUrl(record); viewerCaption.textContent = `${selectedActress?.name || "Photo"} · ${viewerIndex+1} of ${photoRecords.length}`; }
    catch(e) { viewerCaption.textContent = `Could not decrypt image: ${e.message}`; }
  }
  function closeViewer() { viewer.hidden = true; viewerImage.removeAttribute("src"); document.body.style.overflow = ""; }
  $("viewerClose")?.addEventListener("click",closeViewer); $("viewerPrev")?.addEventListener("click",()=>{ if(viewerIndex>0){viewerIndex--;updateViewer();} }); $("viewerNext")?.addEventListener("click",()=>{ if(viewerIndex<photoRecords.length-1){viewerIndex++;updateViewer();} });
  viewer?.addEventListener("click",e=>{ if(e.target===viewer) closeViewer(); }); document.addEventListener("keydown",e=>{ if(viewer?.hidden) return; if(e.key==="Escape") closeViewer(); if(e.key==="ArrowLeft"&&viewerIndex>0){viewerIndex--;updateViewer();} if(e.key==="ArrowRight"&&viewerIndex<photoRecords.length-1){viewerIndex++;updateViewer();} });

  alphabet.addEventListener("click", event => { const button = event.target.closest("button[data-letter]"); if (!button) return; selectedLetter=button.dataset.letter; actressPage=1; alphabet.querySelectorAll("button[data-letter]").forEach(item=>{const active=item===button;item.classList.toggle("active",active);item.setAttribute("aria-pressed",String(active));}); renderActresses(); });
  searchInput.addEventListener("input",()=>{actressPage=1;renderActresses();}); sortSelect?.addEventListener("change",()=>{actressPage=1;renderActresses();});

  toggleNewActress?.addEventListener("click",()=>{ if(!newActressFields)return; newActressFields.hidden=!newActressFields.hidden; toggleNewActress.textContent=newActressFields.hidden?"Add new actress":"Use existing actress"; if(uploadActress)uploadActress.required=newActressFields.hidden; if(newActressName)newActressName.required=!newActressFields.hidden; if(!newActressFields.hidden)newActressName?.focus(); });
  encryptedFiles?.addEventListener("change",()=>{const files=[...encryptedFiles.files];if(files.some(f=>!f.name.toLowerCase().endsWith(".enc"))){setUploadMessage("Please select only .enc encrypted files.","error");encryptedFiles.value="";return;}setUploadMessage(files.length?`${files.length} encrypted file(s) selected.`:"");});
  clearUpload?.addEventListener("click",()=>{uploadForm?.reset();if(uploadProgressWrap)uploadProgressWrap.hidden=true;setUploadMessage("");});
  uploadForm?.addEventListener("submit",async event=>{
    event.preventDefault(); const files=[...(encryptedFiles?.files||[])];
    if(!window.GalleryAPI?.isSignedIn())return setUploadMessage("Sign in with Google first.","error");
    if(!files.length)return setUploadMessage("Select one or more .enc files first.","error");
    const isNew=newActressFields&&!newActressFields.hidden;
    if(isNew&&!newActressName?.value.trim())return setUploadMessage("Enter a name for the new actress.","error");
    if(!isNew&&!uploadActress?.value)return setUploadMessage("Choose an actress first.","error");
    if(uploadProgressWrap)uploadProgressWrap.hidden=false;if(uploadSubmit)uploadSubmit.disabled=true;if(clearUpload)clearUpload.disabled=true;
    try {setUploadMessage("Starting upload. Keep this tab open until it finishes.");const uploaded=await window.GalleryAPI.uploadEncryptedFiles(files,uploadActress?.value,isNew?newActressName.value.trim():"",progress=>{if(uploadStatus)uploadStatus.textContent=`${progress.stage}: ${progress.fileName} (${progress.current}/${progress.total})`;if(uploadPercent)uploadPercent.textContent=`${progress.percent}%`;if(uploadProgress)uploadProgress.value=progress.percent;});
      setUploadMessage(`Success! ${uploaded.length} encrypted file(s) saved to Google Drive and registered in Google Sheets.`,"success");if(uploadProgress)uploadProgress.value=100;if(uploadPercent)uploadPercent.textContent="100%";if(newActressName)newActressName.value="";if(encryptedFiles)encryptedFiles.value="";await refreshCatalogue();
    } catch(error){console.error("Gallery upload failed:",error);setUploadMessage(error.message||"Upload failed. Check the browser console.","error");}
    finally{if(uploadSubmit)uploadSubmit.disabled=false;if(clearUpload)clearUpload.disabled=false;}
  });

  if(pinInput&&pinError)pinInput.addEventListener("input",()=>{pinInput.value=pinInput.value.replace(/\D/g,"").slice(0,6);pinError.textContent="";});
  if(pinForm&&pinInput&&pinError&&pinScreen)pinForm.addEventListener("submit",event=>{event.preventDefault();if(!/^\d{6}$/.test(pinInput.value)){pinError.textContent="Please enter all 6 digits.";return;}if(pinInput.value!==DEMO_PIN){pinError.textContent="Incorrect PIN. Please try again.";pinInput.value="";pinInput.focus();return;}pinScreen.hidden=true;document.body.style.overflow="";pinInput.value="";try{sessionStorage.setItem("gallery-pin-unlocked","yes");}catch(_){};});

  async function toggleFavorite(type, id, name, button) {
    if (!window.GalleryAPI?.isSignedIn()) { setUploadMessage("Sign in with Google to sync favourites across devices.", "error"); return; }
    button.disabled = true;
    try {
      const currentlyFavorite = favoriteKeys.has(favoriteKey(type, id));
      const items = await window.GalleryAPI.setFavorite(type, id, name, !currentlyFavorite);
      favoriteKeys = new Set(items.map(item => favoriteKey(item.type, item.id))); favoritesLoaded = true;
      button.textContent = currentlyFavorite ? "☆" : "★"; button.setAttribute("aria-pressed", String(!currentlyFavorite));
      button.setAttribute("aria-label", `${currentlyFavorite ? "Remove" : "Add"} ${type === "actress" ? name : "photo"} ${currentlyFavorite ? "from" : "to"} favourites`);
      if (sortSelect?.value === "favorites") renderActresses();
    } catch (error) { setUploadMessage(`Could not update favourites: ${error.message}`, "error"); }
    finally { button.disabled = false; }
  }

  async function loadFavorites() {
    if (!window.GalleryAPI?.isSignedIn()) return;
    const items = await window.GalleryAPI.getFavorites();
    favoriteKeys = new Set(items.map(item => favoriteKey(item.type, item.id))); favoritesLoaded = true;
  }

  async function refreshCatalogue(showMessage = true) {
    if (!window.GalleryAPI?.isSignedIn()) { setUploadMessage("Sign in with Google before refreshing the gallery.", "error"); return; }
    if (refreshGalleryButton) refreshGalleryButton.disabled = true;
    try {
      const rows = await window.GalleryAPI.getCatalogue();
      actresses = rows.map(row => ({id:row.id,name:row.name,imageCount:row.imageCount||0,dateAdded:row.dateAdded||""}));
      try { await loadFavorites(); } catch (favoriteError) { console.warn("Favorites could not be loaded:", favoriteError); }
      actressPage=1; renderActresses();
      if (lastSynced) lastSynced.textContent = `Last synced ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`;
      if (showMessage) setUploadMessage("Gallery refreshed. Existing images were not re-uploaded.", "success");
    } finally { if (refreshGalleryButton) refreshGalleryButton.disabled = false; }
  }
  refreshGalleryButton?.addEventListener("click", () => refreshCatalogue(true).catch(error => setUploadMessage(error.message, "error")));
  lockGalleryButton?.addEventListener("click", () => lockGallery());

  function lockGallery() {
    try { sessionStorage.removeItem("gallery-pin-unlocked"); } catch (_) {}
    pinScreen.hidden = false; document.body.style.overflow = "hidden"; pinInput?.focus();
    closeViewer();
  }
  // sessionStorage survives ordinary refreshes but is cleared when the tab's session ends.
  try {
    if (sessionStorage.getItem("gallery-pin-unlocked") === "yes") { pinScreen.hidden = true; document.body.style.overflow = ""; }
    else { pinScreen.hidden = false; document.body.style.overflow = "hidden"; }
  } catch (_) { pinScreen.hidden = false; document.body.style.overflow = "hidden"; }

  googleSignInButton?.addEventListener("click",async()=>{googleSignInButton.disabled=true;try{if(connectionStatus)connectionStatus.textContent="Connecting…";setUploadMessage("Opening Google sign-in…");await window.GalleryAPI.signIn();if(connectionStatus)connectionStatus.textContent="Google connected";googleSignInButton.textContent="Google connected ✓";await refreshCatalogue(false);if(!windowGalleryPassword){const pw=window.prompt("Enter your photo-encryption password to show card covers. It stays in this tab only and is not saved.");if(pw&&pw.length>=12)windowGalleryPassword=pw;else if(pw!==null)setUploadMessage("Google connected. Enter the encryption password when you open an actress to view photos.");}renderActresses();setUploadMessage("Google connected. Your catalogue is loaded.","success");}catch(error){console.error("Google connection failed:",error);if(connectionStatus)connectionStatus.textContent="Connection failed";setUploadMessage(error.message||"Google sign-in failed.","error");}finally{googleSignInButton.disabled=false;}});

  if(connectionStatus)connectionStatus.textContent="Sign in required";
  renderActresses();
});
