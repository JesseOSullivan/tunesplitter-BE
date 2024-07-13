"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVideo = processVideo;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const utils_1 = require("./utils");
const config_1 = require("./config");
async function processVideo(videoUrl) {
    const tempAudioPath = path_1.default.join(__dirname, 'temp_audio.mp3');
    const outputDir = path_1.default.join(__dirname, 'sections');
    if (!fs_1.default.existsSync(outputDir)) {
        fs_1.default.mkdirSync(outputDir);
    }
    try {
        await (0, utils_1.downloadAudio)(videoUrl, tempAudioPath);
        console.log('Audio downloaded successfully.');
        const sections = await (0, utils_1.getVideoSections)(videoUrl);
        console.log(`Found ${sections.length} sections`);
        // Trim sections and upload to S3
        await Promise.all(sections.map(async ({ start_time, end_time, title }) => {
            const sanitizedTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const outputFilePath = path_1.default.join(outputDir, `${sanitizedTitle}.mp3`);
            const s3Key = `${sanitizedTitle}.mp3`;
            const duration = end_time - start_time;
            await (0, utils_1.trimAudio)(tempAudioPath, outputFilePath, start_time, duration);
            console.log(`Trimmed section: ${sanitizedTitle}`);
            if (!config_1.bucketName) {
                throw new Error('Bucket name is not defined.');
            }
            await (0, utils_1.uploadToS3)(outputFilePath, config_1.bucketName, s3Key);
            console.log(`Uploaded ${s3Key} to S3.`);
            // Clean up the trimmed section
            if (fs_1.default.existsSync(outputFilePath)) {
                fs_1.default.unlinkSync(outputFilePath);
            }
        }));
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
    }
    finally {
        // Clean up the downloaded full audio
        if (fs_1.default.existsSync(tempAudioPath)) {
            fs_1.default.unlinkSync(tempAudioPath);
        }
    }
}
