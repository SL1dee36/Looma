# --- START OF FILE models.py ---
from werkzeug.security import generate_password_hash, check_password_hash
from db import db
import jwt
from datetime import datetime, timedelta, timezone
from flask import current_app
import secrets

# Association table for the many-to-many relationship between Users and Rooms
user_room = db.Table('user_room',
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True),
    db.Column('room_id', db.Integer, db.ForeignKey('room.id'), primary_key=True)
)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    rooms = db.relationship('Room', secondary=user_room, backref=db.backref('users', lazy='dynamic'))

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def get_access_token(self, expires_in=2592000):  # 30 days in seconds
        """Generates a JWT access token."""
        return jwt.encode(
            {
                'user_id': self.id,
                'exp': datetime.now(tz=timezone.utc) + timedelta(seconds=expires_in)
            },
            current_app.config['SECRET_KEY'],
            algorithm="HS256"
        )
    @staticmethod
    def verify_access_token(token):
        """Verifies a JWT access token and returns the user ID or None."""
        try:
            # Use current_app within the application context
            with current_app.app_context():
                payload = jwt.decode(
                    token,
                    current_app.config['SECRET_KEY'],
                    algorithms=["HS256"]
                )
            return payload['user_id']
        except jwt.ExpiredSignatureError:
            return None  # Token has expired
        except jwt.InvalidTokenError:
            return None  # Invalid token
        except KeyError:
            return None
        except Exception as e:
            print(f"DEBUG: verify_access_token failed: {e}")
            return None

    def __repr__(self):
        return f'<User {self.username}>'

class Room(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(10), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=True)  # Allow nullable name
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    max_users = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    owner = db.relationship('User', backref=db.backref('owned_rooms', lazy=True))

    def __repr__(self):
        return f'<Room {self.code}>'

    @staticmethod
    def generate_code():
        """Generates a unique room code."""
        while True:
            code = secrets.token_urlsafe(6)
            if not Room.query.filter_by(code=code).first():
                return code

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    room_id = db.Column(db.Integer, db.ForeignKey('room.id'), nullable=False)
    text = db.Column(db.String(500), nullable=False)  # Increased length
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    sender = db.relationship('User', backref=db.backref('messages', lazy=True))
    room = db.relationship('Room', backref=db.backref('messages', lazy=True, cascade="all, delete-orphan")) #add cascade

    def __repr__(self):
        return f'<Message {self.id} from {self.sender_id} in {self.room_id}>'

class RoomContent(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey('room.id'), nullable=False, unique=True) #one to one
    video_url = db.Column(db.String(255), nullable=True)  # Store YouTube/etc. URL
    playback_position = db.Column(db.Float, default=0.0)  # Current position in seconds
    is_playing = db.Column(db.Boolean, default=False) # Playing or Paused

    room = db.relationship('Room', backref=db.backref('content', uselist=False, cascade="all, delete-orphan")) # One-to-one, and delete

    def __repr__(self):
        return f'<RoomContent for Room {self.room_id}>'
# --- END OF FILE models.py ---