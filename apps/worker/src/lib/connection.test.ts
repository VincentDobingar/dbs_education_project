import { describe, expect, it } from "vitest";

import { getRedisConnectionOptions } from "./connection.js";

describe("getRedisConnectionOptions", () => {
  it("parses host and port from REDIS_URL", () => {
    const options = getRedisConnectionOptions();

    expect(options.host).toBe("localhost");
    expect(options.port).toBe(6379);
  });
});
