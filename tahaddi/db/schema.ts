import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const games=sqliteTable('games',{pin:text('pin').primaryKey(),token:text('token').notNull(),title:text('title').notNull(),questions:text('questions').notNull(),step:integer('step').notNull().default(-1),deadline:integer('deadline').notNull().default(0)});
export const players=sqliteTable('players',{id:text('id').primaryKey(),pin:text('pin').notNull(),name:text('name').notNull(),score:integer('score').notNull().default(0)});
export const answers=sqliteTable('answers',{id:text('id').primaryKey(),player:text('player').notNull(),step:integer('step').notNull(),choice:integer('choice').notNull()});
