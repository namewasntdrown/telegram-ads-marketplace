import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';

@Injectable()
export class TelegramClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramClientService.name);
  private client: TelegramClient | null = null;
  private initialized = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.initialize();
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.disconnect();
    }
  }

  private async initialize(): Promise<void> {
    const apiId = parseInt(
      this.configService.get<string>('TELEGRAM_API_ID') ?? '0',
      10
    );
    const apiHash = this.configService.get<string>('TELEGRAM_API_HASH');
    const sessionString = this.configService.get<string>('TELEGRAM_SESSION');

    if (!apiId || !apiHash) {
      this.logger.warn('TELEGRAM_API_ID or TELEGRAM_API_HASH not configured');
      return;
    }

    try {
      const session = new StringSession(sessionString ?? '');

      this.client = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
      });

      // For production, TELEGRAM_SESSION must be pre-configured
      // Use the separate auth script to generate a session string
      if (!sessionString) {
        this.logger.warn('TELEGRAM_SESSION not configured. Run auth script first.');
        return;
      }

      await this.client.connect();

      // Verify connection is working
      const me = await this.client.getMe();
      this.logger.log(`Connected as: ${(me as Api.User).username ?? (me as Api.User).id}`);

      this.initialized = true;
      this.logger.log('Telegram MTProto client initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Telegram client', error);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getClient(): TelegramClient {
    if (!this.client || !this.initialized) {
      throw new Error('Telegram client not initialized');
    }
    return this.client;
  }

  async getChannelInfo(
    channelId: string | number
  ): Promise<{
    id: string;
    title: string;
    username?: string;
    subscriberCount: number;
    description?: string;
  } | null> {
    if (!this.client) return null;

    try {
      const entity = await this.client.getEntity(channelId);

      if (entity instanceof Api.Channel) {
        const fullChannel = await this.client.invoke(
          new Api.channels.GetFullChannel({ channel: entity })
        );

        const fullChat = fullChannel.fullChat as Api.ChannelFull;

        // Telegram Bot API requires channel IDs in format -100XXXXXXXXXX
        // MTProto returns raw ID, so we need to add -100 prefix
        const botApiId = `-100${entity.id.toString()}`;

        return {
          id: botApiId,
          title: entity.title,
          username: entity.username ?? undefined,
          subscriberCount: fullChat.participantsCount ?? 0,
          description: fullChat.about ?? undefined,
        };
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to get channel info: ${error}`);
      return null;
    }
  }

  async getChannelMessages(
    channelId: string | number,
    limit: number = 100
  ): Promise<Api.Message[]> {
    if (!this.client) return [];

    try {
      const messages = await this.client.getMessages(channelId, { limit });
      return messages.filter((m) => m instanceof Api.Message) as Api.Message[];
    } catch (error) {
      this.logger.error(`Failed to get channel messages: ${error}`);
      return [];
    }
  }

  async getMessage(
    channelId: string | number,
    messageId: number
  ): Promise<Api.Message | null> {
    if (!this.client) return null;

    try {
      const messages = await this.client.getMessages(channelId, {
        ids: [messageId],
      });
      const message = messages[0];
      return message instanceof Api.Message ? message : null;
    } catch (error) {
      this.logger.error(`Failed to get message: ${error}`);
      return null;
    }
  }

  async sendMessage(
    channelId: string | number,
    text: string,
    mediaUrls?: string[]
  ): Promise<{ messageId: number; postUrl: string } | null> {
    if (!this.client) return null;

    try {
      let result: Api.Message;

      if (mediaUrls && mediaUrls.length > 0) {
        // Send with media
        const media = mediaUrls.map((url) => new Api.InputMediaPhotoExternal({ url }));

        if (media.length === 1) {
          result = (await this.client.sendMessage(channelId, {
            message: text,
            file: mediaUrls[0],
          })) as Api.Message;
        } else {
          // Multiple media - send as album
          const albumMessages = await this.client.sendFile(channelId, {
            file: mediaUrls,
            caption: text,
          });
          result = Array.isArray(albumMessages)
            ? (albumMessages[0] as Api.Message)
            : (albumMessages as Api.Message);
        }
      } else {
        result = (await this.client.sendMessage(channelId, {
          message: text,
        })) as Api.Message;
      }

      // Get channel username for post URL
      const entity = await this.client.getEntity(channelId);
      let postUrl = '';

      if (entity instanceof Api.Channel && entity.username) {
        postUrl = `https://t.me/${entity.username}/${result.id}`;
      } else {
        postUrl = `https://t.me/c/${entity.id}/${result.id}`;
      }

      return {
        messageId: result.id,
        postUrl,
      };
    } catch (error) {
      this.logger.error(`Failed to send message: ${error}`);
      return null;
    }
  }

  async getMessageViews(
    channelId: string | number,
    messageId: number
  ): Promise<number> {
    const message = await this.getMessage(channelId, messageId);
    return message?.views ?? 0;
  }

  async checkMessageExists(
    channelId: string | number,
    messageId: number
  ): Promise<boolean> {
    const message = await this.getMessage(channelId, messageId);
    return message !== null;
  }

  /**
   * Get channel broadcast statistics (requires admin access)
   * Returns audience geography and other stats
   */
  async getChannelStats(
    channelId: string | number
  ): Promise<{
    audienceGeo: { [country: string]: number };
    languageStats: { [lang: string]: number };
  } | null> {
    if (!this.client) return null;

    try {
      const entity = await this.client.getEntity(channelId);

      if (!(entity instanceof Api.Channel)) {
        return null;
      }

      // Try to get broadcast stats (requires admin access)
      const stats = await this.client.invoke(
        new Api.stats.GetBroadcastStats({
          channel: entity,
          dark: false,
        })
      );

      // Parse audience geography from stats
      const audienceGeo: { [country: string]: number } = {};
      const languageStats: { [lang: string]: number } = {};

      if (stats.recentPostsInteractions) {
        // Stats available
        this.logger.log(`Got broadcast stats for channel ${channelId}`);
      }

      // Parse country stats if available
      if ((stats as any).countriesGraph?.json) {
        try {
          const geoData = JSON.parse((stats as any).countriesGraph.json);
          if (geoData.columns) {
            const countries = geoData.columns.find((c: any) => c[0] === 'x');
            const values = geoData.columns.find((c: any) => c[0] === 'y');
            if (countries && values) {
              for (let i = 1; i < countries.length; i++) {
                audienceGeo[countries[i]] = values[i] || 0;
              }
            }
          }
        } catch (e) {
          this.logger.warn('Failed to parse geo data');
        }
      }

      // Parse language stats if available
      if ((stats as any).languagesGraph?.json) {
        try {
          const langData = JSON.parse((stats as any).languagesGraph.json);
          if (langData.columns) {
            const langs = langData.columns.find((c: any) => c[0] === 'x');
            const values = langData.columns.find((c: any) => c[0] === 'y');
            if (langs && values) {
              for (let i = 1; i < langs.length; i++) {
                languageStats[langs[i]] = values[i] || 0;
              }
            }
          }
        } catch (e) {
          this.logger.warn('Failed to parse language data');
        }
      }

      return { audienceGeo, languageStats };
    } catch (error: any) {
      // BROADCAST_REQUIRED or CHAT_ADMIN_REQUIRED means no access
      if (error.message?.includes('BROADCAST') || error.message?.includes('ADMIN')) {
        this.logger.debug(`No stats access for channel ${channelId}`);
      } else {
        this.logger.error(`Failed to get channel stats: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Get channels from a shared folder link
   * @param folderHash - the hash from t.me/addlist/HASH
   */
  async getFolderChannels(
    folderHash: string
  ): Promise<{
    title: string;
    channels: Array<{
      id: string;
      title: string;
      username?: string;
      subscriberCount: number;
    }>;
  } | null> {
    if (!this.client) return null;

    try {
      // Use chatlists.checkChatlistInvite to get folder contents
      const result = await this.client.invoke(
        new Api.chatlists.CheckChatlistInvite({
          slug: folderHash,
        })
      );

      const channels: Array<{
        id: string;
        title: string;
        username?: string;
        subscriberCount: number;
      }> = [];

      // Result contains chats array
      if ('chats' in result) {
        for (const chat of result.chats) {
          if (chat instanceof Api.Channel) {
            // Convert to Bot API format ID
            const botApiId = `-100${chat.id.toString()}`;
            channels.push({
              id: botApiId,
              title: chat.title,
              username: chat.username ?? undefined,
              subscriberCount: chat.participantsCount ?? 0,
            });
          }
        }
      }

      // Get folder title
      let title = 'Folder';
      if ('title' in result && result.title) {
        title = typeof result.title === 'string' ? result.title : (result.title as any).text || 'Folder';
      }

      this.logger.log(`Got ${channels.length} channels from folder ${folderHash}`);

      return { title, channels };
    } catch (error: any) {
      this.logger.error(`Failed to get folder channels: ${error.message}`);
      return null;
    }
  }
}
