import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = '/Users/iustin/.gemini/antigravity/brain/21890b8a-4aee-4e95-ac21-98ac403ca146';

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  });

  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  await page.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Dismiss onboarding modal if present
  const closeOnboarding = page.locator('text=×').first();
  if (await closeOnboarding.count() > 0) {
    await closeOnboarding.click({ force: true });
    await page.waitForTimeout(600);
  }

  // Navigate to Chat tab
  const chatTab = page.locator('text=Chat').first();
  await chatTab.click({ force: true });
  await page.waitForTimeout(1000);

  // Type: "Meniu rapid de seară sub 50 lei"
  const input = page.getByPlaceholder(/Întreabă sau scrie/i).first();
  await input.fill('Meniu rapid de seară sub 50 lei');
  await input.press('Enter');

  console.log('Waiting for AI response and catalog resolution...');
  await page.waitForTimeout(3000);

  const screenshotPath = path.join(ARTIFACT_DIR, '05_chat_meniu_rapid_catalog_matched.png');
  await page.screenshot({ path: screenshotPath });
  console.log('Saved screenshot:', screenshotPath);

  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
