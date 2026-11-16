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

  // 1. Load home page
  console.log('1. Loading home page...');
  await page.goto('http://localhost:8081', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  // Dismiss onboarding modal if present
  const closeOnboarding = page.locator('text=×').first();
  if (await closeOnboarding.count() > 0) {
    console.log('Dismissing onboarding modal...');
    await closeOnboarding.click({ force: true });
    await page.waitForTimeout(600);
  }

  // Screenshot Tab 1 (Listă - with 3 tabs: Listă, Coș, Cont)
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_tab_lista_3tabs.png') });
  console.log('Saved 01_tab_lista_3tabs.png');

  // 2. Open Recipe modal directly from Tab 1 composer
  console.log('2. Opening recipe modal from Tab 1 composer...');
  const recipeTrigger = page.getByRole('button', { name: /Importă rețetă sau link/i }).first();
  if (await recipeTrigger.count() > 0) {
    await recipeTrigger.click({ force: true });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_recipe_modal_from_lista.png') });
    console.log('Saved 02_recipe_modal_from_lista.png');

    // 3. Select preset recipe "Ciorbă Rădăuțeană"
    const recipePreset = page.locator('text=Ciorbă Rădăuțeană').first();
    if (await recipePreset.count() > 0) {
      await recipePreset.click({ force: true });
      await page.waitForTimeout(600);

      // 4. Click "Analizează rețeta"
      const analyzeBtn = page.locator('text=Analizează rețeta').first();
      if (await analyzeBtn.count() > 0) {
        await analyzeBtn.click({ force: true });
        await page.waitForSelector('text=Porții rețetă', { timeout: 20000 });
        await page.waitForTimeout(800);

        // 5. Click "Adaugă ... în listă"
        const confirmAddBtn = page.locator('text=în listă').first();
        await confirmAddBtn.click({ force: true });
        await page.waitForTimeout(1000);
      }
    }
  }

  // 6. Screenshot Tab 1 with recipe items organized by aisle
  console.log('6. Screenshot Tab 1 with items...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_lista_with_items_3tabs.png') });
  console.log('Saved 03_lista_with_items_3tabs.png');

  // 7. Click "Coș" in the bottom tab bar to navigate to compare
  console.log('7. Clicking Coș tab...');
  const cosTab = page.getByRole('tab', { name: /Coș/i }).first();
  if (await cosTab.count() > 0) {
    await cosTab.click({ force: true });
  } else {
    await page.goto('http://localhost:8081/compare', { waitUntil: 'networkidle', timeout: 30000 });
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_cos_compare_3tabs.png') });
  console.log('Saved 04_cos_compare_3tabs.png');

  // 8. Scroll down inside the ScrollView
  console.log('8. Scrolling inside ScrollView...');
  const scrollLocator = page.locator('[data-testid="compare-scroll-view"]');
  if (await scrollLocator.count() > 0) {
    await scrollLocator.evaluate((el) => {
      el.scrollTop = 580;
    });
  } else {
    await page.evaluate(() => {
      const scrollable = Array.from(document.querySelectorAll('div')).find(
        (d) => d.scrollHeight > d.clientHeight && d.clientHeight > 300
      );
      if (scrollable) scrollable.scrollTop = 580;
    });
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_cos_store_selection_3tabs.png') });
  console.log('Saved 05_cos_store_selection_3tabs.png');

  await browser.close();
  console.log('Complete walkthrough successful!');
}

run().catch((err) => {
  console.error('Walkthrough error:', err);
  process.exit(1);
});
