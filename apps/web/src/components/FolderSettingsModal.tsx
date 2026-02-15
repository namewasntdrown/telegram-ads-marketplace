import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button } from './ui';
import { useTelegram } from '../hooks/useTelegram';
import { Settings, Calendar, Users, Hash } from 'lucide-react';
import { useTranslation } from '../i18n';
import { folderPlacementsApi } from '../api/folderPlacements';

interface FolderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string;
  folderTitle: string;
  currentSettings: {
    collectionDeadline?: string | null;
    maxChannels?: number | null;
    minSubscribers?: number | null;
  };
}

export function FolderSettingsModal({
  isOpen,
  onClose,
  folderId,
  folderTitle,
  currentSettings,
}: FolderSettingsModalProps) {
  const [deadline, setDeadline] = useState(
    currentSettings.collectionDeadline
      ? new Date(currentSettings.collectionDeadline).toISOString().split('T')[0]
      : ''
  );
  const [maxChannels, setMaxChannels] = useState(
    currentSettings.maxChannels?.toString() || ''
  );
  const [minSubscribers, setMinSubscribers] = useState(
    currentSettings.minSubscribers?.toString() || ''
  );
  const [error, setError] = useState<string | null>(null);

  const { hapticNotification } = useTelegram();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const updateMutation = useMutation({
    mutationFn: async () => {
      const settings: {
        collectionDeadline?: string | null;
        maxChannels?: number | null;
        minSubscribers?: number | null;
      } = {};

      if (deadline) {
        settings.collectionDeadline = new Date(deadline).toISOString();
      } else {
        settings.collectionDeadline = null;
      }

      if (maxChannels) {
        const num = parseInt(maxChannels, 10);
        if (isNaN(num) || num < 1) {
          throw new Error('Invalid max channels value');
        }
        settings.maxChannels = num;
      } else {
        settings.maxChannels = null;
      }

      if (minSubscribers) {
        const num = parseInt(minSubscribers, 10);
        if (isNaN(num) || num < 0) {
          throw new Error('Invalid min subscribers value');
        }
        settings.minSubscribers = num;
      } else {
        settings.minSubscribers = null;
      }

      const response = await folderPlacementsApi.updateFolderSettings(folderId, settings);
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folder', folderId] });
      onClose();
    },
    onError: (err: Error) => {
      hapticNotification?.('error');
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    updateMutation.mutate();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.folders.collectionSettings || 'Collection Settings'}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Folder Info */}
        <div className="p-4 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-[var(--tg-theme-text-color)]">
                {folderTitle}
              </p>
              <p className="text-xs text-[var(--tg-theme-hint-color)]">
                {t.folders.collectionSettings || 'Collection Settings'}
              </p>
            </div>
          </div>
        </div>

        {/* Collection Deadline */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--tg-theme-text-color)]">
            <Calendar size={16} />
            {t.folders.collectionDeadline || 'Collection deadline'}
          </label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="w-full px-4 py-3 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] border border-white/10 text-[var(--tg-theme-text-color)] focus:outline-none focus:border-blue-500"
            disabled={updateMutation.isPending}
          />
          <p className="text-xs text-[var(--tg-theme-hint-color)]">
            {t.folders.noLimit || 'Leave empty for no deadline'}
          </p>
        </div>

        {/* Max Channels */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--tg-theme-text-color)]">
            <Hash size={16} />
            {t.folders.maxChannels || 'Max channels'}
          </label>
          <input
            type="number"
            min="1"
            value={maxChannels}
            onChange={(e) => setMaxChannels(e.target.value)}
            placeholder={t.folders.noLimit || 'No limit'}
            className="w-full px-4 py-3 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] border border-white/10 text-[var(--tg-theme-text-color)] placeholder:text-[var(--tg-theme-hint-color)] focus:outline-none focus:border-blue-500"
            disabled={updateMutation.isPending}
          />
        </div>

        {/* Min Subscribers */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-[var(--tg-theme-text-color)]">
            <Users size={16} />
            {t.folders.minSubscribers || 'Min subscribers'}
          </label>
          <input
            type="number"
            min="0"
            value={minSubscribers}
            onChange={(e) => setMinSubscribers(e.target.value)}
            placeholder={t.folders.noLimit || 'No limit'}
            className="w-full px-4 py-3 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] border border-white/10 text-[var(--tg-theme-text-color)] placeholder:text-[var(--tg-theme-hint-color)] focus:outline-none focus:border-blue-500"
            disabled={updateMutation.isPending}
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={updateMutation.isPending}
            className="flex-1"
          >
            {t.common.cancel}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={updateMutation.isPending}
            className="flex-1"
          >
            {t.common.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
