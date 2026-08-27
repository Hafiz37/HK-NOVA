import { test, expect } from '@playwright/test';

test.describe('Alerts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="username"]', 'admin');
    await page.fill('[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('alerts page loads with alert list', async ({ page }) => {
    await page.goto('/alerts');
    await expect(page.locator('h1')).toContainText('Alerts');
    await expect(page.locator('table')).toBeVisible();
  });

  test('can filter alerts by status', async ({ page }) => {
    await page.goto('/alerts');
    await page.selectOption('select[name="status"]', 'ACTIVE');
    await expect(page).toHaveURL(/.*status=ACTIVE/);
  });

  test('alert rules page loads', async ({ page }) => {
    await page.goto('/alert-rules');
    await expect(page.locator('h1')).toContainText('Alert Rules');
  });

  test('alert API returns paginated results', async ({ page }) => {
    const response = await page.request.get('/api/alerts?page=1&limit=10');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('pagination');
  });
});