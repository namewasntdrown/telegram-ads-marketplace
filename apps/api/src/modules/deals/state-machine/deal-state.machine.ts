import { Injectable, BadRequestException } from '@nestjs/common';
import { DealStatus } from '@tam/shared-types';

export type DealAction =
  | 'CREATE'             // Рекламодатель создаёт заявку
  | 'APPROVE'            // Владелец канала одобряет (средства блокируются → CONTENT_PENDING)
  | 'REJECT'             // Владелец канала отклоняет
  | 'CANCEL'             // Рекламодатель отменяет (только до одобрения)
  | 'SUBMIT_CONTENT'     // Владелец канала отправляет черновик контента
  | 'APPROVE_CONTENT'    // Рекламодатель одобряет контент
  | 'REJECT_CONTENT'     // Рекламодатель просит доработку
  | 'POST'               // Система постит в канал
  | 'RELEASE'            // Система выплачивает владельцу канала
  | 'DISPUTE'            // Любая сторона открывает спор
  | 'RESOLVE_RELEASE'    // Админ разрешает спор в пользу владельца
  | 'RESOLVE_REFUND'     // Админ разрешает спор в пользу рекламодателя
  | 'EXPIRE';            // Система истекает сделку

interface StateTransition {
  from: DealStatus[];
  to: DealStatus;
  allowedRoles: ('advertiser' | 'channel_owner' | 'admin' | 'system')[];
}

@Injectable()
export class DealStateMachine {
  private readonly transitions: Record<DealAction, StateTransition> = {
    CREATE: {
      from: [],
      to: DealStatus.PENDING,
      allowedRoles: ['advertiser'],
    },
    APPROVE: {
      from: [DealStatus.PENDING],
      to: DealStatus.CONTENT_PENDING, // Funds locked, owner prepares content
      allowedRoles: ['channel_owner'],
    },
    REJECT: {
      from: [DealStatus.PENDING],
      to: DealStatus.CANCELLED,
      allowedRoles: ['channel_owner'],
    },
    CANCEL: {
      from: [DealStatus.PENDING],
      to: DealStatus.CANCELLED,
      allowedRoles: ['advertiser'],
    },
    SUBMIT_CONTENT: {
      from: [DealStatus.CONTENT_PENDING],
      to: DealStatus.CONTENT_SUBMITTED,
      allowedRoles: ['channel_owner'],
    },
    APPROVE_CONTENT: {
      from: [DealStatus.CONTENT_SUBMITTED],
      to: DealStatus.CONTENT_APPROVED,
      allowedRoles: ['advertiser'],
    },
    REJECT_CONTENT: {
      from: [DealStatus.CONTENT_SUBMITTED],
      to: DealStatus.CONTENT_PENDING,
      allowedRoles: ['advertiser'],
    },
    POST: {
      from: [DealStatus.CONTENT_APPROVED, DealStatus.SCHEDULED],
      to: DealStatus.POSTED,
      allowedRoles: ['system'],
    },
    RELEASE: {
      from: [DealStatus.POSTED],
      to: DealStatus.RELEASED,
      allowedRoles: ['system'],
    },
    DISPUTE: {
      from: [DealStatus.SCHEDULED, DealStatus.POSTED, DealStatus.CONTENT_PENDING, DealStatus.CONTENT_SUBMITTED, DealStatus.CONTENT_APPROVED],
      to: DealStatus.DISPUTED,
      allowedRoles: ['advertiser', 'channel_owner'],
    },
    RESOLVE_RELEASE: {
      from: [DealStatus.DISPUTED],
      to: DealStatus.RELEASED,
      allowedRoles: ['admin'],
    },
    RESOLVE_REFUND: {
      from: [DealStatus.DISPUTED],
      to: DealStatus.REFUNDED,
      allowedRoles: ['admin'],
    },
    EXPIRE: {
      from: [DealStatus.PENDING],
      to: DealStatus.EXPIRED,
      allowedRoles: ['system'],
    },
  };

  canTransition(
    currentStatus: DealStatus,
    action: DealAction,
    role: 'advertiser' | 'channel_owner' | 'admin' | 'system'
  ): boolean {
    const transition = this.transitions[action];
    if (!transition) {
      return false;
    }

    // For CREATE action, check if no current status
    if (action === 'CREATE') {
      return transition.allowedRoles.includes(role);
    }

    return (
      transition.from.includes(currentStatus) &&
      transition.allowedRoles.includes(role)
    );
  }

  getNextStatus(action: DealAction): DealStatus {
    const transition = this.transitions[action];
    if (!transition) {
      throw new BadRequestException(`Unknown action: ${action}`);
    }
    return transition.to;
  }

  validateTransition(
    currentStatus: DealStatus,
    action: DealAction,
    role: 'advertiser' | 'channel_owner' | 'admin' | 'system'
  ): void {
    if (!this.canTransition(currentStatus, action, role)) {
      throw new BadRequestException(
        `Cannot perform action '${action}' on deal with status '${currentStatus}' as '${role}'`
      );
    }
  }

  getAvailableActions(
    currentStatus: DealStatus,
    role: 'advertiser' | 'channel_owner' | 'admin' | 'system'
  ): DealAction[] {
    const actions: DealAction[] = [];

    for (const [action, transition] of Object.entries(this.transitions)) {
      if (
        transition.from.includes(currentStatus) &&
        transition.allowedRoles.includes(role)
      ) {
        actions.push(action as DealAction);
      }
    }

    return actions;
  }

  isTerminalStatus(status: DealStatus): boolean {
    const terminalStatuses: DealStatus[] = [
      DealStatus.RELEASED,
      DealStatus.REFUNDED,
      DealStatus.CANCELLED,
      DealStatus.EXPIRED,
    ];
    return terminalStatuses.includes(status);
  }

  requiresEscrowLock(status: DealStatus): boolean {
    const lockedStatuses: DealStatus[] = [
      DealStatus.CONTENT_PENDING,
      DealStatus.CONTENT_SUBMITTED,
      DealStatus.CONTENT_APPROVED,
      DealStatus.SCHEDULED,
      DealStatus.POSTED,
      DealStatus.DISPUTED,
    ];
    return lockedStatuses.includes(status);
  }
}
