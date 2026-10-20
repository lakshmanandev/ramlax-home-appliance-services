# Public site image sources

The service gallery is labelled as illustrative stock photography. These images are not represented as RamLaksh customer jobs. Replace them with authorized project photos when available.

The current image configuration is in `apps/web/src/App.tsx` (`applianceImages`). It uses Unsplash image CDN URLs with width and quality parameters for responsive file sizing:

- AC service illustration: `photo-1621905251918-48416bd8575a`
- TV illustration: `photo-1593359677879-a4bb92f829d1`
- Water purifier illustration: `photo-1662454378054-8613b673b11e`
- Washing machine illustration: `photo-1626806787461-102c1bfaaea1`

Unsplash states that images may be used free of charge for commercial and non-commercial purposes and that attribution is appreciated but not required. See the [Unsplash License](https://unsplash.com/license). The page links to the Unsplash image CDN directly; the image files are not bundled locally, so loading them depends on the CDN. Download and retain properly licensed local copies before launch if the site needs to work without a third-party image connection.

No genuine RamLaksh service photos were present in the repository during this upgrade.
