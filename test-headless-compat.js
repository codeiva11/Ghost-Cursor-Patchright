const { chromium } = require('patchright');
const { GhostCursor } = require('./lib/patchright/index.js');
const path = require('path');

async function runTest(headless) {
  console.log(`\n========================================`);
  console.log(`Running compatibility test with headless = ${headless}`);
  console.log(`========================================`);

  let browser;
  try {
    // Launch patchright chromium
    browser = await chromium.launch({
      headless: headless,
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Load the local test page
    const testPageUrl = 'file://' + path.resolve(__dirname, 'test-page.html');
    await page.goto(testPageUrl);

    console.log('1. Page loaded successfully.');

    // Create a GhostCursor instance
    console.log('2. Creating GhostCursor...');
    const cursor = await GhostCursor.create(page, {
      visible: true, // This will install mouse helper elements
      performRandomMoves: true // Start random movements
    });
    console.log('   GhostCursor created successfully!');

    // Let it do some random moves for a bit
    console.log('3. Performing random moves (sleeping for 1 second)...');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Stop random moves and prepare to click button
    console.log('4. Moving to and clicking the button (#btn)...');
    
    // Check click state before clicking
    let statusText = await page.evaluate(() => document.getElementById('status').innerText);
    console.log(`   Initial status element text: "${statusText}"`);

    // click the button
    await cursor.click('#btn');
    console.log('   Click action completed.');

    // Check click state after clicking
    statusText = await page.evaluate(() => document.getElementById('status').innerText);
    console.log(`   Status element text after click: "${statusText}"`);

    if (statusText === 'CLICKED!') {
      console.log('   ✓ SUCCESS: Click was successfully triggered by GhostCursor!');
    } else {
      throw new Error('SUCCESS check failed: Click was not triggered.');
    }

    // Now test scrolling to the input container
    console.log('5. Scrolling down and typing text in input (#inp)...');
    
    // Let's test scroll pacing
    console.log('   Performing paced scroll down...');
    await cursor.scroll({ y: 800 }, { scrollSpeed: 70 });
    
    // Check input status before typing
    let inpStatusText = await page.evaluate(() => document.getElementById('inp-status').innerText);
    console.log(`   Initial typing status: "${inpStatusText}"`);

    // Type text using human-like typing (10% typo ratio to check typo correction)
    console.log('   Typing "Hello, AI Agent!" with 10% typo ratio...');
    await cursor.type('#inp', 'Hello, AI Agent!', {
      delay: 80,
      typoRatio: 0.10,
      randomizeDelay: true
    });
    console.log('   Typing action completed.');

    // Check input value and status after typing
    const inpValue = await page.evaluate(() => document.getElementById('inp').value);
    inpStatusText = await page.evaluate(() => document.getElementById('inp-status').innerText);
    console.log(`   Typed input value: "${inpValue}"`);
    console.log(`   Status element text after typing: "${inpStatusText}"`);

    if (inpValue === 'Hello, AI Agent!' && inpStatusText === 'TYPED SUCCESS!') {
      console.log('   ✓ SUCCESS: Human-like typing with typo correction worked perfectly!');
    } else {
      throw new Error(`Typing check failed. Typed value was "${inpValue}", expected "Hello, AI Agent!"`);
    }

    console.log('6. Closing browser...');
    await browser.close();
    console.log(`Test passed for headless = ${headless}!`);
    return true;
  } catch (error) {
    console.error(`❌ Test failed for headless = ${headless}:`, error);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
    return false;
  }
}

async function main() {
  const headlessTruePassed = await runTest(true);
  const headlessFalsePassed = await runTest(false);

  console.log(`\n========================================`);
  console.log('Summary of Compatibility Check:');
  console.log(`Headless (true):  ${headlessTruePassed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Headless (false): ${headlessFalsePassed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`========================================`);
  
  if (headlessTruePassed && headlessFalsePassed) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
