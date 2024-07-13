import youtubedl from 'youtube-dl-exec';
import { exec } from 'child_process';
import fs from 'fs';
import AWS from 'aws-sdk';
import axios from 'axios';
import { YOUTUBE_API_KEY, secretAccessKey, accessKeyId, region } from './config';

const s3 = new AWS.S3({ region, secretAccessKey, accessKeyId });


export async function downloadVideo(videoUrl: string, outputFilePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const startTimeDownload = Date.now();
        const process = youtubedl.exec(videoUrl, {
            format: 'bestvideo+bestaudio/best',
            output: outputFilePath,
            //make it lowest resolution

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
            const endTimeDownload = Date.now();
            const timeTakenDownload = (endTimeDownload - startTimeDownload) / 1000; // in seconds

            if (code === 0) {
                console.log(`Video downloaded successfully: ${outputFilePath} in ${timeTakenDownload} seconds`);
                resolve();
            } else {
                reject(new Error(`youtube-dl process exited with code ${code}`));
            }
        });

        process.on('error', (error) => {
            reject(error);
        });
    });
}
export async function trimAudio(inputFilePath: string, outputFilePath: string, startTime: number, duration: number): Promise<void> {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(outputFilePath)) {
            console.log(`Output file already exists: ${outputFilePath}. Skipping trim.`);
            resolve();
            return;
        }

        const command = `ffmpeg -i "${inputFilePath}" -ss ${startTime} -t ${duration} -acodec copy "${outputFilePath}"`;
        console.log(`Executing command: ${command}`);
        
        const startTimeTrim = Date.now();
        
        exec(command, { timeout: 300000 }, (error, stdout, stderr) => { // Increased timeout to 5 minutes
            const endTimeTrim = Date.now();
            const timeTaken = (endTimeTrim - startTimeTrim) / 1000; // in seconds
            
            if (error) {
                console.error(`Error trimming audio: ${stderr}`);
                reject(new Error(`Error trimming audio: ${stderr}`));
            } else {
                console.log(`Audio trimmed successfully in ${timeTaken} seconds: ${outputFilePath}`);
                resolve();
            }
        });
    });
}

export async function uploadToS3(filePath: string, s3Bucket: string, s3Key: string): Promise<AWS.S3.ManagedUpload.SendData> {
    const fileContent = fs.readFileSync(filePath);

    const params = {
        Bucket: s3Bucket,
        Key: s3Key,
        Body: fileContent,
    };

    return s3.upload(params).promise();
}

export function parseTimestamps(text: string): { start_time: number, end_time: number, title: string }[] {
    const timestampRegex = /(\d+:\d+:\d+).*?>(.*?)<br>/g;
    const sections: { start_time: number, end_time: number, title: string }[] = [];
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

export async function getVideoSections(videoUrl: string): Promise<{ start_time: number, end_time: number, title: string }[]> {
    try {
        console.log(`Fetching video info from ${videoUrl}`);
        const info = await youtubedl(videoUrl, { dumpSingleJson: true });
        console.log('Video info fetched successfully.');

        const chapters: { start_time: number, end_time: number, title: string }[] = info.chapters || [];
        if (chapters.length > 0) {
            console.log('Found chapters in video info.');
            return chapters.map((chapter, index) => ({
                start_time: chapter.start_time,
                end_time: chapter.end_time,
                title: chapter.title || `section_${index}`,
            }));
        } else {
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
                fs.writeFileSync('comments.txt', comments.join('\n\n'));

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
    } catch (error:any) {
        throw new Error(`Failed to fetch video sections: ${error.message}`);
    }
}

function extractVideoId(url: string): string {
    const urlObj = new URL(url);
    const videoId = urlObj.searchParams.get('v');
    console.log(`Extracted video ID: ${videoId}`);
    return videoId || '';
}

async function fetchComments(videoId: string): Promise<string[]> {
    let comments: string[] = [];
    let nextPageToken = '';
    const maxComments = 3000; // Increase max comments to fetch all
    let commentsFetched = 0;

    console.log(`Fetching comments for video ID: ${videoId}`);
    try {
        do {
            const response = await axios.get('https://www.googleapis.com/youtube/v3/commentThreads', {
                params: {
                    part: 'snippet',
                    videoId,
                    key: YOUTUBE_API_KEY,
                    maxResults: 1000,
                    pageToken: nextPageToken,
                    order: 'relevance',
                },
            });

            if (response.status !== 200) {
                throw new Error(`Unexpected response status: ${response.status}`);
            }

            const commentItems = response.data.items;
            commentItems.forEach((item: { snippet: { topLevelComment: { snippet: { textDisplay: any; }; }; }; }) => {
                const comment = item.snippet.topLevelComment.snippet.textDisplay;
                comments.push(comment);
                commentsFetched++;
                if (commentsFetched >= maxComments) return;
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
    } catch (error:any) {
        console.error(`Failed to fetch comments: ${error.message}`);
        console.error(error.response?.data || error.message);
        throw new Error(`Failed to fetch comments: ${error.message}`);
    }
}

export async function extractAudio(inputFilePath: string, outputFilePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const startTimeExtract = Date.now();
        const command = `ffmpeg -i "${inputFilePath}" -q:a 0 -map a "${outputFilePath}"`;
        console.log(`Executing command: ${command}`);
        
        exec(command, (error, stdout, stderr) => {
            const endTimeExtract = Date.now();
            const timeTakenExtract = (endTimeExtract - startTimeExtract) / 1000; // in seconds

            if (error) {
                console.error(`Error extracting audio: ${stderr}`);
                reject(new Error(`Error extracting audio: ${stderr}`));
            } else {
                console.log(`Audio extracted successfully: ${outputFilePath} in ${timeTakenExtract} seconds`);
                resolve();
            }
        });
    });
}
