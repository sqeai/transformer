resource "aws_s3_bucket" "adc_files" {
  bucket = "ai-data-cleanser-files"

  tags = {
    Name        = "adc-files"
    Environment = "dev"
    Project     = "adc"
    ManagedBy   = "Terraform"
  }
}

resource "aws_s3_bucket_versioning" "adc_files_versioning" {
  bucket = aws_s3_bucket.adc_files.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "adc_files_encryption" {
  bucket = aws_s3_bucket.adc_files.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "adc_files_public_access" {
  bucket = aws_s3_bucket.adc_files.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "adc_files_cors" {
  bucket = aws_s3_bucket.adc_files.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE"]
    allowed_origins = [
      "http://localhost:3000",
      "http://ai-data-cleanser.sqe.co.id",
      "https://ai-data-cleanser.sqe.co.id",
    ]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
