/**
 * Script to update full stats for all channels including:
 * - Subscriber count & growth
 * - Average views
 * - Language detection
 * - Peak activity hours
 *
 * Run: npx ts-node apps/mtproto-worker/src/scripts/update-all-channels.ts
 */

import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { PrismaClient } from '@tam/prisma-client';

const API_ID = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
const API_HASH = process.env.TELEGRAM_API_HASH || '';
const SESSION = process.env.TELEGRAM_SESSION || '';

// Language detection based on character ranges
function detectLanguage(text: string): string {
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

// Analyze peak hours from message timestamps and views
function analyzePeakHours(messages: Api.Message[]): number[] {
  const hourViews: { [hour: number]: { views: number; count: number } } = {};

  // Initialize all hours
  for (let h = 0; h < 24; h++) {
    hourViews[h] = { views: 0, count: 0 };
  }

  for (const msg of messages) {
    if (msg.date && msg.views) {
      const hour = new Date(msg.date * 1000).getUTCHours();
      const hourData = hourViews[hour];
      if (hourData) {
        hourData.views += msg.views;
        hourData.count += 1;
      }
    }
  }

  // Calculate average views per hour
  const hourAvg = Object.entries(hourViews)
    .map(([hour, data]) => ({
      hour: parseInt(hour),
      avgViews: data.count > 0 ? data.views / data.count : 0,
    }))
    .sort((a, b) => b.avgViews - a.avgViews);

  // Return top 4 peak hours
  return hourAvg.slice(0, 4).map(h => h.hour).sort((a, b) => a - b);
}

async function main() {
  if (!API_ID || !API_HASH || !SESSION) {
    console.error('Error: TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_SESSION must be set');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const client = new TelegramClient(new StringSession(SESSION), API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.connect();
  console.log('Connected to Telegram MTProto\n');

  const channels = await prisma.channel.findMany();
  console.log(`Found ${channels.length} channels to update\n`);

  for (const channel of channels) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Updating: ${channel.title} (@${channel.username})`);
    console.log('='.repeat(50));

    try {
      const chatId = channel.username ? `@${channel.username}` : channel.telegramId.toString();
      const entity = await client.getEntity(chatId);

      if (!(entity instanceof Api.Channel)) {
        console.log('  ✗ Not a channel');
        continue;
      }

      // Get full channel info
      const fullChannel = await client.invoke(
        new Api.channels.GetFullChannel({ channel: entity })
      );
      const fullChat = fullChannel.fullChat as Api.ChannelFull;
      const newSubscriberCount = fullChat.participantsCount ?? 0;

      // Get messages for analysis (last 100 posts)
      const messages = await client.getMessages(chatId, { limit: 100 });
      const validMessages = messages.filter(
        (m): m is Api.Message => m instanceof Api.Message
      );

      // Calculate average views
      const viewsArray = validMessages
        .filter(m => m.views !== undefined)
        .map(m => m.views ?? 0);
      const avgViews = viewsArray.length > 0
        ? Math.round(viewsArray.reduce((a, b) => a + b, 0) / viewsArray.length)
        : 0;

      // Detect language from recent posts
      const textContent = validMessages
        .slice(0, 20)
        .map(m => m.message || '')
        .join(' ');
      const detectedLanguage = detectLanguage(textContent);

      // Analyze peak hours
      const peakHours = analyzePeakHours(validMessages);

      // Calculate engagement rate
      const engagementRate = newSubscriberCount > 0
        ? Math.min((avgViews / newSubscriberCount) * 100, 100)
        : 0;

      // Get historical stats for growth calculation
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);

      const [weekStats, monthStats] = await Promise.all([
        prisma.channelStats.findFirst({
          where: { channelId: channel.id, date: { lte: weekAgo } },
          orderBy: { date: 'desc' },
        }),
        prisma.channelStats.findFirst({
          where: { channelId: channel.id, date: { lte: monthAgo } },
          orderBy: { date: 'desc' },
        }),
      ]);

      const subscriberGrowthWeek = weekStats
        ? newSubscriberCount - weekStats.subscriberCount
        : 0;
      const subscriberGrowthMonth = monthStats
        ? newSubscriberCount - monthStats.subscriberCount
        : 0;

      // Telegram Bot API requires -100 prefix for channels
      const botApiId = `-100${entity.id.toString()}`;

      // Update channel in database
      await prisma.channel.update({
        where: { id: channel.id },
        data: {
          telegramId: BigInt(botApiId),
          title: entity.title,
          username: entity.username ?? channel.username,
          description: fullChat.about ?? channel.description,
          subscriberCount: newSubscriberCount,
          avgViews,
          language: detectedLanguage,
          engagementRate: Math.round(engagementRate * 10) / 10,
          subscriberGrowthWeek,
          subscriberGrowthMonth,
          peakHours: peakHours,
        },
      });

      // Save today's stats to history
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.channelStats.upsert({
        where: {
          channelId_date: { channelId: channel.id, date: today },
        },
        create: {
          channelId: channel.id,
          date: today,
          subscriberCount: newSubscriberCount,
          avgViews,
          postsCount: validMessages.length,
          engagement: engagementRate,
        },
        update: {
          subscriberCount: newSubscriberCount,
          avgViews,
          postsCount: validMessages.length,
          engagement: engagementRate,
        },
      });

      // Print results
      console.log(`\n  📊 Stats:`);
      console.log(`     Subscribers: ${newSubscriberCount.toLocaleString()}`);
      console.log(`     Avg Views: ${avgViews.toLocaleString()}`);
      console.log(`     Engagement: ${engagementRate.toFixed(1)}%`);
      console.log(`\n  📈 Growth:`);
      console.log(`     Week: ${subscriberGrowthWeek >= 0 ? '+' : ''}${subscriberGrowthWeek}`);
      console.log(`     Month: ${subscriberGrowthMonth >= 0 ? '+' : ''}${subscriberGrowthMonth}`);
      console.log(`\n  🌍 Language: ${detectedLanguage.toUpperCase()}`);
      console.log(`\n  ⏰ Peak Hours (UTC): ${peakHours.map(h => `${h}:00`).join(', ')}`);
      console.log(`\n  ✓ Updated successfully (ID: ${botApiId})`);

    } catch (error: any) {
      console.log(`  ✗ Error: ${error.message}`);
    }
  }

  await client.disconnect();
  await prisma.$disconnect();
  console.log('\n\nDone!');
}

main().catch(console.error);
