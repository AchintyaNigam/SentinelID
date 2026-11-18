
output "documents_table_name" {
  description = "Name of the DynamoDB documents table."
  value       = aws_dynamodb_table.documents.name
}

output "documents_table_arn" {
  description = "ARN of the DynamoDB documents table."
  value       = aws_dynamodb_table.documents.arn
}

output "documents_table_owner_index_arn" {
  description = "ARN of the documents owner-created GSI."
  value       = "${aws_dynamodb_table.documents.arn}/index/owner-created-index"
}

output "documents_bucket_name" {
  description = "Name of the S3 documents bucket."
  value       = aws_s3_bucket.documents.id
}

output "documents_bucket_arn" {
  description = "ARN of the S3 documents bucket."
  value       = aws_s3_bucket.documents.arn
}

