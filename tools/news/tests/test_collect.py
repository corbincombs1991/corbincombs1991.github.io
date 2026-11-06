"""Offline tests: parsing, URL safety, durability, failure handling, and daily caps."""

import datetime as dt
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("collect", Path(__file__).parents[1] / "collect.py")
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
NOW = dt.datetime(2026, 11, 6, 12, tzinfo=dt.timezone.utc)


def rss(items):
    return ("<rss version='2.0'><channel>" + "".join(items) + "</channel></rss>").encode()


def item(number, date=True):
    published = f"<pubDate>Fri, 06 Nov 2026 {number:02d}:00:00 GMT</pubDate>" if date else ""
    return f"<item><title>Story {number}</title><link>https://example.com/{number}?utm_source=rss#top</link>{published}<description>A source excerpt with enough words to describe this story accurately.</description></item>"


def config(count=1, cap=8):
    return {"max_items_per_source_per_day": cap, "latest_limit": 80,
            "schedule": "Daily at 7:00 AM Eastern", "sources": [
                {"id": f"source-{i}", "name": f"Source {i}", "category": "Tech",
                 "url": f"https://example.com/{i}", "feed_url": f"https://example.com/feed{i}"}
                for i in range(count)]}


def fetched(body):
    return {"status": 200, "body": body, "etag": '"v1"', "last_modified": "Fri, 06 Nov 2026 12:00:00 GMT"}


class ParsingTests(unittest.TestCase):
    def test_rss_sanitizes_html_and_dedup_url(self):
        document = rss(["""<item><title><![CDATA[A <b>great</b> story]]></title>
          <link>https://EXAMPLE.com/post?utm_source=feed&amp;id=7&amp;fbclid=foo#comments</link>
          <pubDate>Fri, 06 Nov 2026 07:00:00 -0500</pubDate>
          <description><![CDATA[<p>Actual reporting with <b>enough words</b> to summarize here.</p><script>steal()</script>]]></description></item>"""])
        article = c.parse_feed(document, "https://example.com/feed")[0]
        self.assertEqual(article["title"], "A great story")
        self.assertEqual(article["url"], "https://example.com/post?id=7")
        self.assertEqual(article["published_at"], "2026-11-06T12:00:00Z")
        self.assertNotIn("steal", article["summary"])
        self.assertNotIn("<", article["summary"])

    def test_atom_relative_link_xhtml_and_missing_dates(self):
        body = b'''<feed xmlns="http://www.w3.org/2005/Atom"><entry>
          <title>Atom story</title><link rel="self" href="/entry.xml"/>
          <link rel="alternate" href="/story"/><summary type="xhtml">
          <div xmlns="http://www.w3.org/1999/xhtml">Useful source content with <b>several words</b> about the story.</div>
          </summary></entry></feed>'''
        article = c.parse_feed(body, "https://example.com/feed.xml")[0]
        self.assertEqual(article["url"], "https://example.com/story")
        self.assertIsNone(article["published_at"])
        self.assertIn("Useful source content", article["summary"])
        self.assertNotIn("<", article["summary"])

    def test_hacker_news_comments_are_not_summary(self):
        body = rss(["""<item><title>A useful project</title><link>https://example.com/project</link>
          <description><![CDATA[<a href="https://news.ycombinator.com/item?id=123">Comments</a>]]></description></item>"""])
        article = c.parse_feed(body, "https://news.ycombinator.com/rss")[0]
        self.assertEqual(article["summary_kind"], "headline_only")
        self.assertEqual(article["summary"], "")
        self.assertEqual(article["discussion_url"], "https://news.ycombinator.com/item?id=123")

    def test_excerpt_bounded_without_fabrication(self):
        source = " ".join(f"word{i}" for i in range(100))
        summary, kind = c.make_summary(source, "title")
        self.assertEqual(kind, "extractive")
        self.assertEqual(len(summary.split()), 65)
        self.assertTrue(source.startswith(summary.rstrip("…")))

    def test_missing_or_invalid_dates_remain_unknown(self):
        for value in (None, "", "not-a-date", "2026-11-06T12:30:00", "2026-11-06"):
            self.assertIsNone(c.parse_date(value))
        self.assertEqual(c.parse_date("2026-11-06T07:00:00-05:00"), "2026-11-06T12:00:00Z")

    def test_invalid_xml_and_entities_are_rejected(self):
        for body in (b"<html></html>", b"<rss>", b'<!DOCTYPE rss [<!ENTITY x "hello">]><rss><channel/></rss>'):
            with self.assertRaises(c.FeedError):
                c.parse_feed(body, "https://example.com/feed")

    def test_missing_links_and_unsafe_protocols_are_skipped(self):
        body = rss(["<item><title>No link</title></item>", "<item><title>Script</title><link>javascript:alert(1)</link></item>"])
        self.assertEqual(c.parse_feed(body, "https://example.com/feed"), [])


