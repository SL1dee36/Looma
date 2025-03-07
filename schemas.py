# --- START OF FILE schemas.py ---
from marshmallow import Schema, fields, validate, ValidationError

class UserSchema(Schema):
    id = fields.Int(dump_only=True)
    username = fields.Str(required=True, validate=validate.Length(min=3, max=80))
    email = fields.Email(required=True)
    password = fields.Str(required=True, load_only=True, validate=validate.Length(min=8))

class RoomSchema(Schema):
    id = fields.Int(dump_only=True)
    code = fields.Str(dump_only=True)
    name = fields.Str(validate=validate.Length(max=100))
    owner_id = fields.Int(dump_only=True)
    max_users = fields.Int(required=True, validate=validate.Range(min=1))
    created_at = fields.DateTime(dump_only=True)
    current_users = fields.Method("get_current_users_count", dump_only=True)

    def get_current_users_count(self, obj):
        return obj.users.count()

class MessageSchema(Schema):
    id = fields.Int(dump_only=True)
    sender = fields.Str(dump_only=True)  # Оставляем как есть
    sender_id = fields.Int(dump_only=False, load_only=True) # Добавляем sender_id, разрешаем его использовать при загрузке
    text = fields.Str(required=True, validate=validate.Length(max=500), load_from='message')
    timestamp = fields.DateTime(dump_only=True)
    
class RoomContentSchema(Schema):
    id = fields.Int(dump_only=True)
    room_id = fields.Int(dump_only=True)
    video_url = fields.URL(required=False, allow_none=True)
    playback_position = fields.Float(required=False, allow_none=True, validate=validate.Range(min=0))
    is_playing = fields.Boolean(required=False, allow_none=True)
# --- END OF FILE schemas.py ---