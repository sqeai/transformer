import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBucketFilePath } from "@/lib/s3-files";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const DEFAULT_REGION = "ap-southeast-3";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await requireAuth();
  if (result.error) return result.error;

  const supabase = createAdminClient();
  const { data: folder } = await supabase
    .from("folders")
    .select("logo_url")
    .eq("id", id)
    .maybeSingle();

  if (!folder?.logo_url) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const { bucket, key } = parseBucketFilePath(folder.logo_url);
    const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? DEFAULT_REGION;
    const s3 = new S3Client({ region });
    const response = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );

    const body = response.Body;
    if (!body) {
      return new NextResponse(null, { status: 404 });
    }

    const bytes = await body.transformToByteArray();
    const contentType = response.ContentType ?? "image/png";

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
