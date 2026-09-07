import { describe, expect, it } from "vitest";

import { fetchImageSafely } from "./safe-image-fetch.js";

// Pas de mock réseau ici par construction : chaque cas ci-dessous est rejeté avant
// toute tentative de connexion (protocole ou IP invalide), donc purement synchrone
// et déterministe — comme le test d'intégration §19 qui couvre le cas 169.254.169.254
// de bout en bout via la vraie route de carte scolaire.
describe("fetchImageSafely (§19/§34 — protections SSRF)", () => {
  it("refuses a plain http:// URL", async () => {
    expect(await fetchImageSafely("http://example.com/photo.jpg")).toBeNull();
  });

  it("refuses a malformed URL", async () => {
    expect(await fetchImageSafely("not-a-url")).toBeNull();
  });

  it("refuses a loopback IP", async () => {
    expect(await fetchImageSafely("https://127.0.0.1/photo.jpg")).toBeNull();
  });

  it("refuses the cloud metadata link-local address", async () => {
    expect(await fetchImageSafely("https://169.254.169.254/latest/meta-data/")).toBeNull();
  });

  it("refuses a private 10.x address", async () => {
    expect(await fetchImageSafely("https://10.0.0.5/photo.jpg")).toBeNull();
  });

  it("refuses a private 192.168.x address", async () => {
    expect(await fetchImageSafely("https://192.168.1.1/photo.jpg")).toBeNull();
  });

  it("refuses an IPv6 loopback address", async () => {
    expect(await fetchImageSafely("https://[::1]/photo.jpg")).toBeNull();
  });

  it("refuses a non-http(s) protocol", async () => {
    expect(await fetchImageSafely("file:///etc/passwd")).toBeNull();
  });
});
