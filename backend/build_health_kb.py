"""Refresh the local CDC evidence used by Qwen; no questionnaire data is sent out."""
import json
import re
from datetime import datetime, timezone

import httpx
from bs4 import BeautifulSoup

from ai import HEALTH_SOURCES, KNOWLEDGE_PATH


def main() -> None:
    records = []
    fetched_at = datetime.now(timezone.utc).isoformat()
    with httpx.Client(timeout=30, follow_redirects=True, trust_env=False,
                      headers={"User-Agent": "DiaWatchAcademicPrototype/1.0"}) as client:
        for source_id, (title, topic, url) in HEALTH_SOURCES.items():
            try:
                response = client.get(url)
                response.raise_for_status()
                if response.url.host != "www.cdc.gov":
                    raise ValueError("Unexpected reference host")
                soup = BeautifulSoup(response.text, "html.parser")
                article = soup.find("main") or soup.find("article")
                if article is None:
                    raise ValueError("Article not found")
                for element in article.find_all(["script", "style", "nav", "footer", "aside"]):
                    element.decompose()
                paragraphs = dict.fromkeys(re.sub(r"\s+", " ", p.get_text(" ", strip=True))
                                           for p in article.find_all(["p", "li"]))
                passages = [text for text in paragraphs if 80 <= len(text) <= 1000]
                if not passages:
                    raise ValueError("Article has no usable passages")
                records.extend({"source_id": source_id, "title": title, "topic": topic, "url": url,
                                "text": text, "fetched_at": fetched_at} for text in passages)
                print(f"OK {source_id}: {len(passages)} passages")
            except (httpx.HTTPError, ValueError) as exc:
                print(f"FAIL {source_id}: {type(exc).__name__}")
    required = {"CDC_SMOKING", "CDC_DIET", "CDC_ACTIVITY", "CDC_PREVENT"}
    if not required.issubset({row["source_id"] for row in records}):
        raise RuntimeError("Referensi wajib belum lengkap; knowledge base lama tetap dipertahankan.")
    temporary = KNOWLEDGE_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(KNOWLEDGE_PATH)
    print(f"Saved {len(records)} passages to {KNOWLEDGE_PATH.name}")


if __name__ == "__main__":
    main()
