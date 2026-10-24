"use strict";

const PrivateGalleryAPI = {
  backendUrl: "https://script.google.com/macros/s/AKfycbwzY_feaULi9thCa033fn_qmV3k7vHv-FPbPv-yvlDdNZzOg0_SUx3rkB8RFCHp092rpg/exec",

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

window.PrivateGalleryAPI = PrivateGalleryAPI;