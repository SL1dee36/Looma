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
    # Добавляем User-Agent, имитирующий браузер
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' # Пример User-Agent
    }

    try:
        # Используем сессию
        with requests.Session() as session:
            session.headers.update(headers) # Добавляем заголовки к сессии
            response = session.post(url, data=formData) #, verify=False) # УБРАТЬ verify=False в продакшене!
            response.raise_for_status()  # Проверяем HTTP статус (200 OK)
            html = response.text
            soup = BeautifulSoup(html, 'html.parser')


        # Проверка на ошибку поиска
        error_div = soup.find('div', class_='message-info')
        if error_div and 'Введено пустое поле' in error_div.text:
            return []  # Фильмы не найдены

        # Парсинг результатов
        movie_links = soup.select('a.poster')
        results = []
        for link in movie_links:
            title = link.find('h3').text.strip() if link.find('h3') else "No title"
            year_country = link.find('ul').text.strip() if link.find('ul') else "No year/country"
            poster_url = link.find('img')['src'] if link.find('img') and link.find('img').get('src') else (link.find('img')['data-src'] if link.find('img') and link.find('img').get('data-src') else None)
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
        #Также используй сессии
        with requests.Session() as session:
            session.headers.update(headers)
            response = session.get(movie_page_url) #, verify=False) # УБРАТЬ verify=False в продакшене!
            response.raise_for_status()
            html = response.text
            soup = BeautifulSoup(html, 'html.parser')

        iframe = soup.find('iframe', id='div_video')
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