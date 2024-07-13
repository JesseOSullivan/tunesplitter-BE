import express from 'express';
import { processVideo, getSnippets } from './processVideo'; // Ensure the correct path
import { bucketName } from './config';
import cors from 'cors';
import archiver from 'archiver';
import { S3 } from 'aws-sdk';
import { accessKeyId, secretAccessKey, region } from './config';

const app = express();
const port = 3001;

app.use(cors()); // Enable CORS for all routes


// Middleware to log incoming requests
app.use((req, res, next) => {
  console.log(`Received ${req.method} request for ${req.url}`);
  next();
});

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

app.get('/download-all', async (req, res) => {
  console.log('Downloading all snippets as a zip file...')
  const videoUrl = req.query.url as string;
  if (!videoUrl) {
    return res.status(400).send('Missing URL parameter.');
  }

  try {
    console.log('Fetching snippets...', accessKeyId, secretAccessKey, region)
    const snippets = await getSnippets(videoUrl);
    const s3 = new S3(
      {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        region: region
      }
    );

    res.attachment('snippets.zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      throw err;
    });
    archive.pipe(res);

    for (const snippet of snippets) {
      const s3Key = snippet.s3Key;
      if (!bucketName) {
        throw new Error('S3 bucket name is not provided.');
      }

      const stream = s3.getObject({ Bucket: bucketName, Key: s3Key }).createReadStream();
      archive.append(stream, { name: `${snippet.title}.mp3` });
    }

    await archive.finalize();
  } catch (error: any) {
    res.status(500).send(`Error creating zip file: ${error.message}`);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
