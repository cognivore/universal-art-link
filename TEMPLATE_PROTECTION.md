# Template Protection System

## Problem

Handlebars templates (`.hbs` files) are fragile - auto-formatters and editors often break the `{{variable}}` syntax by adding spaces or newlines between braces, transforming `{{themeVars}}` into:

```handlebars
{
  {
  themeVars
}
}
```

This malformed syntax prevents Handlebars from recognizing variables, causing silent failures where CSS variables, navigation, and other dynamic content fail to render.

## Protection Layers

We've implemented **4 layers of protection** to prevent this from happening:

### 1. `.prettierignore` (Prevention)

All `.hbs` files are excluded from Prettier and other formatters:

```
templates/**/*.hbs
starter/templates/**/*.hbs
```

**What it does:** Prevents auto-formatters from modifying templates
**When it helps:** Save actions, IDE format-on-save, batch formatting

### 2. Warning Comments (Documentation)

Each template file begins with a Handlebars comment warning:

```handlebars
{{!--
  WARNING: DO NOT AUTO-FORMAT THIS FILE

  Handlebars syntax MUST remain intact: {{variable}}
  Auto-formatters often break {{ }} delimiters by adding spaces/newlines.
  This file is protected by .prettierignore and validated by tests.

  Critical variables that must not be malformed:
  - {{themeVars}} must be exactly {{themeVars}}, NOT { { themeVars } }
--}}
```

**What it does:** Warns developers and AI assistants not to format
**When it helps:** Manual edits, AI-assisted changes, code reviews

### 3. Automated Tests (Detection)

Template validation tests run via `npm test:templates`:

- **Syntax validation:** All templates must compile with Handlebars
- **Variable presence:** All layouts must contain `{{themeVars}}` in `:root` block
- **Malformation detection:** Catches broken multi-line delimiter patterns

**What it does:** Catches malformed templates before they break production
**When it helps:** CI/CD pipelines, pre-deployment checks, local development

Run tests:
```bash
npm run test:templates
```

### 4. Git Pre-Commit Hook (Enforcement)

The `.git/hooks/pre-commit` script validates templates before commits:

```bash
#!/bin/sh
# Validates Handlebars templates before allowing commit
# Runs automatically on `git commit`
```

**What it does:** Blocks commits with malformed templates
**When it helps:** Prevents broken templates from entering version control
**Bypass (not recommended):** `git commit --no-verify`

## How It Happened

The malformed syntax was introduced in commit `df4f04e` ("better templates") when someone or something reformatted the template files, breaking the Handlebars delimiters.

The broken syntax passed unnoticed because:
1. No formatter protection existed
2. No template validation tests
3. No pre-commit validation
4. The error was silent (CSS just didn't apply)

## If Templates Break Again

1. **Immediate fix:** Restore correct syntax:
   ```diff
   -  { { themeVars } }
   +  {{themeVars}}
   ```

2. **Rebuild:** `npm run build` or restart dev server

3. **Investigate:**
   - Check if `.prettierignore` was modified/deleted
   - Check if tests were bypassed (`git commit --no-verify`)
   - Check if warning comments were removed

4. **Verify fix:** `npm run test:templates`

## Maintenance

- **Never** run auto-formatters on `.hbs` files manually
- **Never** commit with `--no-verify` for template changes
- **Always** run tests before pushing template changes
- **Keep** the protection files (`.prettierignore`, pre-commit hook, tests) in sync across `templates/` and `starter/templates/`


