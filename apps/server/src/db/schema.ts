// Author: Nazaryan Artem (@sl1dee36)
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  passwordHash: text('password_hash'),
  isGuest: integer('is_guest', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
});

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  isPersistent: integer('is_persistent', { mode: 'boolean' }).notNull().default(false),
  maxUsers: integer('max_users').notNull().default(20),
  createdAt: integer('created_at').notNull(),
});
