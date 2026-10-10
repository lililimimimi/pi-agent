import { test, expect } from '@playwright/test'
import { mockBackend } from './fixtures'

const PROJECT = {
  id: '/tmp/pi-e2e-project',
  name: 'pi-e2e',
  path: '/tmp/pi-e2e-project',
  created_at: '2026-01-01T00:00:00Z',
}

test.describe('scrolling and stopping in a real browser', () => {
  test('a long reply starts in view just below the question', async ({ page }) => {
    const reply = Array.from({ length: 60 }, (_, i) => `Line ${i}`).join('\n\n')
    await mockBackend(page, { reply: () => reply })
    await page.goto('/')

    await page.getByPlaceholder('Message pi…').fill('long please')
    await page.keyboard.press('Enter')

    await expect(page.getByText('Line 0')).toBeInViewport()
  })

  test('a sent message is brought to the top while its reply streams in', async ({ page }) => {
    const earlier = Array.from({ length: 40 }, (_, i) => `Earlier paragraph ${i}`).join('\n\n')
    const later = Array.from({ length: 40 }, (_, i) => `Later paragraph ${i}`).join('\n\n')
    let answer = earlier
    await mockBackend(page, { reply: () => answer })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')

    await page.getByPlaceholder('Message pi…').fill('first')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Earlier paragraph 39')).toBeVisible()

    answer = later
    await page.getByPlaceholder('Message pi…').fill('the new question')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Later paragraph 39')).toBeVisible()

    const bubble = page.getByText('the new question', { exact: true })
    // The list starts under the header (about 60px); the bubble should settle at its top edge
    await expect.poll(() => bubble.evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(120)
  })

  test('the chat list does not scroll sideways', async ({ page }) => {
    await mockBackend(page, { reply: () => 'word '.repeat(200) })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')

    await page.getByPlaceholder('Message pi…').fill('long please')
    await page.keyboard.press('Enter')
    await expect(page.getByText('word').first()).toBeVisible()

    const overflow = await page.evaluate(() => {
      const list = Array.from(document.querySelectorAll('div')).find(
        (el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX === 'auto',
      )
      return list ? list.scrollWidth - list.clientWidth : 0
    })
    expect(overflow).toBe(0)
  })

  test('reopening a long saved chat shows its newest message', async ({ page }) => {
    await mockBackend(page, { reply: () => 'unused' })
    const records = [
      { type: 'session', id: 'old' },
      ...Array.from({ length: 80 }, (_, i) => ({
        type: 'message',
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      })),
    ]
    await page.route(
      (url) => url.pathname === '/api/projects',
      (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([PROJECT]) }),
    )
    await page.route(
      (url) => url.pathname === '/api/sessions',
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'old', title: 'Long chat', project_id: PROJECT.path, created_at: '2026-01-01T00:00:00Z' },
          ]),
        }),
    )
    await page.route(
      (url) => url.pathname === '/api/sessions/old',
      (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(records) }),
    )
    await page.goto('/')

    // Switching to the project opens its last chat, which must load its saved messages
    await page.getByText('pi-e2e').first().click()

    await expect(page.getByText('Message 79')).toBeVisible()
    await expect(page.getByText('Message 79')).toBeInViewport()
  })

  test('stop ends a reply that is still streaming', async ({ page }) => {
    const log = await mockBackend(page, { reply: () => 'unused' })
    // Hold the reply back so there is time to press stop while it is streaming
    await page.route(
      (url) => url.pathname === '/api/chat/stream/s1',
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 5000))
        await route.abort().catch(() => undefined)
      },
    )
    await page.goto('/')

    await page.getByPlaceholder('Message pi…').fill('slow question')
    await page.keyboard.press('Enter')

    const stop = page.getByRole('button', { name: 'Stop reply' })
    await expect(stop).toBeVisible()
    await stop.click()

    await expect(stop).toHaveCount(0)
    expect(log.some((entry) => entry.path === '/api/chat/stop/s1' && entry.method === 'POST')).toBe(true)
  })
})
