import { Injectable, Logger } from '@nestjs/common';
import { TelegramClientService } from './telegram-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { Api, TelegramClient } from 'telegram';
import { DealStatus } from '@tam/shared-types';

export interface ChannelStatsResult {
  subscriberCount: number;
  avgViews: number;
  postsCount: number;
  engagement: number;
  language: string;
}

export interface HistoryDataPoint {
  date: string; // ISO date string YYYY-MM-DD
  value: number;
}

export interface GrowthStatWithPercent {
  current: number;
  change: number;
  percent: number;
}

export interface TelegramGrowthStats {
  followers: GrowthStatWithPercent;
  viewsPerPost: GrowthStatWithPercent;
  sharesPerPost: GrowthStatWithPercent;
}

export interface VerifiedStatsResult {
  languageStats: { [lang: string]: number };
  audienceGeo: { [country: string]: number };
  premiumStats?: { premiumPercent: number }; // Optional - only set when data is available
  viewSourceStats: { [source: string]: number };
  peakHours: number[];
  viewsHistory: HistoryDataPoint[];
  followersHistory: HistoryDataPoint[];
  growthStats: {
    followers: { current: number; change: number };
    viewsPerPost: { current: number; change: number };
    sharesPerPost: { current: number; change: number };
  };
  telegramGrowthStats: TelegramGrowthStats;
}

@Injectable()
export class ChannelStatsService {
  private readonly logger = new Logger(ChannelStatsService.name);

  constructor(
    private telegramClient: TelegramClientService,
    private prisma: PrismaService
  ) {}

