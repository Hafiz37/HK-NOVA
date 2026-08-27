import { test, expect } from '@playwright/test';

test.describe('Monitoring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="username"]', 'admin');
    await page.fill('[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('dashboard loads with device list', async ({ page }) => {
    await page.goto('/devices');
    await expect(page.locator('h1')).toContainText('Devices');
    await expect(page.locator('table')).toBeVisible();
  });

  test('can view device details', async ({ page }) => {
    await page.goto('/devices');
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.click();
    await expect(page).toHaveURL(/.*devices\/.*/);
  });

  test('monitoring top API endpoint returns data', async ({ page }) => {
    const response = await page.request.get('/api/monitoring/top?n=5');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('topAlerts');
    expect(data).toHaveProperty('topLatency');
    expect(data).toHaveProperty('topPacketLoss');
    expect(data).toHaveProperty('topCpu');
    expect(data).toHaveProperty('topMem');
  });
});