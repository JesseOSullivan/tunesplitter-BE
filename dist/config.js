"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.region = exports.secretAccessKey = exports.accessKeyId = exports.YOUTUBE_API_KEY = exports.bucketName = void 0;
exports.bucketName = process.env.BUCKET_NAME;
exports.YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
exports.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
exports.secretAccessKey = process.env.S3_ACCESS_KEY;
exports.region = 'ap-northeast-1';
