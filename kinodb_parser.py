# --- kinobd_parser.py --- (Corrected)
import requests
from bs4 import BeautifulSoup
import json
import re


def search_kinobd(query):
    """Searches for movies on KinoBD and returns a list of results."""
    search_url = "https://kinobd.ru/api/films"  # CORRECTED URL
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',  # Important for KinoBD
        # You might need a Referer header, but try without first:
        # 'Referer': 'https://kinobd.ru/'
    }
    params = {
        'q': query,
        'page': 1,
        'filter[search]': query, # ADD filter[search]
        'per_page': 10, # add per_page
    }

    try:
        with requests.Session() as session:
            session.headers.update(headers)
            response = session.get(search_url, params=params)
            response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)
            data = response.json()

            results = []
            if 'data' in data and isinstance(data['data'], list):
                for item in data['data']:
                    result = {
                        'title': item.get('name_russian'),
                        'original_title': item.get('name_original'),
                        'kinopoisk_id': item.get('kp_id_movie'),
                        'poster_url': item.get('poster_url'),
                        'year': item.get('year_movie'),
                    }
                    results.append(result)
            return results

    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return None
    except (ValueError, KeyError) as e:
        print(f"JSON parsing error: {e}")
        return None
    except Exception as e:
        print(f"Parsing error: {e}")
        return None

def get_player_data_kinobd(kinopoisk_id):
    """Gets player data (including iframe URL) from KinoBD."""
    player_url = "https://kinobd.ru/api/player" # CORRECTED URL
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        # You might also need a Referer here:
        # 'Referer': f'https://kinobd.ru/film/{kinopoisk_id}'  # Refer to the movie page
    }
    params = {
        'kp_id': kinopoisk_id, # Use correct parameter name
        'page': 1,
    }

    try:
        with requests.Session() as session:
            session.headers.update(headers)
            response = session.get(player_url, params=params)
            response.raise_for_status()  # Check for HTTP errors
            data = response.json()


            if 'data' in data and isinstance(data['data'], list):
                for item in data['data']:
                    if 'iframe_url' in item and item['iframe_url']:
                         return item  # Return the whole player object

            return None

    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return None
    except (ValueError, KeyError) as e:
        print(f"JSON parsing error: {e}")
        return None
    except Exception as e:
        print(f"Parsing error: {e}")
        return None