import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly port: number;
  private readonly useSSL: boolean;
  private readonly publicUrl: string | null;

  constructor(private configService: ConfigService) {
    this.endpoint = this.configService.get<string>('MINIO_ENDPOINT', 'localhost');
    this.port = this.configService.get<number>('MINIO_PORT', 9000);
    this.useSSL = this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true';
    this.bucket = this.configService.get<string>('MINIO_BUCKET', 'tam-avatars');
    // Public URL for external access (e.g., https://storage.example.com)
    this.publicUrl = this.configService.get<string>('MINIO_PUBLIC_URL', '') || null;

    const protocol = this.useSSL ? 'https' : 'http';
    const endpointUrl = `${protocol}://${this.endpoint}:${this.port}`;

    this.s3Client = new S3Client({
      endpoint: endpointUrl,
      region: 'us-east-1', // MinIO requires a region, but ignores it
      credentials: {
        accessKeyId: this.configService.get<string>('MINIO_ROOT_USER', 'minioadmin'),
        secretAccessKey: this.configService.get<string>('MINIO_ROOT_PASSWORD', 'minioadmin'),
      },
      forcePathStyle: true, // Required for MinIO
    });
  }

  async onModuleInit() {
    await this.ensureBucketExists();
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket "${this.bucket}" exists`);
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        this.logger.log(`Creating bucket "${this.bucket}"...`);
        try {
          await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }));
          this.logger.log(`Bucket "${this.bucket}" created successfully`);
        } catch (createError) {
          this.logger.error(`Failed to create bucket: ${createError}`);
        }
      } else {
        this.logger.warn(`Could not check bucket (MinIO may not be available): ${error.message}`);
      }
    }
  }

  async uploadBuffer(
    buffer: Buffer,
    key: string,
    contentType: string
  ): Promise<string> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
      );

      this.logger.log(`Uploaded file to ${key}`);
      return key;
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error}`);
      throw error;
    }
  }

  async uploadFromUrl(url: string, key: string): Promise<string | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`Failed to fetch URL ${url}: ${response.status}`);
        return null;
      }

      const contentType = response.headers.get('content-type') ?? 'image/jpeg';
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      return await this.uploadBuffer(buffer, key, contentType);
    } catch (error) {
      this.logger.error(`Failed to upload from URL: ${error}`);
      return null;
    }
  }

  async getObject(key: string): Promise<Buffer | null> {
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      if (!response.Body) {
        return null;
      }

      // Convert stream to buffer
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      this.logger.error(`Failed to get object: ${error}`);
      throw error;
    }
  }

  getPublicUrl(key: string): string {
    const protocol = this.useSSL ? 'https' : 'http';
    return `${protocol}://${this.endpoint}:${this.port}/${this.bucket}/${key}`;
  }

  /**
   * Get external URL for public access (browser-accessible)
   * Uses MINIO_PUBLIC_URL if configured, otherwise falls back to internal URL
   *
   * For production, use Nginx proxy for security:
   *   location /storage/ { proxy_pass http://minio:9000/tam-avatars/; }
   * Then set MINIO_PUBLIC_URL=https://yourdomain.com/storage
   */
  getExternalUrl(key: string): string {
    if (this.publicUrl) {
      // Remove trailing slash if present
      const baseUrl = this.publicUrl.replace(/\/$/, '');
      // Public URL already includes bucket path via Nginx proxy
      return `${baseUrl}/${key}`;
    }
    // Fallback to internal URL (works in development)
    return this.getPublicUrl(key);
  }

  /**
   * Get avatar URL for a channel
   * Returns external URL if avatarKey exists, null otherwise
   */
  getAvatarUrl(avatarKey: string | null | undefined): string | null {
    if (!avatarKey) return null;
    return this.getExternalUrl(avatarKey);
  }

  getAvatarKey(channelId: string): string {
    return `avatars/${channelId}.jpg`;
  }
}
