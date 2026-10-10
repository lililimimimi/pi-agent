import { test, expect } from '@playwright/test'
import { mockBackend } from './fixtures'

test.describe('chat', () => {
  test('opens to an empty chat with the message box and the New chat button', async ({ page }) => {
    await mockBackend(page, { reply: () => 'unused' })
    await page.goto('/')

    await expect(page.getByPlaceholder('Message pi…')).toBeVisible()
    await expect(page.getByTitle('New chat (⌘N)')).toBeVisible()
  })

  test('sending a message shows the streamed reply', async ({ page }) => {
    await mockBackend(page, { reply: () => 'Hello from the fake model' })
    await page.goto('/')

    await page.getByPlaceholder('Message pi…').fill('hi there')
    await page.keyboard.press('Enter')

    await expect(page.getByText('Hello from the fake model')).toBeVisible()
  })

  test('editing a message re-sends it and replaces the old reply', async ({ page }) => {
    let answer = 'First answer'
    const log = await mockBackend(page, { reply: () => answer })
    await page.goto('/')

    await page.getByPlaceholder('Message pi…').fill('first question')
    await page.keyboard.press('Enter')
    await expect(page.getByText('First answer')).toBeVisible()

    answer = 'Second answer'
    await page.getByRole('button', { name: 'Edit message' }).click()
    await page.getByLabel('Edit message text').fill('edited question')
    await page.getByRole('button', { name: 'Save & resend' }).click()

    await expect(page.getByText('Second answer')).toBeVisible()
    await expect(page.getByText('First answer')).toHaveCount(0)
    const cut = log.find((entry) => entry.path.endsWith('/truncate'))
    expect(cut?.body).toEqual({ user_index: 0 })
  })

  test('regenerate asks the model again for the last message', async ({ page }) => {
    let answer = 'Draft answer'
    const log = await mockBackend(page, { reply: () => answer })
    await page.goto('/')

    await page.getByPlaceholder('Message pi…').fill('write something')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Draft answer')).toBeVisible()

    answer = 'Better answer'
    await page.getByRole('button', { name: 'Regenerate' }).click()

    await expect(page.getByText('Better answer')).toBeVisible()
    expect(log.filter((entry) => entry.path === '/api/chat')).toHaveLength(2)
  })

  test('Copy reply copies the reply text as written', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await mockBackend(page, { reply: () => 'Copy **this** text' })
    await page.goto('/')

    await page.getByPlaceholder('Message pi…').fill('go')
    await page.keyboard.press('Enter')
    await expect(page.getByText('this')).toBeVisible()

    await page.getByRole('button', { name: 'Copy reply' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Copy **this** text')
  })
})
