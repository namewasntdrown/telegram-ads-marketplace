import { api } from './client';

// Types
export interface FolderPlacement {
  id: string;
  folderId: string;
  channelId: string;
  channelOwnerId: string;
  folderOwnerId: string;
  amount: string;
  platformFee: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  // Relations
  folder?: {
    id: string;
    title: string;
    folderLink: string;
    pricePerChannel?: string;
  };
  channel?: {
    id: string;
    title: string;
    username?: string;
    avatarUrl?: string;
    subscriberCount: number;
  };
  channelOwner?: {
    id: string;
    username?: string;
    firstName?: string;
  };
  folderOwner?: {
    id: string;
    username?: string;
    firstName?: string;
  };
}

export interface PaginatedPlacements {
  items: FolderPlacement[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreatePlacementDto {
  channelId: string;
}

export interface RejectPlacementDto {
  reason?: string;
}

export interface PlacementFilters {
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  page?: number;
  limit?: number;
}

// API Methods
export const folderPlacementsApi = {
  /**
   * Create a placement request for a channel in a folder
   */
  createPlacement: async (folderId: string, channelId: string) => {
    return api.post<FolderPlacement>(`/folders/${folderId}/placements`, {
      channelId,
    });
  },

  /**
   * Get placements for a folder
   */
  getFolderPlacements: async (folderId: string, filters?: PlacementFilters) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    const query = params.toString();
    return api.get<PaginatedPlacements>(
      `/folders/${folderId}/placements${query ? `?${query}` : ''}`,
    );
  },

  /**
   * Get all folders where a channel is placed
   */
  getChannelPlacements: async (channelId: string) => {
    return api.get<FolderPlacement[]>(`/channels/${channelId}/placements`);
  },

  /**
   * Approve a placement request (folder owner only)
   */
  approvePlacement: async (placementId: string) => {
    return api.post<FolderPlacement>(`/folder-placements/${placementId}/approve`, {});
  },

  /**
   * Reject a placement request (folder owner only)
   */
  rejectPlacement: async (placementId: string, reason?: string) => {
    return api.post<FolderPlacement>(`/folder-placements/${placementId}/reject`, {
      reason,
    });
  },

  /**
   * Cancel a placement request (channel owner only)
   */
  cancelPlacement: async (placementId: string) => {
    return api.post<FolderPlacement>(`/folder-placements/${placementId}/cancel`, {});
  },

  /**
   * Get user's placements as channel owner
   */
  getMyChannelPlacements: async (filters?: PlacementFilters) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    const query = params.toString();
    return api.get<PaginatedPlacements>(
      `/folder-placements/my/as-channel-owner${query ? `?${query}` : ''}`,
    );
  },

  /**
   * Get user's placements as folder owner
   */
  getMyFolderPlacements: async (filters?: PlacementFilters) => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    const query = params.toString();
    return api.get<PaginatedPlacements>(
      `/folder-placements/my/as-folder-owner${query ? `?${query}` : ''}`,
    );
  },

  /**
   * Set price per channel for a folder
   */
  setFolderPrice: async (folderId: string, pricePerChannel: string | null) => {
    return api.patch<{ pricePerChannel?: string }>(`/folders/${folderId}/price`, {
      pricePerChannel,
    });
  },

  /**
   * Update folder collection settings
   */
  updateFolderSettings: async (
    folderId: string,
    settings: {
      collectionDeadline?: string | null;
      maxChannels?: number | null;
      minSubscribers?: number | null;
    }
  ) => {
    return api.patch<{
      collectionDeadline?: string;
      maxChannels?: number;
      minSubscribers?: number;
    }>(`/folders/${folderId}`, settings);
  },

  /**
   * Sync folder channels from Telegram
   */
  syncFolderChannels: async (folderId: string) => {
    return api.post<{
      success: boolean;
      channelsCount?: number;
      channels?: SyncedChannel[];
      error?: string;
    }>(`/folders/${folderId}/sync`, {});
  },

  /**
   * Get synced channels for a folder
   */
  getSyncedChannels: async (folderId: string) => {
    return api.get<{
      channels: SyncedChannel[];
      lastSyncedAt: string | null;
    }>(`/folders/${folderId}/synced-channels`);
  },
};

export interface SyncedChannel {
  telegramId: string;
  title: string;
  username?: string;
  subscriberCount: number;
}
