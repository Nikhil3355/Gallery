"use strict";

/*
 * My Gallery direct Google API connector.
 * OAuth access tokens stay in memory only; no client secret is used here.
 * The full Drive scope is required because the destination folder already exists
 * and was not necessarily created by this OAuth application.
 */
const GalleryAPI = (() => {
  const CONFIG = {
    clientId: "654272049639-gkqqeu5pp1inhcv0n9b8h0llpg3pvhqq.apps.googleusercontent.com",
    spreadsheetId: "13ZZYRUIyyMvhPwywAXKth_G6dJVcjSoGatFR27_HyzY",
    imagesFolderId: "1jP9PVyHyd2B6KUpmRefMcOy1C1FEg7Gz",
    actressesSheet: "Actresses",
    imagesSheet: "Images",
    scopes: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets"
  };

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let authReady = false;

  function loadGoogleIdentity() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) return resolve();
      const existing = document.querySelector('script[data-google-identity]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Google sign-in library could not load.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = "true";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Google sign-in library could not load."));
      document.head.appendChild(script);
    });
  }

  async function signIn() {
    await loadGoogleIdentity();
    return new Promise((resolve, reject) => {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.clientId,
        scope: CONFIG.scopes,
        include_granted_scopes: true,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error_description || response.error || "Google sign-in was not completed."));
            return;
          }
          accessToken = response.access_token;
          tokenExpiresAt = Date.now() + (Number(response.expires_in || 3600) * 1000);
          authReady = true;
          resolve({ signedIn: true, expiresIn: Number(response.expires_in || 3600) });
        },
        error_callback: (error) => reject(new Error(error?.message || "Google sign-in popup failed. Allow pop-ups and try again."))
      });
      tokenClient.requestAccessToken({ prompt: accessToken && Date.now() < tokenExpiresAt ? "" : "consent" });
    });
  }

  function signOut() {
    if (accessToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(accessToken, () => {});
    }
    accessToken = null;
    tokenExpiresAt = 0;
    authReady = false;
  }

  async function getToken() {
    if (!accessToken || Date.now() > tokenExpiresAt - 30000) {
      throw new Error("Please click Sign in with Google again to authorize this session.");
    }
    return accessToken;
  }

  async function googleFetch(url, options = {}) {
    const token = await getToken();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      accessToken = null;
      authReady = false;
      throw new Error("Google authorization expired. Sign in again and retry.");
    }
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json())?.error?.message || ""; } catch (_) {}
      throw new Error(detail || `Google API request failed (${response.status}).`);
    }
    return response;
  }

  function normalizeHeader(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  async function getSheetTable(sheetName) {
    const range = encodeURIComponent(`${sheetName}!A:Z`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}/values/${range}`;
    const response = await googleFetch(url);
    const result = await response.json();
    const values = result.values || [];
    const known = sheetName === CONFIG.actressesSheet
      ? ["actressid", "actressname", "sortname", "dateadded"]
      : ["imageid", "actressid", "drivefileid", "category", "filesize", "encryptionversion", "dateadded"];
    let headerIndex = values.findIndex(row => {
      const normalized = row.map(normalizeHeader);
      return known.some(key => normalized.includes(key)) &&
        (sheetName !== CONFIG.actressesSheet || normalized.includes("actressname")) &&
        (sheetName !== CONFIG.imagesSheet || normalized.includes("drivefileid"));
    });
    if (headerIndex < 0) {
      throw new Error(`Could not find the expected column headers in the '${sheetName}' sheet. Please check its first 10 rows; no data was written.`);
    }
    const headers = values[headerIndex].map(value => String(value || "").trim());
    const rows = values.slice(headerIndex + 1).filter(row => row.some(cell => String(cell || "").trim() !== ""));
    return { headers, rows, headerRow: headerIndex + 1 };
  }

  function colIndex(headers, names) {
    const normalized = headers.map(normalizeHeader);
    for (const name of names) {
      const index = normalized.indexOf(normalizeHeader(name));
      if (index >= 0) return index;
    }
    return -1;
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 3 | 8)).toString(16);
    });
  }

  function dateStamp() { return new Date().toISOString(); }

  async function appendRow(sheetName, headers, valuesByHeader) {
    const row = headers.map(header => {
      const key = normalizeHeader(header);
      return Object.prototype.hasOwnProperty.call(valuesByHeader, key) ? valuesByHeader[key] : "";
    });
    const range = encodeURIComponent(`${sheetName}!A:Z`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    await googleFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [row] })
    });
  }

  async function getCatalogue() {
    const [actressTable, imageTable] = await Promise.all([
      getSheetTable(CONFIG.actressesSheet), getSheetTable(CONFIG.imagesSheet)
    ]);
    const aId = colIndex(actressTable.headers, ["ActressID"]);
    const aName = colIndex(actressTable.headers, ["ActressName", "Name"]);
    const iActressId = colIndex(imageTable.headers, ["ActressID"]);
    if (aName < 0) throw new Error("ActressName column was not found in the Actresses sheet.");
    const counts = new Map();
    imageTable.rows.forEach(row => {
      const id = iActressId >= 0 ? String(row[iActressId] || "") : "";
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    });
    return actressTable.rows.map(row => {
      const name = String(row[aName] || "").trim();
      const id = (aId >= 0 ? String(row[aId] || "") : "") || name;
      return { id, name, imageCount: counts.get(id) || 0 };
    }).filter(row => row.name).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function ensureActress(name) {
    const cleanName = String(name || "").trim();
    if (!cleanName) throw new Error("Enter an actress name.");
    const table = await getSheetTable(CONFIG.actressesSheet);
    const idIndex = colIndex(table.headers, ["ActressID"]);
    const nameIndex = colIndex(table.headers, ["ActressName", "Name"]);
    if (nameIndex < 0) throw new Error("ActressName column is missing in the Actresses sheet.");
    const existing = table.rows.find(row => String(row[nameIndex] || "").trim().toLocaleLowerCase() === cleanName.toLocaleLowerCase());
    if (existing) return { id: idIndex >= 0 ? String(existing[idIndex] || "") : "", name: String(existing[nameIndex]) };
    const id = uuid();
    const values = {
      actressid: id,
      actressname: cleanName,
      sortname: cleanName.toLocaleLowerCase(),
      dateadded: dateStamp()
    };
    await appendRow(CONFIG.actressesSheet, table.headers, values);
    return { id, name: cleanName };
  }

  async function uploadOne(file, actress) {
    if (!file.name.toLowerCase().endsWith(".enc")) throw new Error(`${file.name}: only .enc files are accepted.`);
    if (file.size < 4) throw new Error(`${file.name}: file is too small to be a valid encrypted file.`);
    const marker = new TextDecoder().decode(await file.slice(0, 4).arrayBuffer());
    if (marker !== "PG02") throw new Error(`${file.name}: PG02 encryption marker not found. This file was not uploaded.`);

    const table = await getSheetTable(CONFIG.imagesSheet);

    const safeName = `${uuid()}.enc`;
    const metadata = { name: safeName, mimeType: "application/octet-stream", parents: [CONFIG.imagesFolderId], appProperties: { encryptionVersion: "PG02" } };
    const initResponse = await googleFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/octet-stream", "X-Upload-Content-Length": String(file.size) },
      body: JSON.stringify(metadata)
    });
    const uploadUrl = initResponse.headers.get("Location");
    if (!uploadUrl) throw new Error("Google Drive did not return an upload URL. Check browser permissions and try again.");
    const finalResponse = await googleFetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: file
    });
    const driveFile = await finalResponse.json();

    try {
      const values = {
        imageid: uuid(),
        actressid: actress.id,
        drivefileid: driveFile.id,
        category: "Photo",
        filesize: file.size,
        encryptionversion: "PG02",
        dateadded: dateStamp()
      };
      await appendRow(CONFIG.imagesSheet, table.headers, values);
    } catch (error) {
      throw new Error(`${file.name} uploaded to Drive, but its spreadsheet row failed. Drive file ID: ${driveFile.id}. Error: ${error.message}`);
    }
    return { name: file.name, size: file.size, driveFileId: driveFile.id };
  }

  async function uploadEncryptedFiles(files, actressId, newActressName, onProgress = () => {}) {
    if (!files?.length) throw new Error("Select at least one .enc file.");
    let actress;
    if (newActressName) {
      actress = await ensureActress(newActressName);
    } else {
      const catalogue = await getSheetTable(CONFIG.actressesSheet);
      const idIndex = colIndex(catalogue.headers, ["ActressID"]);
      const nameIndex = colIndex(catalogue.headers, ["ActressName", "Name"]);
      const row = catalogue.rows.find(r => String(r[idIndex] || "") === String(actressId) || String(r[nameIndex] || "") === String(actressId));
      if (!row) throw new Error("The selected actress could not be found in the spreadsheet. Reload the catalogue and try again.");
      actress = { id: (String(row[idIndex] || "") || String(row[nameIndex] || "")), name: String(row[nameIndex] || "") };
    }
    const completed = [];
    for (let i = 0; i < files.length; i++) {
      onProgress({ current: i + 1, total: files.length, percent: Math.round((i / files.length) * 100), fileName: files[i].name, stage: "Uploading" });
      const result = await uploadOne(files[i], actress);
      completed.push(result);
      onProgress({ current: i + 1, total: files.length, percent: Math.round(((i + 1) / files.length) * 100), fileName: files[i].name, stage: "Saved to Drive and Sheets" });
    }
    return completed;
  }

  return { config: CONFIG, signIn, signOut, getCatalogue, uploadEncryptedFiles, isSignedIn: () => authReady && !!accessToken && Date.now() < tokenExpiresAt };
})();

window.GalleryAPI = GalleryAPI;
window.PrivateGalleryAPI = GalleryAPI;
