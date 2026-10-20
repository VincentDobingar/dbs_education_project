import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import i18n from "../i18n.js";
import type * as ApiModule from "../lib/api.js";

const api = vi.hoisted(() => ({
  setupMfaWithEnrollmentToken: vi.fn(),
  enableMfaWithEnrollmentToken: vi.fn(),
  verifyMfaChallenge: vi.fn(),
}));

vi.mock("../lib/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, ...api };
});

import { MfaStep } from "./MfaStep.js";

const TOKENS = { accessToken: "access", refreshToken: "refresh" };

beforeAll(async () => {
  await i18n.changeLanguage("fr");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function typeCodeAndSubmit(code: string): void {
  fireEvent.change(screen.getByLabelText("Code à 6 chiffres"), { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: "Valider" }));
}

describe("MfaStep", () => {
  it("verifies a TOTP code against the login challenge", async () => {
    api.verifyMfaChallenge.mockResolvedValue(TOKENS);
    const onAuthenticated = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nextProvider i18n={i18n}>
        <MfaStep
          pending={{ mfaRequired: true, challengeToken: "challenge-1" }}
          relogin={vi.fn()}
          onAuthenticated={onAuthenticated}
          onCancel={vi.fn()}
        />
      </I18nextProvider>,
    );

    typeCodeAndSubmit("123 456");

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(TOKENS));
    expect(api.verifyMfaChallenge).toHaveBeenCalledWith("challenge-1", "123456");
  });

  it("enrolls, shows recovery codes, then re-logs in through the MFA challenge", async () => {
    api.setupMfaWithEnrollmentToken.mockResolvedValue({
      secret: "JBSWY3DPEHPK3PXP",
      otpauthUri: "otpauth://totp/x",
    });
    api.enableMfaWithEnrollmentToken.mockResolvedValue({ recoveryCodes: ["aaaa-bbbb", "cccc-dddd"] });
    api.verifyMfaChallenge.mockResolvedValue(TOKENS);
    const relogin = vi.fn().mockResolvedValue({ mfaRequired: true, challengeToken: "challenge-2" });
    const onAuthenticated = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nextProvider i18n={i18n}>
        <MfaStep
          pending={{ mfaEnrollmentRequired: true, enrollmentToken: "enroll-1" }}
          relogin={relogin}
          onAuthenticated={onAuthenticated}
          onCancel={vi.fn()}
        />
      </I18nextProvider>,
    );

    expect(await screen.findByText("JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();
    typeCodeAndSubmit("111111");

    expect(await screen.findByText("aaaa-bbbb")).toBeInTheDocument();
    expect(api.enableMfaWithEnrollmentToken).toHaveBeenCalledWith("enroll-1", "111111");

    fireEvent.click(screen.getByRole("button", { name: "J'ai noté mes codes, continuer" }));
    await screen.findByText("Vérification en deux étapes");
    expect(relogin).toHaveBeenCalledOnce();

    typeCodeAndSubmit("222222");
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledWith(TOKENS));
    expect(api.verifyMfaChallenge).toHaveBeenCalledWith("challenge-2", "222222");
  });

  it("shows a clear message on a wrong code", async () => {
    const { ApiError } = await import("../lib/apiClient.js");
    api.verifyMfaChallenge.mockRejectedValue(new ApiError(401, "INVALID_MFA_CODE", "bad"));

    render(
      <I18nextProvider i18n={i18n}>
        <MfaStep
          pending={{ mfaRequired: true, challengeToken: "challenge-1" }}
          relogin={vi.fn()}
          onAuthenticated={vi.fn()}
          onCancel={vi.fn()}
        />
      </I18nextProvider>,
    );

    typeCodeAndSubmit("000000");
    expect(await screen.findByText(/Code incorrect/)).toBeInTheDocument();
  });
});
