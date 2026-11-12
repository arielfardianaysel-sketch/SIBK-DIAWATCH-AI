import json
import re
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

DEST = Path(__file__).with_name("health_knowledge.json")

SOURCES = [
    (
        "CDC_SMOKING", "Merokok dan diabetes", "smoking",
        "https://www.cdc.gov/diabetes/risk-factors/diabetes-and-smoking.html"
    ),
    (
        "CDC_QUIT", "Cara berhenti merokok", "smoking",
        "https://www.cdc.gov/tobacco/about/how-to-quit.html"
    ),
    (
        "WHO_QUIT", "WHO: berhenti merokok", "smoking",
        "https://www.who.int/news/item/14-11-2023-quitting-smoking-cuts-your-risk-of-developing-type-2-diabetes-by-30-40"
    ),
    (
        "CDC_SUGAR", "Minuman berpemanis", "sugar",
        "https://www.cdc.gov/nutrition/php/data-research/sugar-sweetened-beverages.html"
    ),
    (
        "CDC_DIET", "Pola makan sehat", "diet",
        "https://www.cdc.gov/nutrition/features/healthy-eating-tips.html"
    ),
    (
        "CDC_PREVENT", "Pencegahan diabetes", "prevention",
        "https://www.cdc.gov/diabetes/prevention-type-2/index.html"
    ),
    (
        "CDC_LIFESTYLE", "Kebiasaan sehat", "activity",
        "https://www.cdc.gov/chronic-disease/prevention/"
    )
]

records = []

with httpx.Client(
    timeout=30,
    follow_redirects=True,
    headers={"User-Agent": "DiaWatchAcademicPrototype/1.0"}
) as client:

    for source_id, title, topic, url in SOURCES:
        try:
            response = client.get(url)
            response.raise_for_status()

            soup = BeautifulSoup(
                response.text, "html.parser"
            )

            main = (
                soup.find("main")
                or soup.find("article")
                or soup.body
            )

            if not main:
                raise ValueError("Konten artikel tidak ditemukan")

            for element in main.find_all([
                "script", "style", "nav", "footer", "aside"
            ]):
                element.decompose()

            paragraphs = []

            for element in main.find_all(["p", "li"]):
                content = re.sub(
                    r"\s+", " ",
                    element.get_text(" ", strip=True)
                )

                if 80 <= len(content) <= 1200:
                    paragraphs.append(content)

            for paragraph in dict.fromkeys(paragraphs):
                records.append({
                    "source_id": source_id,
                    "title": title,
                    "topic": topic,
                    "url": url,
                    "text": paragraph[:650]
                })

            print(f"Berhasil: {source_id}")

        except (httpx.HTTPError, ValueError) as error:
            print(f"Gagal: {source_id} - {error}")

if len({r["source_id"] for r in records}) < 3:
    raise RuntimeError(
        "Kurang dari 3 sumber berhasil diunduh."
    )

DEST.write_text(
    json.dumps(records, ensure_ascii=False, indent=2),
    encoding="utf-8"
)

print("Knowledge base tersimpan:", DEST)
