import express from 'express';
import cors from 'cors';
import archiver from 'archiver';
import { getSnippets, processVideo } from './processVideo'; // Ensure the correct path
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

// Endpoint to download all snippets as a zip file
app.post('/download-all', async (req, res) => {
  console.log('Downloading all snippets as a zip file...');
  const { snippets } = req.body;

  if (!snippets || snippets.length === 0) {
    return res.status(400).send('Missing snippets parameter.');
  }

  try {
    const s3 = new S3({
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
      region: region,
    });

    res.attachment('snippets.zip');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      throw err;
    });
    archive.pipe(res);

    if (!bucketName) {
      throw new Error('S3 bucket name is not provided.');
    }
    for (const snippet of snippets) {
      const s3Key = snippet.url.split('.com/')[1];
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
