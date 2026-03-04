import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_REGION = "ap-southeast-3";
const PRESIGNED_UPLOAD_TTL_SECONDS = 15 * 60;

function getS3Config() {
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? DEFAULT_REGION;
  const bucket = process.env.AWS_S3_BUCKET;

  if (!bucket) {
    throw new Error("AWS_S3_BUCKET is not configured");
  }

  return { region, bucket };
}

function createS3Client() {
  const { region } = getS3Config();
  return new S3Client({ region });
}

export interface PresignedFileUpload {
  key: string;
  filePath: string;
  uploadUrl: string;
}

export async function createFileUploadUrl(contentType = "text/csv", fileExtension?: string): Promise<PresignedFileUpload> {
  const { bucket } = getS3Config();
  const s3 = createS3Client();
  const ext = fileExtension ?? "csv";
  const key = `files/${randomUUID()}.${ext}`;
  const putCommand = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3, putCommand, { expiresIn: PRESIGNED_UPLOAD_TTL_SECONDS });
  return {
    key,
    filePath: `${bucket}/${key}`,
    uploadUrl,
  };
}

export function parseBucketFilePath(filePath: string): { bucket: string; key: string } {
  const normalized = String(filePath ?? "").trim().replace(/^s3:\/\//i, "");
  const separatorIndex = normalized.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
    throw new Error(`Invalid filePath "${filePath}". Expected "bucket/key".`);
  }
  return {
    bucket: normalized.slice(0, separatorIndex),
    key: normalized.slice(separatorIndex + 1),
  };
}

export async function downloadS3FileToTmp(filePath: string): Promise<string> {
  const { bucket, key } = parseBucketFilePath(filePath);
  const s3 = createS3Client();
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  const body = response.Body;
  if (!body) {
    throw new Error(`Empty S3 object body for ${filePath}`);
  }
  const bytes = await body.transformToByteArray();
  const ext = path.extname(key) || ".csv";
  const localPath = path.join("/tmp", `file-${randomUUID()}${ext}`);
  await fs.writeFile(localPath, Buffer.from(bytes));
  return localPath;
}

export async function uploadBufferToS3(key: string, body: Buffer, contentType = "text/csv"): Promise<string> {
  const { bucket } = getS3Config();
  const s3 = createS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return `${bucket}/${key}`;
}

export async function getS3ObjectVersionId(filePath: string): Promise<string | null> {
  const { bucket, key } = parseBucketFilePath(filePath);
  const s3 = createS3Client();
  const response = await s3.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  return response.VersionId ?? null;
}
