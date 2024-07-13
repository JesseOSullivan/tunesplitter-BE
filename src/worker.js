const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { downloadVideo, convertMP4toMP3, uploadToS3, getVideoSections, trimAudio } = require('./utils');
const { bucketName } = require('./config');

parentPort.on('message', async (data) => {
    try {
        const { youtubeURL } = data;

        parentPort.postMessage({ status: 'processing' });

        console.log("Starting process for URL: " + youtubeURL + " in worker thread");

        // Extract the video ID from the URL and remove any additional parameters
        const videoID = youtubeURL.split('v=')[1].split('&')[0];

        // Create a directory for the video if it doesn't exist
        const videoDir = path.join(__dirname, '..', 'storage', videoID);
        if (!fs.existsSync(videoDir)) {
            fs.mkdirSync(videoDir, { recursive: true });
        }

        // Download the video
        const videoPath = path.join(videoDir, 'video.mp4');
        if (fs.existsSync(videoPath)) {
            console.log(youtubeURL + " has already been downloaded. Skipping download.");
        } else {
            await downloadVideo(youtubeURL, videoPath);
        }

        if (!fs.existsSync(videoPath)) {
            throw new Error("Video not downloaded");
        } else {
            console.log("Video successfully downloaded.");
        }

        // Convert the video to MP3
        const mp3Path = path.join(videoDir, 'audio.mp3');
        if (fs.existsSync(mp3Path)) {
            console.log("MP3 already exists. Skipping conversion.");
        } else {
            await convertMP4toMP3(videoPath, mp3Path);
        }

        if (!fs.existsSync(mp3Path)) {
            throw new Error("MP3 not converted");
        } else {
            console.log("MP3 successfully converted.");
        }

        // Fetch video sections
        console.log(`Fetching video info from ${youtubeURL}`);
        const sections = await getVideoSections(youtubeURL);
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
    } catch (error) {
        console.error("Error in worker:", error);
        parentPort.postMessage({ status: 'error', error: error.message });
    }
});
