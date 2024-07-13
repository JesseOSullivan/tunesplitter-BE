"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadAudio = downloadAudio;
exports.trimAudio = trimAudio;
exports.uploadToS3 = uploadToS3;
exports.parseTimestamps = parseTimestamps;
exports.getVideoSections = getVideoSections;
const youtube_dl_exec_1 = __importDefault(require("youtube-dl-exec"));
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const aws_sdk_1 = __importDefault(require("aws-sdk"));
const axios_1 = __importDefault(require("axios"));
const config_1 = require("./config");
const s3 = new aws_sdk_1.default.S3({ region: config_1.region, secretAccessKey: config_1.secretAccessKey, accessKeyId: config_1.accessKeyId });
async function downloadAudio(videoUrl, outputFilePath) {
    return new Promise((resolve, reject) => {
        const process = youtube_dl_exec_1.default.exec(videoUrl, {
            format: 'bestaudio',
            output: outputFilePath,
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: 0
        });
        if (process.stdout) {
            process.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);
            });
        }
        if (process.stderr) {
            process.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
            });
        }
        process.on('close', (code) => {
            if (code === 0) {
                console.log(`Audio downloaded successfully: ${outputFilePath}`);
                resolve();
            }
            else {
                reject(new Error(`youtube-dl process exited with code ${code}`));
            }
        });
        process.on('error', (error) => {
            reject(error);
        });
    });
}
async function trimAudio(inputFilePath, outputFilePath, startTime, duration) {
    return new Promise((resolve, reject) => {
        const command = `ffmpeg -i ${inputFilePath} -ss ${startTime} -t ${duration} -acodec copy ${outputFilePath}`;
        (0, child_process_1.exec)(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error trimming audio: ${stderr}`);
                reject(error);
            }
            else {
                console.log(`Audio trimmed successfully: ${outputFilePath}`);
                resolve();
            }
        });
    });
}
async function uploadToS3(filePath, s3Bucket, s3Key) {
    const fileContent = fs_1.default.readFileSync(filePath);
    const params = {
        Bucket: s3Bucket,
        Key: s3Key,
        Body: fileContent,
    };
    return s3.upload(params).promise();
}
function parseTimestamps(text) {
    const timestampRegex = /(\d+:\d+:\d+).*?>(.*?)<br>/g;
    const sections = [];
    let match;
    while ((match = timestampRegex.exec(text)) !== null) {
        const timeParts = match[1].split(':');
        const hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1], 10);
        const seconds = parseInt(timeParts[2], 10);
        const title = match[2].replace(/<[^>]*>/g, '').trim();
        const startTime = hours * 3600 + minutes * 60 + seconds;
        sections.push({ start_time: startTime, end_time: 0, title });
    }
    for (let i = 0; i < sections.length - 1; i++) {
        sections[i].end_time = sections[i + 1].start_time;
    }
    if (sections.length > 0) {
        sections[sections.length - 1].end_time = sections[sections.length - 1].start_time + 3600;
        console.log(`Parsed ${sections.length} sections from text.`);
    }
    return sections;
}
async function getVideoSections(videoUrl) {
    try {
        console.log(`Fetching video info from ${videoUrl}`);
        const info = await (0, youtube_dl_exec_1.default)(videoUrl, { dumpSingleJson: true });
        console.log('Video info fetched successfully.');
        const chapters = info.chapters || [];
        if (chapters.length > 0) {
            console.log('Found chapters in video info.');
            return chapters.map((chapter, index) => ({
                start_time: chapter.start_time,
                end_time: chapter.end_time,
                title: chapter.title || `section_${index}`,
            }));
        }
        else {
            console.log('No chapters found in video info.');
            const description = info.description || '';
            let sections = parseTimestamps(description);
            if (sections.length === 0) {
                console.log('No sections found in description. Fetching comments...');
                const videoId = extractVideoId(videoUrl);
                if (!videoId) {
                    throw new Error('Invalid video ID extracted from URL.');
                }
                const comments = await fetchComments(videoId);
                console.log('Comments fetched successfully.');
                // Write comments to a text file
                fs_1.default.writeFileSync('comments.txt', comments.join('\n\n'));
                // Find the first comment containing more than 3 <a> tags
                const firstLinkComment = comments.find(comment => (comment.match(/<a\s+href=/gi) || []).length > 3);
                if (firstLinkComment) {
                    console.log('First comment with more than 3 <a> tags:');
                    console.log(firstLinkComment);
                    sections = parseTimestamps(firstLinkComment);
                }
            }
            return sections;
        }
    }
    catch (error) {
        throw new Error(`Failed to fetch video sections: ${error.message}`);
    }
}
function extractVideoId(url) {
    const urlObj = new URL(url);
    const videoId = urlObj.searchParams.get('v');
    console.log(`Extracted video ID: ${videoId}`);
    return videoId || '';
}
async function fetchComments(videoId) {
    let comments = [];
    let nextPageToken = '';
    const maxComments = 3000; // Increase max comments to fetch all
    let commentsFetched = 0;
    console.log(`Fetching comments for video ID: ${videoId}`);
    try {
        do {
            const response = await axios_1.default.get('https://www.googleapis.com/youtube/v3/commentThreads', {
                params: {
                    part: 'snippet',
                    videoId,
                    key: config_1.YOUTUBE_API_KEY,
                    maxResults: 1000,
                    pageToken: nextPageToken,
                    order: 'relevance',
                },
            });
            if (response.status !== 200) {
                throw new Error(`Unexpected response status: ${response.status}`);
            }
            const commentItems = response.data.items;
            commentItems.forEach((item) => {
                const comment = item.snippet.topLevelComment.snippet.textDisplay;
                comments.push(comment);
                commentsFetched++;
                if (commentsFetched >= maxComments)
                    return;
            });
            nextPageToken = response.data.nextPageToken || '';
            console.log(`Fetched ${commentsFetched} comments so far...`);
        } while (nextPageToken && commentsFetched < maxComments);
        console.log('Finished fetching comments.');
        if (comments.length > 5) {
            console.log('Last 5 comments:');
            console.log(comments.slice(-5).join('\n'));
        }
        return comments;
    }
    catch (error) {
        console.error(`Failed to fetch comments: ${error.message}`);
        console.error(error.response?.data || error.message);
        throw new Error(`Failed to fetch comments: ${error.message}`);
    }
}
