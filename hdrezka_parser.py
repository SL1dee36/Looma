# --- hdrezka_parser.py ---
import requests
from bs4 import BeautifulSoup

def search_hdrezka(movie_title):
    """Ищет фильмы на hdrezka.pro и возвращает список результатов."""
    url = 'https://hdrezka.pro/index.php?do=search'
    formData = {
        'do': 'search',
        'subaction': 'search',
        'story': movie_title,
    }
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }

    try:
        with requests.Session() as session:
            session.headers.update(headers)
            response = session.post(url, data=formData)
            response.raise_for_status()
            html = response.text
            soup = BeautifulSoup(html, 'html.parser')

        error_div = soup.find('div', class_='message-info')
        if error_div and 'Введено пустое поле' in error_div.text:
            return []

        movie_links = soup.select('a.poster')
        results = []
        for link in movie_links:
            title = link.find('h3').text.strip() if link.find('h3') else "No title"
            year_country = link.find('ul').text.strip() if link.find('ul') else "No year/country"

            # Извлекаем URL постера, предпочитая data-src
            img_tag = link.find('img')
            poster_url = None
            if img_tag:
                poster_url = img_tag.get('data-src') or img_tag.get('src')

                # Проверка на изображение-заглушку
                if poster_url and "no-img.png" in poster_url:
                    poster_url = None  # Устанавливаем None, если это заглушка
                elif poster_url and poster_url.startswith("/"):
                    poster_url = "https://hdrezka.pro" + poster_url


            movie_url = link['href']

            results.append({
                'title': title,
                'yearCountry': year_country,
                'posterUrl': poster_url,
                'movieUrl': movie_url,
            })
        return results

    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return None
    except Exception as e:
        print(f"Parsing error: {e}")
        return None


def get_iframe_src(movie_page_url):
    """Получает URL iframe со страницы фильма."""
    headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    try:
        with requests.Session() as session:
            session.headers.update(headers)
            response = session.get(movie_page_url)
            response.raise_for_status()
            html = response.text
            soup = BeautifulSoup(html, 'html.parser')

        iframe = soup.find('iframe', id='div_video')  # Исправленный селектор
        if iframe:
            src = iframe['src']
            if src.startswith('//'):
                src = 'https:' + src
            return src
        return None

    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return None
    except Exception as e:
        print(f"Parsing error: {e}")
        return None