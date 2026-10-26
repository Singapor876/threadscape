import json
from urllib.parse import quote

import httpx
from langchain_core.tools import tool


async def search_sources(query: str) -> list[dict[str, str]]:
    url = "https://zh.wikipedia.org/w/api.php"
    params = {
        "action": "query", "generator": "search", "gsrsearch": query, "gsrlimit": "3",
        "prop": "extracts|info", "exintro": "1", "explaintext": "1", "exsentences": "2",
        "inprop": "url", "format": "json", "origin": "*",
    }
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
            response = await client.get(url, params=params, headers={"User-Agent": "Threadscape/2.0"})
            response.raise_for_status()
        pages = list(response.json().get("query", {}).get("pages", {}).values())
        return [
            {"title": page["title"], "url": page.get("fullurl", f"https://zh.wikipedia.org/?curid={page['pageid']}"), "excerpt": page.get("extract", "")}
            for page in pages
        ]
    except Exception:
        encoded = quote(query)
        return [
            {"title": f"维基百科：{query}", "url": f"https://zh.wikipedia.org/wiki/{encoded}", "excerpt": "百科定义与相关条目"},
            {"title": f"Semantic Scholar：{query}", "url": f"https://www.semanticscholar.org/search?q={encoded}", "excerpt": "学术论文与引用关系"},
        ]


@tool
async def search_public_sources(query: str) -> str:
    """Search public reference sources for factual or technical concepts. Use this when an answer benefits from verification or citations."""
    return json.dumps(await search_sources(query), ensure_ascii=False)
