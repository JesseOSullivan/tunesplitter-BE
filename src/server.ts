import express from 'express';
import cors from 'cors';
import archiver from 'archiver';
import { processVideo, getSnippets } from './processVideo'; // Ensure the correct path
import { bucketName, accessKeyId, secretAccessKey, region } from './config';
import { S3 } from 'aws-sdk';

const app = express();
const port = 3001;

app.use(cors()); // Enable CORS for all routes

// Middleware to log incoming requests
app.use((req, res, next) => {
  console.log(`Received ${req.method} request for ${req.url}`);
  next();
});

// Combined endpoint to process video and fetch snippets
app.get('/process-and-fetch-snippets', async (req, res) => {
  const videoUrl = req.query.url as string;
  if (!videoUrl) {
    return res.status(400).send('Missing URL parameter.');
  }

  try {
    await processVideo(videoUrl); // Process the video
    const snippets = await getSnippets(videoUrl); // Fetch the snippets
    const publicUrls = snippets.map((snippet: any) => ({
      title: snippet.title,
      url: `https://${bucketName}.s3.ap-southeast-2.amazonaws.com/${snippet.s3Key}`,
    }));
    res.send({ snippets: publicUrls });
  } catch (error: any) {
    res.status(500).send(`Error processing video or fetching snippets: ${error.message}`);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
