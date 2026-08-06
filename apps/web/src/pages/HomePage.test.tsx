import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import i18n from "../i18n.js";

import { HomePage } from "./HomePage.js";

describe("HomePage", () => {
  it("renders the platform name", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <HomePage />
      </I18nextProvider>,
    );

    expect(screen.getByText("EduManage Africa")).toBeInTheDocument();
  });
});
