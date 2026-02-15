import { PrismaClient } from '@tam/prisma-client';

const prisma = new PrismaClient();

interface TelegramChannelInfo {
  title: string;
  description?: string;
  subscriberCount: number;
  avatarUrl?: string;
}

async function fetchChannelInfo(username: string): Promise<TelegramChannelInfo | null> {
  try {
    // Try to fetch channel info from t.me page
    const response = await fetch(`https://t.me/${username}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.log(`Failed to fetch t.me/${username}: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Parse title
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
    const title = titleMatch?.[1] || username;

    // Parse description
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    const description = descMatch?.[1];

    // Parse avatar
    const avatarMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    const avatarUrl = avatarMatch?.[1];

    // Parse subscriber count from the page
    // Looking for patterns like "123 456 subscribers" or "1.2K subscribers"
    const subscriberMatch = html.match(/(\d[\d\s]*\d*)\s*(?:subscribers?|members?)/i)
      || html.match(/([\d.]+[KMB]?)\s*(?:subscribers?|members?)/i);

    let subscriberCount = 0;
    if (subscriberMatch && subscriberMatch[1]) {
      const countStr = subscriberMatch[1].replace(/\s/g, '');
      if (countStr.includes('K')) {
        subscriberCount = Math.round(parseFloat(countStr) * 1000);
      } else if (countStr.includes('M')) {
        subscriberCount = Math.round(parseFloat(countStr) * 1000000);
      } else if (countStr.includes('B')) {
        subscriberCount = Math.round(parseFloat(countStr) * 1000000000);
      } else {
        subscriberCount = parseInt(countStr, 10) || 0;
      }
    }

    // Alternative: try to find subscriber count in tgme_page_extra
    const extraMatch = html.match(/tgme_page_extra[^>]*>([^<]+)</);
    if (extraMatch && extraMatch[1] && !subscriberCount) {
      const extraText = extraMatch[1];
      const numMatch = extraText.match(/([\d\s]+)/);
      if (numMatch && numMatch[1]) {
        subscriberCount = parseInt(numMatch[1].replace(/\s/g, ''), 10) || 0;
      }
    }

    return {
      title: title.replace(' – Telegram', '').trim(),
      description: description?.replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code)),
      subscriberCount,
      avatarUrl,
    };
  } catch (error) {
    console.error(`Error fetching channel info for ${username}:`, error);
    return null;
  }
}

export async function processChannelInfo(): Promise<void> {
  console.log('[ChannelInfo] Starting channel info processor...');

  // Find channels that need info update (PENDING status or title is "Pending verification")
  const channels = await prisma.channel.findMany({
    where: {
      OR: [
        { status: 'PENDING', title: 'Pending verification' },
        { title: 'Pending verification' },
      ],
      username: { not: null },
    },
    take: 10,
  });

  console.log(`[ChannelInfo] Found ${channels.length} channels to process`);

  for (const channel of channels) {
    if (!channel.username) continue;

    console.log(`[ChannelInfo] Processing channel @${channel.username}...`);

    const info = await fetchChannelInfo(channel.username);

    if (info) {
      // Use raw SQL to update including avatarUrl (field might not be in Prisma types yet)
      await prisma.$executeRaw`
        UPDATE "Channel"
        SET
          title = ${info.title},
          description = COALESCE(${info.description}, description),
          "subscriberCount" = COALESCE(${info.subscriberCount}, "subscriberCount"),
          "avatarUrl" = ${info.avatarUrl || null}
        WHERE id = ${channel.id}
      `;

      console.log(`[ChannelInfo] Updated channel @${channel.username}: ${info.title}, ${info.subscriberCount} subscribers`);
    } else {
      console.log(`[ChannelInfo] Could not fetch info for @${channel.username}`);
    }

    // Small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log('[ChannelInfo] Channel info processor completed');
}

// Run every 30 seconds
export function startChannelInfoProcessor(): void {
  console.log('[ChannelInfo] Channel info processor started');

  // Run immediately
  processChannelInfo().catch(console.error);

  // Then run periodically
  setInterval(() => {
    processChannelInfo().catch(console.error);
  }, 30000);
}
