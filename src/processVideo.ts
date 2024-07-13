import path from 'path';
import fs from 'fs';
import { downloadVideo, trimAudio, uploadToS3, getVideoSections, extractAudio } from './utils';
import { bucketName } from './config';

export async function processVideo(videoUrl: string): Promise<void> {
  const tempVideoPath = path.join(__dirname, 'temp_video.mp4');
  const tempAudioPath = path.join(__dirname, 'temp_audio.mp4'); // change extension as we are merging later
  const tempMergedPath = path.join(__dirname, 'temp_video_merged.mp4');
  const tempAudioExtractedPath = path.join(__dirname, 'temp_audio.mp3');
  const outputDir = path.join(__dirname, 'sections');
  if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
  }

  try {
      console.log('Starting video and audio download...');
      await downloadVideo(videoUrl, tempVideoPath, tempAudioPath);
      console.log(`Video and audio downloaded and merged successfully: ${tempMergedPath}`);

      // Check if the merged video file exists before attempting to extract audio
      if (!fs.existsSync(tempMergedPath)) {
          throw new Error(`Downloaded and merged video file does not exist: ${tempMergedPath}`);
      }

      console.log('Starting audio extraction...');
      await extractAudio(tempMergedPath, tempAudioExtractedPath);
      console.log(`Audio extracted successfully: ${tempAudioExtractedPath}`);

      console.log(`Fetching video info from ${videoUrl}`);
      const sections = await getVideoSections(videoUrl);
      console.log(`Found ${sections.length} sections`);

      // Process sections in smaller batches to avoid overwhelming the system
      const batchSize = 50;
      for (let i = 0; i < sections.length; i += batchSize) {
          const batch = sections.slice(i, i + batchSize);
          console.log(`Processing batch ${Math.floor(i / batchSize) + 1}...`);
          await Promise.all(batch.map(async ({ start_time, end_time, title }) => {
              const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
              const outputFilePath = path.join(outputDir, `${sanitizedTitle}.mp3`);
              const s3Key = `${sanitizedTitle}.mp3`;

              const duration = end_time - start_time;
              console.log(`Trimming audio section: ${sanitizedTitle} from ${start_time} to ${end_time}`);
              await trimAudio(tempAudioExtractedPath, outputFilePath, start_time, duration);
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
          console.log(`Finished processing batch ${Math.floor(i / batchSize) + 1}`);
      }
  } catch (error: any) {
      console.error(`Error: ${error.message}`);
  } finally {
      // Clean up the downloaded and processed files
      if (fs.existsSync(tempVideoPath)) {
          fs.unlinkSync(tempVideoPath);
          console.log(`Cleaned up ${tempVideoPath}`);
      }
      if (fs.existsSync(tempAudioPath)) {
          fs.unlinkSync(tempAudioPath);
          console.log(`Cleaned up ${tempAudioPath}`);
      }
      if (fs.existsSync(tempMergedPath)) {
          fs.unlinkSync(tempMergedPath);
          console.log(`Cleaned up ${tempMergedPath}`);
      }
      if (fs.existsSync(tempAudioExtractedPath)) {
          fs.unlinkSync(tempAudioExtractedPath);
          console.log(`Cleaned up ${tempAudioExtractedPath}`);
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
      s3Key: `${sanitizedTitle}.mp3`
    };
  });
}
