const youtubedl = require('youtube-dl-exec');
const logger = require('progress-estimator')();
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

async function downloadVideoInfo(youtubeURL) {
    // Convert the result to JSON and return it
    const promise = youtubedl(youtubeURL, { dumpSingleJson: true });
    const result = await logger(promise, `Obtaining ${youtubeURL}`);
    return result;
}

async function downloadVideo(youtubeURL, outputPath) {
    // Download the video
    await logger(youtubedl(youtubeURL, {
        output: outputPath,
        format: 'mp4' // Ensure the video is downloaded in MP4 format
    }), `Downloading ${youtubeURL}`);
    return outputPath;
}

async function convertMP4toMP3(mp4Path, mp3Path, ffmpegBasePath = 'C:\\ProgramData\\chocolatey\\bin') {
    return new Promise((resolve, reject) => {
        ffmpeg(mp4Path)
            .toFormat('mp3')
            .setFfmpegPath(path.join(ffmpegBasePath, 'ffmpeg.exe'))
            .setFfprobePath(path.join(ffmpegBasePath, 'ffprobe.exe'))
            .save(mp3Path)
            .on('end', () => {
                console.log(`Successfully converted ${mp4Path} to ${mp3Path}`);
                resolve();
            })
            .on('error', (err) => {
                console.error(`Error converting ${mp4Path} to ${mp3Path}:`, err);
                reject(err);
            });
    });
}

async function splitMP3(mp3Path, chapters, ffmpegBasePath = 'C:\\ProgramData\\chocolatey\\bin') {
    return new Promise((resolve, reject) => {
        const command = ffmpeg(mp3Path)
            .setFfmpegPath(path.join(ffmpegBasePath, 'ffmpeg.exe'))
            .setFfprobePath(path.join(ffmpegBasePath, 'ffprobe.exe'));

        for (let i = 0; i < chapters.length; i++) {
            const chapter = chapters[i];

            const sectionPath = path.join(path.dirname(mp3Path), `chapter_${i}.mp3`);

            // Skip if the chapter already exists
            if (fs.existsSync(sectionPath)) {
                console.log(`Chapter ${i} already exists. Skipping split.`);
                continue;
            }

            console.log(`Splitting chapter ${i} from ${mp3Path} to ${sectionPath}`);

            command.output(sectionPath)
                .setStartTime(chapter.start_time)
                .setDuration(chapter.end_time - chapter.start_time);
        }

        command.on('end', () => {
            console.log(`Successfully split ${mp3Path} into chapters`);
            resolve();
        })
            .on('error', (err) => {
                console.error(`Error splitting ${mp3Path} into chapters:`, err);
                reject(err);
            })
            .run();
    });
}

module.exports = { downloadVideoInfo, downloadVideo, convertMP4toMP3, splitMP3 };
