

import dotenv from 'dotenv';

dotenv.config();

export const bucketName = process.env.BUCKET_NAME
export const YOUTUBE_API_KEY =  process.env.YOUTUBE_API_KEY
export const accessKeyId = process.env.S3_ACCESS_KEY
export const  secretAccessKey = process.env.S3_SECRET_KEY
export const  region : string = 'ap-southeast-2'
  
  
