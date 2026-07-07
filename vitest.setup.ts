import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { config } from 'dotenv'

config({ path: '.env.local' })

// @testing-library/react's built-in auto-cleanup relies on a global `afterEach`,
// which this project doesn't enable (no `test.globals: true`). Register it
// explicitly so DOM trees don't leak between tests within the same file.
afterEach(() => {
  cleanup()
})
