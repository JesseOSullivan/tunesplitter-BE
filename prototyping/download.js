const youtubedl = require('youtube-dl-exec');
const logger = require('progress-estimator')();
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

const url = 'https://www.youtube.com/watch?v=xETEYG-az9E';

async function downloadVideo() {
    try {
        const promise = youtubedl(url, { dumpSingleJson: true });
        const result = await logger(promise, `Obtaining ${url}`);

        // Check if chapters are available
        if (!result.chapters || result.chapters.length === 0) {
            console.error('No chapters found in the video.');
            return;
        }

        // Output directory
        const outputDir = path.resolve(__dirname, 'processing', result.title);

        // Create output directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        //TODO: Use Youtube ID instead incase of weird characters
        const mp4Path = path.join(outputDir, `${result.title}.mp4`);
        const mp3Path = path.join(outputDir, `${result.title}.mp3`);

        // Download the video if it doesn't exist
        if (!fs.existsSync(mp4Path)) {
            console.log('Downloading video...');
            await logger(youtubedl(url, {
                output: mp4Path,
                format: 'mp4'  // Ensure the video is downloaded in MP4 format
            }), `Downloading ${result.title}`);
        } else {
            console.log('Video already downloaded.');
        }

        // Convert video to MP3
        if (!fs.existsSync(mp3Path)) {
            console.log('Converting video to MP3...');
            await new Promise((resolve, reject) => {
                ffmpeg(mp4Path)
                    .toFormat('mp3')
                    .save(mp3Path)
                    .on('end', resolve)
                    .on('error', reject);
            });
        } else {
            console.log('Video already converted to MP3.');
        }

        // Split MP3 by chapters
        for (const chapter of result.chapters) {
            const chapterFileName = path.join(outputDir, `${chapter.title}.mp3`);

            // Skip if the chapter file already exists
            if (fs.existsSync(chapterFileName)) {
                console.log(`Chapter ${chapter.title} already exists.`);
                continue;
            }

            await new Promise((resolve, reject) => {
                ffmpeg(mp3Path)
                    .setStartTime(chapter.start_time)
                    .setDuration(chapter.end_time - chapter.start_time)
                    .output(chapterFileName)
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });
        }

        console.log('Download and split completed.');
    } catch (error) {
        console.error('Error:', error);
    }
}

downloadVideo();

// Wait 5 minutes before exiting for debugging purposes
setTimeout(() => { }, 300000);
