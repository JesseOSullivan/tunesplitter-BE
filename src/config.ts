

import dotenv from 'dotenv';

dotenv.config();

export const bucketName = process.env.BUCKET_NAME
export const YOUTUBE_API_KEY =  process.env.YOUTUBE_API_KEY
export const accessKeyId = process.env.AWS_ACCESS_KEY_ID
export const  secretAccessKey = process.env.S3_ACCESS_KEY
export const  region : string = 'ap-northeast-1'
  
  
