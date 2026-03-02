# Role outputs
output "role_arn" {
  description = "ARN of the IAM role"
  value       = aws_iam_role.adc_files_role.arn
}

output "role_name" {
  description = "Name of the IAM role"
  value       = aws_iam_role.adc_files_role.name
}

# User outputs
output "user_arn" {
  description = "ARN of the IAM user"
  value       = aws_iam_user.adc_files_user.arn
}

output "user_name" {
  description = "Name of the IAM user"
  value       = aws_iam_user.adc_files_user.name
}

# Policy output
output "policy_arn" {
  description = "ARN of the S3 access policy"
  value       = aws_iam_policy.adc_files_s3_policy.arn
}