  /**
   * Fetch verified stats using the platform's MTProto client (sha6kii's account)
   * Used for verified channels where sha6kii is an admin
   */
  async fetchVerifiedStatsWithPlatformClient(
    channelId: string,
    telegramChannelId: string
  ): Promise<VerifiedStatsResult | null> {
    if (!this.telegramClient.isInitialized()) {
      this.logger.warn('Telegram client not initialized');
      return null;
    }

    try {
      const client = this.telegramClient.getClient();
      const entity = await client.getEntity(telegramChannelId);

      if (!(entity instanceof Api.Channel)) {
        this.logger.warn(`Entity is not a channel: ${telegramChannelId}`);
        return null;
      }

      // Fetch broadcast stats (requires admin access)
      // Handle STATS_MIGRATE error by retrying on the correct DC
      let stats: Api.stats.BroadcastStats;
      let statsDcId: number | undefined;
      try {
        stats = await client.invoke(
          new Api.stats.GetBroadcastStats({
            channel: entity,
            dark: false,
          })
        );
      } catch (migrateError: any) {
        // Handle STATS_MIGRATE_X error - stats are on a different datacenter
        const migrateMatch = migrateError.message?.match(/STATS_MIGRATE_(\d+)/);
        if (migrateMatch) {
          statsDcId = parseInt(migrateMatch[1], 10);
          this.logger.log(`Stats migration required to DC${statsDcId} for channel ${channelId}`);

          // Invoke on the target datacenter
          stats = await client.invoke(
            new Api.stats.GetBroadcastStats({
              channel: entity,
              dark: false,
            }),
            statsDcId
          );
        } else {
          throw migrateError;
        }
      }

      const result: VerifiedStatsResult = {
        languageStats: {},
        audienceGeo: {},
        // premiumStats is not initialized - will be set only when data is fetched
        viewSourceStats: {},
        peakHours: [],
        viewsHistory: [],
        followersHistory: [],
        growthStats: {
          followers: { current: 0, change: 0 },
          viewsPerPost: { current: 0, change: 0 },
          sharesPerPost: { current: 0, change: 0 },
        },
        telegramGrowthStats: {
          followers: { current: 0, change: 0, percent: 0 },
          viewsPerPost: { current: 0, change: 0, percent: 0 },
          sharesPerPost: { current: 0, change: 0, percent: 0 },
        },
      };

      // Parse followers graph
      if (stats.followers) {
        result.growthStats.followers = this.parseStatsAbsValueAndPrev(stats.followers);
        result.telegramGrowthStats.followers = this.parseStatsWithPercent(stats.followers);
      }

      // Parse views per post
      if (stats.viewsPerPost) {
        result.growthStats.viewsPerPost = this.parseStatsAbsValueAndPrev(stats.viewsPerPost);
        result.telegramGrowthStats.viewsPerPost = this.parseStatsWithPercent(stats.viewsPerPost);
        this.logger.debug(`Telegram viewsPerPost: current=${result.growthStats.viewsPerPost.current}, change=${result.growthStats.viewsPerPost.change}`);
      }

      // Parse shares per post
      if (stats.sharesPerPost) {
        result.growthStats.sharesPerPost = this.parseStatsAbsValueAndPrev(stats.sharesPerPost);
        result.telegramGrowthStats.sharesPerPost = this.parseStatsWithPercent(stats.sharesPerPost);
      }

      // Log available graphs in the stats response
      this.logger.debug(`Available stats graphs: languagesGraph=${!!stats.languagesGraph}, ` +
        `viewsBySourceGraph=${!!(stats as any).viewsBySourceGraph}, ` +
        `viewsByHourGraph=${!!(stats as any).viewsByHourGraph}, ` +
        `topHoursGraph=${!!(stats as any).topHoursGraph}, ` +
        `growthGraph=${!!(stats as any).growthGraph}, ` +
        `followersGraph=${!!(stats as any).followersGraph}, ` +
        `muteGraph=${!!(stats as any).muteGraph}, ` +
        `recentMessageInteractions=${!!(stats as any).recentMessageInteractions}`);

      // Fetch premium audience stats from BoostsStatus API
      try {
        const boostsStatus = await client.invoke(
          new Api.premium.GetBoostsStatus({
            peer: entity,
          })
        );

        if (boostsStatus.premiumAudience) {
          const { part, total } = boostsStatus.premiumAudience;
          if (total > 0) {
            const premiumPercent = Math.round((part / total) * 1000) / 10; // Round to 1 decimal place
            result.premiumStats = { premiumPercent };
            this.logger.debug(`Premium audience: ${part}/${total} = ${premiumPercent}%`);
          }
        }
      } catch (boostError: any) {
        this.logger.debug(`Could not fetch premium audience: ${boostError.message}`);
      }

      // Parse language stats from graph (pass statsDcId for STATS_MIGRATE cases)
      result.languageStats = await this.parseStatsGraph(client, stats.languagesGraph, entity, statsDcId);

      // Parse view source stats
      if ((stats as any).viewsBySourceGraph) {
        result.viewSourceStats = await this.parseStatsGraph(
          client,
          (stats as any).viewsBySourceGraph,
          entity,
          statsDcId
        );
      }

      // Parse peak hours from hourly views graph
      if ((stats as any).viewsByHourGraph) {
        result.peakHours = await this.parsePeakHoursFromGraph(
          client,
          (stats as any).viewsByHourGraph,
          statsDcId
        );
      }

      // Alternative: topHoursGraph
      if (!result.peakHours?.length && (stats as any).topHoursGraph) {
        result.peakHours = await this.parsePeakHoursFromGraph(
          client,
          (stats as any).topHoursGraph,
          statsDcId
        );
      }

      // Parse views history from interactionsGraph (contains views/reactions over time)
      if ((stats as any).interactionsGraph) {
        result.viewsHistory = await this.parseViewsGraph(
          client,
          (stats as any).interactionsGraph,
          statsDcId
        );
      }

      // Parse followers history from followersGraph (contains joined/left data)
      // Use parseFollowersGraph which computes net change (joined - left)
      if ((stats as any).followersGraph) {
        result.followersHistory = await this.parseFollowersGraph(
          client,
          (stats as any).followersGraph,
          statsDcId
        );
      } else if ((stats as any).growthGraph) {
        // Fallback to growthGraph if followersGraph not available
        result.followersHistory = await this.parseFollowersGraph(
          client,
          (stats as any).growthGraph,
          statsDcId
        );
      }

      // Update channel with verified stats
      await this.prisma.channel.update({
        where: { id: channelId },
        data: {
          hasVerifiedStats: true,
          languageStats: result.languageStats,
          audienceGeo: result.audienceGeo,
          premiumStats: result.premiumStats,
          viewSourceStats: result.viewSourceStats,
          viewsHistory: result.viewsHistory?.length ? (result.viewsHistory as any) : undefined,
          followersHistory: result.followersHistory?.length ? (result.followersHistory as any) : undefined,
          peakHours: result.peakHours?.length ? result.peakHours : undefined,
          telegramGrowthStats: result.telegramGrowthStats as any,
          lastStatsUpdate: new Date(),
        },
      });

      this.logger.log(
        `Fetched verified stats for channel ${channelId}: ` +
          `${Object.keys(result.languageStats).length} languages, ` +
          `${Object.keys(result.audienceGeo).length} countries`
      );

      return result;
    } catch (error: any) {
      if (error.message?.includes('BROADCAST') || error.message?.includes('ADMIN')) {
        this.logger.debug(`No stats access for channel ${channelId}: ${error.message}`);
      } else {
        this.logger.error(`Failed to fetch verified stats: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Parse Telegram stats absolute value with previous value
   */
  private parseStatsAbsValueAndPrev(stat: any): { current: number; change: number } {
    if (stat && typeof stat === 'object') {
      return {
        current: stat.current ?? 0,
        change: stat.previous ? stat.current - stat.previous : 0,
      };
    }
    return { current: 0, change: 0 };
  }

  /**
   * Parse Telegram stats with percentage change
   */
  private parseStatsWithPercent(stat: any): GrowthStatWithPercent {
    if (stat && typeof stat === 'object') {
      const current = stat.current ?? 0;
      const previous = stat.previous ?? 0;
      const change = current - previous;
      const percent = previous > 0 ? Math.round((change / previous) * 1000) / 10 : 0;
      return { current, change, percent };
    }
    return { current: 0, change: 0, percent: 0 };
  }

  /**
   * Parse Telegram stats graph (requires loading JSON data)
   */
  private async parseStatsGraph(
    client: TelegramClient,
    graph: any,
    _channel: Api.Channel,
    dcId?: number
  ): Promise<{ [key: string]: number }> {
    const result: { [key: string]: number } = {};

    if (!graph) return result;

    try {
      // If graph is a StatsGraphAsync, we need to load it
      if (graph instanceof Api.StatsGraphAsync) {
        // Use dcId if provided (for STATS_MIGRATE cases)
        const loaded = dcId
          ? await client.invoke(
              new Api.stats.LoadAsyncGraph({
                token: graph.token,
              }),
              dcId
            )
          : await client.invoke(
              new Api.stats.LoadAsyncGraph({
                token: graph.token,
              })
            );
        if (loaded instanceof Api.StatsGraph && loaded.json) {
          return this.parseGraphJson(loaded.json.data);
        }
      }

      // If graph is already StatsGraph with JSON
      if (graph instanceof Api.StatsGraph && graph.json) {
        return this.parseGraphJson(graph.json.data);
      }

      // Try direct JSON access
      if (graph.json?.data) {
        return this.parseGraphJson(graph.json.data);
      }
    } catch (error) {
      this.logger.debug(`Failed to parse stats graph: ${error}`);
    }

    return result;
  }

  /**
   * Parse JSON data from Telegram stats graph
   * Handles two formats:
   * 1. Pie chart: names object maps column IDs to labels, columns contain values
   * 2. Time series: x column has timestamps, y columns have values over time
   */
  private parseGraphJson(jsonData: string): { [key: string]: number } {
    const result: { [key: string]: number } = {};

    try {
      const data = JSON.parse(jsonData);

      // Log the raw structure for debugging (only in debug level)

      // Log the structure for debugging
      this.logger.debug(`Graph data structure: ${JSON.stringify({
        hasNames: !!data.names,
        hasColumns: !!data.columns,
        hasTypes: !!data.types,
        namesKeys: data.names ? Object.keys(data.names) : [],
        typesKeys: data.types ? Object.keys(data.types) : [],
        columnsCount: data.columns?.length,
        firstColumnId: data.columns?.[0]?.[0],
        firstColumnLength: data.columns?.[0]?.length,
        sampleColumnData: data.columns?.[0]?.slice(0, 5),
      })}`);

      // Pie chart format: Telegram returns data like:
      // { "columns": [["y0", 1234], ["y1", 5678]], "names": {"y0": "Russian", "y1": "English"}, "types": {"y0": "pie"} }
      // Note: For pie charts, each column has exactly 2 elements: [columnId, value]
      if (data.names && typeof data.names === 'object' && data.columns && Array.isArray(data.columns)) {
        const names = data.names as Record<string, string>;
        const types = data.types as Record<string, string> | undefined;
        const rawValues: Record<string, number> = {};

        // Check if this is a pie chart by looking at types
        const isPieChart = types && Object.values(types).some(t => t === 'pie');

        this.logger.debug(`Parsing graph: isPieChart=${isPieChart}, columns=${data.columns.length}`);

        for (const column of data.columns) {
          if (!Array.isArray(column) || column.length < 2) continue;

          const columnId = column[0]; // e.g., "y0", "y1", "x"
          if (columnId === 'x') continue; // Skip timestamp column

          const label = names[columnId];
          if (label) {
            let value: number;
            if (isPieChart || column.length === 2) {
              // Pie chart: [columnId, value] - single value per category
              value = typeof column[1] === 'number' ? column[1] : 0;
            } else {
              // Time series: [columnId, val1, val2, ..., valN]
              // SUM all values to get total for this category (e.g., total views from Russian-speaking users)
              value = 0;
              for (let i = 1; i < column.length; i++) {
                if (typeof column[i] === 'number') {
                  value += column[i];
                }
              }
            }

            this.logger.debug(`Column ${columnId} (${label}): value=${value}, columnLength=${column.length}`);
            rawValues[label] = value;
          }
        }

        this.logger.debug(`Raw values before percentage: ${JSON.stringify(rawValues)}`);

        // Calculate total and convert to percentages
        const total = Object.values(rawValues).reduce((sum, val) => sum + val, 0);
        this.logger.debug(`Total sum: ${total}`);

        if (total > 0) {
          for (const [label, value] of Object.entries(rawValues)) {
            // Round to 1 decimal place
            result[label] = Math.round((value / total) * 1000) / 10;
          }
        } else {
          // If total is 0, just use raw values
          Object.assign(result, rawValues);
        }

        // If we found named data, return it
        if (Object.keys(result).length > 0) {
          this.logger.debug(`Parsed graph data (percentages): ${JSON.stringify(result)}`);
          return result;
        }
      }

      // Fallback: simple columns format without names (time series)
      // This format has x (timestamps) and y (values) columns
      if (data.columns && Array.isArray(data.columns) && !data.names) {
        const xColumn = data.columns.find((c: any[]) => c[0] === 'x');
        const yColumn = data.columns.find((c: any[]) => c[0] !== 'x' && Array.isArray(c));

        if (xColumn && yColumn) {
          // For time series, we don't want timestamp keys
          // Instead, just log that this is time series data
          this.logger.debug(`Time series graph detected, not suitable for category breakdown`);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to parse graph JSON: ${error}`);
    }

    return result;
  }

  /**
   * Parse followers graph with joined/left columns
   * Returns NET daily change (joined - left)
   */
  private async parseFollowersGraph(
    client: TelegramClient,
    graph: any,
    dcId?: number
  ): Promise<HistoryDataPoint[]> {
    const result: HistoryDataPoint[] = [];

    if (!graph) return result;

    try {
      let jsonData: string | null = null;

      // Load async graph if needed
      if (graph instanceof Api.StatsGraphAsync) {
        const loaded = dcId
          ? await client.invoke(
              new Api.stats.LoadAsyncGraph({ token: graph.token }),
              dcId
            )
          : await client.invoke(
              new Api.stats.LoadAsyncGraph({ token: graph.token })
            );
        if (loaded instanceof Api.StatsGraph && loaded.json) {
          jsonData = loaded.json.data;
        }
      } else if (graph instanceof Api.StatsGraph && graph.json) {
        jsonData = graph.json.data;
      } else if (graph?.json?.data) {
        jsonData = graph.json.data;
      }

      if (!jsonData) return result;

      const data = JSON.parse(jsonData);
      this.logger.debug(`Followers graph structure: names=${JSON.stringify(data.names)}, columns=${data.columns?.length}`);

      if (data.columns && Array.isArray(data.columns)) {
        const xColumn = data.columns.find((c: any[]) => c[0] === 'x');
        const yColumns = data.columns.filter((c: any[]) => c[0] !== 'x' && Array.isArray(c));

        if (xColumn && yColumns.length > 0) {
          // Identify joined vs left columns by name
          let joinedColumn: any[] | null = null;
          let leftColumn: any[] | null = null;

          if (data.names) {
            for (const col of yColumns) {
              const colId = col[0];
              const name = data.names[colId]?.toLowerCase() || '';
              if (name.includes('joined') || name.includes('new') || name.includes('подписал')) {
                joinedColumn = col;
              } else if (name.includes('left') || name.includes('отписал')) {
                leftColumn = col;
              }
            }
          }

          // If we couldn't identify by name, assume first is joined, second is left
          if (!joinedColumn && !leftColumn && yColumns.length >= 2) {
            joinedColumn = yColumns[0];
            leftColumn = yColumns[1];
          } else if (!joinedColumn && yColumns.length === 1) {
            // Single column - use as-is (might be net change already)
            joinedColumn = yColumns[0];
          }

          this.logger.debug(`Followers columns: joined=${!!joinedColumn}, left=${!!leftColumn}`);

          // x column contains timestamps (in milliseconds)
          for (let i = 1; i < xColumn.length; i++) {
            const timestamp = xColumn[i];

            // Calculate net change: joined - left
            const joined = joinedColumn && i < joinedColumn.length ? Number(joinedColumn[i]) || 0 : 0;
            const left = leftColumn && i < leftColumn.length ? Number(leftColumn[i]) || 0 : 0;
            const netChange = joined - left;

            // Convert timestamp to date string
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) continue;
            const dateStr = date.toISOString().substring(0, 10);

            result.push({
              date: dateStr,
              value: netChange,
            });
          }
        }
      }

      this.logger.debug(`Parsed followers graph: ${result.length} data points, sample: ${JSON.stringify(result.slice(0, 3))}`);
    } catch (error) {
      this.logger.debug(`Failed to parse followers graph: ${error}`);
    }

    return result;
  }

