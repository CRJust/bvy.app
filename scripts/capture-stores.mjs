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

  // Load /compare
  console.log('Navigating to /compare...');
  await page.goto('http://localhost:8081/compare', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  // Dismiss onboarding modal if present
  const closeOnboarding = page.locator('text=×').first();
  if (await closeOnboarding.count() > 0) {
    console.log('Dismissing onboarding modal...');
    await closeOnboarding.click({ force: true });
    await page.waitForTimeout(600);
  }

  // Wait for comparison result to load
  await page.waitForSelector('text=Magazine', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Scroll the ScrollView down to the StoreComparisonList
  await page.evaluate(() => {
    // In React Native Web, scroll the container with overflow-y
    const allDivs = Array.from(document.querySelectorAll('div'));
    const scrollContainer = allDivs.find((d) => d.scrollHeight > d.clientHeight && d.clientHeight > 300);
    if (scrollContainer) {
      scrollContainer.scrollTop = 580;
    }
  });

  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '07_cos_store_comparison_list.png') });
  console.log('Saved 07_cos_store_comparison_list.png');

  // Let's click on a physical store (e.g. Lidl or Mega Image) to see the bottom checklist hero change
  const lidlRow = page.locator('text=Lidl').first();
  if (await lidlRow.count() > 0) {
    console.log('Selecting Lidl...');
    await lidlRow.click({ force: true });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '08_cos_lidl_selected.png') });
    console.log('Saved 08_cos_lidl_selected.png');
  }

  await browser.close();
  console.log('Store comparison capture finished!');
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
