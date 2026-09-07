import superagent from "superagent";

import { XLSX_CONTENT_TYPE } from "../lib/xlsx.js";

/**
 * superagent only pre-registers a binary parser for a handful of exact content
 * types (application/octet-stream, application/pdf, image/*) — see
 * node_modules/superagent/lib/node/parsers/index.js. Our XLSX responses use the
 * real OOXML spreadsheet mime type, which isn't one of those, so without this
 * `res.body` stays `{}` instead of a `Buffer` in every test asserting on the raw
 * bytes. Registering the same binary parser under our mime type once here (a
 * `setupFiles` entry, shared by every worker) beats duplicating a `.buffer().parse(...)`
 * chain in every individual xlsx-asserting request across three test files.
 *
 * `.parse` is a Node-only internal registry (keyed by arbitrary mime strings) that
 * @types/superagent's public typings don't expose — a narrow local interface for
 * just that shape, rather than an `any` cast of the whole module.
 */
interface SuperagentWithParseRegistry {
  parse: Record<string, unknown>;
}

const superagentWithParse = superagent as unknown as SuperagentWithParseRegistry;
superagentWithParse.parse[XLSX_CONTENT_TYPE] = superagentWithParse.parse["application/octet-stream"];