  /**
   * Parse views/interactions graph
   * Returns daily view counts
   */
  private async parseViewsGraph(
    client: TelegramClient,
    graph: any,
    dcId?: number
  ): Promise<HistoryDataPoint[]> {
    const result: HistoryDataPoint[] = [];

    if (!graph) return result;

    try {
      let jsonData: string | null = null;

      if (graph instanceof Api.StatsGraphAsync) {
        const loaded = dcId
          ? await client.invoke(
              new Api.stats.LoadAsyncGraph({ token: graph.token }),
              dcId
            )
          : await client.invoke(
              new Api.stats.LoadAsyncGraph({ token: graph.token })
            );
        if (loaded instanceof Api.StatsGraph && loaded.json) {
          jsonData = loaded.json.data;
        }
      } else if (graph instanceof Api.StatsGraph && graph.json) {
        jsonData = graph.json.data;
      } else if (graph?.json?.data) {
        jsonData = graph.json.data;
      }

      if (!jsonData) return result;

      const data = JSON.parse(jsonData);
      this.logger.debug(`Views graph structure: names=${JSON.stringify(data.names)}, columns=${data.columns?.length}`);

      if (data.columns && Array.isArray(data.columns)) {
        const xColumn = data.columns.find((c: any[]) => c[0] === 'x');
        const yColumns = data.columns.filter((c: any[]) => c[0] !== 'x' && Array.isArray(c));

        if (xColumn && yColumns.length > 0) {
          for (let i = 1; i < xColumn.length; i++) {
            const timestamp = xColumn[i];

            // Sum all y columns for total views
            let totalViews = 0;
            for (const yCol of yColumns) {
              if (i < yCol.length) {
                totalViews += Number(yCol[i]) || 0;
              }
            }

            const date = new Date(timestamp);
            if (isNaN(date.getTime())) continue;
            const dateStr = date.toISOString().substring(0, 10);

            result.push({
              date: dateStr,
              value: totalViews,
            });
          }
        }
      }

      this.logger.debug(`Parsed views graph: ${result.length} data points`);
    } catch (error) {
      this.logger.debug(`Failed to parse views graph: ${error}`);
    }

    return result;
  }

