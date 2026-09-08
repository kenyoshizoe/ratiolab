# Logo assets

All nine manufacturer logos are local SVG vector assets in `src/assets/`. The application does not fetch logos from external sites at runtime.

| Manufacturer | File | Source |
| --- | --- | --- |
| SONY | sony.svg | Simple Icons, installed package |
| Canon | canon.svg | https://global.canon/01cmn/img/common/logo.svg |
| Nikon | nikon.svg | Simple Icons, installed package |
| Fujifilm | fujifilm.svg | Simple Icons, installed package |
| LUMIX | lumix.svg | https://commons.wikimedia.org/wiki/File:Lumix_logo.svg (source: Panasonic DMC-GF1 spec sheet) |
| Leica | leica.svg | Simple Icons, installed package |
| RICOH | ricoh.svg | https://www.ricoh.com/-/Media/Ricoh/Common/cmn_g_header_footer/img/logo/logo.svg |
| DJI | dji.svg | Simple Icons, installed package |
| OM SYSTEM | om-system.svg | https://www.omsystem.com/assets/images/brand/om-system-logo-white.svg |

Canon and RICOH retain the wordmark paths from their official header SVGs, omitting surrounding text and decoration. OM SYSTEM uses black in place of white for visibility on the white EXIF strip; path geometry is unchanged. Simple Icons SVGs are copied verbatim; the package (https://simpleicons.org/) includes individual logo provenance and license metadata. All marks belong to their respective owners and identify the manufacturer recorded in the image EXIF.

EXIF `Panasonic` maps to LUMIX, and `OM Digital Solutions` maps to OM SYSTEM. Other manufacturer names use text fallback.

# EXIF

EXIF parsing uses `exifr`: https://github.com/MikeKovarik/exifr . Only Make, Model, LensMake, LensModel, FocalLength, FNumber, ExposureTime and ISO are requested. Parsing and composition run locally in the browser.

# Tests

Run `node --test tests/exif.test.mjs`. The PNG fixtures are generated solid-color images containing synthetic camera metadata, not user photos.

# Lens name lookup

`src/data/lens-makers.json` maps original EXIF lens names directly to display strings. Case, whitespace, and an existing manufacturer prefix are handled by the formatter. Unknown lenses retain their original names, and conflicting explicit `LensMake` values take precedence.

The SIGMA 18-50mm F2.8 DC DN | Contemporary 021 entry is verified against the official manual: https://www.sigma-global.com/en/support/download/18_50_28_dc_dn_c021_ver2.pdf . Its display string omits the 021 suffix.
