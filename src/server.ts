import express from 'express';
import { processVideo, getSnippets } from './processVideo'; // Ensure the correct path
import { bucketName } from './config';
import cors from 'cors';

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
    const publicUrls = snippets.map((snippet: any) => ({
      title: snippet.title,
      url: `https://${bucketName}.s3.ap-southeast-2.amazonaws.com/${snippet.s3Key}`,
    }));
    res.send({ snippets: publicUrls });
  } catch (error: any) {
    res.status(500).send(`Error fetching snippets: ${error.message}`);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
