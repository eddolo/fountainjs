# Publishing FountainJS to npm

This guide explains how to publish FountainJS to npm and make it available for other developers to use.

## Prerequisites

1. **npm Account**: Create one at [npmjs.com](https://www.npmjs.com/signup)
2. **GitHub Repository**: Push your code to a public GitHub repo
3. **Verified Email**: Verify your npm account email

## Before Publishing

### 1. Update package.json

Make sure these fields are correctly filled:

```json
{
  "name": "@fountainjs/editor",
  "version": "0.1.0",
  "description": "A modular, extensible rich text editor library",
  "author": "Your Name <your.email@example.com>",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/fountainjs.git"
  },
  "homepage": "https://github.com/yourusername/fountainjs#readme",
  "bugs": {
    "url": "https://github.com/yourusername/fountainjs/issues"
  }
}
```

### 2. Build the Library

```bash
npm run build:lib
```

Verify the `dist/` folder contains:
- `fountainjs.js` (ES module)
- `fountainjs.cjs` (CommonJS)
- `fountainjs-react.js` (React bindings - ES)
- `fountainjs-react.cjs` (React bindings - CommonJS)
- `*.d.ts` files (TypeScript declarations)

### 3. Test Installation Locally

```bash
npm pack
```

This creates a tarball. You can test it in another project:

```bash
npm install /path/to/fountainjs-0.1.0.tgz
```

Verify it works correctly before publishing.

### 4. Update Version

Before publishing a new version, update `version` in package.json:

```json
{
  "version": "0.2.0"
}
```

Follow [Semantic Versioning](https://semver.org/):
- **MAJOR** (0.1.0 → 1.0.0): Breaking changes
- **MINOR** (1.0.0 → 1.1.0): New features
- **PATCH** (1.1.0 → 1.1.1): Bug fixes

## Publishing Steps

### Option 1: Scoped Package (Recommended for Starting Out)

Using a scoped package (`@fountainjs/editor`) is recommended because:
- Easier to remember your namespace
- Free for public packages
- Professional presentation

#### Step 1: Login to npm

```bash
npm login
```

Enter your npm username, password, and email.

#### Step 2: Publish

```bash
npm publish --access public
```

The `--access public` flag is required for scoped packages.

### Option 2: Unscoped Package

If you want to publish without a scope:

1. Change `name` in package.json:
   ```json
   {
     "name": "fountainjs-editor"
   }
   ```

2. Publish:
   ```bash
   npm publish
   ```

## After Publishing

### Verify Publication

1. Check npm.js:
   ```
   https://www.npmjs.com/package/@fountainjs/editor
   ```

2. Test installation in a new project:
   ```bash
   npm install @fountainjs/editor
   ```

3. Verify imports work:
   ```javascript
   // CommonJS
   const { createEditor, CoreSchemaSpec } = require('@fountainjs/editor');
   
   // ES Modules
   import { createEditor, CoreSchemaSpec } from '@fountainjs/editor';
   
   // React bindings
   import { useFountain, FountainEditor } from '@fountainjs/editor/react';
   ```

### Create GitHub Release

Tag your version and create a release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Then create a release on GitHub with release notes.

### Update Documentation

Add a "Getting Started" section to your README pointing to npm:

```markdown
## Installation

```bash
npm install @fountainjs/editor
```
```

## Updating and Re-publishing

When you make changes:

1. Make code changes
2. Update version in package.json
3. Run tests and type-check:
   ```bash
   npm run type-check
   ```

4. Build the library:
   ```bash
   npm run build:lib
   ```

5. Test locally (recommended):
   ```bash
   npm pack
   npm install /path/to/fountainjs-X.X.X.tgz
   ```

6. Commit and push:
   ```bash
   git add .
   git commit -m "chore: bump version to X.X.X"
   git push
   git tag vX.X.X
   git push origin vX.X.X
   ```

7. Publish:
   ```bash
   npm publish
   ```

## Helpful Commands

### Check Current npm Version
```bash
npm view @fountainjs/editor
```

### List Your Packages
```bash
npm profile get
```

### Unpublish (Not Recommended)
```bash
npm unpublish @fountainjs/editor@0.1.0
```

Use with caution - can break dependencies!

## Troubleshooting

### "You do not have permission to publish"
- Make sure you're logged in: `npm whoami`
- Check you own the package name
- For scoped packages, check organization membership

### "Invalid JSON from npm registry"
- Try: `npm cache clean --force`
- Then: `npm publish`

### "Package name already exists"
- Pick a different scoped name
- Check if it's typosquatting to avoid issues

### Large package size warning
- Review what's included in `dist/`
- Update `.npmignore` to exclude unnecessary files
- Build size shouldn't exceed 1-2 MB

## CI/CD Integration

Automate publishing with GitHub Actions:

Create `.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      
      - run: npm install
      - run: npm run build:lib
      - run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Then in npm settings, create an automation token and add it to GitHub secrets as `NPM_TOKEN`.

## Additional Resources

- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
- [Create Scoped Package](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages)

---

**Congratulations! Your library is now available to developers worldwide! 🚀**
