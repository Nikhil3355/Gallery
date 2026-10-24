"use strict";

const GalleryAPI = {
  backendUrl: "https://script.google.com/macros/s/AKfycbwzY_feaULi9thCa033fn_qmV3k7vHv-FPbPv-yvlDdNZzOg0_SUx3rkB8RFCHp092rpg/exec",

  // Upload intentionally remains disabled until a private, authenticated
  // backend endpoint is implemented. Do not upload through the current
  // Apps Script deployment while it is restricted to "Only myself".
  async uploadEncryptedFiles() {
    throw new Error(
      "Secure upload is not configured yet. The interface is ready, but the private backend must be configured before files can be uploaded safely."
    );
  },

  async getCatalogue() {
    if (!this.backendUrl) {
      throw new Error(
        "Backend URL has not been configured yet."
      );
    }

    const response = await fetch(this.backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action: "getCatalogue"
      })
    });

    if (!response.ok) {
      throw new Error("Unable to contact the gallery backend.");
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(
        result.error || "Unable to load the catalogue."
      );
    }

    return result.data;
  }
};

window.GalleryAPI = GalleryAPI;
window.PrivateGalleryAPI = GalleryAPI;