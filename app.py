import os
import re
import time
import json
import urllib.request
import xml.etree.ElementTree as ET
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

CACHE_FILE = 'releases_cache.json'
CACHE_EXPIRY = 300  # 5 minutes cache expiry
FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# Helper to clean HTML content for text-only representation (for tweets)
def clean_html_to_text(html_content):
    # Remove script and style tags
    clean = re.sub(r'<(script|style).*?>.*?</\1>', '', html_content, flags=re.DOTALL)
    # Replace links with text (href)
    clean = re.sub(r'<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>', r'\2 (\1)', clean)
    # Replace list items with bullet points
    clean = re.sub(r'<li>', '\n• ', clean)
    # Replace paragraphs and headers with double line breaks
    clean = re.sub(r'</?(p|h\d|ul|ol|div|br)[^>]*>', '\n', clean)
    # Strip remaining HTML tags
    clean = re.sub(r'<[^>]*>', '', clean)
    # Unescape HTML entities
    import html
    clean = html.unescape(clean)
    # Normalize whitespace
    clean = re.sub(r'\n\s*\n', '\n\n', clean)
    return clean.strip()

def fetch_and_parse_feed():
    try:
        req = urllib.request.Request(
            FEED_URL, 
            headers={'User-Agent': 'BigQueryReleaseNotesViewer/1.0'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()
            
        root = ET.fromstring(xml_data)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        
        parsed_entries = []
        for entry in root.findall('atom:entry', ns):
            date_str = entry.find('atom:title', ns).text
            updated_str = entry.find('atom:updated', ns).text
            id_str = entry.find('atom:id', ns).text
            content_elem = entry.find('atom:content', ns)
            
            content_html = content_elem.text if content_elem is not None else ""
            
            # Split content_html by <h3>...</h3> to isolate individual updates for that day
            parts = re.split(r'<h3>(.*?)</h3>', content_html)
            
            updates = []
            if len(parts) == 1:
                # No <h3> tags found
                html_text = parts[0].strip()
                updates.append({
                    "id": f"{id_str}_0",
                    "type": "General",
                    "html": html_text,
                    "text": clean_html_to_text(html_text)
                })
            else:
                initial_text = parts[0].strip()
                if initial_text:
                    updates.append({
                        "id": f"{id_str}_pre",
                        "type": "General",
                        "html": initial_text,
                        "text": clean_html_to_text(initial_text)
                    })
                
                # Sub-updates are pairs: type, html
                sub_idx = 1
                for i in range(1, len(parts), 2):
                    if i + 1 < len(parts):
                        type_name = parts[i].strip()
                        update_html = parts[i+1].strip()
                        updates.append({
                            "id": f"{id_str}_{sub_idx}",
                            "type": type_name,
                            "html": update_html,
                            "text": clean_html_to_text(update_html)
                        })
                        sub_idx += 1
            
            parsed_entries.append({
                "date": date_str,
                "updated": updated_str,
                "id": id_str,
                "updates": updates
            })
            
        # Save to cache file
        cache_data = {
            "timestamp": time.time(),
            "entries": parsed_entries
        }
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)
            
        return parsed_entries, "Fresh data loaded from Google Cloud."
        
    except Exception as e:
        # If fetching fails, try to load from cache
        if os.path.exists(CACHE_FILE):
            try:
                with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                    cache_data = json.load(f)
                return cache_data["entries"], f"Failed to fetch live feed. Showing cached data from {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(cache_data['timestamp']))}."
            except:
                pass
        raise e

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    
    # Check cache validity
    if not force_refresh and os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                cache_data = json.load(f)
            if time.time() - cache_data.get("timestamp", 0) < CACHE_EXPIRY:
                return jsonify({
                    "status": "success",
                    "source": "cache",
                    "timestamp": cache_data.get("timestamp"),
                    "entries": cache_data.get("entries"),
                    "message": "Loaded from cache."
                })
        except:
            pass
            
    # Fetch fresh
    try:
        entries, msg = fetch_and_parse_feed()
        return jsonify({
            "status": "success",
            "source": "live",
            "timestamp": time.time(),
            "entries": entries,
            "message": msg
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Error fetching release notes: {str(e)}"
        }), 500

if __name__ == '__main__':
    # Make sure we run on 0.0.0.0 so it is accessible, port 5000 is default
    app.run(debug=True, port=5000)
