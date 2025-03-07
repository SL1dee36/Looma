# --- START OF FILE config.py ---

import os

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY') or 'your-secret-key'
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URI') or 'sqlite:///../data/users.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data','videos')
    ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mkv', 'flv','mov'}
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024 * 1024  # 16GB