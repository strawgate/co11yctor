import { expect, test } from "@playwright/test";

test("dashboard spans drill into trace details", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Connected")).toBeVisible();
  await expect(page.getByText("HTTP GET /api/users")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /Traces/ }).click();
  await expect(page.getByRole("heading", { name: "Traces" })).toBeVisible();

  const traceRow = page.getByRole("row", { name: /frontend HTTP GET \/api\/users/ }).first();
  await expect(traceRow).toBeVisible({ timeout: 15_000 });
  await traceRow.click();

  await expect(page.getByText("Waterfall")).toBeVisible();
  await expect(page.getByText("Click a span to see details")).toBeVisible();

  await page.getByRole("button", { name: /Back to traces/ }).click();
  await expect(page.getByRole("heading", { name: "Traces" })).toBeVisible();
});

test("collector insights and live tail render simulated traffic", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Collector/ }).click();
  await expect(page.getByRole("heading", { name: "Collector Insights" })).toBeVisible();
  await expect(page.getByText("OpenTelemetry Collector")).toBeVisible();
  await expect(page.getByText("10.0.0.1")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /Live Tail/ }).click();
  await expect(page.getByRole("heading", { name: "Live Tail" })).toBeVisible();
  await expect(page.getByText("Streaming")).toBeVisible();
  await expect(page.getByText("frontend → HTTP GET /api/users")).toBeVisible({ timeout: 15_000 });
});