  /**
   * Parse peak hours from Telegram hourly views graph
   * Returns top 4 hours with highest activity
   */
  private async parsePeakHoursFromGraph(
    client: TelegramClient,
    graph: any,
    dcId?: number
  ): Promise<number[]> {
    try {
      let jsonData: string | null = null;

      // If graph is a StatsGraphAsync, we need to load it
      if (graph instanceof Api.StatsGraphAsync) {
        // Use dcId if provided (for STATS_MIGRATE cases)
        const loaded = dcId
          ? await client.invoke(
              new Api.stats.LoadAsyncGraph({
                token: graph.token,
              }),
              dcId
            )
          : await client.invoke(
              new Api.stats.LoadAsyncGraph({
                token: graph.token,
              })
            );
        if (loaded instanceof Api.StatsGraph && loaded.json) {
          jsonData = loaded.json.data;
        }
      } else if (graph instanceof Api.StatsGraph && graph.json) {
        jsonData = graph.json.data;
      } else if (graph?.json?.data) {
        jsonData = graph.json.data;
      }

      if (!jsonData) {
        this.logger.debug('Peak hours graph: no JSON data available');
        return [];
      }

      const data = JSON.parse(jsonData);
      this.logger.debug(`Peak hours graph structure: hasNames=${!!data.names}, ` +
        `hasColumns=${!!data.columns}, columnsCount=${data.columns?.length}`);

      const hourlyViews: { hour: number; views: number }[] = [];

      // Check if this is a named graph (like language stats)
      if (data.names && data.columns) {
        // Sum all y-series for each hour position
        const yColumns = data.columns.filter((c: any[]) => c[0] !== 'x');
        if (yColumns.length > 0 && yColumns[0].length > 1) {
          // Assuming 24 hours worth of data
          const numHours = Math.min(24, yColumns[0].length - 1);
          for (let hour = 0; hour < numHours; hour++) {
            let totalViews = 0;
            for (const yCol of yColumns) {
              totalViews += Number(yCol[hour + 1]) || 0;
            }
            hourlyViews.push({ hour, views: totalViews });
          }
        }
      } else if (data.columns && Array.isArray(data.columns)) {
        // Simple columns format
        const yColumn = data.columns.find((c: any[]) => c[0] !== 'x' && Array.isArray(c));
        if (yColumn) {
          const numHours = Math.min(24, yColumn.length - 1);
          for (let hour = 0; hour < numHours; hour++) {
            hourlyViews.push({
              hour,
              views: Number(yColumn[hour + 1]) || 0,
            });
          }
        }
      }

      this.logger.debug(`Parsed ${hourlyViews.length} hourly data points`);

      // Sort by views descending and take top 4 hours
      const topHours = hourlyViews
        .sort((a, b) => b.views - a.views)
        .slice(0, 4)
        .map((h) => h.hour)
        .sort((a, b) => a - b);

      this.logger.debug(`Peak hours: ${JSON.stringify(topHours)}`);
      return topHours;
    } catch (error) {
      this.logger.debug(`Failed to parse peak hours graph: ${error}`);
      return [];
    }
  }

