import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
await page.goto('http://localhost:5174/#/tags/planets/nope', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
console.log(await page.evaluate(() => {
  const root = document.querySelector('openish-api-reference').shadowRoot
  return {
    hash: location.hash,
    statusText: root.querySelector('.status')?.textContent?.trim().slice(0, 60) ?? 'NO .status',
    mainHTML: root.querySelector('main')?.innerHTML.slice(0, 260),
  }
}))
await browser.close()