class SafetyTests(unittest.TestCase):
    def test_url_normalization_preserves_identity(self):
        self.assertEqual(c.canonical_url("https://EXAMPLE.com:443/x?utm_medium=feed&amp=keep&id=42#foo"), "https://example.com/x?amp=keep&id=42")
        for url in ("javascript:alert(1)", "https://user:pass@example.com/", "http://127.0.0.1/", "https://[::1]/", "https://host.local/", "https://example.com/\nfoo"):
            self.assertIsNone(c.canonical_url(url))

    def test_feed_targets_require_public_https(self):
        def resolver(host, port, type):
            return [(2, 1, 6, "", ("93.184.216.34", port))]
        self.assertEqual(c.validate_feed_target("https://example.com/rss", resolver)[2], "/rss")
        for url in ("http://example.com/rss", "https://example.com:8443/rss", "https://localhost/rss"):
            with self.assertRaises(c.FeedError):
                c.validate_feed_target(url, resolver)
        def private(host, port, type):
            return [(2, 1, 6, "", ("10.0.0.1", port))]
        with self.assertRaises(c.FeedError):
            c.validate_feed_target("https://example.com/rss", private)

    def test_redirect_to_private_target_is_blocked_before_connect(self):
        class Response:
            status = 302
            def getheader(self, name, default=None):
                return "https://127.0.0.1/secret" if name == "Location" else default
            def close(self):
                pass
        class Connection:
            calls = 0
            def __init__(self, *args):
                Connection.calls += 1
            def request(self, *args, **kwargs):
                pass
            def getresponse(self):
                return Response()
            def close(self):
                pass
        original = c.validate_feed_target
        def validate(url):
            if url.startswith("https://example.com"):
                return "example.com", 443, "/rss", ["93.184.216.34"]
            return original(url)
        with patch.object(c, "PinnedHTTPSConnection", Connection), patch.object(c, "validate_feed_target", validate):
            with self.assertRaises(c.FeedError):
                c.fetch_feed("https://example.com/rss")
        self.assertEqual(Connection.calls, 1)

    def test_oversized_response_is_rejected(self):
        class Response:
            status = 200
            def getheader(self, name, default=None):
                return str(c.MAX_FEED_BYTES + 1) if name == "Content-Length" else default
            def close(self):
                pass
        class Connection:
            def __init__(self, *args):
                pass
            def request(self, *args, **kwargs):
                pass
            def getresponse(self):
                return Response()
            def close(self):
                pass
        with patch.object(c, "PinnedHTTPSConnection", Connection), patch.object(c, "validate_feed_target", return_value=("example.com", 443, "/rss", ["93.184.216.34"])):
            with self.assertRaisesRegex(c.FeedError, "size limit"):
                c.fetch_feed("https://example.com/rss")


class DurabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.database = self.root / "private" / "news.sqlite3"
        self.output = self.root / "public" / "data"

    def run_collect(self, settings, fetcher, now=NOW):
        return c.run(settings, self.database, self.output, "America/Indiana/Indianapolis", fetcher, now)

    def index(self):
        return json.loads((self.output / "index.json").read_text())

    def test_daily_cap_order_dedup_and_rerun_idempotency(self):
        settings = config(cap=2)
        feed = rss([item(1), item(2), item(3)])
        first = self.run_collect(settings, lambda *args: fetched(feed))
        self.assertEqual(first["inserted"], 2)
        self.assertEqual([a["title"] for a in self.index()["latest"]], ["Story 3", "Story 2"])
        archived = self.output / "archive" / "2026-11.json"
        before, mtime = archived.read_bytes(), archived.stat().st_mtime_ns
        rerun = self.run_collect(settings, lambda *args: fetched(rss([item(4), item(3), item(2), item(1)])))
        self.assertEqual(rerun["inserted"], 0)
        self.assertEqual(archived.read_bytes(), before)
        self.assertEqual(archived.stat().st_mtime_ns, mtime)
        following = self.run_collect(settings, lambda *args: fetched(rss([item(4), item(3), item(2), item(1)])), NOW + dt.timedelta(days=1))
        self.assertEqual(following["inserted"], 2)
        self.assertEqual(self.index()["article_count"], 4)

    def test_tracking_variants_deduplicate_across_sources(self):
        feed1 = rss([item(1)])
        feed2 = feed1.replace(b"utm_source=rss#top", b"utm_campaign=weekly#different")
        self.run_collect(config(count=2), lambda url, *args: fetched(feed1 if url.endswith("0") else feed2))
        self.assertEqual(self.index()["article_count"], 1)

    def test_304_uses_validators_and_preserves_archive(self):
        self.run_collect(config(), lambda *args: fetched(rss([item(1)])))
        def unchanged(url, etag, modified):
            self.assertEqual(etag, '"v1"')
            self.assertEqual(modified, "Fri, 06 Nov 2026 12:00:00 GMT")
            return {"status": 304}
        self.run_collect(config(), unchanged, NOW + dt.timedelta(days=1))
        self.assertEqual(self.index()["article_count"], 1)
        self.assertEqual(self.index()["sources"][0]["status"], "unchanged")

    def test_all_failures_preserve_public_bytes_and_store_local_health(self):
        self.run_collect(config(), lambda *args: fetched(rss([item(1)])))
        before = {str(p): p.read_bytes() for p in self.output.rglob("*.json")}
        def failure(*args):
            raise c.FeedError("Feed returned HTTP 503")
        with self.assertRaisesRegex(c.FeedError, "All sources failed"):
            self.run_collect(config(), failure, NOW + dt.timedelta(days=1))
        self.assertEqual(before, {str(p): p.read_bytes() for p in self.output.rglob("*.json")})
        with sqlite3.connect(self.database) as db:
            state = db.execute("SELECT status,error,last_success_at FROM sources").fetchone()
        self.assertEqual(state, ("error", "Feed returned HTTP 503", "2026-11-06T12:00:00Z"))

    def test_partial_failure_retains_old_articles_and_exposes_source_health(self):
        self.run_collect(config(count=2), lambda url, *args: fetched(rss([item(1 if url.endswith("0") else 2)])))
        def partial(url, *args):
            if url.endswith("1"):
                raise c.FeedError("Feed request timed out")
            return fetched(rss([item(3)]))
        self.run_collect(config(count=2), partial, NOW + dt.timedelta(days=1))
        manifest = self.index()
        self.assertEqual(manifest["article_count"], 3)
        self.assertEqual([s["status"] for s in manifest["sources"]], ["ok", "error"])
        self.assertEqual(manifest["sources"][1]["last_success_at"], "2026-11-06T12:00:00Z")

    def test_undated_items_use_first_seen_month_without_inventing_publication(self):
        self.run_collect(config(), lambda *args: fetched(rss([item(1, date=False)])))
        article = self.index()["latest"][0]
        self.assertIsNone(article["published_at"])
        self.assertEqual(article["first_seen_at"], "2026-11-06T12:00:00Z")
        self.assertEqual(self.index()["months"][0]["month"], "2026-11")
        self.run_collect(config(), lambda *args: fetched(rss([item(2, date=False)])), dt.datetime(2026, 12, 1, 12, tzinfo=dt.timezone.utc))
        self.assertEqual(self.index()["article_count"], 2)
        self.assertEqual([m["month"] for m in self.index()["months"]], ["2026-12", "2026-11"])


if __name__ == "__main__":
    unittest.main()
