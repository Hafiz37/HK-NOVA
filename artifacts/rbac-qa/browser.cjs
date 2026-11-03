const { chromium } = require('/home/gopal-ichiro/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const out = __dirname;
const base = 'http://127.0.0.1:5027';
(async () => {
    const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
    const errors = [];
    const checks = [];
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}, recordVideo: {dir: path.join(out, 'video'), size: {width: 1440, height: 1000}}});
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(String(e)));
    async function login(role) {
        await page.goto(base + '/login');
        await page.locator('[name=username]').fill('demo-' + role);
        await page.locator('[name=password]').fill('Browser-check-123');
        await Promise.all([page.waitForURL(base + '/'), page.locator('button[type=submit]').click()]);
    }
    async function capture(filename) {
        await page.waitForFunction(() => getComputedStyle(document.body).opacity === '1');
        await page.screenshot({path: path.join(out, filename), fullPage: true, animations: 'disabled'});
    }
    async function check(name, fn) {
        await fn(); checks.push({name, passed: true});
    }
    let successful = false;
    try {
        await login('admin');
        await page.goto(base + '/users');
        await page.locator('a[href="/users/add"]').waitFor({state: 'visible'});
        await check('Admin sees Users and all role badges', async () => {
            assert.equal(await page.locator('tbody tr').count(), 3);
            assert.ok(await page.getByRole('link', {name: /Add User/}).isVisible());
        });
        await capture('admin_users.png');
        await page.getByRole('link', {name: /Add User/}).click();
        await page.locator('#username').fill('browser-new-user');
        await page.locator('#password').fill('New-browser-password');
        await page.locator('#full_name').fill('Browser Created User');
        await page.locator('#role').selectOption('operator');
        await page.getByRole('button', {name: 'Create User'}).click();
        await check('Admin creates an operator through the form', async () => {
            await page.getByText('User created', {exact: true}).waitFor();
            assert.equal(await page.locator('tbody tr').count(), 4);
        });
        const created = page.locator('tbody tr').filter({hasText: 'browser-new-user'});
        await created.getByRole('link', {name: /Edit/}).click();
        await page.locator('#role').selectOption('viewer');
        await page.getByRole('button', {name: 'Save Changes'}).click();
        await check('Admin updates the role through the form', async () => {
            await page.getByText('User updated', {exact: true}).waitFor();
            assert.match(await created.innerText(), /Viewer/);
        });
        page.once('dialog', dialog => dialog.accept());
        await created.getByRole('button', {name: /Delete/}).click();
        await page.getByText('User deleted', {exact: true}).waitFor();
        checks.push({name: 'Admin deletes a user through confirmed form', passed: true});
        await page.goto(base + '/logout');
        await login('operator');
        await page.goto(base + '/devices/');
        await check('Operator sees device editing actions', async () => {
            assert.ok(await page.getByRole('link', {name: /Add Device/}).isVisible());
            assert.ok(await page.getByRole('button', {name: /Backup/}).isVisible());
        });
        await page.goto(base + '/destinations/');
        await check('Operator cannot see Delete Destination', async () => {
            assert.equal(await page.locator('form[action$="/delete"]').count(), 0);
            assert.ok(await page.getByRole('link', {name: /Add Destination/}).isVisible());
        });
        const forbidden = await page.goto(base + '/users');
        assert.equal(forbidden.status(), 403);
        checks.push({name: 'Operator receives a styled 403 for user management', passed: true});
        await page.goto(base + '/logout');
        await login('viewer');
        await page.goto(base + '/devices/');
        await check('Viewer sees devices with View only', async () => {
            assert.equal(await page.getByRole('link', {name: /Add Device/}).count(), 0);
            assert.equal(await page.locator('[hx-post]').count(), 0);
            assert.ok(await page.getByRole('link', {name: 'View device'}).isVisible());
            assert.equal(await page.locator('a[href="/users"]').count(), 0);
        });
        await capture('viewer_devices.png');
        await page.goto(base + '/profile');
        await page.locator('#current_password').fill('Browser-check-123');
        await page.locator('#new_password').fill('Changed-browser-password');
        await page.locator('#confirm_password').fill('Changed-browser-password');
        await page.getByRole('button', {name: 'Change Password'}).click();
        await page.getByText('Password changed successfully', {exact: true}).waitFor();
        checks.push({name: 'Viewer changes own password', passed: true});
        await page.setViewportSize({width: 390, height: 844});
        await capture('mobile_profile.png');
        await check('Mobile profile fits viewport and has correct navigation', async () => {
            assert.ok(await page.locator('.mobile-bottom-nav a[href="/profile"]').isVisible());
            assert.equal(await page.locator('.mobile-bottom-nav').evaluate(el => getComputedStyle(el).position), 'fixed');
            assert.equal(await page.locator('.mobile-bottom-nav a[href="/users"]').count(), 0);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        });
        await page.goto(base + '/logout');
        const response = await page.goto(base + '/profile');
        assert.match(page.url(), /\/login/);
        checks.push({name: 'Logout clears session access', passed: true});
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify({checks, errors}, null, 2));
        console.log(JSON.stringify({passed: checks.length, errors}));
        successful = true;
    } finally {
        const video = page.video();
        await context.close();
        if (successful) await video.saveAs(path.join(out, 'rbac_walkthrough.webm'));
        await video.delete();
        await browser.close();
    }
})().catch(e => { console.error(e); process.exit(1); });
