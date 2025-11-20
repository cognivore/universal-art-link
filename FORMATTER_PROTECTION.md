# Template Formatter Protection

## The Problem

Handlebars templates (`.hbs` files) were being **automatically reformatted** by Cursor/VSCode/Prettier, breaking the critical `{{themeVars}}` syntax by splitting it across multiple lines:

```handlebars
<!-- BROKEN (auto-formatted): -->
:root {
    {
      {
      themeVars
    }
  }
}

<!-- CORRECT: -->
:root { {{themeVars}} }
```

This corruption happened silently during file saves, causing git pre-commit hooks to fail.

## Root Cause

**Cursor/IDE format-on-save** was ignoring `.prettierignore` and reformatting templates anyway. This is a common issue with Handlebars files in modern IDEs.

## The Solution

We've implemented **multiple layers of protection**:

### 1. **.cursorignore**
Explicitly tells Cursor not to touch template files.

### 2. **.vscode/settings.json**
Disables ALL formatting for `.hbs` files:
- `editor.formatOnSave: false`
- `editor.formatOnType: false`
- `editor.formatOnPaste: false`
- Disables Prettier entirely for Handlebars

### 3. **.prettierrc.json**
Configures Prettier to require pragma comments for `.hbs` files, effectively disabling automatic formatting.

### 4. **Pre-commit hook validation**
Runs template syntax tests before any commit. If templates are corrupted, the commit is blocked with clear error messages showing which files failed.

### 5. **Automated tests** (`src/lib/template.test.ts`)
Validates:
- Handlebars compilation succeeds
- `{{themeVars}}` is present and correctly formatted
- No broken `{{ }}` delimiters with spaces/newlines

## For Developers

### When Editing Templates

**WARNING**: These files MUST be edited by hand with extreme care:
- `templates/**/*.hbs`
- `starter/templates/**/*.hbs`

**DO NOT**:
- Use format-on-save
- Use auto-format commands
- Let any formatter touch these files
- Copy-paste from formatters

**ALWAYS**:
- Write `{{themeVars}}` as a single token: `{{themeVars}}`
- Test after editing: `pnpm test:templates`
- The pre-commit hook will catch errors, but manual verification is better

### If Templates Get Corrupted

1. **Run tests** to identify which templates are broken:
   ```bash
   pnpm test:templates
   ```

2. **Fix the syntax manually** or restore from git:
   ```bash
   git checkout -- templates/layouts/broken-file.hbs
   ```

3. **Verify the fix**:
   ```bash
   pnpm test:templates
   ```

## Technical Details

### Why This Happens

Most code formatters use AST-based parsing. When they encounter `{{themeVars}}` in a CSS context like `:root { {{themeVars}} }`, they:

1. Parse it as malformed CSS/HTML
2. Attempt to "fix" it by adding whitespace for "readability"
3. Break the Handlebars syntax in the process

The double-brace syntax `{{ }}` is particularly vulnerable because formatters see it as nested blocks or object literals.

### Why Multiple Protection Layers

Different systems check different config files:
- **Cursor** checks `.cursorignore` and `.vscode/settings.json`
- **VSCode** checks `.vscode/settings.json`
- **Prettier CLI** checks `.prettierignore` and `.prettierrc.json`
- **IDE extensions** may check any combination of the above

By protecting at all layers, we ensure no formatter can corrupt our templates.

## See Also

- `TEMPLATE_PROTECTION.md` - Original template protection documentation
- `.prettierignore` - Files excluded from Prettier
- `.cursorignore` - Files excluded from Cursor formatting
- `src/lib/template.test.ts` - Template validation tests
- `.git/hooks/pre-commit` - Pre-commit validation hook

