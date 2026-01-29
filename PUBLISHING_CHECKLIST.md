# FountainJS - Publishing Checklist ✅

## Pre-Publishing Checklist

Use this checklist before publishing @fountainjs/editor to npm.

### Project Setup
- [x] Package name set to `@fountainjs/editor`
- [x] Version set to `0.1.0` (update before publishing)
- [x] Description updated
- [x] Author information added
- [x] License set to MIT
- [x] Repository URL configured
- [x] Bug/issues URL configured
- [x] Keywords added for discoverability

### Code Quality
- [x] TypeScript compilation passes (`npm run type-check`)
- [x] No linting errors
- [x] All imports resolved correctly
- [x] React is optional dependency (peerDependencies)
- [x] Tree-shaking configured in build

### Documentation
- [x] README.md with quick start examples
- [x] API documentation complete
- [x] React example included
- [x] Vanilla JS example included
- [x] Installation instructions clear
- [x] Feature list documented
- [x] Browser support documented

### Build & Distribution
- [x] Build configuration created (vite.lib.config.ts)
- [x] ES module output configured
- [x] CommonJS output configured
- [x] TypeScript declarations generated
- [x] Entry points properly configured
- [x] React bindings as separate export
- [x] .npmignore configured (excludes examples, dev files)

### Files Ready for NPM
- [x] README.md
- [x] LICENSE (MIT)
- [x] package.json with proper exports
- [x] src/ folder with source code
- [x] dist/ folder will be generated (not committed)

### Testing
- [x] Example app works at http://localhost:5174/
- [x] Keyboard shortcuts work (Ctrl+B, Ctrl+I)
- [x] Content insertion works (buttons functional)
- [x] No console errors in browser

### Documentation Files
- [x] README.md - Main library docs
- [x] NPM_PUBLISHING.md - Publishing guide
- [x] CONTRIBUTING.md - Contributor guide
- [x] LIBRARY_SETUP.md - Complete setup guide
- [x] IMPROVEMENTS.md - Changelog

---

## Publishing Steps

### Step 1: Prepare for Publishing
```bash
# Update version in package.json
# Edit package.json and change: "version": "0.1.0" to desired version

# Update author info in package.json
# Update: "author": "Your Name <your.email@example.com>"
```

### Step 2: Build Library
```bash
npm run build:lib
```
Verify `dist/` folder contains:
- ✅ fountainjs.js
- ✅ fountainjs.cjs  
- ✅ fountainjs-react.js
- ✅ fountainjs-react.cjs
- ✅ *.d.ts files

### Step 3: Test Local Build
```bash
npm pack
# Creates fountainjs-0.1.0.tgz

# Test in another folder
mkdir test-project
cd test-project
npm init
npm install /path/to/fountainjs-0.1.0.tgz

# Try importing
node -e "const {createEditor} = require('@fountainjs/editor'); console.log('✅ Works!')"
```

### Step 4: Create npm Account
1. Go to https://www.npmjs.com/signup
2. Create account with:
   - Username
   - Email (verify it!)
   - Password
3. Save credentials securely

### Step 5: Login to npm
```bash
npm login
# Enter your npm username, password, and email
# npm will verify your email if needed

# Verify login
npm whoami
# Should output: yourusername
```

### Step 6: Publish
```bash
# For scoped packages, use --access public
npm publish --access public

# Watch for success message:
# npm notice Publishing to https://registry.npmjs.org/
# npm notice Package: @fountainjs/editor@0.1.0
```

### Step 7: Verify Publication
1. Check npm registry:
   ```
   https://www.npmjs.com/package/@fountainjs/editor
   ```

2. Test installation:
   ```bash
   mkdir another-test
   cd another-test
   npm init
   npm install @fountainjs/editor
   # Should download from npm!
   ```

3. Check your npm profile:
   ```bash
   npm profile get
   # Should show @fountainjs/editor in your packages
   ```

### Step 8: Create GitHub Release (Optional)
```bash
git tag v0.1.0
git push origin v0.1.0

# Then create release on GitHub with release notes
```

---

## Version Bumping for Future Releases

For subsequent updates:

1. **Bug fix**: 0.1.0 → 0.1.1
   ```bash
   npm version patch
   ```

2. **New feature**: 0.1.0 → 0.2.0
   ```bash
   npm version minor
   ```

3. **Breaking change**: 0.1.0 → 1.0.0
   ```bash
   npm version major
   ```

Then:
```bash
npm run build:lib
npm publish
git push origin --tags
```

---

## After Publishing

### Promote Your Library
- [ ] Add to GitHub awesome-list
- [ ] Tweet/share on social media
- [ ] Add to product hunt
- [ ] Write blog post about features
- [ ] Add examples to GitHub readme

### Maintain the Library
- [ ] Monitor issues on GitHub
- [ ] Respond to bug reports
- [ ] Review pull requests
- [ ] Keep dependencies updated
- [ ] Publish security fixes ASAP
- [ ] Document breaking changes

---

## Common Issues & Solutions

### "You do not have permission to publish"
**Solution**: 
- Login with correct npm account: `npm login`
- Check npm whoami: `npm whoami`
- Wait for email verification

### "Package name already taken"
**Solution**: 
- Choose different scoped name: `@myscope/editor`
- Or unscoped unique name: `fountainjs-pro`

### "Package is too large"
**Solution**:
- Check .npmignore excludes unnecessary files
- Remove examples folder from npm package
- Use `npm pack` to see what's included

### "npm ERR! 402 Payment Required"
**Solution**:
- npm requires paid plan for private packages
- Make package public: `npm publish --access public`

---

## What Users Will See

Once published, developers will see:

```bash
$ npm search fountainjs
NAME                      DESCRIPTION                       AUTHOR
@fountainjs/editor        A modular, extensible rich...     <you>
```

And they can install with:

```bash
npm install @fountainjs/editor
```

---

## Success Checklist ✨

After publishing successfully:
- [ ] Package visible on npm.com
- [ ] `npm install @fountainjs/editor` works
- [ ] TypeScript definitions work
- [ ] React bindings work: `from '@fountainjs/editor/react'`
- [ ] Vanilla JS imports work
- [ ] README displays on npm
- [ ] Keywords searchable

---

## Resources

- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Scoped Packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages)
- [Semantic Versioning](https://semver.org/)
- [npm Documentation](https://docs.npmjs.com/)

---

## Next Steps

1. ✅ Review this checklist
2. ✅ Update package.json with your info
3. ✅ Run `npm run build:lib`
4. ✅ Create npm account
5. ✅ Run `npm login`
6. ✅ Run `npm publish --access public`
7. ✅ Verify on npmjs.com

**Your library will be live!** 🚀

---

**Last Updated**: January 29, 2026  
**Status**: Ready for Publishing  
**Estimated Build Size**: ~30 KB gzipped
