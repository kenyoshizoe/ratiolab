# RatioLab

A browser-based photo editor for aspect ratios, cropping, backgrounds, and EXIF captions.

## Features

- Fit or crop photos without resizing at 1x; adjust crops with corner handles.
- Original, 4:5, 3:4, 1:1, 9:16, and 16:9 output formats.
- EXIF camera logos, camera and lens names, and shooting settings.
- Text overlays, bottom gradients, white strips, and outside-photo captions.
- Batch image editing and PNG/ZIP export.
- Light and dark themes follow the operating system.

Photos are processed locally in the browser. The application does not upload them to a server.

## Development

Use Node.js 22 or newer.

```sh
npm ci
npm run dev
```

```sh
npm run build
npm run preview
```

## Deployment

Production: https://ratiolab.kenyo.dev

Pushes to `main` run `.github/workflows/deploy.yml`, which builds and deploys to Vercel. The workflow can also be run manually. Vercel Git-triggered deployments are disabled to avoid duplicate deployments.

Repository Actions secrets:

- `VERCEL_TOKEN`: deployment token scoped to this Vercel project.
- `VERCEL_ORG_ID`: Vercel team ID.
- `VERCEL_PROJECT_ID`: Vercel project ID.

Cloudflare manages the DNS-only CNAME for `ratiolab.kenyo.dev`; its target is supplied by the Vercel project's domain settings. No Cloudflare credentials are required for subsequent app deployments.

Logo provenance and the lens display-name lookup are documented in [ASSET-SOURCES.md](ASSET-SOURCES.md).