  /**
   * Detect language based on character ranges in text
   */
  private detectLanguage(text: string): string {
    if (!text) return 'en';

    const cyrillicCount = (text.match(/[\u0400-\u04FF]/g) || []).length;
    const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
    const arabicCount = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const chineseCount = (text.match(/[\u4E00-\u9FFF]/g) || []).length;

    const total = cyrillicCount + latinCount + arabicCount + chineseCount;
    if (total === 0) return 'en';

    if (cyrillicCount / total > 0.3) return 'ru';
    if (arabicCount / total > 0.3) return 'ar';
    if (chineseCount / total > 0.3) return 'zh';
    return 'en';
  }

  async updateChannelStats(
    channelId: string,
    telegramChannelId: string
  ): Promise<ChannelStatsResult | null> {
    if (!this.telegramClient.isInitialized()) {
      this.logger.warn('Telegram client not initialized');
      return null;
    }

    try {
      // Get channel from database to check verification status
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId },
        select: { isVerified: true },
      });

      // Get channel info
      const channelInfo = await this.telegramClient.getChannelInfo(
        telegramChannelId
      );

      if (!channelInfo) {
        this.logger.error(`Channel not found: ${telegramChannelId}`);
        return null;
      }

      // Get recent messages for stats (100 for better analysis)
      const messages = await this.telegramClient.getChannelMessages(
        telegramChannelId,
        100
      );

      // Calculate average views
      const viewsArray = messages
        .filter((m) => m.views !== undefined)
        .map((m) => m.views ?? 0);

      const avgViews =
        viewsArray.length > 0
          ? Math.round(
              viewsArray.reduce((a, b) => a + b, 0) / viewsArray.length
            )
          : 0;

      // Calculate engagement rate
      const engagement =
        channelInfo.subscriberCount > 0
          ? (avgViews / channelInfo.subscriberCount) * 100
          : 0;

      // Detect language from recent posts
      const textContent = messages
        .slice(0, 20)
        .map((m) => m.message || '')
        .join(' ');
      const detectedLanguage = this.detectLanguage(textContent);

      // Try to fetch verified stats if channel is verified (sha6kii is admin)
      let verifiedStats: VerifiedStatsResult | null = null;

      if (channel?.isVerified) {
        this.logger.log(`Fetching verified stats for verified channel ${channelId}`);
        verifiedStats = await this.fetchVerifiedStatsWithPlatformClient(
          channelId,
          telegramChannelId
        );
      }

      const stats: ChannelStatsResult = {
        subscriberCount: channelInfo.subscriberCount,
        avgViews,
        postsCount: messages.length,
        engagement: Math.min(engagement, 100),
        language: detectedLanguage,
      };

      // Calculate subscriber growth from history
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);

      const [weekStats, monthStats] = await Promise.all([
        this.prisma.channelStats.findFirst({
          where: { channelId, date: { lte: weekAgo } },
          orderBy: { date: 'desc' },
        }),
        this.prisma.channelStats.findFirst({
          where: { channelId, date: { lte: monthAgo } },
          orderBy: { date: 'desc' },
        }),
      ]);

      const subscriberGrowthWeek = weekStats
        ? stats.subscriberCount - weekStats.subscriberCount
        : 0;
      const subscriberGrowthMonth = monthStats
        ? stats.subscriberCount - monthStats.subscriberCount
        : 0;

      // Update channel in database with basic stats
      const updateData: any = {
        telegramId: BigInt(channelInfo.id),
        title: channelInfo.title,
        username: channelInfo.username,
        description: channelInfo.description,
        subscriberCount: stats.subscriberCount,
        avgViews: stats.avgViews,
        engagementRate: Math.round(stats.engagement * 10) / 10,
        subscriberGrowthWeek,
        subscriberGrowthMonth,
        language: detectedLanguage,
      };

      // Add verified stats fields only for verified channels
      if (verifiedStats) {
        updateData.hasVerifiedStats = true;
        updateData.lastStatsUpdate = new Date();

        // Use official Telegram viewsPerPost instead of our calculation
        if (verifiedStats.growthStats.viewsPerPost.current > 0) {
          updateData.avgViews = verifiedStats.growthStats.viewsPerPost.current;
          // Recalculate engagement with official views
          updateData.engagementRate = stats.subscriberCount > 0
            ? Math.round((verifiedStats.growthStats.viewsPerPost.current / stats.subscriberCount) * 1000) / 10
            : 0;
        }

        // Language stats from Telegram
        if (Object.keys(verifiedStats.languageStats).length > 0) {
          updateData.languageStats = verifiedStats.languageStats;
        }

        // Premium stats
        if (verifiedStats.premiumStats) {
          updateData.premiumStats = verifiedStats.premiumStats;
        }

        // View source stats
        if (verifiedStats.viewSourceStats) {
          updateData.viewSourceStats = verifiedStats.viewSourceStats;
        }

        // Peak hours from Telegram stats (activity time)
        if (verifiedStats.peakHours && verifiedStats.peakHours.length > 0) {
          updateData.peakHours = verifiedStats.peakHours;
        }

        // Views and followers history
        if (verifiedStats.viewsHistory?.length) {
          updateData.viewsHistory = verifiedStats.viewsHistory as any;
        }
        if (verifiedStats.followersHistory?.length) {
          updateData.followersHistory = verifiedStats.followersHistory as any;
        }

        // Telegram growth stats with percentages
        if (verifiedStats.telegramGrowthStats) {
          updateData.telegramGrowthStats = verifiedStats.telegramGrowthStats;
        }
      } else {
        // For non-verified channels, clear any existing verified stats
        updateData.hasVerifiedStats = false;
        updateData.audienceGeo = null;
        updateData.languageStats = null;
        updateData.premiumStats = null;
        updateData.viewSourceStats = null;
        updateData.peakHours = null;
        updateData.telegramGrowthStats = null;
      }

      await this.prisma.channel.update({
        where: { id: channelId },
        data: updateData,
      });

      // Record stats history
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await this.prisma.channelStats.upsert({
        where: {
          channelId_date: {
            channelId,
            date: today,
          },
        },
        create: {
          channelId,
          date: today,
          subscriberCount: stats.subscriberCount,
          avgViews: stats.avgViews,
          postsCount: stats.postsCount,
          engagement: stats.engagement,
        },
        update: {
          subscriberCount: stats.subscriberCount,
          avgViews: stats.avgViews,
          postsCount: stats.postsCount,
          engagement: stats.engagement,
        },
      });

      this.logger.log(
        `Updated stats for channel ${channelId}: ${stats.subscriberCount} subs, ${stats.avgViews} views, ${detectedLanguage.toUpperCase()} lang`
      );

      return stats;
    } catch (error) {
      this.logger.error(`Failed to update channel stats: ${error}`);
      return null;
    }
  }

  /**
   * Update stats for all active channels
   */
  async updateAllChannelsStats(): Promise<void> {
    if (!this.telegramClient.isInitialized()) {
      this.logger.warn('Telegram client not initialized, skipping batch update');
      return;
    }

    const channels = await this.prisma.channel.findMany({
      where: { status: 'ACTIVE' },
    });

    this.logger.log(`Starting batch update for ${channels.length} channels`);

    for (const channel of channels) {
      try {
        const chatId = channel.username
          ? `@${channel.username}`
          : channel.telegramId.toString();

        await this.updateChannelStats(channel.id, chatId);

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        this.logger.error(
          `Failed to update channel ${channel.id}: ${error}`
        );
      }
    }

    this.logger.log('Batch update completed');
  }

  async verifyChannelOwnership(
    telegramChannelId: string,
    telegramUserId: string
  ): Promise<boolean> {
    if (!this.telegramClient.isInitialized()) {
      return false;
    }

    try {
      const client = this.telegramClient.getClient();
      const entity = await client.getEntity(telegramChannelId);

      if (!(entity instanceof Api.Channel)) {
        return false;
      }

      // Get channel participants (admins)
      const participants = await client.invoke(
        new Api.channels.GetParticipants({
          channel: entity,
          filter: new Api.ChannelParticipantsAdmins(),
          offset: 0,
          limit: 100,
        })
      );

      if (participants instanceof Api.channels.ChannelParticipants) {
        const userIdBigInt = BigInt(telegramUserId);
        return participants.participants.some((p) => {
          if (
            p instanceof Api.ChannelParticipantCreator ||
            p instanceof Api.ChannelParticipantAdmin
          ) {
            return p.userId.equals(userIdBigInt);
          }
          return false;
        });
      }

      return false;
    } catch (error) {
      this.logger.error(`Failed to verify channel ownership: ${error}`);
      return false;
    }
  }

  /**
   * Verify if sha6kii (platform's MTProto account) is an admin of the channel.
   * If verified, marks the channel as verified and fetches detailed stats.
   */
  async verifyChannelAdmin(
    channelId: string,
    telegramChannelId: string
  ): Promise<boolean> {
    if (!this.telegramClient.isInitialized()) {
      this.logger.warn('Telegram client not initialized');
      return false;
    }

    try {
      const client = this.telegramClient.getClient();
      const entity = await client.getEntity(telegramChannelId);

      if (!(entity instanceof Api.Channel)) {
        this.logger.warn(`Entity is not a channel: ${telegramChannelId}`);
        return false;
      }

      // Get the current user (sha6kii's account)
      const me = await client.getMe();
      if (!me) {
        this.logger.error('Failed to get current user');
        return false;
      }

      const myUserId = me.id;
      this.logger.log(`Checking if user ${myUserId} is admin of channel ${telegramChannelId}`);

      // Get channel participants (admins)
      const participants = await client.invoke(
        new Api.channels.GetParticipants({
          channel: entity,
          filter: new Api.ChannelParticipantsAdmins(),
          offset: 0,
          limit: 100,
        })
      );

      let isAdmin = false;

      if (participants instanceof Api.channels.ChannelParticipants) {
        isAdmin = participants.participants.some((p) => {
          if (
            p instanceof Api.ChannelParticipantCreator ||
            p instanceof Api.ChannelParticipantAdmin
          ) {
            return p.userId.equals(myUserId);
          }
          return false;
        });
      }

      if (!isAdmin) {
        this.logger.log(`User ${myUserId} is NOT an admin of channel ${telegramChannelId}`);
        return false;
      }

      this.logger.log(`User ${myUserId} IS an admin of channel ${telegramChannelId}, marking as verified`);

      // Mark channel as verified
      await this.prisma.channel.update({
        where: { id: channelId },
        data: {
          isVerified: true,
          verifiedAt: new Date(),
        },
      });

      // Try to fetch verified stats using the platform's MTProto session
      try {
        // Handle STATS_MIGRATE error by retrying on the correct DC
        let stats: Api.stats.BroadcastStats;
        let statsDcId: number | undefined;
        try {
          stats = await client.invoke(
            new Api.stats.GetBroadcastStats({
              channel: entity,
              dark: false,
            })
          );
        } catch (migrateError: any) {
          // Handle STATS_MIGRATE_X error - stats are on a different datacenter
          const migrateMatch = migrateError.message?.match(/STATS_MIGRATE_(\d+)/);
          if (migrateMatch) {
            statsDcId = parseInt(migrateMatch[1], 10);
            this.logger.log(`Stats migration required to DC${statsDcId} for channel ${channelId}`);

            // Invoke on the target datacenter
            stats = await client.invoke(
              new Api.stats.GetBroadcastStats({
                channel: entity,
                dark: false,
              }),
              statsDcId
            );
          } else {
            throw migrateError;
          }
        }

        const verifiedStats: VerifiedStatsResult = {
          languageStats: {},
          audienceGeo: {},
          // premiumStats is not initialized - will be set only when data is fetched
          viewSourceStats: {},
          peakHours: [],
          viewsHistory: [],
          followersHistory: [],
          growthStats: {
            followers: { current: 0, change: 0 },
            viewsPerPost: { current: 0, change: 0 },
            sharesPerPost: { current: 0, change: 0 },
          },
          telegramGrowthStats: {
            followers: { current: 0, change: 0, percent: 0 },
            viewsPerPost: { current: 0, change: 0, percent: 0 },
            sharesPerPost: { current: 0, change: 0, percent: 0 },
          },
        };

        // Parse followers graph
        if (stats.followers) {
          verifiedStats.growthStats.followers = this.parseStatsAbsValueAndPrev(stats.followers);
          verifiedStats.telegramGrowthStats.followers = this.parseStatsWithPercent(stats.followers);
        }

        // Parse views per post
        if (stats.viewsPerPost) {
          verifiedStats.growthStats.viewsPerPost = this.parseStatsAbsValueAndPrev(stats.viewsPerPost);
          verifiedStats.telegramGrowthStats.viewsPerPost = this.parseStatsWithPercent(stats.viewsPerPost);
        }

        // Parse shares per post
        if (stats.sharesPerPost) {
          verifiedStats.growthStats.sharesPerPost = this.parseStatsAbsValueAndPrev(stats.sharesPerPost);
          verifiedStats.telegramGrowthStats.sharesPerPost = this.parseStatsWithPercent(stats.sharesPerPost);
        }

        // Parse language stats from graph (pass statsDcId for STATS_MIGRATE cases)
        verifiedStats.languageStats = await this.parseStatsGraph(client, stats.languagesGraph, entity, statsDcId);

        // Note: countriesGraph doesn't exist in BroadcastStats - audienceGeo stays empty

        // Parse view source stats
        if ((stats as any).viewsBySourceGraph) {
          verifiedStats.viewSourceStats = await this.parseStatsGraph(
            client,
            (stats as any).viewsBySourceGraph,
            entity,
            statsDcId
          );
        }

        // Parse peak hours from hourly views graph
        if ((stats as any).viewsByHourGraph) {
          verifiedStats.peakHours = await this.parsePeakHoursFromGraph(
            client,
            (stats as any).viewsByHourGraph,
            statsDcId
          );
        }

        // Alternative: topHoursGraph
        if (!verifiedStats.peakHours?.length && (stats as any).topHoursGraph) {
          verifiedStats.peakHours = await this.parsePeakHoursFromGraph(
            client,
            (stats as any).topHoursGraph,
            statsDcId
          );
        }

        // Fetch premium audience stats from BoostsStatus API
        try {
          const boostsStatus = await client.invoke(
            new Api.premium.GetBoostsStatus({
              peer: entity,
            })
          );

          if (boostsStatus.premiumAudience) {
            const { part, total } = boostsStatus.premiumAudience;
            if (total > 0) {
              const premiumPercent = Math.round((part / total) * 1000) / 10;
              verifiedStats.premiumStats = { premiumPercent };
              this.logger.debug(`Premium audience: ${part}/${total} = ${premiumPercent}%`);
            }
          }
        } catch (boostError: any) {
          this.logger.debug(`Could not fetch premium audience in verifyChannelAdmin: ${boostError.message}`);
        }

        // Update channel with verified stats
        await this.prisma.channel.update({
          where: { id: channelId },
          data: {
            hasVerifiedStats: true,
            languageStats: verifiedStats.languageStats,
            audienceGeo: verifiedStats.audienceGeo,
            premiumStats: verifiedStats.premiumStats,
            viewSourceStats: verifiedStats.viewSourceStats,
            peakHours: verifiedStats.peakHours,
            telegramGrowthStats: verifiedStats.telegramGrowthStats as any,
            lastStatsUpdate: new Date(),
          },
        });

        this.logger.log(
          `Fetched verified stats for channel ${channelId}: ` +
            `${Object.keys(verifiedStats.languageStats).length} languages, ` +
            `${Object.keys(verifiedStats.audienceGeo).length} countries`
        );
      } catch (statsError: any) {
        // Stats might not be available for small channels, but verification still succeeded
        if (statsError.message?.includes('BROADCAST_REQUIRED')) {
          this.logger.log(`Channel ${channelId} too small for detailed stats, but verification succeeded`);
        } else {
          this.logger.warn(`Could not fetch stats for verified channel ${channelId}: ${statsError.message}`);
        }
      }

      return true;
    } catch (error: any) {
      this.logger.error(`Failed to verify channel admin: ${error.message}`);
      return false;
    }
  }

  async updateChannelTrustMetrics(channelId: string): Promise<void> {
    try {
      // Get deal statistics
      const [completedDeals, totalDeals, reviews] = await Promise.all([
        this.prisma.deal.count({
          where: { channelId, status: DealStatus.RELEASED },
        }),
        this.prisma.deal.count({
          where: {
            channelId,
            status: {
              in: [
                DealStatus.RELEASED,
                DealStatus.CANCELLED,
                DealStatus.DISPUTED,
                DealStatus.REFUNDED,
              ],
            },
          },
        }),
        this.prisma.channelReview.findMany({
          where: { channelId },
          select: { rating: true },
        }),
      ]);

      // Calculate success rate
      const successRate =
        totalDeals > 0 ? (completedDeals / totalDeals) * 100 : 0;

      // Calculate average rating
      const avgRating =
        reviews.length > 0
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : 0;

      // Update channel
      await this.prisma.channel.update({
        where: { id: channelId },
        data: {
          completedDealsCount: completedDeals,
          successRate: Math.round(successRate * 10) / 10,
          rating: Math.round(avgRating * 10) / 10,
          reviewsCount: reviews.length,
        },
      });

      this.logger.log(
        `Updated trust metrics for channel ${channelId}: ${completedDeals} deals, ${successRate.toFixed(1)}% success, ${avgRating.toFixed(1)} rating`
      );
    } catch (error) {
      this.logger.error(`Failed to update trust metrics: ${error}`);
    }
  }
}
