import { z } from "zod";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * §34 : « protection des fichiers ». These fields are always a URL to a file
 * already uploaded elsewhere (this API never fetches them server-side, so no
 * SSRF risk — see the ID card/receipt PDF generators), but until now any non-empty
 * string passed validation and was later returned as-is to other authenticated
 * users (a parent viewing their child's documents, a teacher viewing a homework
 * submission, staff viewing an HR document). A `javascript:`/`data:` value slipped
 * through unnoticed — stored XSS if a future client render turns the field into a
 * clickable link. Restricted to the only two protocols that make sense for a file
 * hosted elsewhere.
 */
export const httpUrlSchema = z
  .string()
  .url("Must be a valid http(s) URL")
  .refine((value) => {
    try {
      return ALLOWED_PROTOCOLS.has(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Must use http or https");
