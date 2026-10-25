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
    favoritesSheet: "Favorites",
    scopes: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets"
  };

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let authReady = false;
  let imageRecordsCache = null;
  let imageRecordsCacheAt = 0;

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
      : sheetName === CONFIG.favoritesSheet
        ? ["itemtype", "itemid", "itemname", "dateadded"]
        : ["imageid", "actressid", "drivefileid", "category", "filesize", "encryptionversion", "dateadded"];
    let headerIndex = values.findIndex(row => {
      const normalized = row.map(normalizeHeader);
      return known.some(key => normalized.includes(key)) &&
        (sheetName !== CONFIG.actressesSheet || normalized.includes("actressname")) &&
        (sheetName !== CONFIG.imagesSheet || normalized.includes("drivefileid")) &&
        (sheetName !== CONFIG.favoritesSheet || normalized.includes("itemtype"));
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


  async function ensureFavoritesSheet() {
    const metaResponse = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}?fields=sheets.properties(sheetId,title)`);
    const meta = await metaResponse.json();
    const sheets = meta.sheets || [];
    const found = sheets.find(s => s.properties?.title === CONFIG.favoritesSheet);
    if (!found) {
      await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}:batchUpdate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: CONFIG.favoritesSheet } } }] })
      });
    }
    const range = encodeURIComponent(`${CONFIG.favoritesSheet}!A1:D1`);
    const check = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}/values/${range}`);
    const values = (await check.json()).values || [];
    if (!values.length || !values[0].some(Boolean)) {
      await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}/values/${range}?valueInputOption=RAW`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: [["ItemType", "ItemID", "ItemName", "DateAdded"]] })
      });
    }
  }

  async function getFavorites() {
    await ensureFavoritesSheet();
    const table = await getSheetTable(CONFIG.favoritesSheet);
    const typeIndex = colIndex(table.headers, ["ItemType"]);
    const idIndex = colIndex(table.headers, ["ItemID"]);
    const nameIndex = colIndex(table.headers, ["ItemName"]);
    if (typeIndex < 0 || idIndex < 0) throw new Error("Favorites sheet headers are invalid.");
    return table.rows.map(row => ({ type: String(row[typeIndex] || ""), id: String(row[idIndex] || ""), name: nameIndex >= 0 ? String(row[nameIndex] || "") : "" }))
      .filter(item => item.type && item.id);
  }

  async function setFavorite(type, id, name, isFavorite) {
    await ensureFavoritesSheet();
    const table = await getSheetTable(CONFIG.favoritesSheet);
    const typeIndex = colIndex(table.headers, ["ItemType"]), idIndex = colIndex(table.headers, ["ItemID"]);
    const matchIndex = table.rows.findIndex(row => String(row[typeIndex] || "") === String(type) && String(row[idIndex] || "") === String(id));
    if (isFavorite && matchIndex < 0) {
      await appendRow(CONFIG.favoritesSheet, table.headers, { itemtype: type, itemid: String(id), itemname: String(name || ""), dateadded: dateStamp() });
    } else if (!isFavorite && matchIndex >= 0) {
      // Delete only the exact matching favourite row; leave every other sheet and record untouched.
      const spreadsheetResponse = await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}?fields=sheets.properties(sheetId,title)`);
      const spreadsheet = await spreadsheetResponse.json();
      const sheet = (spreadsheet.sheets || []).find(s => s.properties?.title === CONFIG.favoritesSheet);
      if (sheet) {
        const startRowIndex = table.headerRow + matchIndex;
        await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}:batchUpdate`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: sheet.properties.sheetId, dimension: "ROWS", startIndex: startRowIndex, endIndex: startRowIndex + 1 } } }] })
        });
      }
    }
    return getFavorites();
  }

  async function getCatalogue() {
    const [actressTable, imageTable] = await Promise.all([
      getSheetTable(CONFIG.actressesSheet), getSheetTable(CONFIG.imagesSheet)
    ]);
    const aId = colIndex(actressTable.headers, ["ActressID"]);
    const aName = colIndex(actressTable.headers, ["ActressName", "Name"]);
    const aDate = colIndex(actressTable.headers, ["DateAdded"]);
    const aInstagramUsername = colIndex(actressTable.headers, ["InstagramUsername", "InstagramHandle", "Instagram"]);
    const aInstagramURL = colIndex(actressTable.headers, ["InstagramURL", "InstagramLink", "InstagramProfileURL"]);
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
      const instagramUsername = aInstagramUsername >= 0 ? String(row[aInstagramUsername] || "").trim().replace(/^@/, "") : "";
      const instagramRawUrl = aInstagramURL >= 0 ? String(row[aInstagramURL] || "").trim() : "";
      let instagramURL = "";
      if (instagramRawUrl) {
        try {
          const candidate = new URL(/^https?:\/\//i.test(instagramRawUrl) ? instagramRawUrl : `https://${instagramRawUrl}`);
          if (candidate.hostname === "instagram.com" || candidate.hostname.endsWith(".instagram.com")) instagramURL = `https://www.instagram.com/${candidate.pathname.split("/").filter(Boolean)[0] || ""}/`;
        } catch (_) {}
      }
      if (!instagramURL && instagramUsername && /^[A-Za-z0-9._]{1,30}$/.test(instagramUsername)) {
        instagramURL = `https://www.instagram.com/${encodeURIComponent(instagramUsername)}/`;
      }
      return {
        id, name, imageCount: counts.get(id) || 0,
        dateAdded: aDate >= 0 ? String(row[aDate] || "") : "",
        instagramUsername, instagramURL
      };
    }).filter(row => row.name).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function getImagesForActress(actressId) {
    if (!imageRecordsCache || Date.now() - imageRecordsCacheAt > 60000) {
      imageRecordsCache = await getSheetTable(CONFIG.imagesSheet);
      imageRecordsCacheAt = Date.now();
    }
    const table = imageRecordsCache;
    const idx = {
      imageId: colIndex(table.headers, ["ImageID"]),
      actressId: colIndex(table.headers, ["ActressID"]),
      driveFileId: colIndex(table.headers, ["DriveFileID"]),
      category: colIndex(table.headers, ["Category"]),
      fileSize: colIndex(table.headers, ["FileSize"]),
      encryptionVersion: colIndex(table.headers, ["EncryptionVersion"]),
      dateAdded: colIndex(table.headers, ["DateAdded"])
    };
    if (idx.actressId < 0 || idx.driveFileId < 0) throw new Error("Images sheet needs ActressID and DriveFileID columns.");
    return table.rows.map((row, n) => ({
      id: idx.imageId >= 0 ? String(row[idx.imageId] || `${actressId}-${n}`) : `${actressId}-${n}`,
      actressId: String(row[idx.actressId] || ""),
      driveFileId: String(row[idx.driveFileId] || ""),
      category: idx.category >= 0 ? String(row[idx.category] || "Photo") : "Photo",
      fileSize: idx.fileSize >= 0 ? Number(row[idx.fileSize] || 0) : 0,
      encryptionVersion: idx.encryptionVersion >= 0 ? String(row[idx.encryptionVersion] || "PG02") : "PG02",
      dateAdded: idx.dateAdded >= 0 ? String(row[idx.dateAdded] || "") : ""
    })).filter(item => item.actressId === String(actressId) && item.driveFileId && item.encryptionVersion === "PG02")
      .sort((a,b) => String(a.dateAdded).localeCompare(String(b.dateAdded)));
  }

  async function getEncryptedFile(driveFileId) {
    if (!driveFileId) throw new Error("Missing Drive file ID.");
    const response = await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`);
    return await response.arrayBuffer();
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
      imageRecordsCache = null;
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

  return { config: CONFIG, signIn, signOut, getCatalogue, getImagesForActress, getEncryptedFile, uploadEncryptedFiles, getFavorites, setFavorite, isSignedIn: () => authReady && !!accessToken && Date.now() < tokenExpiresAt };
})();

window.GalleryAPI = GalleryAPI;
window.PrivateGalleryAPI = GalleryAPI;
