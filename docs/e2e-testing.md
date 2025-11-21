# E2E Testing

## Overview

The project has comprehensive end-to-end tests covering both the new shadcn admin panel and diagnostic tooling.

## Test Suites

### Shadcn Admin Panel Tests (`tests/e2e/shadcn-admin.test.js`)

Focus on the React CMS shell:

- ✅ Page sidebar + layout load
- ✅ Section creation
- ✅ Field editing & dirty state tracking
- ✅ Preview path/device controls
- ✅ Save flow (POST `/__ual/api/content`)

### CMS Editor Workflow Tests (`tests/e2e/admin-panel.test.js`)

Smoke-tests the full editor interactions:

- ✅ Section add/remove operations
- ✅ Site + page form editing
- ✅ Page add/delete gutter controls
- ✅ Preview toggle + device switch

### Diagnostic Tests (`tests/e2e/admin-diagnostic.test.js`)

Utility test for debugging admin rendering issues. Captures:
- Page source
- Body text
- Root innerHTML
- Browser console logs

## Running Tests

```bash
# All e2e tests
pnpm test:e2e

# Shadcn admin only
pnpm test:e2e:shadcn

# All tests (unit + e2e)
pnpm test:all
```

## Requirements

- **Chrome/Chromium**: Tests use Selenium WebDriver with Chrome
- **Built admin assets**: Run `pnpm admin:build` before e2e tests
- **Test site isolation**: Each test run creates a temporary site from `starter/`

## Test Architecture

Tests use the shared `setup.js` module which:

1. Creates a temp directory with starter template
2. Builds the site using the CLI
3. Starts a dev server with admin assets from project root
4. Provides cleanup on teardown

## CI Considerations

- Tests run in headless Chrome (`--headless=new`)
- Requires `UAL_STRAPI_URL` env var (defaults to `http://localhost:1337`)
- Admin assets must be pre-built (`pnpm admin:build`)
- Random ports avoid conflicts in parallel CI runs

## Current Status

**All 15 tests passing** ✅

- 5 shadcn admin smoke tests
- 4 CMS workflow tests
- 1 diagnostic test (executed once per run)

