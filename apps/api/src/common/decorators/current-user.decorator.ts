import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@tam/prisma-client';

export interface CurrentUserData {
  id: string;
  telegramId: bigint;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserData;

    return data ? user?.[data] : user;
  }
);
