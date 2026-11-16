import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = '/Users/iustin/.gemini/antigravity/brain/21890b8a-4aee-4e95-ac21-98ac403ca146';

async function run() {
  console.log('Starting Playwright visual test for Chat AI feature...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  });

  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  console.log('1. Loading home page...');
  await page.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Dismiss onboarding modal if present
  const closeOnboarding = page.locator('text=×').first();
  if (await closeOnboarding.count() > 0) {
    console.log('Dismissing onboarding modal...');
    await closeOnboarding.click({ force: true });
    await page.waitForTimeout(600);
  }

  // 2. Click the "Chat" tab in the bottom bar
  console.log('2. Navigating to Chat tab...');
  const chatTab = page.locator('text=Chat').first();
  await chatTab.click({ force: true });
  await page.waitForTimeout(1200);

  // Verify greeting message
  console.log('3. Checking greeting message and quick chips...');
  const chipCarbonara = page.locator('text=Ingrediente pentru paste carbonara').first();
  await chipCarbonara.waitFor({ timeout: 5000 });

  // 4. Click Carbonara quick chip
  console.log('4. Clicking Carbonara quick chip...');
  await chipCarbonara.click({ force: true });
  await page.waitForTimeout(2000);

  // Screenshot 1: Carbonara items card
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_chat_carbonara_card.png') });
  console.log('Saved 01_chat_carbonara_card.png');

  // 5. Click "Adaugă produse în listă"
  console.log('5. Clicking Adaugă în listă on the card...');
  const addBtn = page.locator('text=/Adaugă.*în listă/i').first();
  if (await addBtn.count() > 0) {
    await addBtn.click({ force: true });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_chat_items_added.png') });
    console.log('Saved 02_chat_items_added.png');
  }

  // 6. Type follow-up refinement: "mai adaugă 2 beri"
  console.log('6. Sending follow up "mai adaugă 2 beri"...');
  const input = page.getByPlaceholder(/Întreabă sau scrie/i).first();
  await input.fill('mai adaugă 2 beri');
  await input.press('Enter');
  await page.waitForTimeout(2000);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_chat_incremental_addition.png') });
  console.log('Saved 03_chat_incremental_addition.png');

  // 7. Test Tab Switch Persistence
  console.log('7. Switching to Listă tab then back to Chat...');
  const listaTab = page.locator('text=Listă').first();
  await listaTab.click({ force: true });
  await page.waitForTimeout(1000);

  const returnChatTab = page.locator('text=Chat').first();
  await returnChatTab.click({ force: true });
  await page.waitForTimeout(1000);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_chat_persisted_after_tab_switch.png') });
  console.log('Saved 04_chat_persisted_after_tab_switch.png');

  await browser.close();
  console.log('Visual audit finished successfully!');
}

run().catch((e) => {
  console.error('Visual audit failed:', e);
  process.exit(1);
});
