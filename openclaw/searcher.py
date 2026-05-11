from duckduckgo_search import DDGS

def search_hospital_url(hospital_name: str, domain: str = None) -> str:
    """
    Search for the specific hospital page using DuckDuckGo.
    If domain is provided, limits search to that site.
    """
    query = hospital_name
    if domain:
        query += f" site:{domain}"
        
    print(f"[*] Searching DDG for: {query}")
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=1))
            if results:
                url = results[0]['href']
                print(f"[*] Found URL: {url}")
                return url
    except Exception as e:
        print(f"[!] Search failed: {e}")
        
    # Fallback to domain if search fails
    if domain:
        return f"https://{domain}"
    return None
