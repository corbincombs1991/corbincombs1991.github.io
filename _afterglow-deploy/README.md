# Afterglow Vintage deployment

Production: <https://corbincombs.com/afterglowvintage/>

The custom domain has one GitHub Pages deployment. Its existing repository is
`corbincombs1991/corbincombs1991.github.io`, published from `main` at `/` using
GitHub's branch-based Pages build. `CNAME` remains `corbincombs.com`, and HTTPS
remains enabled. No Pages source, custom-domain, root sitemap, homepage, or
existing content configuration is changed by this integration.

## Layout

- `_afterglow/` contains the Astro source and locked dependencies. Jekyll excludes
  this underscore-prefixed directory from the published domain.
- `_afterglow-deploy/` contains deployment tooling and this document and is also
  excluded from publication.
- `afterglowvintage/` contains only compiled static output. It is committed to the
  same branch as the existing domain and published alongside every existing page.
- Astro uses `site: 'https://corbincombs.com'`, `base: '/afterglowvintage'`, static
  output, directory routes with trailing slashes, and an `assets` output folder.
  The non-underscore asset name is required by the existing Jekyll publishing path.

## Build and publish

Use Node.js 24:

```sh
npm ci --prefix _afterglow
npm run build --prefix _afterglow
node _afterglow-deploy/verify.mjs
node _afterglow-deploy/sync.mjs
```

Commit the source changes and generated `afterglowvintage/` output for the initial
deployment. Future pushes affecting source or deployment tooling automatically
run `.github/workflows/afterglow-publish.yml`. Pull requests build and validate
without publishing. The workflow can also be run manually on `main`.

The publish job starts from current `main`, ignores stale source builds, confirms
the existing Pages settings, replaces only `afterglowvintage/`, and compares all
other tracked files byte-for-byte. It stages only the generated directory and
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
```

Verification checks every generated page's canonical URL, title, description,
internal navigation, and local assets. The production check directly requests
every generated route and asset, compares their response bytes with the compiled
files, and compares `/` with the unchanged root `index.html`. Static directory
routes support direct links and refreshes without a client-router fallback.

If a new release fails, revert only the relevant Afterglow source and generated
directory changes, then rerun the workflow. Existing site files and Pages settings
do not need modification. Workflow failures retain the previous published site
until GitHub successfully completes a subsequent build.

References:

- [GitHub Pages publishing sources and GITHUB_TOKEN behavior](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Request a GitHub Pages build and required Pages permission](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build)
