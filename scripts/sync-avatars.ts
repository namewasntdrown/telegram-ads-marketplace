/**
 * Script to sync all channel avatars to MinIO storage
 * Run: npx ts-node scripts/sync-avatars.ts
 */

import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const prisma = new PrismaClient();

const BOT_TOKEN = process.env.BOT_TOKEN;
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'minio';
const MINIO_PORT = process.env.MINIO_PORT || '9000';
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'tam-avatars';
const MINIO_ROOT_USER = process.env.MINIO_ROOT_USER || 'minioadmin';
const MINIO_ROOT_PASSWORD = process.env.MINIO_ROOT_PASSWORD || 'minioadmin';

const s3Client = new S3Client({
  endpoint: `http://${MINIO_ENDPOINT}:${MINIO_PORT}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: MINIO_ROOT_USER,
    secretAccessKey: MINIO_ROOT_PASSWORD,
  },
  forcePathStyle: true,
});

async function downloadChannelPhoto(chatId: string | bigint): Promise<Buffer | null> {
  try {
    // Get chat info
    const chatResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getChat?chat_id=${chatId}`
    );
    const chatData = await chatResponse.json();

    if (!chatData.ok || !chatData.result?.photo?.big_file_id) {
      console.log(`  No photo for channel ${chatId}`);
      return null;
    }

    // Get file path
    const fileResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${chatData.result.photo.big_file_id}`
    );
    const fileData = await fileResponse.json();

    if (!fileData.ok || !fileData.result?.file_path) {
      console.log(`  Could not get file path for ${chatId}`);
      return null;
    }

    // Download file
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
    const photoResponse = await fetch(downloadUrl);

    if (!photoResponse.ok) {
      console.log(`  Could not download photo for ${chatId}`);
      return null;
    }

    const arrayBuffer = await photoResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`  Error downloading photo for ${chatId}:`, error);
    return null;
  }
}

async function uploadToMinio(buffer: Buffer, key: string): Promise<boolean> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: MINIO_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: 'image/jpeg',
      })
    );
    return true;
  } catch (error) {
    console.error(`  Error uploading to MinIO:`, error);
    return false;
  }
}

async function main() {
  console.log('Starting avatar sync...\n');

  if (!BOT_TOKEN) {
    console.error('BOT_TOKEN not set!');
    process.exit(1);
  }

  // Get all channels
  const channels = await prisma.channel.findMany({
    select: {
      id: true,
      telegramId: true,
      title: true,
    },
  });

  console.log(`Found ${channels.length} channels\n`);

  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const channel of channels) {
    console.log(`Processing: ${channel.title} (${channel.id})`);

    // Download photo from Telegram
    const photoBuffer = await downloadChannelPhoto(channel.telegramId);

    if (!photoBuffer) {
      skipped++;
      continue;
    }

    // Upload to MinIO
    const avatarKey = `avatars/${channel.id}.jpg`;
    const uploaded = await uploadToMinio(photoBuffer, avatarKey);

    if (!uploaded) {
      failed++;
      continue;
    }

    // Update database
    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        avatarKey,
        avatarUpdatedAt: new Date(),
      },
    });

    console.log(`  ✓ Synced to ${avatarKey}`);
    synced++;
  }

  console.log(`\n--- Summary ---`);
  console.log(`Synced: ${synced}`);
  console.log(`Skipped (no photo): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${channels.length}`);

  await prisma.$disconnect();
}

main().catch(console.error);
