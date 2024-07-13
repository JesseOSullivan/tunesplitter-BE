import express from 'express';
import { processVideo } from './processVideo';

const app = express();
const port = 3001;

app.get('/process-video', async (req, res) => {
  const videoUrl = req.query.url as string;
  if (!videoUrl) {
    return res.status(400).send('Missing URL parameter.');
  }

  try {
    await processVideo(videoUrl);
    res.send('Video processing started. Check server logs for details.');
  } catch (error:any) {
    res.status(500).send(`Error processing video: ${error.message}`);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
