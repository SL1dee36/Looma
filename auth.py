# --- START OF FILE auth.py ---
from flask import Blueprint, request, jsonify, g
from models import User
from db import db
from werkzeug.security import check_password_hash
from functools import wraps

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')

# --- Helper function for protecting routes ---
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
               token = auth_header.split(" ")[1] # Bearer <token>
            except IndexError:
                return jsonify({'message': 'Token is missing or invalid format'}), 401

        if not token:
            return jsonify({'message': 'Token is missing!'}), 401

        try:
            user_id = User.verify_access_token(token)
            if user_id is None:  # Token is invalid or expired
                return jsonify({'message': 'Token is invalid!'}), 401
            g.current_user = User.query.get(user_id) # Store current user
            if not g.current_user:
               return jsonify({"message": "Invalid Token: User Not Found"}), 401
        except Exception as e: # Catch-all
            return jsonify({'message': 'Token is invalid!', 'error': str(e)}), 401

        return f(*args, **kwargs)

    return decorated


@auth_bp.route('/register', methods=['POST'])
def register():
    """Registers a new user."""
    data = request.get_json()

    if not data or 'username' not in data or 'email' not in data or 'password' not in data:
        return jsonify({'message': 'Missing required fields'}), 400

    username = data['username']
    email = data['email']
    password = data['password']

    existing_user = User.query.filter((User.username == username) | (User.email == email)).first()
    if existing_user:
        return jsonify({'message': 'Username or email already exists'}), 409

    new_user = User(username=username, email=email)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({'message': 'User registered successfully', 'user_id': new_user.id}), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    """Logs in a user and returns an access token."""
    data = request.get_json()
    if not data or 'username' not in data or 'password' not in data:
        return jsonify({'message': 'Missing credentials'}), 400

    username = data['username']
    password = data['password']

    user = User.query.filter_by(username=username).first()

    if user and user.check_password(password):
        access_token = user.get_access_token()
        return jsonify({'access_token': access_token}), 200
    else:
        return jsonify({'message': 'Invalid username or password'}), 401

@auth_bp.route('/logout', methods=['POST'])
@token_required
def logout():
    """Logs out the user (no specific action needed with JWT, as it's stateless)."""
    # You could add token blacklisting here if you want to invalidate tokens immediately
    return jsonify({'message': 'Logged out successfully'}), 200

@auth_bp.route('/protected', methods=['GET'])
@token_required
def protected():
    """A protected route that requires a valid token."""
    return jsonify({'message': f'Hello, {g.current_user.username}! This is a protected resource.'}), 200
# --- END OF FILE auth.py ---