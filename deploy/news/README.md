# Daily News operations

The public page is <https://corbincombs.com/news/>. Proxmox collects public
RSS/Atom feeds each day; GitHub Pages serves the resulting static archive.
No public web server or inbound port is required on the worker.

## Installation

- Dedicated unprivileged Debian 13 LXC **119**, `news-digest`.
- One CPU, capped at 0.5 CPU; 256 MiB memory; no swap; 3 GiB ZFS root disk.
- Starts with Proxmox. No runtime dependency on the Mac or this chat.
- Python standard library only. Runtime packages: `python3`, `git`,
  `ca-certificates`, `openssh-client`.
- Code and source configuration: `/opt/news-digest/` (root-owned).
- Service account and persistent state: `/var/lib/news-digest/`.
- SQLite archive: `/var/lib/news-digest/archive.sqlite3`.
- Isolated website checkout: `/var/lib/news-digest/site`.
- Timer: `news-digest.timer`, daily **07:00 America/Indiana/Indianapolis**,
  with up to two minutes of jitter and missed-run catch-up after boot.
- Transient failed runs retry after 15 minutes, up to four starts in two hours.

The worker's private SSH key stays inside its home directory, mode 0600.
Its GitHub deploy key is restricted to the website repository and needs write
access to publish. The publisher stages only `news/data/index.json` and
`news/data/archive/YYYY-MM.json`; unexpected checkout changes stop the run.
GitHub host keys are pinned from GitHub's HTTPS metadata endpoint. No personal
GitHub token is installed on the server. Do not print or copy private keys.

## Content and retention

Sources live in `tools/news/sources.json`; the installed copy is
`/opt/news-digest/sources.json`. Defaults cover technology, AI, homelab, and world
headlines. Up to eight new items per source per local day enter the archive.
This is a daily selection: fast feeds may publish more than can be captured
by one daily poll.

Summaries are short extracts of publisher-supplied feed text, not AI rewrites
or summaries of full articles. Items without useful text are labeled headline
only. Source names, original links, and available dates are preserved.
Full articles and Reddit comments are not copied. Reddit is excluded because
its public RSS service is scheduled to end November 13, 2026.

There is no automatic expiry. SQLite retains collected entries; public JSON
is split into first-seen month archives and retained in the website repository.
The public search includes archived months, not just the latest issue. Expect
archive storage and browser search time to grow; monthly files keep routine
page loads bounded.

One failed feed does not erase old stories. Per-source health is visible on the
page. If all feeds fail, the collector exits unsuccessfully without replacing
the last good publication. The page flags an update more than 36 hours old.
Logs are local; this installation does not send email or chat alerts.

## Inspect or run now

From the Proxmox host:

```sh
pct exec 119 -- systemctl list-timers news-digest.timer
pct exec 119 -- systemctl show news-digest.service -p Result -p ExecMainStatus
pct exec 119 -- systemctl start news-digest.service
pct exec 119 -- journalctl -u news-digest.service -n 50 --no-pager
```

Do not run two writers concurrently; the publisher also holds a process lock.
GitHub Pages can take several minutes after a push to update the public page.

## Update or recover

Run `python3 -m unittest discover -s tools/news/tests -v` before shipping collector
changes and `node --check news/news.js` before shipping page changes.
Copy the collector and source configuration to `/opt/news-digest/` in guest 119;
copy `publish.py` there and the two units to `/etc/systemd/system/`. Keep code
root-owned and readable by the service user. After unit changes, run
`systemctl daemon-reload`. Page-only changes publish through the website's
normal GitHub Pages workflow and do not require a worker restart.

Keep the SQLite database when upgrading. Publication failures leave data in
SQLite and the worker's Git checkout for the next attempt. If a Git rebase
conflicts, stop the timer and resolve the isolated checkout before restarting.
Failed rebases are aborted automatically. If a killed Git process leaves
`.git/index.lock`, confirm that the service and all its Git processes are stopped
before removing that stale lock; then start the service again.
Never replace the entire live website with an older copy.

The repository contains a second copy of all published metadata. The guest
backup also includes SQLite and the deploy key; keep backup access private.
Restore the guest and check its timer and repository access before re-enabling
publishing. A successful backup is not a tested restore.

## Pause or remove

`systemctl disable --now news-digest.timer` inside 119 stops future updates;
the existing public archive remains readable. To retire the worker, disable
the timer, revoke the `news-digest-proxmox119` deploy key in the website
repository, and preserve the database before removing guest 119. Remove the
`/news/` files and homepage link in a normal website commit only if desired.
