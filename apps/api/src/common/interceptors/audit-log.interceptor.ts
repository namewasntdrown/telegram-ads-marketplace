import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../decorators/current-user.decorator';

const AUDITED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;

    if (!AUDITED_METHODS.includes(method)) {
      return next.handle();
    }

    const user = request.user as CurrentUserData | undefined;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: async (response) => {
          try {
            await this.createAuditLog(request, user, response, startTime);
          } catch (error) {
            this.logger.error('Failed to create audit log', error);
          }
        },
        error: async (error) => {
          try {
            await this.createAuditLog(request, user, { error: error.message }, startTime);
          } catch (err) {
            this.logger.error('Failed to create audit log', err);
          }
        },
      })
    );
  }

  private async createAuditLog(
    request: Request,
    user: CurrentUserData | undefined,
    response: unknown,
    startTime: number
  ) {
    const { method, url, body, params } = request;
    const duration = Date.now() - startTime;

    // Extract entity info from URL
    const urlParts = url.split('/').filter(Boolean);
    const entityType = urlParts[2] ?? 'unknown'; // e.g., /api/v1/deals -> deals
    const entityId = params.id ?? (body as Record<string, unknown>)?.id ?? 'unknown';

    await this.prisma.auditLog.create({
      data: {
        action: `${method} ${url}`,
        entityType: entityType.toString(),
        entityId: entityId.toString(),
        userId: user?.id,
        oldValue: body as object,
        newValue: {
          response: typeof response === 'object' ? response : { value: response },
          duration,
        },
        ipAddress: this.getClientIp(request),
        userAgent: request.headers['user-agent'],
      },
    });
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0]?.trim() ?? 'unknown';
    }
    return request.ip ?? 'unknown';
  }
}
