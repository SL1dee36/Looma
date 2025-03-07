# --- START OF FILE app.py --- (Corrected Again and Updated)
import os
from flask import Blueprint, Flask, jsonify, request, g, send_from_directory
from config import Config
from db import init_db, db
from auth import auth_bp, token_required
from flask_cors import CORS
from models import Room, User, Message, RoomContent  # Import RoomContent
from schemas import UserSchema, RoomSchema, MessageSchema, RoomContentSchema
from marshmallow import ValidationError


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    init_db(app)

    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    app.register_blueprint(auth_bp)

    # --- Rooms Blueprint ---
    rooms_bp = Blueprint('rooms', __name__, url_prefix='/rooms')

    @rooms_bp.route('/create', methods=['POST'])
    @token_required
    def create_room():
        """Creates a new room, adds the creator, and initializes RoomContent."""
        schema = RoomSchema()
        try:
            data = schema.load(request.get_json())
        except ValidationError as err:
            return jsonify(err.messages), 400

        existing_room = Room.query.filter_by(owner_id=g.current_user.id).first()
        if existing_room:
            return jsonify({'message': 'You can only create one room at a time.'}), 403

        code = Room.generate_code()
        new_room = Room(
            code=code,
            owner_id=g.current_user.id,
            max_users=data['max_users'],
            name=data.get('name', 'Unnamed Room')
        )

        db.session.add(new_room)
        db.session.flush()  # <-- IMPORTANT: Get the new_room.id *before* creating RoomContent

        # Initialize RoomContent *after* flushing to get the room ID
        room_content = RoomContent(room_id=new_room.id)
        db.session.add(room_content)

        new_room.users.append(g.current_user)  # Auto-join

        db.session.commit()

        return jsonify({
            'message': 'Room created successfully',
            'code': code,
            'room_id': new_room.id
        }), 201


    @rooms_bp.route('/join', methods=['POST'])
    @token_required
    def join_room():
        """Allows a user to join a room by its code."""
        data = request.get_json()

        if not data or 'code' not in data:
            return jsonify({'message': 'Missing code field'}), 400

        code = data['code']
        room = Room.query.filter_by(code=code).first()

        if not room:
            return jsonify({'message': 'Room not found'}), 404

        if room.users.count() >= room.max_users:
            return jsonify({'message': 'Room is full'}), 403

        if g.current_user in room.users:
            return jsonify({'message': 'You are already in this room'}), 409

        room.users.append(g.current_user)
        db.session.commit()

        return jsonify({'message': 'Joined room successfully', 'room_id': room.id}), 200


    @rooms_bp.route('/<int:room_id>', methods=['GET', 'DELETE'])
    @token_required
    def manage_room(room_id):
        """Gets room details or deletes the room (if owner)."""
        room = Room.query.get_or_404(room_id)

        if request.method == 'GET':
            # Include the usernames in the response.
            room_schema = RoomSchema()
            result = room_schema.dump(room)
            # Add user details (specifically usernames).
            result['users'] = [{'id': user.id, 'username': user.username} for user in room.users]

            return jsonify(result), 200


        elif request.method == 'DELETE':
            if g.current_user.id != room.owner_id:
                return jsonify({'message': 'You are not the owner of this room'}), 403
            #RoomContent will be automatically deleted because of cascade.
            db.session.delete(room)
            db.session.commit()
            return jsonify({'message': 'Room deleted successfully'}), 200



    @rooms_bp.route('/<int:room_id>/kick/<int:user_id>', methods=['DELETE'])
    @token_required
    def kick_user(room_id, user_id):
        """Kicks a user from the room (only if the current user is the owner)."""
        room = Room.query.get_or_404(room_id)

        if g.current_user.id != room.owner_id:
            return jsonify({'message': 'You are not the owner of this room'}), 403

        user_to_kick = User.query.get(user_id)
        if not user_to_kick:
             return jsonify({"message":"User to kick not found"}), 404

        if user_to_kick not in room.users:
            return jsonify({'message': 'User is not in this room'}), 400

        room.users.remove(user_to_kick)
        db.session.commit()

        return jsonify({'message': 'User kicked successfully'}), 200


    @rooms_bp.route('/active', methods=['GET']) # NEW: Active rooms endpoint
    @token_required
    def list_active_rooms():
        """Lists all active rooms (rooms that exist)."""
        rooms = Room.query.all()  # Get *all* rooms
        room_schema = RoomSchema(many=True)
        result = room_schema.dump(rooms)
        # Add user count information.
        for room_data in result:
             room = Room.query.get(room_data['id']) # Get the actual room object
             room_data['current_users'] = room.users.count()
        return jsonify(result), 200

    @rooms_bp.route('/my', methods=['GET'])  # NEW: User's owned rooms
    @token_required
    def list_my_rooms():
        """Lists rooms owned by the current user."""
        rooms = Room.query.filter_by(owner_id=g.current_user.id).all()
        room_schema = RoomSchema(many=True)
        result = room_schema.dump(rooms)
        for room_data in result:
             room = Room.query.get(room_data['id'])
             room_data['current_users'] = room.users.count()
        return jsonify(result), 200


    @rooms_bp.route('/<int:room_id>/message', methods=['POST'])
    @token_required
    def send_message(room_id):
        """Sends a message to the specified room."""
        room = Room.query.get_or_404(room_id)

        if g.current_user not in room.users:
            return jsonify({'message': 'You are not in this room'}), 403

        schema = MessageSchema()

        try:
            # ЛОГИРУЕМ СЫРЫЕ ДАННЫЕ ЗАПРОСА
            print("Raw request data:", request.get_json())

            data = schema.load(request.get_json())

            # ЛОГИРУЕМ ДАННЫЕ ПОСЛЕ ЗАГРУЗКИ СХЕМОЙ
            print("Data after schema.load:", data)

        except ValidationError as err:
            # ЛОГИРУЕМ ОШИБКИ ВАЛИДАЦИИ
            print("Validation errors:", err.messages)
            return jsonify(err.messages), 400  # Возвращаем ошибки валидации

        message_text = data['text']
        new_message = Message(sender_id=g.current_user.id, room_id=room.id, text=message_text)
        db.session.add(new_message)
        db.session.commit()

        return jsonify({'message': 'Message sent successfully'}), 201

    @rooms_bp.route('/<int:room_id>/messages', methods=['GET'])
    @token_required
    def get_messages(room_id):
        """Retrieves all messages for the specified room."""
        room = Room.query.get_or_404(room_id)

        if g.current_user not in room.users:
            return jsonify({'message': 'You are not in this room'}), 403

        messages = Message.query.filter_by(room_id=room.id).order_by(Message.timestamp).all()

        message_schema = MessageSchema(many=True)
        result = message_schema.dump(messages)

        for message_data in result:
            # Используем sender, который уже строка
            # sender = User.query.get(message_data['sender_id']) # УДАЛЯЕМ
            # message_data['sender'] = sender.username if sender else "Unknown"  # УДАЛЯЕМ
            # Вместо этого ничего делать не нужно - поле sender уже заполнено!
            pass

        return jsonify({'messages': result}), 200

    @rooms_bp.route('/<int:room_id>/leave', methods=['POST'])
    @token_required
    def leave_room(room_id):
        """Allows a user to leave a room."""
        room = Room.query.get_or_404(room_id)

        if g.current_user not in room.users:
            return jsonify({'message': 'You are not in this room'}), 400

        # Prevent owner from leaving (they must delete the room)
        if g.current_user.id == room.owner_id:
            return jsonify({'message': 'The owner cannot leave the room.  Delete the room instead.'}), 403

        room.users.remove(g.current_user)
        db.session.commit()
        return jsonify({'message': 'You have left the room'}), 200


    @rooms_bp.route('/<int:room_id>/content', methods=['GET', 'PUT'])
    @token_required
    def manage_content(room_id):
        """Manages the shared content state for a room (owner only for PUT)."""
        room = Room.query.get_or_404(room_id)

        if g.current_user not in room.users:
            return jsonify({'message': 'You are not in this room'}), 403

        room_content = RoomContent.query.filter_by(room_id=room.id).first()
        if not room_content:  # Should not happen, but handle for robustness
              return jsonify({'message':'Room content not found'}), 404

        if request.method == 'GET':
            schema = RoomContentSchema()
            result = schema.dump(room_content)
            return jsonify(result), 200

        elif request.method == 'PUT':
            if g.current_user.id != room.owner_id:
                return jsonify({'message': 'Only the room owner can modify the content'}), 403

            schema = RoomContentSchema()
            try:
                data = schema.load(request.get_json())
            except ValidationError as err:
                return jsonify(err.messages), 400

            # Update the RoomContent object
            room_content.video_url = data.get('video_url', room_content.video_url)  # Allow partial updates
            room_content.playback_position = data.get('playback_position', room_content.playback_position)
            room_content.is_playing = data.get('is_playing', room_content.is_playing)
            # Add other fields as needed

            db.session.commit()
            return jsonify({'message': 'Room content updated successfully'}), 200

    app.register_blueprint(rooms_bp)

    CORS(app)  # This is important!

    @app.after_request
    def after_request(response):
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response

    @app.route('/')
    def index():
        return send_from_directory('client', 'index.html')


    # Serve static files (HTML, CSS, JS)
    @app.route('/<path:path>')
    def serve_static(path):
        return send_from_directory('client', path)


    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        return jsonify({'message':'An unexpected error occurred'}), 500
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)
# --- END OF FILE app.py ---