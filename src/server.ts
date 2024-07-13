import express from 'express';
import { processVideo, getSnippets } from './processVideo'; // Ensure the correct path
import AWS from 'aws-sdk';
import { bucketName } from './config';
import cors from 'cors';

const s3 = new AWS.S3({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  region: 'ap-northeast-1',
});

const app = express();
const port = 3001;

app.use(cors()); // Enable CORS for all routes

app.get('/process-video', async (req, res) => {
  const videoUrl = req.query.url as string;
  if (!videoUrl) {
    return res.status(400).send('Missing URL parameter.');
  }

  try {
    await processVideo(videoUrl);
    res.send('Video processing started. Check server logs for details.');
  } catch (error: any) {
    res.status(500).send(`Error processing video: ${error.message}`);
  }
});

app.get('/get-snippets', async (req, res) => {
  const videoUrl = req.query.url as string;
  if (!videoUrl) {
    return res.status(400).send('Missing URL parameter.');
  }

  try {
    const snippets = await getSnippets(videoUrl);
    const signedUrls = await Promise.all(
      snippets.map(async (snippet: any) => {
        const params = {
          Bucket: bucketName!,
          Key: snippet.s3Key,
          Expires: 60 * 60, // URL expiry time in seconds
        };

        const url = await s3.getSignedUrlPromise('getObject', params);
        return {
          title: snippet.title,
          url,
        };
      })
    );
    res.send({ snippets: signedUrls });
  } catch (error: any) {
    res.status(500).send(`Error fetching snippets: ${error.message}`);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
