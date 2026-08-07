import { describe, expect, test } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CreateProjectPromptCard } from "./CreateProjectPromptCard";
import type { CreateProjectPrompt } from "../types";

const PROMPT: CreateProjectPrompt = { suggested_domain: "Retail", suggested_layer: "silver" };

function render() {
  return renderToStaticMarkup(
    React.createElement(CreateProjectPromptCard, {
      prompt: PROMPT,
      isSubmitting: false,
      error: null,
      onCreate: () => {},
    }),
  );
}

describe("CreateProjectPromptCard (Quick Chat's inline create-project card)", () => {
  test("shows the full field set: Name, Domain, Layer, Target Platform, and a DB connection toggle", () => {
    const html = render();
    expect(html).toContain("Project Name");
    expect(html).toContain(">Domain<");
    expect(html).toContain(">Layer<");
    expect(html).toContain("Target Platform");
    expect(html).toContain("PostgreSQL");
    expect(html).toContain("Add a database connection");
  });

  test("Name and Domain fields carry richer example placeholders, not generic ones", () => {
    const html = render();
    expect(html).toContain("Lakehouse Foundation Model");
    expect(html).toContain("Retail &amp; E-Commerce");
  });

  test("Layer and Target Platform render as button-cards, not native <select> elements", () => {
    const html = render();
    // The only <select> left should be the DB dialect picker, which stays
    // collapsed (not rendered) until "Add a database connection" is clicked.
    expect(html).not.toContain("<select");
  });

  test("all three layer options and all three target platform options are present", () => {
    const html = render();
    expect(html).toContain("Silver — Foundation");
    expect(html).toContain("Gold — Product");
    expect(html).toContain("Bronze — Raw");
    expect(html).toContain("PostgreSQL");
    expect(html).toContain("Snowflake");
    expect(html).toContain("SQL Server");
  });
});
