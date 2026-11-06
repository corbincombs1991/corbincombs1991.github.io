#!/usr/bin/env python3
"""Collect public feeds and publish only news/data JSON to the website repo."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

STATE = Path(os.environ.get("NEWS_STATE", "/var/lib/news-digest"))
APP = Path(os.environ.get("NEWS_APP", "/opt/news-digest"))
REPO = STATE / "site"
ALLOWED = re.compile(r"news/data/(index\.json|archive/\d{4}-\d{2}\.json)\Z")


def git(*args, capture=False):
    return subprocess.run(["git", "-C", str(REPO), *args], check=True,
                          text=True, stdout=subprocess.PIPE if capture else None).stdout


def commit_pending():
    # This checkout belongs exclusively to this worker. Never stage site code.
    dirty = git("status", "--porcelain", "--untracked-files=all", capture=True)
    if any(line[:2] in {"DD", "AU", "UD", "UA", "DU", "AA", "UU"}
           for line in dirty.splitlines()):
        raise RuntimeError("Unresolved checkout conflict; refusing to publish")
    paths = [line[3:] for line in dirty.splitlines() if line]
    if any(not ALLOWED.fullmatch(path) for path in paths):
        raise RuntimeError("Unexpected checkout changes; refusing to publish")
    if not paths:
        return
    for path in paths:
        target = REPO / path
        if target.is_symlink():
            raise RuntimeError("Refusing a symlink in published news data")
    git("add", "--", "news/data")
    git("commit", "-m", "Update daily news archive")


def rebase():
    try:
        git("pull", "--rebase", "origin", "main")
    except subprocess.CalledProcessError:
        if any((REPO / ".git" / name).exists() for name in ("rebase-merge", "rebase-apply")):
            git("rebase", "--abort")
        raise


def main():
    STATE.mkdir(parents=True, exist_ok=True)
    with (STATE / "publish.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Recover an interrupted run, then incorporate other website edits.
        if any((REPO / ".git" / name).exists() for name in ("rebase-merge", "rebase-apply")):
            git("rebase", "--abort")
        commit_pending()
        rebase()
        output = STATE / "public"
        subprocess.run([sys.executable, str(APP / "collector.py"),
                        "--config", str(APP / "sources.json"),
                        "--database", str(STATE / "archive.sqlite3"),
                        "--output", str(output),
                        "--timezone", "America/Indiana/Indianapolis"], check=True)
        manifest = json.loads((output / "index.json").read_text())
        if manifest.get("schema_version") != 1 or not manifest.get("article_count"):
            raise RuntimeError("Refusing an empty or incompatible news publication")
        # Validate the whole release before touching the checkout; index goes last.
        files = [Path(m["url"]) for m in manifest["months"]] + [Path("index.json")]
        for relative in files:
            if not ALLOWED.fullmatch("news/data/" + relative.as_posix()):
                raise RuntimeError("Invalid archive path")
            source = output / relative
            dest = REPO / "news/data" / relative
            if source.is_symlink() or any(p.is_symlink() for p in [dest, *dest.parents]):
                raise RuntimeError("Refusing symlink destination")
            json.loads(source.read_text())
        for relative in files:
            source = output / relative
            dest = REPO / "news/data" / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            descriptor, temporary = tempfile.mkstemp(prefix=".news-", dir=STATE)
            try:
                with os.fdopen(descriptor, "wb") as handle, source.open("rb") as incoming:
                    shutil.copyfileobj(incoming, handle)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temporary, dest)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
        commit_pending()
        # A simultaneous website edit can race the push; rebase and retry once.
        try:
            git("push", "origin", "HEAD:main")
        except subprocess.CalledProcessError:
            rebase()
            git("push", "origin", "HEAD:main")
        print(json.dumps({"published_articles": manifest["article_count"],
                          "generated_at": manifest["generated_at"]}))


if __name__ == "__main__":
    main()
