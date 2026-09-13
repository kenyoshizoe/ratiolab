# RatioLab

A browser-based photo editor for aspect ratios, cropping, backgrounds, and EXIF captions.

## Features

- Fit or crop photos without resizing at 1x; adjust crops with corner handles.
- Original, 4:5, 3:4, L print (89:127), 1:1, 9:16, and 16:9 output formats.
- EXIF camera logos, camera and lens names, shooting settings, and capture date/time.
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

The Vercel project is connected to this repository. Pushes to `main` deploy to
production, and pull requests get preview deployments. No GitHub Actions secrets
are needed.

Cloudflare manages the DNS-only CNAME for `ratiolab.kenyo.dev`; its target is
supplied by the Vercel project's domain settings.

Logo provenance and the lens display-name lookup are documented in [ASSET-SOURCES.md](ASSET-SOURCES.md).
