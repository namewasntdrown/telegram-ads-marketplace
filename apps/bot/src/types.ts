import type { Context, SessionFlavor } from 'grammy';
import type { User } from '@tam/prisma-client';

export interface SessionData {
  user: User | null;
}

export type BotContext = Context & SessionFlavor<SessionData>;
