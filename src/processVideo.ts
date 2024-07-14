import path from 'path';
import fs from 'fs';
import { downloadAudio, convertAudioFormat, trimAudio, uploadToS3, getVideoSections } from './utils';
import { bucketName } from './config';
import { Worker } from 'worker_threads';

export async function processVideo(videoUrl: string): Promise<void> {
  const videoID = videoUrl.split('v=')[1].split('&')[0];
  const videoDir = path.join(__dirname, '..', 'storage', videoID);
  const audioPath = path.join(videoDir, 'audio.m4a'); // Assuming audio format is m4a
  const mp3Path = path.join(videoDir, 'audio.mp3');

  if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true });
  }

  try {
      console.log('Starting audio download...');
      await downloadAudio(videoUrl, audioPath);
      console.log(`Audio downloaded successfully: ${audioPath}`);

      // Check if the audio file exists before proceeding
      if (!fs.existsSync(audioPath)) {
          throw new Error(`Downloaded audio file does not exist: ${audioPath}`);
      }

      console.log('Converting audio to MP3...');
      await convertAudioFormat(audioPath, mp3Path);
      console.log(`Audio converted to MP3 successfully: ${mp3Path}`);

      // Check if the MP3 file exists before proceeding
      if (!fs.existsSync(mp3Path)) {
          throw new Error(`Converted MP3 file does not exist: ${mp3Path}`);
      }

      console.log(`Fetching video info from ${videoUrl}`);
      const sections = await getVideoSections(videoUrl);
      console.log(`Found ${sections.length} sections`);

      // Process sections in parallel
      const parallelLimit = 16; // Number of parallel processes
      const sectionBatches = [];
      for (let i = 0; i < sections.length; i += parallelLimit) {
          sectionBatches.push(sections.slice(i, i + parallelLimit));
      }

      for (const batch of sectionBatches) {
          console.log(`Processing batch...`);
          await Promise.all(batch.map(async ({ start_time, end_time, title }) => {
              const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
              const outputFilePath = path.join(videoDir, `${sanitizedTitle}.mp3`);
              const s3Key = `${sanitizedTitle}.mp3`;

              const duration = end_time - start_time;
              console.log(`Trimming audio section: ${sanitizedTitle} from ${start_time} to ${end_time}`);
              await trimAudio(mp3Path, outputFilePath, start_time, duration);
              console.log(`Trimmed section: ${sanitizedTitle}`);

              console.log(`Uploading ${sanitizedTitle} to S3...`);
              if (!bucketName) {
                  throw new Error('S3 bucket name is not provided.');
              }
              await uploadToS3(outputFilePath, bucketName, s3Key);
              console.log(`Uploaded ${sanitizedTitle} to S3`);

              // Clean up the trimmed section
              if (fs.existsSync(outputFilePath)) {
                  fs.unlinkSync(outputFilePath);
                  console.log(`Cleaned up ${outputFilePath}`);
              }
          }));
          console.log(`Finished processing batch`);
      }
  } catch (error: any) {
      console.error(`Error: ${error.message}`);
      throw error;
  } finally {
      // Clean up the downloaded full audio
      if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
          console.log(`Cleaned up ${audioPath}`);
      }
      if (fs.existsSync(mp3Path)) {
          fs.unlinkSync(mp3Path);
          console.log(`Cleaned up ${mp3Path}`);
      }
  }
}

export async function getSnippets(videoUrl: string): Promise<any[]> {
    console.log(`Fetching snippets for ${videoUrl}`);
    const sections = await getVideoSections(videoUrl);
    return sections.map(({ start_time, end_time, title }) => {
        const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        return {
            title: sanitizedTitle,
            s3Key: `${sanitizedTitle}.mp3`,
        };
    });
}
