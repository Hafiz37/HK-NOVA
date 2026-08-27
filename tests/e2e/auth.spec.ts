import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('admin can login and access dashboard', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h1')).toContainText('Login');

    await page.fill('[name="username"]', 'admin');
    await page.fill('[name="password"]', 'admin123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('redirects to login when accessing protected route', async ({ page }) => {
    await page.goto('/devices');
    await expect(page).toHaveURL(/.*login/);
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="username"]', 'admin');
    await page.fill('[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });
});