
resource "aws_dynamodb_table" "documents" {
  name         = "${var.project_name}-${var.environment}-documents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "document_id"

  attribute {
    name = "document_id"
    type = "S"
  }

  attribute {
    name = "owner_id"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "N"
  }

  global_secondary_index {
    name = "owner-created-index"
    projection_type = "ALL"
  
    key_schema {
      attribute_name = "owner_id"
      key_type       = "HASH"
    }
  
    key_schema {
      attribute_name = "created_at"
      key_type       = "RANGE"
    }
  }

  deletion_protection_enabled = false

  tags = {
    Name      = "${var.project_name}-${var.environment}-documents"
    Component = "Document Metadata"
  }
}

resource "aws_s3_bucket" "documents" {
  bucket_prefix = "${var.project_name}-${var.environment}-documents-"

  tags = {
    Name      = "${var.project_name}-${var.environment}-documents"
    Component = "Document Storage"
  }
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_policy" "documents" {
  bucket = aws_s3_bucket.documents.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.documents.arn,
          "${aws_s3_bucket.documents.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })

  depends_on = [
    aws_s3_bucket_public_access_block.documents
  ]
}

