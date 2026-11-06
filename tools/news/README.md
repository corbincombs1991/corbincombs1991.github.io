# Daily news collector

A Python 3.9+ standard-library collector for the static `/news/` page. It fetches eight configured public RSS/Atom feeds, keeps up to eight new articles from each source per local calendar day, and retains article metadata and short source excerpts indefinitely in SQLite. It does not fetch article pages or call a paid model API.

```sh
python3 website/tools/news/collect.py \
  --config website/tools/news/sources.json \
  --database /var/lib/news-digest/news.sqlite3 \
  --output website/news/data \
  --timezone America/Indiana/Indianapolis
```

Keep the SQLite database and its WAL/SHM/lock files outside the published web root, and back them up. The public JSON archive is useful to readers but does not preserve feed validators or all operator state. Run the collector as an unprivileged account. Schedule execution with the server's systemd timer; the collector itself runs once and exits. The repository's deployment wrapper handles publication separately.

The collector uses HTTPS, pins connections to validated public DNS results, validates every redirect, verifies TLS, limits feed bodies to 2 MiB, uses connection and whole-request time limits, and sends conditional ETag/Last-Modified requests. Source descriptions and titles become plain text; only HTTP(S) article links are stored. XML entity declarations are rejected. A process lock prevents overlapping CLI runs.

Article IDs derive from canonical URLs. Known tracking parameters and fragments are removed; meaningful query parameters are retained. Reruns do not duplicate articles or exceed the daily cap. A URL shared by two feeds is stored under the first source that archived it. Archived titles, excerpts and metadata remain stable once stored. Months describe when an article was first collected, not necessarily when it was published; undated stories retain `published_at: null`.

Short source excerpts are limited to 65 words. `source_excerpt` indicates the available feed text fit the limit; `extractive` indicates an opening extract; `headline_only` means the feed did not provide a useful excerpt. Hacker News comment links are available separately as `discussion_url`. These are source excerpts, not AI-generated summaries or fact checking. The source selection can be changed in `sources.json`; Reddit is not configured.

`index.json` holds the latest 80 articles, the source health, total article count, summary method, last successful run, and monthly archive links. Every monthly archive holds all articles first collected in that month. Archives are replaced atomically only when their content changes; the index is written last. There is no pruning. Partial feed failures publish the successful sources plus the existing archive and visible per-source errors. If every source fails, the process exits nonzero and preserves all public JSON exactly; current failure state remains in SQLite for operators. A successful conditional `304` counts as a successful source check.

Offline checks:

```sh
python3 -m unittest discover -s website/tools/news/tests -v
```

To inspect local source health without exposing the private database:

```sh
sqlite3 /var/lib/news-digest/news.sqlite3 \
  'SELECT id,status,last_attempt_at,last_success_at,error FROM sources;'
```
