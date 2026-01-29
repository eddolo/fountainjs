# Paolo Cappuccini Portfolio - Deployment Guide

## What We Built
A professional portfolio website for Paolo Cappuccini (UX Designer & Developer) featuring:
- ✅ Hero section with gradient background
- ✅ About section
- ✅ Skills grid (Design, Frontend, Backend)
- ✅ **Interactive FountainJS Editor Demo** - showcasing the library
- ✅ Featured projects portfolio
- ✅ Contact section
- ✅ Responsive design
- ✅ Professional animations and styling

## Quick Start (Local)
```bash
cd Test1
npm install
npm run dev
```
Visit: http://localhost:5173/

## Deploy to Vercel (FREE & EASIEST)

### Step 1: Initialize Git
```bash
cd Fountainjs-App
git init
git add .
git commit -m "Initial commit - FountainJS library with Test1 portfolio"
```

### Step 2: Create GitHub Repository
1. Go to https://github.com/new
2. Create a new repository named `fountainjs-editor`
3. Push your code:
```bash
git remote add origin https://github.com/YOUR_USERNAME/fountainjs-editor.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy to Vercel
1. Go to https://vercel.com
2. Click "New Project"
3. Select your GitHub repository
4. Configure:
   - **Root Directory**: `Test1`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Click "Deploy"

**That's it! Your site is live in 2 minutes! 🚀**

Vercel gives you a URL like: `https://fountainjs-editor.vercel.app`

## Deploy to GitHub Pages (ALSO FREE)

### Step 1: Build the project
```bash
cd Test1
npm run build
```

### Step 2: Configure for GitHub Pages
Update `Test1/vite.config.ts`:
```typescript
export default defineConfig({
  base: '/fountainjs-editor/', // Your repo name
  // ... rest of config
});
```

### Step 3: Deploy
```bash
cd Test1
npm run build
git add dist/
git commit -m "Deploy to GitHub Pages"
git push origin main
```

Then in GitHub Settings → Pages → Select "main" branch, "/docs" folder

## Alternative: Deploy to Netlify

1. Go to https://app.netlify.com
2. Drag and drop the `Test1/dist` folder
3. Your site is live instantly!

## Environment & Build Details

**Project Structure:**
- `FountainJS-App/` - Main library (TypeScript, React)
  - `src/` - Library source code
  - `dist/` - Built library (ready to publish to npm)
  
- `FountainJS-App/Test1/` - Portfolio website (React + Vite)
  - `src/App.tsx` - Main portfolio component
  - `src/index.css` - Styling
  - `vite.config.ts` - Build config with FountainJS aliases

**Build Output:**
- Test1 builds to `Test1/dist/` folder
- Contains optimized HTML, CSS, JS files
- Ready to serve from any web server

## After Deployment

Your live website will showcase:
1. **Paolo's Professional Brand** - Hero section with gradient design
2. **FountainJS Capabilities** - Interactive editor demo with toolbar
3. **Project Portfolio** - 6 featured projects
4. **Contact Information** - Ways to reach Paolo

## Next Steps

1. **Customize for Real Use:**
   - Update Paolo's actual contact info in App.tsx
   - Add real project images and descriptions
   - Change social media links
   - Add your own domain (Vercel supports custom domains)

2. **Publish FountainJS to npm:**
   ```bash
   npm login
   npm publish --access=public
   ```
   Then update Test1 to use the npm package instead of local file path

3. **Share Your Work:**
   - Share the live URL in your portfolio
   - Add it to your resume
   - Show it to potential clients/employers

## Support

The website is fully responsive and works on:
- ✅ Desktop browsers
- ✅ Tablets
- ✅ Mobile phones

Professional features:
- ✅ Fast loading times
- ✅ SEO-friendly
- ✅ Production-ready
- ✅ Enterprise-grade editor demo
