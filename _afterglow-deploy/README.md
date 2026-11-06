# Afterglow Vintage deployment

Production: <https://corbincombs.com/afterglowvintage/>

Original design: <https://corbincombs.com/afterglowvintage-original/>

90s web design: <https://corbincombs.com/afterglowvintage-90s/>

The custom domain has one GitHub Pages deployment. Its existing repository is
`corbincombs1991/corbincombs1991.github.io`, published from `main` at `/` using
GitHub's branch-based Pages build. `CNAME` remains `corbincombs.com`, and HTTPS
remains enabled. No Pages source, custom-domain, root sitemap, homepage, or
existing content configuration is changed by this integration.

## Layout

- `_afterglow/` contains the current Astro source and locked dependencies.
  `_afterglow-original/` independently preserves the original design, and
  `_afterglow-90s/` contains the 90s web design. Jekyll excludes these
  underscore-prefixed directories from the published domain.
- `_afterglow-deploy/` contains deployment tooling and this document and is also
  excluded from publication.
- `afterglowvintage/` contains only compiled static output. It is committed to the
  same branch as the existing domain and published alongside every existing page.
- `afterglowvintage-original/` contains the original design's compiled static output.
- `afterglowvintage-90s/` contains the 90s web design's compiled static output.
- Astro uses `site: 'https://corbincombs.com'`, `base: '/afterglowvintage'`, static
  output, directory routes with trailing slashes, and an `assets` output folder.
  The non-underscore asset name is required by the existing Jekyll publishing path.
  The original design uses the same settings with `base: '/afterglowvintage-original'`.
  The 90s web design uses `base: '/afterglowvintage-90s'`.

## Build and publish

Use Node.js 24:

```sh
node --test _afterglow-deploy/sync.test.mjs
npm ci --prefix _afterglow
npm run build --prefix _afterglow
node _afterglow-deploy/verify.mjs
node _afterglow-deploy/sync.mjs

npm ci --prefix _afterglow-original
npm run build --prefix _afterglow-original
AFTERGLOW_VARIANT=original node _afterglow-deploy/verify.mjs
AFTERGLOW_VARIANT=original node _afterglow-deploy/sync.mjs

npm ci --prefix _afterglow-90s
npm run build --prefix _afterglow-90s
AFTERGLOW_VARIANT=retro node _afterglow-deploy/verify.mjs
AFTERGLOW_VARIANT=retro node _afterglow-deploy/sync.mjs
```

The tooling defaults to `AFTERGLOW_VARIANT=current`. The other accepted values
are `original` and `retro`; source and output paths are fixed in an allowlist. Each sync
protects all tracked files outside its selected published directory, including
the other Afterglow designs.

Commit source changes and the corresponding generated output directories. Future pushes
affecting any source directory or deployment tooling automatically
run `.github/workflows/afterglow-publish.yml`. Pull requests build and validate
without publishing. The workflow can also be run manually on `main`.

The workflow builds and validates all three designs in parallel, then uses one publish
job for the shared domain. That job starts from current `main`, ignores builds
superseded by changes to any source, confirms the existing Pages settings,
replaces only the three Afterglow output directories, and compares all other tracked
files byte-for-byte. It stages only the three generated directories and
uses a normal fast-forward push; it never force-pushes. A simultaneous push to
`main` can safely reject that push; rerun the workflow against current `main`.

GitHub documents that commits made with `GITHUB_TOKEN` do not automatically
trigger branch-based Pages builds. The workflow therefore explicitly calls
`POST /repos/{owner}/{repo}/pages/builds` with `pages: write`, waits for the exact
committed revision to build, and verifies production over HTTPS. It does not
create a second Pages deployment or change the existing publishing mechanism.

## Verification and rollback

```sh
node _afterglow-deploy/verify.mjs --production
AFTERGLOW_VARIANT=original node _afterglow-deploy/verify.mjs --production
AFTERGLOW_VARIANT=retro node _afterglow-deploy/verify.mjs --production
```

Verification checks every generated page's canonical URL, title, description,
internal navigation, and local assets. The production check directly requests
every generated route and asset, compares their response bytes with the compiled
files, and compares `/` with the unchanged root `index.html`. Static directory
routes support direct links and refreshes without a client-router fallback.
The shared Pages publisher runs all three production checks after the exact deployed
revision finishes building.

If a new release fails, revert only the relevant Afterglow source and generated
directory changes, then rerun the workflow. Existing site files and Pages settings
do not need modification. Workflow failures retain the previous published site
until GitHub successfully completes a subsequent build.

References:

- [GitHub Pages publishing sources and GITHUB_TOKEN behavior](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Request a GitHub Pages build and required Pages permission](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build)
