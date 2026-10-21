# Meridian website

The public website for Meridian, an AI development workspace by Mou-Hau Logic.

- Website: https://meridianwork.cn
- Responsive React landing page with native WebGPU quartz graphics and a local PNG fallback.
- Desktop and phone share one pinned scroll presentation, including project creation, handoff and review. Narrow and short windows retain the scroll animation and readable type. Document motion pauses on newly introduced task states; only reduced motion uses complete static chapters. Resizing preserves the active chapter and progress.
- The project workflow is a concept demonstration. Installers are not available yet.
- English, Chinese, Japanese and Korean content lives in `src/content/site.json`. First visits default to English; the language selector remembers an explicit choice locally.

## Development

Use the Node version in `.nvmrc` and npm 11.

```sh
npm ci --ignore-scripts
npm start
npm run verify
```

The current project demonstration is the default. `?demo=legacy` preserves the earlier workspace for regression checks.
`npm run test:webgpu` requires a graphical Chromium browser and a non-fallback GPU; it is a separate local validation.

## Deployment

GitHub Pages uses the pinned official Actions workflow in `.github/workflows/deploy.yml`.
Run **Publish website** manually on `main`. The workflow validates and builds the exact commit before deployment.
The custom domain is configured in repository Pages settings. The source repository contains no private App code or local validation media.

## Attribution

Originally based on Issaaf Kattan's React Landing Page Template, licensed under MIT; see `LICENSE`.
Third-party asset licenses and notices are in `public/licenses/`. Technology and repository logos identify references, not partnerships.
The Meridian wordmark uses modified Roboto Slab outlines; its Apache-2.0 license and modification notice are retained.
