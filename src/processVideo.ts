import path from 'path';
import fs from 'fs';
import { downloadVideo, convertMP4toMP3, trimAudio, uploadToS3, getVideoSections } from './utils';
import { bucketName } from './config';

export async function processVideo(videoUrl: string): Promise<void> {
    const videoID = videoUrl.split('v=')[1].split('&')[0];
    const videoDir = path.join(__dirname, '..', 'storage', videoID);
    const videoPath = path.join(videoDir, 'video.mp4');
    const mp3Path = path.join(videoDir, 'audio.mp3');

    if (!fs.existsSync(videoDir)) {
        fs.mkdirSync(videoDir, { recursive: true });
    }

    try {
        console.log('Starting video download...');
        await downloadVideo(videoUrl, videoPath);
        console.log(`Video downloaded successfully: ${videoPath}`);

        // Check if the video file exists before proceeding
        if (!fs.existsSync(videoPath)) {
            throw new Error(`Downloaded video file does not exist: ${videoPath}`);
        }

        console.log('Converting video to MP3...');
        await convertMP4toMP3(videoPath, mp3Path);
        console.log(`Video converted to MP3 successfully: ${mp3Path}`);

        // Check if the MP3 file exists before proceeding
        if (!fs.existsSync(mp3Path)) {
            throw new Error(`Converted MP3 file does not exist: ${mp3Path}`);
        }

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
            console.log(`Finished processing batch ${Math.floor(i / batchSize) + 1}`);
        }
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
    } finally {
        // Clean up the downloaded full video and audio
        if (fs.existsSync(videoPath)) {
            fs.unlinkSync(videoPath);
            console.log(`Cleaned up ${videoPath}`);
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
