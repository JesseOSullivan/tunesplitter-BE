import path from 'path';
import fs from 'fs';
import { downloadAudio, trimAudio, uploadToS3, getVideoSections } from './utils';
import { bucketName } from './config';

export async function processVideo(videoUrl: string): Promise<void> {
  const tempAudioPath = path.join(__dirname, 'temp_audio.mp3');
  const outputDir = path.join(__dirname, 'sections');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  try {
    await downloadAudio(videoUrl, tempAudioPath);
    console.log('Audio downloaded successfully.');

    const sections = await getVideoSections(videoUrl);
    console.log(`Found ${sections.length} sections`);

    // Trim sections and upload to S3
    await Promise.all(sections.map(async ({ start_time, end_time, title }) => {
      const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const outputFilePath = path.join(outputDir, `${sanitizedTitle}.mp3`);
      const s3Key = `${sanitizedTitle}.mp3`;

      const duration = end_time - start_time;
      await trimAudio(tempAudioPath, outputFilePath, start_time, duration);
      console.log(`Trimmed section: ${sanitizedTitle}`);

      if (!bucketName) {
        throw new Error('Bucket name is not defined.');
      }
      
      await uploadToS3(outputFilePath, bucketName, s3Key);
      console.log(`Uploaded ${s3Key} to S3.`);

      // Clean up the trimmed section
      if (fs.existsSync(outputFilePath)) {
        fs.unlinkSync(outputFilePath);
      }
    }));
  } catch (error:any) {
    console.error(`Error: ${error.message}`);
  } finally {
    // Clean up the downloaded full audio
    if (fs.existsSync(tempAudioPath)) {
      fs.unlinkSync(tempAudioPath);
    }
  }
}
