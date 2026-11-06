#!/usr/bin/env python3
"""Collect bounded public RSS/Atom feeds into SQLite and static JSON. Python 3.9+."""

from __future__ import annotations

import argparse
import datetime as dt
import email.utils
import fcntl
import hashlib
from html.parser import HTMLParser
import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import sqlite3
import ssl
import sys
import tempfile
import time
from typing import Callable
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

UTC = dt.timezone.utc
MAX_FEED_BYTES = 2 * 1024 * 1024
HTTP_TIMEOUT = 15
TOTAL_TIMEOUT = 45
MAX_REDIRECTS = 5
USER_AGENT = "CorbinDaily/1.0 (+https://corbincombs.com/news/)"
SUMMARY_METHOD = (
    "Short extracts from publisher feeds, up to 65 words. These are not AI-written "
    "summaries or independently verified reporting. Some feeds provide headlines only."
)
TRACKING_KEYS = {"fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid", "ref_src", "ref_url", "_ga", "_gl"}
ATOM = "{http://www.w3.org/2005/Atom}"


class FeedError(Exception):
    """An operator-safe failure message; never includes remote response content."""


def iso(value: dt.datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def canonical_url(value: str, base: str = "") -> str | None:
    """Normalize article URLs and remove known tracking parameters, never identity args."""
    try:
        value = urljoin(base, value.strip())
        if any(ord(ch) < 32 or ord(ch) == 127 for ch in value):
            return None
        parts = urlsplit(value)
        if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
            return None
        if parts.username is not None or parts.password is not None:
            return None
        host = parts.hostname.lower().encode("idna").decode("ascii")
        if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
            return None
        try:
            if not ipaddress.ip_address(host).is_global:
                return None
        except ValueError:
            pass
        port = parts.port
        if ":" in host:
            host = f"[{host}]"
        if port and port != (443 if parts.scheme.lower() == "https" else 80):
            host += f":{port}"
        query = urlencode([(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
                           if not k.lower().startswith("utm_") and k.lower() not in TRACKING_KEYS])
        return urlunsplit((parts.scheme.lower(), host, parts.path or "/", query, ""))
    except (ValueError, UnicodeError):
        return None


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.chunks: list[str] = []
        self.links: list[str] = []
        self.ignored: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript", "iframe", "svg"}:
            self.ignored.append(tag)
        if self.ignored:
            return
        if tag == "a":
            self.links.extend(v for k, v in attrs if k == "href" and v)
        if tag in {"br", "p", "div", "li", "h1", "h2", "h3", "hr"}:
            self.chunks.append(" ")

    def handle_endtag(self, tag):
        if self.ignored:
            if tag == self.ignored[-1]:
                self.ignored.pop()
            return
        if tag in {"p", "div", "li", "h1", "h2", "h3"}:
            self.chunks.append(" ")

    def handle_data(self, data):
        if not self.ignored:
            self.chunks.append(data)


def clean_text(value: str) -> str:
    parser = PlainText()
    parser.feed(value[:MAX_FEED_BYTES])
    text = "".join(parser.chunks)
    text = "".join(ch for ch in text if ch in "\n\t" or ord(ch) >= 32)
    return re.sub(r"\s+", " ", text).strip()


def make_summary(value: str, title: str) -> tuple[str, str]:
    text = clean_text(value)
    text = re.sub(r"\s*(?:Read (?:more|the full (?:article|story))\.?|Continue reading[.…]*)\s*$", "", text, flags=re.I)
    # HN and Reddit metadata are not article summaries.
    if not text or text.casefold() == title.casefold() or re.fullmatch(r"(?:\[?comments?\]?|\[?link\]?|\s)+", text, re.I):
        return "", "headline_only"
    if re.match(r"^submitted by\b", text, re.I):
        return "", "headline_only"
    words = text.split()
    if len(words) < 5:
        return "", "headline_only"
    if len(words) <= 65:
        return text, "source_excerpt"
    excerpt = " ".join(words[:65])
    # Prefer an intact opening sentence if it uses a useful part of the word budget.
    sentence_ends = list(re.finditer(r"[.!?](?:[\"'’”])?(?=\s|$)", excerpt))
    for end in reversed(sentence_ends):
        if len(excerpt[:end.end()].split()) >= 30:
            return excerpt[:end.end()], "extractive"
    return excerpt.rstrip(",;:—-") + "…", "extractive"


def parse_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        result = email.utils.parsedate_to_datetime(value.strip())
    except (TypeError, ValueError, OverflowError):
        try:
            result = dt.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except (ValueError, OverflowError):
            return None
    # An absent timezone is unknown, rather than silently assuming the publisher is UTC.
    if result.tzinfo is None:
        return None
    try:
        return iso(result)
    except (ValueError, OverflowError):
        return None


def element_value(node: ET.Element | None) -> str:
    if node is None:
        return ""
    return (node.text or "") + "".join(ET.tostring(child, encoding="unicode") for child in node)


def first_element(node: ET.Element, names: tuple[str, ...]) -> ET.Element | None:
    for name in names:
        found = node.find(name)
        if found is not None:
            return found
    return None


def parse_feed(body: bytes, base_url: str) -> list[dict]:
    if len(body) > MAX_FEED_BYTES:
        raise FeedError("Feed exceeds size limit")
    if b"\x00" in body or re.search(br"<!\s*(?:DOCTYPE|ENTITY)\b", body, re.I):
        raise FeedError("XML declarations are not supported")
    try:
        root = ET.fromstring(body)
    except ET.ParseError as exc:
        raise FeedError("Feed is not valid XML") from exc
    is_atom = root.tag == ATOM + "feed"
    if is_atom:
        items = root.findall(ATOM + "entry")
    elif root.tag == "rss":
        if root.find("channel") is None:
            raise FeedError("RSS feed has no channel")
        items = root.findall("channel/item")
    elif root.tag == "{http://www.w3.org/1999/02/22-rdf-syntax-ns#}RDF":
        items = root.findall("{http://purl.org/rss/1.0/}item")
    else:
        raise FeedError("Response is not an RSS or Atom feed")
    records = []
    for item in items[:3000]:
        prefix = ATOM if is_atom else ("{http://purl.org/rss/1.0/}" if item.tag.startswith("{") else "")
        title = clean_text(element_value(item.find(prefix + "title")))[:500]
        if is_atom:
            links = item.findall(ATOM + "link")
            link = next((node.get("href", "") for node in links
                         if node.get("rel", "alternate") == "alternate"
                         and node.get("type", "text/html") in {"text/html", "application/xhtml+xml"}), "")
            content = element_value(first_element(item, (ATOM + "summary", ATOM + "content")))
            date = element_value(first_element(item, (ATOM + "published", ATOM + "updated")))
        else:
            link = element_value(item.find(prefix + "link"))
            content = element_value(first_element(item, (prefix + "description", "{http://purl.org/rss/1.0/modules/content/}encoded")))
            date = element_value(first_element(item, ("pubDate", "{http://purl.org/dc/elements/1.1/}date")))
        url = canonical_url(link, base_url) if link.strip() else None
        if not title or not url:
            continue
        summary, kind = make_summary(content, title)
        article = {"id": hashlib.sha256(url.encode()).hexdigest()[:24], "title": title, "url": url,
                   "published_at": parse_date(date), "summary": summary, "summary_kind": kind}
        html_parser = PlainText()
        html_parser.feed(content)
        discussion_links = [element_value(item.find("comments"))] + html_parser.links
        for candidate in discussion_links:
            discussion = canonical_url(candidate, base_url) if candidate else None
            if discussion:
                parts = urlsplit(discussion)
                if (parts.hostname == "news.ycombinator.com" and parts.path == "/item"
                        or parts.hostname in {"reddit.com", "www.reddit.com", "old.reddit.com"} and "/comments/" in parts.path):
                    article["discussion_url"] = discussion
                    break
        records.append(article)
    # Stable sort retains the publisher's ordering for undated entries.
    records.sort(key=lambda item: item["published_at"] or "", reverse=True)
    return records


def validate_feed_target(url: str, resolver=socket.getaddrinfo) -> tuple[str, int, str, list[str]]:
    canonical = canonical_url(url)
    if not canonical:
        raise FeedError("Feed URL is invalid")
    parts = urlsplit(canonical)
    if parts.scheme != "https" or parts.port not in {None, 443}:
        raise FeedError("Feeds must use HTTPS on port 443")
    host = parts.hostname
    try:
        addresses = list(dict.fromkeys(result[4][0] for result in resolver(host, 443, type=socket.SOCK_STREAM)))
    except OSError as exc:
        raise FeedError("Feed hostname could not be resolved") from exc
    if not addresses or any(not ipaddress.ip_address(ip).is_global for ip in addresses):
        raise FeedError("Feed hostname must resolve only to public addresses")
    path = parts.path or "/"
    if parts.query:
        path += "?" + parts.query
    return host, 443, path, addresses


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    """Connect to the validated IP while authenticating TLS against the original host."""
    def __init__(self, host, address, timeout):
        super().__init__(host, port=443, timeout=timeout, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        raw = socket.create_connection((self.address, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
        except Exception:
            raw.close()
            raise


def fetch_feed(url: str, etag: str | None = None, last_modified: str | None = None) -> dict:
    deadline = time.monotonic() + TOTAL_TIMEOUT
    headers = {"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9", "Accept-Encoding": "identity"}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified
    for redirect in range(MAX_REDIRECTS + 1):
        host, port, path, addresses = validate_feed_target(url)
        if time.monotonic() >= deadline:
            raise FeedError("Feed request timed out")
        connection = None
        response = None
        for address in addresses:
            try:
                connection = PinnedHTTPSConnection(host, address, min(HTTP_TIMEOUT, max(0.1, deadline - time.monotonic())))
                connection.request("GET", path, headers=headers)
                response = connection.getresponse()
                break
            except (OSError, http.client.HTTPException) as exc:
                if connection:
                    connection.close()
                if address == addresses[-1] or time.monotonic() >= deadline:
                    raise FeedError("Feed connection failed") from exc
        try:
            if response.status in {301, 302, 303, 307, 308}:
                location = response.getheader("Location")
                if not location or redirect == MAX_REDIRECTS:
                    raise FeedError("Feed redirect limit exceeded")
                url = urljoin(url, location)
                # A changed host must not inherit conditional validators.
                if urlsplit(url).hostname != host:
                    headers.pop("If-None-Match", None)
                    headers.pop("If-Modified-Since", None)
                continue
            if response.status not in {200, 304}:
                raise FeedError(f"Feed returned HTTP {response.status}")
            result = {"status": response.status, "etag": response.getheader("ETag"),
                      "last_modified": response.getheader("Last-Modified"), "url": url, "body": b""}
            if response.status == 304:
                return result
            if response.getheader("Content-Encoding", "identity").lower() not in {"identity", ""}:
                raise FeedError("Feed returned an unsupported content encoding")
            length = response.getheader("Content-Length")
            if length and length.isdigit() and int(length) > MAX_FEED_BYTES:
                raise FeedError("Feed exceeds size limit")
            chunks, size = [], 0
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise FeedError("Feed request timed out")
                # HTTPResponse may own the socket after Connection: close.
                if connection.sock:
                    connection.sock.settimeout(min(HTTP_TIMEOUT, remaining))
                chunk = response.read1(min(65536, MAX_FEED_BYTES + 1 - size))
                if not chunk:
                    break
                chunks.append(chunk)
                size += len(chunk)
                if size > MAX_FEED_BYTES:
                    raise FeedError("Feed exceeds size limit")
            result["body"] = b"".join(chunks)
            return result
        except (OSError, http.client.HTTPException) as exc:
            raise FeedError("Feed response could not be read") from exc
        finally:
            if response:
                response.close()
            if connection:
                connection.close()
    raise FeedError("Feed redirect limit exceeded")


def load_config(path: Path) -> dict:
    config = json.loads(path.read_text())
    sources = config.get("sources", [])
    if not isinstance(sources, list) or not sources:
        raise ValueError("Config needs a nonempty sources array")
    ids = set()
    for source in sources:
        if not isinstance(source, dict) or not all(isinstance(source.get(k), str) and source[k] for k in ("id", "name", "category", "url", "feed_url")):
            raise ValueError("Each source needs id, name, category, url and feed_url")
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", source["id"]) or source["id"] in ids:
            raise ValueError("Source IDs must be unique lowercase slugs")
        ids.add(source["id"])
        if not canonical_url(source["url"]) or not source["feed_url"].startswith("https://"):
            raise ValueError("Invalid source URL")
        if source["category"] not in {"Tech", "AI", "Homelab", "Headlines"}:
            raise ValueError("Unknown source category")
    for key, default, maximum in (("max_items_per_source_per_day", 8, 50), ("latest_limit", 80, 500)):
        value = config.get(key, default)
        if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= maximum:
            raise ValueError(f"{key} must be between 1 and {maximum}")
        config[key] = value
    config.setdefault("schedule", "Daily at 7:00 AM Eastern")
    return config


def open_database(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS articles (
          id TEXT PRIMARY KEY, canonical_url TEXT NOT NULL UNIQUE, source_id TEXT NOT NULL,
          first_seen_at TEXT NOT NULL, ingest_day TEXT NOT NULL, archive_month TEXT NOT NULL,
          article_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS articles_daily ON articles(source_id, ingest_day);
        CREATE TABLE IF NOT EXISTS sources (
          id TEXT PRIMARY KEY, feed_url TEXT NOT NULL, status TEXT NOT NULL,
          last_attempt_at TEXT NOT NULL, last_success_at TEXT, error TEXT,
          etag TEXT, last_modified TEXT
        );
        CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    """)
    return connection


def atomic_json(path: Path, value: dict) -> bool:
    body = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == body:
        return False
    descriptor, temporary = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(body)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return True


def render(connection: sqlite3.Connection, config: dict, output: Path, timezone: str, now: dt.datetime):
    rows = connection.execute("SELECT archive_month, article_json FROM articles").fetchall()
    by_month: dict[str, list] = {}
    articles = []
    for row in rows:
        article = json.loads(row["article_json"])
        articles.append(article)
        by_month.setdefault(row["archive_month"], []).append(article)
    sort_key = lambda article: (article["published_at"] or article["first_seen_at"], article["first_seen_at"], article["id"])
    articles.sort(key=sort_key, reverse=True)
    months = []
    for month in sorted(by_month, reverse=True):
        monthly = sorted(by_month[month], key=sort_key, reverse=True)
        atomic_json(output / "archive" / (month + ".json"), {"month": month, "articles": monthly})
        months.append({"month": month, "url": f"archive/{month}.json", "count": len(monthly)})
    health = []
    for source in config["sources"]:
        state = connection.execute("SELECT * FROM sources WHERE id=?", (source["id"],)).fetchone()
        entry = {k: source[k] for k in ("id", "name", "category", "url")}
        entry.update(status=state["status"], last_success_at=state["last_success_at"])
        if state["error"]:
            entry["error"] = state["error"]
        health.append(entry)
    last_success = connection.execute("SELECT value FROM metadata WHERE key='last_successful_run'").fetchone()
    # Write the manifest last, so it never points at an archive that is not present.
    atomic_json(output / "index.json", {"schema_version": 1, "generated_at": iso(now),
        "last_successful_run": last_success[0] if last_success else None,
        "timezone": timezone, "schedule": config["schedule"], "article_count": len(articles),
        "latest": articles[:config["latest_limit"]], "months": months, "sources": health,
        "summary_method": SUMMARY_METHOD})


def run(config: dict, database: Path, output: Path, timezone: str,
        fetcher: Callable = fetch_feed, now: dt.datetime | None = None) -> dict:
    now = now or dt.datetime.now(UTC)
    zone = ZoneInfo(timezone)
    local_day = now.astimezone(zone).date().isoformat()
    month = local_day[:7]
    attempted = iso(now)
    connection = open_database(database)
    successes, inserted, failures = 0, 0, 0
    try:
        for source in config["sources"]:
            state = connection.execute("SELECT * FROM sources WHERE id=?", (source["id"],)).fetchone()
            same_url = state and state["feed_url"] == source["feed_url"]
            previous_success = state["last_success_at"] if same_url else None
            etag = state["etag"] if same_url else None
            last_modified = state["last_modified"] if same_url else None
            status, error = "ok", None
            try:
                response = fetcher(source["feed_url"], etag, last_modified)
                if response["status"] == 304:
                    if not previous_success:
                        raise FeedError("Feed returned 304 without a previous successful fetch")
                    status = "unchanged"
                elif response["status"] == 200:
                    records = parse_feed(response["body"], response.get("url", source["feed_url"]))
                    used = connection.execute("SELECT count(*) FROM articles WHERE source_id=? AND ingest_day=?", (source["id"], local_day)).fetchone()[0]
                    available = max(0, config.get("max_items_per_source_per_day", 8) - used)
                    for article in records:
                        if available <= 0:
                            break
                        if connection.execute("SELECT 1 FROM articles WHERE canonical_url=?", (article["url"],)).fetchone():
                            continue
                        article.update(source_id=source["id"], source=source["name"], category=source["category"], first_seen_at=attempted)
                        connection.execute("INSERT INTO articles VALUES (?, ?, ?, ?, ?, ?, ?)",
                            (article["id"], article["url"], source["id"], attempted, local_day, month, json.dumps(article, ensure_ascii=False)))
                        inserted += 1
                        available -= 1
                    etag = response.get("etag")
                    last_modified = response.get("last_modified")
                else:
                    raise FeedError("Unexpected feed response")
                previous_success = attempted
                successes += 1
            except FeedError as exc:
                status, error = "error", str(exc)[:160]
                failures += 1
            except (OSError, ValueError, http.client.HTTPException) as exc:
                status, error = "error", "Feed processing failed"
                failures += 1
            connection.execute("""INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET feed_url=excluded.feed_url, status=excluded.status,
                last_attempt_at=excluded.last_attempt_at, last_success_at=excluded.last_success_at,
                error=excluded.error, etag=excluded.etag, last_modified=excluded.last_modified""",
                (source["id"], source["feed_url"], status, attempted, previous_success, error, etag, last_modified))
            connection.commit()
            print(f"{source['id']}: {status}" + (f" ({error})" if error else ""), file=sys.stderr)
        if not successes:
            raise FeedError("All sources failed; last good public data was preserved")
        connection.execute("INSERT INTO metadata VALUES ('last_successful_run', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (attempted,))
        connection.commit()
        render(connection, config, output, timezone, now)
        return {"inserted": inserted, "successful_sources": successes, "failed_sources": failures}
    finally:
        connection.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("sources.json"))
    parser.add_argument("--database", type=Path, required=True, help="Private durable SQLite path, outside the public web root")
    parser.add_argument("--output", type=Path, required=True, help="Public news/data directory")
    parser.add_argument("--timezone", default="America/Indiana/Indianapolis")
    args = parser.parse_args()
    try:
        config = load_config(args.config)
        args.database.parent.mkdir(parents=True, exist_ok=True)
        with open(str(args.database) + ".lock", "a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise FeedError("Another collector run is already active") from exc
            result = run(config, args.database, args.output, args.timezone)
        print(json.dumps(result))
        return 0
    except (FeedError, ValueError, OSError, sqlite3.Error, KeyError) as exc:
        print(f"Collection failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
