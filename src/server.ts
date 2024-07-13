import express from 'express';
import { processVideo } from './processVideo'; // Ensure the path is correct
import AWS from 'aws-sdk';
import { bucketName } from './config';

const s3 = new AWS.S3({
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  region: 'ap-northeast-1',
});

const app = express();
const port = 3001;

// Endpoint to process video
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

// Endpoint to get signed URL
app.get('/get-signed-url', (req, res) => {
  const { key } = req.query;
  
  if (!key) {
    return res.status(400).send('Missing key parameter.');
  }

  const params = {
    Bucket: bucketName!,
    Key: key as string,
    Expires: 60 * 60, // URL expiry time in seconds
  };

  s3.getSignedUrl('getObject', params, (err, url) => {
    if (err) {
      console.error('Error generating signed URL', err);
      return res.status(500).send('Error generating signed URL.');
    }

    res.send({ url });
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
