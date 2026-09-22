import dns from "node:dns";
import net from "node:net";

/**
 * §19/§34 : jusqu'ici, aucune route de cette API ne récupérait jamais côté serveur
 * une URL fournie par un client — id-card.service.ts documentait explicitement ce
 * choix ("fetching it server-side... would be a straightforward SSRF vector").
 * Cette finition (photo sur la carte scolaire) est la première exception : le seul
 * endroit qui a réellement besoin des octets de l'image (le PDF généré embarque
 * l'image, il ne peut pas se contenter d'un lien). Toute résolution DNS renvoyant
 * une IP privée/réservée est refusée avant même d'ouvrir la connexion — bloque
 * notamment le endpoint de métadonnées cloud (169.254.169.254), une cible SSRF
 * classique. `redirect: "error"` plutôt que "follow" : un serveur malveillant ne
 * peut pas rediriger vers une IP interne après coup (TOCTOU) — la validation DNS
 * ne porterait alors plus sur l'hôte réellement contacté.
 *
 * Volontairement pas d'épinglage d'IP (résoudre une fois puis forcer la connexion
 * sur cette IP précise) : la fenêtre de DNS rebinding entre la résolution ici et la
 * connexion TCP de `fetch` est de l'ordre de la milliseconde, et seul un membre du
 * personnel authentifié détenant `students.write` peut fournir cette URL — pas une
 * surface exposée à un attaquant anonyme. Documenté comme compromis assumé, pas un
 * oubli, même esprit que le commentaire qu'il remplace.
 */

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 Mo — largement suffisant pour une photo d'identité.
const FETCH_TIMEOUT_MS = 5000;
// image/webp deliberately excluded: pdfkit (the only current consumer, id-card.service.ts)
// only supports embedding JPEG and PNG buffers. Exporté pour lib/file-storage.ts, qui
// applique la même restriction aux fichiers téléversés (un logo doit lui aussi être
// embarquable dans un PDF).
export const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png"]);

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) {
    return true; // malformé -> refusé par prudence
  }
  const a = parts[0] as number;
  const b = parts[1] as number;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, y compris le endpoint metadata cloud
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 (IETF protocol assignments)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (benchmark)
  if (a >= 224) return true; // multicast (224/4) et réservé (240/4)
  return false;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 (unique local)
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return true; // fe80::/10 (link-local)
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) {
    return isPrivateOrReservedIpv4(mapped[1] as string);
  }
  return false;
}

function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateOrReservedIpv4(ip);
  if (version === 6) return isPrivateOrReservedIpv6(ip);
  return true; // ni v4 ni v6 -> refusé par prudence
}

async function hostnameResolvesToPublicIpOnly(hostname: string): Promise<boolean> {
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return false;
  }
  if (addresses.length === 0) return false;
  return addresses.every((entry) => !isPrivateOrReservedIp(entry.address));
}

/**
 * Récupère une image externe pour l'embarquer dans un PDF généré côté serveur.
 * Ne lève jamais — toute défaillance (URL invalide, IP privée, timeout, type de
 * contenu inattendu, taille excessive) renvoie `null`, laissant l'appelant se
 * rabattre sur une carte sans photo plutôt que de faire échouer toute la
 * génération pour une image inaccessible ou suspecte.
 */
export async function fetchImageSafely(url: string): Promise<Buffer | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") {
    return null;
  }
  if (!(await hostnameResolvesToPublicIpOnly(parsed.hostname))) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(parsed, {
      signal: controller.signal,
      redirect: "error",
      headers: { Accept: "image/jpeg, image/png" },
    });
    if (!response.ok || !response.body) {
      return null;
    }
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      return null;
    }
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_IMAGE_BYTES) {
      return null;
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        return null;
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
