import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../env.js";
import { fetchTenantLogo } from "../lib/pdf-letterhead.js";
import { fetchImageSafely, MAX_IMAGE_BYTES } from "../lib/safe-image-fetch.js";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn(), realpath: vi.fn(), stat: vi.fn() }));
vi.mock("../lib/safe-image-fetch.js", () => ({
  fetchImageSafely: vi.fn().mockResolvedValue(null),
  MAX_IMAGE_BYTES: 3 * 1024 * 1024,
}));
const name = "a".repeat(32) + ".png";
beforeEach(() => vi.clearAllMocks());
describe("logos des documents scolaires", () => {
  it("lit un upload propre à l'application sans requête HTTP locale", async () => {
    const root = path.resolve(env.UPLOAD_DIR, "tenant-logos");
    vi.mocked(realpath).mockResolvedValueOnce(root).mockResolvedValueOnce(path.join(root, name));
    vi.mocked(stat).mockResolvedValueOnce({ size: 20 } as Awaited<ReturnType<typeof stat>>);
    vi.mocked(readFile).mockResolvedValueOnce(Buffer.from("logo"));
    expect(await fetchTenantLogo(new URL("/uploads/tenant-logos/" + name, env.PUBLIC_API_URL).href)).toEqual(
      Buffer.from("logo"),
    );
    expect(fetchImageSafely).not.toHaveBeenCalled();
  });
  it("refuse une sortie de répertoire même par lien symbolique", async () => {
    vi.mocked(realpath)
      .mockResolvedValueOnce(path.resolve(env.UPLOAD_DIR, "tenant-logos"))
      .mockResolvedValueOnce(path.resolve("private", name));
    expect(
      await fetchTenantLogo(new URL("/uploads/tenant-logos/" + name, env.PUBLIC_API_URL).href),
    ).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });
  it("plafonne la taille des fichiers locaux", async () => {
    const root = path.resolve(env.UPLOAD_DIR, "tenant-logos");
    vi.mocked(realpath).mockResolvedValueOnce(root).mockResolvedValueOnce(path.join(root, name));
    vi.mocked(stat).mockResolvedValueOnce({ size: MAX_IMAGE_BYTES + 1 } as Awaited<ReturnType<typeof stat>>);
    expect(
      await fetchTenantLogo(new URL("/uploads/tenant-logos/" + name, env.PUBLIC_API_URL).href),
    ).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });
  it("garde le filtre réseau pour les URL externes", async () => {
    await fetchTenantLogo("https://school.example/logo.png");
    expect(fetchImageSafely).toHaveBeenCalledWith("https://school.example/logo.png");
    expect(readFile).not.toHaveBeenCalled();
  });
});
